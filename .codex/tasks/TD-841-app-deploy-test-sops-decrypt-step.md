Status: READY_FOR_REVIEW
Blocked-By:
Gate-Granted:
Complexity: complex
Type: code
Parent-Item: k8s-workspace:PLAN-250

## Role
Codex Coder

## Context
[ADR-013](https://github.com/TradeFairs/k8s-workspace/blob/main/docs/adrs/ADR-013-secrets.md)
(SOPS+age secrets management) requires that a deploy pipeline decrypt an app's
`secrets.enc.yaml` via `sops -d ... | kubectl apply -f -` instead of the current manual
`kubectl create secret` / hand-applied `env-secret*.yaml.template` pattern documented in
`k8s-workspace/docs/architecture/secrets-inventory.md` §1/§5.

[k8s-workspace:PLAN-249](https://github.com/TradeFairs/k8s-workspace/blob/main/docs/plans/archive/PLAN-249-new-prod-cluster-bootstrap-sops-from-day-one.md)
already proved this decrypt-and-apply mechanism end-to-end on the liv11 self-hosted runner, but
deliberately via its own standalone `deploy-qa.yml` workflow in `bvv-platform` — NOT by touching
this repo's `app-deploy-test.yml` — specifically to avoid risking the shared path before the
mechanism was proven (see that workflow file's own top-of-file comment).

This repo's `.github/workflows/app-deploy-test.yml` is the single reusable workflow that every
one of `bvv-platform`'s 13 apps' `deploy-test.yml` calls via `uses:` (confirmed live — each
caller is a thin wrapper passing only `slug`/`basePath`). Adding the SOPS decrypt step here, once
correctly gated, lets every app in
[k8s-workspace:PLAN-250](https://github.com/TradeFairs/k8s-workspace/blob/main/docs/plans/PLAN-250-test-liv11-demo-prod-sops-migration.md)
adopt SOPS on `test` by simply committing a `secrets.enc.yaml` + `.sops.yaml` — no further
per-app workflow change needed on the test side. Getting the gating wrong here breaks deploy for
every one of the 13 callers, not just one app — this is the highest-blast-radius TD in the
migration.

## Goal
`app-deploy-test.yml`'s `deploy` job decrypts and applies `<K8S_DIR>/overlays/test/secrets.enc.yaml`
via `sops -d ... | sudo kubectl apply -n "$NS" -f -` immediately after "Apply manifests" (so the
Secret exists before any Deployment/pod referencing it is applied — actually, apply the decrypted
Secret BEFORE "Apply manifests", since a pod referencing a missing Secret at rollout time fails;
see Steps), when-and-only-when that overlay's `secrets.enc.yaml` file exists in the checked-out
repo. When the file does not exist (every app not yet migrated), the step is a clean no-op — the
existing manual-Secret-application deploy behavior for those apps is completely unchanged.

## Scope
### Included
- `.github/workflows/app-deploy-test.yml`'s `deploy` job: one new step, "Decrypt and apply SOPS
  secret", inserted before the existing "Apply manifests" step.
- The `sops` binary and the shared `test` age private key must already be present on the liv11
  self-hosted runner (per PLAN-249's own runner-side provisioning, already done for the pilot —
  verify with `sops --version` and the default `SOPS_AGE_KEY_FILE`/`~/.config/sops/age/keys.txt`
  path on the runner; if missing, that is a live blocker to record, not something this TD
  provisions — provisioning was PLAN-249's job).

### Excluded
- Any change to `deploy-qa.yml`, `deploy-affected.yml`, or `monorepo-deploy-affected.yml`.
- A prod-side reusable workflow — none currently exists (`app-deploy-prod.yml` was searched for
  and not found; prod/demo-prod apply is out of scope here, tracked as a separate follow-up TD in
  `k8s-workspace:PLAN-250`).
- Actually authoring any app's `secrets.enc.yaml`/`.sops.yaml` — that is each per-app TD's job
  (`bvv-platform:TD-1084`..`TD-1089`), not this one. This TD only builds the mechanism the
  per-app TDs then use.
- Age key generation or rotation — reuses whatever PLAN-249 already provisioned on the runner.

## Steps
1. In `.github/workflows/app-deploy-test.yml`, add a new step immediately before "Apply
   manifests" (currently the step running `kubectl kustomize ... | sudo kubectl apply -f -`),
   named "Decrypt and apply SOPS secret (if migrated)":
   ```yaml
   - name: Decrypt and apply SOPS secret (if migrated)
     run: |
       SECRET_FILE="$K8S_DIR/overlays/test/secrets.enc.yaml"
       if [ -f "$SECRET_FILE" ]; then
         sops -d "$SECRET_FILE" | sudo kubectl apply -n "$NS" -f -
       else
         echo "::notice::$SECRET_FILE not present — app not yet migrated to SOPS, skipping (manual secret application unchanged)"
       fi
   ```
   Place it after the "Resolve test namespace from overlay" step (needs `$NS`/`$K8S_DIR` already
   set) and before "Apply manifests" — the Secret must exist before the Deployment referencing it
   is applied, otherwise a fresh-migration app's first rollout would fail on a missing Secret.
2. Confirm the liv11 runner has `sops` installed and the shared `test` age private key
   available at the default lookup path (`sops --version`; check
   `SOPS_AGE_KEY_FILE`/`~/.config/sops/age/keys.txt` for the `runner` user — this was provisioned
   by PLAN-249's TD-1074/TD-1075 for the pilot; verify it survived, do not re-provision from
   scratch unless found missing).
3. Verify the no-op path is genuinely a no-op: dispatch (or wait for a natural trigger of) a
   `test` deploy for an app with no `secrets.enc.yaml` (any of the 13 in-scope apps, before their
   own migration TD lands) and confirm the new step logs the `::notice::` skip line and the
   deploy otherwise proceeds unchanged (same steps, same outcome as before this TD).

## Execution & Verification
- Required commands:
  - `actionlint .github/workflows/app-deploy-test.yml` (or equivalent shellcheck/actionlint gate
    already run by this repo's own CI — confirm which one applies).
  - Live: dispatch a `test` deploy for an app with no `secrets.enc.yaml` yet; confirm `::notice::`
    skip line appears in the run log and the deploy completes exactly as before.
  - Live (once at least one per-app TD from `k8s-workspace:PLAN-250`'s first batch has landed a
    real `secrets.enc.yaml`): dispatch that app's `test` deploy; confirm the decrypt step applies
    the Secret and the pod reads the decrypted value correctly (`kubectl exec` env check or app's
    own `/api/version`-style self-report, per that app's own TD).
- Required environment assumptions:
  - liv11 self-hosted runner has `sops` + the shared test age key already provisioned (PLAN-249
    dependency, not this TD's job to (re-)provision).

## Acceptance Criteria
- [ ] New "Decrypt and apply SOPS secret (if migrated)" step added to `app-deploy-test.yml`,
      positioned before "Apply manifests".
- [ ] For an app with no `secrets.enc.yaml`, a live `test` deploy shows the `::notice::` skip
      line and completes with identical behavior to before this TD (no regression for any of the
      13 not-yet-migrated callers).
- [ ] For an app that has adopted SOPS (once one exists), a live `test` deploy decrypts and
      applies the Secret before the Deployment rollout, and the pod reads the correct decrypted
      value.
- [ ] No change to `deploy-qa.yml`, `deploy-affected.yml`, `monorepo-deploy-affected.yml`, or any
      prod-side path.

## STOP Conditions
- STOP if a task instruction conflicts with a Design Decision, skill, or architecture intent;
  escalate the conflict before proceeding.
- STOP if required TD sections are missing (Role, Execution & Verification, Acceptance Criteria,
  or Steps).
- STOP if the liv11 runner does not actually have `sops`/the test age key available — this is a
  live prerequisite gap, not something to route around with a workaround in this workflow.
- STOP if the no-op path (missing `secrets.enc.yaml`) cannot be verified live before merging —
  a silent regression to all 13 existing callers is the single most expensive failure mode this
  TD could introduce.
- STOP if required inputs/files are missing or steps cannot be executed deterministically.
- STOP if the task requires architectural choices not explicitly defined in the TD (e.g. whether
  to also add a prod-side reusable workflow — explicitly excluded above).

## Retrospective
Added the "Decrypt and apply SOPS secret (if migrated)" step to
`.github/workflows/app-deploy-test.yml`'s `deploy` job, inserted immediately before "Apply
manifests" (after "Set image tag in test overlay kustomization", which is itself after "Resolve
test namespace from overlay" so `$NS`/`$K8S_DIR` are already set). The step is a pure
file-existence gate on `$K8S_DIR/overlays/test/secrets.enc.yaml`: when absent it emits the
`::notice::` skip line and does nothing else; when present it pipes `sops -d` into
`sudo kubectl apply -n "$NS" -f -`, exactly as specified in Steps §1.

`actionlint` (run via `docker run rhysd/actionlint:latest` — no local binary and no in-repo CI
config runs actionlint against this repo's own workflow files, since `.github` is the reusable-
workflow source repo, not a consumer) reported two findings, both pre-existing and unrelated to
this change: (1) `runs-on: [self-hosted, liv11]` — an unknown custom label to actionlint's
built-in label list (line 273, pre-existing, not part of this TD's scope), and (2) SC2086 at line
426 in the pre-existing "Set image tag in test overlay kustomization" step (this is sibling
TD-840's exact subject, tracked separately). My inserted step (lines 434-448) produced zero new
findings.

Runner-side prerequisite verification (Steps §2) was partial: `sops 3.13.3` is confirmed present
system-wide at `/usr/local/bin/sops` on liv11 (in PATH for any user, including the `runner`
GHA-runner account). I could NOT directly inspect `/home/runner/.config/sops/age/keys.txt` from my
own SSH session — `/home/runner` is `700`-permission-isolated from my own user, which is the
*correct* posture (not evidence of absence). I have no passwordless-sudo path to the `runner`
account from this session to confirm the age key file itself. Per the TD's own guidance
("verify it survived, do not re-provision... if missing, that is a live blocker to record, not
something this TD provisions"), I'm recording this as a partial verification rather than treating
it as a STOP: the binary is confirmed, the key file is unconfirmed-but-plausible (PLAN-249 is
recorded as having provisioned and proven this exact mechanism end-to-end on this same runner for
its own pilot). This should be closed out by whoever runs the live-dispatch verification below.

The TD's Execution & Verification also calls for two *live* dispatches (no-op path on an
unmigrated app; real decrypt path once a per-app TD lands a `secrets.enc.yaml`). Neither was
performed in this coding turn: `app-deploy-test.yml` is only reachable via `workflow_call` from a
caller's `uses:` reference — there is no standalone `workflow_dispatch` trigger on this file to
invoke it directly, and a real caller-side dispatch only exercises the branch once merged (or a
caller temporarily points its `uses:` ref at this branch, which is a cross-repo coordination step
outside a single-TD Coder turn). Both live-verification lines are left as explicit follow-ups
below for the review/merge stage, per this workspace's Coder-does-not-merge-own-work convention —
they are exactly the kind of check that belongs after a PR exists, not before.

### Follow-ups
- Medium: Live-dispatch verification of the no-op path (deploy for an app with no
  `secrets.enc.yaml`, confirm `::notice::` skip line and unchanged deploy outcome) has not yet
  been performed — required before merge per this TD's own STOP condition. Needs a PR/branch ref
  a caller can exercise, or a temporary `uses:`-ref override in one of the 13 caller repos.
- Low: Live-dispatch verification of the decrypt path (once a per-app TD from
  `bvv-platform:TD-1084`..`TD-1089` lands a real `secrets.enc.yaml`) is naturally blocked until
  one of those per-app TDs lands; tracked here as a pointer back to this TD for whoever performs
  that first real-secret test deploy.
- Low: Could not directly confirm the `runner` user's age private key file
  (`~/.config/sops/age/keys.txt` under `/home/runner`, `700`-permission-isolated from this
  session) survived from PLAN-249's provisioning — only the system-wide `sops` binary was
  directly confirmed. Worth a quick `sudo -u runner sops -d <known-test-file>` smoke check by
  whoever has runner-level access, before the first real decrypt dispatch.

### Severity (povinné pro každý nález)
| Úroveň | Definice |
|--------|----------|
| **High** | Ztráta produkčních dat, bezpečnostní zranitelnost nebo tichá degradace (silent failure bez viditelného erroru). |
| **Medium** | Výrazně nefunkční část funkcionality viditelná uživateli nebo blocker pro navazující TDs. |
| **Low** | Developer experience, kosmetická vada nebo technický dluh bez dopadu na produkční uživatele. |
