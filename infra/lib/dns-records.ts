/**
 * ============================================================================
 *  READ THIS BEFORE DEPLOYING OsepDnsStack OR TOUCHING NAME SERVERS AT GODADDY
 * ============================================================================
 *
 * oseptoledo.org already has live email: the admin@oseptoledo.org mailbox that
 * the AWS account, the GitHub account and the contact form's inbox all depend
 * on. That mail works today because of records in GoDaddy's DNS: MX (where mail
 * is delivered), TXT (SPF, DMARC, domain-verification strings), CNAME (DKIM
 * selectors, autodiscover) and possibly SRV.
 *
 * When the domain's name servers move from GoDaddy to the Route 53 zone that
 * OsepDnsStack creates, GoDaddy's records stop being served. Anything not
 * copied into EXISTING_RECORDS below BEFORE that switch simply disappears, and
 * the mailbox stops receiving mail (and may lose the password-reset path for
 * the very accounts you would use to fix it).
 *
 * So, in this order (infra/README.md step 5a has the commands):
 *   1. Export the zone at GoDaddy (DNS > Export zone file) and copy EVERY MX,
 *      TXT, CNAME, SRV and CAA record into EXISTING_RECORDS, and every A and
 *      AAAA record on a name other than the apex and www (an MX often points
 *      at `mail`, whose A record must come across too). Skip NS and SOA (the
 *      new zone has its own) and the apex/www A, AAAA or CNAME records
 *      (OsepWebsiteStack points those at CloudFront). A record of any other
 *      type has nowhere to go here: stop and have a maintainer add the type
 *      before going on. Check every copied name a person might open in a
 *      browser (email, webmail, ftp...) over HTTPS first: the site's HSTS
 *      header covers all subdomains (README step 5a.2).
 *   2. Deploy OsepDnsStack.
 *   3. `dig @<each new name server>` and confirm every copied name answers
 *      exactly what GoDaddy answers today.
 *   4. Only then change the name servers at GoDaddy.
 *
 * EXISTING_RECORDS is empty on purpose: the values are not known to this repo,
 * and inventing them would be worse than an empty list. The DNS stack still
 * synthesizes with it empty, so CI and tests work; deploying it empty and then
 * switching name servers is exactly the mistake this comment exists to prevent.
 *
 * Names are relative to the apex: '@' (or '') is oseptoledo.org itself,
 * '_dmarc' is _dmarc.oseptoledo.org. Lowercase. Targets (a CNAME's target, an
 * MX or SRV host) are full hostnames without a trailing dot: where GoDaddy
 * shows a target of '@', that means the domain itself, so write
 * 'oseptoledo.org' (GoDaddy's default `ftp CNAME @` is the usual case). One
 * entry per name and type:
 * GoDaddy lists, say, three apex TXT records as three rows, but Route 53 holds
 * them as ONE record with three values, so combine them into one entry.
 * validateCarryOverRecords() (used by dns-stack.ts) enforces all of this.
 * ============================================================================
 */

import { isIPv4, isIPv6 } from 'node:net';

/** Optional TTL in seconds; omitted means 3600 (one hour), GoDaddy's usual default. */
interface RecordBase {
  /** Relative to the apex: '@' or '' for the apex, 'autodiscover', '_dmarc', 'selector1._domainkey'. */
  readonly name: string;
  readonly ttlSeconds?: number;
}

export interface MxCarryOver extends RecordBase {
  readonly type: 'MX';
  readonly values: readonly { readonly priority: number; readonly hostName: string }[];
}

export interface TxtCarryOver extends RecordBase {
  readonly type: 'TXT';
  /** Each string is one TXT value, unquoted. Values over 255 characters are split automatically. */
  readonly values: readonly string[];
}

export interface CnameCarryOver extends RecordBase {
  readonly type: 'CNAME';
  /** The target hostname, without a trailing dot. */
  readonly target: string;
}

export interface SrvCarryOver extends RecordBase {
  readonly type: 'SRV';
  readonly values: readonly {
    readonly priority: number;
    readonly weight: number;
    readonly port: number;
    readonly hostName: string;
  }[];
}

/** An IPv4 address record, on a name other than the apex and www (e.g. `mail`). */
export interface ACarryOver extends RecordBase {
  readonly type: 'A';
  /** IPv4 addresses, e.g. '203.0.113.10'. */
  readonly values: readonly string[];
}

/** An IPv6 address record, on a name other than the apex and www. */
export interface AaaaCarryOver extends RecordBase {
  readonly type: 'AAAA';
  /** IPv6 addresses, e.g. '2001:db8::10'. */
  readonly values: readonly string[];
}

export interface CaaCarryOver extends RecordBase {
  readonly type: 'CAA';
  readonly values: readonly { readonly flag: number; readonly tag: 'issue' | 'issuewild' | 'iodef'; readonly value: string }[];
}

export type CarryOverRecord =
  | MxCarryOver
  | TxtCarryOver
  | CnameCarryOver
  | SrvCarryOver
  | CaaCarryOver
  | ACarryOver
  | AaaaCarryOver;

/**
 * The records copied from GoDaddy. EMPTY UNTIL A HUMAN FILLS IT FROM THE ZONE
 * EXPORT; see the comment at the top of this file. Example shapes (not real
 * values, do not uncomment as-is):
 *
 *   { type: 'MX', name: '@', values: [{ priority: 0, hostName: 'oseptoledo-org.mail.protection.outlook.com' }] },
 *   { type: 'TXT', name: '@', values: ['v=spf1 include:secureserver.net -all', 'some-verification=abc123'] },
 *   { type: 'TXT', name: '_dmarc', values: ['v=DMARC1; p=none; rua=mailto:admin@oseptoledo.org'] },
 *   { type: 'CNAME', name: 'autodiscover', target: 'autodiscover.outlook.com' },
 *   { type: 'CNAME', name: 'ftp', target: 'oseptoledo.org' },   // GoDaddy shows this target as '@'
 *   { type: 'A', name: 'mail', values: ['203.0.113.10'] },
 *   { type: 'SRV', name: '_sip._tls', values: [{ priority: 100, weight: 1, port: 443, hostName: 'sipdir.online.lync.com' }] },
 */
export const EXISTING_RECORDS: readonly CarryOverRecord[] = [];

/** The construct id and display name for a record: 'MX @', 'TXT _dmarc'. */
export function recordKey(record: CarryOverRecord): string {
  return `${record.type} ${normalizeName(record.name)}`;
}

/** '' and '@' both mean the apex; everything else is returned as given. */
export function normalizeName(name: string): string {
  return name === '' || name === '@' ? '@' : name;
}

/** A target given as GoDaddy's '@' shorthand, with a hint at what to write instead. */
function hostProblem(where: string, host: string, what = ''): string {
  if (host === '@' || host === '') {
    return `${where}: ${what}"${host}" stands for the domain itself; write the domain name instead (e.g. oseptoledo.org).`;
  }
  return `${where}: ${what}"${host}" is not a hostname (give it without a trailing dot).`;
}

const LABELS = /^(?:\*\.)?(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?)(?:\.[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?)*$/;
const HOST = /^(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
// Certificate authorities ACM issues through; a CAA set at the apex must allow
// one of them or ACM cannot issue the site's certificate.
const AMAZON_CAA = ['amazon.com', 'amazontrust.com', 'awstrust.com', 'amazonaws.com'];

/**
 * Returns every problem with the carry-over list (an empty array means fine):
 * malformed names, duplicate name+type pairs that Route 53 would reject, CNAMEs
 * that collide with other records, records at the names OsepWebsiteStack
 * manages (A/AAAA at the apex and www, a CNAME at either), malformed addresses
 * and targets, and a CAA set that would block ACM.
 *
 * @param primaryLabel the canonical host's label within the zone, e.g. 'www'
 */
export function validateCarryOverRecords(records: readonly CarryOverRecord[], primaryLabel: string): string[] {
  const problems: string[] = [];
  const seen = new Map<string, Set<string>>();

  for (const record of records) {
    const name = normalizeName(record.name);
    const where = recordKey(record);

    if (name !== '@' && !LABELS.test(name)) {
      problems.push(
        `${where}: name must be relative to the apex, lowercase, without a trailing dot ` +
          `(e.g. '_dmarc', not '_dmarc.oseptoledo.org.').`,
      );
    }
    if (record.ttlSeconds !== undefined && (!Number.isInteger(record.ttlSeconds) || record.ttlSeconds < 60)) {
      problems.push(`${where}: ttlSeconds must be a whole number of at least 60.`);
    }

    const types = seen.get(name) ?? new Set<string>();
    if (types.has(record.type)) {
      problems.push(`${where} appears twice. Route 53 keeps one record per name and type: combine the values.`);
    }
    types.add(record.type);
    seen.set(name, types);

    switch (record.type) {
      case 'CNAME':
        if (name === '@') problems.push(`${where}: a CNAME cannot live at the zone apex.`);
        if (name === primaryLabel) {
          problems.push(
            `${where}: ${primaryLabel} is pointed at CloudFront by OsepWebsiteStack (an A alias record); ` +
              'drop GoDaddy\'s CNAME for it.',
          );
        }
        if (!HOST.test(record.target)) problems.push(hostProblem(where, record.target, 'target '));
        break;
      case 'A':
      case 'AAAA':
        if (name === '@' || name === primaryLabel) {
          problems.push(
            `${where}: ${name === '@' ? 'the apex' : primaryLabel} is pointed at CloudFront by OsepWebsiteStack ` +
              `(an A alias record${record.type === 'AAAA' ? ', and no AAAA on purpose: the site is IPv4 only' : ''}); ` +
              `drop GoDaddy's ${record.type} record for it.`,
          );
        }
        if (record.values.length === 0) problems.push(`${where}: needs at least one value.`);
        for (const value of record.values) {
          const valid = record.type === 'A' ? isIPv4(value) : isIPv6(value);
          if (!valid) problems.push(`${where}: "${value}" is not an ${record.type === 'A' ? 'IPv4' : 'IPv6'} address.`);
        }
        break;
      case 'MX':
      case 'SRV':
        if (record.values.length === 0) problems.push(`${where}: needs at least one value.`);
        for (const value of record.values) {
          if (!HOST.test(value.hostName)) problems.push(hostProblem(where, value.hostName));
          if (!Number.isInteger(value.priority) || value.priority < 0 || value.priority > 65535) {
            problems.push(`${where}: priority ${value.priority} is out of range.`);
          }
        }
        break;
      case 'TXT':
        if (record.values.length === 0) problems.push(`${where}: needs at least one value.`);
        for (const value of record.values) {
          if (/^".*"$/.test(value)) problems.push(`${where}: give TXT values without surrounding quotes.`);
        }
        break;
      case 'CAA':
        if (record.values.length === 0) problems.push(`${where}: needs at least one value.`);
        if (name === '@') {
          const issuers = record.values.filter((v) => v.tag === 'issue').map((v) => v.value.toLowerCase());
          if (issuers.length > 0 && !issuers.some((v) => AMAZON_CAA.some((ca) => v.startsWith(ca)))) {
            problems.push(
              `${where}: no "issue" value allows Amazon (${AMAZON_CAA.join(', ')}), so ACM could not ` +
                'issue the site certificate. Add 0 issue "amazon.com".',
            );
          }
        }
        break;
    }
  }

  for (const [name, types] of seen) {
    if (types.has('CNAME') && types.size > 1) {
      problems.push(`CNAME ${name}: a name with a CNAME can hold no other record (also has ${[...types].join(', ')}).`);
    }
  }

  return problems;
}
