import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import Query from '../src/common/Query';
import GmailQuery from '../src/Gmail/GmailQuery';
import { deleteOldUnread } from '../src/_s/Gmail/delete-old-unread';
import { deleteOldPromos } from '../src/_s/Gmail/delete-old-promotions';
import { deleteOldUpdates } from '../src/_s/Gmail/delete-old-updates';
import { deleteBotSmsEmails } from '../src/_s/Gmail/delete-bot-sms';

const globalWithGmail = globalThis as typeof globalThis & {
	GmailApp: {
		search: (
			query: string,
			start?: number,
			max?: number
		) => GoogleAppsScript.Gmail.GmailThread[];
	};
};

globalWithGmail.GmailApp = {
	search: (_query: string, _start = 0, _max = 100) => [],
};

test('GmailQuery date helpers emit the Gmail date operator with correct month/day formatting', () => {
	const afterQuery = new GmailQuery('subject:test').after(
		new Date(Date.UTC(2026, 0, 15, 12, 30, 0))
	);
	const beforeQuery = new GmailQuery('subject:test').before(
		new Date(Date.UTC(2025, 11, 31, 9, 0, 0))
	);
	const singleDigitQuery = new GmailQuery('subject:test').after(
		new Date(Date.UTC(2026, 4, 3, 8, 0, 0))
	);
	const leapDayQuery = new GmailQuery('subject:test').after(
		new Date(Date.UTC(2024, 1, 29, 5, 45, 0))
	);
	const nonLeapDayQuery = new GmailQuery('subject:test').before(
		new Date(Date.UTC(2025, 1, 28, 23, 59, 59))
	);
	const yearBoundaryQuery = new GmailQuery('subject:test').before(
		new Date(Date.UTC(2026, 0, 1, 0, 0, 0))
	);
	const chainedQuery = new GmailQuery('subject:test')
		.after(new Date(Date.UTC(2026, 0, 1, 0, 0, 0)))
		.before(new Date(Date.UTC(2026, 0, 31, 23, 59, 59)));

	assert.equal(afterQuery.toString(), 'subject:test after:2026/01/15');
	assert.equal(beforeQuery.toString(), 'subject:test before:2025/12/31');
	assert.equal(singleDigitQuery.toString(), 'subject:test after:2026/05/03');
	assert.equal(leapDayQuery.toString(), 'subject:test after:2024/02/29');
	assert.equal(nonLeapDayQuery.toString(), 'subject:test before:2025/02/28');
	assert.equal(yearBoundaryQuery.toString(), 'subject:test before:2026/01/01');
	assert.equal(
		chainedQuery.toString(),
		'subject:test after:2026/01/01 before:2026/01/31'
	);
});

test('Query stable pagination over more than 100 results records deterministic search-call arguments for Symbol.iterator', () => {
	const allIds = Array.from(
		{ length: 250 },
		(_, index) => `thread-${index + 1}`
	);
	const searchCalls: { query: string; start: number; max: number }[] = [];
	const searcher = (query: string, start = 0, max = 100) => {
		searchCalls.push({ query, start, max });
		return allIds.slice(start, start + max).map((id) => ({ id }));
	};

	class TestQuery extends Query<typeof searcher> {
		public constructor() {
			super(searcher, 'subject:test');
		}
	}

	const yieldedPages: { id: string }[][] = [];
	const testQuery = new TestQuery();

	for (const page of testQuery) {
		yieldedPages.push(page);
	}

	assert.equal(yieldedPages.length, 3);
	assert.equal(yieldedPages[0].length, 100);
	assert.equal(yieldedPages[1].length, 100);
	assert.equal(yieldedPages[2].length, 50);
	assert.deepEqual(
		yieldedPages.flat().map((thread) => thread.id),
		allIds
	);
	assert.deepEqual(searchCalls, [
		{ query: 'subject:test', start: 0, max: 100 },
		{ query: 'subject:test', start: 100, max: 100 },
		{ query: 'subject:test', start: 200, max: 100 },
		{ query: 'subject:test', start: 250, max: 100 },
	]);
});

test('Query stable pagination over more than 100 results records deterministic search-call arguments for processSync', () => {
	const allIds = Array.from(
		{ length: 250 },
		(_, index) => `thread-${index + 1}`
	);
	const searchCalls: { query: string; start: number; max: number }[] = [];
	const searcher = (query: string, start = 0, max = 100) => {
		searchCalls.push({ query, start, max });
		return allIds.slice(start, start + max).map((id) => ({ id }));
	};

	class TestQuery extends Query<typeof searcher> {
		public constructor() {
			super(searcher, 'subject:test');
		}
	}

	const processedPages: { id: string }[][] = [];
	new TestQuery().processSync({
		callback: (page) => {
			processedPages.push(page);
		},
	});

	assert.equal(processedPages.length, 3);
	assert.equal(processedPages[0].length, 100);
	assert.equal(processedPages[1].length, 100);
	assert.equal(processedPages[2].length, 50);
	assert.deepEqual(
		processedPages.flat().map((thread) => thread.id),
		allIds
	);
	assert.deepEqual(searchCalls, [
		{ query: 'subject:test', start: 0, max: 100 },
		{ query: 'subject:test', start: 100, max: 100 },
		{ query: 'subject:test', start: 200, max: 100 },
		{ query: 'subject:test', start: 250, max: 100 },
	]);
});

test('Query.processSync preserves all matching results and asserts search-call arguments when callback mutates the result set', () => {
	const allIds = Array.from(
		{ length: 130 },
		(_, index) => `thread-${index + 1}`
	);
	let liveIds = [...allIds];
	const searchCalls: { query: string; start: number; max: number }[] = [];
	const searcher = (query: string, start = 0, max = 100) => {
		searchCalls.push({ query, start, max });
		return liveIds.slice(start, start + max).map((id) => ({ id }));
	};

	class TestQuery extends Query<typeof searcher> {
		public constructor() {
			super(searcher, 'subject:test');
		}
	}

	const processed: string[] = [];

	new TestQuery().processSync({
		callback: (threads) => {
			for (const thread of threads) {
				processed.push(thread.id);
			}
			liveIds = liveIds.filter(
				(id) => !threads.some((thread) => thread.id === id)
			);
		},
	});

	assert.deepEqual(processed, allIds);
	assert.deepEqual(searchCalls, [
		{ query: 'subject:test', start: 0, max: 100 },
		{ query: 'subject:test', start: 100, max: 100 },
		{ query: 'subject:test', start: 130, max: 100 },
	]);
});

test('Query[Symbol.iterator] preserves all matching results and asserts search-call arguments when loop mutates the result set', () => {
	const allIds = Array.from(
		{ length: 130 },
		(_, index) => `thread-${index + 1}`
	);
	let liveIds = [...allIds];
	const searchCalls: { query: string; start: number; max: number }[] = [];
	const searcher = (query: string, start = 0, max = 100) => {
		searchCalls.push({ query, start, max });
		return liveIds.slice(start, start + max).map((id) => ({ id }));
	};

	class TestQuery extends Query<typeof searcher> {
		public constructor() {
			super(searcher, 'subject:test');
		}
	}

	const processed: string[] = [];
	const testQuery = new TestQuery();

	for (const threads of testQuery) {
		for (const thread of threads) {
			processed.push(thread.id);
		}
		liveIds = liveIds.filter(
			(id) => !threads.some((thread) => thread.id === id)
		);
	}

	assert.deepEqual(processed, allIds);
	assert.deepEqual(searchCalls, [
		{ query: 'subject:test', start: 0, max: 100 },
		{ query: 'subject:test', start: 100, max: 100 },
		{ query: 'subject:test', start: 130, max: 100 },
	]);
});

test('Query pagination respects custom start and maxResults options', () => {
	const allIds = Array.from(
		{ length: 75 },
		(_, index) => `thread-${index + 1}`
	);
	const searchCalls: { query: string; start: number; max: number }[] = [];
	const searcher = (query: string, start = 0, max = 100) => {
		searchCalls.push({ query, start, max });
		return allIds.slice(start, start + max).map((id) => ({ id }));
	};

	class TestQuery extends Query<typeof searcher> {
		public constructor() {
			super(searcher, 'subject:test');
		}
	}

	const processed: string[] = [];
	new TestQuery().processSync({
		start: 20,
		maxResults: 25,
		callback: (threads) => {
			for (const thread of threads) {
				processed.push(thread.id);
			}
		},
	});

	assert.equal(processed.length, 55);
	assert.deepEqual(processed, allIds.slice(20));
	assert.deepEqual(searchCalls, [
		{ query: 'subject:test', start: 20, max: 25 },
		{ query: 'subject:test', start: 45, max: 25 },
		{ query: 'subject:test', start: 70, max: 25 },
		{ query: 'subject:test', start: 75, max: 25 },
	]);
});

test('GmailQuery iterates mutation-safely using inherited Query[Symbol.iterator]', () => {
	const allIds = Array.from(
		{ length: 130 },
		(_, index) => `thread-${index + 1}`
	);
	let liveIds = [...allIds];
	const searchCalls: { query: string; start: number; max: number }[] = [];

	globalWithGmail.GmailApp.search = (query: string, start = 0, max = 100) => {
		searchCalls.push({ query, start, max });
		return liveIds
			.slice(start, start + max)
			.map((id) => ({ id })) as unknown as GoogleAppsScript.Gmail.GmailThread[];
	};

	const query = new GmailQuery('subject:test');
	const processed: string[] = [];

	for (const threads of query) {
		for (const thread of threads as unknown as { id: string }[]) {
			processed.push(thread.id);
		}
		liveIds = liveIds.filter(
			(id) =>
				!threads.some(
					(thread) => (thread as unknown as { id: string }).id === id
				)
		);
	}

	assert.deepEqual(processed, allIds);
	assert.deepEqual(searchCalls, [
		{ query: 'subject:test', start: 0, max: 100 },
		{ query: 'subject:test', start: 100, max: 100 },
		{ query: 'subject:test', start: 130, max: 100 },
	]);
});

test('deleteOldUnread processes all matching threads without pagination skips and labels before trashing', () => {
	const allIds = Array.from(
		{ length: 130 },
		(_, index) => `unread-${index + 1}`
	);
	let liveIds = [...allIds];
	const trashedIds: string[] = [];
	const labeledBatches: { label: string; ids: string[] }[] = [];

	globalWithGmail.GmailApp = {
		search: (_query: string, start = 0, max = 100) => {
			return liveIds
				.slice(start, start + max)
				.map((id) => ({
					id,
				})) as unknown as GoogleAppsScript.Gmail.GmailThread[];
		},
		createLabel: (name: string) => ({
			getName: () => name,
			addToThreads: (threads: GoogleAppsScript.Gmail.GmailThread[]) => {
				labeledBatches.push({
					label: name,
					ids: threads.map((t) => (t as unknown as { id: string }).id),
				});
			},
		}),
		moveThreadsToTrash: (threads: GoogleAppsScript.Gmail.GmailThread[]) => {
			for (const thread of threads) {
				const id = (thread as unknown as { id: string }).id;
				trashedIds.push(id);
			}
			liveIds = liveIds.filter(
				(id) =>
					!threads.some(
						(thread) => (thread as unknown as { id: string }).id === id
					)
			);
		},
	} as any;

	globalThis.Logger = {
		log: () => {},
	} as any;

	deleteOldUnread();

	assert.equal(trashedIds.length, 130);
	assert.deepEqual(trashedIds, allIds);
	assert.equal(labeledBatches.length, 2);
	assert.equal(labeledBatches[0].ids.length, 100);
	assert.equal(labeledBatches[1].ids.length, 30);
	assert.deepEqual(
		labeledBatches.flatMap((b) => b.ids),
		allIds
	);
});

test('deleteOldPromos processes all matching promo threads across multiple pages', () => {
	const allIds = Array.from(
		{ length: 110 },
		(_, index) => `promo-${index + 1}`
	);
	let liveIds = [...allIds];
	const trashedIds: string[] = [];

	globalWithGmail.GmailApp = {
		search: (_query: string, start = 0, max = 100) => {
			return liveIds
				.slice(start, start + max)
				.map((id) => ({
					id,
				})) as unknown as GoogleAppsScript.Gmail.GmailThread[];
		},
		createLabel: (name: string) => ({
			getName: () => name,
			addToThreads: () => {},
		}),
		moveThreadsToTrash: (threads: GoogleAppsScript.Gmail.GmailThread[]) => {
			for (const thread of threads) {
				trashedIds.push((thread as unknown as { id: string }).id);
			}
			liveIds = liveIds.filter(
				(id) =>
					!threads.some(
						(thread) => (thread as unknown as { id: string }).id === id
					)
			);
		},
	} as any;

	deleteOldPromos();

	assert.equal(trashedIds.length, 110);
	assert.deepEqual(trashedIds, allIds);
});

test('deleteOldUpdates processes all matching update threads across multiple pages', () => {
	const allIds = Array.from(
		{ length: 110 },
		(_, index) => `update-${index + 1}`
	);
	let liveIds = [...allIds];
	const trashedIds: string[] = [];

	globalWithGmail.GmailApp = {
		search: (_query: string, start = 0, max = 100) => {
			return liveIds
				.slice(start, start + max)
				.map((id) => ({
					id,
				})) as unknown as GoogleAppsScript.Gmail.GmailThread[];
		},
		createLabel: (name: string) => ({
			getName: () => name,
			addToThreads: () => {},
		}),
		moveThreadsToTrash: (threads: GoogleAppsScript.Gmail.GmailThread[]) => {
			for (const thread of threads) {
				trashedIds.push((thread as unknown as { id: string }).id);
			}
			liveIds = liveIds.filter(
				(id) =>
					!threads.some(
						(thread) => (thread as unknown as { id: string }).id === id
					)
			);
		},
	} as any;

	deleteOldUpdates();

	assert.equal(trashedIds.length, 110);
	assert.deepEqual(trashedIds, allIds);
});

test('deleteBotSmsEmails processes matching bot SMS threads and skips non-matching subjects across pages', () => {
	const threads = Array.from({ length: 120 }, (_, index) => {
		const isBot = index % 2 === 0;
		const id = `sms-${index + 1}`;
		const subject = isBot
			? `New text message from 12345`
			: `New text message from +1234567890`;
		return {
			id,
			getFirstMessageSubject: () => subject,
			moveToTrash: () => {
				trashed.push(id);
			},
		};
	});

	let liveThreads = [...threads];
	const trashed: string[] = [];

	globalWithGmail.GmailApp = {
		search: (_query: string, start = 0, max = 100) => {
			return liveThreads
				.slice(start, start + max)
				.map((t) => t) as unknown as GoogleAppsScript.Gmail.GmailThread[];
		},
		createLabel: (name: string) => ({
			getName: () => name,
			addToThreads: () => {},
		}),
	} as any;

	deleteBotSmsEmails();

	// 60 bot messages out of 120 should be trashed
	assert.equal(trashed.length, 60);
	for (let i = 0; i < 120; i += 2) {
		assert.ok(trashed.includes(`sms-${i + 1}`));
	}
});
