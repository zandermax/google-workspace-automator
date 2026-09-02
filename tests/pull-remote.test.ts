import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const repoRoot = resolve(__dirname, '..');

test('remote pull command uses the TypeScript entry point', () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(repoRoot, 'package.json'), 'utf8')
  );

  assert.equal(packageJson.scripts['pull:remote'], 'tsx scripts/pull-remote.ts');
});

test('remote pull implementation is TypeScript', () => {
  const source = readFileSync(
    resolve(repoRoot, 'scripts/pull-remote.ts'),
    'utf8'
  );

  assert.match(source, /: string/);
  assert.match(source, /interface RemoteMetadata/);
});
