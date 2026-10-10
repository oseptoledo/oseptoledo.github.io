import * as fs from 'node:fs';
import * as path from 'node:path';
import { App } from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { readConfig } from '../lib/config';
import { EXISTING_RECORDS, validateCarryOverRecords, type CarryOverRecord } from '../lib/dns-records';
import { OsepDnsStack } from '../lib/dns-stack';
import { defineOsepStacks } from '../lib/website-stack';

const cdkContext = (
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cdk.json'), 'utf8')) as { context: Record<string, unknown> }
).context;

function dnsStack(records?: readonly CarryOverRecord[]) {
  const app = new App({ context: cdkContext });
  const stack = new OsepDnsStack(app, 'OsepDnsStack', { config: readConfig(app.node), records });
  return { stack, template: Template.fromStack(stack) };
}

// Plausible shapes for a GoDaddy-hosted mailbox; not oseptoledo.org's real values.
const SAMPLE: CarryOverRecord[] = [
  { type: 'MX', name: '@', values: [{ priority: 0, hostName: 'oseptoledo-org.mail.protection.outlook.com' }] },
  { type: 'TXT', name: '@', values: ['v=spf1 include:secureserver.net -all', 'MS=ms12345678'] },
  { type: 'TXT', name: '_dmarc', ttlSeconds: 600, values: ['v=DMARC1; p=none; rua=mailto:admin@oseptoledo.org'] },
  { type: 'CNAME', name: 'autodiscover', target: 'autodiscover.outlook.com' },
  { type: 'SRV', name: '_sip._tls', values: [{ priority: 100, weight: 1, port: 443, hostName: 'sipdir.online.lync.com' }] },
  { type: 'CAA', name: '@', values: [{ flag: 0, tag: 'issue', value: 'amazon.com' }] },
  { type: 'CNAME', name: 'ftp', target: 'oseptoledo.org' },
  { type: 'A', name: 'mail', values: ['203.0.113.10'] },
  { type: 'AAAA', name: 'mail', values: ['2001:db8::10'] },
];

describe('OsepDnsStack', () => {
  it('exists only when dnsProvider is route53, and then with termination protection', () => {
    const app = new App({ context: { ...cdkContext, dnsProvider: 'route53' } });
    const route53 = defineOsepStacks(app);
    expect(route53.dns?.terminationProtection).toBe(true);
    // The website stack writes records into the zone, so it deploys after it.
    const websiteArtifact = app.synth().getStackArtifact('OsepWebsiteStack');
    expect(websiteArtifact.dependencies.map((d) => d.id)).toContain('OsepDnsStack');
    const external = defineOsepStacks(new App({ context: { ...cdkContext, dnsProvider: 'external' } }));
    expect(external.dns).toBeUndefined();
  });

  it('creates a retained public zone for the apex (removed only if its first create fails) and outputs its name servers', () => {
    const { template } = dnsStack([]);
    template.hasResource('AWS::Route53::HostedZone', {
      Properties: { Name: 'oseptoledo.org.' },
      DeletionPolicy: 'RetainExceptOnCreate',
      UpdateReplacePolicy: 'Retain',
    });
    template.hasOutput('NameServers', {
      Value: { 'Fn::Join': [', ', { 'Fn::GetAtt': [Match.stringLikeRegexp('^HostedZone'), 'NameServers'] }] },
    });
    template.hasOutput('HostedZoneId', Match.anyValue());
    template.resourceCountIs('AWS::Route53::RecordSet', 0);
  });

  // Holds for the real list in lib/dns-records.ts either way: while it is
  // empty, synth must warn; once a person has copied GoDaddy's records in
  // (infra/README.md step 5a.2), this is the check that the copy is well-formed
  // and the warning is gone.
  it(
    EXISTING_RECORDS.length === 0
      ? 'warns loudly while lib/dns-records.ts is empty'
      : 'accepts the records copied into lib/dns-records.ts, without the empty-list warning',
    () => {
      const { stack } = dnsStack();
      const warnings = Annotations.fromStack(stack).findWarning('*', Match.stringLikeRegexp('Do NOT move'));
      if (EXISTING_RECORDS.length === 0) {
        expect(warnings).toHaveLength(1);
      } else {
        expect(validateCarryOverRecords(EXISTING_RECORDS, 'www')).toEqual([]);
        expect(warnings).toHaveLength(0);
      }
    },
  );

  it('creates each carried-over record at the right name, type and TTL', () => {
    const { stack, template } = dnsStack(SAMPLE);
    expect(Annotations.fromStack(stack).findWarning('*', Match.anyValue())).toHaveLength(0);
    const records = Object.values(template.findResources('AWS::Route53::RecordSet')).map((r: any) => r.Properties);
    const summary = records.map((r) => [r.Type, r.Name, r.TTL, r.ResourceRecords]).sort((a, b) => `${a[0]}${a[1]}`.localeCompare(`${b[0]}${b[1]}`));
    expect(summary).toEqual([
      ['AAAA', 'mail.oseptoledo.org.', '3600', ['2001:db8::10']],
      ['A', 'mail.oseptoledo.org.', '3600', ['203.0.113.10']],
      ['CAA', 'oseptoledo.org.', '3600', ['0 issue "amazon.com"']],
      ['CNAME', 'autodiscover.oseptoledo.org.', '3600', ['autodiscover.outlook.com']],
      ['CNAME', 'ftp.oseptoledo.org.', '3600', ['oseptoledo.org']],
      ['MX', 'oseptoledo.org.', '3600', ['0 oseptoledo-org.mail.protection.outlook.com']],
      ['SRV', '_sip._tls.oseptoledo.org.', '3600', ['100 1 443 sipdir.online.lync.com']],
      ['TXT', '_dmarc.oseptoledo.org.', '600', ['"v=DMARC1; p=none; rua=mailto:admin@oseptoledo.org"']],
      ['TXT', 'oseptoledo.org.', '3600', ['"v=spf1 include:secureserver.net -all"', '"MS=ms12345678"']],
    ]);
  });

  it('refuses to synthesize with a broken record list', () => {
    expect(() => dnsStack([{ type: 'CNAME', name: 'www', target: 'example.godaddysites.com' }])).toThrow(
      /lib\/dns-records\.ts has problems/,
    );
  });
});

describe('validateCarryOverRecords', () => {
  it('accepts the sample list', () => {
    expect(validateCarryOverRecords(SAMPLE, 'www')).toEqual([]);
  });

  it.each<[string, CarryOverRecord[], RegExp]>([
    ['a CNAME at the apex', [{ type: 'CNAME', name: '@', target: 'x.example.com' }], /cannot live at the zone apex/],
    ['a CNAME at www', [{ type: 'CNAME', name: 'www', target: 'x.example.com' }], /pointed at CloudFront by OsepWebsiteStack/],
    [
      'two rows for one name and type',
      [
        { type: 'TXT', name: '@', values: ['a'] },
        { type: 'TXT', name: '', values: ['b'] },
      ],
      /appears twice/,
    ],
    [
      'a CNAME sharing its name',
      [
        { type: 'CNAME', name: 'mail', target: 'x.example.com' },
        { type: 'TXT', name: 'mail', values: ['a'] },
      ],
      /can hold no other record/,
    ],
    ['a fully qualified name', [{ type: 'TXT', name: '_dmarc.oseptoledo.org.', values: ['a'] }], /relative to the apex/],
    ['an uppercase name', [{ type: 'TXT', name: 'Mail', values: ['a'] }], /relative to the apex, lowercase/],
    ['a target with a trailing dot', [{ type: 'CNAME', name: 'mail', target: 'x.example.com.' }], /without a trailing dot/],
    ["GoDaddy's '@' as a CNAME target", [{ type: 'CNAME', name: 'ftp', target: '@' }], /stands for the domain itself/],
    [
      "GoDaddy's '@' as an MX host",
      [{ type: 'MX', name: '@', values: [{ priority: 10, hostName: '@' }] }],
      /stands for the domain itself/,
    ],
    ['an A record at the apex', [{ type: 'A', name: '@', values: ['203.0.113.10'] }], /the apex is pointed at CloudFront/],
    [
      'an AAAA record at www',
      [{ type: 'AAAA', name: 'www', values: ['2001:db8::10'] }],
      /www is pointed at CloudFront by OsepWebsiteStack \(an A alias record, and no AAAA on purpose: the site is IPv4 only\)/,
    ],
    ['an A record that is not IPv4', [{ type: 'A', name: 'mail', values: ['2001:db8::10'] }], /not an IPv4 address/],
    ['an AAAA record that is not IPv6', [{ type: 'AAAA', name: 'mail', values: ['203.0.113.10'] }], /not an IPv6 address/],
    ['an empty A record', [{ type: 'A', name: 'mail', values: [] }], /at least one value/],
    ['a quoted TXT value', [{ type: 'TXT', name: '@', values: ['"v=spf1 -all"'] }], /without surrounding quotes/],
    ['an empty MX', [{ type: 'MX', name: '@', values: [] }], /at least one value/],
    ['a TTL under a minute', [{ type: 'TXT', name: '@', ttlSeconds: 5, values: ['a'] }], /at least 60/],
    [
      'an apex CAA that would block ACM',
      [{ type: 'CAA', name: '@', values: [{ flag: 0, tag: 'issue', value: 'letsencrypt.org' }] }],
      /ACM could not issue/,
    ],
  ])('rejects %s', (_what, records, message) => {
    expect(validateCarryOverRecords(records, 'www').join('\n')).toMatch(message);
  });
});
