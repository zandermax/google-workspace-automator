import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyWebAppAccessIsRestricted } from '../scripts/verify-webapp-access';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const repoRoot = resolve(__dirname, '..');

test('verify:webapp-access npm script runs the TypeScript entry point', () => {
	const packageJson = JSON.parse(
		readFileSync(resolve(repoRoot, 'package.json'), 'utf8')
	);

	assert.equal(
		packageJson.scripts['verify:webapp-access'],
		'tsx scripts/verify-webapp-access.ts'
	);
});

test('verifyWebAppAccessIsRestricted passes when the response looks like a Google sign-in/permission page', async () => {
	const result = await verifyWebAppAccessIsRestricted(
		'https://example.com/exec',
		async () =>
			({
				status: 302,
				text: async () => '<html>...accounts.google.com/ServiceLogin...</html>',
			}) as any
	);

	assert.equal(result.passed, true);
});

test('verifyWebAppAccessIsRestricted fails when the response looks like real app content', async () => {
	const result = await verifyWebAppAccessIsRestricted(
		'https://example.com/exec',
		async () =>
			({
				status: 200,
				text: async () => '<html>📋 Pending Triage Actions</html>',
			}) as any
	);

	assert.equal(result.passed, false);
});
