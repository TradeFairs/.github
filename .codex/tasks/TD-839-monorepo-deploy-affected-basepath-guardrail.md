Status: READY_FOR_CODER
Blocked-By:
Complexity: mechanical
Type: docs
Source: k8s-workspace BACKLOG.md (PLAN-246 `.github` shard, catch-up dispatch
`.github-3`, 2026-08-20) — a `basePathPrefix` non-uniformity finding recorded
twice in BACKLOG.md (2026-08-17), both `src:k8s-workspace:TD-639`, itself an
open, unresolved `- [ ]` Follow-up in `k8s-workspace`'s own
`TD-639-pilot-deploy-path-repoint.md` (`APPROVED`).

<!-- Complexity: mechanical — adds a documentation comment to an existing
     workflow file; no new logic, no behavior change, no new input. -->

## Role
Codex Coder

## Context

`.github/workflows/monorepo-deploy-affected.yml` derives each fanned-out
app's `basePath` as `${{ inputs.basePathPrefix }}${{ matrix.slug }}` (line
61) — a single shared prefix concatenated with the app's own `slug`. This
assumes every app's real basePath is derivable from its slug via one shared
prefix, which is **not universally true**: `bvv-directory-web`'s real
basePath is `/directory-browser`, independent of its slug, and no
`basePathPrefix` value can produce that from `${prefix}bvv-directory-web`.

This exact gap was hit for real during `k8s-workspace:TD-639` (`APPROVED`,
"pilot deploy path repoint"), whose own resolution was to **not** stretch
`monorepo-deploy-affected.yml`'s `basePathPrefix` interface to cover
`bvv-directory-web` — instead it added a new, separate
`deploy-pilot-affected.yml` (in the `bvv-platform` monorepo, not here) that
calls `app-deploy-test.yml` directly per app with an explicit `basePath`,
bypassing `monorepo-deploy-affected.yml`'s prefix-derivation for the one app
where it doesn't fit. TD-639's own Retrospective left an explicit, still-open
Follow-up (`- [ ]`, unresolved as of this TD's authoring) recommending that
before any future onboarding of `monorepo-deploy-affected.yml` to more apps
("step 5" in TD-639's own language — the remaining ~10 `bvv-platform` apps
beyond the pilot, not yet scheduled as any live TD), each app's real basePath
should be verified against its own `deploy-test.yml` first, and the same
direct-call-to-`app-deploy-test.yml` workaround pattern reused wherever
`basePathPrefix` doesn't fit — rather than widening
`monorepo-deploy-affected.yml`'s own interface (e.g. adding a
per-app-basePath-override input) to chase one outlier.

`monorepo-deploy-affected.yml`'s own header comment (lines 1-21) already
documents that it is "opt-in infrastructure... [n]ot wired to fire
automatically anywhere yet" and has "zero effect" on today's callers — this
TD does not change that status. There is no live TD today scheduling "step
5" (the remaining-apps rollout) — confirmed via `grep -rn "step 5\|Step 5"`
across `k8s-workspace/.codex/tasks/` finding only TD-639's own retrospective
mention, no separate rollout TD. This TD therefore does not attempt to fix
the gap in code (there is no live caller hitting it yet, and no rollout TD to
scope a code fix against) — it records the guardrail directly in the file
most likely to be read by whoever picks up that future rollout, so the
already-learned lesson from TD-639 is not silently rediscovered.

## Goal

`.github/workflows/monorepo-deploy-affected.yml`'s header comment documents
the `basePathPrefix` non-uniformity gap and the TD-639-proven workaround
pattern, so a future caller onboarding more apps sees the guardrail in the
file itself rather than only in a k8s-workspace TD's retrospective.

## Scope

### Included
- `.github/workflows/monorepo-deploy-affected.yml` — add a comment block
  (near the existing header comment, or directly above the `basePathPrefix`
  input's `description:`) documenting: (a) the `basePathPrefix` +
  `${slug}` derivation assumes basePath is derivable from slug via one
  shared prefix, (b) this is known to be false for at least one real app
  (`bvv-directory-web` → `/directory-browser`), (c) `k8s-workspace:TD-639`
  worked around this by calling `app-deploy-test.yml` directly with an
  explicit `basePath` instead of routing through this workflow, and (d)
  before onboarding more apps to this workflow, verify each app's real
  basePath against its own `deploy-test.yml` and reuse the direct-call
  pattern where the prefix doesn't fit, rather than widening this workflow's
  interface to chase outliers.

### Excluded
- Adding a new input (e.g. a per-app basePath override map) to
  `monorepo-deploy-affected.yml` — no live caller needs it today; this TD is
  documentation-only per the Context above.
- Any change to `bvv-platform`'s `deploy-pilot-affected.yml` or any other
  file outside `TradeFairs/.github`.
- Resolving `k8s-workspace:TD-639`'s own open Follow-up checkbox — that
  checkbox lives in `k8s-workspace`, is owned by that repo's Architect, and
  is out of scope for a `.github`-repo TD. This TD only ensures the same
  guardrail is visible from the `.github` side; it does not close the
  k8s-workspace Follow-up.
- Any change to `.github/workflows/app-deploy-test.yml`,
  `app-ci.yml`, `app-release.yml`, or `app-adr073-verdict-gate.yml`.

## Steps

1. Re-confirm live before acting: re-read
   `.github/workflows/monorepo-deploy-affected.yml` and confirm line 61
   (`basePath: ${{ inputs.basePathPrefix }}${{ matrix.slug }}`) still reads
   as quoted in Context — STOP per the canonical STOP conditions if it does
   not match.
2. Add the guardrail comment block described in Scope/Included, placed
   immediately above the `basePathPrefix` input's `description:` field
   (lines 36-42) so it is visible exactly where a future editor would add a
   new app/prefix. Match the existing file's comment style and tone (see
   lines 1-21 for the established voice).
3. Do not alter any non-comment line — no input added, no default changed,
   no job/step logic touched.
4. Validate the workflow YAML still parses.

## Execution & Verification

- Required commands:
  - `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/monorepo-deploy-affected.yml'))"`
    (must exit 0 — confirms the YAML is still well-formed after the edit).
  - `git diff --stat` (must show exactly one file changed,
    `monorepo-deploy-affected.yml`, comment-only lines added).
- Required environment assumptions: `python3` with `pyyaml` on PATH.

## Acceptance Criteria
- [ ] `grep -n "bvv-directory-web" .github/workflows/monorepo-deploy-affected.yml`
      finds a new comment line documenting the `basePathPrefix`
      non-uniformity gap and the `bvv-directory-web` → `/directory-browser`
      example, placed above the `basePathPrefix` input's `description:`.
- [ ] `grep -n "TD-639" .github/workflows/monorepo-deploy-affected.yml` finds
      a comment line citing the `k8s-workspace:TD-639` direct-call workaround
      pattern.
- [ ] `git diff --stat` shows exactly one file changed
      (`.github/workflows/monorepo-deploy-affected.yml`), and
      `git diff -- .github/workflows/monorepo-deploy-affected.yml` shows only
      added `#`-comment lines — no existing line's non-comment content
      changed.
- [ ] `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/monorepo-deploy-affected.yml'))"`
      exits 0.

## STOP Conditions
- STOP if a task instruction conflicts with a Design Decision, skill, or architecture intent; escalate the conflict before proceeding.
- STOP if required TD sections are missing (Role, Execution & Verification, Acceptance Criteria, or Steps).
- STOP if targeted test commands are missing or ambiguous for production code changes.
- STOP if required inputs/files are missing or steps cannot be executed deterministically.
- STOP if the task requires architectural choices not explicitly defined in the TD.
- STOP if tests would need to be weakened, deleted, or bypassed to satisfy the TD unless explicitly authorized by the TD.
- STOP if execution would require modifying deprecated code or artifacts that the TD scope excludes.
- STOP if line 61's `basePath` derivation expression has changed materially since this TD was authored — do not guess at where to place the comment; re-confirm scope with the architect instead.

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
