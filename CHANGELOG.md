# Changelog

Reusable workflow changes, newest first. Konzumenti pinují **explicitní semver tag**
(`@v2.5.12`); movable `@v2` byl smazán 2026-08-31 (zamrzlý na `9d18565`, viz README).

## v2.5.12 — deploy nastavuje image tag i v refresh job ConfigMapě

- **`app-deploy-test.yml`: nový krok „Set image tag in refresh job ConfigMap".**
  `environments/test/<slug>/refresh-job-cm.yaml` nese šablonu Jobu, kterým
  `bvv-test-admin` kopíruje prod data do testu. Image v ní byl natvrdo plovoucí
  `ghcr.io/tradefairs/<slug>:test` — a ten **v containerd na liv11 neexistuje**
  (`k3s ctr images ls -q | grep -c ':test'` → 0, zatímco osm CM ho žádalo).
  Krok „Pull image into k3s containerd" importuje výhradně `$IMAGE:$IMAGE_TAG`.
- **Kubelet by ho tedy musel stáhnout z GHCR, jenže všechny `ghcr-pull-secret`
  ve flotile jsou mrtvé** — pět namespaců nese pět různých tokenů a GHCR odmítá
  každý z nich (403). Doměřeno 2026-09-01 podem s explicitně připojeným Secretem
  a `imagePullPolicy: Always`; běžící pody flotily nedokazují nic, protože ta na
  kubelet pull nespoléhá (verzované tagy + `IfNotPresent` nad importovaným
  image). Refresh Job byl jediný workload, který pull skutečně potřeboval.
- **Řešení:** dát CM tentýž verzovaný tag jako Deploymentu. Image už v containerd
  je, `IfNotPresent` ho najde lokálně a pull secret není potřeba vůbec.
  Kustomize `images:` transformer to udělat NEMŮŽE — obsah ConfigMapy je pro něj
  neprůhledný řetězec (ověřeno: render přepsal image Deploymentu a tentýž image
  uvnitř `data:` nechal na `:test`).
- Krok je měkký na neexistenci souboru (appka refresh mít nemusí), ale tvrdý na
  změnu tvaru: chybějící `image: $IMAGE:<tag>` řádek shodí deploy, místo aby
  tiše nasadil rozbitý refresh.

## v2.5.11 — chybějící namespace.yaml není tichý skip

- Doplněno zpětně 2026-09-01: tag existoval bez sekce v changelogu.
  `app-deploy-test.yml` — krok zakládající namespace hledal `namespace.yaml`
  podle slugu a appku sdílející namespace tiše přeskočil (#56).

## v2.5.10 — aplikují se všechny `*.enc.yaml`, ne jen `secrets.enc.yaml`

- Doplněno zpětně 2026-09-01: tag existoval bez sekce v changelogu.
  Deploy aplikuje glob `"$SECRET_DIR"/*.enc.yaml`, takže vedle hlavního Secretu
  projdou i vedlejší (např. `prod-readonly-secret.enc.yaml`) (#55).

## Nezatagováno — úklid (2026-08-31)

- **`app-ci.yml` smazán.** Neměl jediného živého callera: org-wide `gh search code`
  nenašel žádný `uses:` odkaz mimo historické `.codex/tasks/` a docs. Po konsolidaci
  ADR-071 dělá CI monorepové `ci-affected.yml` v `bvv-platform` (detekce podle
  změněných cest); poslední konzument — thin caller v šabloně `bvv-app-template` —
  zmizel s bvv-platform PR #486, který smazal celý mrtvý šablonový
  `.github/workflows/`. `app-ci.yml` navíc nikdy nedostalo input `appPath`
  (na rozdíl od `app-deploy-test.yml`), takže by v monorepo layoutu nefungovalo.
  Soubor zůstává ve všech historických tazích `v2.4.1`…`v2.5.9`, takže smazání
  z `main` nemůže rozbít pinovaného konzumenta.
- **Dependabot** (`.github/dependabot.yml`) sleduje `github-actions` ekosystém.
  Doplňuje SHA piny actions napříč flotilou (bvv-platform PR #483 a sesterské
  commity v `infra-liv11`/`k2-mcp`/`platform-workspace`) — pin bez automatického
  bumpu zkostnatí. Reusables v tomhle repu Dependabot neaktualizuje: jsou to
  `uses:` na workflow, ne na action.

## v2.5.9 — časné guardy releasu (bare semver, existence prod namespace)

- `app-release.yml` preflight: `releaseVersion` i `nextVersion` musí být holý
  semver (`^[0-9]+\.[0-9]+\.[0-9]+$`). Vstup se `-SNAPSHOT` suffixem dřív
  propadl až do python semver compare a shodil run kryptickým
  `ValueError: invalid literal for int() with base 10: '2-SNAPSHOT'`
  (3 z 8 auditovaných selhání releasů). Teď jasná hláška hned v preflightu:
  suffix přidává workflow samo, caller ho nikdy nezadává.
- `app-release.yml` deploy-prod: nový krok **Verify prod namespace exists**
  hned za **Ensure namespace exists** — `kubectl get namespace "$NS"` s tvrdým
  failem a instrukcí (bootstrap přes infra-liv11 `bootstrap-app.yml`), když
  cílový namespace na clusteru není a nic v gitu ho nezakládá. Auditovaný
  případ bvv-notification-hub 21.8.: release nikdy nebootstrapované appky
  doběhl až do DB migrací a umřel na „namespaces not found". Záměrně AŽ PO
  Ensure kroku: ten namespace legitimně zakládá z
  `environments/prod/<slug>/namespace.yaml` (cattle-not-pets fáze 1), takže
  guard střelí jen u appky, jejíž cílový ns neexistuje a git ho neprovisionuje.

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
