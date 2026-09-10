import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { transformFileSync, transformSync } from '@babel/core';

import stripExports from '../scripts/babel-plugin-strip-exports';

test('strips module exports from Apps Script output', () => {
	const result = transformSync(
		'export const dryRunDeleteOldInvites = () => 0;',
		{
			babelrc: false,
			configFile: false,
			plugins: [stripExports],
		}
	);

	assert.match(result?.code ?? '', /const dryRunDeleteOldInvites = \(\) => 0;/);
	assert.doesNotMatch(result?.code ?? '', /export|exports/);
});

test('removes default exports of existing global declarations', () => {
	const result = transformSync(
		'const getOldUnread = () => 0; export default getOldUnread;',
		{
			babelrc: false,
			configFile: false,
			plugins: [stripExports],
		}
	);

	assert.equal(result?.code, 'const getOldUnread = () => 0;');
});

test('transforms numeric separators unsupported by Apps Script', () => {
	const result = transformFileSync(
		new URL('../src/_s/Drive/delete-old-untitled-ss.ts', import.meta.url)
			.pathname
	);

	assert.doesNotMatch(result?.code ?? '', /1_000/);
});

test('transforms class fields unsupported by Apps Script', () => {
	const result = transformFileSync(
		new URL('../src/common/Query/index.ts', import.meta.url).pathname
	);

	assert.doesNotMatch(result?.code ?? '', /\btoString =/);
});

test('loads DriveQuery before its subclasses', () => {
	const fileNames = readdirSync(
		new URL('../src/Drive/DriveQuery/', import.meta.url)
	).sort();
	const driveQueryIndex = fileNames.indexOf('00-DriveQuery.ts');

	assert.ok(
		driveQueryIndex >= 0,
		'DriveQuery must have an early-sort filename'
	);
	assert.ok(driveQueryIndex < fileNames.indexOf('DriveFileQuery.ts'));
	assert.ok(driveQueryIndex < fileNames.indexOf('DriveFolderQuery.ts'));
});

test('keeps the dry-run Apps Script entry point name unique', () => {
	const entryPoint = transformFileSync(
		new URL('../src/_s/Gmail/dry-run-sort.ts', import.meta.url).pathname
	)?.code;
	const sorter = transformFileSync(
		new URL('../src/Gmail/sorter.ts', import.meta.url).pathname
	)?.code;

	assert.match(entryPoint ?? '', /const dryRunSortInbox =/);
	assert.doesNotMatch(sorter ?? '', /const dryRunSortInbox =/);
});

test('prevents duplicate top-level lexical declarations across all compiled Apps Script files', () => {
	const distDir = new URL('../dist', import.meta.url).pathname;

	function getCompiledFiles(dir: string): string[] {
		const entries = readdirSync(dir, { withFileTypes: true });
		let files: string[] = [];
		for (const entry of entries) {
			const fullPath = `${dir}/${entry.name}`;
			if (entry.isDirectory()) {
				files = files.concat(getCompiledFiles(fullPath));
			} else if (entry.name.endsWith('.js')) {
				files.push(fullPath);
			}
		}
		return files;
	}

	const files = getCompiledFiles(distDir);
	assert.ok(files.length > 0, 'Compiled dist output should contain JS files');

	// Matches top-level lexical declarations: const, let, class
	const declRegex = /^(?:const|let|class)\s+([a-zA-Z0-9_$]+)/gm;
	const declarations = new Map<string, string[]>();

	for (const file of files) {
		const content = readFileSync(file, 'utf8');
		let match: RegExpExecArray | null;
		while ((match = declRegex.exec(content)) !== null) {
			const identifier = match[1];
			const occurrences = declarations.get(identifier) ?? [];
			occurrences.push(file.replace(`${distDir}/`, ''));
			declarations.set(identifier, occurrences);
		}
	}

	const duplicates: string[] = [];
	for (const [identifier, occurrences] of declarations.entries()) {
		if (occurrences.length > 1) {
			duplicates.push(`'${identifier}' declared in: ${occurrences.join(', ')}`);
		}
	}

	assert.deepEqual(
		duplicates,
		[],
		`Found duplicate top-level lexical declarations across Apps Script files:\n${duplicates.join('\n')}`
	);
});

test('excludes Node test files from the Apps Script build', () => {
	const packageJson = JSON.parse(
		readFileSync(new URL('../package.json', import.meta.url), 'utf8')
	) as { scripts: { build: string } };

	assert.match(packageJson.scripts.build, /--ignore ['"]?\*\*\/\*.test\.ts/);
});

test('manifest enforces least privilege and excludes unused advanced services', () => {
	const manifest = JSON.parse(
		readFileSync(new URL('../appsscript.json', import.meta.url), 'utf8')
	) as {
		dependencies?: { enabledAdvancedServices?: unknown[] };
		runtimeVersion: string;
		timeZone: string;
		exceptionLogging: string;
	};

	assert.equal(manifest.runtimeVersion, 'V8');
	assert.equal(manifest.timeZone, 'America/New_York');
	assert.equal(manifest.exceptionLogging, 'STACKDRIVER');

	const advancedServices = manifest.dependencies?.enabledAdvancedServices ?? [];
	assert.equal(
		advancedServices.length,
		0,
		'Manifest should not enable unused advanced services'
	);

	const oauthScopes =
		(manifest as { oauthScopes?: string[] }).oauthScopes ?? [];
	assert.ok(
		oauthScopes.includes(
			'https://www.googleapis.com/auth/script.external_request'
		),
		'Manifest should include external_request for Gemini UrlFetchApp'
	);
	assert.ok(
		oauthScopes.includes('https://www.googleapis.com/auth/gmail.modify'),
		'Manifest should include gmail.modify for triage and recycle labeling'
	);
	assert.ok(
		oauthScopes.includes('https://www.googleapis.com/auth/gmail.send'),
		'Manifest should include gmail.send for daily digest delivery'
	);
	assert.ok(
		oauthScopes.includes('https://www.googleapis.com/auth/drive.readonly'),
		'Manifest should include drive.readonly for quota metrics'
	);
	assert.ok(
		oauthScopes.includes('https://www.googleapis.com/auth/userinfo.email'),
		'Manifest should include userinfo.email for Session.getActiveUser recipient resolution'
	);
});
