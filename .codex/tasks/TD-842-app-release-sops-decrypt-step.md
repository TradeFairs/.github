Status: READY_FOR_CODER
Blocked-By:
Gate-Granted:
Complexity: complex
Type: code
Parent-Item: k8s-workspace:PLAN-250

## Role
Codex Coder

## Context
[ADR-013](https://github.com/TradeFairs/k8s-workspace/blob/main/docs/adrs/ADR-013-secrets.md)
requires SOPS+age decrypt-and-apply for both `test` and prod/demo-prod. `.github:TD-841` adds
this to the shared **test** reusable workflow (`app-deploy-test.yml`). This TD is TD-841's prod
twin: prod deploy for every app in
[k8s-workspace:PLAN-250](https://github.com/TradeFairs/k8s-workspace/blob/main/docs/plans/PLAN-250-test-liv11-demo-prod-sops-migration.md)
goes through the **separate** shared reusable workflow `TradeFairs/.github/.github/workflows/app-release.yml`'s
`deploy-prod` job (confirmed live while authoring `bvv-platform:TD-1081`: `bvv-directory-api`'s
`release.yml` calls `app-release.yml@v2.2.3`, not `app-deploy-test.yml` — every one of the 13
in-scope apps' `release.yml` is the same thin `uses:` shape). This gap was not identified when
PLAN-250 was originally scoped; it surfaced only once TD-1081 traced `bvv-directory-api`'s actual
prod deploy path and found `app-release.yml` has no decrypt step of its own, same shape as the
test-side gap TD-841 fixes.

Without this TD, every per-app TD in PLAN-250's batch can author a prod `secrets.enc.yaml` (as
TD-1081 does) but prod apply stays permanently manual — there is no automated path for it. This
TD is what makes prod apply automatic, mirroring TD-841 exactly but in the other shared workflow.

## Goal
`app-release.yml`'s `deploy-prod` job decrypts and applies
`<K8S_DIR>/overlays/prod/secrets.enc.yaml` via `sops -d ... | sudo kubectl apply -n "$NS" -f -`
immediately after "Run DB migrations (pre-deploy Job)" and before "Apply prod manifests" (same
ordering rationale as TD-841: the Secret must exist before the Deployment referencing it rolls
out), when-and-only-when that overlay's `secrets.enc.yaml` file exists in the checked-out repo.
When the file does not exist (every app not yet migrated on prod), the step is a clean no-op —
manual Secret application for those apps is completely unchanged.

## Scope
### Included
- `.github/workflows/app-release.yml`'s `deploy-prod` job: one new step, "Decrypt and apply SOPS
  secret (if migrated)", inserted after "Run DB migrations (pre-deploy Job)" and before "Apply
  prod manifests" (current file: after line ~597, before line ~599).
- Reuses the same `sops`/age-key provisioning on the liv11 self-hosted runner that TD-841 depends
  on (`deploy-prod` runs on the identical `[self-hosted, liv11]` runner as `app-deploy-test.yml`'s
  `deploy` job — no separate provisioning needed, verify `sops --version` still resolves in this
  job's context since it's a distinct job with its own checkout).

### Excluded
- Any change to `app-deploy-test.yml` (already covered, `.github:TD-841`).
- Any change to `release.yml` (the thin per-app caller) — the caller passes through
  `secrets: inherit` unchanged, no per-app caller edit needed.
- Authoring any app's `secrets.enc.yaml` for prod — that is each per-app TD's job
  (`bvv-platform:TD-1081` already does this for `bvv-directory-api`; the remaining per-app TDs in
  PLAN-250's batch do the same for their own app). This TD only builds the mechanism.
- Age key generation or rotation — reuses whatever PLAN-249/TD-841 already provisioned on the
  runner for prod-tier recipients.
- Fixing any pre-existing prod secret-key gap (e.g. `bvv-directory-api`'s missing Keycloak Admin
  keys, tracked separately in `bvv-platform:TD-1081`) — out of scope here.

## Steps
1. In `.github/workflows/app-release.yml`'s `deploy-prod` job, add a new step immediately after
   "Run DB migrations (pre-deploy Job)" and before "Apply prod manifests":
   ```yaml
   - name: Decrypt and apply SOPS secret (if migrated)
     run: |
       SECRET_FILE="$K8S_DIR/overlays/prod/secrets.enc.yaml"
       if [ -f "$SECRET_FILE" ]; then
         sops -d "$SECRET_FILE" | sudo kubectl apply -n "$NS" -f -
       else
         echo "::notice::$SECRET_FILE not present — app not yet migrated to SOPS on prod, skipping (manual secret application unchanged)"
       fi
   ```
   Uses the already-resolved `$NS`/`$K8S_DIR` env vars from "Resolve prod namespace from overlay"
   (same job, earlier step) — no new resolution needed.
2. Confirm `sops` + the prod-tier age private key(s) are available on the liv11 runner in this
   job's context (`sops --version`; check `SOPS_AGE_KEY_FILE`/`~/.config/sops/age/keys.txt` for
   the runner user — should already be present from TD-841's provisioning check, since both jobs
   run on the same runner, but verify independently since `deploy-prod` has its own fresh
   checkout/environment).
3. Verify the no-op path: dispatch (or wait for a natural trigger of) a prod release for an app
   with no `secrets.enc.yaml` on `prod` (any in-scope app before its own migration TD lands) and
   confirm the new step logs the `::notice::` skip line and the release otherwise proceeds
   unchanged.
4. Verify the live path once `bvv-platform:TD-1081` (or another per-app TD) lands a real prod
   `secrets.enc.yaml`: dispatch that app's prod release, confirm the decrypt step applies the
   Secret and the pod reads the decrypted value correctly.

## Execution & Verification
- Required commands:
  - `actionlint .github/workflows/app-release.yml` (or equivalent gate this repo already runs —
    confirm which one applies, same as TD-841).
  - Live: dispatch a prod release for an app with no prod `secrets.enc.yaml` yet; confirm
    `::notice::` skip line appears and release completes exactly as before.
  - Live (once at least one per-app TD has landed a real prod `secrets.enc.yaml`): dispatch that
    app's release, confirm the decrypt step applies and the pod reads the correct decrypted
    value.
- Required environment assumptions:
  - liv11 self-hosted runner has `sops` + prod-tier age key(s) already provisioned (reuses
    TD-841's dependency, verified independently for the `deploy-prod` job context).

## Acceptance Criteria
- [ ] New "Decrypt and apply SOPS secret (if migrated)" step added to `app-release.yml`'s
      `deploy-prod` job, positioned after "Run DB migrations" and before "Apply prod manifests".
- [ ] For an app with no prod `secrets.enc.yaml`, a live prod release shows the `::notice::` skip
      line and completes with identical behavior to before this TD (no regression for any
      not-yet-migrated app).
- [ ] For an app that has adopted SOPS on prod, a live release decrypts and applies
      `overlays/prod/secrets.enc.yaml` before the Deployment rollout, and the pod reads the
      correct decrypted value.
- [ ] No change to `app-deploy-test.yml`, `release.yml` (thin callers), or any other workflow.

## STOP Conditions
- STOP if a task instruction conflicts with a Design Decision, skill, or architecture intent;
  escalate the conflict before proceeding.
- STOP if required TD sections are missing (Role, Execution & Verification, Acceptance Criteria,
  or Steps).
- STOP if the liv11 runner does not actually have `sops`/the prod age key available in the
  `deploy-prod` job's context — this is a live prerequisite gap, not something to route around.
- STOP if the no-op path (missing `secrets.enc.yaml`) cannot be verified live before merging — a
  silent regression to every existing prod release is the single most expensive failure mode
  this TD could introduce.
- STOP if required inputs/files are missing or steps cannot be executed deterministically.
- STOP if the task requires architectural choices not explicitly defined in the TD.

## Retrospective
Added the "Decrypt and apply SOPS secret (if migrated)" step to `app-release.yml`'s
`deploy-prod` job, positioned exactly as specified: after "Run DB migrations (pre-deploy
Job)" and before "Apply prod manifests". The step reuses the already-resolved `$NS`/`$K8S_DIR`
env vars from earlier in the same job and is a clean no-op (`::notice::` skip) when
`overlays/prod/secrets.enc.yaml` does not exist, matching TD-841's shape in
`app-deploy-test.yml`.

`actionlint` (via the `rhysd/actionlint` Docker image, since no local binary or repo-native
lint gate for this file was found) reports zero new findings on the added lines; the two
pre-existing findings (`self-hosted`/`liv11` custom runner label at line 458, and a
pre-existing SC2086 in "Apply prod manifests" at line ~609) are both outside this TD's
`Included` scope and unrelated to this change (the SC2086 one is explicitly TD-840's territory
per this repo's TD history).

Live verification (AC items 2-3: no-op path and live-decrypt path via a real prod dispatch)
was not performed in this session — no in-scope app currently ships a prod `secrets.enc.yaml`
that would exercise the live path (`bvv-platform:TD-1081` had not yet landed one at
implementation time), and dispatching a live prod release is outside a Coder's mechanical-edit
scope without an explicit trigger. This mirrors TD-841's same constraint. Flagging for the
Architect/Tester to confirm via a natural or dispatched prod release once available, per the
TD's own STOP condition on the no-op path needing live verification before merge.

### Follow-ups
- Medium: Live verification of both the no-op skip path and the real-decrypt path (Steps 3-4,
  AC items 2-3) still needs to happen against an actual prod dispatch before this can be
  considered fully verified — not exercised in this implementation session.

### Severity (povinné pro každý nález)
| Úroveň | Definice |
|--------|----------|
| **High** | Ztráta produkčních dat, bezpečnostní zranitelnost nebo tichá degradace (silent failure bez viditelného erroru). |
| **Medium** | Výrazně nefunkční část funkcionality viditelná uživateli nebo blocker pro navazující TDs. |
| **Low** | Developer experience, kosmetická vada nebo technický dluh bez dopadu na produkční uživatele. |
