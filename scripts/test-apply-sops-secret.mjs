#!/usr/bin/env node
// Contract + behavioural test for the inline `apply_sops_secret` shell function
// shared by app-release.yml and app-deploy-test.yml (incident 2026-10-08:
// `kubectl apply` of a Secret with an invalid base64 value printed every value
// of the Secret into the GitHub Actions log).
//
// The function is extracted from the workflow YAML (between the BEGIN/END
// markers), asserted byte-identical in both workflows, and executed against a
// fake `sops` / `sudo` / `kubectl` on PATH. The fake kubectl writes a canary
// "secret value" to stderr and/or stdout; the test asserts the canary never
// appears in the combined output of the function.

import { readFileSync, mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflows = ['app-release.yml', 'app-deploy-test.yml'];
const CANARY = 'SUPERSECRETVALUE-d41d8cd9';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`);
  if (!ok) failures++;
};

function extract(wf) {
  const src = readFileSync(path.join(root, '.github/workflows', wf), 'utf8');
  const m = src.match(/^ *# BEGIN apply-sops-secret.*\n([\s\S]*?)^ *# END apply-sops-secret\n/m);
  if (!m) throw new Error(`markers not found in ${wf}`);
  const lines = m[0].split('\n');
  return { src, text: lines.map((l) => l.replace(/^ {10}/, '')).join('\n') };
}

const bodies = workflows.map(extract);
check('function identical in both workflows', bodies[0].text === bodies[1].text);
for (const [i, wf] of workflows.entries()) {
  const s = bodies[i].src;
  check(`${wf}: loop calls function with || exit 1`, s.includes('apply_sops_secret "$SECRET_FILE" "$NS" || exit 1'));
  check(`${wf}: no raw sops|kubectl apply pipe left`, !/sops -d "\$SECRET_FILE" \| sudo kubectl/.test(s));
  check(`${wf}: pipefail still set`, /set -o pipefail\n/.test(s));
}

const dir = mkdtempSync(path.join(tmpdir(), 'apply-sops-'));
const bin = path.join(dir, 'bin');
spawnSync('mkdir', ['-p', bin]);
const fake = (name, body) => {
  writeFileSync(path.join(bin, name), `#!/bin/bash\n${body}\n`);
  chmodSync(path.join(bin, name), 0o755);
};
fake('sudo', 'exec "$@"');
fake('sops', 'if [ -n "$FAKE_SOPS_FAIL" ]; then echo "sops: no matching keys ' + CANARY + '" >&2; exit 2; fi; echo "data: {K: ' + CANARY + '}"');
fake('kubectl', `cat >/dev/null
case "$FAKE_MODE" in
  ok) echo "secret/app-secrets configured" ;;
  ok-noise) echo "secret/app-secrets unchanged"; echo "weird ${CANARY} line" ;;
  b64) echo "The request is invalid: patch: illegal base64 data at input byte 4 data:{AUTH_SECRET:${CANARY}}" >&2; echo "out ${CANARY}"; exit 1 ;;
  dup) echo "error: key already defined ${CANARY}" >&2; exit 1 ;;
  other) echo "boom ${CANARY}" >&2; exit 1 ;;
esac`);

const fnText = bodies[0].text;
function run(mode, extraEnv = {}) {
  const script = `set -o pipefail\n${fnText}\napply_sops_secret env/x/secrets.enc.yaml ns1 || exit 1\necho AFTER-OK\n`;
  const r = spawnSync('bash', ['-ec', script], {
    env: { PATH: `${bin}:${process.env.PATH}`, FAKE_MODE: mode, ...extraEnv },
    encoding: 'utf8',
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const cases = [
  ['ok', {}, 0, [/secret\/app-secrets configured/, /AFTER-OK/]],
  ['ok-noise', {}, 0, [/secret\/app-secrets unchanged/, /potlačeno/]],
  ['b64', {}, 1, [/hodnota v data: není base64/, /env\/x\/secrets\.enc\.yaml/]],
  ['dup', {}, 1, [/duplicitní klíč/]],
  ['other', {}, 1, [/detail záměrně skryt/]],
  ['ok', { FAKE_SOPS_FAIL: '1' }, 1, [/sops -d .* selhal \(exit 2/]],
];
for (const [mode, env, code, patterns] of cases) {
  const r = run(mode, env);
  const label = `${mode}${env.FAKE_SOPS_FAIL ? '+sops-fail' : ''}`;
  check(`${label}: exit ${code}`, r.code === code, `got ${r.code}`);
  check(`${label}: canary absent from output`, !r.out.includes(CANARY), r.out);
  for (const p of patterns) check(`${label}: ${p}`, p.test(r.out), r.out);
  if (code !== 0) check(`${label}: step does not continue`, !r.out.includes('AFTER-OK'));
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
