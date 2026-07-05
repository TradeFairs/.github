# .github

Org-level reusable GitHub Actions workflows + defaults (PLAN-104 X3).

Consumers call these via thin caller workflows pinned to the movable major tag `@v2`
(PLAN-105 convention: after moving `v2`, a **fresh run** is required — a rerun keeps
the old tag resolution). See `CHANGELOG.md` for versioned changes.

## Reusable workflows

### `app-ci.yml` — lint, typecheck, unit tests + build-once-on-PR image (ADR-023 §K.1, ADR-034)

| Input | Type | Required | Default | Description |
|---|---|---|---|---|
| `slug` | string | yes | — | App slug (repo/image/deployment name), e.g. `dovolenky`. |
| `basePath` | string | yes | — | App base path, e.g. `/dovolenky`. |
| `runYalcGuard` | boolean | no | `false` | Fail if `package.json` carries dev-only `file:.yalc/` refs (PLAN-062). |
| `runReleaseOrder` | boolean | no | `false` | Run the `@tradefairs/*` publish-order gate (`.github/scripts/release-order.sh`) before `ci` (PLAN-063). |
| `postgres` | string | no | `none` | Provision a Postgres for the `ci` job: `none` \| `alpine` \| `pgvector`. |
| `dbMigrate` | boolean | no | `false` | Run `pnpm db:migrate` against the provisioned Postgres (requires `postgres != none`). |
| `dbTests` | boolean | no | `false` | Expose `DATABASE_URL` to `pnpm test` so DB-gated (`describeIfDb`) suites run (requires `postgres != none` + `dbMigrate`). |
| `basePathGuard` | string | no | `standard` | Hardcoded-basePath-literal guard (ADR-024 §G): `standard` \| `off`. |
| `buildVerify` | boolean | no | `false` | Build the PR Docker image **without pushing** to ghcr.io — verify-only compile check for apps without PR-image promotion (ADR-045 admin-prod-only profile, e.g. bvv-test-admin). |

### `app-deploy-test.yml` — deploy to `<slug>-test` namespace on push to main (ADR-023 §K.2)

| Input | Type | Required | Default | Description |
|---|---|---|---|---|
| `slug` | string | yes | — | App slug. |
| `basePath` | string | yes | — | App base path on test, e.g. `/dovolenky` (or `/test/<slug>` for api-internal). |
| `smokeMode` | string | no | `ingress` | Smoke-test transport: `ingress` (public `https://test-liv11.brno.bvv.cz<basePath>/api/version`) \| `port-forward` (`kubectl port-forward` to the Service + curl via localhost, for cluster-internal apps without an IngressRoute — ADR-020, ADR-045 api-internal profile, e.g. bvv-directory-api). |

### `app-release.yml` — release to production via caller `workflow_dispatch` (ADR-023 §K.3, PLAN-105)

| Input | Type | Required | Default | Description |
|---|---|---|---|---|
| `slug` | string | yes | — | App slug. |
| `basePath` | string | yes | — | Prod base path, e.g. `/dovolenky`. |
| `releaseVersion` | string | yes | — | Release version (must match `package.json` SNAPSHOT minus suffix). |
| `nextVersion` | string | yes | — | Next development version (`-SNAPSHOT` added automatically). |
| `smokeMode` | string | no | `ingress` | Prod smoke-test transport: `ingress` (public `https://liv11.brno.bvv.cz<basePath>/api/version`) \| `port-forward` (see app-deploy-test — ADR-045 api-internal profile). |
| `skipTestPreflight` | boolean | no | `false` | Skip the **advisory** "test namespace runs main HEAD" preflight — for prod-only apps without a test deployment (ADR-045 admin-prod-only profile, e.g. bvv-test-admin). The preflight is warning-only and never fails a release. |

All three workflows expect `secrets: inherit` (they use `NPM_TOKEN` and `GITHUB_TOKEN`).
