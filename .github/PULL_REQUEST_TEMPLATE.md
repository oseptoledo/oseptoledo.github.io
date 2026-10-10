## Summary (plain language)

<!-- 2-3 sentences a non-developer on the partnership can read: what changes on the site, who it is for, and why. File paths and jargon go under Changes. -->

## Linked issue

<!-- `Refs #N` or `Closes #N`. Delete this section for chores with no issue. -->

## Changes

-

## Test plan

CI (`.github/workflows/ci.yml`) runs job `check` (`npm run lint`, `npm run build`, `npm test`) then job `lighthouse` (`npm run lighthouse`), and job `infra` (`npm run build`, `npm test` and both `cdk synth` modes inside `infra/`, with no AWS access) alongside `check`. No CI job can run `cdk diff`. Tick what you ran locally:

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test` (after the build: includes the served-HTML, hydration and CSP guards)
- [ ] `npx lhci collect && npx lhci assert` (if perf- or a11y-sensitive UI changed; local Lighthouse without uploading reports to public storage, thresholds in `.lighthouserc.json`; CI runs `npm run lighthouse`)
- [ ] Browser check of `/` **and** `/es` via `npm run dev` or `npm run preview`, at phone (375px) and desktop widths (if anything visual changed; screenshots below)
- [ ] No `style` attributes, `<style>` elements, inline scripts or third-party URLs added (the production CSP blocks them; `csp-compat.test.ts` checks the build)
- [ ] Copy changed in **both** English and Spanish (`src/content/`), and in `public/llms.txt` / `index.html` JSON-LD if the fact appears there
- [ ] Published date bumped in `public/sitemap.xml`, `public/llms.txt` and `index.html` `WebSite.dateModified` (if page content changed)
- [ ] Contact-form fields or limits changed in **both** `src/lib/contactForm.ts` and `infra/lambda/contact-form/contact.mjs` (if either changed)
- [ ] `infra/`, `src/lib/contactForm.ts`, `src/content/copy.ts` or `src/paths.ts` changed: `npm run build`, `npm test`, `npx cdk synth -c dnsProvider=route53` and `npx cdk synth -c dnsProvider=external` pass inside `infra/` (its tests read or import those three site files; CI's `infra` job repeats them)
- [ ] `infra/` changed: `npx cdk diff --profile osep-website`, run by someone with access on this PR's branch, inside `infra/` after `npm ci` there (`CONTRIBUTING.md`, Infrastructure changes), pasted under Deploy impact (not needed when a Dependabot PR changes only `infra/` development dependencies other than `aws-cdk`)
- [ ] Docs updated: `CLAUDE.md` repo map, `README.md` project tree (if a file or directory was added); `infra/README.md` / `infra/CLAUDE.md` (if a resource, output or setting changed)

## Deploy impact

- **Site:** deploys automatically on merge, yes / no <!-- yes unless the PR only touches infra/**, *.md or docs/** (.github/workflows/deploy.yml; skipped until its repository variables are set) -->
- **Infrastructure:** none / `OsepWebsiteStack` / `OsepDnsStack` <!-- never deployed by CI or an agent: after merge, a person runs, on an up-to-date `main` with `main`'s CDK installed (`git switch main && git pull && cd infra && npm ci`, the commands at the top of infra/README.md's runbook), `npx cdk diff <Stack> --profile osep-website`, stops if it shows a `[-] AWS::Route53::RecordSet` line with `CarryOver` in its name (infra/README.md step 6), then runs `npx cdk deploy <Stack> --profile osep-website` -->
- **Order:** <!-- e.g. "deploy the stack before this merges" for a CSP change the site needs, or "no ordering". Delete if no infra change. -->

<!--
For an infra change, paste the `cdk diff` output from this PR's branch here:

<details><summary>cdk diff</summary>

```
```

</details>
-->

## Risk + rollback

- **Risk:** <!-- one line: what could break, who would see it -->
- **Rollback:** <!-- site: revert the PR (the next deploy restores the old files; the bucket also keeps old versions for 30 days). Infra: revert the PR and run `cdk deploy` again. -->

<!--
AI usage (optional). Replace this comment with a `## AI usage` heading plus one
line: which agent drafted what, and what you reviewed most closely.
-->

## Screenshots

<!-- Required for any user-visible change, English and Spanish. Delete this section otherwise. -->
