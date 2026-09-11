import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
	queryPendingThreads,
	groupPendingItemsByCategory,
	type PendingThreadLike,
} from '../src/Gmail/queryPendingThreads';

const createThread = (
	id: string,
	subject: string,
	sender: string,
	labels: string[],
	lastMessageDate: Date
): PendingThreadLike => ({
	getId: () => id,
	getFirstMessageSubject: () => subject,
	getLastMessageDate: () => lastMessageDate,
	getLabels: () => labels.map((name) => ({ getName: () => name })),
	getMessages: () => [{ getFrom: () => sender }],
});

test('queryPendingThreads resolves category from thread labels and computes age in days', () => {
	const now = new Date('2026-09-11T00:00:00Z');
	const thread = createThread(
		't-1',
		'Invoice due',
		'billing@service.com',
		['triage/finance', 'Digest/Pending-Action'],
		new Date('2026-09-08T00:00:00Z')
	);

	const items = queryPendingThreads(() => [thread], now);

	assert.deepEqual(items, [
		{
			threadId: 't-1',
			category: 'triage/finance',
			subject: 'Invoice due',
			sender: 'billing@service.com',
			ageInDays: 3,
		},
	]);
});

test('queryPendingThreads falls back to triage/unknown when no category label is present', () => {
	const now = new Date('2026-09-11T00:00:00Z');
	const thread = createThread(
		't-2',
		'Mystery mail',
		'someone@example.com',
		['Digest/Pending-Action'],
		now
	);

	const items = queryPendingThreads(() => [thread], now);
	assert.equal(items[0].category, 'triage/unknown');
	assert.equal(items[0].ageInDays, 0);
});

test('queryPendingThreads sorts oldest first', () => {
	const now = new Date('2026-09-11T00:00:00Z');
	const newer = createThread('newer', 'Newer', 'a@b.com', ['triage/personal'], new Date('2026-09-10T00:00:00Z'));
	const older = createThread('older', 'Older', 'a@b.com', ['triage/personal'], new Date('2026-09-01T00:00:00Z'));

	const items = queryPendingThreads(() => [newer, older], now);
	assert.deepEqual(items.map((i) => i.threadId), ['older', 'newer']);
});

test('groupPendingItemsByCategory groups by category in TRIAGE_CATEGORIES order and omits empty categories', () => {
	const now = new Date('2026-09-11T00:00:00Z');
	const items = queryPendingThreads(
		() => [
			createThread('t-newsletter', 'News', 'a@b.com', ['triage/newsletters'], now),
			createThread('t-personal', 'Hi', 'a@b.com', ['triage/personal'], now),
		],
		now
	);

	const groups = groupPendingItemsByCategory(items);
	assert.deepEqual(
		groups.map((g) => g.category),
		['triage/personal', 'triage/newsletters']
	);
	assert.equal(groups[0].items.length, 1);
	assert.equal(groups[1].items.length, 1);
});
