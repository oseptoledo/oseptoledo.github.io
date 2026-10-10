/**
 * Types for the contact Lambda's pure module (infra/lambda/contact-form/contact.mjs),
 * which ContactForm.test.tsx imports straight from infra/ to send the form's
 * real request through the endpoint's real handler. The root tsconfig does not
 * allow JavaScript, so the .mjs needs a declaration; this one covers only what
 * that test uses. The full request and response contract is the header comment
 * of contact.mjs, and infra/'s own tests cover the rest of the module.
 */
declare module '*/infra/lambda/contact-form/contact.mjs' {
  /** One plain-text email, as the handler hands it to sendEmail. */
  export interface ContactEmail {
    from: string
    to: string
    replyTo?: string
    subject: string
    text: string
  }

  export interface ContactResponse {
    statusCode: number
    headers: Record<string, string>
    body: string
  }

  /** The one path the endpoint serves: '/api/contact'. */
  export const CONTACT_PATH: string

  export function createHandler(deps: {
    sendEmail: (message: ContactEmail) => Promise<unknown>
    env?: Record<string, string | undefined>
    log?: (line: string) => void
  }): (event: object, context?: { awsRequestId?: string }) => Promise<ContactResponse>
}
