# Changelog

Reusable workflow changes, newest first. `v2` is the movable major tag (PLAN-105);
after moving it, consumers need a **fresh run** (not a rerun) to pick it up.

## v2.5.8 — Secret/ConfigMap apply před migrate Jobem

- `app-deploy-test.yml` + `app-release.yml`: kroky **Decrypt and apply SOPS
  secret** a **Apply plaintext config** se teď spouští PŘED **Run DB
  migrations (pre-deploy Job)**, ne až po něm. Migrate Job má stejný
  `envFrom` na `<slug>-env-{test,prod}` Secret jako Deployment, ale jen
  ordering vůči Deploymentu byl ošetřený. Každý dosavadní deploy měl Secret
  živý z předchozího běhu, takže to nevadilo — objevil to až drill fáze 7
  (cattle-not-pets, gis-dms/test rebuild-from-git) na čerstvém namespace bez
  předchozího stavu: migrate Job spadl na `CreateContainerConfigError:
  secret "gis-dms-env-test" not found`. Beze změny chování pro běžný případ
  (Secret už existuje).

## v2.5.6 — deploy zakládá namespace (cattle-not-pets fáze 1)

- `app-deploy-test.yml` + `app-release.yml`: nový krok **Ensure namespace
  exists** hned po resoluci overlaye — `kubectl apply -f
  .infra-liv11/environments/<env>/<slug>/namespace.yaml`, pokud soubor existuje
  (jinak `::notice::` skip: ns `platform`, k2-mcp, nemigrované appky). Ruční
  SSH krok „založ namespace před prvním deployem" tím padá; u existujících
  appek je apply no-op. Viz platform-workspace
  `docs/design/cattle-not-pets.md` fáze 1.

## v2.1.0 — profile inputs for api-internal and admin-prod-only apps (PLAN-131 TD-224)

All new inputs are optional and backward compatible — defaults reproduce the
previous behavior exactly (existing consumers need no caller changes; the only
default-visible addition is the warning-only test-env preflight in
`app-release.yml`, which can never fail a run).

- `app-ci.yml`: new input `buildVerify` (boolean, default `false`) — build the PR
  Docker image **without pushing** (no `:pr-<sha>` tag, no buildcache write) for
  apps without PR-image promotion (ADR-045 admin-prod-only, e.g. bvv-test-admin).
- `app-deploy-test.yml`: new input `smokeMode` (`ingress` | `port-forward`,
  default `ingress`) — `port-forward` smokes `/api/version` through
  `kubectl port-forward svc/<slug> 19891:3000` for cluster-internal apps without
  an IngressRoute (ADR-020, ADR-045 api-internal, e.g. bvv-directory-api).
  Procedure taken from the inline bvv-directory-api `deploy-test.yml`.
- `app-release.yml`: new input `smokeMode` (as above; port-forward uses local
  port 19892 and additionally asserts `environment=production`, matching the
  inline bvv-directory-api `release.yml`).
- `app-release.yml`: new input `skipTestPreflight` (boolean, default `false`) +
  new **advisory** preflight step "test namespace runs current main HEAD"
  (compares the last successful `deploy-test.yml` run on `main` with HEAD via
  the GitHub API). The step is warning-only — it NEVER fails a release, because
  a hard gate would change behavior for existing consumers and would false-fail
  after docs-only commits (`deploy-test` has `paths-ignore`). Prod-only apps
  (ADR-045 admin-prod-only) set `skipTestPreflight: true` to skip it entirely.

## v2.0.x

Pre-CHANGELOG history — see `git log` (PLAN-105 introduction of the reusable
trio, ADR-034 PR-image promotion, TD-115 optional app-ci inputs, PLAN-107
rollout verification rework, liv11 runner pinning).
