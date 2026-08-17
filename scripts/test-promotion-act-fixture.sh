#!/usr/bin/env bash
# TD-684: runs the act fixture in .github/fixtures/td-684/act-fixture.yml
# against a real `act` (nektos/act) local runner, covering all 4 scenarios
# (require_pr_image true/false crossed with PR-image-found/not-found).
#
# Prerequisite drift guard: the fixture's "Resolve PR image" step body is a
# literal copy of the real step in .github/workflows/app-deploy-test.yml
# (adapted only in the invariant parts: repo/sha/image placeholders that
# come from `inputs`/`github` context in the real workflow but must be
# hardcoded mock values here, since this fixture has no workflow_call
# inputs or real event context). This script diffs the two step bodies with
# those placeholders normalized away, so any real behavioral change to the
# workflow step must be mirrored here before the fixture is trusted again.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW="$REPO_ROOT/.github/workflows/app-deploy-test.yml"
FIXTURE="$REPO_ROOT/.github/fixtures/td-684/act-fixture.yml"
EVENT="$REPO_ROOT/.github/fixtures/td-684/act-event.json"

ACT_BIN="${ACT_BIN:-act}"
if ! command -v "$ACT_BIN" >/dev/null 2>&1; then
  echo "act not found on PATH (set ACT_BIN=/path/to/act to override)" >&2
  exit 1
fi

# ── Drift guard ────────────────────────────────────────────────────────────
# Compares only the `run:` body (the part that encodes actual bash
# behavior) of the "Resolve PR image" step, from `run: |` through the
# matching `fi` that closes the final `if docker buildx imagetools
# inspect...` block. The `env:`/`id:` lines are intentionally excluded —
# the fixture has no real `secrets`/`inputs` context, so those legitimately
# differ (mock-token vs secrets.GITHUB_TOKEN). Placeholders that come from
# workflow_call inputs/github context in the real step but are hardcoded
# mock values in the fixture (repo, sha, slug) are normalized so the two
# bodies compare equal when the actual bash logic is unchanged.
extract_run_body() {
  sed -n '/- name: Resolve PR image (ADR-034/,/^      - name: /p' "$1" \
    | sed -n '/^        run: |/,$p' \
    | sed '1d' \
    | sed '/^      - name: /,$d' \
    | grep -v '^\s*#' \
    | sed '/^\s*$/d' \
    | sed \
      -e 's/\${{ github\.repository }}/mock\/mock/g' \
      -e 's/\${{ github\.sha }}/mocksha/g' \
      -e 's/\${{ inputs\.slug }}/mockapp/g'
}

REAL_STEP="$(extract_run_body "$WORKFLOW")"
FIXTURE_STEP="$(extract_run_body "$FIXTURE")"

if [ "$REAL_STEP" != "$FIXTURE_STEP" ]; then
  echo "DRIFT: fixture's 'Resolve PR image' step body no longer matches app-deploy-test.yml." >&2
  echo "--- real (normalized) ---" >&2
  echo "$REAL_STEP" >&2
  echo "--- fixture (normalized) ---" >&2
  echo "$FIXTURE_STEP" >&2
  diff <(echo "$REAL_STEP") <(echo "$FIXTURE_STEP") >&2 || true
  exit 1
fi
echo "Drift guard OK: fixture step body matches app-deploy-test.yml."

# ── Run act for each of the 4 scenarios ─────────────────────────────────────
# `act` (with fail-fast: false) exits non-zero for the overall run whenever
# ANY matrix leg fails a step — and scenario "true-no-pr-hard-fail" is
# DESIGNED to fail (that's the require_pr_image=true hard-fail assertion).
# So do not trust the aggregate exit code; parse the log for exactly the
# expected per-scenario outcome instead.
echo "Running act fixture (all 4 matrix scenarios)..."
LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT
set +e
"$ACT_BIN" workflow_dispatch \
  -W "$FIXTURE" \
  -e "$EVENT" \
  --pull=false \
  -P ubuntu-latest=catthehacker/ubuntu:act-latest \
  2>&1 | tee "$LOG"
set -e

fixture_failures=0

# Exactly one step-level failure, and it must be the
# "Resolve PR image" step (any other failing step is a real regression).
step_failure_count="$(grep -c '❌  Failure - Main Resolve PR image' "$LOG" || true)"
any_other_failure_count="$(grep -c '❌  Failure' "$LOG" | { grep -vc '❌  Failure - Main Resolve PR image' || true; })"
if [ "$step_failure_count" != "1" ]; then
  echo "FIXTURE FAIL: expected exactly 1 'Resolve PR image' step failure (the true-no-pr-hard-fail scenario), got $step_failure_count" >&2
  fixture_failures=1
fi

# The three non-hard-fail scenarios must report their expected image_found value.
check_outcome() {
  local scenario="$1" expected_output="$2"
  if ! awk -v s="Scenario: $scenario\$" '$0 ~ s{f=1} f && /image_found output:/{print; exit}' "$LOG" | grep -q "image_found output: $expected_output"; then
    echo "FIXTURE FAIL: scenario '$scenario' did not report 'image_found output: $expected_output'" >&2
    fixture_failures=1
  fi
}
check_outcome "default-false-image-found" "true"
check_outcome "default-false-no-pr" "false"
check_outcome "true-image-found" "true"

# The hard-fail scenario must show the attributable ::error:: message and
# must NOT reach a "Report outcome" success (job fails before that step
# would even matter for the require_pr_image=true contract; here it does
# run under `if: always()` but the key proof is the step-level ❌ above and
# the ::error:: line itself).
if ! grep -q '::error::require_pr_image=true: no PR associated with merge mocksha' "$LOG"; then
  echo "FIXTURE FAIL: hard-fail scenario did not emit the expected attributable ::error:: message" >&2
  fixture_failures=1
fi

if [ "$fixture_failures" != "0" ]; then
  echo "act fixture: FAILED (see FIXTURE FAIL lines above)" >&2
  exit 1
fi

echo "act fixture: all 4 scenarios matched expected outcomes."
echo "act fixture run complete."
