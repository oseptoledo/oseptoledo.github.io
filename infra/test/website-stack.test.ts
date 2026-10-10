/**
 * Template assertions for OsepWebsiteStack in both DNS modes, built through the
 * same defineOsepStacks() the CLI uses and with cdk.json's context (feature
 * flags included), so what is asserted here is what `cdk synth` emits.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { App } from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import {
  ALL_IPV6_ADDRESSES,
  CONTACT_SERVER_ERROR_OUTCOMES,
  CONTACT_VOLUME_ALARM_PER_HOUR,
  DEPLOY_ROLE_NAME,
  defineOsepStacks,
  type OsepWebsiteStack,
} from '../lib/website-stack';
import type { OsepDnsStack } from '../lib/dns-stack';

const cdkContext = (
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cdk.json'), 'utf8')) as { context: Record<string, unknown> }
).context;

// The adjustable settings are asserted as cdk.json gives them, not written out
// again: test/config.test.ts holds the shipped defaults, so changing one means
// cdk.json, DEFAULT_CONTEXT and that test (infra/README.md, Settings). The
// domains are written out below; they are not a setting anyone tunes.
const { contactRateLimit, wafRateLimit, contactToAddress, contactFromAddress } = cdkContext;

const REPO = 'oseptoledo/osep-website';

function build(overrides: Record<string, unknown> = {}): {
  website: OsepWebsiteStack;
  dns?: OsepDnsStack;
  template: Template;
} {
  const app = new App({ context: { ...cdkContext, githubRepo: REPO, ...overrides } });
  const { website, dns } = defineOsepStacks(app);
  return { website, dns, template: Template.fromStack(website) };
}

// The production CSP (CONTENT_SECURITY_POLICY in lib/website-stack.ts), typed
// out again on purpose: a change to the constant must be a deliberate change
// to this test too, and to src/__tests__/csp-compat.test.ts.
const EXPECTED_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; " +
  "connect-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; " +
  "frame-ancestors 'none'; upgrade-insecure-requests";

// AWS managed policy ids (stable across accounts and regions).
const CACHING_DISABLED = '4135ea2d-6df8-44a3-9df3-4b5a84be39ad';
const CACHING_OPTIMIZED = '658327ea-f89d-4fab-a63d-7e88639e58f6';
const ALL_VIEWER_EXCEPT_HOST_HEADER = 'b689b0a8-53d0-40ab-baf2-68738e2966ac';

const COMMON_OUTPUTS = [
  'SiteBucketName',
  'DistributionId',
  'DistributionDomain',
  'DeployRoleArn',
  'AlarmTopicArn',
  'ContactEndpointPath',
  'CertificateArn',
];
const EXTERNAL_DNS_OUTPUTS = [
  'DkimRecord1',
  'DkimRecord2',
  'DkimRecord3',
  'CertificateValidationInstructions',
  'DnsWwwRecord',
  'DnsApexInstructions',
];

type Resource = { Type: string; Properties: Record<string, any> };

const resourcesOf = (template: Template, type: string): [string, Resource][] =>
  Object.entries(template.findResources(type)) as [string, Resource][];

const only = (template: Template, type: string): [string, Resource] => {
  const found = resourcesOf(template, type);
  expect(found, type).toHaveLength(1);
  return found[0];
};

const distributionConfig = (template: Template) => only(template, 'AWS::CloudFront::Distribution')[1].Properties.DistributionConfig;

/** Matches the distribution's ARN as CDK renders it. */
const distributionArnMatcher = (distributionLogicalId: string) =>
  Match.objectLike({
    'Fn::Join': ['', Match.arrayWith([':distribution/', { Ref: distributionLogicalId }])],
  });

describe.each(['route53', 'external'] as const)('OsepWebsiteStack with dnsProvider=%s', (dnsProvider) => {
  const { website, dns, template } = build({ dnsProvider });
  const [distributionId] = only(template, 'AWS::CloudFront::Distribution');

  it('synthesizes without warnings once githubRepo is set (the LIST-origin warning is acknowledged)', () => {
    expect(Annotations.fromStack(website).findWarning('*', Match.anyValue())).toEqual([]);
  });

  it('is pinned to us-east-1 with termination protection on', () => {
    expect(website.region).toBe('us-east-1');
    expect(website.terminationProtection).toBe(true);
    expect(dns === undefined).toBe(dnsProvider === 'external');
  });

  describe('buckets', () => {
    it('blocks every kind of public access on both buckets and enforces TLS', () => {
      const buckets = resourcesOf(template, 'AWS::S3::Bucket');
      expect(buckets).toHaveLength(2);
      for (const [, bucket] of buckets) {
        expect(bucket.Properties.PublicAccessBlockConfiguration).toEqual({
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        });
      }
      template.resourcePropertiesCountIs(
        'AWS::S3::BucketPolicy',
        {
          PolicyDocument: Match.objectLike({
            Statement: Match.arrayWith([
              Match.objectLike({ Effect: 'Deny', Condition: { Bool: { 'aws:SecureTransport': 'false' } } }),
            ]),
          }),
        },
        2,
      );
    });

    it('keeps the site bucket private, versioned, owner-enforced and retained', () => {
      const [, site] = resourcesOf(template, 'AWS::S3::Bucket').find(([id]) => id.startsWith('SiteBucket'))!;
      expect(site.Properties.VersioningConfiguration).toEqual({ Status: 'Enabled' });
      expect(site.Properties.OwnershipControls.Rules[0].ObjectOwnership).toBe('BucketOwnerEnforced');
      expect(site.Properties.LoggingConfiguration.DestinationBucketName.Ref).toMatch(/^LogsBucket/);
    });

    it('retains both buckets on delete and replacement, but not after a failed first create', () => {
      const resources = template.toJSON().Resources as Record<string, { Type: string; DeletionPolicy?: string; UpdateReplacePolicy?: string }>;
      const buckets = Object.entries(resources).filter(([, r]) => r.Type === 'AWS::S3::Bucket');
      expect(buckets.map(([id]) => id.replace(/[0-9A-F]{8}$/, '')).sort()).toEqual(['LogsBucket', 'SiteBucket']);
      for (const [id, bucket] of buckets) {
        expect(bucket.DeletionPolicy, id).toBe('RetainExceptOnCreate');
        expect(bucket.UpdateReplacePolicy, id).toBe('Retain');
      }
    });
  });

  describe('S3 origin access', () => {
    it('uses an S3 OAC and grants CloudFront READ + LIST, scoped by AWS:SourceArn to this distribution', () => {
      const oacs = resourcesOf(template, 'AWS::CloudFront::OriginAccessControl').map(
        ([, r]) => r.Properties.OriginAccessControlConfig,
      );
      expect(oacs.map((c) => c.OriginAccessControlOriginType).sort()).toEqual(['lambda', 's3']);
      for (const config of oacs) {
        expect(config.SigningBehavior).toBe('always');
        expect(config.SigningProtocol).toBe('sigv4');
      }

      const [, sitePolicy] = resourcesOf(template, 'AWS::S3::BucketPolicy').find(
        ([, r]) => r.Properties.Bucket.Ref.startsWith('SiteBucket'),
      )!;
      const allow = sitePolicy.Properties.PolicyDocument.Statement.filter((s: any) => s.Effect === 'Allow');
      expect(allow).toHaveLength(1);
      expect(allow[0].Principal).toEqual({ Service: 'cloudfront.amazonaws.com' });
      expect([allow[0].Action].flat().sort()).toEqual(['s3:GetObject', 's3:ListBucket']);
      expect(allow[0].Condition.StringEquals['AWS:SourceArn']).toEqual(
        expect.objectContaining({
          'Fn::Join': ['', expect.arrayContaining([':distribution/', { Ref: distributionId }])],
        }),
      );
    });
  });

  describe('distribution', () => {
    const config = distributionConfig(template);

    it('serves both hostnames over modern TLS, HTTP/2+3, PriceClass 100, with WAF and logging', () => {
      expect(config.Aliases).toEqual(['www.oseptoledo.org', 'oseptoledo.org']);
      expect(config.DefaultRootObject).toBe('index.html');
      expect(config.HttpVersion).toBe('http2and3');
      // No AAAA records. This only changes DNS: edges still accept IPv6, so
      // the WAF's BlockIpv6 rule (tested below) is what keeps IPv6 out.
      expect(config.IPV6Enabled).toBe(false);
      expect(config.PriceClass).toBe('PriceClass_100');
      expect(config.ViewerCertificate.MinimumProtocolVersion).toBe('TLSv1.2_2021');
      expect(config.ViewerCertificate.SslSupportMethod).toBe('sni-only');
      expect(config.WebACLId).toEqual({ 'Fn::GetAtt': ['Waf', 'Arn'] });
      expect(config.Logging.Prefix).toBe('cloudfront/');
      expect(config.Logging.Bucket['Fn::GetAtt'][0]).toMatch(/^LogsBucket/);
    });

    it('has exactly one error response: a real 404 serving /404.html with TTL 0 (403 unmapped)', () => {
      expect(config.CustomErrorResponses).toEqual([
        { ErrorCode: 404, ResponseCode: 404, ResponsePagePath: '/404.html', ErrorCachingMinTTL: 0 },
      ]);
    });

    it('attaches the canonical-host function to the default behavior only', () => {
      const [functionId, fn] = only(template, 'AWS::CloudFront::Function');
      expect(fn.Properties.FunctionConfig.Runtime).toBe('cloudfront-js-2.0');
      expect(fn.Properties.FunctionCode).toContain("var CANONICAL_HOST = 'www.oseptoledo.org';");
      expect(fn.Properties.FunctionCode).not.toContain('__CANONICAL_HOST__');

      expect(config.DefaultCacheBehavior.FunctionAssociations).toEqual([
        { EventType: 'viewer-request', FunctionARN: { 'Fn::GetAtt': [functionId, 'FunctionARN'] } },
      ]);
      for (const behavior of config.CacheBehaviors) {
        expect(behavior.FunctionAssociations, behavior.PathPattern).toBeUndefined();
        expect(behavior.LambdaFunctionAssociations, behavior.PathPattern).toBeUndefined();
      }
    });

    it('serves the site from S3: GET/HEAD, CachingOptimized, redirect to HTTPS, security headers', () => {
      const behavior = config.DefaultCacheBehavior;
      expect(behavior.AllowedMethods).toEqual(['GET', 'HEAD']);
      expect(behavior.CachePolicyId).toBe(CACHING_OPTIMIZED);
      expect(behavior.ViewerProtocolPolicy).toBe('redirect-to-https');
      expect(behavior.ResponseHeadersPolicyId.Ref).toMatch(/^SecurityHeadersPolicy/);
      const origin = config.Origins.find((o: any) => o.Id === behavior.TargetOriginId);
      expect(origin.S3OriginConfig).toBeDefined();
      expect(origin.DomainName['Fn::GetAtt'][0]).toMatch(/^SiteBucket/);
    });

    it('routes /api/* to the contact function URL through a Lambda OAC, uncached, every method, HTTPS only', () => {
      expect(config.CacheBehaviors).toHaveLength(1);
      const [api] = config.CacheBehaviors;
      expect(api.PathPattern).toBe('/api/*');
      expect([...api.AllowedMethods].sort()).toEqual(['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']);
      expect(api.CachePolicyId).toBe(CACHING_DISABLED);
      expect(api.OriginRequestPolicyId).toBe(ALL_VIEWER_EXCEPT_HOST_HEADER);
      expect(api.ViewerProtocolPolicy).toBe('https-only');
      expect(api.ResponseHeadersPolicyId).toEqual(config.DefaultCacheBehavior.ResponseHeadersPolicyId);

      const origin = config.Origins.find((o: any) => o.Id === api.TargetOriginId);
      expect(origin.CustomOriginConfig).toEqual({ OriginProtocolPolicy: 'https-only', OriginSSLProtocols: ['TLSv1.2'] });
      expect(JSON.stringify(origin.DomainName)).toContain('FunctionUrl');
      const [lambdaOacId] = resourcesOf(template, 'AWS::CloudFront::OriginAccessControl').find(
        ([, r]) => r.Properties.OriginAccessControlConfig.OriginAccessControlOriginType === 'lambda',
      )!;
      expect(origin.OriginAccessControlId).toEqual({ 'Fn::GetAtt': [lambdaOacId, 'Id'] });
    });
  });

  describe('response headers', () => {
    const [, policy] = only(template, 'AWS::CloudFront::ResponseHeadersPolicy');
    const config = policy.Properties.ResponseHeadersPolicyConfig;

    it('sends the production CSP (CONTENT_SECURITY_POLICY) exactly', () => {
      expect(config.SecurityHeadersConfig.ContentSecurityPolicy).toEqual({
        ContentSecurityPolicy: EXPECTED_CSP,
        Override: true,
      });
      expect(EXPECTED_CSP).not.toContain('unsafe-inline');
    });

    it('sends HSTS (2 years, subdomains, preload), nosniff, DENY, strict-origin-when-cross-origin, Permissions-Policy', () => {
      expect(config.SecurityHeadersConfig.StrictTransportSecurity).toEqual({
        AccessControlMaxAgeSec: 63072000,
        IncludeSubdomains: true,
        Preload: true,
        Override: true,
      });
      expect(config.SecurityHeadersConfig.ContentTypeOptions).toEqual({ Override: true });
      expect(config.SecurityHeadersConfig.FrameOptions).toEqual({ FrameOption: 'DENY', Override: true });
      expect(config.SecurityHeadersConfig.ReferrerPolicy).toEqual({
        ReferrerPolicy: 'strict-origin-when-cross-origin',
        Override: true,
      });
      expect(config.CustomHeadersConfig.Items).toEqual([
        {
          Header: 'Permissions-Policy',
          Value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          Override: true,
        },
      ]);
    });
  });

  describe('WAF', () => {
    const [, acl] = only(template, 'AWS::WAFv2::WebACL');
    const rules: any[] = acl.Properties.Rules;
    const byName = (name: string) => rules.find((r) => r.Name === name);

    it('is a CloudFront-scope ACL that allows by default', () => {
      expect(acl.Properties.Scope).toBe('CLOUDFRONT');
      expect(acl.Properties.DefaultAction).toEqual({ Allow: {} });
      expect(new Set(rules.map((r) => r.Priority)).size).toBe(rules.length);
    });

    it.each(['AWSManagedRulesKnownBadInputsRuleSet', 'AWSManagedRulesAmazonIpReputationList'])(
      'runs the AWS managed group %s',
      (name) => {
        expect(byName(name).Statement).toEqual({ ManagedRuleGroupStatement: { VendorName: 'AWS', Name: name } });
        expect(byName(name).OverrideAction).toEqual({ None: {} });
      },
    );

    it('runs the AWS core rule set, counting (not blocking) bodies over 8 KB so the contact endpoint can answer 413', () => {
      const name = 'AWSManagedRulesCommonRuleSet';
      expect(byName(name).Statement).toEqual({
        ManagedRuleGroupStatement: {
          VendorName: 'AWS',
          Name: name,
          RuleActionOverrides: [{ Name: 'SizeRestrictions_BODY', ActionToUse: { Count: {} } }],
        },
      });
      expect(byName(name).OverrideAction).toEqual({ None: {} });
    });

    it('refuses every request from an IPv6 address, site-wide, before either rate limit counts it', () => {
      // enableIpv6: false only drops the AAAA records; every CloudFront edge
      // still accepts IPv6 for every distribution, and WAF counts each IPv6
      // address on its own, so a host with a /64 would never reach the per-IP
      // limits. This rule is what makes the site IPv4 only.
      const [ipSetId, ipSet] = only(template, 'AWS::WAFv2::IPSet');
      expect(ipSet.Properties).toMatchObject({ Scope: 'CLOUDFRONT', IPAddressVersion: 'IPV6' });
      // The two halves of the address space (WAF refuses ::/0), so together all of it.
      expect([...ipSet.Properties.Addresses].sort()).toEqual(['8000::/1', '::/1']);
      expect([...ALL_IPV6_ADDRESSES].sort()).toEqual(['8000::/1', '::/1']);

      const rule = byName('BlockIpv6');
      expect(rule.Action).toEqual({ Block: {} });
      // No scope-down and no forwarded-IP config: the connecting client's own
      // address, on any path.
      expect(rule.Statement).toEqual({ IPSetReferenceStatement: { Arn: { 'Fn::GetAtt': [ipSetId, 'Arn'] } } });
      expect(rule.Priority).toBeLessThan(byName('ContactFormRateLimit').Priority);
      expect(rule.Priority).toBeLessThan(byName('RateLimitPerIp').Priority);
    });

    it('has exactly the six rules the costs and docs describe', () => {
      expect(rules.map((r) => r.Name)).toEqual([
        'AWSManagedRulesCommonRuleSet',
        'AWSManagedRulesKnownBadInputsRuleSet',
        'AWSManagedRulesAmazonIpReputationList',
        'BlockIpv6',
        'ContactFormRateLimit',
        'RateLimitPerIp',
      ]);
    });

    it('blocks more than contactRateLimit requests per IP per 5 minutes to /api/contact', () => {
      const rule = byName('ContactFormRateLimit');
      expect(rule.Action).toEqual({ Block: {} });
      expect(rule.Statement.RateBasedStatement).toEqual({
        Limit: contactRateLimit,
        EvaluationWindowSec: 300,
        AggregateKeyType: 'IP',
        ScopeDownStatement: {
          ByteMatchStatement: {
            FieldToMatch: { UriPath: {} },
            PositionalConstraint: 'STARTS_WITH',
            SearchString: '/api/contact',
            // Decoded and normalized first: CloudFront forwards the raw path,
            // so /api/%63ontact or /api//contact must not dodge the limit.
            TextTransformations: [
              { Priority: 0, Type: 'URL_DECODE' },
              { Priority: 1, Type: 'NORMALIZE_PATH' },
              { Priority: 2, Type: 'LOWERCASE' },
            ],
          },
        },
      });
    });

    it('blocks more than wafRateLimit requests per IP per 5 minutes site-wide', () => {
      const rule = byName('RateLimitPerIp');
      expect(rule.Action).toEqual({ Block: {} });
      expect(rule.Statement.RateBasedStatement).toEqual({ Limit: wafRateLimit, EvaluationWindowSec: 300, AggregateKeyType: 'IP' });
    });

    it('takes both limits from context', () => {
      const { template: tuned } = build({ dnsProvider, wafRateLimit: '3000', contactRateLimit: '25' });
      const tunedRules: any[] = only(tuned, 'AWS::WAFv2::WebACL')[1].Properties.Rules;
      expect(tunedRules.find((r) => r.Name === 'RateLimitPerIp').Statement.RateBasedStatement.Limit).toBe(3000);
      expect(tunedRules.find((r) => r.Name === 'ContactFormRateLimit').Statement.RateBasedStatement.Limit).toBe(25);
    });
  });

  describe('contact form Lambda', () => {
    const [functionId, fn] = only(template, 'AWS::Lambda::Function');

    it('runs Node 24 on arm64 with the contract environment', () => {
      expect(fn.Properties.Runtime).toBe('nodejs24.x');
      expect(fn.Properties.Architectures).toEqual(['arm64']);
      expect(fn.Properties.Handler).toBe('index.handler');
      expect(fn.Properties.Environment.Variables).toEqual({
        TO_ADDRESS: contactToAddress,
        FROM_ADDRESS: contactFromAddress,
        ALLOWED_ORIGINS: 'https://www.oseptoledo.org',
      });
      expect(fn.Properties.ReservedConcurrentExecutions).toBeUndefined();
    });

    it('has an AWS_IAM function URL that only this distribution may invoke, with BOTH required permissions', () => {
      template.hasResourceProperties('AWS::Lambda::Url', { AuthType: 'AWS_IAM' });
      const permissions = resourcesOf(template, 'AWS::Lambda::Permission').map(([, r]) => r.Properties);
      expect(permissions.map((p) => p.Action).sort()).toEqual(['lambda:InvokeFunction', 'lambda:InvokeFunctionUrl']);
      for (const permission of permissions) {
        expect(permission.Principal).toBe('cloudfront.amazonaws.com');
        expect(permission.SourceArn).toEqual(
          expect.objectContaining({
            'Fn::Join': ['', expect.arrayContaining([':distribution/', { Ref: distributionId }])],
          }),
        );
        expect(JSON.stringify(permission.FunctionName)).toContain(functionId.replace(/[0-9A-F]{8}$/, ''));
      }
      expect(permissions.find((p) => p.Action === 'lambda:InvokeFunction')!.InvokedViaFunctionUrl).toBe(true);
    });

    it('may send only as the From address, only to the inbox, only through the domain identity', () => {
      const [identityId] = only(template, 'AWS::SES::EmailIdentity');
      template.hasResourceProperties('AWS::SES::EmailIdentity', {
        EmailIdentity: 'oseptoledo.org',
        DkimAttributes: { SigningEnabled: true },
      });
      const [, policy] = resourcesOf(template, 'AWS::IAM::Policy').find(([id]) => id.startsWith('ContactFormRole'))!;
      const statements: any[] = policy.Properties.PolicyDocument.Statement;
      const ses = statements.filter((s) => JSON.stringify(s.Action).includes('ses:'));
      expect(ses).toHaveLength(1);
      expect(ses[0].Action).toBe('ses:SendEmail');
      expect(ses[0].Condition).toEqual({
        StringEquals: { 'ses:FromAddress': contactFromAddress },
        'ForAllValues:StringEquals': { 'ses:Recipients': [contactToAddress] },
      });
      expect(JSON.stringify(ses[0].Resource)).toContain(`":identity/",{"Ref":"${identityId}"}`);
      // Logs only to its own group; no managed policies anywhere on the role.
      const logsStatement = statements.find((s) => JSON.stringify(s.Action).includes('logs:'));
      expect(logsStatement.Resource['Fn::GetAtt'][0]).toMatch(/^ContactFormLogGroup/);
      const [, role] = resourcesOf(template, 'AWS::IAM::Role').find(([id]) => id.startsWith('ContactFormRole'))!;
      expect(role.Properties.ManagedPolicyArns).toBeUndefined();
    });

    it('also names an off-domain inbox identity when contactToAddress is elsewhere', () => {
      const { template: offDomain } = build({ dnsProvider, contactToAddress: 'osep.partnership@gmail.com' });
      const [, policy] = resourcesOf(offDomain, 'AWS::IAM::Policy').find(([id]) => id.startsWith('ContactFormRole'))!;
      expect(JSON.stringify(policy.Properties.PolicyDocument)).toContain(':identity/osep.partnership@gmail.com');
    });

    it('counts handled 500s from the log line, with the outcomes contact.mjs actually logs for a 500', () => {
      const source = fs.readFileSync(path.join(__dirname, '..', 'lambda', 'contact-form', 'contact.mjs'), 'utf8');
      const logged = [...source.matchAll(/reply\(\s*500\s*,[^,]+,\s*'([a-z_]+)'/g)].map((m) => m[1]);
      expect(new Set(logged)).toEqual(new Set(CONTACT_SERVER_ERROR_OUTCOMES));
      const [, filter] = resourcesOf(template, 'AWS::Logs::MetricFilter').find(
        ([, f]) => f.Properties.MetricTransformations[0].MetricName === 'ContactFormServerErrors',
      )!;
      for (const outcome of CONTACT_SERVER_ERROR_OUTCOMES) {
        expect(filter.Properties.FilterPattern).toContain(`($.outcome = "${outcome}")`);
      }
    });
  });

  describe('GitHub deploy role', () => {
    const [roleId, role] = resourcesOf(template, 'AWS::IAM::Role').find(([id]) => id.startsWith('GithubDeployRole'))!;

    it('trusts only the configured repo main branch through the GitHub OIDC provider', () => {
      template.hasResourceProperties('AWS::IAM::OIDCProvider', {
        Url: 'https://token.actions.githubusercontent.com',
        ClientIdList: ['sts.amazonaws.com'],
      });
      expect(role.Properties.RoleName).toBe(DEPLOY_ROLE_NAME);
      expect(role.Properties.MaxSessionDuration).toBe(3600);
      const statements: any[] = role.Properties.AssumeRolePolicyDocument.Statement;
      expect(statements).toHaveLength(1);
      expect(statements[0]).toMatchObject({
        Effect: 'Allow',
        Action: 'sts:AssumeRoleWithWebIdentity',
        Condition: {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
            'token.actions.githubusercontent.com:sub': `repo:${REPO}:ref:refs/heads/main`,
          },
        },
      });
      expect(statements[0].Principal.Federated.Ref).toMatch(/^GithubOidcProvider/);
    });

    it('can only sync the site bucket and invalidate this distribution', () => {
      expect(role.Properties.ManagedPolicyArns).toBeUndefined();
      const policies = resourcesOf(template, 'AWS::IAM::Policy').filter(([, p]) =>
        p.Properties.Roles.some((r: any) => r.Ref === roleId),
      );
      expect(policies).toHaveLength(1);
      const statements: any[] = policies[0][1].Properties.PolicyDocument.Statement;
      const summary = statements.map((s) => ({ actions: [s.Action].flat().sort(), resource: JSON.stringify(s.Resource) }));
      expect(summary).toHaveLength(3);
      expect(summary[0].actions).toEqual(['s3:GetBucketLocation', 's3:ListBucket']);
      expect(summary[0].resource).toMatch(/^\{"Fn::GetAtt":\["SiteBucket\w+","Arn"\]\}$/);
      expect(summary[1].actions).toEqual(['s3:DeleteObject', 's3:GetObject', 's3:PutObject']);
      expect(summary[1].resource).toMatch(/SiteBucket\w+","Arn"\]\},"\/\*"\]\]\}$/);
      expect(summary[2].actions).toEqual(['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation']);
      expect(summary[2].resource).toContain(`":distribution/",{"Ref":"${distributionId}"}`);
      expect(statements.every((s) => s.Effect === 'Allow' && !s.Condition)).toBe(true);
    });

    it('carries no warning once githubRepo is real', () => {
      expect(Annotations.fromStack(website).findWarning('*', Match.stringLikeRegexp('placeholder'))).toHaveLength(0);
    });
  });

  describe('alarms', () => {
    const [topicId, topic] = only(template, 'AWS::SNS::Topic');
    const alarms = resourcesOf(template, 'AWS::CloudWatch::Alarm').map(([, r]) => r.Properties);
    const alarm = (name: string) => alarms.find((a) => a.AlarmName === name)!;

    it('notifies the osep-website-alarms topic, which has no subscription in the template', () => {
      expect(topic.Properties.TopicName).toBe('osep-website-alarms');
      template.resourceCountIs('AWS::SNS::Subscription', 0);
      expect(alarms).toHaveLength(8);
      for (const a of alarms) {
        expect(a.AlarmActions, a.AlarmName).toEqual([{ Ref: topicId }]);
        // The topic policy lets CloudWatch publish only for alarms named osep-website-*.
        expect(a.AlarmName).toMatch(/^osep-website-/);
      }
      template.hasResourceProperties('AWS::SNS::TopicPolicy', {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({ Effect: 'Allow', Principal: { Service: 'cloudwatch.amazonaws.com' }, Action: 'sns:Publish' }),
          ]),
        }),
      });
    });

    it('alarms on CloudFront 5xx above 1% over 5 minutes', () => {
      expect(alarm('osep-website-5xx-rate')).toMatchObject({
        Namespace: 'AWS/CloudFront',
        MetricName: '5xxErrorRate',
        Statistic: 'Average',
        Period: 300,
        Threshold: 1,
        EvaluationPeriods: 1,
        ComparisonOperator: 'GreaterThanThreshold',
        TreatMissingData: 'notBreaching',
        Dimensions: [
          { Name: 'DistributionId', Value: { Ref: distributionId } },
          { Name: 'Region', Value: 'Global' },
        ],
      });
    });

    it('alarms on CloudFront 4xx above 20%, gated to periods with at least 50 requests, 3 periods running', () => {
      const a = alarm('osep-website-4xx-rate');
      expect(a).toMatchObject({ Threshold: 20, EvaluationPeriods: 3, ComparisonOperator: 'GreaterThanThreshold' });
      const expression = a.Metrics.find((m: any) => m.Expression);
      expect(expression.Expression).toBe('IF(requests >= 50, rate4xx, 0)');
      const metricNames = a.Metrics.filter((m: any) => m.MetricStat).map((m: any) => [m.Id, m.MetricStat.Metric.MetricName, m.MetricStat.Stat]);
      expect(metricNames.sort()).toEqual([
        ['rate4xx', '4xxErrorRate', 'Average'],
        ['requests', 'Requests', 'Sum'],
      ]);
    });

    it.each([
      ['osep-website-contact-errors', 'AWS/Lambda', 'Errors'],
      ['osep-website-contact-throttles', 'AWS/Lambda', 'Throttles'],
      ['osep-website-contact-server-errors', 'OSEP/Website', 'ContactFormServerErrors'],
      ['osep-website-ses-bounces', 'AWS/SES', 'Bounce'],
      ['osep-website-ses-complaints', 'AWS/SES', 'Complaint'],
    ])('alarms on %s (%s %s > 0 in 5 minutes)', (name, namespace, metric) => {
      expect(alarm(name)).toMatchObject({
        Namespace: namespace,
        MetricName: metric,
        Statistic: 'Sum',
        Period: 300,
        Threshold: 0,
        ComparisonOperator: 'GreaterThanThreshold',
        TreatMissingData: 'notBreaching',
      });
    });

    it('watches SES bounces and complaints at account level, where suppressed sends are counted', () => {
      // No dimensions: SES publishes Bounce and Complaint for the whole account,
      // including messages it drops because the address is on the account's
      // suppression list. A dimension would make the alarm watch a metric that
      // never exists.
      for (const name of ['osep-website-ses-bounces', 'osep-website-ses-complaints']) {
        expect(alarm(name).Dimensions, name).toBeUndefined();
        expect(alarm(name).EvaluationPeriods, name).toBe(1);
      }
    });

    it('names the configured inbox in the SES alarms, so the suppression-list check follows contactToAddress', () => {
      // The runbook's first steps for these alarms check and clear the address
      // the description names. A hardcoded admin@ would send the operator to
      // the wrong address after the inbox changes.
      const moved = 'moved-inbox@oseptoledo.org';
      const { template: movedTemplate } = build({ dnsProvider, contactToAddress: moved });
      const movedAlarms = resourcesOf(movedTemplate, 'AWS::CloudWatch::Alarm').map(([, r]) => r.Properties);
      for (const name of ['osep-website-ses-bounces', 'osep-website-ses-complaints']) {
        expect(alarm(name).AlarmDescription, name).toContain(contactToAddress);
        const movedDescription = movedAlarms.find((a) => a.AlarmName === name)!.AlarmDescription;
        expect(movedDescription, name).toContain(moved);
        expect(movedDescription, name).not.toContain(contactToAddress);
        expect(movedDescription, name).toMatch(/See infra\/README\.md, Day to day\.$/);
      }
      // A bounce can also be the inbox's automatic reply to a delivered message.
      expect(alarm('osep-website-ses-bounces').AlarmDescription).toMatch(/automatic reply/);
    });

    it('alarms when more than CONTACT_VOLUME_ALARM_PER_HOUR messages are sent in one hour', () => {
      expect(CONTACT_VOLUME_ALARM_PER_HOUR).toBe(20);
      expect(alarm('osep-website-contact-volume')).toMatchObject({
        Namespace: 'OSEP/Website',
        MetricName: 'ContactFormMessagesSent',
        Statistic: 'Sum',
        Period: 3600,
        Threshold: 20,
        EvaluationPeriods: 1,
        ComparisonOperator: 'GreaterThanThreshold',
        TreatMissingData: 'notBreaching',
      });
      const [, filter] = resourcesOf(template, 'AWS::Logs::MetricFilter').find(
        ([, f]) => f.Properties.MetricTransformations[0].MetricName === 'ContactFormMessagesSent',
      )!;
      expect(filter.Properties.FilterPattern).toBe('{ $.outcome = "sent" }');
      expect(filter.Properties.MetricTransformations[0]).toMatchObject({ MetricNamespace: 'OSEP/Website', MetricValue: '1' });
      // The outcome the alarm counts is the one contact.mjs logs for a delivered message.
      const source = fs.readFileSync(path.join(__dirname, '..', 'lambda', 'contact-form', 'contact.mjs'), 'utf8');
      expect(source).toContain("return reply(200, OK, 'sent')");
    });
  });

  describe('outputs', () => {
    const outputs = Object.keys(template.toJSON().Outputs ?? {});

    it('exposes every contract output', () => {
      expect(outputs).toEqual(expect.arrayContaining(COMMON_OUTPUTS));
      template.hasOutput('ContactEndpointPath', { Value: '/api/contact' });
    });

    it(
      dnsProvider === 'external'
        ? 'prints the DKIM and certificate-validation instructions for GoDaddy'
        : 'needs no DNS instructions (Route 53 records are in the template)',
      () => {
        for (const name of EXTERNAL_DNS_OUTPUTS) {
          expect(outputs.includes(name), name).toBe(dnsProvider === 'external');
        }
      },
    );

    if (dnsProvider === 'external') {
      it('prints each DKIM record name relative to the domain, as GoDaddy\'s Name field wants it', () => {
        const all = template.toJSON().Outputs as Record<string, { Value: unknown }>;
        const [identityId] = only(template, 'AWS::SES::EmailIdentity');
        for (const n of [1, 2, 3]) {
          expect(all[`DkimRecord${n}`].Value).toEqual({
            'Fn::Join': [
              '',
              [
                {
                  'Fn::Select': [0, { 'Fn::Split': ['.oseptoledo.org', { 'Fn::GetAtt': [identityId, `DkimDNSTokenName${n}`] }] }],
                },
                ' CNAME ',
                { 'Fn::GetAtt': [identityId, `DkimDNSTokenValue${n}`] },
              ],
            ],
          });
        }
        expect(all.DnsWwwRecord.Value).toEqual({
          'Fn::Join': ['', ['www CNAME ', { 'Fn::GetAtt': [distributionId, 'DomainName'] }]],
        });
      });
    }
  });

  describe('DNS', () => {
    const records = resourcesOf(template, 'AWS::Route53::RecordSet').map(([, r]) => r.Properties);
    const [, certificate] = only(template, 'AWS::CertificateManager::Certificate');

    it('covers www and the apex with one DNS-validated certificate', () => {
      expect(certificate.Properties.DomainName).toBe('www.oseptoledo.org');
      expect(certificate.Properties.SubjectAlternativeNames).toEqual(['oseptoledo.org']);
      expect(certificate.Properties.ValidationMethod).toBe('DNS');
      const zoned = (certificate.Properties.DomainValidationOptions ?? []).every((o: any) => o.HostedZoneId);
      expect(zoned && certificate.Properties.DomainValidationOptions?.length === 2).toBe(dnsProvider === 'route53');
    });

    if (dnsProvider === 'route53') {
      it('points apex and www at CloudFront (A alias only: the site is IPv4 only) and publishes the three DKIM CNAMEs', () => {
        const aliases = records.filter((r) => r.AliasTarget).map((r) => `${r.Type} ${r.Name}`).sort();
        expect(aliases).toEqual(['A oseptoledo.org.', 'A www.oseptoledo.org.']);
        expect(records.filter((r) => r.Type === 'AAAA')).toHaveLength(0);
        for (const r of records.filter((r) => r.AliasTarget)) {
          expect(r.AliasTarget.DNSName).toEqual({ 'Fn::GetAtt': [distributionId, 'DomainName'] });
        }
        expect(records.filter((r) => r.Type === 'CNAME' && JSON.stringify(r.Name).includes('DkimDNSTokenName'))).toHaveLength(3);
      });
    } else {
      it('creates no Route 53 records at all', () => {
        expect(records).toHaveLength(0);
      });
    }
  });
});

describe('the githubRepo placeholder', () => {
  const { website, template } = build({ githubRepo: 'OWNER/REPO' });
  const [, role] = resourcesOf(template, 'AWS::IAM::Role').find(([id]) => id.startsWith('GithubDeployRole'))!;

  it('still synthesizes, with a warning on the stack', () => {
    const warnings = Annotations.fromStack(website).findWarning('*', Match.stringLikeRegexp('githubRepo is the placeholder'));
    expect(warnings).toHaveLength(1);
    expect(Annotations.fromStack(website).findError('*', Match.anyValue())).toHaveLength(0);
  });

  it('keeps the contract trust condition, and adds an explicit Deny so no GitHub token can assume the role', () => {
    const statements: any[] = role.Properties.AssumeRolePolicyDocument.Statement;
    expect(statements).toHaveLength(2);
    expect(statements[0].Condition.StringEquals['token.actions.githubusercontent.com:sub']).toBe(
      'repo:OWNER/REPO:ref:refs/heads/main',
    );
    expect(statements[1]).toMatchObject({
      Sid: 'DenyUntilGithubRepoIsConfigured',
      Effect: 'Deny',
      Action: 'sts:AssumeRoleWithWebIdentity',
    });
    expect(statements[1].Condition).toBeUndefined();
  });
});
