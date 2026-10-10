/**
 * Lambda entry point for POST /api/contact (handler "index.handler").
 *
 * All behavior lives in ./contact.mjs, which is pure and unit-tested; this file
 * only wires it to the real world: Amazon SES v2 for sending, process.env for
 * configuration, stdout for logs.
 *
 * @aws-sdk/client-sesv2 is not a dependency of anything in this repo: the
 * Node.js Lambda runtime ships the AWS SDK for JavaScript v3, so this directory
 * deploys as plain source with no bundling and no node_modules.
 *
 * Environment (set by the CDK stack): TO_ADDRESS, FROM_ADDRESS, ALLOWED_ORIGINS.
 * The region comes from the runtime's AWS_REGION (us-east-1).
 */
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { createHandler } from './contact.mjs'

// Created once per execution environment and reused across invocations.
const ses = new SESv2Client({})

/** One plain-text email, UTF-8 throughout so Spanish names and messages arrive intact. */
async function sendEmail({ from, to, replyTo, subject, text }) {
  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: [to] },
      ...(replyTo ? { ReplyToAddresses: [replyTo] } : {}),
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: { Text: { Data: text, Charset: 'UTF-8' } },
        },
      },
    }),
  )
}

export const handler = createHandler({
  sendEmail,
  env: process.env,
  // Straight to stdout, one JSON object per line. The runtime's console.log
  // would prefix each line with a timestamp, request id and level, and then
  // CloudWatch Logs metric filters (e.g. { $.outcome = "send_failed" }) could
  // not read it as JSON.
  log: (line) => {
    process.stdout.write(`${line}\n`)
  },
})
