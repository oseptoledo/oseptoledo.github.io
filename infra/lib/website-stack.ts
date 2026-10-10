/**
 * OsepWebsiteStack: everything that serves https://www.oseptoledo.org and its
 * contact form, in one stack in us-east-1 (CloudFront certificates and the SES
 * identity both live there).
 *
 *   SiteBucket          private, versioned S3 bucket holding dist/ (deployed by GitHub Actions)
 *   LogsBucket          CloudFront access logs and the site bucket's S3 access logs, 30 days
 *   SiteCertificate     ACM, www + apex, DNS-validated
 *   Waf                 AWS managed rules + an IPv6 block + a per-IP limit on /api/contact + a site-wide per-IP limit
 *   SecurityHeaders     CSP (no inline anything), HSTS preload, nosniff, DENY framing, Permissions-Policy
 *   CanonicalHost       CloudFront Function: one 301 to https://www + lowercase + no trailing slash
 *   Distribution        S3 via OAC (default) and the contact Lambda via OAC (/api/*), real 404s
 *   ContactForm*        Lambda (Node 24, arm64) behind a function URL that only CloudFront can call
 *   EmailIdentity       SES domain identity for the apex with Easy DKIM
 *   GithubDeploy*       OIDC provider + the role the deploy workflow assumes, main branch only
 *   AlarmTopic, Alarm*  SNS topic and eight CloudWatch alarms
 *
 * Read infra/CLAUDE.md for what is deliberately NOT here, and infra/README.md
 * for the launch runbook. The comments below explain each non-obvious choice
 * where it is made.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Annotations, ArnFormat, CfnOutput, Duration, Fn, RemovalPolicy, Stack, Validations, type StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import type { Construct } from 'constructs';
import { primaryLabel, readConfig, type OsepConfig } from './config';
import { OsepDnsStack } from './dns-stack';

// ── Contract constants (tests assert these, and other files depend on them) ──

/** Where the site's contact form POSTs (same origin). CloudFront routes /api/* to the Lambda. */
export const CONTACT_ENDPOINT_PATH = '/api/contact';

/**
 * The Content-Security-Policy, exactly. Everything is same-origin: the font is
 * self-hosted, the JSON-LD block is data (CSP never evaluates it), and the
 * contact form posts to /api/contact on this origin, so connect-src 'self'
 * covers it. There is no 'unsafe-inline' anywhere, which means the built HTML
 * must carry no style="" attributes and no inline executable <script>. Adding
 * analytics or any third-party embed means editing this string and deploying
 * the stack in step with the site (see infra/CLAUDE.md).
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

/** Browser features this site never uses, switched off for every frame. */
export const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=(), usb=()';

/**
 * HSTS: two years, subdomains included, preload. functions/canonical-host.js
 * repeats the same header on its 301s (test/canonical-host.test.ts holds the
 * two together). On the Route 53 path the apex's 301 carries it, so from the
 * first deploy, any browser that has loaded https://oseptoledo.org refuses
 * plain HTTP and certificate errors on every *.oseptoledo.org name for two
 * years, with no click-through. That holds whether or not the domain is ever
 * submitted to hstspreload.org: every name a browser may open must work over
 * HTTPS before this stack is first deployed (infra/README.md step 5a.2).
 */
export const HSTS_MAX_AGE = Duration.days(730);

export const CANONICAL_HOST_PLACEHOLDER = '__CANONICAL_HOST__';
export const CANONICAL_HOST_FUNCTION_FILE = path.join(__dirname, '..', 'functions', 'canonical-host.js');
/** The Lambda agent's source directory, deployed as-is (no bundling; the runtime ships the AWS SDK). */
export const CONTACT_LAMBDA_DIR = path.join(__dirname, '..', 'lambda', 'contact-form');

export const CONTACT_FUNCTION_NAME = 'osep-website-contact-form';
export const DEPLOY_ROLE_NAME = 'GitHubActions-OsepWebsite-Deploy';
export const ALARM_TOPIC_NAME = 'osep-website-alarms';
export const GITHUB_OIDC_URL = 'https://token.actions.githubusercontent.com';

/**
 * The `outcome` values lambda/contact-form/contact.mjs logs when it answers
 * 500. A handled failure is not a Lambda "Error" (the function returned
 * normally), so the ContactServerErrors alarm counts these log lines instead.
 * test/website-stack.test.ts reads contact.mjs and fails if this list drifts.
 */
export const CONTACT_SERVER_ERROR_OUTCOMES = ['misconfigured', 'send_failed', 'error'] as const;

/**
 * More contact-form messages sent than this in one hour sets off the
 * osep-website-contact-volume alarm. A neighborhood site gets a few a day; one
 * IP address pacing itself just under the WAF's per-IP limit (contactRateLimit
 * per 5 minutes) can send 120 an hour into the inbox and, while the account is
 * in the SES sandbox, use up its 200-a-day quota, after which every real
 * message fails. A starting point like the 4xx threshold: revisit it with real
 * traffic.
 */
export const CONTACT_VOLUME_ALARM_PER_HOUR = 20;

/**
 * Every IPv6 address, as the two halves WAF accepts (an IP set refuses ::/0).
 * The WAF's BlockIpv6 rule refuses any request from them, which is what makes
 * the site IPv4 only; the comment on that rule says why CloudFront's own IPv6
 * switch is not enough.
 */
export const ALL_IPV6_ADDRESSES = ['::/1', '8000::/1'] as const;

/**
 * CloudFormation's RetainExceptOnCreate for both buckets (lib/dns-stack.ts
 * does the same for the hosted zone): kept when the stack is deleted or the
 * bucket is replaced, but removed when the stack's very first create fails
 * and rolls back. A failed first deploy therefore leaves no orphaned, empty
 * bucket behind (infra/README.md step 6, "If the first deploy of a stack
 * fails").
 */
export const KEEP_EXCEPT_ON_FAILED_CREATE = RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE;

/** CloudFront Functions reject code over 10 KB. */
const CLOUDFRONT_FUNCTION_MAX_BYTES = 10 * 1024;

/**
 * The canonical-host function's source with the placeholder replaced. Throws if
 * the file does not contain the placeholder exactly once (so a refactor cannot
 * silently ship a function that redirects to "__CANONICAL_HOST__"), or if the
 * result is over CloudFront's size limit.
 */
export function canonicalHostFunctionCode(canonicalHost: string): string {
  const source = fs.readFileSync(CANONICAL_HOST_FUNCTION_FILE, 'utf8');
  const occurrences = source.split(CANONICAL_HOST_PLACEHOLDER).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `${CANONICAL_HOST_FUNCTION_FILE} must contain ${CANONICAL_HOST_PLACEHOLDER} exactly once (found ${occurrences}).`,
    );
  }
  const code = source.replace(CANONICAL_HOST_PLACEHOLDER, canonicalHost);
  const bytes = Buffer.byteLength(code, 'utf8');
  if (bytes > CLOUDFRONT_FUNCTION_MAX_BYTES) {
    throw new Error(`canonical-host.js is ${bytes} bytes; CloudFront Functions allow ${CLOUDFRONT_FUNCTION_MAX_BYTES}.`);
  }
  return code;
}

export interface OsepWebsiteStackProps extends StackProps {
  readonly config: OsepConfig;
  /** The zone from OsepDnsStack. Required when config.dnsProvider is 'route53', absent otherwise. */
  readonly hostedZone?: route53.IPublicHostedZone;
}

export class OsepWebsiteStack extends Stack {
  public readonly siteBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly contactFunction: lambda.Function;
  public readonly deployRole: iam.Role;
  public readonly alarmTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: OsepWebsiteStackProps) {
    super(scope, id, props);
    const { config, hostedZone } = props;
    const { primaryDomain, apexDomain } = config;

    if (config.dnsProvider === 'route53' && !hostedZone) {
      throw new Error('OsepWebsiteStack: dnsProvider is route53 but no hostedZone was passed.');
    }
    if (config.dnsProvider === 'external' && hostedZone) {
      throw new Error('OsepWebsiteStack: dnsProvider is external, so no hostedZone may be passed.');
    }
    const zone = config.dnsProvider === 'route53' ? hostedZone : undefined;

    // ── Buckets ────────────────────────────────────────────────────────────
    // Logs first: the site bucket writes its S3 access logs here too, which is
    // the record of who changed site content and when.
    const logsBucket = new s3.Bucket(this, 'LogsBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      // CloudFront's standard (legacy) log delivery writes with an ACL grant,
      // so this bucket needs ACLs enabled: BucketOwnerPreferred, not Enforced.
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      removalPolicy: KEEP_EXCEPT_ON_FAILED_CREATE,
      lifecycleRules: [{ id: 'expire-logs-30d', enabled: true, expiration: Duration.days(30) }],
    });
    // No access logging on this bucket itself (it would log its own log
    // deliveries). cdk-nag's AwsSolutions-S1 accepts that for a bucket that is
    // another bucket's access-log destination, which this one is.

    // Bucket names are left to CloudFormation (globally unique, no squatting
    // risk); the SiteBucketName output feeds the deploy workflow's variable.
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      versioned: true,
      removalPolicy: KEEP_EXCEPT_ON_FAILED_CREATE,
      serverAccessLogsBucket: logsBucket,
      serverAccessLogsPrefix: 's3-access/site/',
      lifecycleRules: [
        {
          // Versioning is the rollback path for a bad deploy (README); 30 days
          // of old versions is plenty and keeps the bucket from growing forever.
          id: 'expire-noncurrent-30d',
          enabled: true,
          noncurrentVersionExpiration: Duration.days(30),
          abortIncompleteMultipartUploadAfter: Duration.days(7),
        },
      ],
    });
    this.siteBucket = siteBucket;

    // ── Certificate ───────────────────────────────────────────────────────
    // With Route 53 the validation CNAMEs are written into the zone and the
    // deploy waits for issuance on its own. With external DNS the deploy
    // PAUSES at this resource until a human adds the CNAMEs at GoDaddy
    // (infra/README.md step 5b); they must then stay there for renewal.
    const certificate = new acm.Certificate(this, 'SiteCertificate', {
      domainName: primaryDomain,
      subjectAlternativeNames: [apexDomain],
      validation: zone ? acm.CertificateValidation.fromDns(zone) : acm.CertificateValidation.fromDns(),
    });

    // ── WAF ────────────────────────────────────────────────────────────────
    const rule = (name: string, priority: number, statement: wafv2.CfnWebACL.StatementProperty) => ({
      name,
      priority,
      statement,
      visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: name, sampledRequestsEnabled: true },
    });
    const managed = (
      name: string,
      priority: number,
      ruleActionOverrides?: wafv2.CfnWebACL.RuleActionOverrideProperty[],
    ): wafv2.CfnWebACL.RuleProperty => ({
      ...rule(name, priority, {
        managedRuleGroupStatement: { vendorName: 'AWS', name, ...(ruleActionOverrides ? { ruleActionOverrides } : {}) },
      }),
      overrideAction: { none: {} },
    });
    // All of IPv6, for the BlockIpv6 rule below.
    const ipv6Addresses = new wafv2.CfnIPSet(this, 'WafIpv6Addresses', {
      name: 'osep-website-all-ipv6',
      // WAF's description pattern allows no parentheses or semicolons.
      description: 'Every IPv6 address, as the halves ::/1 and 8000::/1 since WAF refuses ::/0. Refused by the BlockIpv6 rule.',
      scope: 'CLOUDFRONT',
      ipAddressVersion: 'IPV6',
      addresses: [...ALL_IPV6_ADDRESSES],
    });
    const webAcl = new wafv2.CfnWebACL(this, 'Waf', {
      name: 'osep-website-waf',
      description: 'OSEP website: AWS managed rules, IPv6 block, contact-form rate limit, site-wide per-IP rate limit',
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: 'osep-website-waf', sampledRequestsEnabled: true },
      rules: [
        // SizeRestrictions_BODY counts instead of blocking. It blocks any body
        // over 8 KB with WAF's plain 403, which would hide the contact
        // endpoint's own answer for the same case (413 too_large, at the same
        // 8,192-byte cap: MAX_BODY_BYTES in lambda/contact-form/contact.mjs)
        // and make an oversize message look exactly like an Origin rejection
        // or a rate-limit block. Nothing else here accepts a body: the default
        // behavior allows only GET and HEAD, and every /api/* request goes to
        // the Lambda, which refuses an oversize body before parsing it.
        managed('AWSManagedRulesCommonRuleSet', 0, [{ name: 'SizeRestrictions_BODY', actionToUse: { count: {} } }]),
        managed('AWSManagedRulesKnownBadInputsRuleSet', 1),
        managed('AWSManagedRulesAmazonIpReputationList', 2),
        {
          // The site is IPv4 only, and this rule is what makes it so. The
          // per-IP limits below bound one host only if one host is one
          // address. WAF counts every IPv6 address on its own and cannot group
          // them by prefix, and one host with a routed /64 (a common VPS
          // default) holds more addresses than any limit can count: it could
          // send each POST /api/contact from a new one, never reach
          // ContactFormRateLimit, and spend the SES daily quota at SES's own
          // send rate. enableIpv6: false on the distribution is not enough on
          // its own: it only stops CloudFront publishing AAAA records. Every
          // CloudFront edge still accepts IPv6 connections for every
          // distribution and picks the distribution by TLS server name and
          // Host header, so anyone who connects to an edge's IPv6 address
          // directly (curl --resolve) reaches this site over IPv6 anyway. No
          // real visitor arrives that way, because no AAAA record points here
          // (visitors on IPv6-only networks come through their carrier's
          // NAT64, over IPv4), so every request from an IPv6 address is
          // refused, site-wide, before the rate limits count it.
          // infra/README.md step 10 checks this on the live stack.
          ...rule('BlockIpv6', 9, { ipSetReferenceStatement: { arn: ipv6Addresses.attrArn } }),
          action: { block: {} },
        },
        {
          // The contact form is the one thing on this site that costs money and
          // lands in a person's inbox per request. A person sends one or two
          // messages; contactRateLimit (default 10) per IP per 5 minutes leaves
          // room for typos and retries and stops a burst. It counts each source
          // address separately, so it does not cap the total: a script pacing
          // itself under it still sends 120 an hour per address. No WAF rule
          // can hold that to the SES sandbox's 200 a day (WAF's tightest
          // setting still allows ~1,400 a day per IP), and a site-wide cap
          // would let one sender block the form for everyone. So the account
          // leaves the sandbox before the form goes on (infra/README.md step
          // 8), and the contact-volume alarm below says when someone is
          // flooding it. A per-IP limit bounds one host only because the site
          // is IPv4 only (BlockIpv6 above refuses every IPv6 address): WAF
          // counts every IPv6 address on its own, and one host with a routed
          // /64 has more of them than any limit can count.
          //
          // The scope-down match sees the path exactly as the client sent it:
          // CloudFront normalizes the path only to choose a behavior, then
          // forwards the raw one. So it is URL-decoded (/api/%63ontact),
          // stripped of doubled slashes and dot segments (/api//contact,
          // /api/x/../contact) and lowercased (/API/Contact) before matching,
          // and no spelling that reaches the Lambda as /api/contact can dodge
          // the limit. (The Lambda also serves only the exact raw path
          // /api/contact; infra/README.md step 10 checks that on the live
          // stack.)
          ...rule('ContactFormRateLimit', 10, {
            rateBasedStatement: {
              limit: config.contactRateLimit,
              evaluationWindowSec: 300,
              aggregateKeyType: 'IP',
              scopeDownStatement: {
                byteMatchStatement: {
                  fieldToMatch: { uriPath: {} },
                  positionalConstraint: 'STARTS_WITH',
                  searchString: CONTACT_ENDPOINT_PATH,
                  textTransformations: [
                    { priority: 0, type: 'URL_DECODE' },
                    { priority: 1, type: 'NORMALIZE_PATH' },
                    { priority: 2, type: 'LOWERCASE' },
                  ],
                },
              },
            },
          }),
          action: { block: {} },
        },
        {
          ...rule('RateLimitPerIp', 100, {
            rateBasedStatement: { limit: config.wafRateLimit, evaluationWindowSec: 300, aggregateKeyType: 'IP' },
          }),
          action: { block: {} },
        },
      ],
    });

    // ── Response headers ───────────────────────────────────────────────────
    // No X-XSS-Protection: modern browsers ignore it and the old auditor it
    // switched on could be abused; the CSP above is the real protection.
    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeadersPolicy', {
      responseHeadersPolicyName: 'osep-website-security-headers',
      comment: 'OSEP website: strict same-origin CSP, HSTS preload, security headers',
      securityHeadersBehavior: {
        contentSecurityPolicy: { contentSecurityPolicy: CONTENT_SECURITY_POLICY, override: true },
        strictTransportSecurity: {
          accessControlMaxAge: HSTS_MAX_AGE,
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
      },
      customHeadersBehavior: {
        customHeaders: [{ header: 'Permissions-Policy', value: PERMISSIONS_POLICY, override: true }],
      },
    });

    // ── Canonical-host function ──────────────────────────────────────────────
    // The rules and their reasons are in functions/canonical-host.js. It runs
    // on the default behavior only: on /api/* a 301 would turn the form's POST
    // into a GET, and the API has no pretty URLs to canonicalize.
    const canonicalHost = new cloudfront.Function(this, 'CanonicalHostFunction', {
      functionName: `${this.stackName}-canonical-host`,
      comment: `301 every other host, uppercase or trailing-slash document path to https://${primaryDomain}`,
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(canonicalHostFunctionCode(primaryDomain)),
    });

    // ── Contact form Lambda ──────────────────────────────────────────────────
    // An explicit role and log group instead of the defaults: the default role
    // carries the AWSLambdaBasicExecutionRole managed policy (logs on every log
    // group in the account); this one may write to its own log group and send
    // one kind of email, nothing else. No reserved concurrency: new accounts
    // often have a 10-execution account limit, and reserving any of it fails
    // the deploy. Abuse is handled elsewhere: the WAF's per-IP limit above
    // stops bursts from one IPv4 address (its BlockIpv6 rule refuses IPv6),
    // the contact-volume alarm below flags a slow flood, and SES production
    // access (README step 8) keeps one address's 120 an hour far below the
    // daily sending quota. Many addresses at once (a botnet, a proxy pool)
    // are out of scope. The Throttles alarm only covers concurrency.
    const contactLogGroup = new logs.LogGroup(this, 'ContactFormLogGroup', {
      logGroupName: `/aws/lambda/${CONTACT_FUNCTION_NAME}`,
      // One JSON line per request, request id and outcome only (no personal
      // data), so keeping three months for "my message never arrived" questions
      // is cheap and harmless.
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const contactRole = new iam.Role(this, 'ContactFormRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: `Runs ${CONTACT_FUNCTION_NAME}: write its own logs, send contact-form mail as ${config.contactFromAddress}.`,
    });
    contactLogGroup.grantWrite(contactRole);

    const emailIdentity = new ses.EmailIdentity(this, 'EmailIdentity', {
      identity: zone ? ses.Identity.publicHostedZone(zone) : ses.Identity.domain(apexDomain),
      dkimSigning: true,
      dkimIdentity: ses.DkimIdentity.easyDkim(ses.EasyDkimSigningKeyLength.RSA_2048_BIT),
    });

    // SES checks ses:SendEmail against the sender's identity and, while the
    // account is in the SES sandbox, against the recipient's identity as well.
    // The default inbox is on the same domain, so the domain identity covers
    // both; an inbox elsewhere has to be verified on its own and is listed too.
    const sesResources = [emailIdentity.emailIdentityArn];
    if (!config.contactToAddress.toLowerCase().endsWith(`@${apexDomain}`)) {
      sesResources.push(this.formatArn({ service: 'ses', resource: 'identity', resourceName: config.contactToAddress }));
    }
    contactRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SendContactFormMailOnly',
        actions: ['ses:SendEmail'],
        resources: sesResources,
        conditions: {
          // Only as the configured From address, and only to the configured inbox,
          // so even a compromised function cannot become a spam relay.
          StringEquals: { 'ses:FromAddress': config.contactFromAddress },
          'ForAllValues:StringEquals': { 'ses:Recipients': [config.contactToAddress] },
        },
      }),
    );

    const contactFunction = new lambda.Function(this, 'ContactFormFunction', {
      functionName: CONTACT_FUNCTION_NAME,
      description: 'POST /api/contact: validates the OSEP contact form and emails it through SES',
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(CONTACT_LAMBDA_DIR),
      memorySize: 256,
      timeout: Duration.seconds(10),
      role: contactRole,
      logGroup: contactLogGroup,
      environment: {
        TO_ADDRESS: config.contactToAddress,
        FROM_ADDRESS: config.contactFromAddress,
        // Pages are only ever served from the canonical host (everything else
        // 301s there first), so that is the only Origin a real form post has.
        ALLOWED_ORIGINS: `https://${primaryDomain}`,
      },
    });
    this.contactFunction = contactFunction;

    // AWS_IAM: the URL refuses anything not SigV4-signed by an allowed principal,
    // so the only way in is through CloudFront's OAC below. In CDK 2.273.0,
    // FunctionUrlOrigin.withOriginAccessControl grants cloudfront.amazonaws.com
    // BOTH lambda:InvokeFunctionUrl and lambda:InvokeFunction (the latter with
    // lambda:InvokedViaFunctionUrl), each scoped to this distribution's ARN.
    // Lambda has required both for new function URLs since October 2025; older
    // CDK granted only the first (aws-cdk issue #35872). The stack test asserts
    // both, so a CDK change that drops one fails CI rather than the form.
    const contactUrl = contactFunction.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.AWS_IAM });

    // ── Distribution ───────────────────────────────────────────────────────
    // OAC gets LIST as well as READ. Without s3:ListBucket, S3 answers a GET for
    // a missing key with 403 (it will not say whether the key exists), and the
    // only way to show a 404 page would be to map 403 too, which would also
    // disguise WAF blocks. With LIST a missing key is an honest 404.
    // The bucket policy this writes is conditioned on AWS:SourceArn = this
    // distribution, so no other CloudFront distribution (in any account) can
    // use OAC to read the bucket. LIST makes CDK warn about bucket listings;
    // defaultRootObject below means a request for / gets index.html, never a
    // listing, which is the mitigation the warning asks for.
    const siteOrigin = origins.S3BucketOrigin.withOriginAccessControl(siteBucket, {
      originAccessLevels: [cloudfront.AccessLevel.READ, cloudfront.AccessLevel.LIST],
    });
    const contactOrigin = origins.FunctionUrlOrigin.withOriginAccessControl(contactUrl);

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `OSEP website - ${primaryDomain}`,
      certificate,
      domainNames: [primaryDomain, apexDomain],
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      sslSupportMethod: cloudfront.SSLMethod.SNI,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      // No AAAA records. This only changes DNS: CloudFront stops answering
      // AAAA queries for the distribution's own hostname, and the zone below
      // publishes none, so no visitor's browser connects over IPv6. It does
      // NOT stop IPv6 traffic: every CloudFront edge still accepts IPv6
      // connections for every distribution. The WAF's BlockIpv6 rule is what
      // refuses those, and keeps the per-IP limits bounding one host (see that
      // rule). Visitors on IPv6-only mobile networks still arrive, through
      // their carrier's NAT64, over IPv4, as they reach any IPv4-only site.
      // infra/CLAUDE.md records the choice.
      enableIpv6: false,
      defaultRootObject: 'index.html',
      webAclId: webAcl.attrArn,
      enableLogging: true,
      logBucket: logsBucket,
      logFilePrefix: 'cloudfront/',
      logIncludesCookies: false,
      defaultBehavior: {
        origin: siteOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        responseHeadersPolicy: securityHeaders,
        functionAssociations: [{ function: canonicalHost, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        // The contact form. Never cached; every viewer header but Host is
        // forwarded (Host must be the function URL's own name for the SigV4
        // signature OAC adds, and the browser's x-amz-content-sha256 body hash
        // must arrive intact, because Lambda will not accept an unsigned
        // payload). HTTPS only: no redirect dance for a POST.
        '/api/*': {
          origin: contactOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: securityHeaders,
          // Replies are a few bytes of JSON, and CloudFront only compresses
          // what a cache policy lets it cache; say so rather than imply otherwise.
          compress: false,
        },
      },
      errorResponses: [
        // Exactly one mapping: a real 404 with the prerendered, noindex
        // /404.html. There is no single-page-app fallback that turns every
        // unknown URL into a 200 homepage: those are "soft 404s" that search
        // engines index and that hide broken links from the 4xx alarm.
        //   403 is deliberately unmapped: with OAC LIST, the only 403s left are
        //   WAF blocks and signing failures, and dressing those up as "page not
        //   found" would hide a block behind a content error.
        //   ttl 0: a 404 seen mid-deploy (key not uploaded yet) must not stay
        //   cached at the edge after the key lands.
        // Error mappings are distribution-wide, /api/* included, which is why
        // the contact Lambda never answers 404 (it would become HTML).
        { httpStatus: 404, responseHttpStatus: 404, responsePagePath: '/404.html', ttl: Duration.seconds(0) },
      ],
    });
    this.distribution = distribution;
    Annotations.of(distribution).acknowledgeWarning(
      '@aws-cdk/aws-cloudfront-origins:listBucketSecurityRisk',
      'Mitigated: defaultRootObject is index.html, so / is never answered with a bucket listing.',
    );
    Validations.of(distribution).acknowledge({
      id: 'AwsSolutions-CFR1',
      reason: 'A public, community website for Toledo residents and supporters: no geographic restriction is wanted.',
    });

    // ── DNS records for the site (Route 53 only) ─────────────────────────────
    // A records only: the site is IPv4 only (enableIpv6 and the WAF's
    // BlockIpv6 rule above), so an AAAA alias would send browsers to
    // addresses that refuse every request.
    if (zone) {
      const alias = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));
      const names: [string, string | undefined][] = [
        ['Apex', undefined],
        ['Primary', primaryLabel(config)],
      ];
      for (const [label, recordName] of names) {
        new route53.ARecord(this, `${label}AliasA`, { zone, recordName, target: alias });
      }
    }

    // ── GitHub OIDC deploy role ──────────────────────────────────────────────
    // The deploy workflow trades a short-lived GitHub token for this role; no
    // AWS keys are stored anywhere. The provider is the native CloudFormation
    // resource (no custom-resource Lambda); IAM no longer needs thumbprints for
    // GitHub's issuer.
    const githubOidc = new iam.OidcProviderNative(this, 'GithubOidcProvider', {
      url: GITHUB_OIDC_URL,
      clientIds: ['sts.amazonaws.com'],
    });
    const githubFederated = (conditions?: iam.Conditions) =>
      new iam.FederatedPrincipal(githubOidc.oidcProviderArn, conditions ?? {}, 'sts:AssumeRoleWithWebIdentity');

    const deployRole = new iam.Role(this, 'GithubDeployRole', {
      roleName: DEPLOY_ROLE_NAME,
      description: `GitHub Actions deploy for ${config.githubRepo} (main only): sync the site bucket, invalidate the distribution.`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: githubFederated({
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${config.githubRepo}:ref:refs/heads/main`,
        },
      }),
    });
    if (config.githubRepoIsPlaceholder) {
      // 'OWNER/REPO' is a name anyone could register on GitHub. Until the real
      // repo is configured, an explicit Deny in the trust policy outranks the
      // Allow above, so no GitHub token at all can assume the role.
      deployRole.assumeRolePolicy?.addStatements(
        new iam.PolicyStatement({
          sid: 'DenyUntilGithubRepoIsConfigured',
          effect: iam.Effect.DENY,
          principals: [githubFederated()],
          actions: ['sts:AssumeRoleWithWebIdentity'],
        }),
      );
      Annotations.of(this).addWarningV2(
        'osep:githubRepoPlaceholder',
        `githubRepo is the placeholder "${config.githubRepo}": the deploy role ${DEPLOY_ROLE_NAME} denies every ` +
          'GitHub token until this stack is deployed with -c githubRepo=<owner>/<repo> (exact case as on GitHub).',
      );
    }
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SiteBucketList',
        actions: ['s3:ListBucket', 's3:GetBucketLocation'],
        resources: [siteBucket.bucketArn],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SiteBucketObjects',
        actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
        resources: [siteBucket.arnForObjects('*')],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'DistributionInvalidation',
        actions: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
        resources: [distribution.distributionArn],
      }),
    );
    // cdk-nag reads the finding id with the bucket's logical id inside it;
    // computing it keeps the acknowledgment attached if the bucket ever moves.
    const siteBucketLogicalId = this.getLogicalId(siteBucket.node.defaultChild as s3.CfnBucket);
    Validations.of(deployRole).acknowledge({
      id: `AwsSolutions-IAM5[Resource::<${siteBucketLogicalId}.Arn>/*]`,
      reason:
        'A deploy syncs the whole built site, so it writes, reads and deletes any key in the site bucket ' +
        '(object-level wildcard on that one bucket only); no other bucket and no bucket-level action is granted.',
    });
    this.deployRole = deployRole;

    // ── Alarms ──────────────────────────────────────────────────────────────
    // The topic has no subscription here on purpose. An email subscription
    // created by CloudFormation is confirmed by whoever clicks the link first,
    // and mail security scanners click every link, so the scanner confirms it
    // and can later "click" the unsubscribe link in an alarm email too. The
    // README subscribes by CLI and confirms with --authenticate-on-unsubscribe,
    // after which only an authenticated AWS caller can unsubscribe. CDK cannot
    // pass that flag, so the subscription stays out of the template.
    const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: ALARM_TOPIC_NAME,
      displayName: 'OSEP website alarms',
      enforceSSL: true,
    });
    // enforceSSL gives the topic an explicit access policy, which replaces
    // SNS's default one; CloudWatch needs its own grant to publish alarms here.
    alarmTopic.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'CloudWatchAlarmsPublish',
        principals: [new iam.ServicePrincipal('cloudwatch.amazonaws.com')],
        actions: ['sns:Publish'],
        resources: [alarmTopic.topicArn],
        conditions: {
          StringEquals: { 'aws:SourceAccount': this.account },
          ArnLike: {
            'aws:SourceArn': this.formatArn({
              service: 'cloudwatch',
              resource: 'alarm',
              resourceName: 'osep-website-*',
              arnFormat: ArnFormat.COLON_RESOURCE_NAME,
            }),
          },
        },
      }),
    );
    // Not KMS-encrypted, deliberately: alarm notifications carry no personal or
    // secret data, CloudWatch cannot publish to a topic encrypted with the
    // AWS-managed SNS key, and a customer-managed key would add a monthly charge
    // and a key policy to maintain for no confidentiality gain. enforceSSL
    // covers transport (cdk-nag AwsSolutions-SNS3).
    this.alarmTopic = alarmTopic;
    const notify = new cwActions.SnsAction(alarmTopic);

    // CloudFront publishes its metrics in us-east-1 with Region=Global.
    const cloudFrontMetric = (metricName: string, statistic: string) =>
      new cloudwatch.Metric({
        namespace: 'AWS/CloudFront',
        metricName,
        dimensionsMap: { DistributionId: distribution.distributionId, Region: 'Global' },
        statistic,
        period: Duration.minutes(5),
      });

    new cloudwatch.Alarm(this, 'Alarm5xxRate', {
      alarmName: 'osep-website-5xx-rate',
      alarmDescription: 'CloudFront 5xx error rate above 1% over 5 minutes. See infra/README.md, Day to day.',
      metric: cloudFrontMetric('5xxErrorRate', 'Average'),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(notify);

    // 4xxErrorRate is a ratio, and real 404s mean scanners produce some all day.
    // In a quiet 5 minutes with 3 requests, one probe for /wp-login.php is a
    // 33% "error rate". The IF() scores any period with fewer than 50 requests
    // as 0, so only periods busy enough for the ratio to mean something can
    // breach, and three in a row must. 20% is a starting point, not a measured
    // baseline: revisit it after a few weeks of real traffic, with a reason.
    new cloudwatch.Alarm(this, 'Alarm4xxRate', {
      alarmName: 'osep-website-4xx-rate',
      alarmDescription:
        'CloudFront 4xx error rate above 20% in 3 consecutive 5-minute periods that each carried at least 50 requests. ' +
        'See infra/README.md, Day to day.',
      metric: new cloudwatch.MathExpression({
        expression: 'IF(requests >= 50, rate4xx, 0)',
        usingMetrics: {
          requests: cloudFrontMetric('Requests', 'Sum'),
          rate4xx: cloudFrontMetric('4xxErrorRate', 'Average'),
        },
        period: Duration.minutes(5),
        label: '4xx rate, gated to periods with at least 50 requests',
      }),
      threshold: 20,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(notify);

    const anyInFiveMinutes = (id: string, alarmName: string, alarmDescription: string, metric: cloudwatch.IMetric) =>
      new cloudwatch.Alarm(this, id, {
        alarmName,
        alarmDescription,
        metric,
        threshold: 0,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(notify);

    anyInFiveMinutes(
      'AlarmContactErrors',
      'osep-website-contact-errors',
      'The contact-form Lambda crashed or timed out (Errors > 0 in 5 minutes). See infra/README.md, Day to day.',
      contactFunction.metricErrors({ period: Duration.minutes(5), statistic: 'Sum' }),
    );
    anyInFiveMinutes(
      'AlarmContactThrottles',
      'osep-website-contact-throttles',
      'The contact-form Lambda was throttled (Throttles > 0 in 5 minutes): visitors saw an error. See infra/README.md, Day to day.',
      contactFunction.metricThrottles({ period: Duration.minutes(5), statistic: 'Sum' }),
    );

    // Beyond the two Lambda metrics: when SES refuses a send, the function
    // catches it and answers 500, which is not a Lambda "Error". Count those
    // from the function's own log line ({"requestId","outcome"}) instead.
    const serverErrorFilter = new logs.MetricFilter(this, 'ContactServerErrorsFilter', {
      logGroup: contactLogGroup,
      filterPattern: logs.FilterPattern.any(
        ...CONTACT_SERVER_ERROR_OUTCOMES.map((outcome) => logs.FilterPattern.stringValue('$.outcome', '=', outcome)),
      ),
      metricNamespace: 'OSEP/Website',
      metricName: 'ContactFormServerErrors',
      metricValue: '1',
    });
    anyInFiveMinutes(
      'AlarmContactServerErrors',
      'osep-website-contact-server-errors',
      'The contact form answered 500 (SES refused the send, or the function is misconfigured): a message was not ' +
        'delivered. See infra/README.md, Day to day.',
      serverErrorFilter.metric({ period: Duration.minutes(5), statistic: 'Sum' }),
    );

    // A 200 "sent" only means SES accepted the message. SES then drops, without
    // an error, every message to an address on the account's suppression list
    // (on by default for bounces and complaints, and an address stays listed
    // until someone removes it), counting each as a Bounce. So one hard bounce
    // of the inbox (a mailbox move, a lapsed mail plan) would silently lose
    // every later message while visitors see "sent" and the alarms above stay
    // quiet. SES publishes these account-level metrics (no dimensions) for
    // free. The names must start with osep-website-: the topic policy above
    // lets CloudWatch publish only for alarms named that way.
    //
    // A Bounce is not always a lost message: SES can also count an automatic
    // reply (out of office, an acknowledgement rule) from the inbox as a soft
    // bounce of a message that was delivered. The description says both, and
    // names the inbox from the settings, so the runbook's suppression-list
    // check is run for the address that bounced, even after contactToAddress
    // changes.
    const sesMetric = (metricName: string) =>
      new cloudwatch.Metric({ namespace: 'AWS/SES', metricName, statistic: 'Sum', period: Duration.minutes(5) });
    anyInFiveMinutes(
      'AlarmSesBounces',
      'osep-website-ses-bounces',
      `SES recorded a bounce for a contact message to ${config.contactToAddress}. Either the message did not reach ` +
        'that inbox, and the address may now be on the SES suppression list, which silently drops every later ' +
        'message; or the inbox sent an automatic reply (out of office), which SES can also count as a bounce. ' +
        'See infra/README.md, Day to day.',
      sesMetric('Bounce'),
    );
    anyInFiveMinutes(
      'AlarmSesComplaints',
      'osep-website-ses-complaints',
      `SES recorded a complaint (a contact message to ${config.contactToAddress} was reported as spam), and that ` +
        'address may now be on the SES suppression list, which silently drops every later message. ' +
        'See infra/README.md, Day to day.',
      sesMetric('Complaint'),
    );

    // And the other way round: too many messages getting through. Counted from
    // the same log line (outcome "sent"), summed per hour.
    const sentFilter = new logs.MetricFilter(this, 'ContactMessagesSentFilter', {
      logGroup: contactLogGroup,
      filterPattern: logs.FilterPattern.stringValue('$.outcome', '=', 'sent'),
      metricNamespace: 'OSEP/Website',
      metricName: 'ContactFormMessagesSent',
      metricValue: '1',
    });
    new cloudwatch.Alarm(this, 'AlarmContactVolume', {
      alarmName: 'osep-website-contact-volume',
      alarmDescription:
        `More than ${CONTACT_VOLUME_ALARM_PER_HOUR} contact-form messages sent in one hour: probably a script ` +
        'flooding the form. See infra/README.md, Day to day.',
      metric: sentFilter.metric({ period: Duration.hours(1), statistic: 'Sum' }),
      threshold: CONTACT_VOLUME_ALARM_PER_HOUR,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(notify);

    // ── Outputs ─────────────────────────────────────────────────────────────
    const output = (id: string, value: string, description: string) => new CfnOutput(this, id, { value, description });
    output('SiteBucketName', siteBucket.bucketName, 'GitHub repository variable S3_BUCKET_NAME.');
    output('DistributionId', distribution.distributionId, 'GitHub repository variable CLOUDFRONT_DISTRIBUTION_ID.');
    output(
      'DistributionDomain',
      distribution.distributionDomainName,
      `CloudFront's own hostname. Not a smoke-test URL: it 301s to https://${primaryDomain} like any non-canonical host.`,
    );
    output('DeployRoleArn', deployRole.roleArn, 'GitHub repository variable AWS_ROLE_ARN.');
    output('AlarmTopicArn', alarmTopic.topicArn, 'Subscribe alarm email by CLI with --authenticate-on-unsubscribe (README).');
    output('ContactEndpointPath', CONTACT_ENDPOINT_PATH, "Set CONTACT_FORM_ENDPOINT in src/constants/contact.ts to this.");
    output('CertificateArn', certificate.certificateArn, `ACM certificate for ${primaryDomain} and ${apexDomain}.`);
    output('WafWebAclArn', webAcl.attrArn, 'WAF web ACL attached to the distribution.');
    output('ContactFunctionName', contactFunction.functionName, `aws logs tail /aws/lambda/${CONTACT_FUNCTION_NAME}`);

    if (!zone) {
      // External DNS: everything a human must type into GoDaddy.
      output(
        'DnsWwwRecord',
        `${primaryLabel(config)} CNAME ${distribution.distributionDomainName}`,
        `At GoDaddy: point ${primaryDomain} at CloudFront.`,
      );
      output(
        'DnsApexInstructions',
        `GoDaddy cannot alias ${apexDomain} to CloudFront. Use GoDaddy Forwarding: ${apexDomain} -> https://${primaryDomain} (301, forward only), or move DNS to Route 53.`,
        'The apex limitation of external DNS (README).',
      );
      for (const n of [1, 2, 3] as const) {
        // DkimDNSTokenNameN is the full name, <token>._domainkey.oseptoledo.org.
        // GoDaddy's Name field appends the domain itself, so print the part
        // before it (<token>._domainkey), like DnsWwwRecord's "www".
        const host = Fn.select(0, Fn.split(`.${apexDomain}`, emailIdentity[`dkimDnsTokenName${n}` as const]));
        const value = emailIdentity[`dkimDnsTokenValue${n}` as const];
        output(
          `DkimRecord${n}`,
          `${host} CNAME ${value}`,
          `At GoDaddy: SES Easy DKIM record ${n} of 3 for ${apexDomain}. Name: the part before CNAME (GoDaddy appends .${apexDomain}). Value: the part after.`,
        );
      }
      output(
        'CertificateValidationInstructions',
        `aws acm describe-certificate --region us-east-1 --profile osep-website --certificate-arn ${certificate.certificateArn} ` +
          "--query 'Certificate.DomainValidationOptions[].ResourceRecord'",
        'Prints the ACM validation CNAMEs. Add them at GoDaddy during the first deploy and keep them forever: renewal needs them.',
      );
    }
  }
}

/** Stack-level settings shared by both stacks. Region is always us-east-1. */
export const OSEP_STACK_TAGS = { Application: 'OsepWebsite', Environment: 'prod', ManagedBy: 'cdk' } as const;

/**
 * Builds the app's stacks from context: OsepDnsStack (route53 only) and
 * OsepWebsiteStack. bin/osep-website.ts calls this; so do the tests, so they
 * exercise the same wiring the CLI deploys.
 *
 * The account is deliberately not in code: it comes from the --profile the
 * command runs with (CDK_DEFAULT_ACCOUNT), which is why every command in the
 * README names --profile osep-website explicitly.
 */
export function defineOsepStacks(scope: Construct): {
  config: OsepConfig;
  dns?: OsepDnsStack;
  website: OsepWebsiteStack;
} {
  const config = readConfig(scope.node);
  const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' };
  const common = { env, tags: { ...OSEP_STACK_TAGS }, terminationProtection: true };

  const dns =
    config.dnsProvider === 'route53'
      ? new OsepDnsStack(scope, 'OsepDnsStack', {
          ...common,
          config,
          description: `Old South End Partnership: Route 53 zone for ${config.apexDomain} and its carried-over records`,
        })
      : undefined;

  const website = new OsepWebsiteStack(scope, 'OsepWebsiteStack', {
    ...common,
    config,
    hostedZone: dns?.zone,
    description: `Old South End Partnership website (${config.primaryDomain}): S3, CloudFront, WAF, contact form, deploy role, alarms`,
  });

  return { config, dns, website };
}
