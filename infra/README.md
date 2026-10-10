# OSEP website infrastructure

The AWS CDK app that hosts `https://www.oseptoledo.org`: a private S3 bucket behind CloudFront, a WAF, the contact form's Lambda and SES identity, the role GitHub Actions uses to deploy, and the alarms. Everything lives in the Old South End Partnership's own AWS account (created with `admin@oseptoledo.org`), region `us-east-1`.

This file is the launch runbook, written for the person who will run it. Do the steps in order. Every AWS command names `--profile osep-website` explicitly, so nothing can land in another account by accident. Agents working in this directory read [`CLAUDE.md`](CLAUDE.md) first.

| File | What it is |
|---|---|
| `bin/osep-website.ts` | Entry point. Builds the stacks and runs cdk-nag on every synth |
| `lib/config.ts` | Reads and checks the settings below |
| `lib/website-stack.ts` | `OsepWebsiteStack`: everything that serves the site and the form |
| `lib/dns-stack.ts`, `lib/dns-records.ts` | `OsepDnsStack`: the Route 53 zone and the records copied from GoDaddy |
| `functions/canonical-host.js` | The CloudFront Function that sends every URL to its one canonical form |
| `lambda/contact-form/` | The contact form's Lambda (its own tests: `test/contact-form.node-test.mjs`) |
| `test/` | Template, redirect, DNS, settings and cdk-nag tests |

## Settings

The defaults below are in `cdk.json` (`context`) and, for the tests, in `DEFAULT_CONTEXT` in `lib/config.ts`. Override one for a single command with `-c key=value`, but once you have decided a value, put it in `cdk.json` in a pull request, so every later deploy repeats it without anyone remembering a flag. That matters most for `dnsProvider` and `githubRepo`, the two decisions the launch makes (steps 4 and 6). For those two, change `cdk.json` only and leave `lib/config.ts` and the Default column below as they are: the tests accept any valid value for them in `cdk.json`. Changing any other default means changing four places together: `cdk.json`, `DEFAULT_CONTEXT`, the expected defaults written out in `test/config.test.ts` ("returns the defaults when no context is set"), and this table. `npm test` fails until the first three agree; the other tests read the value from `cdk.json`. For `contactToAddress`, also change `CONTACT_EMAIL` in `src/constants/contact.ts` (the form's mailto fallback and the address its error message shows) in the same pull request; a test in `src/__tests__/ContactForm.test.tsx` fails until the two match. The SES alarms name the inbox from `contactToAddress` themselves (deploy `OsepWebsiteStack` after the change, as for any `infra/` change), and this runbook calls it "the contact inbox", so neither needs editing. The exception is the domain: `primaryDomain` and `apexDomain` are also written out in other tests and across the site itself, so moving to another domain is a larger change.

| Key | Default | Meaning |
|---|---|---|
| `primaryDomain` | `www.oseptoledo.org` | The canonical host. Every other host 301s here |
| `apexDomain` | `oseptoledo.org` | The registered domain: hosted zone, certificate SAN, SES identity |
| `dnsProvider` | `route53` | `route53` (this app owns the zone) or `external` (DNS stays at GoDaddy, records typed by hand) |
| `contactToAddress` | `admin@oseptoledo.org` | Inbox the contact form delivers to |
| `contactFromAddress` | `no-reply@oseptoledo.org` | From address of those emails; must be on `apexDomain` |
| `githubRepo` | `OWNER/REPO` | `<owner>/<repo>` whose `main` branch may deploy. Synth warns while the placeholder is in use, and a stack deployed with it has a deploy role that refuses every GitHub token. Step 6 deploys with the real value; then it goes into `cdk.json` |
| `wafRateLimit` | `2000` | Requests per IP per 5 minutes, site-wide, before WAF blocks |
| `contactRateLimit` | `10` | Requests per IP per 5 minutes to `/api/contact` before WAF blocks |

## What it costs

Approximate list prices, us-east-1, October 2026; check the AWS pricing pages. At this site's traffic the bill is dominated by fixed monthly charges: WAF about $11 (web ACL plus six rules; the IP set the IPv6 rule uses costs nothing extra), Route 53 $0.50 per hosted zone, CloudWatch's eight alarms (nine alarm metrics, because the 4xx alarm's formula reads two) and two custom metrics about $1 (less inside CloudWatch's free tier, which covers ten alarm metrics; the SES bounce and complaint metrics the two SES alarms read are free). CloudFront, Lambda, S3 and SES usage sit inside free tiers or cost cents (SES is $0.10 per 1,000 emails). The external uptime monitor the launch checklist recommends is free. Expect roughly $12 to $14 a month. Set a budget alert in step 1.

To evaluate after a few months of real bills (the maintainers, together with the launch checklist's "Who pays from year two"):

- WAF is most of the bill, so check whether one of CloudFront's flat-rate pricing plans, which include WAF, fits this stack. Moving to one is a change to `lib/website-stack.ts` that goes through a pull request with a `cdk diff`.
- Check whether OSEP, or the organization that holds the account, is eligible for AWS's nonprofit credits through TechSoup.
- If AWS adds sales tax and that organization is exempt, upload its exemption certificate in Billing > Tax settings.

## Launch runbook

**Decisions this runbook waits on.** Some steps need a decision only the partnership can make. Each is an open item in [`docs/LAUNCH_CHECKLIST.md`](../docs/LAUNCH_CHECKLIST.md) with an owner and a deadline; check it is settled before starting the step it blocks:

| Checklist item | Needed before |
|---|---|
| Domain and GoDaddy account (Continuity) | step 0 |
| Repository visibility and GitHub plan | step 0.1 |
| Monthly infra upkeep owner | step 6 |
| Who receives messages, and from which address | step 7 (the email-app fallback goes live with the first content deploy) |
| Who receives alarm emails | step 8.2 (the production-access request names them as additional contacts, and cannot be edited while AWS reviews it), and step 9 |
| Uptime monitor | the day step 10 passes, before the site is announced |

**Pasting commands into a Mac terminal.** The Mac's default shell is zsh (`echo $SHELL` prints `/bin/zsh`). Unless told otherwise, zsh does not treat `# ...` at the end of a typed or pasted line as a note: it passes the words to the command, and several commands below then fail or get extra arguments. So, in every new terminal window, run this once before pasting anything from this file (or add the line to `~/.zshrc` to make it permanent):

```bash
setopt interactivecomments
```

**Run every deploy from an up-to-date `main`, inside `infra/`, with `main`'s own CDK installed.** Before each `cdk deploy` in this runbook (and later), and before the `cdk diff` you read right before it, wait for the pull request that changed `infra/` to merge, then, in a terminal:

```bash
cd <the folder holding this repository>
git switch main
git pull
cd infra
npm ci
```

These are "the commands at the top of this runbook" that later steps refer to. `npm ci` installs exactly the CDK library and CLI that `main`'s lockfile names (Dependabot bumps them once a month, and `git pull` alone does not reinstall them), so every deploy, and the diff before it, renders the same templates CI tested; it also covers a fresh clone, or a second person's computer, where step 2 never ran. It needs Node 24: if `node --version` prints anything else, run `nvm use` in the repository folder first. (The diff pasted into a pull request *before* it merges is the one exception: it runs on that pull request's branch, because on `main` the change is not there yet. See Day to day.)

Every `npx cdk ...` command in this runbook (`bootstrap`, `diff`, `deploy`, `synth`) runs inside `infra/`, which holds `cdk.json` and, once `npm ci` has run there, the pinned CDK CLI. If `npx cdk` asks "Need to install the following packages ... Ok to proceed?", answer `n` (it would download a copy outside the lockfile); if it stops with "npx canceled due to missing packages", the same applies. Either way, check `pwd`: if it does not end in `/infra`, `cd infra`; if it does, run `npm ci` there. Then run the command again. Steps often happen days apart, in new terminal windows, so check where you are before each one. The `aws`, `gh`, `dig` and `curl` commands work from any folder.

A deploy uses whatever checkout it runs from. `cdk deploy OsepWebsiteStack` also deploys `OsepDnsStack` whenever its template differs, and from a checkout whose `lib/dns-records.ts` lacks the records copied from GoDaddy (an old `main`, a fresh clone of an old commit, a branch cut before the records merged) it would delete them from the live zone, and with them the mail records `admin@oseptoledo.org` depends on. Step 6 says what to look for in the diff.

### 0. Before you start: tools, and the code on GitHub

You need: the `admin@oseptoledo.org` mailbox, the GoDaddy login for `oseptoledo.org`, a phone or security key for MFA, and on your computer Node 24 (`nvm use` in the repo root), `git`, the GitHub CLI `gh` (signed in with `gh auth login` as an admin of the repository), the AWS CLI v2, and `dig`. On a Mac, run `setopt interactivecomments` first (above).

Steps 5a and 6 (and step 4, on the external DNS path) open pull requests, and step 7 runs the Deploy workflow on `main`, so the code goes to GitHub first:

1. **Done 2026-10-10:** `oseptoledo/oseptoledo.github.io`, public, in the organization `oseptoledo`. The rest of this item is kept for reference. **Create the repository** on GitHub under the owner the partnership chose (a new OSEP organization, or the foundation's), **empty**: no README, license or `.gitignore`, so the first push goes in cleanly. Its exact `<owner>/<repo>`, with the same capitalization as on GitHub, is what later steps call `<owner>/<repo>`. Settle the owner and name now: moving or renaming the repository later stops every deploy until `githubRepo` is updated and `OsepWebsiteStack` redeployed (Day to day).

   **Visibility** is the checklist decision "Repository visibility and GitHub plan". Public works on GitHub Free. Private needs GitHub Team (or a higher plan), because a private repository on GitHub Free gets no ruleset and no code-owner enforcement, so item 3's review gate would not exist and anyone with Write access could push straight to `main` and deploy.
2. **Done 2026-10-10** (the initial commit). **Push this code to `main`.** This is the only direct push to `main`; after item 3, every change goes through a pull request. If `git status` says "not a git repository", run `git init -b main` first. After `git add -A`, check the list the second `git status` prints: no `.env` files, `node_modules`, `dist` or `cdk.out` (`.gitignore` keeps them out; if one is listed anyway, run `git rm --cached <path>` before committing).

   ```bash
   cd <the folder holding this repository>
   git status
   git add -A
   git status
   git commit -m "Add the OSEP website"
   git remote add origin https://github.com/<owner>/<repo>.git
   git push -u origin main
   ```

3. **Give the maintainers access, then protect `main`** (the repository's Settings on GitHub):
   - **Collaborators and teams** (or a team in the organization): give every handle listed in `.github/CODEOWNERS` the **Write** or **Maintain** role, and have each person accept the invitation (it arrives by email and on GitHub). Do this before the ruleset. Every pull request needs an approval from a code owner other than its author, and GitHub ignores approvals from code owners without write access, so until at least two of the listed people have accepted, no pull request can merge, including the ones the later steps open.
   - **Rules > Rulesets > New branch ruleset**, targeting the default branch: require a pull request before merging, with 1 approval, review from Code Owners, **Dismiss stale pull request approvals when new commits are pushed** and **Require approval of the most recent reviewable push**; block force pushes; and, if the plan includes Copilot code review, request it automatically on every push. Every merge to `main` deploys the site, so an approval must cover exactly what merges: without those two options, a commit pushed after the approval merges unreviewed. (The second also means whoever pushed last cannot approve, so a reviewer suggests changes instead of pushing to someone else's pull request.) Also turn on **Require status checks to pass**, with `check` and `infra` (source: GitHub Actions): the Deploy workflow re-runs only the build and `npm test`, so without this a pull request whose lint, `infra/` tests or synth fail can still merge and deploy. Both checks run on every pull request to `main` with no path filters, so neither can leave a pull request waiting for a check that never runs. Leave `lighthouse` optional, because its scores vary from run to run (reviewers read it), and leave **Require branches to be up to date before merging** off, because the Deploy workflow rebuilds and retests the merged `main`. If GitHub does not offer the two check names yet (it may list only checks that have run in the repository), add them as soon as the first pull request's CI finishes, before that pull request merges. Decide the **bypass list** on purpose: either add the **Repository admin** role with **For pull requests only**, so an admin can still merge a pull request when no second maintainer is available (GitHub records each bypass) while nobody can push to `main` directly; or leave it empty, and every merge then waits for a second maintainer. A bypass skips the required checks too, so an admin merging that way reads `gh pr checks <number>` first.
   - **Advanced Security** (or Code security): Dependabot alerts, **Dependabot security updates**, secret scanning with push protection, CodeQL default setup, and **private vulnerability reporting** (public repositories only; `SECURITY.md` asks reporters to prefer it). Dependabot security updates is a separate switch from the alerts: it is what makes Dependabot open a fix pull request as soon as an advisory affects a dependency, which `.github/dependabot.yml` relies on (without it, a fix waits for the next scheduled Dependabot pull request: a week for the site, a month for `infra/`). Both Dependabot features are free on any plan. Secret scanning and CodeQL are free on a public repository; a private one needs paid GitHub add-ons for them, so turn on what the plan includes. Copilot code review is not free on either: whatever the visibility, it needs a paid Copilot plan, for the pull request's author or paid for by the organization (the free Copilot plan does not include it), so the ruleset requests it only if someone has one.

Leave `githubRepo` in `infra/cdk.json` as the placeholder for now: step 6 deploys with the real value, then records it.

### 1. Create the AWS account

1. Sign up at <https://aws.amazon.com> with `admin@oseptoledo.org`, account name `Old South End Partnership`. The John Henry Eldred Jr. Foundation's card pays for year one.
2. Signed in as root: turn on MFA for the root user (Security credentials > Assign MFA). Do not create root access keys. Store the root password and MFA recovery where the partnership keeps such things.
3. Billing > Budgets > create a monthly cost budget (for example $25) with alerts to `admin@oseptoledo.org`.
4. **IAM Identity Center** (how the people who deploy sign in), in **us-east-1** (region menu, top right):
   1. Open IAM Identity Center, choose **Enable**, then **Enable with AWS Organizations**. That creates an AWS Organization with this account as its management account, which is what lets Identity Center give people access to the account. Do **not** choose an *account instance*: it cannot grant access to AWS accounts, so the profile in item 5 would never work. If the account is on the AWS Free plan, creating an organization moves it to the paid plan; the budget from item 3 is the guard.
   2. Permission sets > Create permission set > Predefined permission set > **AdministratorAccess**. Keep the name `AdministratorAccess`: item 5's `sso_role_name` must match it exactly.
   3. Users > Add user, one for each person who deploys (each with their own email address). Then Groups > Create group **`OsepAdmins`** with those users.
   4. AWS accounts > tick this account > Assign users or groups > Groups > `OsepAdmins` > Next > `AdministratorAccess` > Next > Submit.
   5. Each user opens the "Invitation to join IAM Identity Center" email, accepts it, sets a password and registers an MFA device. `aws sso login` (item 6) fails for anyone who has not.
   6. Note the **AWS access portal URL** (Identity Center's Dashboard or Settings: `https://d-xxxxxxxxxx.awsapps.com/start`) and the 12-digit **account id**.
5. Add the CLI profile. Either run `aws configure sso --profile osep-website` and answer with the values above, or paste this into `~/.aws/config`, replacing the two placeholders:

   ```ini
   [profile osep-website]
   sso_session = osep
   sso_account_id = 000000000000
   sso_role_name = AdministratorAccess
   region = us-east-1
   output = json

   [sso-session osep]
   sso_start_url = https://d-xxxxxxxxxx.awsapps.com/start
   sso_region = us-east-1
   sso_registration_scopes = sso:account:access
   ```

6. Sign in and check you are in the right account (the `Account` it prints must be the OSEP account id). Do this at the start of every session:

   ```bash
   aws sso login --profile osep-website
   aws sts get-caller-identity --profile osep-website
   ```

7. **Check now that the account may use CloudFront.** Some brand-new accounts cannot create CloudFront distributions until AWS verifies them; the error reads "Your account must be verified before you can add new CloudFront resources." Find out now, not in step 6: on the Route 53 path, step 6 runs after the name servers have moved, and the site stays dark until it succeeds. In the CloudFront console (signed in to this account), choose **Create distribution** with any public origin (for example `example.com`), the default settings, the pay-as-you-go option if asked for a pricing plan, and no WAF or other security add-on if offered. If it is created, select it, **Disable** it, wait until its status shows Disabled (a few minutes), then **Delete** it. If you get the verification error instead, open a case in the AWS Support Center (Account and billing, which is free) asking them to enable CloudFront for the account, and do not switch name servers (step 5a.6) or run step 6 until they confirm. (If step 6 fails with that error anyway, follow "If the first deploy of a stack fails" in step 6.)

### 2. Install, test and synthesize (no AWS access needed)

```bash
cd infra
npm ci
npm run build                              # type-check
npm test                                   # Vitest (stacks, redirects, DNS, settings, cdk-nag), then the contact Lambda node tests
npx cdk synth -c dnsProvider=route53       # the Route 53 mode (both stacks)
npx cdk synth -c dnsProvider=external      # the GoDaddy-DNS mode
```

Each synth names its mode, so both keep working if step 4 records `external` in `cdk.json` (a plain `npx cdk synth` uses whatever `cdk.json` says). `synth` prints warnings until you act on them: the empty `lib/dns-records.ts` (route53 mode only) and the `githubRepo` placeholder (both modes). Both are intentional reminders, not failures.

### 3. Bootstrap CDK (once per account)

Still inside `infra/` (`pwd` ends in `/infra`; see the top of this runbook):

```bash
npx cdk bootstrap aws://<ACCOUNT_ID>/us-east-1 --profile osep-website
```

### 4. Choose how DNS is served

- **Route 53 (`dnsProvider=route53`, recommended).** This app creates a hosted zone, you copy GoDaddy's existing records into it, then point the domain's name servers at it (the registration stays at GoDaddy). Both `www` and the bare `oseptoledo.org` are served by CloudFront, and the certificate and email-signing records are created and kept up to date automatically. The risk is the copy: `admin@oseptoledo.org` keeps working only if every mail record comes across (step 5a).
- **External (`dnsProvider=external`).** DNS stays at GoDaddy and you type in a handful of records. Simpler on day one, with one real limitation: GoDaddy cannot point the bare `oseptoledo.org` at CloudFront, so the apex is handled by GoDaddy's forwarding service, not by this stack (step 5b).

On the Route 53 path there is nothing to record: `cdk.json` already says `route53`, so no pull request is needed. For the external path, change `dnsProvider` to `external` in `cdk.json` (only `cdk.json`; see Settings) in a pull request, and wait for it to merge before step 5b.

### 5a. DNS, Route 53 path

Order matters here. The mailbox depends on GoDaddy's MX and TXT records, and they stop being served the moment the name servers change.

1. **Export GoDaddy's zone.** GoDaddy > Domain Portfolio > `oseptoledo.org` > DNS > the "..." menu > Export zone file. Keep it, and also save what the world sees today:

   ```bash
   for q in "MX oseptoledo.org" "TXT oseptoledo.org" "TXT _dmarc.oseptoledo.org" "CNAME autodiscover.oseptoledo.org" "NS oseptoledo.org" "A oseptoledo.org" "CNAME www.oseptoledo.org"; do
     t=${q%% *}; n=${q#* }
     echo "== $q"; dig +short "$t" "$n"
   done | tee godaddy-before.txt
   ```

   The `== MX oseptoledo.org` section must list at least one mail server. If it is empty (or every section is), the check is not working, so stop and find out why before going on. The last two sections show what the bare domain and `www` serve today (a GoDaddy parked page, Website Builder or forwarding). That goes dark at the name-server switch (item 6) until steps 6 and 7 finish.

2. **Copy the records into `lib/dns-records.ts`** (`EXISTING_RECORDS`; the file's header explains the format):
   - Copy every MX, TXT, CNAME, SRV and CAA record, including selector `..._domainkey` CNAMEs and verification TXT strings.
   - Copy every `A` and `AAAA` record on a name **other than** the apex and `www`. An MX that points at `mail.oseptoledo.org` needs `mail`'s A record too, or mail stops at the switch even though the MX check in item 4 passes.
   - Skip NS and SOA, and skip the apex `A`/`AAAA` records and the `www` CNAME or `A` (this stack points those at CloudFront).
   - Where GoDaddy shows a target of `@` (its default `ftp` CNAME, for example), `@` means the domain itself: write `oseptoledo.org`.
   - Combine multiple rows with the same name and type into one entry with several values.
   - If the export holds a record of any other type, stop: this stack cannot carry it yet. Ask whoever maintains `infra/` to add the type before going on.

   **Then check every copied name a person might open in a web browser, over HTTPS.** From the first deploy of `OsepWebsiteStack` (step 6), `https://oseptoledo.org` answers with this site's `Strict-Transport-Security` header, which includes `includeSubDomains`. Any browser that loads it once will, for two years, refuse to open *any* `*.oseptoledo.org` name over plain HTTP or with a certificate that does not match that name, and it offers no "continue anyway". This starts at the first visit; it is not the preload list (step 12). HSTS affects browsers only, so mail plumbing is fine as it is: MX targets, `_domainkey` selectors, `_dmarc`, verification strings, SRV records and `autodiscover`. Names like `email`, `webmail`, `mail`, `ftp` or `shop` are the ones to check, one line each:

   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' https://email.oseptoledo.org/
   ```

   Any status code means HTTPS works for that name. An SSL or certificate error, or no answer, means it will stop working in visitors' browsers once they have been to the site: fix it with whoever hosts it, leave it out of `EXISTING_RECORDS` if nobody uses it, or accept that on purpose and say so in the pull request.

   Then run `npm test` in `infra/`. With records in the list it checks them (format, duplicates, clashes with the names this stack manages) instead of warning that the list is empty, so it must pass. Open a pull request with the change, and wait for it to merge.
3. **Deploy only the zone**, from an up-to-date `main`, inside `infra/` (the commands at the top of this runbook, ending with `npm ci` in `infra/`):

   ```bash
   npx cdk deploy OsepDnsStack --profile osep-website
   ```

   Note the four name servers in the `NameServers` output. If this first deploy fails, read "If the first deploy of a stack fails" in step 6 before trying again.
4. **Check the new zone answers exactly like GoDaddy**, against each of the four new name servers, before touching anything at GoDaddy. In the first line, replace the example names between the quotes with the `NameServers` output, pasted exactly as the deploy printed it (the commas are fine: the second line removes them). Add a quoted `"TYPE name"` entry to the third line for every other name you copied (for example `"A mail.oseptoledo.org"` or `"CNAME email.oseptoledo.org"`):

   ```bash
   NAMESERVERS='ns-1.awsdns-01.org, ns-2.awsdns-02.co.uk, ns-3.awsdns-03.com, ns-4.awsdns-04.net'
   for NS in $(echo "$NAMESERVERS" | tr -d ','); do
     for q in "MX oseptoledo.org" "TXT oseptoledo.org" "TXT _dmarc.oseptoledo.org" "CNAME autodiscover.oseptoledo.org"; do
       t=${q%% *}; n=${q#* }
       old=$(dig +short "$t" "$n" | sort); new=$(dig +short "$t" "$n" @"$NS" | sort)
       if [ -z "$old" ] && [ -z "$new" ]; then echo "none $NS $q"
       elif [ "$old" = "$new" ]; then echo "ok   $NS $q"
       else echo "DIFF $NS $q"; fi
     done
   done
   ```

   `ok` means the new name server answers exactly what GoDaddy answers today. `none` means neither has that record: fine for `_dmarc` or `autodiscover` if the domain never had one, but `MX oseptoledo.org` and `TXT oseptoledo.org` must say `ok` on all four lines (if they say `none`, the check is not working: stop). Any `DIFF` (other than one you understand, like a record you deliberately dropped) means stop and fix `dns-records.ts` first. But if `dig` also printed "couldn't get address for" a name server, the `NAMESERVERS` line is wrong, not the records: check it against the `NameServers` output and run the check again.
5. **If DNSSEC is on at GoDaddy, turn it off** (Domain > DNS > DNSSEC) and wait a day: signed delegation to a zone that is not signed breaks resolution.
6. **Switch the name servers at GoDaddy.** First confirm that step 1.7's CloudFront check passed and that you can run steps 6 and 7 straight after item 7. Then: Domain Portfolio > `oseptoledo.org` > DNS > Nameservers > Change > "I'll use my own nameservers", and enter the four from `NameServers` (no trailing dots). If mail stops arriving, or step 6 cannot finish the same day, item 7 says how to switch back.

   **From here until the first content deploy (step 7), the website is down.** Until step 6 finishes, `oseptoledo.org` and `www.oseptoledo.org` resolve to nothing: the new zone holds only the records you copied, and the site's records arrive with step 6, which cannot start before item 7 confirms the switch. From step 6 until step 7 they resolve, but the bucket is still empty, so every page is an error. Whatever GoDaddy shows at those two names today (the `A` and `www` lines of `godaddy-before.txt`) goes dark, usually for an hour or more: propagation, the 10 to 30 minute deploy, then a few minutes for the content deploy. Mail is not affected. Switch at a quiet time, run step 6 as soon as item 7 confirms and step 7 straight after it, and expect some resolvers to keep answering "no such name" for about 15 minutes after step 6 finishes.
7. **Wait and confirm:** `dig +short NS oseptoledo.org @8.8.8.8` shows the `awsdns` servers (minutes to hours). Then send an email to `admin@oseptoledo.org` from an outside account and confirm it arrives.

   **If mail does not arrive, or step 6 cannot finish the same day.** Until the first content deploy (step 7, not this item) is done and mail is confirmed, do not edit or delete GoDaddy's own DNS records, and leave DNSSEC off: they are the way back.
   - **Mail missing:** compare what the new zone answers with `godaddy-before.txt` and the zone file from item 1, name by name, for example `dig +short MX oseptoledo.org @<one of the four name servers>`, then `A mail.oseptoledo.org` and every other name you copied. (Item 4's loop no longer helps: since the switch, its "what the world sees" side comes from Route 53 too.) Fix any missing or different record in `lib/dns-records.ts` through a pull request, then deploy `OsepDnsStack` as in item 3 (from an up-to-date `main`). If that cannot be done within the day, switch back meanwhile.
   - **Step 6 fails and cannot be retried the same day** (a CloudFront support case, an error you cannot fix): first finish "If the first deploy of a stack fails" in step 6, so no deploy is still running, then switch back so the old site returns. Repeat items 4 to 7 when step 6 can run.
   - **Switching back:** GoDaddy > Domain Portfolio > `oseptoledo.org` > DNS > Nameservers > Change > GoDaddy Nameservers (recommended). GoDaddy normally keeps its old records while custom name servers are in use; compare them with the zone file from item 1, and re-add (or import) any that are missing. Mail, and whatever the domain showed before, come back as resolvers notice the change, usually within hours, but some can keep asking the Route 53 name servers for up to two days. So fix the Route 53 records too, and leave `OsepDnsStack` and its zone in place: the next attempt reuses the same four name servers.
   - **Once step 6 has succeeded, fix forward instead.** Switching back then takes the new site offline, and the certificate's renewal and SES's DKIM check both rely on the Route 53 zone.

### 5b. DNS, external path (GoDaddy keeps DNS)

1. **Start the website deploy. On this path, this *is* step 6**: run it here, and do not run step 6 again afterwards (read step 6's notes first). Run it after the step 4 pull request (`dnsProvider` set to `external` in `cdk.json`) has merged, from an up-to-date `main`, inside `infra/` (the commands at the top of this runbook, ending with `npm ci` in `infra/`):

   ```bash
   npx cdk diff   OsepWebsiteStack --profile osep-website -c githubRepo=<owner>/<repo>
   npx cdk deploy OsepWebsiteStack --profile osep-website -c githubRepo=<owner>/<repo>
   ```

   The deploy **pauses** at `SiteCertificate` until ACM can see its validation records.
2. In a second terminal, get those records:

   ```bash
   aws acm list-certificates --region us-east-1 --profile osep-website \
     --query 'CertificateSummaryList[].[DomainName,CertificateArn]' --output text
   aws acm describe-certificate --region us-east-1 --profile osep-website --certificate-arn <ARN> \
     --query 'Certificate.DomainValidationOptions[].ResourceRecord' --output table
   ```

   Add each as a CNAME at GoDaddy (Name: the part before `.oseptoledo.org`, since GoDaddy appends the domain; Value: without the trailing dot). The deploy resumes within minutes of ACM seeing them. **Never delete them**: ACM renews the certificate every year through them.
3. When the deploy finishes, add the records from its outputs at GoDaddy, each as a CNAME. Every output reads `<Name> CNAME <Value>`:
   - `DkimRecord1` to `DkimRecord3`, **now**: three CNAMEs that let SES sign mail as `oseptoledo.org`. Name is the part before `CNAME`, like `abc123def._domainkey`: the output already leaves off `.oseptoledo.org`, because GoDaddy appends the domain, so do not add it back. Value is the part after, ending in `dkim.amazonses.com`, with no trailing dot. With the domain typed twice, SES never sees the records and step 8 never shows `SUCCESS`.
   - `DnsWwwRecord`, **only after step 7's first content deploy**: Name `www`, Value the CloudFront hostname (`d…cloudfront.net`), replacing GoDaddy's `www` record. Until step 7 the site's bucket is empty and every page is an error, while GoDaddy's `www` keeps showing what it shows today, so switch it once there is a site to show.
4. **The apex limitation** (set this up together with the `www` record, after step 7). GoDaddy DNS has no way to point `oseptoledo.org` itself at CloudFront (a CNAME is not allowed at the apex and GoDaddy has no alias record). Use GoDaddy > Domain > Forwarding: forward `oseptoledo.org` to `https://www.oseptoledo.org`, permanent (301), forward only. The consequences: GoDaddy's forwarder, not CloudFront, answers `oseptoledo.org`; check whether `https://oseptoledo.org` works at all with their forwarder; it does not send this site's HSTS header, so the domain cannot be submitted to the HSTS preload list; and query strings may not survive. If any of that matters, switch to the Route 53 path.

### 6. Deploy the website stack

**Route 53 path:** run this only after step 5a.7 confirms the name-server switch, and as soon as it does: the certificate and the DKIM records are validated through public DNS, so they cannot succeed before the new zone is the one the world asks, and the site is down until this step and step 7 finish. **External path:** you already started this deploy in step 5b.1; the notes below apply to it, but do not run it a second time.

From an up-to-date `main`, inside `infra/` (the commands at the top of this runbook, ending with `npm ci` in `infra/`; after the name-server switch this is often a new terminal window):

```bash
npx cdk diff   OsepWebsiteStack --profile osep-website -c githubRepo=<owner>/<repo>
npx cdk deploy OsepWebsiteStack --profile osep-website -c githubRepo=<owner>/<repo>
```

**Read the diff before deploying.** `cdk deploy OsepWebsiteStack` also deploys `OsepDnsStack` first if it changed, since the site's records live in its zone, and the diff shows that stack too whenever it would change. If the `OsepDnsStack` part has any line starting `[-] AWS::Route53::RecordSet` with `CarryOver` in its name, **stop**: this checkout is missing records that are live in the zone (most likely it is not an up-to-date `main`), and deploying would delete them, mail records included. Fix the checkout, run the diff again, and deploy only when no `CarryOver` record is being removed (unless removing it is the point of a change you made on purpose).

CDK lists the IAM changes and asks for confirmation; read them, then answer `y`. The first deploy takes 10 to 30 minutes (certificate validation, then CloudFront). Both stacks have termination protection on, and once a stack has been created its buckets and hosted zone are kept even if the stack is deleted. When it finishes, go straight on to step 7: until the first content deploy, every page is an error.

The deploy role trusts GitHub only because this deploy passed the real `githubRepo`; a stack deployed with the `OWNER/REPO` placeholder denies every GitHub token. So, after this deploy succeeds, put the real `githubRepo` in `cdk.json` in a pull request (only `cdk.json`; see Settings): every later deploy then keeps it without the flag, where a deploy with the placeholder would bring the Deny back. Get that pull request merged before any other deploy of `OsepWebsiteStack` (an `infra/` pull request's, or one the monthly upkeep check calls for; Day to day): until it merges, a diff of `main` shows `GithubDeployRole`'s trust going back to `repo:OWNER/REPO` with a `DenyUntilGithubRepoIsConfigured` statement added, and deploying that stops every content deploy at its AWS sign-in.

#### If the first deploy of a stack fails

When a stack's **first** create fails, CloudFormation rolls it back to `ROLLBACK_COMPLETE` (or `ROLLBACK_FAILED`). Such a stack cannot be updated, only deleted, and the termination protection CDK switched on before the create blocks the delete, so running `cdk deploy` again just stops with an error about termination protection. Common causes on a new account: CloudFront not yet enabled for it (step 1.7), validation CNAMEs added late or wrongly on the external path, or a one-off IAM or SES error.

Do this **only** for a stack in one of those two states, never for one that has deployed successfully before. (A failed *update* ends in `UPDATE_ROLLBACK_COMPLETE`, and that stack is fine: fix the cause and deploy again.)

Set `STACK` to the stack whose first deploy failed, `OsepWebsiteStack` or `OsepDnsStack`. The first command must print `ROLLBACK_COMPLETE` or `ROLLBACK_FAILED`; if it prints anything else, stop.

```bash
STACK=OsepWebsiteStack
aws cloudformation describe-stacks --stack-name $STACK --region us-east-1 --profile osep-website \
  --query 'Stacks[0].StackStatus'
aws cloudformation describe-stack-events --stack-name $STACK --region us-east-1 --profile osep-website \
  --query "StackEvents[?contains(ResourceStatus, 'FAILED')].[LogicalResourceId,ResourceStatusReason]" --output table
aws cloudformation update-termination-protection --no-enable-termination-protection \
  --stack-name $STACK --region us-east-1 --profile osep-website
aws cloudformation delete-stack --stack-name $STACK --region us-east-1 --profile osep-website
aws cloudformation wait stack-delete-complete --stack-name $STACK --region us-east-1 --profile osep-website
```

The events table says why the create failed; fix that before retrying. If the delete stops at a resource (`DELETE_FAILED`), the events say which one: for a bucket, Empty it in the S3 console, then run `delete-stack` again.

A failed first create removes its own buckets and hosted zone (they are kept only once a create has succeeded), so nothing should be left. Check anyway. After deleting a failed `OsepWebsiteStack`, the first command must print nothing; after deleting a failed `OsepDnsStack`, the second must:

```bash
aws s3api list-buckets --profile osep-website --query "Buckets[?starts_with(Name, 'osepwebsitestack-')].Name" --output text
aws route53 list-hosted-zones-by-name --dns-name oseptoledo.org --profile osep-website \
  --query "HostedZones[?Name=='oseptoledo.org.'].Id" --output text
```

Delete a leftover bucket in the S3 console (Empty, then Delete). Run the zone check only after a failed `OsepDnsStack`: if `OsepWebsiteStack` is the one that failed, the `oseptoledo.org` zone belongs to `OsepDnsStack` and, after step 5a.6, carries the domain's mail, so leave it alone. A leftover zone from a failed `OsepDnsStack` is safe to delete (in the Route 53 console, its records first, then the zone) because GoDaddy does not point at it yet; leaving it would mean two `oseptoledo.org` zones with different name servers. Then run the same deploy command again.

### 7. Connect GitHub Actions and deploy the content

Do this straight after step 6. It needs nothing from step 8 (SES), and until this first content deploy the site's bucket is empty, so every visitor gets an error page.

Read the outputs, then set three repository **variables** (not secrets; none of them grants anything on its own, and the role only trusts the repository's `main` branch):

```bash
aws cloudformation describe-stacks --stack-name OsepWebsiteStack --region us-east-1 --profile osep-website \
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output table

gh variable set AWS_ROLE_ARN               --repo <owner>/<repo> --body '<DeployRoleArn>'
gh variable set S3_BUCKET_NAME             --repo <owner>/<repo> --body '<SiteBucketName>'
gh variable set CLOUDFRONT_DISTRIBUTION_ID --repo <owner>/<repo> --body '<DistributionId>'
```

Until all three exist the Deploy workflow skips itself. Then run it: Actions > Deploy > Run workflow (branch `main`). When it is green, every edge location serves the site. On the external path, now go back to step 5b.3 and 5b.4 and switch `www` and the apex forwarding over.

### 8. SES (the contact form's email)

1. Confirm the domain is verified and DKIM signing is on (usually minutes after the DNS records exist, up to 72 hours):

   ```bash
   aws sesv2 get-email-identity --email-identity oseptoledo.org --region us-east-1 --profile osep-website \
     --query '{sending: VerifiedForSendingStatus, dkim: DkimAttributes.Status}'
   ```

   Expect `true` and `SUCCESS`.
2. **Leave the SES sandbox before the form goes on.** New accounts start in it: mail may only go *to* verified addresses or domains, at most 200 a day. The contact form sends only to the contact inbox (`contactToAddress`, `admin@oseptoledo.org` by default), on the verified domain, so the test in item 4 works in the sandbox. But those 200 a day are shared by everyone who uses the form, and the WAF limits each IP address separately (10 requests per 5 minutes, so up to 120 an hour from one address; the WAF refuses IPv6 entirely, so that one computer cannot use thousands of addresses, and step 10 checks that it does): one script could use up the day's quota in under two hours, and every real message would then fail until it resets. So request production access now. First check that the checklist item "Who receives alarm emails" is settled (the table at the top of this runbook): once submitted, the request cannot be edited until AWS has finished reviewing it. Then, in the SES console with the region set to **us-east-1** (sandbox status is per region): Account dashboard > View Get set up page > Request production access, and fill in its five fields:
   - **Mail type:** Transactional.
   - **Website URL:** `https://www.oseptoledo.org`.
   - **Additional contacts:** the addresses the checklist's "Who receives alarm emails" names, comma-separated (the field takes up to four), so AWS's notices about this account's sending still reach someone if `admin@oseptoledo.org` stops working.
   - **Preferred contact language:** English.
   - **Acknowledgement:** tick it. It confirms that you send only to people who asked for the mail (the form sends only to the partnership's own inbox) and that you have a process for bounce and complaint notifications: the two alarms `osep-website-ses-bounces` and `osep-website-ses-complaints`, which email the alarm subscribers (step 9) on any bounce or complaint, and the suppression-list check under Day to day.

   Submit it. AWS usually answers within a day, on a support case, and step 11 waits for it. The form asks for no description of the mail, so if AWS asks for more detail, or turns the request down, reply on that case with these facts and ask again: notifications from the website's contact form, sent only to the partnership's own inbox (one recipient); bounces and complaints handled as above; a per-IP-address limit in the WAF. Meanwhile the form simply stays on the email-app fallback. Check:

   ```bash
   aws sesv2 get-account --region us-east-1 --profile osep-website \
     --query '{production: ProductionAccessEnabled, perDay: SendQuota.Max24HourSend}'
   ```

   Expect `true` and a daily quota in the tens of thousands. (If `contactToAddress` ever moves to an address outside `oseptoledo.org` while the account is still in the sandbox, verify that address first: `aws sesv2 create-email-identity --email-identity <address> --region us-east-1 --profile osep-website`, then click the link it receives.)
3. **DMARC.** If GoDaddy's zone had no `_dmarc` TXT record, add one (`v=DMARC1; p=none; rua=mailto:admin@oseptoledo.org`) through `dns-records.ts` or GoDaddy. SES's DKIM signature is aligned with `oseptoledo.org`, so DMARC passes on DKIM; SES uses its own envelope sender, so SPF needs no change.
4. Send one test message through SES directly, to the contact inbox: `contactToAddress` in `cdk.json`, which is `admin@oseptoledo.org` unless the checklist's "Who receives messages" changed it (then put that address in the command instead):

   ```bash
   aws sesv2 send-email --region us-east-1 --profile osep-website \
     --from-email-address no-reply@oseptoledo.org \
     --destination ToAddresses=admin@oseptoledo.org \
     --content 'Simple={Subject={Data=OSEP SES test},Body={Text={Data=Sent from the OSEP AWS account.}}}'
   ```

### 9. Alarm emails

The `osep-website-alarms` topic has no subscriber in the stack on purpose. Mail security scanners open every link in incoming mail, including SNS's "confirm" and "unsubscribe" links, which can silently unsubscribe the inbox. Confirming from the CLI with `--authenticate-on-unsubscribe true` means only a signed-in AWS user can unsubscribe.

Subscribe every address the checklist item "Who receives alarm emails" names: `admin@oseptoledo.org`, plus the people who can act on an alarm. `admin@oseptoledo.org` is also the contact inbox (unless `contactToAddress` changed), the AWS root email, the budget alert target and the DMARC report address, so an alarm can drown there, and if that mailbox breaks (the very thing `osep-website-ses-bounces` reports) nobody else would hear. Run the `aws sns subscribe` line once per address:

```bash
TOPIC=<AlarmTopicArn>
aws sns subscribe --region us-east-1 --profile osep-website --topic-arn "$TOPIC" \
  --protocol email --notification-endpoint admin@oseptoledo.org
```

Each address gets its own confirmation email with its own token, and each is confirmed the same way, below: its owner copies the token without clicking anything, and either runs the commands with their own sign-in or passes the token (not the email, which a scanner could open on the way) to whoever does. Do **not** click the link in the confirmation email. Copy it (right-click > copy link) and paste it somewhere you can read it. The token is the long string of letters and digits after `Token=`, up to but not including the next `&` (the link goes on with `&Endpoint=...`, which is not part of it). Put it in place of `<token>`, keeping the quotes, and run:

```bash
aws sns confirm-subscription --region us-east-1 --profile osep-website --topic-arn "$TOPIC" \
  --token '<token>' --authenticate-on-unsubscribe true
aws sns list-subscriptions-by-topic --region us-east-1 --profile osep-website --topic-arn "$TOPIC"
aws sns get-subscription-attributes --region us-east-1 --profile osep-website \
  --subscription-arn <SubscriptionArn> --query Attributes.ConfirmationWasAuthenticated
```

If `confirm-subscription` reports an invalid token, check that nothing from the `&` onward was copied, and whether the copied link reads `Token%3D` instead of `Token=`: a mail scanner that rewrites links (Microsoft's Safe Links, for example) encodes the original link, and then the token runs from after `Token%3D` up to the next `%26`. Still do not click the link; if in doubt, run `aws sns subscribe` again for a fresh email. The last command must print `"true"` for every `SubscriptionArn` the list shows. If one prints `"false"` (a scanner confirmed first), `aws sns unsubscribe --subscription-arn <SubscriptionArn> --region us-east-1 --profile osep-website` and repeat for that address. Then check delivery end to end:

```bash
aws cloudwatch set-alarm-state --region us-east-1 --profile osep-website \
  --alarm-name osep-website-contact-errors --state-value ALARM --state-reason "Testing alarm email"
```

The email should arrive at every subscribed address within a minute; the alarm returns to OK on its own at the next evaluation. The topic carries all eight alarms, including the two SES ones from step 8.2. What to do when each fires is under Day to day.

**What these alarms cannot see.** They only see requests that reach CloudFront and messages sent through the form, and the 4xx alarm counts only 5-minute periods with at least 50 requests. A site nobody can reach (a lapsed domain, broken DNS, an expired certificate, a disabled distribution, a suspended account) raises none of them. Neither does a WAF rule refusing every page, or a page missing from the bucket, on a quiet day. The uptime monitor in `docs/LAUNCH_CHECKLIST.md` covers that: set it up as soon as step 10 passes.

### 10. Smoke tests

Run after the first content deploy (step 7). `H` is the canonical origin. On a Mac, `setopt interactivecomments` first (top of this runbook): the notes after `#` are the expected answers.

```bash
H=https://www.oseptoledo.org
show() { curl -s -o /dev/null -w '%{http_code} %{redirect_url} %{content_type}\n' "$@"; }

# Canonical URLs: each of these is ONE 301 straight to its final form
show https://oseptoledo.org/                                   # 301 https://www.oseptoledo.org/  (Route 53 path only, see below)
show 'https://oseptoledo.org/ES/?utm_campaign=spring+launch'   # 301 https://www.oseptoledo.org/es?utm_campaign=spring+launch  (Route 53 path only)
show $H/es/                                                    # 301 https://www.oseptoledo.org/es
show $H/ES                                                     # 301 https://www.oseptoledo.org/es
show http://www.oseptoledo.org/                                # 301 https://www.oseptoledo.org/ (CloudFront's HTTPS redirect)

# Pages
show $H/                                                       # 200 text/html
show $H/es                                                     # 200 text/html
curl -s $H/es | grep -o '<html lang="[a-z]*"'                  # <html lang="es"

# A real 404, with the noindex page
show $H/no-such-page                                           # 404 text/html
curl -s $H/no-such-page | grep -o '<meta name="robots" content="noindex"'

# Every asset the homepage loads: 200 with its real type (text/html here means a broken path rule)
for p in $(curl -fsS $H/ | grep -oE '/assets/[A-Za-z0-9._-]+' | sort -u); do printf '%-60s ' "$p"; show "$H$p"; done

# Security headers
curl -sI $H/ | grep -iE '^(content-security-policy|strict-transport-security|x-content-type-options|x-frame-options|referrer-policy|permissions-policy):'
curl -sI https://oseptoledo.org/ | grep -i '^strict-transport-security:'   # also on the apex redirect (Route 53 path only)

# Contact endpoint
show -X POST -H 'content-type: application/json' --data '{}' $H/api/contact
#   403: no x-amz-content-sha256 header, so Lambda refuses the unsigned body before the function runs
sha() { printf '%s' "$1" | shasum -a 256 | cut -d' ' -f1; }
BODY='{"name":"","email":"","phone":"","preferredLanguage":"en","audience":"other","message":"","updates":false,"pageLanguage":"en","website":""}'
curl -s -w ' %{http_code}\n' -X POST $H/api/contact -H 'content-type: application/json' -H "origin: $H" \
  -H "x-amz-content-sha256: $(sha "$BODY")" --data "$BODY"
#   {"ok":false,"error":"invalid","fields":["name","email","message"]} 400
curl -s -w ' %{http_code}\n' -X POST "$H/api/%63ontact" -H 'content-type: application/json' -H "origin: $H" \
  -H "x-amz-content-sha256: $(sha "$BODY")" --data "$BODY"
#   {"ok":false,"error":"invalid","fields":[]} 400, or a 403 from AWS: an encoded spelling of the path is refused
BIG="{\"message\":\"$(head -c 9000 /dev/zero | tr '\0' a)\"}"
curl -s -w ' %{http_code}\n' -X POST $H/api/contact -H 'content-type: application/json' -H "origin: $H" \
  -H "x-amz-content-sha256: $(sha "$BIG")" --data "$BIG"
#   {"ok":false,"error":"too_large"} 413
curl -s -w ' %{http_code}\n' $H/api/contact                    # {"ok":false,"error":"method"} 405

# One real message through the Lambda: run ONCE, after step 8.1 shows SUCCESS (put an address you read in place of you@example.com)
OK='{"name":"Prueba OSEP José","email":"you@example.com","phone":"","preferredLanguage":"es","audience":"other","message":"Smoke test, runbook step 10: ñ á é ü","updates":false,"pageLanguage":"es","website":""}'
curl -s -w ' %{http_code}\n' -X POST $H/api/contact -H 'content-type: application/json' -H "origin: $H" \
  -H "x-amz-content-sha256: $(sha "$OK")" --data "$OK"
#   {"ok":true} 200

# IPv6 is refused by the WAF, on every path (see below)
EDGE6=$(dig +short AAAA aws.amazon.com | grep '^2600:90' | head -1); echo "edge: $EDGE6"   # an IPv6 address of a CloudFront edge
show -6 --resolve "www.oseptoledo.org:443:[$EDGE6]" $H/          # 403 text/html
show -6 --resolve "www.oseptoledo.org:443:[$EDGE6]" -X POST $H/api/contact -H 'content-type: application/json' \
  -H "origin: $H" -H "x-amz-content-sha256: $(sha "$BODY")" --data "$BODY"   # 403 text/html
```

The three lines marked "Route 53 path only" test the bare `oseptoledo.org`, which CloudFront answers only on that path. On the external path GoDaddy's forwarder answers it (step 5b.4), so expect them to differ: no HSTS header, possibly no HTTPS, possibly a lost query string. Instead, open `http://oseptoledo.org/` in a browser and check it ends up at `https://www.oseptoledo.org/`.

**Run the contact lines once.** The five checks and the one real message are six requests, and all six count toward the WAF's contact limit (`contactRateLimit`: 10 requests to `/api/contact` per IP address per 5 minutes), so running them all again soon after, a natural thing to try when an answer looks wrong, gets your IP address blocked for a while. Before running any contact line a second time, wait five minutes, and do not repeat the real message once it has answered 200 (the one exception: Day to day sends it once more to confirm a fix after the contact form has failed). A blocked request answers 403 with an AWS "Request blocked" page on every contact line, the `GET` line included. So if the `GET` line answers 403 instead of 405, that run tells you nothing: send nothing else to `/api/contact` for five minutes, then run the five checks once more.

**The real message** checks what nothing before step 11 otherwise does: the function's own permission to send through SES, the SES client the Lambda runtime provides, and the email the function builds (step 8.4 sends with your own access, not the function's). It needs step 8.1's `true` and `SUCCESS`; if SES is not verified yet, come back to the `H=`, `sha` and `OK=` lines and the `curl` under them once it is. Within a minute an email should reach the contact inbox (`contactToAddress` in `cdk.json`, `admin@oseptoledo.org` by default) with the subject "New message from the OSEP website: Other", the accented letters intact, and Reply-To set to the address in `email`. In its full headers (Outlook on the web: the message's "..." menu > View > View message details; Gmail: Show original), `Authentication-Results` should show `dkim=pass` for `oseptoledo.org`, and `dmarc=pass` once step 8.3's DMARC record exists.

- **`{"ok":false,"error":"server"} 500`:** run `aws logs tail /aws/lambda/osep-website-contact-form --since 10m --region us-east-1 --profile osep-website` and read `errorName`. `AccessDeniedException` means the function's SES permission is wrong; `MessageRejected` means the domain is not verified (step 8.1) or, in the sandbox, the recipient is not. Either way, tell whoever maintains `infra/` and do not do step 11. The `osep-website-contact-server-errors` alarm (and possibly `osep-website-5xx-rate`) emails once for this; that is expected.
- **A 403 "Request blocked" page:** either the contact limit was reached (above), or one of the WAF's managed body rules blocks ordinary messages (`docs/TECH_DEBT.md`). Wait five minutes and send it once more; if it still answers 403, tell whoever maintains `infra/` and do not do step 11.

Two contact-endpoint answers check things only the live stack can show. If the `%63ontact` line lists the missing fields like the line before it, the function URL decoded the path before the Lambda saw it: the WAF's contact limit still applies (it decodes the path too), but tell whoever maintains `infra/`, because the Lambda's own check of the path does not. If the oversize line alone answers 403 instead of 413, while the `GET` line still answers 405, the WAF's 8 KB body rule is blocking again (`SizeRestrictions_BODY` in `lib/website-stack.ts` should only count).

**The two IPv6 lines check that the WAF refuses IPv6.** The site publishes no IPv6 (AAAA) address, but every CloudFront edge still accepts IPv6 connections for every site it serves, so these lines connect to one of CloudFront's IPv6 addresses (borrowed from `aws.amazon.com`, which CloudFront serves over IPv6) and ask it for this site. Both must answer 403. The POST is the same request that answers 400 over IPv4 a few lines up, so a 403 here is the WAF's `BlockIpv6` rule. If either answers 200 or 400, the rule is not working and one computer with many IPv6 addresses could get past the contact form's per-IP limit: tell whoever maintains `infra/`, and do not turn the form on (step 11) until it is fixed. These two requests come from your IPv6 address and are refused before the contact limit counts them, so they do not count toward the six contact requests above. If `edge:` printed nothing, `aws.amazon.com` no longer answers from a CloudFront IPv6 address: try `dig +short AAAA` on another large website and use an address it prints that starts with `2600:90`. If both lines print `000`, your network has no IPv6 (common on home connections) and they tell you nothing: run the `H=`, `show`, `sha` and `BODY=` lines and these three again from a network that has IPv6, such as a phone's hotspot, or ask whoever maintains `infra/` to run them.

### 11. Turn on the contact form

Until now the form opens the visitor's email app. Once steps 8 (production access granted) and 10 pass, including step 10's real message (it answered 200 and arrived), open a pull request (branch `feature/contact-form-endpoint`) that sets `CONTACT_FORM_ENDPOINT = '/api/contact'` in `src/constants/contact.ts`. That one line is the whole change: the tests already cover the form both off and on. Run `npm run lint && npm run build && npm test` at the repository root before pushing, and wait for CI to pass on the pull request, because the Deploy workflow runs the same tests and ships nothing if they fail. After it merges and deploys, send a real message from `/` and from `/es`, and confirm both arrive at the contact inbox (`contactToAddress`, `admin@oseptoledo.org` by default) with Reply-To set to the address you typed.

### 12. Later (optional)

- **HSTS preload.** The site already sends `includeSubDomains; preload`, and on the Route 53 path every browser that has visited the apex already applies it to all subdomains (that is why step 5a.2 checks them). Submitting `oseptoledo.org` at <https://hstspreload.org> goes further: browsers then enforce HTTPS on every `*.oseptoledo.org` name before anyone's first visit, and removal takes months. Before submitting, repeat the step 5a.2 check for every name now in the zone, including any added since. Not possible on the external DNS path (step 5b).
- **The 4xx alarm threshold** (20%) is a starting point. After a few weeks of real traffic, look at the rate it actually sees and adjust it with a written reason.

## Day to day

- **Content** ships through the Deploy workflow on every merge to `main`. Rolling back content: revert the pull request. The bucket is versioned (old versions kept 30 days) for anything worse.
- **Infrastructure** changes go through a pull request whose description holds the `cdk diff` of that pull request's branch (the one exception, a Dependabot pull request that changes only development dependencies other than `aws-cdk`, is under Monthly infra upkeep, below). CI's `infra` check builds, tests and synthesizes the change (step 2's commands) without any AWS access, so it cannot produce that diff: a person with access runs it, **on the pull request's branch, with the branch's own CDK installed**. `cdk diff` compares the templates of whatever is checked out, rendered by whatever CDK is installed, with the live stacks: on `main` the change is not there yet, and without `npm ci` on the branch a Dependabot CDK bump is not either, so either way the diff would show nothing of it.

  ```bash
  cd <the folder holding this repository>
  gh pr checkout <number>                  # the pull request's branch (its author can stay on it instead)
  cd infra
  npm ci                                   # the branch's own CDK
  aws sso login --profile osep-website
  npx cdk diff --profile osep-website      # both stacks; paste the output into the pull request
  git switch main
  ```

  This runs the branch's code, and `npm ci` its dependencies' install scripts, with your AWS access, so read what the pull request changes in `infra/` before running it. A `[-] AWS::Route53::RecordSet` line with `CarryOver` in its name, when removing a record is not the point of the pull request, means the branch was cut before those records reached `main`: ask its author to update it from `main`, then diff again. After the pull request merges, a person deploys from an up-to-date `main`, inside `infra/`, with `main`'s CDK installed (the commands at the top of this runbook, `npm ci` included): `npx cdk diff <Stack> --profile osep-website` again, stopping if it removes a `CarryOver` record (step 6), then `npx cdk deploy <Stack> --profile osep-website`. The Deploy workflow never touches `infra/`.
- **Monthly infra upkeep**, by the person `docs/LAUNCH_CHECKLIST.md` names ("Monthly infra upkeep owner"). Dependabot opens its `infra/` pull requests once a month (security updates at any time, with step 0.3's Dependabot security updates switched on). In the first week of each month, that person:
  - runs `npx cdk diff --profile osep-website` on an up-to-date `main`, inside `infra/` after `npm ci` there (the commands at the top of this runbook). It must report no differences for either stack. A difference means `main` and the live stacks disagree, which can go either way: a change merged that nobody deployed, or something live that `main` lacks (a deploy run from another branch or an old checkout, or, right after step 6, the real `githubRepo` before its pull request merged). So read the diff before deploying anything, and before merging anything new to `infra/` do one of two things. If every change in it is explained by a merged pull request, deploy it (`npx cdk deploy <Stack> --profile osep-website`). If it undoes something, do not deploy: get `main` corrected instead, then diff again. That includes a removed `CarryOver` record (step 6), and `GithubDeployRole`'s trust going back to `repo:OWNER/REPO` or gaining a `DenyUntilGithubRepoIsConfigured` statement (synth also warns about the `githubRepo` placeholder): merge step 6's `githubRepo` pull request, because deploying would stop every content deploy at its AWS sign-in;
  - handles that month's Dependabot `infra/` pull requests. One that changes the version of `aws-cdk-lib`, `aws-cdk` or `constructs` (the `aws-cdk` or `production-dependencies` group, or a security update to one of them) gets the usual diff on its branch, pasted into the pull request. If that diff shows changes, the same person deploys from `main` in the week it merges; if it shows none, there is nothing to deploy. One that changes only other development dependencies (`vitest`, `typescript`, `ts-node`, `@types/node`, `cdk-nag`) does not change what the stacks create, so CI's `infra` check is enough: no credentialed diff and no deploy (anything it did change would show in next month's diff of `main`).
- **Moving or renaming the repository.** The deploy role trusts `repo:<githubRepo>:ref:refs/heads/main` by name. After a transfer or a rename, the Deploy workflow's AWS sign-in fails, and the old name stays trusted (after a transfer, its former owner could create a repository with that name), until a pull request sets the new `<owner>/<repo>` as `githubRepo` in `cdk.json` (only `cdk.json`; see Settings) and a person deploys `OsepWebsiteStack` from an up-to-date `main` (diff first, as in step 6). Then check that the three repository variables (step 7) are still set, and run Actions > Deploy once. Do it the same day.
- **Contact form logs**: `aws logs tail /aws/lambda/osep-website-contact-form --since 1h --region us-east-1 --profile osep-website`. One line per request, request id and outcome only, never what anyone typed.
- **Turning the contact form off.** If the form keeps failing and SES (or the inbox) cannot be fixed within a day, open a pull request that sets `CONTACT_FORM_ENDPOINT` back to `null` in `src/constants/contact.ts`, the reverse of step 11. Once it merges and deploys, visitors get the email-app fallback again. Turn the form back on with step 11 once the cause is fixed and step 10's real message, sent again (the `H=`, `sha` and `OK=` lines and the `curl` under them), answers `{"ok":true} 200` and arrives. `/api/contact` stays live while the form is off, so that request goes through CloudFront and the function as a visitor's would; step 8.4's direct send does not (it uses your own access, not the function's), so it cannot show that the form works. The real message is one request against the contact limit (step 10): send it once.
- **Editing the CSP** (for example to add analytics): change `CONTENT_SECURITY_POLICY` in `lib/website-stack.ts`, its copy in `test/website-stack.test.ts`, and `src/__tests__/csp-compat.test.ts` together, and deploy the stack in step with the site change that needs it.

### When an alarm email arrives

Every alarm description ends "See infra/README.md, Day to day": this is the place. The commands need `aws sso login --profile osep-website` first.

- **`osep-website-ses-bounces` or `osep-website-ses-complaints`:** SES recorded a bounce for a contact message, or a complaint (the recipient marked one as spam). The alarm's description names the contact inbox the message went to: `contactToAddress` in `cdk.json`, which is `admin@oseptoledo.org` unless the checklist's "Who receives messages" changed it. Below, `<inbox>` means that address. First check that `<inbox>` receives mail from an outside account. Then see whether SES has put it on the account's suppression list:

  ```bash
  aws sesv2 list-suppressed-destinations --region us-east-1 --profile osep-website
  ```

  If `<inbox>` is listed, wait until the mailbox works again, then remove it (or use SES console > Configuration > Suppression list), with the address in place of `<inbox>`:

  ```bash
  aws sesv2 delete-suppressed-destination --email-address <inbox> --region us-east-1 --profile osep-website
  ```

  A listed address stays listed until someone removes it, and every message sent to it meanwhile is lost although the visitor saw "sent"; SES counts each one as a bounce, so the alarm fires again on the next such message. If the mailbox cannot be fixed within a day, turn the form off (above). Afterwards, confirm delivery with step 8.4's direct test send.

  **A bounce while `<inbox>` receives outside mail and is not on the list** is most likely an automatic reply. With some mail providers, an out-of-office or "we received your message" rule on the inbox answers SES's own return address, and SES counts that answer as a (soft) bounce although the message arrived. It does not put the address on the suppression list, but the bounce alarm then fires on every contact message. Look for an automatic reply in the inbox's settings (and in any rules on a shared mailbox), and turn it off, or leave it on for a known period (a holiday, say) and tell the alarm subscribers to expect one bounce alarm per message until then. If there is no such rule, tell whoever maintains `infra/`.
- **`osep-website-contact-server-errors`:** the form answered 500, so a visitor saw "could not send" (the form keeps what they typed and shows the email address). Run `aws logs tail /aws/lambda/osep-website-contact-form --since 2h --region us-east-1 --profile osep-website` and read `outcome` and `errorName`:
  - `misconfigured`: the function's settings are wrong. Tell whoever maintains `infra/`.
  - `MessageRejected`, `SendingPausedException` or `AccountSuspendedException`: check the account (expect `true`, `HEALTHY`, `true`), then rerun step 8.1's identity check (expect `true`, `SUCCESS`), and look in the `admin@oseptoledo.org` mailbox for a notice from AWS:

    ```bash
    aws sesv2 get-account --region us-east-1 --profile osep-website \
      --query '{enabled: SendingEnabled, enforcement: EnforcementStatus, production: ProductionAccessEnabled}'
    ```

  - `AccessDeniedException`: a recent infrastructure deploy changed the function's SES permission. Tell whoever maintains `infra/`.
  - Outcome `error`, or any other `errorName` (throttling, a timeout, a network error): tell whoever maintains `infra/`, with the log lines.

  Confirm any fix with step 10's real message, sent once (the `H=`, `sha` and `OK=` lines and the `curl` under them): it must answer `{"ok":true} 200` and arrive at the contact inbox (`contactToAddress`, `admin@oseptoledo.org` by default). It works whether or not the form is on, and goes through CloudFront and the function as a visitor's message does. Step 8.4's direct send uses your own access, not the function's, so it can succeed while a `misconfigured` or `AccessDeniedException` cause is still there: use it only as a check on the SES account itself. A 500 is also a CloudFront 5xx, so `osep-website-5xx-rate` may fire at the same time. If sending cannot be fixed within a day, turn the form off (above).
- **`osep-website-contact-errors`** (the function crashed or timed out): look in the same log for errors or `Task timed out`, and check whether an infrastructure deploy or a Dependabot bump came just before. Tell whoever maintains `infra/`. Visitors see the same "could not send" message as for a 500.
- **`osep-website-contact-throttles`:** Lambda refused to start the function because the account's concurrency limit was reached. Look at where the requests come from (WAF console > web ACL `osep-website-waf` > Sampled requests): a flood is handled as for `contact-volume`, below. If the traffic is real, request a higher Lambda concurrent-executions quota in Service Quotas (us-east-1).
- **`osep-website-5xx-rate`:** if `osep-website-contact-server-errors` fired at the same time, it is the form: follow that entry. Otherwise open the site. If the latest Deploy run finished shortly before, revert that pull request; if not, check the AWS Health Dashboard for CloudFront or S3.
- **`osep-website-4xx-rate`:** look at the WAF's Sampled requests (its blocks are 403s) for a scanner, or a range of real visitors being blocked. Check whether the latest content deploy dropped files the pages still use (CloudFront console > Popular objects lists 4xx counts per URL), and revert it if so. If it is only noise, see step 12's note on the threshold.
- **If `osep-website-contact-volume` fires** (more than 20 messages sent in an hour): look at the inbox, and at where the requests come from (WAF console > web ACL `osep-website-waf` > Sampled requests). With SES production access (step 8), a flood from one address (at most 120 an hour) fills the inbox but stays far below the daily sending quota, so real messages still arrive. If it is a script and it keeps going, ask whoever maintains `infra/` to block it in the WAF with an IP set rule (a code change, then `cdk deploy`): its address, or, if the sampled requests show it rotating through one network's addresses, that network's whole range (for example a `/24`). Requests from many unrelated networks at once are a distributed attack, which these limits do not cover: tell whoever maintains `infra/` straight away. If the volume is real (an event, a mailing), raise `CONTACT_VOLUME_ALARM_PER_HOUR` in `lib/website-stack.ts` in a pull request, with the reason.
- **If the uptime monitor reports the site down** (`docs/LAUNCH_CHECKLIST.md`, Uptime monitor): open it from another network. If the latest Deploy run finished shortly before, revert that pull request. Otherwise check the domain at GoDaddy (expired, or name servers changed), `dig +short NS oseptoledo.org @8.8.8.8`, the certificate (`curl -sI https://www.oseptoledo.org/`), the AWS Health Dashboard, and the `admin@oseptoledo.org` mailbox for a billing or account notice from AWS.
