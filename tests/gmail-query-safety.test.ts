import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import Query from '../src/common/Query';
import GmailQuery from '../src/Gmail/GmailQuery';

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
