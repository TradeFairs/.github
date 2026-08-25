---
summary: TradeFairs/.github has no self-triggered CI at all today (all 5 workflow files are
  workflow_call-only reusable workflows) — nothing runs actionlint (or any linter) against a
  PR before merge. TD-731's own Follow-up already flagged this gap (Medium) after the
  `${{ secrets }}`-in-`on:`-block defect (PR #17) shipped inside a fix PR and cost 3 full
  diagnosis TDs (TD-728/729/730) to find. This TD ports the already-proven pattern from
  k8s-workspace's own `.github/workflows/actionlint-gate.yml` (TD-735, DONE, live on that
  repo's main) into TradeFairs/.github.
---

# TD-838: add an actionlint pre-merge gate to TradeFairs/.github

Status: TODO
Blocked-By: TD-837 (queued behind — TD-837 adds `.github/actionlint.yaml` declaring the
`liv11` self-hosted runner label; without it, this gate's first run would immediately fail on
the pre-existing `liv11` unknown-runner-label false positive on `app-release.yml`/
`app-deploy-test.yml`, exactly the trap k8s-workspace's own TD-735 baseline-verified around
before turning its gate on. Sequenced per the one-TD-in-flight discipline this repo is already
following — TD-836 is READY_FOR_CODER, TD-837 is TODO/queued behind it. Promote to
READY_FOR_CODER once TD-837 is APPROVED.)
Complexity: mechanical
Source: k8s-workspace BACKLOG.md (`/cleanup` Step 7 backlog-triage, 2026-08-17, row
`e8caba6d`, src:k8s-workspace:TD-731) — routed manually via architect dispatch because
`scripts/backlog-triage.py`'s repo roster does not include `TradeFairs/.github` as a
resolvable auto-route target (expected, not a bug). The backlog row also names `bvv-platform`
as a second target repo; that half is explicitly OUT of this TD's scope (see Excluded) — a
different repo, different review authority, and this TD's own shard is `.github` only.

<!-- Complexity: mechanical — this is a direct, near-verbatim port of an already-designed,
     already-proven, already-live workflow file (k8s-workspace's actionlint-gate.yml, TD-735,
     DONE) into a sibling repo, adjusted only for this repo's own workflow file names and
     `vars.CI_RUNS_ON` convention. No new design question remains open; TD-735 already made
     every judgment call (pinned version, full-directory scan rationale, erroring not
     warn-only, concurrency group). -->

## Role
Codex Coder

## Context

`TradeFairs/.github` has zero self-triggered CI today. Confirmed live: all 5 files under
`.github/workflows/` (`app-ci.yml`, `app-release.yml`, `app-deploy-test.yml`,
`app-adr073-verdict-gate.yml`, `monorepo-deploy-affected.yml`) declare only
`on: workflow_call:` — none has a `pull_request:` or `push:` trigger of its own. A PR against
this repo today runs no automated check at all beyond whatever branch-protection review count
GitHub enforces.

This is a real, previously-materialized cost, not a hypothetical one.
[TD-731](../../../k8s-workspace/.codex/tasks/TD-731-adr073-gate-secret-description-expression.md)
(k8s-workspace, `DONE`) found that `TradeFairs/.github#17` (TD-728's own fix PR) shipped a
`${{ secrets.NPM_TOKEN }}` expression inside the `description:` field of a
`workflow_call: secrets:` block — an expression context invalid in the `on:` section, which
GitHub rejects at parse time for the WHOLE file (zero jobs scheduled, no check-suite, no
visible error in the PR UI). This exact defect shape went undetected through review and
required three separate diagnosis TDs (TD-728, TD-729, TD-730 — each chasing a different false
hypothesis: checkout-token, stale registration, default-branch resolution) before a fourth
session (TD-731) diffed file content directly and found the real cause. TD-731's own
Follow-ups section (line 204) already records this exact ask:

> - [ ] (Medium) Add `actionlint` (or equivalent GitHub-workflow-aware linter) as a
>       pre-merge check ... it would have caught this class of defect (an expression
>       referencing an unavailable context) statically, before merge, instead of costing
>       three diagnosis TDs after the fact.

[TD-725](../../../k8s-workspace/.codex/tasks/TD-725-ci-affected-pull-request-trigger-gap.md)
(k8s-workspace, referenced by the same Follow-up) found a second, independent bug class
`actionlint` also catches statically: duplicate YAML mapping keys in a workflow file
(`env:` declared twice), silently overriding one with the other rather than erroring.

**A working, already-proven pattern for exactly this gate already exists and is live**: this
workspace's own `TradeFairs/k8s-workspace/.github/workflows/actionlint-gate.yml` (authored
under that repo's own TD-735, `DONE`, currently on `origin/main`) — a `pull_request` +
`push: [main]` triggered job, path-scoped to `.github/workflows/**` and
`.github/actionlint.yaml`, that downloads a pinned `actionlint` binary release and runs it
with no `continue-on-error` (a real blocking gate, not advisory). That repo's own TD-735
already made every design judgment call this TD would otherwise have to re-derive (pinned
version vs. `latest`, full-directory scan vs. diff-scoped, erroring vs. warn-only, a
`concurrency` group for duplicate-run suppression) — this TD ports that already-settled shape
rather than re-designing it.

`actionlint` is confirmed absent from PATH in this session's environment
(`which actionlint` → not found) — same as at TD-837's authoring time. This does not block
authoring or implementing this TD: the gate workflow downloads its own pinned binary at
`run:` time (see k8s-workspace's `actionlint-gate.yml` Steps, mirrored below), exactly as
k8s-workspace's own gate does; no local install is required to write or land this file.

**Explicitly separate from this TD**: whether `actionlint` (or this new check) should become
a GitHub *required* status check under branch-protection is a distinct decision from adding
the CI job itself. Confirmed live (`gh api repos/TradeFairs/.github/branches/main/protection`)
that this repo's branch protection currently declares no `required_status_checks` block at
all (only a review-count requirement, `required_approving_review_count: 0` as of this
session). Changing branch-protection settings is a repo-admin action this TD does not take —
see Excluded.

## Goal

`TradeFairs/.github` has a `pull_request`/`push`-triggered CI job that runs `actionlint`
against this repo's own `.github/workflows/*.yml` files and fails the check (non-zero exit,
real gate, not advisory) on any real finding, using the same proven shape as
k8s-workspace's own `actionlint-gate.yml` (TD-735).

## Scope

### Included
- New file `.github/workflows/actionlint-gate.yml` in `TradeFairs/.github`, modeled directly
  on k8s-workspace's own `.github/workflows/actionlint-gate.yml` (TD-735): `pull_request` +
  `push: [main]` triggers, path-scoped to `.github/workflows/**` and
  `.github/actionlint.yaml`, pinned-version `actionlint` binary download, full-directory scan
  (no `-config-file` flag — auto-discovers `.github/actionlint.yaml`, which TD-837 adds),
  `concurrency` group for duplicate-run suppression, no `continue-on-error`.
- Adjusting the ported file only where this repo's own conventions differ from
  k8s-workspace's (e.g. `runs-on:` — confirm whether this repo has an equivalent
  `vars.CI_RUNS_ON` org/repo variable or should default to `ubuntu-latest`; see Steps).
- Baseline-verifying this repo's existing 5 workflow files against `actionlint` (with
  TD-837's `.github/actionlint.yaml` in place) before turning the gate on erroring, per
  k8s-workspace TD-735's own precedent of confirming a clean baseline first — recording the
  before/after finding count in the Retrospective.

### Excluded
- Making this (or any) check a required status check under branch protection — a
  repo-admin/human decision, separate from adding the CI job. Do not call
  `gh api .../branches/main/protection` with a mutating method in this TD.
- The `bvv-platform` half of the backlog row this TD originates from — different repo,
  different review authority, not this TD's shard. If desired, it needs its own TD authored
  by whoever owns `bvv-platform`'s backlog triage.
- Any change to the 5 existing `workflow_call` reusable workflow files themselves
  (`app-ci.yml`, `app-release.yml`, `app-deploy-test.yml`, `app-adr073-verdict-gate.yml`,
  `monorepo-deploy-affected.yml`) beyond whatever this gate's baseline pass finds and this TD
  explicitly decides to fix (see Steps 3 — if the baseline is not clean, STOP and report
  rather than silently expanding scope to fix findings).
- `.github/actionlint.yaml` itself — that file is TD-837's artifact; this TD only depends on
  it existing (via Blocked-By), does not create or edit it.
- Any shellcheck/actionlint finding already tracked by a separate TD (e.g. TD-836's SC2086
  quoting fix) — those land on their own schedule; this TD's baseline check should note if
  they're still open at gate-activation time but must not attempt to fix them here.

## Steps

1. Re-confirm live before acting (state may have drifted since this TD was authored): re-run
   `ls .github/workflows/` and confirm still exactly the 5 `workflow_call`-only files, no
   existing `actionlint-gate.yml` or other self-triggered CI file. Confirm TD-837's
   `.github/actionlint.yaml` exists and declares `self-hosted-runner.labels: [liv11]` (this
   TD's Blocked-By). STOP per the canonical STOP conditions if either has changed materially.
2. Check whether `TradeFairs/.github` has an org/repo-level `CI_RUNS_ON` variable analogous to
   k8s-workspace's `vars.CI_RUNS_ON` (`gh variable list --repo TradeFairs/.github`). If yes,
   mirror k8s-workspace's `runs-on: ${{ fromJSON(vars.CI_RUNS_ON || '["ubuntu-latest"]') }}`
   shape exactly. If no such variable exists here, use a plain `runs-on: ubuntu-latest` instead
   (do not invent a new org variable as a side effect of this TD — out of scope; record which
   choice was made and why in the Retrospective).
3. Create `.github/workflows/actionlint-gate.yml`, porting k8s-workspace's `actionlint-gate.yml`
   structure: `on: pull_request: {types: [opened, synchronize, reopened, edited], paths:
   [".github/workflows/**", ".github/actionlint.yaml"]}` + `push: {branches: [main], paths:
   [same]}`; `permissions: contents: read`; a `concurrency` group keyed on PR number/ref; a job
   that checks out the repo, downloads the SAME pinned `actionlint` version k8s-workspace's gate
   uses (`1.7.12`, unless a newer stable release is confirmed and deliberately chosen instead —
   record the choice), and runs `actionlint -no-color` with no `continue-on-error`.
4. Before merging, run the downloaded `actionlint` binary locally (or via a disposable
   workflow_dispatch/PR run) against this repo's current 5 workflow files with TD-837's
   `.github/actionlint.yaml` present, and record the finding count. If findings remain beyond
   what TD-837 (liv11 label) and TD-836 (SC2086 quoting, if not yet merged) already address,
   STOP and report the specific finding(s) rather than silently fixing or suppressing them —
   this TD adds the gate, it does not clear an unrelated backlog of pre-existing findings.
5. Validate the new workflow file parses as YAML.

## Execution & Verification

- Required commands:
  - `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/actionlint-gate.yml'))"`
    (must exit 0 — confirms the new file is well-formed YAML).
  - Download the pinned `actionlint` binary (same curl/tar sequence the new workflow file
    itself uses) and run it against `.github/workflows/*.yml` with TD-837's
    `.github/actionlint.yaml` present; record the finding count (target: 0, or an explicitly
    enumerated and justified pre-existing set — see Step 4).
  - After the file is pushed, open (or update) a PR that touches `.github/workflows/**` and
    confirm via `gh run list --workflow actionlint-gate.yml --repo TradeFairs/.github` that
    the new gate actually fires (this repo has no self-triggered-CI history to draw on, so do
    not assume `pull_request`/`push` triggering works without checking — verify the run
    exists and reaches a real conclusion, not a queued/zero-job state).
- Required environment assumptions: `python3` with `pyyaml` on PATH; network access to
  `github.com` (release binary download) during the gate's own CI run — same requirement
  k8s-workspace's live gate already has, not a new one.

## Acceptance Criteria
- [ ] `.github/workflows/actionlint-gate.yml` exists, triggers on `pull_request` and
      `push: [main]`, path-scoped to `.github/workflows/**` and `.github/actionlint.yaml`.
- [ ] The job downloads a pinned (not `latest`) `actionlint` release and runs it with no
      `continue-on-error` — a real blocking gate.
- [ ] `.github/workflows/actionlint-gate.yml` itself parses as valid YAML
      (`python3 -c "import yaml; yaml.safe_load(open('.github/workflows/actionlint-gate.yml'))"`
      exits 0).
- [ ] A real PR touching `.github/workflows/**` shows the `actionlint-gate` check actually ran
      (non-zero-job conclusion), confirmed via `gh run list --workflow actionlint-gate.yml
      --repo TradeFairs/.github`, not merely assumed from the file's presence.
- [ ] No pre-existing `actionlint` finding remains unaddressed and unexplained: either the
      baseline is clean (TD-837 + TD-836 landed first) or every remaining finding is named and
      justified in the Retrospective, not silently ignored.
- [ ] No change to branch-protection required-status-check configuration.

## STOP Conditions
- STOP if a task instruction conflicts with a Design Decision, skill, or architecture intent;
  escalate the conflict before proceeding.
- STOP if required TD sections are missing (Role, Execution & Verification, Acceptance
  Criteria, or Steps).
- STOP if targeted test commands are missing or ambiguous for production code changes.
- STOP if required inputs/files are missing or steps cannot be executed deterministically.
- STOP if the task requires architectural choices not explicitly defined in the TD.
- STOP if tests would need to be weakened, deleted, or bypassed to satisfy the TD unless
  explicitly authorized by the TD.
- STOP if execution would require modifying deprecated code or artifacts that the TD scope
  excludes.
- STOP if TD-837 is not yet APPROVED/merged when this TD is dispatched — re-check live rather
  than trusting this TD's own Blocked-By field, which may be stale by dispatch time.
- STOP and report (do not fix) if the baseline `actionlint` run (Step 4) surfaces findings
  beyond what TD-836/TD-837 already address — this TD's scope is adding the gate, not clearing
  an unscoped backlog of pre-existing findings.
- STOP if this repo's branch protection would need to change for the gate to be meaningful —
  report the gap instead of changing branch-protection settings unilaterally.

## Retrospective
Pointer only. Fill after implementation. Prioritize operational friction that blocked or
slowed THIS task — not a narrative of what changed (that's already in the diff/commit
message). Typical categories: a missing/uninstalled tool or binary on liv26, a missing or
broken script, missing permissions/credentials, a bug in a skill's or slash command's
documentation, or a missing skill entirely. Each such friction item goes into
`### Follow-ups` below as a normal actionable item (no separate section) — a product defect
found along the way still uses `### Severity` as before.

### Follow-ups
<!-- Kanonický formát — NEMĚNIT:
     Otevřená položka:  - [ ] <akce>
     Uzavřená položka:  - [x] <akce> — resolved: <TD-id|commit-hash|N/A>
     Každá položka musí mít přesně jeden prefix [ ] nebo [x].
     Grepovatelnný signál: "- \[[ x]\]" -->
_(žádné follow-up položky)_

### Severity (povinné pro každý nález)
Každý nález v retrospektivě musí uvádět závažnost pomocí jedné z níže definovaných úrovní:

| Úroveň | Definice |
|--------|----------|
| **High** | Ztráta produkčních dat, bezpečnostní zranitelnost nebo tichá degradace (silent failure bez viditelného erroru). |
| **Medium** | Výrazně nefunkční část funkcionality viditelná uživateli nebo blocker pro navazující TDs. |
| **Low** | Developer experience, kosmetická vada nebo technický dluh bez dopadu na produkční uživatele. |
