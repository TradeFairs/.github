Status: READY_FOR_CODER
Blocked-By:
Complexity: mechanical
Type: code
Source: k8s-workspace PLAN-247 backlog sweep (`/cleanup` Step 7, 2026-08-20), backlog row
`f441c648` (originally captured against `TD-684`, low severity) — the SC2086 half of that
row. The `liv11` unknown-runner-label half of the same row is already tracked separately by
this repo's own `.github:TD-837` (`Add-actionlint-config-liv11`, status TODO at authoring
time) — do not duplicate that work here.

<!-- Complexity: mechanical — single unquoted shell variable in one existing line, byte-
     identical sibling fix to the one already implemented for `TD-836` on
     `app-release.yml`; no new design, no behavior change. -->

## Role
Codex Coder

## Context

`.github/workflows/app-deploy-test.yml`, step "Set image tag in test overlay kustomization"
(`test` job), line 430:

```
sudo kubectl kustomize edit set image ghcr.io/tradefairs/${{ inputs.slug }}=ghcr.io/tradefairs/${{ inputs.slug }}:$IMAGE_TAG 2>/dev/null || \
  sed -i "s/newTag: .*/newTag: $IMAGE_TAG/" kustomization.yaml
```

`$IMAGE_TAG` (job-level `env.IMAGE_TAG: ${{ needs.build.outputs.image_tag }}`, line 277) is
unquoted on the `kubectl kustomize edit set image` line — the byte-identical pattern that
`.github:TD-836` already fixed on `app-release.yml` line 602, where TD-836's own Context
explicitly named this file/line as an "identical sibling pattern... kept as a separate,
equally mechanical follow-up" and deliberately excluded it from that TD's diff.

Confirmed live by extracting the step's shell body and running `actionlint` (which shells
out to `shellcheck` for `run:` blocks) directly against the file, not inferred from the
backlog row text alone:

```
$ docker run --rm -v <repo>:/repo --workdir /repo rhysd/actionlint:latest \
    .github/workflows/app-deploy-test.yml
.github/workflows/app-deploy-test.yml:426:9: shellcheck reported issue in this script:
SC2086:info:4:115: Double quote to prevent globbing and word splitting [shellcheck]
```

(the finding's line/column addresses the `run: |` block starting at line 426; the actual
unquoted expansion is on line 430 within that block, matching `shellcheck`'s
4th-line/column-115 offset into the block).

Severity is genuinely low, for the same reason TD-836 gave for the `app-release.yml` sibling:
`IMAGE_TAG` here is `needs.build.outputs.image_tag`, itself built from
`"${VERSION}-test-${SHORT_SHA}"` (line 207) — a `version`/short-git-SHA composite with no
whitespace or glob metacharacters (`*`, `?`, `[`) in any real invocation, so no caller can
currently trigger word-splitting/globbing. This is a pre-existing finding, not a regression
from any recent work on this file.

The same live `actionlint` run also reports an unrelated `liv11` unknown-runner-label finding
at line 273 (`runs-on: [self-hosted, liv11]`) — that finding is out of scope for this TD; it
is already tracked by this repo's own `.github:TD-837`, which adds the missing
`.github/actionlint.yaml` declaring the `liv11` label. Do not add that file here.

## Goal

The unquoted `$IMAGE_TAG` expansion on `app-deploy-test.yml`'s "Set image tag in test overlay
kustomization" step no longer triggers shellcheck SC2086, with no behavior change to the
rendered command for any existing caller.

## Scope

### Included
- `.github/workflows/app-deploy-test.yml` — quote `$IMAGE_TAG` on the
  `kubectl kustomize edit set image ...` line inside the "Set image tag in test overlay
  kustomization" step (`test` job, line 430).

### Excluded
- The `liv11` unknown-runner-label actionlint finding on this same file (line 273) — already
  tracked by `.github:TD-837`; do not add `.github/actionlint.yaml` or touch `runs-on:` here.
- The `sed -i "s/newTag: .*/newTag: $IMAGE_TAG/" kustomization.yaml` line immediately below —
  `$IMAGE_TAG` there is already inside a double-quoted string passed to `sed`, the correct/
  safe form; shellcheck does not flag it and it must not be changed.
- `app-release.yml` line 602 — already fixed by `.github:TD-836`; do not re-touch.
- Any other step, job, or input in this workflow or any other workflow file in this repo.
- Cutting a new tag or re-pinning any caller — this is a shell-quoting-only change with no
  observable behavior difference for any existing invocation; no tag/version bump is required
  or in scope (confirm this is still true in Step 2 before skipping it).

## Steps

1. Read the live file at `.github/workflows/app-deploy-test.yml` and confirm line 430 still
   reads exactly as quoted in Context above (state may have drifted since this TD was
   authored) — STOP per the canonical STOP conditions below if it does not match.
2. Change `ghcr.io/tradefairs/${{ inputs.slug }}:$IMAGE_TAG` to
   `ghcr.io/tradefairs/${{ inputs.slug }}:"$IMAGE_TAG"` on that one line only. Do not
   reformat, reindent, or touch any other line in the step or file.
3. Re-run `shellcheck` (directly, or via `actionlint` which invokes it) against the extracted
   step body or the whole workflow file to confirm SC2086 no longer fires on this line, and
   that no new shellcheck finding was introduced by the edit.
4. Validate the workflow YAML still parses (e.g. `python3 -c "import yaml;
   yaml.safe_load(open('.github/workflows/app-deploy-test.yml'))"` or equivalent) — this repo
   has no local CI to run the workflow itself; static YAML-parse + shellcheck/actionlint are
   the full verification surface here.

## Execution & Verification

- Required commands:
  - `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/app-deploy-test.yml'))"`
    (must exit 0 — confirms the YAML is still well-formed after the edit).
  - If a `shellcheck` binary or `actionlint` (native or via
    `docker run --rm -v <repo>:/repo --workdir /repo rhysd/actionlint:latest
    .github/workflows/app-deploy-test.yml`) is available: confirm the SC2086 finding
    previously reported on this file's `run:` block (line ~426/430) is gone, and that the
    still-expected `liv11` unknown-runner-label finding (out of scope, tracked by TD-837)
    remains the only actionlint output for this file.
- Required environment assumptions: `python3` on PATH. `shellcheck`/`actionlint`/`docker` are
  best-effort verification (present on liv26 at TD-authoring time via the `rhysd/actionlint`
  Docker image) — if genuinely unavailable in the execution environment, say so explicitly in
  the Retrospective rather than fabricating a run; YAML-parse plus a byte-diff of the one
  changed line stand as the fallback verification in that case.

## Acceptance Criteria
- [ ] Line in `.github/workflows/app-deploy-test.yml`'s "Set image tag in test overlay
      kustomization" step reads
      `ghcr.io/tradefairs/${{ inputs.slug }}:"$IMAGE_TAG"` (quoted), and no other line in the
      file changed.
- [ ] `shellcheck`/`actionlint` against the file no longer reports SC2086 on that line (or the
      Retrospective explicitly states the tool was unavailable and why byte-diff verification
      stands in for it).
- [ ] YAML still parses cleanly: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/app-deploy-test.yml'))"` exits 0.
- [ ] The `liv11` unknown-runner-label finding (line 273) is untouched/unaffected by this TD
      (still present, tracked separately by TD-837 — not this TD's concern).
- [ ] No caller-visible behavior change: the rendered `kubectl kustomize edit set image`
      command is byte-identical for every real value `IMAGE_TAG` can take today (a
      `version-test-shortsha` composite string with no whitespace/glob metacharacters —
      quoting is a no-op at runtime).

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
- STOP if the live line 430 content does not match what this TD's Context quotes verbatim —
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
