import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
	handleArchiveDigestThread,
	handleDeleteDigestThread,
} from '../src/_s/Gmail/digest-actions';

const globalWithGmail = globalThis as typeof globalThis & { GmailApp: any };
const originalGmailApp = globalWithGmail.GmailApp;

test.afterEach(() => {
	if (originalGmailApp !== undefined) {
		globalWithGmail.GmailApp = originalGmailApp;
	} else {
		delete (globalWithGmail as any).GmailApp;
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
