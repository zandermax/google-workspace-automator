import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { getActionsPageUrl } from '../src/Gmail/actionsPageUrlProvider';

test('getActionsPageUrl returns the URL from the provider', () => {
	const url = getActionsPageUrl({
		getActionsPageUrl: () => 'https://script.google.com/macros/s/abc/exec',
	});

	assert.equal(url, 'https://script.google.com/macros/s/abc/exec');
});

test('getActionsPageUrl throws a clear error when the default provider gets an empty URL from ScriptApp', () => {
	const globalWithScriptApp = globalThis as unknown as {
		ScriptApp?: { getService(): { getUrl(): string | null } };
	};
	const original = globalWithScriptApp.ScriptApp;

	globalWithScriptApp.ScriptApp = {
		getService: () => ({ getUrl: () => '' }),
	};

	try {
		assert.throws(() => getActionsPageUrl(), /no URL/);
	} finally {
		globalWithScriptApp.ScriptApp = original;
	}
});

test('default provider throws a clear error when ScriptApp.getService().getUrl() returns null', () => {
	const globalWithScriptApp = globalThis as unknown as {
		ScriptApp?: { getService(): { getUrl(): string | null } };
	};
	const original = globalWithScriptApp.ScriptApp;

	globalWithScriptApp.ScriptApp = {
		getService: () => ({ getUrl: () => null }),
	};

	try {
		assert.throws(() => getActionsPageUrl(), /has the Web App been deployed yet/);
	} finally {
		globalWithScriptApp.ScriptApp = original;
	}
});
