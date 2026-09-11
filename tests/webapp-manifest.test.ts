import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const repoRoot = resolve(__dirname, '..');

test('appsscript.json restricts the Web App deployment to the owner only', () => {
	const manifest = JSON.parse(
		readFileSync(resolve(repoRoot, 'appsscript.json'), 'utf8')
	);

	assert.equal(manifest.webapp?.access, 'MYSELF');
	assert.equal(manifest.webapp?.executeAs, 'USER_DEPLOYING');
});
