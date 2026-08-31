# .github

Org-level reusable GitHub Actions workflows + defaults (PLAN-104 X3).

Consumers call these via thin caller workflows pinned to an **explicit semver tag**
(`@v2.5.9`). See `CHANGELOG.md` for versioned changes.

> **Movable `@v2` už neexistuje** (smazán 2026-08-31; ověřeno: `gh api .../git/ref/tags/v2`
> → 404). Zamrzl na commitu `9d18565` a měsíce se nehýbal, takže „movable major" byl
> jen v dokumentaci, ne ve skutečnosti — konzumenti na něm dostávali měsíce starý
> workflow bez varování. Explicitní semver pin navíc drží `bvv-platform`
> `scripts/test-image-strategy-contract.mjs`, který vyžaduje tvar `@vX.Y.Z` a hlídá
> minima; kvůli němu se tyhle piny záměrně **nepřevádějí na SHA**, na rozdíl od
> third-party actions.

## Reusable workflows

> **`app-ci.yml` byl smazán (2026-08-31).** Neměl jediného živého callera. Po
> konsolidaci ADR-071 žije každá appka jako `apps/<slug>` v monorepu
> bvv-platform a její CI obstarává tamní `ci-affected.yml` — ten appku detekuje
> podle změněných cest a pustí build/lint/test/e2e. `app-ci.yml` navíc nikdy
> nedostalo input `appPath` (na rozdíl od `app-deploy-test.yml`), takže by
> v monorepo layoutu ani nefungovalo. Soubor zůstává ve všech historických
> tazích `v2.4.1`…`v2.5.9`, takže smazání z `main` nemůže rozbít pinovaného
> konzumenta.

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
