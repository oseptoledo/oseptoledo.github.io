#!/usr/bin/env node
/**
 * CDK app entry point for the Old South End Partnership website (run through
 * cdk.json's "app" command; never compiled to disk).
 *
 * Stacks, both in us-east-1, in the account of whatever --profile the command
 * runs with (there is no account id in code, so the profile decides where a
 * deploy lands; check `aws sts get-caller-identity --profile osep-website`):
 *   OsepDnsStack      only when -c dnsProvider=route53 (the default)
 *   OsepWebsiteStack  always
 *
 * cdk-nag's AWS Solutions checks run on every synth, so `cdk synth`, `cdk diff`
 * and `cdk deploy` all stop on an unacknowledged finding. Acknowledgments live
 * next to the resource they excuse, each with its reason (lib/website-stack.ts).
 *
 * Deploying is a human's job, never an agent's: see infra/README.md.
 */
import { App, Validations } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { defineOsepStacks } from '../lib/website-stack';

const app = new App();
defineOsepStacks(app);
Validations.of(app).addPlugins(new AwsSolutionsChecks(app));
