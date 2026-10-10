# Contributing

How a change gets from a branch to the live site. `CLAUDE.md` is the orientation file (repo map, conventions, launch status); this is the short workflow guide you read before opening a PR. It applies to human and AI-assisted contributions alike, and to partnership staff editing copy as much as to developers.

## Getting started

- Node 24 and npm. `.nvmrc` pins `24.20.0`, so `nvm use` works.
- `npm install` installs dependencies and the Husky pre-commit hook.
- `npm run dev` serves the site at `http://localhost:5173` (English) and `http://localhost:5173/es` (Spanish).

## Branch naming

Branch from `main`, with a type prefix and a short lowercase, hyphen-separated description:

| Prefix | Use for |
|---|---|
| `feature/` | New functionality or sections |
| `fix/` | Bug fixes |
| `content/` | Copy, partner, milestone or news updates |
| `chore/` | Tooling, dependencies, config |
| `docs/` | Documentation only |
| `perf/` | Performance work |
| `ci/` | Workflow and pipeline changes |

## Commit messages and PR titles

Plain imperative subject line, capitalized, no trailing period: `Add the October milestone in both languages`. PR titles take no Conventional Commit prefix. Reference issues in the PR body (`Closes #N`, `Refs #N`).

## PR flow

1. Branch from `main`. Never push to `main` directly.
2. Run the test gates below.
3. Open a PR against `main` and fill out `.github/PULL_REQUEST_TEMPLATE.md`. CI runs `check` and then `lighthouse` for the site, and `infra` (the CDK app's build, tests and both synths) alongside `check`.
4. Address every review comment, human or bot: fix it, or reply with the reason you are declining. Defer legitimate out-of-scope items to `docs/TECH_DEBT.md`.
5. A code owner other than the author approves (`.github/CODEOWNERS`). Push fixes before asking for review: the ruleset dismisses an approval when new commits arrive, and whoever pushed last cannot approve, so a reviewer suggests changes rather than pushing to someone else's branch (`infra/README.md` step 0).
6. CI green before merge. The ruleset requires the `check` and `infra` checks (`infra/README.md` step 0.3); `lighthouse` is not required, so read it too, and an admin merging by bypass skips all of them. A human merges; agents never merge.
7. What merging does: a merge to `main` deploys the site through `.github/workflows/deploy.yml` (once its repository variables are set; until then the job is skipped). A change confined to `infra/**`, Markdown or `docs/` does not trigger it. Infrastructure is never deployed by a merge: after an `infra/` PR merges, a person with access runs the deploy (see Infrastructure changes below).

## Test gates

Before pushing:

```bash
npm run lint && npm run build && npm test
```

The pre-commit hook runs `eslint --fix` on staged files; never bypass it with `--no-verify`. By change type:

- **Copy changes:** change English and Spanish together in `src/content/`. If the fact also appears in `index.html` (JSON-LD) or `public/llms.txt`, change those too; `npm test` names anything you missed. Bump the published date in `public/sitemap.xml` (both entries), `public/llms.txt` and `index.html` (`WebSite.dateModified`).
- **UI changes:** check `/` and `/es` in a browser at 375px and desktop widths (and 320px for header or hero changes), and attach screenshots of both languages.
- **New images:** WebP, a new filename for any changed image (the deploy caches them for a year; CI's `check` job fails a PR that changes any file in `public/` in place, other than `sitemap.xml`, `llms.txt` and `robots.txt`), intrinsic size declared next to it (`images.test.tsx` reads the file and checks).
- **New routes:** see `CLAUDE.md`, PR testing standards. Registry, `Root.tsx` branch, sitemap, `llms.txt`, Lighthouse URL, in one PR.
- **Anything rendered:** no `style` attributes, `<style>` elements, inline scripts, `on*` attributes or third-party URLs. The live site's Content-Security-Policy blocks them, and nothing local shows it; `csp-compat.test.ts` (part of `npm test`, after a build) does.
- **Contact-form fields or limits:** change `src/lib/contactForm.ts` and `infra/lambda/contact-form/contact.mjs` in the same PR, and run both test suites (`npm test` at the root, `npm test` in `infra/`). The Lambda's tests fail when field names, limits, the email pattern or the English labels disagree, and the root `ContactForm.test.tsx` sends the form's real request through the Lambda's handler, so it fails when a value's shape does.

### Infrastructure changes (`infra/`)

`infra/` is its own npm package. CI's `infra` job runs these gates on every PR; run them yourself before pushing too, so a red check is not the first you hear of a problem. (In a Mac terminal, run `setopt interactivecomments` before pasting command blocks with `# ...` notes, or zsh passes the notes to the commands as arguments.)

```bash
cd infra
npm ci
npm run build && npm test                  # type-check; Vitest suites + the contact Lambda node --test suite
npx cdk synth -c dnsProvider=route53       # Route 53 mode (both stacks)
npx cdk synth -c dnsProvider=external      # GoDaddy-DNS mode
```

Run these for a change to `src/lib/contactForm.ts`, `src/content/copy.ts` or `src/paths.ts` too: `infra/`'s tests read the first two (the contact Lambda's drift checks) and import the third (`normalizePath()` against the edge's `functions/canonical-host.js`). None of these needs AWS access (CI runs them with none at all), and both synths must succeed with only the expected warnings, until those are filled in: the empty `lib/dns-records.ts` (Route 53 synth only) and the `githubRepo` placeholder (both). cdk-nag runs inside every synth; fix a finding, or acknowledge it next to its resource with a specific reason.

CI cannot show what a change does to the live account; that needs credentials. So someone with access to the partnership's AWS account runs the diff **on the PR's branch**, inside `infra/` with the branch's own CDK installed, and pastes the output into the PR body. On `main` the change is not there yet, and without `npm ci` on the branch a Dependabot CDK bump is not either, so either way the diff would show nothing of it:

```bash
cd <the folder holding this repository>
gh pr checkout <number>                  # the PR's branch (its author can stay on it instead)
cd infra
npm ci                                   # the branch's own CDK
aws sso login --profile osep-website
npx cdk diff --profile osep-website      # both stacks
```

This runs the branch's code, and `npm ci` its dependencies' install scripts, with that person's AWS access, so they read the PR's `infra/` changes first.

After the PR merges, that person deploys from an up-to-date `main`, with `main`'s CDK installed (the repository root has no `cdk.json` and no CDK CLI; these are the commands at the top of `infra/README.md`'s runbook):

```bash
cd <the folder holding this repository>
git switch main && git pull
cd infra
npm ci                                   # main's own CDK: Dependabot bumps it monthly, and git pull does not reinstall it
npx cdk diff <Stack> --profile osep-website
npx cdk deploy <Stack> --profile osep-website
```

**Stop** if that diff shows a `[-] AWS::Route53::RecordSet` line with `CarryOver` in its name, unless removing that record is the point of the change: the checkout is missing records that are live in the zone, and deploying would delete them, mail records included (`infra/README.md` step 6). Read the IAM changes CDK lists before answering `y`. Say in the PR body which stack needs deploying and whether it must go before or after the matching site change (a CSP change, for example, ships with the site change that needs it). The full runbook, including the first deploy, is `infra/README.md`.

Dependabot's `infra/` PRs arrive once a month (security updates at any time, once the repository's Dependabot security updates setting is on: `infra/README.md` step 0.3), and the monthly upkeep owner (`docs/LAUNCH_CHECKLIST.md`) handles them (`infra/README.md`, Day to day, Monthly infra upkeep):

- A PR that changes the version of `aws-cdk-lib`, `aws-cdk` or `constructs` gets the diff above. If it shows changes, the same person deploys from `main` (above) in the week it merges; if it shows none, there is nothing to deploy.
- A PR that changes only other development dependencies (`vitest`, `typescript`, `ts-node`, `@types/node`, `cdk-nag`) does not change what the stacks create: CI's `infra` check is enough, with no credentialed diff and no deploy.
- In the first week of each month, the same person runs `npx cdk diff --profile osep-website` on an up-to-date `main` (after `npm ci` in `infra/`). It must show no differences. A difference is either a merged change nobody deployed or something live that `main` lacks (for example the real `githubRepo`, deployed in runbook step 6, before its PR merged), so read it before deploying anything. Deploy it only if a merged PR explains every change; if it undoes something (a removed `CarryOver` record, or `GithubDeployRole`'s trust going back to `OWNER/REPO` with a Deny), get `main` corrected instead (merge the `githubRepo` PR, for example) and diff again. Either way, before anything new merges to `infra/` (`infra/README.md`, Day to day, Monthly infra upkeep).

## Docs to update alongside code

| When you | Update |
|---|---|
| Add a top-level file, directory, or script | The project tree in `README.md`; the repo map in `CLAUDE.md` |
| Defer a review comment | `docs/TECH_DEBT.md`, newest first, in its entry format |
| Settle a launch decision | `docs/LAUNCH_CHECKLIST.md` (strike it through with the date and outcome) |
| Change an AWS resource, a stack output or a `cdk.json` setting | `infra/CLAUDE.md` (inventory) and `infra/README.md` (runbook) |
| Change the Content-Security-Policy | `CONTENT_SECURITY_POLICY` in `infra/lib/website-stack.ts`, its literal in `infra/test/website-stack.test.ts`, and `src/__tests__/csp-compat.test.ts`, together |
| Change the contact endpoint's request or responses | The header comment of `infra/lambda/contact-form/contact.mjs`, and `src/lib/contactForm.ts` |
| Change voice rules or Spanish terminology | `docs/brand-voice-guidelines.md` |

## Working with Claude and other AI agents

- Agent context lives in `CLAUDE.md` (canonical), `AGENTS.md`, and `.github/copilot-instructions.md`.
- `.claude/agents/pr-review-handler.md` runs the post-push review cycle: triage comments, fix, record deferrals, reply on threads. `.claude/scripts/copilot-loop.sh <PR>` forces a fresh Copilot review of the current HEAD.
- Agent-authored PRs follow the same flow as human PRs, including human approval and human merge.
- Agents never deploy and never call AWS: no `cdk deploy`, `cdk bootstrap`, `cdk destroy`, credentialed `cdk diff` or `aws` command. They run the credential-free checks above and hand a person the exact command, with `--profile osep-website`.
- Never paste secrets, personal information from contact-form messages, or AWS credentials into a prompt.
- AI may draft the code; the human who opens the PR owns every line.
