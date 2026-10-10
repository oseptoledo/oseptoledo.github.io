#!/usr/bin/env bash
#
# copilot-loop.sh: trigger a fresh Copilot code review on a PR's current
# HEAD, poll every 2.5 minutes for the resulting review, and emit its
# comments for Claude to act on.
#
# Usage:
#   ./.claude/scripts/copilot-loop.sh <PR_NUMBER>                 # trigger + poll + emit
#   ./.claude/scripts/copilot-loop.sh <PR_NUMBER> --fetch         # skip trigger, poll-only
#   ./.claude/scripts/copilot-loop.sh <PR_NUMBER> --no-trigger    # alias of --fetch
#   ./.claude/scripts/copilot-loop.sh <PR_NUMBER> --read          # no trigger, no poll:
#                                                                 # just read current
#                                                                 # review if any
#
# Flags:
#   --timeout=<seconds>   Max seconds to wait for Copilot to post a review
#                         after trigger. Default 900 (15 minutes).
#   --poll=<seconds>      Seconds between polls. Default 150 (2.5 minutes).
#                         Clamped to >= 30.
#   --since=<timestamp>   Only accept a review whose submitted_at is strictly
#                         later than this ISO 8601 UTC timestamp
#                         (2026-09-03T01:20:24Z). Required with --fetch when
#                         HEAD already carries an older Copilot review:
#                         without it, --fetch returns that stale review
#                         immediately instead of waiting for the new one.
#                         Pass the time you re-requested the reviewer.
#                         In full mode the pre-trigger snapshot is used and
#                         --since overrides it.
#   --raw                 Emit raw GitHub review-comment JSON objects instead
#                         of the structured {path,line,side,url,body} form.
#
# Output (default structured mode):
#   HEAD_SHA=<sha>
#   TRIGGERED=<yes|skipped>
#   REVIEW_URL=<html_url or "none">
#   REVIEW_STATE=<COMMENTED|APPROVED|CHANGES_REQUESTED|NONE>
#   REVIEW_BODY<<COPILOT_REVIEW_BODY_EOF
#   ...review summary paragraph, if any...
#   COPILOT_REVIEW_BODY_EOF
#   ---comments---
#   {"path":"src/...","line":42,"side":"RIGHT","url":"...","body":"..."}
#   ...
#   ---end---
#   ISSUE_COUNT=<N>
#
# Exit codes:
#   0   Review fetched (ISSUE_COUNT is N), or no review exists on HEAD
#       (--read mode: ISSUE_COUNT=-1). Do not loop on -1; trigger or wait.
#   1   Invocation error.
#   2   Timed out waiting for Copilot review.
#
# Dependencies: gh (authenticated), jq.
#
# This script is tracked in the repo; change it through a PR like any other
# file. How it fits the review cycle: .claude/agents/pr-review-handler.md,
# "Re-requesting bot review". COPILOT_REVIEWER is the login passed to
# `gh pr edit --remove-reviewer/--add-reviewer`. `copilot-pull-request-reviewer`
# is the login `gh pr edit` accepts for Copilot on github.com; confirm it on
# this repository's first PR (the PR timeline should show review_request_removed
# then review_requested for Copilot). `gh pr edit --help` also documents the
# special value `@copilot`, which is not supported on GitHub Enterprise Server.
# If neither re-requests the review here, stop and report it rather than
# guessing at other logins.
#

set -euo pipefail

COPILOT_BOT="copilot-pull-request-reviewer[bot]"
COPILOT_REVIEWER="copilot-pull-request-reviewer"
TIMEOUT_SECONDS=900
POLL_INTERVAL=150
MODE="full"   # full | fetch | read
RAW=0
PR=""
SINCE=""      # ISO 8601 UTC baseline; a review must be newer than this

# ── Arg parsing ──────────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --timeout=*) TIMEOUT_SECONDS="${arg#*=}" ;;
    --poll=*)    POLL_INTERVAL="${arg#*=}"
                 (( POLL_INTERVAL < 30 )) && POLL_INTERVAL=30 ;;
    --since=*)   SINCE="${arg#*=}" ;;
    --fetch|--no-trigger) MODE="fetch" ;;
    --read)               MODE="read"  ;;
    --raw)                RAW=1 ;;
    --help|-h)
      sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    -*)
      echo "copilot-loop: unknown flag: $arg" >&2
      exit 1 ;;
    *)
      [[ -n "$PR" ]] && { echo "copilot-loop: unexpected extra argument: $arg" >&2; exit 1; }
      PR="$arg" ;;
  esac
done

if [[ -z "$PR" ]]; then
  echo "Usage: $0 <PR_NUMBER> [--fetch|--read] [--timeout=<s>] [--poll=<s>] [--since=<ts>] [--raw]" >&2
  exit 1
fi

# ── Preflight ────────────────────────────────────────────────────────────────
command -v gh >/dev/null 2>&1 || { echo "copilot-loop: gh CLI not on PATH." >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "copilot-loop: jq not on PATH." >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "copilot-loop: gh is not authenticated. Run 'gh auth login'." >&2; exit 1; }

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
HEAD_SHA=$(gh pr view "$PR" --json headRefOid -q .headRefOid)

[[ -z "$HEAD_SHA" || "$HEAD_SHA" == "null" ]] && { echo "copilot-loop: could not resolve HEAD SHA for PR #$PR in $REPO." >&2; exit 1; }

echo "HEAD_SHA=$HEAD_SHA"

# ── Helpers ──────────────────────────────────────────────────────────────────

# Fetch the newest Copilot review whose commit_id matches HEAD_SHA.
# Echoes the review JSON object, or empty string if none yet.
fetch_head_review() {
  # No --jq here: gh applies --jq per page under --paginate and would emit one
  # value per page. Without it gh merges the pages into a single array.
  gh api "repos/$REPO/pulls/$PR/reviews" --paginate \
    | jq "[.[] | select(.user.login==\"$COPILOT_BOT\" and .commit_id==\"$HEAD_SHA\")] | sort_by(.submitted_at) | last"
}

# Remove + re-add the Copilot reviewer to force a new review on HEAD.
# Silent by design; `gh pr edit` emits only the PR URL. Both calls are
# best-effort: if Copilot is not currently a requested reviewer, the
# remove is a no-op.
trigger_review() {
  gh pr edit "$PR" --remove-reviewer "$COPILOT_REVIEWER" >/dev/null 2>&1 || true
  # Brief pause between remove and add so the GitHub App treats it as a
  # fresh request rather than a no-op toggle.
  sleep 2
  gh pr edit "$PR" --add-reviewer "$COPILOT_REVIEWER" >/dev/null 2>&1 || true
}

# ── Trigger (unless --fetch / --read) ────────────────────────────────────────
if [[ "$MODE" == "full" ]]; then
  # Capture the newest review's submitted_at on this HEAD BEFORE triggering,
  # so we can detect a freshly-posted review vs. a pre-existing one on the
  # same HEAD and avoid treating stale state as a loop-completion signal.
  PREV_SUBMITTED=$(fetch_head_review | jq -r '.submitted_at // ""')
  trigger_review
  echo "TRIGGERED=yes"
else
  PREV_SUBMITTED=""
  echo "TRIGGERED=skipped"
fi

# Baseline a candidate review must beat. --since wins when given; otherwise
# full mode uses its pre-trigger snapshot. In fetch mode with no --since the
# baseline is empty, so any review already on HEAD is accepted immediately --
# pass --since=<re-request time> when you re-requested Copilot by hand on a
# HEAD that already had a review, or you get the stale one back.
BASELINE="${SINCE:-$PREV_SUBMITTED}"
if [[ "$MODE" == "fetch" && -z "$BASELINE" ]]; then
  echo "copilot-loop: --fetch without --since accepts any review already on $HEAD_SHA, including one predating your re-request." >&2
fi

# ── Poll (unless --read) ─────────────────────────────────────────────────────
REVIEW=""
if [[ "$MODE" == "read" ]]; then
  REVIEW="$(fetch_head_review)"
else
  deadline=$(( $(date +%s) + TIMEOUT_SECONDS ))
  while :; do
    CANDIDATE="$(fetch_head_review)"
    if [[ -n "$CANDIDATE" && "$CANDIDATE" != "null" ]]; then
      CAND_SUBMITTED=$(jq -r '.submitted_at // ""' <<<"$CANDIDATE")
      # Require the review to be newer than the baseline, otherwise we'd
      # return a stale review on the same HEAD and think the loop was done.
      # An empty baseline means "no floor": accept the first review found.
      # ISO 8601 UTC timestamps sort correctly under string comparison.
      if [[ -z "$BASELINE" || "$CAND_SUBMITTED" > "$BASELINE" ]]; then
        REVIEW="$CANDIDATE"
        break
      fi
    fi
    if (( $(date +%s) >= deadline )); then
      echo "REVIEW_URL=none"
      echo "REVIEW_STATE=NONE"
      echo "ISSUE_COUNT=-1"
      echo "copilot-loop: timed out after ${TIMEOUT_SECONDS}s waiting for Copilot review on $HEAD_SHA." >&2
      exit 2
    fi
    now=$(date +%s)
    remaining=$(( deadline - now ))
    # Never sleep past the deadline, so --timeout stays a true maximum even
    # when it is shorter than --poll.
    nap=$POLL_INTERVAL
    if (( remaining < nap )); then nap=$remaining; fi
    if (( nap < 1 )); then nap=1; fi
    echo "copilot-loop: no new review yet, polling again in ${nap}s (${remaining}s until timeout)..." >&2
    sleep "$nap"
  done
fi

if [[ -z "$REVIEW" || "$REVIEW" == "null" ]]; then
  echo "REVIEW_URL=none"
  echo "REVIEW_STATE=NONE"
  echo "ISSUE_COUNT=-1"
  exit 0
fi

# ── Emit the review ──────────────────────────────────────────────────────────
REVIEW_ID=$(jq -r '.id'                      <<<"$REVIEW")
REVIEW_URL=$(jq -r '.html_url // "none"'     <<<"$REVIEW")
REVIEW_STATE=$(jq -r '.state // "COMMENTED"' <<<"$REVIEW")
REVIEW_BODY=$(jq -r '.body // ""'            <<<"$REVIEW")

echo "REVIEW_URL=$REVIEW_URL"
echo "REVIEW_STATE=$REVIEW_STATE"
if [[ -n "$REVIEW_BODY" ]]; then
  echo "REVIEW_BODY<<COPILOT_REVIEW_BODY_EOF"
  printf '%s\n' "$REVIEW_BODY"
  echo "COPILOT_REVIEW_BODY_EOF"
fi

COMMENTS_JSON=$(gh api "repos/$REPO/pulls/$PR/reviews/$REVIEW_ID/comments" --paginate)

echo "---comments---"
if [[ "$RAW" -eq 1 ]]; then
  echo "$COMMENTS_JSON" | jq -c '.[]'
else
  echo "$COMMENTS_JSON" | jq -c '.[] | {
    path: .path,
    line: (.line // .original_line // .start_line),
    side: (.side // "RIGHT"),
    url:  .html_url,
    body: .body
  }'
fi
echo "---end---"

COUNT=$(jq 'length' <<<"$COMMENTS_JSON")
echo "ISSUE_COUNT=$COUNT"
exit 0
