#!/usr/bin/env node
// TD-684: Contract tests for the require_pr_image scoped opt-in.
//
// Plain regex/text assertions against the raw workflow YAML — no `yaml`
// parser dependency exists in this repo (no package.json/node_modules
// before this TD), and GitHub Actions expression syntax (`${{ }}`) is not
// valid YAML anyway, so a structural parse would not help here.
//
// Covers the Local TD acceptance criteria in
// k8s-workspace/.codex/tasks/TD-684-manifest-only-test-promotion.md:
//   1. require_pr_image defaults to false; default-path behavior is
//      byte-identical to the pre-TD fallback logic (excluding the added
//      REQUIRE_PR_IMAGE branches themselves, which are unreachable at
//      default/false).
//   2. With require_pr_image: true, all three resolution-failure branches
//      (gh api failure, no PR, imagetools inspect not-found) hard-fail
//      with an attributable ::error:: message, no fallback.
//   3. The fallback rebuild step (docker/build-push-action) stays gated on
//      steps.pr_image.outputs.image_found != 'true' — unreachable whenever
//      require_pr_image forces an early `exit 1` in all three failure
//      branches.
//   4. Only bvv-platform's 11 deploy-<slug> jobs set require_pr_image:
//      true; no external caller repo is touched by this TD (checked here
//      only for app-deploy-test.yml itself: it must not hardcode `true`
//      anywhere as a default).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const workflowPath = path.join(
  repoRoot,
  '.github/workflows/app-deploy-test.yml',
);
const src = readFileSync(workflowPath, 'utf8');

let failures = 0;
let passed = 0;

function check(name, cond) {
  if (cond) {
    passed += 1;
    console.log(`PASS: ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL: ${name}`);
  }
}

// ── 1. require_pr_image input exists, is boolean, defaults to false ──────
const inputBlockMatch = src.match(
  /require_pr_image:\s*\n(?:.*\n)*?\s*type:\s*boolean\s*\n\s*default:\s*false/,
);
check(
  'require_pr_image input declared as type: boolean, default: false',
  inputBlockMatch !== null,
);

// ── 2. All three degrade-to-fallback branches gain a require_pr_image ────
//       guard that hard-fails (exit 1) with an attributable ::error::
//       message, while preserving the existing fail-open path unchanged.
const resolveStepMatch = src.match(
  /- name: Resolve PR image[\s\S]*?\n\n {6}- name: Read version/,
);
check('Resolve PR image step found', resolveStepMatch !== null);
const resolveStep = resolveStepMatch ? resolveStepMatch[0] : '';

// REQUIRE_PR_IMAGE must be threaded into the step's env from inputs.require_pr_image
check(
  'REQUIRE_PR_IMAGE env wired from inputs.require_pr_image',
  /REQUIRE_PR_IMAGE:\s*\$\{\{\s*inputs\.require_pr_image\s*\}\}/.test(
    resolveStep,
  ),
);

// Case A: gh api failure
const caseAMatch = resolveStep.match(
  /PR_SHA=\$\(gh api[^\n]*2>"\$GH_ERR"\) \|\| GH_RC=\$\?\s*\n\s*if \[ "\$GH_RC" -ne 0 \]; then[\s\S]*?fi\n(?=\s*rm -f "\$GH_ERR"\s*\n\s*if \[ -z "\$PR_SHA" \])/,
);
check('Case A (gh api failure) block found', caseAMatch !== null);
const caseA = caseAMatch ? caseAMatch[0] : '';
check(
  'Case A: gh api stderr is printed to the log (not discarded)',
  /echo "::group::gh api stderr \(exit \$GH_RC\)"\s*\n\s*cat "\$GH_ERR"\s*\n\s*echo "::endgroup::"/.test(
    caseA,
  ) && !/gh api[^\n]*2>\/dev\/null/.test(resolveStep),
);
check(
  'Case A: require_pr_image=true hard-fails with ::error:: + exit 1',
  /if \[ "\$REQUIRE_PR_IMAGE" = "true" \];\s*then\s*\n\s*echo "::error::.*gh api.*"\s*\n\s*exit 1\s*\n\s*fi/.test(
    caseA,
  ),
);
check(
  'Case A: fail-open branch unchanged (::warning:: + image_found=false + exit 0)',
  /echo "::warning::gh api commits\/<sha>\/pulls failed \(exit \$GH_RC; [^"]*\) — falling back to rebuild"\s*\n\s*echo "image_found=false" >> "\$GITHUB_OUTPUT"\s*\n\s*exit 0/.test(
    caseA,
  ),
);

// Case B: no PR found for merge SHA
const caseBMatch = resolveStep.match(
  /if \[ -z "\$PR_SHA" \]; then[\s\S]*?fi\n(?=\s*echo "Resolved PR head SHA)/,
);
check('Case B (no PR found) block found', caseBMatch !== null);
const caseB = caseBMatch ? caseBMatch[0] : '';
check(
  'Case B: require_pr_image=true hard-fails with ::error:: + exit 1',
  /if \[ "\$REQUIRE_PR_IMAGE" = "true" \];\s*then\s*\n\s*echo "::error::.*no PR associated.*"\s*\n\s*exit 1\s*\n\s*fi/.test(
    caseB,
  ),
);
check(
  'Case B: fail-open branch unchanged (message + image_found=false + exit 0)',
  /echo "No PR associated with merge \$\{\{ github\.sha \}\} \(direct push\?\)\. Falling back to rebuild\."\s*\n\s*echo "image_found=false" >> "\$GITHUB_OUTPUT"\s*\n\s*exit 0/.test(
    caseB,
  ),
);

// Case C: imagetools inspect not-found
const caseCMatch = resolveStep.match(
  /if docker buildx imagetools inspect[\s\S]*?echo "image_found=false" >> "\$GITHUB_OUTPUT"\s*\n\s*fi/,
);
check('Case C (imagetools inspect not-found) block found', caseCMatch !== null);
const caseC = caseCMatch ? caseCMatch[0] : '';
check(
  'Case C: require_pr_image=true hard-fails with ::error:: + exit 1',
  /if \[ "\$REQUIRE_PR_IMAGE" = "true" \];\s*then\s*\n\s*echo "::error::.*not found.*"\s*\n\s*exit 1\s*\n\s*fi/.test(
    caseC,
  ),
);
check(
  'Case C: fail-open branch unchanged (::warning:: + image_found=false, no exit 0 needed — end of step)',
  /echo "::warning::ghcr\.io\/tradefairs\/\$\{\{ inputs\.slug \}\}:pr-\$PR_SHA not found; will rebuild"\s*\n\s*echo "image_found=false" >> "\$GITHUB_OUTPUT"/.test(
    caseC,
  ),
);

// ── 3. Fallback rebuild step (docker/build-push-action) stays gated on ───
//       image_found != 'true' and is not otherwise reachable when
//       require_pr_image forces early exits in all 3 failure cases —
//       i.e. no build/layer push occurs on the require_pr_image=true path.
// Od #42/#59 jsou dva záložní kroky (docker build-push-action, crane layer-append),
// oba gated `image_found != 'true' && inputs.imageStrategy == '<strategie>'`;
// action je pinnutá na SHA (ne @v7). Kontrola je stejně přísná: podmínka musí
// bezprostředně předcházet příslušnému kroku a image_found != 'true' je povinné.
check(
  'Docker fallback rebuild step gated on image_found != \'true\' && imageStrategy == docker',
  /if: steps\.pr_image\.outputs\.image_found != 'true' && inputs\.imageStrategy == 'docker'\s*\n\s*uses: docker\/build-push-action@[0-9a-f]{40}/.test(
    src,
  ),
);
check(
  'Crane fallback rebuild step gated on image_found != \'true\' && imageStrategy == crane',
  /if: steps\.pr_image\.outputs\.image_found != 'true' && inputs\.imageStrategy == 'crane'\s*\n\s*uses: \.\/\.github\/actions\/deploy-test-crane-image/.test(
    src,
  ),
);
check(
  'No other build step (build-push-action / deploy-test-crane-image) lacks the image_found != \'true\' gate',
  (src.match(/uses: (?:docker\/build-push-action@|\.\/\.github\/actions\/deploy-test-crane-image)/g) || []).length ===
    (src.match(/if: steps\.pr_image\.outputs\.image_found != 'true'[^\n]*\n\s*uses: (?:docker\/build-push-action@|\.\/\.github\/actions\/deploy-test-crane-image)/g) || []).length,
);
check(
  'Promote (retag, no rebuild) step still gated on image_found == \'true\' and uses imagetools create (no docker/build-push-action)',
  /if: steps\.pr_image\.outputs\.image_found == 'true'[\s\S]*?docker buildx imagetools create/.test(
    src,
  ),
);

// ── 3b. Stale-PR-image guard (on_stale_pr_image; ADR-034 amendment) ──────
//       Squash-merge parent must be an ancestor of the PR head, else the
//       promoted image lacks commits that main already had. Default `warn`
//       keeps today's behavior (promote); `rebuild` reuses the fallback
//       steps via image_found=false; `fail` hard-fails. Staleness is always
//       logged as ::warning:: regardless of the mode.
check(
  'on_stale_pr_image input declared as type: string, default: \'warn\'',
  /on_stale_pr_image:\s*\n(?:.*\n)*?\s*type:\s*string\s*\n\s*default:\s*'warn'/.test(src),
);
check(
  'ON_STALE env wired from inputs.on_stale_pr_image',
  /ON_STALE:\s*\$\{\{\s*inputs\.on_stale_pr_image\s*\}\}/.test(resolveStep),
);
check(
  'on_stale_pr_image value validated (warn|rebuild|fail) before any API call',
  /case "\$ON_STALE" in\s*\n\s*warn\|rebuild\|fail\) ;;[\s\S]*?exit 1 ;;\s*\n\s*esac\s*\n\s*GH_ERR=/.test(resolveStep),
);
check(
  'Freshness: compare <merge parent>...<PR head> (API, no clone) and behind_by decides',
  /compare\/\$PARENT\.\.\.\$PR_SHA[\s\S]*?behind_by/.test(resolveStep) &&
    /\.parents \| if length == 1/.test(resolveStep),
);
check(
  'Freshness runs only when the PR image exists (FOUND=true gate)',
  /if \[ "\$FOUND" = "true" \]; then\s*\n\s*STALE=false/.test(resolveStep),
);
check(
  'Staleness is always logged as ::warning:: before the on_stale mode is applied',
  /echo "::warning::\$WHY \(on_stale_pr_image=\$ON_STALE\)"\s*\n\s*case "\$ON_STALE" in/.test(resolveStep),
);
check(
  'on_stale_pr_image=fail hard-fails (::error:: + exit 1); =rebuild sets image_found=false without exit',
  /fail\)\s*\n\s*echo "::error::\$WHY[^\n]*"\s*\n\s*exit 1 ;;\s*\n\s*rebuild\)[^\n]*\n\s*echo "[^\n]*"\s*\n\s*echo "image_found=false" >> "\$GITHUB_OUTPUT" ;;/.test(resolveStep),
);
check(
  'Default `warn` never changes image_found (no warn) branch in the on_stale case)',
  !/\n\s*warn\)/.test(resolveStep.slice(resolveStep.indexOf('Freshness (ADR'))),
);

// ── 4. app-deploy-test.yml itself never hardcodes require_pr_image: true ─
//       anywhere as a caller default — this file only ever DECLARES the
//       input (default false). Actual `true` settings live in
//       bvv-platform's deploy-affected.yml, verified separately in that
//       repo (out of this file's reach).
const trueOccurrences = (
  src.match(/require_pr_image:\s*true/g) || []
).length;
check(
  'app-deploy-test.yml never itself sets require_pr_image: true (only declares the false-default input)',
  trueOccurrences === 0,
);

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) {
  process.exit(1);
}
