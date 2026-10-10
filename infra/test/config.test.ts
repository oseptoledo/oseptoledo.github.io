import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, DEFAULT_CONTEXT, GITHUB_REPO_PLACEHOLDER, primaryLabel, readConfig } from '../lib/config';

const cdkJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cdk.json'), 'utf8')) as {
  app: string;
  context: Record<string, unknown>;
};

/** A stand-in for construct.node: only tryGetContext is used. */
const ctx = (values: Record<string, unknown> = {}) => ({ tryGetContext: (key: string) => values[key] });

const problemsOf = (values: Record<string, unknown>): readonly string[] => {
  try {
    readConfig(ctx(values));
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  return [];
};

/**
 * The two settings people decide during the launch and then record in cdk.json
 * by pull request (infra/README.md steps 4 and 6). From then on cdk.json holds
 * the decision, not the default, so they need only be valid there.
 */
const LAUNCH_DECISION_KEYS: readonly string[] = ['dnsProvider', 'githubRepo'];

describe('cdk.json', () => {
  it('carries the defaults documented in infra/README.md (Settings), so tests and the CLI build the same app', () => {
    for (const [key, value] of Object.entries(DEFAULT_CONTEXT)) {
      if (LAUNCH_DECISION_KEYS.includes(key)) continue;
      expect(cdkJson.context[key], key).toEqual(value);
    }
  });

  it('holds valid values for the launch decisions (dnsProvider, githubRepo), whether still the defaults or decided', () => {
    expect(problemsOf(cdkJson.context)).toEqual([]);
    for (const key of LAUNCH_DECISION_KEYS) expect(cdkJson.context, key).toHaveProperty(key);
  });

  it('runs the app through ts-node from bin/osep-website.ts', () => {
    expect(cdkJson.app).toBe('npx ts-node --prefer-ts-exts bin/osep-website.ts');
  });

  it('pins no AWS profile or account anywhere in the CDK config', () => {
    expect(cdkJson).not.toHaveProperty('profile');
    expect(JSON.stringify(cdkJson)).not.toMatch(/\b\d{12}\b/);
    const appKeys = Object.keys(cdkJson.context).filter((key) => !key.startsWith('@'));
    expect(appKeys.sort()).toEqual(Object.keys(DEFAULT_CONTEXT).sort());
  });
});

describe('package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')) as {
    name: string;
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
  };

  it('pins aws-cdk-lib to an exact version', () => {
    expect(pkg.dependencies['aws-cdk-lib']).toMatch(/^2\.\d+\.\d+$/);
  });

  it('has the contract scripts, none of which picks an AWS profile', () => {
    expect(pkg.name).toBe('osep-website-infra');
    expect(Object.keys(pkg.scripts).sort()).toEqual(['build', 'deploy', 'diff', 'synth', 'test']);
    expect(pkg.scripts.test).toBe('vitest run && node --test test/*.node-test.mjs');
    expect(JSON.stringify(pkg.scripts)).not.toMatch(/profile|AWS_/i);
  });
});

describe('readConfig', () => {
  it('returns the defaults when no context is set', () => {
    const config = readConfig(ctx());
    expect(config).toEqual({
      primaryDomain: 'www.oseptoledo.org',
      apexDomain: 'oseptoledo.org',
      dnsProvider: 'route53',
      contactToAddress: 'admin@oseptoledo.org',
      contactFromAddress: 'no-reply@oseptoledo.org',
      githubRepo: GITHUB_REPO_PLACEHOLDER,
      githubRepoIsPlaceholder: true,
      wafRateLimit: 2000,
      contactRateLimit: 10,
    });
    expect(primaryLabel(config)).toBe('www');
  });

  it('parses -c values, which always arrive as strings', () => {
    const config = readConfig(
      ctx({ wafRateLimit: '5000', contactRateLimit: '20', dnsProvider: 'external', githubRepo: 'Osep-Toledo/osep.website' }),
    );
    expect(config.wafRateLimit).toBe(5000);
    expect(config.contactRateLimit).toBe(20);
    expect(config.dnsProvider).toBe('external');
    expect(config.githubRepo).toBe('Osep-Toledo/osep.website');
    expect(config.githubRepoIsPlaceholder).toBe(false);
  });

  it.each([
    [{ dnsProvider: 'godaddy' }, /dnsProvider must be one of route53, external/],
    [{ primaryDomain: 'WWW.oseptoledo.org' }, /primaryDomain must be a lowercase hostname/],
    [{ primaryDomain: 'https://www.oseptoledo.org' }, /primaryDomain must be a lowercase hostname/],
    [{ primaryDomain: 'www.example.org' }, /must be a subdomain of apexDomain/],
    [{ primaryDomain: 'oseptoledo.org' }, /must be a subdomain of apexDomain/],
    [{ contactFromAddress: 'no-reply@example.org' }, /must be an address @oseptoledo\.org/],
    [{ contactToAddress: 'admin@oseptoledo.org, evil@example.org' }, /contactToAddress is not a plain email address/],
    [{ githubRepo: 'not a repo' }, /githubRepo must look like <owner>\/<repo>/],
    [{ githubRepo: 'https://github.com/a/b' }, /githubRepo must look like <owner>\/<repo>/],
    [{ wafRateLimit: 5 }, /wafRateLimit must be a whole number from 10/],
    [{ contactRateLimit: '1e3' }, /contactRateLimit must be a whole number/],
    [{ contactRateLimit: 2.5 }, /contactRateLimit must be a whole number/],
    [{ apexDomain: '' }, /apexDomain must be a non-empty string/],
    [{ apexDomain: ' oseptoledo.org' }, /leading or trailing whitespace/],
  ])('rejects %j', (values, message) => {
    const problems = problemsOf(values);
    expect(problems.join('\n')).toMatch(message);
  });

  it('reports every problem at once', () => {
    expect(problemsOf({ dnsProvider: 'x', wafRateLimit: 'lots', githubRepo: '??' })).toHaveLength(3);
  });

  it('accepts an inbox outside the apex (the SES policy then names that identity too)', () => {
    expect(problemsOf({ contactToAddress: 'osep.partnership@gmail.com' })).toEqual([]);
  });
});
