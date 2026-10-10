/**
 * Where contact-form messages go.
 *
 * CONTACT_FORM_ENDPOINT is the URL the form POSTs JSON to. It stays null until
 * all four of these hold (infra/README.md, the launch runbook; tracked in
 * docs/LAUNCH_CHECKLIST.md):
 *
 *   1. OsepWebsiteStack (infra/) is deployed in the partnership's own AWS
 *      account (runbook step 6);
 *   2. SES shows the oseptoledo.org identity verified, with DKIM status
 *      SUCCESS (step 8.1);
 *   3. SES production access is granted (step 8.2). In the sandbox, the
 *      200-a-day sending quota is shared by every visitor, so one script could
 *      use it up and every real message would fail until it resets;
 *   4. the smoke tests in step 10 pass on the live site.
 *
 * Then, as step 11, a pull request sets it to '/api/contact':
 *
 *   - It is a same-origin path, not a full URL. CloudFront serves the site and
 *     routes `/api/*` on the same host to the contact Lambda's function URL, so
 *     the page's CSP (`connect-src 'self'`, set in infra) already allows it and
 *     the browser makes no CORS preflight. Do not point it at the raw
 *     `*.lambda-url.us-east-1.on.aws` address: the CSP blocks it, and the
 *     function URL only accepts requests CloudFront has signed.
 *   - CloudFront signs requests to that function URL through Origin Access
 *     Control, and for a POST it signs with the body hash the browser supplies
 *     in the `x-amz-content-sha256` header (lowercase hex SHA-256 of the exact
 *     UTF-8 body). ContactForm computes that from the very string it sends
 *     (sha256Hex in src/lib/contactForm.ts); a body changed after hashing, or a
 *     missing header, is refused before the Lambda runs.
 *
 * While it is null the form still works: it validates, then opens the
 * visitor's email app with the message pre-filled and addressed to
 * CONTACT_EMAIL. Nothing is ever reported as "sent" that was not actually
 * accepted by the server or handed to the visitor's mail client.
 *
 * Setting it back to null is also the form's off switch: if sending keeps
 * failing after launch (SES paused, the inbox suppressed), a pull request that
 * puts null back here sends visitors to their email app again once it deploys
 * (infra/README.md, Day to day).
 *
 * CONTACT_EMAIL is the partnership's mailbox on its own domain. It is not
 * printed anywhere on the page today (the design shows no address); it is the
 * mailto fallback target and the address the error message points people to.
 * It must equal `contactToAddress` in infra/cdk.json, the inbox the contact
 * Lambda delivers to; a test in src/__tests__/ContactForm.test.tsx fails until
 * the two match. Confirm with the partnership which inbox should be public
 * before launch (docs/LAUNCH_CHECKLIST.md).
 */
export const CONTACT_EMAIL = 'admin@oseptoledo.org'

export const CONTACT_FORM_ENDPOINT: string | null = null
