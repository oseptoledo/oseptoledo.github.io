# CLAUDE.md

Orientation file for Claude Code sessions working in this repo. Read this first.

## What this is

The public website of the **Old South End Partnership** (OSE Partnership, OSEP): ten Toledo, Ohio organizations working together on housing in the Old South End. A one-page site in **English (`/`) and Spanish (`/es`)**, built from the design canvas Maria Iafelice (John Henry Eldred Jr. Foundation) made in September 2026.

OSEP is an independent organization with its own domain (`oseptoledo.org`), mailbox (`admin@oseptoledo.org`), AWS account and GitHub repository (the last two not created yet). Everything the site needs to build, test and deploy is in this repository.

React 19 + Vite 8 + TypeScript 6 + Tailwind CSS v4, prerendered to static HTML at build time and hydrated in the browser. Canonical URL `https://www.oseptoledo.org`. Hosting is AWS in the partnership's own account (S3 + CloudFront, plus a Lambda that emails contact-form messages through SES), defined as code in `infra/` and fed by `.github/workflows/deploy.yml`; see **Launch status**.

## Launch status (read before assuming anything is live)

**Not on AWS yet; no AWS account.** The code lives at GitHub `oseptoledo/oseptoledo.github.io` (organization `oseptoledo`, created 2026-10-10 from `@ladderuphousing`, contact email Tom's until it moves to Maria; JD and Maria not yet invited). Until AWS is live, `.github/workflows/pages.yml` publishes a **temporary, noindexed preview** to https://oseptoledo.github.io on every push to `main` (`scripts/make-preview.mjs` marks it noindex and disallows crawlers). Retire both when the AWS site is live (`docs/LAUNCH_CHECKLIST.md`).

- **Done in code, not deployed (2026-10-10):** `infra/`, the AWS CDK app (`OsepDnsStack`: the Route 53 zone; `OsepWebsiteStack`: S3, CloudFront, WAF, certificate, the strict CSP and other security headers, the canonical-host function, the contact-form Lambda and SES identity, the GitHub OIDC deploy role, alarms), and `.github/workflows/deploy.yml`, which skips itself until its three repository variables exist.
- **Waiting on people** (in runbook order; the decisions among them have owners and deadlines in the checklist): the domain's auto-renew and the GoDaddy account's safeguards, and the repository's visibility and GitHub plan; then the GitHub repository, before any other step, since the launch's own changes go through pull requests; the AWS account; choosing Route 53 or GoDaddy DNS, and copying GoDaddy's mail records into `infra/lib/dns-records.ts` before any name-server move; deploying the stacks; the repository's deploy variables and the first content deploy; who receives alarm emails (the SES production-access request names them as additional contacts); SES domain verification and production access (the sandbox's 200-a-day quota is shared by every visitor); the alarm subscriptions; an external uptime monitor; then switching the form on (`CONTACT_FORM_ENDPOINT` is `null`, so today the form opens the visitor's email app). Also a monthly infra upkeep owner, who pays from year two, Search Console / Bing verification, analytics, logo and photo permissions, and a privacy notice.

The ordered runbook is `infra/README.md`; the tracker is `docs/LAUNCH_CHECKLIST.md`.

## Workflow rules (non-negotiable)

- **Never commit or push to `main`** once the GitHub repo exists. Branch from `main`, open a PR, wait.
- **Never merge a PR.** A human presses merge. Owners are in `.github/CODEOWNERS`. Once the deploy workflow's variables are set, a merge to `main` deploys the site.
- **Copy changes land in both languages in the same PR.** See Conventions.
- **Never deploy infrastructure, and never touch AWS, without explicit in-turn authorization from a human for that exact command.** That means no `cdk deploy`, `cdk bootstrap`, `cdk destroy`, no `cdk diff` with credentials, and no `aws` CLI call. Claude edits `infra/`, runs the credential-free checks under Key commands, and hands a human the exact command to run, always with `--profile osep-website` (the CLI profile for the partnership's AWS account, `infra/README.md` step 1). Never put an account id, a profile or an AWS key in code or in an npm script. Full rules: `infra/CLAUDE.md`.
- **No inline styles or scripts in anything the site renders.** Production sends a CSP without `'unsafe-inline'`; see Conventions.
- Branch names: a type prefix (`feature/`, `fix/`, `content/`, `chore/`, `docs/`, `perf/`, `ci/`) plus a short lowercase hyphenated description. Table in `CONTRIBUTING.md`.

## Key commands

```bash
npm run dev      # local dev server on :5173 (/ and /es both work)
npm run build    # tsc --noEmit + vite build + scripts/prerender.mjs
npm run lint     # ESLint
npm test         # Vitest, including the served-HTML, hydration and CSP guards (needs a prior npm run build)
npm run preview  # serve the built dist/ on :4173 — the closest thing to production
```

Node 24 (`.nvmrc` says `24.20.0`; run `nvm use`). The machine's default Node may be older than `engines` allows.

`infra/` is a separate npm package (`osep-website-infra`) with its own lockfile; the root `package.json` knows nothing about it. None of these needs AWS access:

```bash
cd infra
npm ci
npm run build                            # tsc --noEmit
npm test                                 # Vitest (stacks, edge redirects, DNS records, settings, cdk-nag) + node --test (the contact Lambda)
npx cdk synth -c dnsProvider=route53     # both stacks, the Route 53 mode
npx cdk synth -c dnsProvider=external    # the GoDaddy-DNS mode
```

Name the mode on both synths: plain `npx cdk synth` takes `dnsProvider` from `cdk.json`, which the launch may set to `external` (`infra/README.md` step 4), and then never builds `OsepDnsStack`.

When Claude runs `cdk synth`, it switches every credential source off first, so the CDK CLI cannot look up an account with whatever profile happens to be on the machine (shown for the Route 53 mode; the external one is the same with `-c dnsProvider=external`):

```bash
env -u AWS_PROFILE -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN \
  AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null AWS_EC2_METADATA_DISABLED=true npx cdk synth -c dnsProvider=route53
```

Human only, with credentials, always inside `infra/` after `npm ci` there (the repository root has no `cdk.json` and no CDK CLI; `infra/README.md`, top of the runbook and Day to day; `<Stack>` is `OsepWebsiteStack` or `OsepDnsStack`):

- **Before merge, on the PR's branch** (`gh pr checkout <N>`): `npx cdk diff --profile osep-website`, the review diff pasted into the PR body. On `main` the change is not there yet, so a diff there shows nothing of it.
- **After merge, on an up-to-date `main`**: `npx cdk diff <Stack> --profile osep-website`, stopping on any `[-] AWS::Route53::RecordSet` line with `CarryOver` in its name (deploying would delete live mail records; `infra/README.md` step 6), then `npx cdk deploy <Stack> --profile osep-website`.

## PR testing standards

CI (`.github/workflows/ci.yml`) runs on every PR to `main`, on Node 24:

1. Job `check`: fails if a file in `public/` (other than `sitemap.xml`, `llms.txt`, `robots.txt`) changed in place (see Conventions, Images), then `npm ci`, `npm run lint`, `npm run build`, `npm test`.
2. Job `lighthouse` (needs `check`): `npm run build`, then `npm run lighthouse` = `lhci autorun` on `/` and `/es`, 3 runs each, desktop preset. Gates from `.lighthouserc.json`: performance and best-practices `minScore` 0.9; accessibility and SEO 0.95.
3. Job `infra` (in parallel with `check`): in `infra/`, `npm ci`, `npm run build`, `npm test`, `npx cdk synth -c dnsProvider=route53` and `npx cdk synth -c dnsProvider=external`. It runs on every PR, not only infra ones, because `infra/`'s tests depend on three site files: the contact Lambda's tests read `src/lib/contactForm.ts` and `src/content/copy.ts`, and `infra/test/canonical-host.test.ts` imports `src/paths.ts` (infra's `tsc` type-checks it, without the DOM library) and holds `normalizePath()` to `infra/functions/canonical-host.js`. Dependabot's `/infra` PRs get it too. It has no AWS access (no `id-token`, no credentials step, no secrets): synth renders the templates locally, with no context lookups and the account left unset, so it needs none. `cdk diff` does need the account, so a person still runs it (below).

Before pushing, run `npm run lint && npm run build && npm test`. To run Lighthouse locally without publishing reports to temporary public storage, use `npx lhci collect && npx lhci assert` rather than `npm run lighthouse`.

- Visual or copy changes: check `/` **and** `/es` in a browser at 375px and desktop widths, and say so in the PR body. Also check 320px if the header or hero changed: the header is tight below 360px (`Wordmark.tsx`).
- A new indexable route needs, in the same PR: a `ROUTES` entry and a `pages` entry in `src/entry-prerender.tsx`, a pathname branch in `src/Root.tsx`, a `public/sitemap.xml` entry (with hreflang alternates if it has a translation), a Key link in `public/llms.txt`, and a URL in `.lighthouserc.json`. `site-dates.test.ts` fails if the sitemap, `ROUTES` and the Key links disagree; `route-registry.test.tsx` fails if `Root` and the registry render different pages for a path. The prerender only accepts single-segment lowercase paths (it derives S3 keys from them).
- An `infra/` change (or a change to `src/lib/contactForm.ts`, `src/content/copy.ts` or `src/paths.ts`): run `npm run build`, `npm test` and both synths in `infra/` before pushing (CI's `infra` job repeats them on the PR). For an `infra/` change, also ask a human to run `npx cdk diff --profile osep-website` on the PR's branch, inside `infra/` after `npm ci` there (Key commands, above), and paste the output into the PR body (not needed for a Dependabot PR that changes only `infra/` development dependencies other than `aws-cdk`: `infra/README.md`, Day to day, Monthly infra upkeep). Say in the PR which stack a person must deploy after merge, and whether it has to go before or after the site change.

**Deploys.** `.github/workflows/deploy.yml` runs on every push to `main` except one that only touches `infra/**`, `**/*.md` or `docs/**`, and by hand (Actions > Deploy > Run workflow, branch `main`). One job builds and tests again with read-only repository access and hands `dist/` to a second job, which alone can request the OIDC token for the deploy role and runs no npm code. That job ships in a fixed order: upload new files without deleting anything; upload the pages and `sitemap.xml`, `llms.txt`, `robots.txt` with short cache lifetimes; invalidate those paths in CloudFront and wait; only then delete what the build no longer produces. Every S3 key it names comes from `dist-ssr/route-manifest.json`, and it fails closed if that file is missing or partial. It is skipped, not failed, until the repository variables `AWS_ROLE_ARN`, `S3_BUCKET_NAME` and `CLOUDFRONT_DISTRIBUTION_ID` are set. It never touches `infra/`: infrastructure is deployed by a person.

## Repo map

| Path | What lives there |
|---|---|
| `src/content/` | **Everything the site says.** `copy.ts` (`COPY.en` / `COPY.es`, typed by `SiteCopy`), `partners.ts` (the ten partners, logos, blurbs, `FUNDER_IDS`), `timeline.ts` (milestones), `horizon.ts` (What's Next cards), `news.ts` (press, plus `formatDate`), `stats.ts` (figures and `STATS_AS_OF`), `images.ts` (photos with intrinsic sizes and per-language alt), `brand.ts` (ribbon-mark geometry and colors) |
| `src/components/` | One component per page section (`Hero`, `About`, `PilotZone`, `Partners`, `Progress`, `Horizon`, `News`, `Contact` + `ContactForm`, `PoweredBy`, `Footer`), plus `Navbar` (sticky header, mobile menu dialog), `LanguageToggle`, `BrandMark`, `Wordmark`, `RibbonBand`, `SiteImg`, `ErrorBoundary`/`ErrorFallback` |
| `src/pages/` | `Home.tsx` (`HomeEnglish`, `HomeSpanish`: the one page, per language), `NotFound.tsx` (bilingual 404), `pageMeta.ts` (title, description, canonical, image alt per route) |
| `src/i18n/` | `locale.ts` (`Locale`, `LOCALES`, `LocaleContext`, `LOCALE_HOME_PATH`), `useCopy.ts` |
| `src/lib/` | `contactForm.ts` (validation, `CONTACT_LIMITS`, the POST payload, `sha256Hex`, the mailto fallback; pure), `navigate.ts` (the mailto hand-off seam) |
| `src/constants/` | `site.ts` (`SITE_ORIGIN`, names, time zone), `contact.ts` (`CONTACT_EMAIL`, `CONTACT_FORM_ENDPOINT`: `null` until launch, then `'/api/contact'`) |
| `src/Root.tsx`, `src/paths.ts` | Path-based page selection (no router); `normalizePath` mirrors the edge's canonical-host function (`infra/functions/canonical-host.js`) |
| `src/entry-prerender.tsx` | The route registry (`ROUTES`) and build-time render. Read its purity note before touching render code |
| `src/hydrateApp.tsx`, `src/main.tsx` | Client entry: hydrates the prerendered HTML (`hydrateRoot`), or client-renders the empty `#root` that `npm run dev` serves |
| `src/hooks/` | `useModalA11y` (focus trap, Escape, scroll lock), `useHashScrollRestore` (cold loads of `/#section`) |
| `src/__tests__/` | See **Tests** below |
| `scripts/prerender.mjs` | Post-build: SSR each route into `dist/index.html`, `dist/es.html`, `dist/404.html`, patch each head (lang, title, canonical, og:locale, hreflang), preload the font, assert the output, write `dist-ssr/route-manifest.json` (what the deploy workflow reads) |
| `scripts/sitemap-urls.mjs` | Shared `<loc>` reader for `public/sitemap.xml` |
| `scripts/make-preview.mjs` | Temporary: turns the production `dist/` into the GitHub Pages preview (robots meta `noindex, nofollow` on every page, `robots.txt` disallows all; nothing inside `#root` changes). Run only by `pages.yml`, after the tests. Delete with `pages.yml` at AWS launch |
| `index.html` | HTML shell: English head values (overwritten per route by the prerender) and the JSON-LD `@graph` |
| `public/` | `robots.txt`, `sitemap.xml`, `llms.txt`, favicons, `images/` (WebP photos and logos, `og-image.jpg`, `osep-mark-512.png`). Nothing may go under `public/api/`: CloudFront sends `/api/*` to the Lambda |
| `infra/` | The AWS CDK app, its own npm package. `bin/osep-website.ts` (entry, runs cdk-nag), `lib/website-stack.ts` (`OsepWebsiteStack`, `defineOsepStacks()`, the CSP string), `lib/dns-stack.ts` + `lib/dns-records.ts` (`OsepDnsStack` and the records carried over from GoDaddy), `lib/config.ts` (the `cdk.json` settings), `functions/canonical-host.js` (CloudFront Function), `lambda/contact-form/` (`POST /api/contact`), `test/`. `README.md` is the human launch runbook; `CLAUDE.md` the inventory and agent rules |
| `.github/workflows/` | `ci.yml` (PR checks: the site, Lighthouse, and `infra/` build, tests and both synths), `deploy.yml` (site deploy on merge to `main`, OIDC, manifest-driven, two-phase), `pages.yml` (temporary GitHub Pages preview at https://oseptoledo.github.io: build, test, `scripts/make-preview.mjs`, publish; delete at AWS launch) |
| `.github/` | `CODEOWNERS`, `PULL_REQUEST_TEMPLATE.md`, `dependabot.yml` (root and `/infra` npm, GitHub Actions), `copilot-instructions.md` |
| `docs/` | `LAUNCH_CHECKLIST.md`, `brand-voice-guidelines.md`, `TECH_DEBT.md` |
| `.claude/` | `settings.json`, `launch.json` (`dev`, `preview`), `agents/pr-review-handler.md`, `scripts/copilot-loop.sh` |

## Tests

`npm test` runs, among others:

- `dist-html.test.ts`: reads the **built** `dist/*.html` (what a non-JS crawler gets) and asserts, per route: `<html lang>`, one `<title>`, description, one `<h1>` matching the route, canonical, hreflang set (or none on the noindex 404), social tags in the page's language, one parsable JSON-LD block, a real font preload, every `<img>` sized from its own file, no in-page link to a missing `#id`, no duplicate ids, and `method="post"` on every form (a submit before hydration must not put what a visitor typed in a URL, and so in CloudFront's logs).
- `csp-compat.test.ts`: reads the built `dist/*.html` and its linked CSS against the production CSP. Fails on any `style` attribute or `<style>` element, any inline `<script>` other than the JSON-LD block, any `on*` attribute or `javascript:` URL, any script, stylesheet, preload, icon or image that is not a root-relative URL on this origin, any `url()` in the CSS that is neither root-relative nor a non-font `data:` URI, `<object>`, `<embed>`, `<base>`, or a form posting off-site.
- `hydration.test.tsx`: hydrates every built page with the production tree, also as a visitor whose clock reads 2099, and fails on any mismatch.
- `contact-prehydration.test.tsx`: hydrates the built `/` and `/es` with values already in the form's controls (typed on a slow load, or restored by the browser) and fails if a later edit wipes them or the message sent loses them, both with the form off (the mailto fallback) and on (the POST to `/api/contact`). It pins `CONTACT_FORM_ENDPOINT` itself, so switching the form on (`infra/README.md` step 11) needs no test change.
- `route-registry.test.tsx`, `route-manifest.test.ts`: `Root`, `ROUTES` and the deploy manifest agree.
- `deploy-workflow.test.ts`: reads `.github/workflows/deploy.yml` as text (no build needed). The upload and prune steps' exclude lists are identical, each filled by the exact line `read -r -a PAGES <<< "$PAGE_KEYS"` right before it and the exact loop `for key in "${PAGES[@]}"`, and shield the live pages (two exact excludes per page, never a prefix), the metadata files and `api/*`; between each list and its sync runs only the pinned run-time check (every key in `$PAGE_KEYS`, split on its own, must be in the list by both exact excludes, or the step fails before touching the bucket); each step's one `aws s3 sync` (backslash continuations joined) syncs `dist/` to the bucket root and ends with `"${EXCLUDES[@]}"`, so a dropped or misspelled array, or a flag line missing its trailing backslash, fails it; the prune's sync is the upload's plus `--delete`, which appears once, after the invalidation has completed; and `ci.yml`'s rename check exempts exactly the files the deploy caches briefly. The Deploy workflow's build job runs it, so a prune broken in any of those ways stops the run that would execute it.
- `site-dates.test.ts`, `entity-graph.test.ts`, `llms.test.ts`: the sitemap, the JSON-LD and `llms.txt` match `src/content/` and each other.
- `content.test.ts`: partner and founding counts match the words in the copy, the timeline's fixed grid-rows class in `Progress.tsx` matches the milestone count, no empty strings in either language, "LadderUp" spelled as one word.
- `ContactForm.test.tsx`: validation, the mailto fallback, the exact POST body, the `x-amz-content-sha256` header against Node's own hash of the body sent, the form's real request accepted by the contact Lambda's own handler (`infra/lambda/contact-form/contact.mjs`, imported directly; typed in `src/__tests__/contact-lambda.d.ts`), failures keeping what the visitor typed, `CONTACT_EMAIL` equal to `contactToAddress` in `infra/cdk.json` (the inbox the Lambda delivers to), the submit button keeping focus (`aria-disabled`, not `disabled`) and refusing a second send while one is in flight, the honeypot, and `CONTACT_LIMITS` against the endpoint's 8 KB body cap.
- `images.test.tsx`, `Navbar.test.tsx`, `paths.test.ts`.

The tests that read `dist/` fail with an instruction if you have not built. The root Vitest collects only `src/**/*.test.{ts,tsx}` (`vite.config.ts`); `infra/` runs its own suites with `cd infra && npm test` (CI's `infra` job runs them on every PR). Its Lambda tests read `src/lib/contactForm.ts` and `src/content/copy.ts` to catch drift between the form and the endpoint, and `infra/test/canonical-host.test.ts` imports `src/paths.ts` to hold `normalizePath()` to the edge's `infra/functions/canonical-host.js`, so a change to any of those three files needs the `infra/` checks too.

## Conventions

- **Bilingual parity.** Every visible string has an `en` and an `es` value in `src/content/`. `SiteCopy` makes a missing key a type error. Spanish uses the formal "usted". Organization names, "Old South End", and "Rock the Block" are never translated. News headlines stay in English; the Spanish page marks them `lang="en"`. Voice and terminology: `docs/brand-voice-guidelines.md`.
- **Content modules are the source; the static files are checked copies.** Partner names and URLs, stats, milestones, What's Next and the press list also appear in `index.html` (JSON-LD) and `public/llms.txt`, because crawlers read those without running JavaScript. Edit the module, then the copies; the tests above fail until they match. Do not de-duplicate by generating them unless you also keep them static in `dist/`.
- **Published dates move together.** Any content change bumps one date in four places: both `<lastmod>`s in `public/sitemap.xml`, `Last updated:` in `public/llms.txt`, and `WebSite.dateModified` in `index.html` (`site-dates.test.ts`). A figure change also updates `STATS_AS_OF` (and `STATS_AS_OF_LABEL`) in `src/content/stats.ts` and the Key facts block in `llms.txt`.
- **Deterministic render.** The client hydrates; render must produce the same markup on the build machine and in every browser. No clock, randomness, `Intl`/`toLocaleString`, or `window`/`matchMedia` reads during render. The footer year is `__BUILD_YEAR__` (`vite.config.ts`). Dates are spelled by hand (`formatDate`).
- **Strict CSP: no inline styles, no inline scripts, nothing off-site.** CloudFront sends `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; ...` with no `'unsafe-inline'`, nonce or hash (`CONTENT_SECURITY_POLICY` in `infra/lib/website-stack.ts`). So: no `style` prop or attribute (use Tailwind classes; for a value that varies, choose between fixed classes), no `<style>` element, no inline executable `<script>` (the JSON-LD block is data and is fine), no `on*` attribute or `javascript:` URL, and no third-party script, font, image or API. A violation looks fine in `npm run dev`, `npm run preview`, jsdom and Lighthouse, none of which send the CSP, and breaks only in production; `csp-compat.test.ts` is the local check. Changing the policy (analytics, an embed) means editing `CONTENT_SECURITY_POLICY`, its literal in `infra/test/website-stack.test.ts` and `csp-compat.test.ts` together, and deploying `OsepWebsiteStack` in step with the site change.
- **The contact endpoint is the same-origin path `/api/contact`.** `CONTACT_FORM_ENDPOINT` stays `null` until SES is verified and out of the sandbox and the smoke tests pass (`infra/README.md` steps 8 and 10; the switch itself is step 11), then becomes `'/api/contact'`, never a full URL: CloudFront routes `/api/*` on the site's own host to the Lambda's function URL through Origin Access Control, so `connect-src 'self'` covers it and there is no CORS. The function URL is `AWS_IAM`-only, and OAC signs a POST with the body hash the browser sends, so `ContactForm` serializes the payload once and sends that exact string with `x-amz-content-sha256` = its lowercase hex SHA-256 (`sha256Hex`); a missing or wrong hash is refused before the Lambda runs. The request and response contract is documented at the top of `infra/lambda/contact-form/contact.mjs`. A change to fields or limits lands in `src/lib/contactForm.ts` and `contact.mjs` in the same PR. The Lambda's tests fail when key names, limits, the email pattern or the English labels drift, and `ContactForm.test.tsx` (root suite, so CI runs it) sends the form's real request through the Lambda's `createHandler()`, so it fails when a value's shape drifts.
- **Design tokens** live in the `@theme` block of `src/index.css` (Tailwind v4, CSS-first, no config file). Tailwind's default palette is switched off: use `brick`, `marigold`, `lagoon`, `ink`, `cream`, `stone`, etc. Shared component classes (`site-container`, `eyebrow`, `section-title`, `btn`, `btn-ink`, `btn-outline`, `btn-brick`, `text-link`) are there too.
- **Images** are WebP under `public/images/` with intrinsic sizes declared in `src/content/images.ts` or `partners.ts`. A changed image needs a new filename (`-v2`): the deploy uploads everything outside the pages and the three metadata files as immutable for a year (ci.yml's `check` job enforces this for every file in `public/`). If one ever slips through after launch, a person with AWS access invalidates that one path in CloudFront (inside the free 1,000 paths a month) and it is renamed anyway, because browser caches cannot be recalled. Only the hero photo loads at high priority; everything below the fold is `loading="lazy"`.
- **Accessibility.** Skip link, one `<h1>` per page, a heading per section, real buttons and links, a focus-trapped menu dialog, 44px touch targets, visible focus rings (cobalt on light, marigold inside `.on-dark` sections), alt text per language, form errors announced and linked with `aria-describedby`.
- **No analytics yet, and no external error tracking.** `ErrorBoundary` logs to the console only. If analytics are added, name events with a `{ event, location }` dataLayer taxonomy (what happened, and which page section it happened in), document them in a `docs/ANALYTICS_EVENTS.md`, and change the CSP with them.

## Gotchas

- **`npm run dev` serves the English template for every path**, so `/es` in dev has `<html lang="en">` in the served head (Home fixes it in an effect) and English meta tags. Check heads against `npm run preview`.
- **`vite preview` falls back to `index.html` for unknown paths**, so `/some-typo` in preview shows a hydration error and the homepage flashing to NotFound. Production (CloudFront serving `404.html`) does not; check the 404 page at `/404.html`.
- **Nothing local sends the CSP.** Dev, preview and Lighthouse all run without it. Rely on `csp-compat.test.ts` after a build, and on the smoke tests in `infra/README.md` step 10 after a deploy.
- **Nothing local serves `/api/contact`.** Once `CONTACT_FORM_ENDPOINT` is set, a submission from `npm run dev` or `npm run preview` reports a failed send. The request itself is covered by `ContactForm.test.tsx` (fetch is stubbed); end to end, test on the deployed site.
- **The edge's 404 mapping covers `/api/*` too.** CloudFront replaces any 404 with the HTML `404.html`, so the Lambda never answers 404 (an unknown `/api/*` path gets a JSON 400) and the form treats any non-2xx as a failed send.
- **The mobile menu must close before it jumps.** Menu links prevent the default jump, close the dialog, and change the hash on the next task; jumping while the scroll lock is on lands short of the section (`Navbar.tsx`).
- **Narrow phones.** Below 360px the header hides "Partnership" and the hero headline shrinks, or "organizaciones" overflows and the page scrolls sideways. `body { overflow-x: clip }` is a safety net, not a fix.
- **CI checks `infra/` but cannot diff it.** The `infra` job builds, tests and synthesizes with no AWS access, so a green run means the CDK app compiles, passes its tests and cdk-nag, and synthesizes in both DNS modes; it says nothing about what a deploy would change in the live account. The `cdk diff` a person runs on the PR's branch and pastes into the PR body is the only view of that before merge.
- **`infra/` synth warnings are deliberate** until a human acts: the empty `lib/dns-records.ts` and the `githubRepo` placeholder (`OWNER/REPO`) in `infra/cdk.json`. The deploy role's trust comes from the value `OsepWebsiteStack` was last deployed with, not from what `cdk.json` says: until it is deployed with the real `githubRepo` (`infra/README.md` step 6, which passes `-c githubRepo=...`), the role refuses every GitHub token. The value then goes into `cdk.json` in a PR so later deploys keep it (only `cdk.json`: `DEFAULT_CONTEXT` in `lib/config.ts` keeps the placeholder, and the config test accepts any valid `githubRepo` or `dnsProvider` in `cdk.json`); a deploy with the placeholder would bring the Deny back.

## Where to look next

| Topic | File |
|---|---|
| Stack, hosting overview, project tree, design tokens, editing content | `README.md` |
| Build facts and settled patterns, for automated reviewers | `AGENTS.md` |
| Branch naming, commit style, PR flow | `CONTRIBUTING.md` |
| What is left before launch | `docs/LAUNCH_CHECKLIST.md` |
| The launch runbook: AWS account, DNS, deploys, SES, GitHub variables, alarms, smoke tests | `infra/README.md` |
| Every AWS resource, why it is built that way, and the rules for agents in `infra/` | `infra/CLAUDE.md` |
| The contact endpoint's request and response contract | `infra/lambda/contact-form/contact.mjs` (header comment) |
| Voice and Spanish terminology | `docs/brand-voice-guidelines.md` |
| Deferred review follow-ups | `docs/TECH_DEBT.md` |
| Licenses and provenance of fonts, icons, logos and photos | `THIRD_PARTY_NOTICES.md` |
