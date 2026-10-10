import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * .github/workflows/deploy.yml cannot run without AWS, so its most destructive
 * step, the prune (`aws s3 sync --delete`), is guarded here as text. The prune
 * is safe only because it passes the upload step's EXCLUDES list, exactly: a
 * key left out of the prune's list but missing from dist/ is deleted from
 * production. The extensionless page key (`es`) has no file in dist/, so
 * dropping its exact exclude, loosening it to a prefix like `$key*`, a list
 * whose page excludes are never added (a misspelled `read -r -a PAGES` line
 * or `for key in "${PAGES[@]}"` loop: bash without `set -u` expands a
 * misspelled name to nothing, and a misspelled array even with it), or a
 * sync that stops passing the list (a dropped or misspelled
 * "${EXCLUDES[@]}", or a flag line added without its trailing backslash)
 * would delete the live /es page in the same run that uploaded it.
 *
 * The workflow also checks the list at run time, before each sync, against
 * $PAGE_KEYS split on its own; this test holds that check in place too.
 *
 * The Deploy workflow's build job runs `npm test` before its deploy job can
 * start, so this test stops the very run that would execute a prune broken in
 * any of those ways. Needs no build.
 */
const read = (...segments: string[]) => readFileSync(join(process.cwd(), ...segments), 'utf8')
const deploy = read('.github', 'workflows', 'deploy.yml')
const ci = read('.github', 'workflows', 'ci.yml')

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim()
/**
 * Each step's list, from the line that fills PAGES (which must come right
 * before `EXCLUDES=(`) through the `done` of the loop that adds the page
 * excludes. Only the upload and prune steps build an EXCLUDES list, so a
 * step whose `read` line is misspelled or missing drops out of the matches.
 */
const excludeMatches = [...deploy.matchAll(/read -r -a PAGES <<< "\$PAGE_KEYS"\n\s*EXCLUDES=\(\n([\s\S]*?)\n\s*done\n/g)]
const excludeBlocks = excludeMatches.map((match) => match[1])

/**
 * The run-time check each step must run between building the list and
 * syncing, and nothing else: every key in $PAGE_KEYS (split on its own, not
 * through PAGES) must be in the list as its two exact excludes, and at least
 * one key must have been checked, so a misspelled variable in the check
 * itself fails closed. The error messages are free text; the rest is pinned.
 */
const PAGE_EXCLUDES_CHECK = [
  'checked=0',
  'for key in $PAGE_KEYS; do',
  'case " ${EXCLUDES[*]} " in',
  '*" --exclude $key --exclude $key.html "*) checked=$((checked + 1)) ;;',
  '*) echo "::error::…"; exit 1 ;;',
  'esac',
  'done',
  '[ "$checked" -gt 0 ] || { echo "::error::…"; exit 1; }',
]
const withoutMessages = (command: string) => command.replace(/"::error::[^"]*"/g, '"::error::…"')

/**
 * The shell commands after each EXCLUDES block, up to the end of that step's
 * `run: |` script (the next `- name:` line, or the end of the file): comment
 * and blank lines dropped, each backslash-continued command joined into one
 * line. A flag line added without its trailing backslash therefore splits the
 * sync into two commands, and the sync no longer ends with the list.
 */
const commandsAfterExcludes = excludeMatches.map((match) => {
  const start = (match.index ?? 0) + match[0].length
  const rest = deploy.slice(start)
  const nextStep = rest.search(/^\s*- name:/m)
  return (nextStep === -1 ? rest : rest.slice(0, nextStep))
    .split('\n')
    .filter((line) => line.trim() !== '' && !/^\s*#/.test(line))
    .join('\n')
    .replace(/\\\n\s*/g, ' ')
    .split('\n')
    .map(collapse)
})
const SYNC = 'aws s3 sync dist/ "s3://$SITE_BUCKET" '
const PASSES_EXCLUDES = ' "${EXCLUDES[@]}"'

/** The files the "Upload pages and metadata" step copies with a short cache lifetime. */
const shortCacheFiles = (() => {
  const loop = deploy.match(/for file in ([^;\n]+); do/)
  return loop ? loop[1].trim().split(/\s+/) : []
})()

describe('deploy workflow', () => {
  it('builds the upload and prune exclude lists identically', () => {
    expect(excludeBlocks).toHaveLength(2)
    const [upload, prune] = excludeBlocks.map(collapse)
    expect(prune).toBe(upload)
  })

  it.each(['upload', 'prune'])('shields the live pages and api/* in the %s step', (step) => {
    const block = excludeBlocks[step === 'upload' ? 0 : 1] ?? ''
    for (const exclude of ['--exclude "api/*"', '--exclude "$SHELL_KEY"', '--exclude "$ERROR_KEY"']) {
      expect(block, exclude).toContain(exclude)
    }
    // Two exact excludes per extensionless page, never a prefix, added for
    // every key the `read` line put in PAGES.
    const lines = block.split('\n').map((line) => line.trim())
    expect(lines).toContain('for key in "${PAGES[@]}"; do')
    expect(lines).toContain('EXCLUDES+=(--exclude "$key" --exclude "$key.html")')
    expect(block).not.toMatch(/\$key\*/)
  })

  it('passes the exclude list to the bucket-root sync in both steps, and the prune adds only --delete', () => {
    expect(commandsAfterExcludes).toHaveLength(2)
    const syncs = commandsAfterExcludes.map((commands, i) => {
      const step = i === 0 ? 'upload' : 'prune'
      // The sync is the step's only one, and between the list and the sync
      // runs the run-time check of the list and nothing else.
      expect(commands.filter((command) => command.startsWith('aws s3 sync')), `${step}: syncs`).toHaveLength(1)
      const syncAt = commands.findIndex((command) => command.startsWith('aws s3 sync'))
      expect(commands.slice(0, syncAt).map(withoutMessages), `${step}: checks the list, then syncs`).toEqual(
        PAGE_EXCLUDES_CHECK,
      )
      const sync = commands[syncAt]
      expect(sync.startsWith(SYNC), `${step}: syncs dist/ to the bucket root`).toBe(true)
      // Last, spelled exactly, and so not dropped, misspelled or orphaned on a
      // line of its own by a missing backslash.
      expect(sync.endsWith(PASSES_EXCLUDES), `${step}: ends with "\${EXCLUDES[@]}"`).toBe(true)
      expect(sync.split(PASSES_EXCLUDES)).toHaveLength(2)
      return sync
    })
    const [upload, prune] = syncs
    expect(upload).not.toMatch(/--delete\b/)
    // The same sync (source, target, header, flags, excludes), plus --delete.
    expect(prune).toBe(upload.replace(SYNC, `${SYNC}--delete `))
  })

  it('excludes every short-cache metadata file from both syncs', () => {
    // At least today's three, so a regex that stops matching cannot pass vacuously.
    expect(shortCacheFiles).toEqual(expect.arrayContaining(['sitemap.xml', 'llms.txt', 'robots.txt']))
    for (const block of excludeBlocks) {
      for (const file of shortCacheFiles) expect(block, file).toContain(`--exclude "${file}"`)
    }
  })

  it('deletes only once, after the CloudFront invalidation has completed', () => {
    // The workflow as code: YAML comment lines dropped and quoted strings
    // blanked, so the comments and error messages that mention --delete do not
    // count, and an added `--delete` flag anywhere else does.
    const code = deploy
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .map((line) => line.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''"))
      .join('\n')
    const deletes = [...code.matchAll(/--delete\b/g)]
    expect(deletes).toHaveLength(1)
    const wait = code.indexOf('wait invalidation-completed')
    expect(wait).toBeGreaterThan(-1)
    expect(deletes[0].index).toBeGreaterThan(wait)
    // ...and in the sync that uses the second (prune) exclude list.
    expect(deletes[0].index).toBeGreaterThan(code.lastIndexOf('EXCLUDES=('))
  })

  it('lets CI change in place exactly the files the deploy caches briefly (ci.yml, public/ rename check)', () => {
    const excluded = [...ci.matchAll(/':\(exclude\)public\/([^']+)'/g)].map((match) => match[1])
    expect([...excluded].sort()).toEqual([...shortCacheFiles].sort())
  })
})
