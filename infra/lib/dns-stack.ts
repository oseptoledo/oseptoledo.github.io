/**
 * OsepDnsStack: the Route 53 public hosted zone for oseptoledo.org, plus the
 * records carried over from GoDaddy. Created only when dnsProvider=route53.
 *
 * The zone is the only thing here. The records that point the site at
 * CloudFront, validate its certificate and sign its mail with DKIM are created
 * by OsepWebsiteStack, inside this zone, because they depend on resources that
 * stack owns. What this stack adds is everything the domain already relied on
 * before AWS existed, from lib/dns-records.ts: read that file's header first,
 * because the domain's live mailbox depends on it.
 *
 * Safety: the zone is retained (deleting the stack, or renaming the construct,
 * leaves the zone and its records serving), except when the stack's very first
 * create fails and rolls back, when there is nothing to keep and a leftover
 * zone would only be a second oseptoledo.org zone with other name servers to
 * confuse with the real one. defineOsepStacks() in lib/website-stack.ts turns
 * on termination protection for this stack.
 */
import { Annotations, CfnOutput, Duration, Fn, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import type { Construct } from 'constructs';
import { primaryLabel, type OsepConfig } from './config';
import {
  EXISTING_RECORDS,
  normalizeName,
  recordKey,
  validateCarryOverRecords,
  type CarryOverRecord,
} from './dns-records';

export interface OsepDnsStackProps extends StackProps {
  readonly config: OsepConfig;
  /** The carry-over records. Defaults to EXISTING_RECORDS; tests pass their own. */
  readonly records?: readonly CarryOverRecord[];
}

const DEFAULT_TTL = Duration.hours(1);

const CAA_TAGS: Record<'issue' | 'issuewild' | 'iodef', route53.CaaTag> = {
  issue: route53.CaaTag.ISSUE,
  issuewild: route53.CaaTag.ISSUEWILD,
  iodef: route53.CaaTag.IODEF,
};

export class OsepDnsStack extends Stack {
  public readonly zone: route53.PublicHostedZone;

  constructor(scope: Construct, id: string, props: OsepDnsStackProps) {
    super(scope, id, props);
    const { config, records = EXISTING_RECORDS } = props;

    const problems = validateCarryOverRecords(records, primaryLabel(config));
    if (problems.length > 0) {
      throw new Error(`lib/dns-records.ts has problems:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    }

    this.zone = new route53.PublicHostedZone(this, 'HostedZone', {
      zoneName: config.apexDomain,
      comment: `Old South End Partnership website and mail (${config.apexDomain}). Managed by infra/ (CDK).`,
    });
    // RetainExceptOnCreate: see the Safety note at the top of this file.
    this.zone.applyRemovalPolicy(RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE);

    for (const record of records) {
      this.addCarryOver(record);
    }

    if (records.length === 0) {
      Annotations.of(this).addWarningV2(
        'osep:dns:noCarryOverRecords',
        `OsepDnsStack carries no records over from GoDaddy (lib/dns-records.ts is empty). ` +
          `Do NOT move ${config.apexDomain}'s name servers to this zone until the GoDaddy MX/TXT/CNAME ` +
          'records are copied in, deployed, and checked with dig: the admin@ mailbox depends on them.',
      );
    }

    new CfnOutput(this, 'NameServers', {
      value: Fn.join(', ', this.zone.hostedZoneNameServers ?? []),
      description: `Set these four as ${config.apexDomain}'s name servers at GoDaddy, ONLY after dig confirms the carried-over MX/TXT records.`,
    });
    new CfnOutput(this, 'HostedZoneId', {
      value: this.zone.hostedZoneId,
      description: `Route 53 hosted zone id for ${config.apexDomain}.`,
    });
  }

  private addCarryOver(record: CarryOverRecord): void {
    const name = normalizeName(record.name);
    const common = {
      zone: this.zone,
      // undefined puts the record at the apex itself.
      recordName: name === '@' ? undefined : name,
      ttl: record.ttlSeconds === undefined ? DEFAULT_TTL : Duration.seconds(record.ttlSeconds),
      comment: 'Carried over from GoDaddy (lib/dns-records.ts)',
    };
    const id = `CarryOver ${recordKey(record)}`;

    switch (record.type) {
      case 'MX':
        new route53.MxRecord(this, id, { ...common, values: record.values.map((v) => ({ ...v })) });
        break;
      case 'TXT':
        new route53.TxtRecord(this, id, { ...common, values: [...record.values] });
        break;
      case 'CNAME':
        new route53.CnameRecord(this, id, { ...common, domainName: record.target });
        break;
      case 'SRV':
        new route53.SrvRecord(this, id, { ...common, values: record.values.map((v) => ({ ...v })) });
        break;
      case 'A':
        new route53.ARecord(this, id, { ...common, target: route53.RecordTarget.fromIpAddresses(...record.values) });
        break;
      case 'AAAA':
        new route53.AaaaRecord(this, id, { ...common, target: route53.RecordTarget.fromIpAddresses(...record.values) });
        break;
      case 'CAA':
        new route53.CaaRecord(this, id, {
          ...common,
          values: record.values.map((v) => ({ flag: v.flag, tag: CAA_TAGS[v.tag], value: v.value })),
        });
        break;
    }
  }
}
