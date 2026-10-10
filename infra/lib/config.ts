/**
 * The app's configuration: CDK context values, read once and validated before
 * any construct exists, so a typo fails `cdk synth` with a sentence instead of
 * deploying something half-right.
 *
 * Every key has a default in cdk.json (`context`), and DEFAULT_CONTEXT below
 * repeats those defaults so the stacks can be built in tests without cdk.json.
 * test/config.test.ts fails if the two drift, except for dnsProvider and
 * githubRepo: people decide those during the launch and record the decision in
 * cdk.json (infra/README.md steps 4 and 6), so there they need only be valid,
 * and DEFAULT_CONTEXT keeps the defaults. Override any key per command:
 *
 *   npx cdk synth -c dnsProvider=external -c githubRepo=oseptoledo/osep-website
 *
 * Values given with -c always arrive as strings; the numeric keys are parsed.
 */
import type { Node } from 'constructs';

export type DnsProvider = 'route53' | 'external';

export const DNS_PROVIDERS: readonly DnsProvider[] = ['route53', 'external'];

/**
 * The deliberate placeholder for githubRepo. Synth still succeeds with it (the
 * stack carries a warning), but the deploy role refuses every GitHub token until
 * the stack is deployed with the real `-c githubRepo=<owner>/<repo>`. See
 * website-stack.ts, "GitHub OIDC deploy role".
 */
export const GITHUB_REPO_PLACEHOLDER = 'OWNER/REPO';

/** The defaults: the `context` block of cdk.json, apart from the launch decisions recorded there. */
export const DEFAULT_CONTEXT = {
  primaryDomain: 'www.oseptoledo.org',
  apexDomain: 'oseptoledo.org',
  dnsProvider: 'route53',
  contactToAddress: 'admin@oseptoledo.org',
  contactFromAddress: 'no-reply@oseptoledo.org',
  githubRepo: GITHUB_REPO_PLACEHOLDER,
  wafRateLimit: 2000,
  contactRateLimit: 10,
} as const;

export type ContextKey = keyof typeof DEFAULT_CONTEXT;

export interface OsepConfig {
  /** The canonical host, e.g. www.oseptoledo.org. Every other host 301s here. */
  readonly primaryDomain: string;
  /** The registered domain, e.g. oseptoledo.org: the hosted zone and the SES identity. */
  readonly apexDomain: string;
  /** Where the domain's DNS is served: a Route 53 zone this app owns, or GoDaddy by hand. */
  readonly dnsProvider: DnsProvider;
  /** The inbox contact-form messages are delivered to. */
  readonly contactToAddress: string;
  /** The From address of contact-form messages; must be on apexDomain (the SES identity). */
  readonly contactFromAddress: string;
  /** `<owner>/<repo>` on GitHub, exact case, whose main branch may deploy the site. */
  readonly githubRepo: string;
  /** True while githubRepo is still GITHUB_REPO_PLACEHOLDER. */
  readonly githubRepoIsPlaceholder: boolean;
  /** WAF: requests per IP per 5 minutes, across the whole site. */
  readonly wafRateLimit: number;
  /** WAF: requests per IP per 5 minutes to paths starting /api/contact. */
  readonly contactRateLimit: number;
}

/** The www (or other) label of primaryDomain within apexDomain, e.g. 'www'. */
export function primaryLabel(config: Pick<OsepConfig, 'primaryDomain' | 'apexDomain'>): string {
  return config.primaryDomain.slice(0, -(config.apexDomain.length + 1));
}

// Lowercase only: the canonical-host function compares the lowercased Host
// header against primaryDomain, so an uppercase value would redirect forever.
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
// The same shape the site's form and the Lambda accept, minus anything that
// could smuggle a second header or recipient into an email.
const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
// GitHub owner (user or org) and repository names.
const GITHUB_REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;

// AWS WAF's bounds for a rate-based rule's limit.
const WAF_LIMIT_MIN = 10;
const WAF_LIMIT_MAX = 2_000_000_000;

/** Thrown by readConfig, listing every problem at once. */
export class ConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(
      `Invalid CDK context for the OSEP website:\n${problems.map((p) => `  - ${p}`).join('\n')}\n` +
        'Fix cdk.json or the -c flags (infra/README.md lists every key).',
    );
    this.name = 'ConfigError';
  }
}

type ContextSource = Pick<Node, 'tryGetContext'>;

/** Reads and validates the context. Throws ConfigError on any problem. */
export function readConfig(node: ContextSource): OsepConfig {
  const problems: string[] = [];

  const raw = <K extends ContextKey>(key: K): unknown => {
    const value: unknown = node.tryGetContext(key);
    return value === undefined || value === null ? DEFAULT_CONTEXT[key] : value;
  };

  const text = (key: ContextKey): string => {
    const value = raw(key);
    if (typeof value !== 'string' || value.trim() === '') {
      problems.push(`${key} must be a non-empty string (got ${JSON.stringify(value)}).`);
      return '';
    }
    if (value !== value.trim()) {
      problems.push(`${key} has leading or trailing whitespace: ${JSON.stringify(value)}.`);
    }
    return value.trim();
  };

  const integer = (key: ContextKey, min: number, max: number): number => {
    const value = raw(key);
    const parsed =
      typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      problems.push(`${key} must be a whole number from ${min} to ${max} (got ${JSON.stringify(value)}).`);
      return min;
    }
    return parsed;
  };

  const primaryDomain = text('primaryDomain');
  const apexDomain = text('apexDomain');
  for (const [key, value] of [
    ['primaryDomain', primaryDomain],
    ['apexDomain', apexDomain],
  ] as const) {
    if (value && !HOSTNAME.test(value)) {
      problems.push(`${key} must be a lowercase hostname without a scheme or trailing dot (got "${value}").`);
    }
  }
  if (primaryDomain && apexDomain && !primaryDomain.endsWith(`.${apexDomain}`)) {
    problems.push(
      `primaryDomain ("${primaryDomain}") must be a subdomain of apexDomain ("${apexDomain}"), ` +
        'e.g. www.oseptoledo.org. Serving the site on the bare apex is not supported by these stacks.',
    );
  }

  const dnsProvider = text('dnsProvider');
  if (dnsProvider && !(DNS_PROVIDERS as readonly string[]).includes(dnsProvider)) {
    problems.push(`dnsProvider must be one of ${DNS_PROVIDERS.join(', ')} (got "${dnsProvider}").`);
  }

  const contactToAddress = text('contactToAddress');
  const contactFromAddress = text('contactFromAddress');
  for (const [key, value] of [
    ['contactToAddress', contactToAddress],
    ['contactFromAddress', contactFromAddress],
  ] as const) {
    if (value && !EMAIL.test(value)) problems.push(`${key} is not a plain email address (got "${value}").`);
  }
  if (contactFromAddress && apexDomain && !contactFromAddress.toLowerCase().endsWith(`@${apexDomain}`)) {
    problems.push(
      `contactFromAddress ("${contactFromAddress}") must be an address @${apexDomain}: ` +
        'that domain is the SES identity the contact Lambda is allowed to send as.',
    );
  }

  const githubRepo = text('githubRepo');
  const githubRepoIsPlaceholder = githubRepo === GITHUB_REPO_PLACEHOLDER;
  if (githubRepo && !githubRepoIsPlaceholder && !GITHUB_REPO.test(githubRepo)) {
    problems.push(`githubRepo must look like <owner>/<repo>, exact case as on GitHub (got "${githubRepo}").`);
  }

  const wafRateLimit = integer('wafRateLimit', WAF_LIMIT_MIN, WAF_LIMIT_MAX);
  const contactRateLimit = integer('contactRateLimit', WAF_LIMIT_MIN, WAF_LIMIT_MAX);

  if (problems.length > 0) throw new ConfigError(problems);

  return {
    primaryDomain,
    apexDomain,
    dnsProvider: dnsProvider as DnsProvider,
    contactToAddress,
    contactFromAddress,
    githubRepo,
    githubRepoIsPlaceholder,
    wafRateLimit,
    contactRateLimit,
  };
}
