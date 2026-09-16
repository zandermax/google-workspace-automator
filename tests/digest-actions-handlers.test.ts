import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
	handleArchiveDigestThread,
	handleDeleteDigestThread,
} from '../src/_s/Gmail/digest-actions';

const globalWithGmail = globalThis as typeof globalThis & {
	GmailApp: any;
	PropertiesService: any;
};
const originalGmailApp = globalWithGmail.GmailApp;
const originalPropertiesService = globalWithGmail.PropertiesService;

test.afterEach(() => {
	if (originalGmailApp !== undefined) {
		globalWithGmail.GmailApp = originalGmailApp;
	} else {
		delete (globalWithGmail as any).GmailApp;
	}
	if (originalPropertiesService !== undefined) {
		globalWithGmail.PropertiesService = originalPropertiesService;
	} else {
		delete (globalWithGmail as any).PropertiesService;
	}
});

test('handleArchiveDigestThread returns true when the thread resolves and archives', () => {
	globalWithGmail.GmailApp = {
		getThreadById: () => ({ moveToArchive: () => {} }),
		getUserLabelByName: () => ({ removeFromThread: () => {} }),
	};

	assert.equal(handleArchiveDigestThread('t-1'), true);
});

test('handleArchiveDigestThread returns false when the thread no longer exists', () => {
	globalWithGmail.GmailApp = {
		getThreadById: () => null,
		getUserLabelByName: () => null,
	};

	assert.equal(handleArchiveDigestThread('missing'), false);
});

test('handleDeleteDigestThread returns true when the thread resolves and is trashed', () => {
	globalWithGmail.GmailApp = {
		getThreadById: () => ({ moveToTrash: () => {} }),
	};

	assert.equal(handleDeleteDigestThread('t-2'), true);
});

test('handleDeleteDigestThread returns false when the thread no longer exists', () => {
	globalWithGmail.GmailApp = {
		getThreadById: () => null,
	};

	assert.equal(handleDeleteDigestThread('missing'), false);
});

test('resolved digest actions remove their persisted triage summary', () => {
	const deletedKeys: string[] = [];
	globalWithGmail.GmailApp = {
		getThreadById: () => ({ moveToArchive: () => {} }),
		getUserLabelByName: () => ({ removeFromThread: () => {} }),
	};
	globalWithGmail.PropertiesService = {
		getScriptProperties: () => ({
			deleteProperty: (key: string) => deletedKeys.push(key),
		}),
	};

	assert.equal(handleArchiveDigestThread('t-1'), true);
	assert.deepEqual(deletedKeys, ['TRIAGE_SUMMARY_t-1']);
});
