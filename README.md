# Old South End Partnership website

The website of the **Old South End Partnership**: ten Toledo, Ohio organizations working together so Old South End neighbors can find, keep, and strengthen the homes they love.

- English: `https://www.oseptoledo.org/`
- Español: `https://www.oseptoledo.org/es`

Built from the design canvas Maria Iafelice (John Henry Eldred Jr. Foundation) created in September 2026. The site is maintained for the partnership by volunteers from its partner organizations, Tom Voutsos and JD Vougiouklakis.

**Status: built and tested locally; hosting is written as code ([`infra/`](infra/)) but not yet deployed.** What remains is in [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md), and the step-by-step launch runbook is [`infra/README.md`](infra/README.md).

## Stack

| Layer | Choice |
|---|---|
| UI | React 19, TypeScript 6 |
| Build | Vite 8, then `scripts/prerender.mjs` renders each page to static HTML |
| Styling | Tailwind CSS 4 (CSS-first tokens in `src/index.css`) |
| Font | Bricolage Grotesque (variable), self-hosted via Fontsource |
| Tests | Vitest 5, React Testing Library, jsdom |
| Quality gates | ESLint, Husky + lint-staged, Lighthouse CI (perf/best-practices ≥ 90, a11y/SEO ≥ 95) |
| Hosting | AWS S3 + CloudFront, with WAF and an ACM certificate, in the partnership's own account; defined with the AWS CDK in `infra/` (not yet deployed) |
| Contact form backend | AWS Lambda + Amazon SES behind `/api/contact` on the site's own origin (`infra/lambda/contact-form/`) |
| Deploys | GitHub Actions with OIDC, no stored AWS keys (`.github/workflows/deploy.yml`) |

## Getting started

```bash
nvm use            # Node 24.20.0 from .nvmrc
npm install        # also installs the pre-commit hook
npm run dev        # http://localhost:5173 and http://localhost:5173/es
```

The `# ...` notes after commands in this repository's docs are for reading. In a Mac terminal (zsh), run `setopt interactivecomments` once per window before pasting such lines, or zsh hands the notes to the command as arguments.

Before opening a PR:

```bash
npm run lint && npm run build && npm test
```

`npm run preview` serves the built site on `http://localhost:4173`; it is the closest local view of what will ship (prerendered HTML, per-language heads).

## How the site works

There is one page in two languages. `scripts/prerender.mjs` renders it twice at build time, into `dist/index.html` (English) and `dist/es.html` (Spanish), plus a bilingual `dist/404.html`, and gives each its own `<html lang>`, title, description, canonical link and social tags. Search engines and AI crawlers therefore receive complete HTML in the right language without running any JavaScript. In the browser, React then *hydrates* that HTML (adopts it instead of rebuilding it), which keeps the page fast; see `src/entry-prerender.tsx` for the one rule that makes this work: render must not depend on the clock, randomness, locale formatting or the window.

Search and AI-answer visibility:

- `hreflang` alternates on both pages and in the sitemap, so Google serves the right language.
- A JSON-LD entity graph in `index.html`: the partnership as an `Organization`, its ten `member` organizations, its two `funder`s, the `Place` it serves, the `WebSite` in both languages, and the press coverage as `NewsArticle`s.
- `public/llms.txt`: a plain-text summary for answer engines (ChatGPT, Claude, Perplexity), with every partner, milestone and story.
- `public/robots.txt` explicitly welcomes GPTBot, ClaudeBot, PerplexityBot, Google-Extended and CCBot.
- Tests that read the built HTML and fail if any of this regresses.

## Editing content

All of the site's words live in `src/content/`, each with an English and a Spanish version:

| To change | Edit | Also update |
|---|---|---|
| Headlines, section text, buttons, form labels | `src/content/copy.ts` | — |
| A partner (name, link, blurb, logo) | `src/content/partners.ts` | `index.html` JSON-LD, `public/llms.txt` Partners, the footer updates itself |
| A milestone | `src/content/timeline.ts` | `public/llms.txt` Milestones, and, when half the milestone count rounded up changes (10 to 11, 12 to 13...), the `md:grid-rows-[repeat(N,auto)]` class in `src/components/Progress.tsx`, with N that new number |
| A What's Next card | `src/content/horizon.ts` | `public/llms.txt` What's next |
| A news story | `src/content/news.ts` | `index.html` JSON-LD `NewsArticle`, `public/llms.txt` In the news |
| A headline figure | `src/content/stats.ts` (and `STATS_AS_OF`) | `public/llms.txt` Key facts |
| A photo | `public/images/` (new filename) and `src/content/images.ts` | — |

Then bump the published date (`public/sitemap.xml`, `public/llms.txt`, `WebSite.dateModified` in `index.html`) and run `npm test`: it names any copy you missed. Spanish voice and terms: [`docs/brand-voice-guidelines.md`](docs/brand-voice-guidelines.md).

## Images

The photos and logos came from the design canvas and were converted once with [sharp](https://sharp.pixelplumbing.com/): photos to WebP at quality 78 in two or three widths each (for `srcset`), logos to WebP at quality 90 with transparency kept, fitted to 440×240 (twice the largest card logo box). The social share image `og-image.jpg` is the Broadway storefronts photo cropped to 1200×630. `favicon.svg`, `favicon-48.png`, `apple-touch-icon.png` and `images/osep-mark-512.png` are rendered from the ribbon-mark geometry in `src/content/brand.ts`.

Width and height attributes come from `src/content/images.ts` and `partners.ts`; `images.test.tsx` and `dist-html.test.ts` read every file and fail if a declared size is wrong.

## Design tokens

Defined in the `@theme` block of `src/index.css` (Tailwind's default colors are switched off):

| Token | Hex | Use |
|---|---|---|
| `cream` | `#FBF6EC` | Page background |
| `ink` | `#211E1B` | Text; Pilot Zone and footer background |
| `line` | `#E6DDCB` | Borders |
| `stone` / `umber` | `#5A534C` / `#3D3833` | Secondary and body text |
| `sand` | `#D9D1C3` | Text on dark |
| `navy` / `navy-light` | `#1F3A5F` / `#29486F` | What's Next background and cards |
| `brick` | `#C8283C` | Primary accent, CTAs |
| `lagoon`, `marigold`, `plum`, `tangerine`, `cobalt`, `leaf` | `#1FA3A8`, `#F2B21B`, `#7A3FA0`, `#E86A2C`, `#2F54C4`, `#2E9E5B` | The ribbon mark; accents |

## Hosting

Everything runs in the partnership's own AWS account, in `us-east-1`, defined as code with the AWS CDK in [`infra/`](infra/). **None of it is deployed yet.** Meanwhile a temporary, noindexed preview of `main` is published to **https://oseptoledo.github.io** by `.github/workflows/pages.yml` (no CloudFront security headers there; the contact form uses its email-app fallback); it is retired when the AWS site goes live. [`infra/README.md`](infra/README.md) is the launch runbook, in order: the GitHub repository, creating the account, DNS, the first deploy, connecting GitHub Actions and the first content deploy, email, alarms, smoke tests, and switching the form on.

| Piece | What it does |
|---|---|
| S3 + CloudFront | A private, versioned bucket holds the built site; CloudFront serves it over HTTPS for `www.oseptoledo.org` and `oseptoledo.org`. An unknown URL gets a real 404 status with the prerendered bilingual `404.html` |
| Canonical URLs | A small CloudFront Function sends the bare domain, uppercase paths and trailing slashes to `https://www.oseptoledo.org/...` in a single 301. `src/paths.ts` mirrors it so `npm run dev` and `npm run preview` behave the same |
| Security headers | A strict Content-Security-Policy (everything from this origin; no inline styles or scripts anywhere), HSTS with preload, `nosniff`, no framing, a strict referrer policy and a Permissions-Policy that turns off camera, microphone, location, payment and USB |
| Firewall (WAF) | AWS's managed rule sets, plus rate limits per IP address: 10 contact-form requests per 5 minutes, and 2,000 requests of any kind per 5 minutes. It refuses IPv6, so the site is IPv4 only: one computer can hold millions of IPv6 addresses, and a per-address limit would never stop it |
| Contact form | `POST /api/contact`, on the site's own address, reaches a Lambda function that checks the message and emails it through Amazon SES to `admin@oseptoledo.org`, with Reply-To set to the visitor. It logs a request id and an outcome, never what anyone typed. Off until launch: until `CONTACT_FORM_ENDPOINT` in `src/constants/contact.ts` is set, the form opens the visitor's own email app instead |
| DNS | Either a Route 53 zone the stack manages (recommended; GoDaddy's existing mail records are copied over first) or records typed by hand at GoDaddy. The choice is `dnsProvider` in `infra/cdk.json` |
| Deploys | `.github/workflows/deploy.yml`. GitHub's OIDC token buys short-lived credentials for a role that can only update the site's bucket and refresh CloudFront, and only from `main`. No AWS keys are stored anywhere |
| Alarms | Email through SNS when CloudFront's error rates rise, when the contact form fails, throttles or errors, when it sends more than 20 messages in an hour (a script flooding it), or when SES records a bounce or complaint (a message that did not reach the inbox). They need traffic that reaches CloudFront, so they do not detect an unreachable site; an external uptime monitor does (`docs/LAUNCH_CHECKLIST.md`) |

At this site's traffic, expect roughly $12 to $14 a month, most of it the WAF (`infra/README.md`, "What it costs").

How changes reach the live site:

- **Site changes deploy themselves** when a PR merges to `main`: the workflow builds and tests, uploads new files, uploads the pages, refreshes CloudFront, waits for that to finish, and only then deletes files the new build no longer uses. Pages are revalidated on every request, `sitemap.xml`, `llms.txt` and `robots.txt` are cached for an hour, and everything else for a year, which is why a changed image needs a new filename (CI fails a PR that changes a file in `public/` in place). Until its three repository variables are set, the workflow skips itself.
- **Infrastructure changes never deploy themselves.** A PR that changes `infra/` carries the `cdk diff` of its own branch; after it merges, a person with access runs `npx cdk deploy <Stack> --profile osep-website` inside `infra/`, on an up-to-date `main` after `npm ci` there, once the diff there removes no carried-over DNS record (`infra/README.md`, Day to day).

To check the infrastructure code locally (no AWS access needed; CI's `infra` job runs the same commands on every pull request):

```bash
cd infra
npm ci
npm run build && npm test                 # type-check; stack, redirect, DNS, settings and Lambda tests
npx cdk synth -c dnsProvider=route53      # render the CloudFormation templates (Route 53 mode)
npx cdk synth -c dnsProvider=external     # and the GoDaddy-DNS mode
```

## Project tree

```
.
├── index.html                 HTML shell: head template + JSON-LD @graph
├── public/                    robots.txt, sitemap.xml, llms.txt, favicons, images/
├── scripts/
│   ├── prerender.mjs          SSR each route, patch heads, assert, write route manifest
│   ├── sitemap-urls.mjs       Shared sitemap reader (+ .d.mts types)
│   └── make-preview.mjs       Temporary: noindex the build for the GitHub Pages preview (+ .d.mts)
├── src/
│   ├── main.tsx, hydrateApp.tsx, Root.tsx, paths.ts, entry-prerender.tsx, index.css
│   ├── components/            One per page section, plus Navbar, LanguageToggle, BrandMark…
│   ├── content/               Everything the site says, in English and Spanish
│   ├── constants/             Site origin and names; contact email and form endpoint
│   ├── hooks/                 useModalA11y, useHashScrollRestore
│   ├── i18n/                  Locale type, context, useCopy
│   ├── lib/                   Contact-form logic, mailto hand-off
│   ├── pages/                 Home (EN/ES), NotFound, pageMeta
│   └── __tests__/             Vitest suites and helpers
├── infra/                     AWS CDK app, its own npm package (README.md is the launch runbook)
│   ├── bin/osep-website.ts    Entry point; runs cdk-nag on every synth
│   ├── lib/                   OsepWebsiteStack, OsepDnsStack, settings, records carried over from GoDaddy
│   ├── functions/             canonical-host.js (CloudFront Function)
│   ├── lambda/contact-form/   POST /api/contact: validate, email through SES
│   ├── test/                  Vitest suites + the Lambda's node --test suite
│   └── cdk.json               Settings (domains, DNS provider, contact addresses, GitHub repo, rate limits)
├── docs/                      LAUNCH_CHECKLIST, brand-voice-guidelines, TECH_DEBT
├── .github/                   CI and deploy workflows, CODEOWNERS, PR template, Dependabot
├── .claude/                   Claude Code settings, launch config, review agent
├── CLAUDE.md, AGENTS.md       Orientation for Claude Code and other agents
└── CONTRIBUTING.md, SECURITY.md, THIRD_PARTY_NOTICES.md
```
