/**
 * cdk-nag's AWS Solutions pack over both stacks, in both DNS modes.
 *
 * bin/osep-website.ts registers the same pack, so any finding here would also
 * stop `cdk synth`/`cdk deploy`. These tests make the reason visible in CI and
 * hold the acknowledgments honest: every one must carry a specific reason, and
 * every one must still be needed (the second test turns them all off and checks
 * that exactly the acknowledged findings come back, no more and no fewer).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { App, Validations, type PolicyViolation } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import type { IConstruct } from 'constructs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineOsepStacks } from '../lib/website-stack';

const cdkContext = (
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cdk.json'), 'utf8')) as { context: Record<string, unknown> }
).context;

function synthesize(dnsProvider: string): App {
  const app = new App({ context: { ...cdkContext, dnsProvider, githubRepo: 'oseptoledo/osep-website' } });
  defineOsepStacks(app);
  app.synth();
  return app;
}

/** "AwsSolutions-S1 at OsepWebsiteStack/LogsBucket/Resource" for every violating resource. */
function findings(violations: readonly PolicyViolation[]): string[] {
  return violations
    .flatMap((v) => v.violatingResources.map((r) => `${v.ruleName} at ${(r as { constructPath?: string }).constructPath}`))
    .sort();
}

interface Acknowledgment {
  id: string;
  reason: string;
  path: string;
}

function acknowledgments(root: IConstruct): Acknowledgment[] {
  const result: Acknowledgment[] = [];
  for (const construct of root.node.findAll()) {
    for (const entry of construct.node.metadata) {
      if (entry.type !== Validations.ACKNOWLEDGED_RULES_METADATA_KEY) continue;
      for (const [id, reason] of Object.entries(entry.data as Record<string, string>)) {
        result.push({ id: id.replace(/^annotation::/i, ''), reason, path: construct.node.path });
      }
    }
  }
  return result;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(['route53', 'external'])('cdk-nag AwsSolutionsChecks, dnsProvider=%s', (dnsProvider) => {
  it('reports no unacknowledged finding of any level', () => {
    const app = synthesize(dnsProvider);
    const report = new AwsSolutionsChecks().validateScope(app);
    expect(findings(report.violations)).toEqual([]);
    expect(report.success).toBe(true);
  });

  it('acknowledges only findings that would otherwise fire, each with a specific reason', () => {
    const acknowledged = acknowledgments(synthesize(dnsProvider));
    expect(acknowledged.length).toBeGreaterThan(0);
    for (const ack of acknowledged) {
      expect(ack.reason.length, `${ack.id} at ${ack.path}`).toBeGreaterThanOrEqual(60);
      expect(ack.reason, ack.id).not.toMatch(/\b(TODO|TBD|later|not needed)\b/i);
    }

    vi.spyOn(Validations.prototype, 'acknowledge').mockImplementation(() => undefined);
    const bare = synthesize(dnsProvider);
    const report = new AwsSolutionsChecks().validateScope(bare);
    const firing = findings(report.violations).map((f) => f.split(' at ')[0]);
    expect([...new Set(firing)].sort()).toEqual([...new Set(acknowledged.map((a) => a.id))].sort());
  });
});
