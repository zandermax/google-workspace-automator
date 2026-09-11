import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
	archiveDigestThread,
	deleteDigestThread,
} from '../src/Gmail/digestActionResolver';

test('archiveDigestThread archives the thread and removes the pending label', () => {
	let archived = false;
	let labelRemoved = false;

	const result = archiveDigestThread('t-1', {
		resolveThread: () =>
			({
				getId: () => 't-1',
				moveToArchive: () => {
					archived = true;
				},
			}) as any,
		getLabel: () => ({
			getName: () => 'Digest/Pending-Action',
			addToThread: () => {},
			removeFromThread: () => {
				labelRemoved = true;
			},
		}),
	});

	assert.deepEqual(result, { threadId: 't-1', action: 'archive', resolved: true });
	assert.equal(archived, true);
	assert.equal(labelRemoved, true);
});

test('archiveDigestThread reports unresolved when the thread no longer exists', () => {
	const result = archiveDigestThread('missing', { resolveThread: () => null });
	assert.deepEqual(result, {
		threadId: 'missing',
		action: 'archive',
		resolved: false,
	});
});

test('deleteDigestThread moves the thread to trash', () => {
	let trashed = false;

	const result = deleteDigestThread('t-2', {
		resolveThread: () =>
			({
				getId: () => 't-2',
				moveToTrash: () => {
					trashed = true;
				},
			}) as any,
	});

	assert.deepEqual(result, { threadId: 't-2', action: 'delete', resolved: true });
	assert.equal(trashed, true);
});

test('deleteDigestThread reports unresolved when the thread no longer exists', () => {
	const result = deleteDigestThread('missing', { resolveThread: () => null });
	assert.deepEqual(result, {
		threadId: 'missing',
		action: 'delete',
		resolved: false,
	});
});
