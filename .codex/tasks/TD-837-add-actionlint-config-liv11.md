Status: DONE
Done-Note: DONE 2026-08-31 (úklidová dávka 1): `.github/actionlint.yaml` s labely liv11/liv26 založen v bvv-platform, infra-liv11 i k2-mcp (platform-workspace ho měl už dřív). Ověřeno: s configem je actionlint na všech třech repech bez „unknown label" nálezů.
Blocked-By: TD-836 (queued behind, not a real dependency — different file, independent
change; sequenced per the one-TD-in-flight discipline for this small batch. Promote to
READY_FOR_CODER once TD-836 is APPROVED.)
Complexity: mechanical
Source: k8s-workspace BACKLOG.md (`/cleanup` Step 7 backlog-triage, 2026-08-15) — an
actionlint false-positive finding on `TradeFairs/.github` that `scripts/backlog-triage.py`
could not auto-route because its repo roster does not include `TradeFairs/.github` as a
resolvable target (expected, not a bug — this repo is triaged manually via architect
dispatch instead).

<!-- Complexity: mechanical — adds one small, new, additive YAML config file declaring an
     already-real runner label; no existing file is edited, no workflow behavior changes. -->

## Role
Codex Coder

## Context

`TradeFairs/.github` has no `.github/actionlint.yaml`. Confirmed live: `ls .github/` shows
only a `workflows/` subdirectory, no `actionlint.yaml` anywhere in the repo
(`find . -iname "actionlint*"` → no match), and `git log --all --diff-filter=A --name-only`
shows no such file was ever added or removed.

Without this config, actionlint reports every static `runs-on: [self-hosted, liv11]` label
in this repo as an unknown-runner false positive, because `liv11` is a genuine self-hosted
runner (not a GitHub-hosted label actionlint recognizes by default) and actionlint has no
way to know about it short of this declaration file.

**Confirmed by direct grep of the live workflow files**, not by trusting the backlog row
text: `liv11` is the only self-hosted runner label used as a **static** `runs-on:` literal
in this repo:

- `.github/workflows/app-release.yml:451` — `runs-on: [self-hosted, liv11]` (`deploy-prod`
  job).
- `.github/workflows/app-deploy-test.yml:243` — `runs-on: [self-hosted, liv11]` (`deploy`
  job).

Every other `runs-on:` in this repo (`app-release.yml:95`, `app-ci.yml:102`,
`app-ci.yml:293`, `app-deploy-test.yml:61`) is `${{ fromJSON(inputs.ciRunsOn) }}` — a
dynamic expression actionlint cannot statically resolve to a literal label set, so it does
not (and would not, with or without this config) trigger the unknown-runner-label check.
`liv26` appears **only in prose comments** (e.g. `app-release.yml:80`,
`app-deploy-test.yml:32` — documenting what a caller's `ciRunsOn` input string *could* be
set to, e.g. `'["self-hosted","liv26"]'`) and never as a static `runs-on:` literal anywhere
in this repo's workflow files — so it must NOT be added to the config's label list; doing so
would declare a label this repo has no static, checkable use of, which is scope creep beyond
what actionlint can actually verify here.

`monorepo-deploy-affected.yml` and `app-adr073-verdict-gate.yml` (pulled into this checkout
2026-08-15, part of the `TD-825`/verdict-gate work) have no self-hosted `runs-on:` at all —
confirmed via grep, no change needed for them.

`k8s-workspace/.github/actionlint.yaml` (a sibling repo in the same org, already has this
file) is a useful style reference for the `self-hosted-runner.labels` shape, but its
`paths:`-scoped shellcheck suppression block is specific to that repo's own
`td-linkage-pr-gate.yml` finding and does not apply here — do not copy it in.

## Goal

`.github/actionlint.yaml` exists, declares `liv11` as a known self-hosted runner label, and
actionlint no longer reports an unknown-runner-label false positive for either of this
repo's two static `[self-hosted, liv11]` `runs-on:` sites.

## Scope

### Included
- New file `.github/actionlint.yaml` declaring `self-hosted-runner.labels: [liv11]` only.

### Excluded
- Adding `liv26` (or any other label) to the config — not a static `runs-on:` literal
  anywhere in this repo today; do not add it speculatively.
- Any `paths:`-scoped shellcheck suppression block — no live shellcheck finding in this repo
  currently needs one (see sibling TD `TD-836` for the one real SC2086 finding, fixed
  separately by quoting, not by suppression).
- Any change to `.github/workflows/*.yml` — this TD adds a new standalone config file only.
- Wiring actionlint into a CI workflow in this repo (e.g. a lint job that runs on every PR) —
  this repo currently has no self-triggered CI at all (its workflows are `workflow_call`
  only); adding a lint gate would be a separate, larger scope decision, not implied by
  "stop reporting a false positive."

## Steps

1. Re-confirm live before acting (state may have drifted): re-run `grep -n 'runs-on:'
   .github/workflows/*.yml` and confirm `liv11` is still the only static self-hosted label in
   use, and that `.github/actionlint.yaml` still does not exist. STOP per the canonical STOP
   conditions if either has changed materially since this TD was authored.
2. Create `.github/actionlint.yaml` with a `self-hosted-runner.labels` list containing only
   `liv11`, plus a short comment explaining why (mirrors the style of
   `k8s-workspace/.github/actionlint.yaml`'s own `labels:` block, but do not copy its
   `paths:` suppression section — this repo has no matching finding to suppress).
3. Validate the new file parses as YAML and matches actionlint's documented
   `self-hosted-runner.labels` schema (top-level `self-hosted-runner:` key with a nested
   `labels:` array of strings).
4. If an `actionlint` binary is available in the execution environment, run it against
   `.github/workflows/app-release.yml` and `.github/workflows/app-deploy-test.yml` before and
   after adding the config and record the before/after finding counts in the Retrospective.
   If no `actionlint` binary is available (confirmed absent in the architect's own
   environment at authoring time — `which actionlint` → not found), state that explicitly in
   the Retrospective rather than fabricating a before/after run; YAML-schema validation
   (Step 3) plus the static grep in Step 1 stand as the verification in that case.

## Execution & Verification

- Required commands:
  - `python3 -c "import yaml; d = yaml.safe_load(open('.github/actionlint.yaml'));
    assert d['self-hosted-runner']['labels'] == ['liv11'], d"` (must exit 0 — confirms the
    file parses and declares exactly the one expected label, no more, no less).
  - If `actionlint` is present: `actionlint .github/workflows/app-release.yml
    .github/workflows/app-deploy-test.yml` before and after adding the config file, diffing
    the finding set (the unknown-runner-label finding on `liv11` must disappear; no new
    finding may appear).
- Required environment assumptions: `python3` with `pyyaml` on PATH. `actionlint` binary is
  optional for this TD (see Step 4) — do not install new tooling to satisfy this TD; if
  unavailable, verify by schema/content inspection only, and say so plainly in the
  Retrospective.

## Acceptance Criteria
- [ ] `.github/actionlint.yaml` exists at the repo root's `.github/` directory.
- [ ] Its `self-hosted-runner.labels` list contains exactly `["liv11"]` — no other label
      added.
- [ ] No `.github/workflows/*.yml` file is modified by this TD.
- [ ] File parses as valid YAML and matches actionlint's documented schema for this key.
- [ ] If `actionlint` was run (Step 4), the unknown-runner-label finding for `liv11` is gone
      after the config is added, with no new finding introduced; if `actionlint` was not
      available, the Retrospective says so explicitly instead of claiming an unverified
      before/after result.

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
- STOP if a static self-hosted `runs-on:` label other than `liv11` is found live that was not
  accounted for in this TD's Context (e.g. a new workflow added after this TD was authored)
  — do not silently add it to the config; re-confirm scope with the architect instead.

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
