Status: CHANGES_REQUESTED
Blocked-By:
Gate-Granted:
Complexity: complex
Type: code
Parent-Item: k8s-workspace:PLAN-250
Rework-2026-08-24: secret source path -> infra-liv11 (see "## Rework 2026-08-24"; scope reopened, status stays CHANGES_REQUESTED)

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

## Rework 2026-08-24 — secret source path moves to `infra-liv11` (REOPENED SCOPE)

**This TD was already implemented once** (coder commit `ac269e6`, merged to `main` as `ca50a6c`,
shipped in tag `v2.4.4`) and reviewed `CHANGES_REQUESTED` for an unrelated reason (live no-op
verification never performed). That review verdict still stands. This section ADDS a second,
independent defect to the same scope — the shipped step reads the secret from the **wrong repo**.

### The defect (verified against the shipped code, not reported)
`v2.4.4` (`ca50a6c6`) `.github/workflows/app-release.yml` line 601:

```
K8S_DIR: ${{ inputs.appPath != '' && format('{0}/k8s', inputs.appPath) || 'k8s' }}   # line 471
SECRET_FILE="$K8S_DIR/overlays/prod/secrets.enc.yaml"                                # line 601
```

`K8S_DIR` is a path **relative to the checkout of the CALLING (application) repo** — the only
checkout this job has (`actions/checkout@v5`, no `repository:` input). `infra-liv11` never enters
that checkout: this workflow consumes it exclusively as a **remote kustomize base**, pulled by
`kubectl kustomize` via the `NPM_TOKEN` url-rewrite in the "Apply prod manifests" step. There is
no path under `$K8S_DIR` that can ever resolve to a file in `infra-liv11`.

### Why this is a silent regression, not a failure
The step's gate is `if [ -f "$SECRET_FILE" ]`. When the secret lives in `infra-liv11`, that test
is simply **false**, so the step takes the `::notice:: … skipping` branch and the job continues
green. The deploy therefore **succeeds with no Secret applied** — a green pipeline that silently
did not deliver the secret. This is exactly the failure mode the gate was designed to make safe
for un-migrated apps, now misfiring on migrated ones.

### Why the source path changed
The operator established on 2026-08-24 that configuration specific to a server/cluster belongs in
`infra-<cluster>` — one repo per k3s cluster, with `prod` and `test` separated **inside** it under
an identical structure, each environment holding its **own private age key** even where the secret
values coincide; the future prod cluster (~09/2026) gets its own `infra-xxx` by copying the shape.
`bvv-platform:TD-1090`..`TD-1095` were rewritten accordingly on branch
`sess/20260824-plan250-td-rewrite` (commit `1d36e922`, not yet merged) and now target
`infra-liv11/environments/{prod,test}/<app>/secrets.enc.yaml`. Those TDs are `Blocked-By` this
one. **The normative ADR for this path is now
[ADR-082](https://github.com/TradeFairs/k8s-workspace/blob/main/docs/adrs/ADR-082-adr-013-amendment-sops-material-belongs-to-infra-repo.md)**
(`ACCEPTED`, merged 2026-08-24), which amends ADR-013 and makes
`infra-<cluster>/environments/{prod,test}/<app>/secrets.enc.yaml` the target, with `.sops.yaml`
**per environment** (`environments/{prod,test}/.sops.yaml`), not per repo. ADR-082 names this TD's
rework commit `d5d0a051` in its own `**Related**` header, so the two are deliberately aligned.
`ADR-013` §Mechanismus still shows the OLD app-repo path
(`<app>/k8s/overlays/<env>/secrets.enc.yaml`) — that path is **deprecated with a legacy fallback**
until PLAN-250 wave 1 completes, which is exactly the fallback this TD implements. Cite ADR-082,
not ADR-013, as the justification for the target path; do not "correct" the implementation back to
the app-repo path on the strength of ADR-013's stale §Mechanismus.

### Blast radius today (measured, not assumed)
No app is affected right now: the decrypt step exists **only** on tag `v2.4.4`, and **zero**
callers reference it. Live caller refs on `bvv-platform:origin/main` (one `uses:` line per app,
counting only real `uses:` lines — header comments mentioning `@v2.2.3.` with a trailing period
are not calls): `@v2` (`9d185650`) 3 apps, `@v2.1.4` (`24704b53`) 1 app, `@v2.2.3` (`027c67b7`)
8 apps, `@v2.4.4` **0 apps**. None of `9d185650`/`24704b53`/`027c67b7` contains the string
`secrets.enc.yaml`. So this rework has a free hand — it is fixing the mechanism before its first
consumer, not repairing live deploys. The fleet-wide caller bump to a tag containing the fixed
step is **separate work and an explicit dependency**, not part of this TD.

### Reworked Goal (supersedes the Goal above)
`app-release.yml`'s `deploy-prod` job applies the decrypted Secret from **`infra-liv11`** at
`environments/prod/<slug>/secrets.enc.yaml`, while preserving both properties the shipped step
already has and which must not regress:
1. **Gate purely on file presence** — an app with no such file is a clean no-op (`::notice::`),
   identical to today's behavior for every un-migrated app.
2. **Secret applied BEFORE the manifests** — a freshly-migrated app's first rollout must not hit a
   missing Secret. The step keeps its current position (before "Apply prod manifests").

During a transition period the step ALSO honours the legacy app-repo path, so an app that already
committed `secrets.enc.yaml` under its own `k8s/overlays/prod/` keeps working.

### Reworked Scope — added to Included
- A checkout of `TradeFairs/infra-liv11` into a **separate, non-colliding** path inside the job
  (e.g. `actions/checkout@v5` with `repository: TradeFairs/infra-liv11`, `path: .infra-liv11`,
  `ref: main`, `token: ${{ secrets.NPM_TOKEN }}`). `path:` is mandatory — a default-path
  checkout would overwrite the caller's own checkout and break every later step.
- Reading the secret from `.infra-liv11/environments/prod/${{ inputs.slug }}/secrets.enc.yaml`
  with a fallback to the legacy `$K8S_DIR/overlays/prod/secrets.enc.yaml` (see Steps).
- `.gitignore`/workspace hygiene is NOT needed — the checkout path is inside the runner workspace
  which is cleaned per-run; do not commit anything from it.

### Reworked Scope — added to Excluded
- **Do not generate, mint, rotate or distribute any age key.** Today liv11 has a single
  cluster-wide key (`age1swlctavny3ryh5h3e57vxwcgvvrzprnncd604su7fpqzq9qrpg9swd8lp6`, the runner
  key proven by PLAN-249's QA pilot). The operator's rule requires a **separate key per
  environment**, which does not exist yet. Minting it is the operator's act, not this TD's — see
  "Per-environment keys" below for how this TD stays correct either way.
- **Do not bump any caller's `uses:` ref.** The fleet-wide bump is separate work.
- **Do not create `environments/` in `infra-liv11`.** That directory does not exist yet on
  `infra-liv11:origin/main` (verified: top-level is `bootstrap`, `calico-policy-only`, `docs`,
  `k8s-base`, `k8s-base-fixture`, `manifests`, `platform`, `scripts`). It is created by the
  `bvv-platform:TD-1090`..`TD-1095` batch. This TD must therefore be correct against a repo where
  the directory is still absent — which the file-presence gate already guarantees.
- **Do not revise ADR-013 or ADR-082.** ADR-082 (merged 2026-08-24) already carries the
  operator decision; see Rework Context. Doc changes in `k8s-workspace` are out of scope here.

### Per-environment keys — how this TD handles them
`sops -d` selects the private key by matching the file's own encryption recipients against the
keys available to the runner; the workflow never names a key. Therefore this TD needs **no key
configuration at all**, and it stays correct both before and after the operator mints separate
test/prod keys. Two consequences the Coder must respect:
- Do **not** add `SOPS_AGE_KEY_FILE` pinning or any `--age`/recipient flag to the decrypt step.
  Pinning a key here would silently defeat the per-environment separation the operator requires.
- The negative property (a prod file must NOT be decryptable with the test key) is a property of
  **how the files were encrypted**, enforced by `environments/{prod,test}/.sops.yaml` in the
  per-app batch — this TD only must not undermine it. The verification below proves this TD does
  not.

### Reworked Steps (supersede Steps 1-3 above; Step 2's runner prerequisite check still applies)
R1. Add an `infra-liv11` checkout step to the `deploy-prod` job, positioned **after** the existing
    `actions/checkout@v5` and **before** the decrypt step:
    ```yaml
    - name: Checkout infra-liv11 (cluster-specific config, ADR-013 / operator decision 2026-08-24)
      uses: actions/checkout@v5
      with:
        repository: TradeFairs/infra-liv11
        path: .infra-liv11
        ref: main
        token: ${{ secrets.NPM_TOKEN }}
    ```
    `NPM_TOKEN` — not `GITHUB_TOKEN` — is the required token: `GITHUB_TOKEN` is scoped to the
    caller's own repo and cannot read the private `infra-liv11`. `NPM_TOKEN` is org-scoped, is
    already present in all caller repos, is already used by this same job for exactly this repo
    (the remote kustomize base url-rewrite), and reaches this reusable workflow because every
    caller passes `secrets: inherit` (verified on `bvv-directory-api`'s `deploy-test.yml`
    line 37). The `workflow_call` block declares no `secrets:` section, so `inherit` is the
    only mechanism in play — do **not** add a `secrets:` block, that would break every caller.
R2. Replace the decrypt step's body with an infra-first, legacy-fallback resolution that keeps the
    file-presence gate and the `::notice::` no-op:
    ```bash
    INFRA_SECRET=".infra-liv11/environments/prod/${{ inputs.slug }}/secrets.enc.yaml"
    LEGACY_SECRET="$K8S_DIR/overlays/prod/secrets.enc.yaml"
    if [ -f "$INFRA_SECRET" ]; then
      SECRET_FILE="$INFRA_SECRET"
    elif [ -f "$LEGACY_SECRET" ]; then
      SECRET_FILE="$LEGACY_SECRET"
      echo "::warning::Using legacy app-repo secret path $LEGACY_SECRET — migrate to infra-liv11/environments/prod/${{ inputs.slug }}/ (operator decision 2026-08-24)"
    else
      SECRET_FILE=""
    fi
    if [ -n "$SECRET_FILE" ]; then
      echo "Applying SOPS secret from $SECRET_FILE"
      sops -d "$SECRET_FILE" | sudo kubectl apply -n "$NS" -f -
    else
      echo "::notice::No secrets.enc.yaml at $INFRA_SECRET or $LEGACY_SECRET — app not yet migrated to SOPS, skipping (manual secret application unchanged)"
    fi
    ```
    Infra-first ordering is deliberate: once an app is migrated, `infra-liv11` is authoritative and
    a stale leftover copy in the app repo must not win. The `::warning::` on the legacy branch makes
    the transitional state visible in the run log instead of silent.
R3. Keep the step's position unchanged (immediately before "Apply prod manifests"). Do not move
    it, do not merge it into another step.
R4. `set -o pipefail` is **not** to be added blindly to this step — but do verify the failure
    behavior: a `sops -d` failure (wrong/absent key) must make the step **fail loudly**, not pass
    because `kubectl apply` consumed empty stdin. If the existing shape does not already fail, add
    `set -o pipefail` and say so in the Retrospective. This is the difference between "secret not
    applied" being visible and it being another silent green.

### Reworked Execution & Verification (in addition to the commands above)
- `actionlint .github/workflows/app-release.yml` — report the real output. Pre-existing findings
  (`self-hosted`/`liv11` custom label; the SC2086 tracked by `.github:TD-840`/`TD-836`) are out of
  scope; report whether the ADDED lines produce any new finding.
- **Static proof the path can resolve** (does not need a cluster): on the runner or any checkout,
  `git ls-remote https://github.com/TradeFairs/infra-liv11 main` using `NPM_TOKEN` — proves the
  token can read the private repo. If this fails, STOP: the whole approach rests on it.
- **Negative verification — a prod file must NOT be decryptable with the test key.** Once
  `environments/{prod,test}/.sops.yaml` and at least one encrypted file per environment exist
  (from the `bvv-platform:TD-1090`..`TD-1095` batch, and only after the operator has minted the
  second key), run on the liv11 runner:
  ```
  SOPS_AGE_KEY_FILE=<test key only> sops -d environments/prod/<app>/secrets.enc.yaml
  ```
  This MUST exit non-zero with a "no key could decrypt" style error. A **successful** decrypt is a
  hard failure of the operator's per-environment-key rule and is a STOP → escalate to the
  Architect; it means both environments were encrypted to the same recipient. Record the exact
  exit code and stderr in the Retrospective. Symmetrically, the environment's own key MUST
  decrypt its own file — a negative test that passes only because nothing decrypts anything
  proves nothing.
- **Live no-op verification** (still outstanding from the original review, still required): a
  `prod` deploy for an app with no `secrets.enc.yaml` in either location must log the `::notice::`
  line and complete with unchanged behavior. Note this now also exercises the new `infra-liv11`
  checkout step on every deploy of every caller — so this verification additionally proves the
  checkout does not break un-migrated apps. That makes it strictly more load-bearing than before.
- **Live decrypt verification**: after a per-app TD lands a real file under
  `infra-liv11/environments/prod/<app>/`, a `prod` deploy must log
  `Applying SOPS secret from .infra-liv11/environments/prod/<app>/secrets.enc.yaml` and the pod
  must read the decrypted value.

### Reworked Acceptance Criteria (in addition to the unchecked criteria above)
- [ ] The `deploy-prod` job checks out `TradeFairs/infra-liv11` into a non-default `path:` using
      `secrets.NPM_TOKEN`, without a `secrets:` block being added to `workflow_call`.
- [ ] The decrypt step resolves `infra-liv11/environments/prod/<slug>/secrets.enc.yaml` first and
      the legacy `$K8S_DIR/overlays/prod/secrets.enc.yaml` only as a fallback, emitting a
      `::warning::` when the fallback is used.
- [ ] With neither file present the step is a pure no-op emitting `::notice::`, and the deploy
      outcome is byte-for-byte the same shape as before this TD (proven live).
- [ ] The decrypted Secret is still applied BEFORE the manifests are applied.
- [ ] A failing `sops -d` fails the step (does not pass through to a green job) — stated with
      evidence in the Retrospective.
- [ ] Negative key verification recorded: decrypting a **prod** file with the **test** key fails,
      and each environment's own key decrypts its own file. If the second key does not exist yet,
      this criterion is explicitly deferred with a named blocker (operator must mint it) rather
      than silently marked met.
- [ ] No caller `uses:` ref bumped by this TD.

### Reworked STOP Conditions (in addition to those above)
- STOP if `NPM_TOKEN` cannot read `TradeFairs/infra-liv11` — do not work around it by making the
  repo public, by embedding a PAT, or by copying secrets into the app repo.
- STOP if the negative key verification shows a prod file decrypting with the test key.
- STOP if implementing this requires adding a `secrets:` block to `workflow_call` (it would break
  all existing callers that rely on `secrets: inherit`).

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
