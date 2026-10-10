# Security Policy

## Reporting a vulnerability

Report a suspected vulnerability in the site, its infrastructure, or the deploy pipeline directly and privately to one of the site's maintainers, who are the repository admins: Tom Voutsos (GitHub `@ladderuphousing`) or JD Vougiouklakis (GitHub `@demigreek`). Do **not** file an issue, open a PR, or post in a shared channel about it until a fix has shipped. If GitHub's private vulnerability reporting is enabled on the repository, prefer it.

There is no on-call rotation. Issues affecting the live site take priority.

## Scope

In scope:

- Site code and static assets: `src/`, `public/`, `index.html`
- Build scripts: `scripts/`
- Infrastructure as code: `infra/` (the CDK stacks, the canonical-host CloudFront Function in `infra/functions/`, the contact-form Lambda in `infra/lambda/contact-form/`)
- The CI and deploy workflows: `.github/workflows/`
- What those create in the partnership's AWS account (us-east-1): the site's S3 buckets, the CloudFront distribution and its response headers policy, the WAF web ACL, the contact-form Lambda and its function URL, the SES domain identity, the Route 53 zone (if used), the GitHub OIDC provider and the `GitHubActions-OsepWebsite-Deploy` role, the `osep-website-alarms` SNS topic and the CloudWatch alarms
- The deployed site at `https://www.oseptoledo.org`, including `POST /api/contact`

Out of scope, report upstream: AWS and GitHub themselves, GoDaddy (domain registrar), the partner organizations' own websites linked from the site, and the news outlets linked from the In the News section.

## How the AWS side is locked down

- **No stored AWS keys.** The deploy workflow trades GitHub's OIDC token for one-hour credentials from a role that trusts only this repository's `main` branch, and can only list, read, write and delete objects in the site bucket and create and read invalidations on this one distribution. It cannot change infrastructure. People deploy infrastructure with their own single sign-on session (the `osep-website` CLI profile); agents never do.
- **The bucket is private.** Only this CloudFront distribution can read it (Origin Access Control, with a bucket policy conditioned on the distribution's ARN). It is versioned, encrypted and TLS-only.
- **The contact Lambda is reachable only through CloudFront.** Its function URL uses `AWS_IAM` auth, and only this distribution may invoke it (OAC, which also requires the browser to send the SHA-256 of the request body). Its role can write its own log group and call `ses:SendEmail` on the domain identity only, and only as the configured From address to the configured inbox, so it cannot relay mail anywhere else.
- **WAF** applies AWS's Common, Known Bad Inputs and IP Reputation rule sets (the Common set's 8 KB body-size rule only counts, because the endpoint enforces the same cap itself and answers 413), limits each IP to 10 requests to `/api/contact` (matched after URL-decoding and normalizing the path, so an encoded spelling counts too) and 2,000 requests overall per 5 minutes, and blocks above that. The site is IPv4 only, because WAF counts every IPv6 address separately and one host can hold millions of them. Publishing no IPv6 (AAAA) address is not enough on its own, since every CloudFront edge accepts IPv6 connections for every distribution, so a WAF rule blocks every request that arrives from an IPv6 address, on any path.
- **The endpoint checks every request itself:** POST only, path `/api/contact` only, `Origin` must be `https://www.oseptoledo.org` when present, `Content-Type: application/json`, at most 8,192 bytes, strict UTF-8 JSON, the form's own field rules and limits, and a honeypot. Control characters are stripped from anything placed in an email header. Error responses never echo the request or the underlying error.
- **Response headers:** a strict same-origin Content-Security-Policy with no `'unsafe-inline'`, HSTS (two years, includeSubDomains, preload), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a Permissions-Policy that disables camera, microphone, geolocation, payment and USB.
- **Alarms** email the alarm topic's subscribers on CloudFront 5xx and sustained 4xx rates, on any contact-form crash, throttle or failed send, when the form sends more than 20 messages in an hour, and when SES records a bounce or complaint (including a message dropped because the inbox is on SES's suppression list). They do not detect an unreachable site (a lapsed domain, broken DNS); the launch checklist's uptime monitor covers that.

## Things that are not secrets

- `admin@oseptoledo.org` (in `src/constants/contact.ts` and `infra/cdk.json`) is the partnership's contact mailbox and reaches visitors' browsers by design. `no-reply@oseptoledo.org` is the From address of contact-form emails.
- The GitHub repository **variables** `AWS_ROLE_ARN`, `S3_BUCKET_NAME` and `CLOUDFRONT_DISTRIBUTION_ID`. None of them grants anything on its own: the role accepts only a token for this repository's `main` branch. They are variables, not secrets, on purpose.
- No credentials of any kind belong in this repository: no AWS keys, no account ids or profiles in code, no tokens.

## Data the site handles

The contact form collects a name, an email address, an optional phone number, a preferred language, who the visitor is, a message, and an opt-in for updates.

**Today** it sends nothing to any server: it opens the visitor's own email app with the message pre-filled.

**Once `CONTACT_FORM_ENDPOINT` is switched on** (`docs/LAUNCH_CHECKLIST.md`), the page POSTs the message to `/api/contact`. The Lambda validates it and sends one plain-text email through Amazon SES to `admin@oseptoledo.org`, with Reply-To set to the visitor's address. The site keeps no copy: the message exists in that inbox and in SES's handling of the email. A filled honeypot is answered as success and sent nowhere.

What is logged, and for how long:

- **The contact Lambda** writes one JSON line per request to CloudWatch Logs: a request id and an outcome (`sent`, `invalid`, `send_failed`, ...), plus the names of fields that failed validation or the AWS SDK's error class name. Never a name, an email address, a phone number or any message text. Kept three months.
- **CloudFront access logs** (client IP address, requested URL, user agent, status; cookies excluded) and the site bucket's S3 access logs go to a private logs bucket and expire after 30 days.
- **WAF** keeps a sample of inspected requests, including client IPs, which AWS shows in its console for about three hours.

The privacy notice that tells visitors this is still to be written and approved (`docs/LAUNCH_CHECKLIST.md`).
