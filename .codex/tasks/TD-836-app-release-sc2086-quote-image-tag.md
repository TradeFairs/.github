Status: READY_FOR_CODER
Blocked-By:
Complexity: mechanical
Source: k8s-workspace BACKLOG.md (`/cleanup` Step 7 backlog-triage, 2026-08-15) — a
shellcheck/actionlint SC2086 finding on `.github/workflows/app-release.yml` that
`scripts/backlog-triage.py` could not auto-route because its repo roster does not include
`TradeFairs/.github` as a resolvable target (expected, not a bug — this repo is triaged
manually via architect dispatch instead).

<!-- Complexity: mechanical — single unquoted shell variable in one existing line, no new
     design, no behavior change (the fix only prevents globbing/word-splitting on a value
     that is already a well-formed semver string in every real invocation). -->

## Role
Codex Coder

## Context

`.github/workflows/app-release.yml`, step "Apply prod manifests" (`deploy-prod` job), line
602:

```
kubectl kustomize edit set image ghcr.io/tradefairs/${{ inputs.slug }}=ghcr.io/tradefairs/${{ inputs.slug }}:$IMAGE_TAG 2>/dev/null || \
  sed -i "s/newTag: .*/newTag: $IMAGE_TAG/" kustomization.yaml
```

`$IMAGE_TAG` (`env.IMAGE_TAG: ${{ inputs.releaseVersion }}`, set at the `deploy-prod` job
level, line 456) is unquoted on the `kubectl kustomize edit set image` line. Confirmed live
by extracting the step's shell body and running `shellcheck` directly (not inferred from the
backlog row text alone):

```
$ shellcheck /tmp/apply-prod-manifests.sh
...
In /tmp/apply-prod-manifests.sh line 3:
kubectl kustomize edit set image ghcr.io/tradefairs/SLUG=ghcr.io/tradefairs/SLUG:$IMAGE_TAG 2>/dev/null || \
                                                                                 ^--------^ SC2086 (info): Double quote to prevent globbing and word splitting.
```

Severity is genuinely low: `IMAGE_TAG` is always `inputs.releaseVersion`, a semver string
validated one job earlier by the "Pre-flight checks" step's own `python3 semver` comparison
(`RELEASE_VER`/`NEXT_VER`), so no caller can currently pass a value containing whitespace or
glob metacharacters (`*`, `?`, `[`) that would trigger word-splitting/globbing. This is a
pre-existing finding, untouched by the recent `TD-820`/`TD-821`/`TD-822`/`TD-825` work on
this same file (none of those diffs touched this line — confirmed via
`git log -p --follow -- .github/workflows/app-release.yml | grep -B5 IMAGE_TAG`), not a
regression from that work.

**Sibling occurrence, explicitly out of scope:** `app-deploy-test.yml` line 400 has the
byte-identical unquoted pattern (`kubectl kustomize edit set image
ghcr.io/tradefairs/${{ inputs.slug }}=ghcr.io/tradefairs/${{ inputs.slug }}:$IMAGE_TAG`).
This TD deliberately does not touch it — kept as a separate, equally mechanical follow-up so
this TD's diff stays a single-line, single-file change (see Scope/Excluded).

## Goal

The unquoted `$IMAGE_TAG` expansion on `app-release.yml`'s "Apply prod manifests" step no
longer triggers shellcheck SC2086, with no behavior change to the rendered command for any
existing caller.

## Scope

### Included
- `.github/workflows/app-release.yml` — quote `$IMAGE_TAG` on the
  `kubectl kustomize edit set image ...` line inside the "Apply prod manifests" step
  (`deploy-prod` job).

### Excluded
- `.github/workflows/app-deploy-test.yml` line 400 (identical sibling pattern) — separate,
  equally mechanical fix; do not touch in this TD (keeps this diff to one line in one file).
- The `sed -i "s/newTag: .*/newTag: $IMAGE_TAG/"` line immediately below — `$IMAGE_TAG` there
  is already inside a double-quoted string passed to `sed`, which is the correct/safe form;
  shellcheck does not flag it and it must not be changed.
- Any other step, job, or input in this workflow or any other workflow file in this repo.
- Cutting a new `v2.x.y` tag or re-pinning any caller — this is a shell-quoting-only change
  with no observable behavior difference for any existing invocation; no tag/version bump is
  required or in scope (confirm this is still true in Step 2 before skipping it).

## Steps

1. Read the live file at `.github/workflows/app-release.yml` and confirm line 602 still reads
   exactly as quoted in Context above (state may have drifted since this TD was authored) —
   STOP per the canonical STOP conditions below if it does not match.
2. Change `ghcr.io/tradefairs/${{ inputs.slug }}:$IMAGE_TAG` to
   `ghcr.io/tradefairs/${{ inputs.slug }}:"$IMAGE_TAG"` on that one line only. Do not
   reformat, reindent, or touch any other line in the step or file.
3. Re-run `shellcheck` against the extracted step body (or the whole embedded script block)
   to confirm SC2086 no longer fires on this line, and that no new shellcheck finding was
   introduced by the edit.
4. Validate the workflow YAML still parses (e.g. `python3 -c "import yaml;
   yaml.safe_load(open('.github/workflows/app-release.yml'))"` or equivalent) — this repo has
   no local CI to run the workflow itself; static YAML-parse + shellcheck are the full
   verification surface here.

## Execution & Verification

- Required commands:
  - `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/app-release.yml'))"`
    (must exit 0 — confirms the YAML is still well-formed after the edit).
  - Extract the "Apply prod manifests" step's `run:` block to a temp `.sh` file and run
    `shellcheck <file>` against it — confirm the SC2086 finding on the
    `kubectl kustomize edit set image` line is gone, and no other new finding appears in that
    block (pre-existing SC2164 "cd ... || exit" warnings on the two `cd` lines in this same
    step are pre-existing, unrelated to this TD, and NOT required to be fixed here — do not
    scope-creep into fixing them).
- Required environment assumptions: none beyond `python3` + `shellcheck` on PATH (both
  present on liv26 at TD-authoring time).

## Acceptance Criteria
- [ ] Line in `.github/workflows/app-release.yml`'s "Apply prod manifests" step reads
      `ghcr.io/tradefairs/${{ inputs.slug }}:"$IMAGE_TAG"` (quoted), and no other line in the
      file changed.
- [ ] `shellcheck` against the extracted step body no longer reports SC2086 on that line.
- [ ] YAML still parses cleanly.
- [ ] No caller-visible behavior change: the rendered `kubectl kustomize edit set image`
      command is byte-identical for every real value `IMAGE_TAG` can take today (a bare
      semver string — quoting a value with no whitespace/glob metacharacters is a no-op at
      runtime).

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
- STOP if the live line 602 content does not match what this TD's Context quotes verbatim —
  do not guess at a different fix; re-confirm scope with the architect instead.

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
