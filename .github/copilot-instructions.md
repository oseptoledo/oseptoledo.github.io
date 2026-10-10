# AI Agent Instructions

**The canonical orientation is the root [`CLAUDE.md`](../CLAUDE.md)** (commands, repo map, conventions, launch status). Read it first, then [`AGENTS.md`](../AGENTS.md) for build facts and the house patterns that are settled decisions rather than review findings.

This file intentionally duplicates neither: a second copy of the same orientation is a drift channel. Branch naming, the PR flow and the test gates live in [`CONTRIBUTING.md`](../CONTRIBUTING.md).

Non-negotiables, restated once:

1. **Never push to `main` and never merge a PR.** Branch from `main`, open a PR, and let a human press merge.
2. **Every copy change lands in English and Spanish together.** Strings live in `src/content/` with an `en` and an `es` value; Spanish uses the formal "usted" and keeps organization names as they are.
3. **`src/content/` is the source; `index.html` JSON-LD and `public/llms.txt` are checked copies.** Change them together; the tests fail otherwise.
4. **Render must be deterministic** (no clock, randomness, `Intl`, or `window` reads during render): the client hydrates the prerendered HTML.
5. **Run `npm run lint`, `npm run build`, and `npm test` before pushing.** CI runs the same three plus Lighthouse on every PR, and job `infra` runs `npm run build`, `npm test`, `npx cdk synth -c dnsProvider=route53` and `npx cdk synth -c dnsProvider=external` inside `infra/` with no AWS access. For a change in `infra/`, `src/lib/contactForm.ts`, `src/content/copy.ts` or `src/paths.ts` (`infra/`'s tests read or import those three), run those four yourself before pushing too (credentials off: `CLAUDE.md`, Key commands); `cdk diff` needs credentials, so a person runs it.
6. **No inline styles, inline scripts or third-party resources in anything rendered.** Production sends a strict same-origin CSP with no `'unsafe-inline'`; `src/__tests__/csp-compat.test.ts` checks the built HTML.
7. **Never deploy infrastructure or call AWS.** No `cdk deploy`, `cdk bootstrap`, `cdk destroy`, credentialed `cdk diff` or `aws` command; hand a human the exact command with `--profile osep-website` (`infra/CLAUDE.md`).
