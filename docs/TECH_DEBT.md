# Tech debt

Deferred follow-ups from PR review, newest first. Launch decisions are not tracked here; they live in `docs/LAUNCH_CHECKLIST.md`. A resolved entry stays in place, struck through, with a `Resolved YYYY-MM-DD:` line saying what fixed it.

Entry format:

```
## YYYY-MM-DD: short title
- Source: PR comment URL (or "initial build")
- Location: file:line
- Summary: what is wrong or missing
- Proposed fix: what to do
- Why deferred: why not now
```

## ~~2026-10-10: CI does not build, test or synth `infra/`~~
- Resolved 2026-10-10: job `infra` in `.github/workflows/ci.yml` runs `npm ci`, `npm run build`, `npm test`, `npx cdk synth -c dnsProvider=route53` and `npx cdk synth -c dnsProvider=external` in `infra/` on every PR to `main` (Dependabot's `/infra` PRs included), on Node 24, in parallel with `check`, with `contents: read` only: no `id-token`, no AWS credentials, no secrets.
- ~~Source: initial build~~
- ~~Location: `.github/workflows/ci.yml`~~
- ~~Summary: CI runs only the root package (lint, build, test, Lighthouse). `infra/`'s type-check, its Vitest and `node --test` suites, and `cdk synth` (which also runs cdk-nag) run only when a contributor remembers, and Dependabot's `/infra` PRs arrive with no infra check at all. The Lambda's drift tests also read `src/lib/contactForm.ts` and `src/content/copy.ts`, so a site-only PR can break them unnoticed.~~
- ~~Proposed fix: a CI job on Node 24 running `npm ci && npm run build && npm test && npx cdk synth && npx cdk synth -c dnsProvider=external` in `infra/`, on every PR (or at least those touching `infra/**`, `src/lib/contactForm.ts` or `src/content/copy.ts`). It needs no AWS credentials and no `id-token` permission.~~
- ~~Why deferred: the CI workflow was outside the scope of the hosting build; until then the gates are listed in `CONTRIBUTING.md` and the PR template.~~

## 2026-10-10: A contact message refused by WAF or by the size cap gets only the generic failure message
- Source: initial build
- Location: `infra/lib/website-stack.ts` (WAF rules), `src/components/ContactForm.tsx`
- Summary: AWS's Common rule set inspects request bodies, so a genuine message containing script-like or path-like text (`<script>`, `../../`) can be blocked by WAF with a 403 before it reaches the Lambda. A body over 8,192 bytes gets a 413 from the Lambda (the rule set's own 8 KB body rule is set to count, so it does not turn that into a 403). Ordinary English or Spanish stays under the cap even at every field's limit; only unusual text crosses it within the form's character limits, such as a long message made mostly of accented letters, quotes, backslashes or emoji, or a three-byte script. Either way the form shows its generic "could not send" message with the email address and keeps what the visitor typed, so nothing is lost, but they are not told why.
- Proposed fix: after launch, check WAF's sampled requests and the Common rule set's metrics for blocks on `/api/contact`. If real messages are being blocked, override the body rules that fire (for example `CrossSiteScripting_BODY`, `GenericLFI_BODY`) to count instead of block, scoped to that path. Optionally add a localized "message too long" text for a 413 (new copy in both languages).
- Why deferred: needs real traffic to judge, and the fallback already keeps the message.

## 2026-10-09: Spanish page in `npm run dev` serves English head tags
- Source: initial build
- Location: `index.html`, `src/pages/Home.tsx`
- Summary: the dev server serves the English template for `/es`, so the title, description and canonical in dev are English (the `<html lang>` is corrected in an effect). Production and `npm run preview` are correct, because the prerender writes `dist/es.html` with its own head.
- Proposed fix: a small Vite dev-server middleware that applies `src/pages/pageMeta.ts` to the template per path, or setting `document.title` in an effect.
- Why deferred: affects local development only; the tests that matter read the built output.
