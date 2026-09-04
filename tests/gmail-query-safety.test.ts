import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import Query from '../src/common/Query';
import GmailQuery from '../src/Gmail/GmailQuery';

const globalWithGmail = globalThis as typeof globalThis & {
	GmailApp: {
		search: (query: string, start?: number, max?: number) => unknown[];
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
	const leapDayQuery = new GmailQuery('subject:test').after(
		new Date(Date.UTC(2024, 1, 29, 5, 45, 0))
	);
	const yearBoundaryQuery = new GmailQuery('subject:test').before(
		new Date(Date.UTC(2026, 0, 1, 0, 0, 0))
	);

	assert.match(afterQuery.toString(), / after:2026\/01\/15$/u);
	assert.match(beforeQuery.toString(), / before:2025\/12\/31$/u);
	assert.match(leapDayQuery.toString(), / after:2024\/02\/29$/u);
	assert.match(yearBoundaryQuery.toString(), / before:2026\/01\/01$/u);
});

test('Query.processSync preserves all matching results even when the callback mutates the result set', () => {
	const allIds = Array.from(
		{ length: 130 },
		(_, index) => `thread-${index + 1}`
	);
	let liveIds = [...allIds];
	const searcher = (_query: string, start = 0, max = 100) =>
		liveIds.slice(start, start + max).map((id) => ({ id }));

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
});
