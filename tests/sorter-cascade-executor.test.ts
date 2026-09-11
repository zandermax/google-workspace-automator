import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
	selectCascadeThreads,
	fisherYatesShuffle,
	CASCADE_QUERIES,
	DAILY_LIMIT,
} from '../src/Gmail/cascadeSelection';
import {
	determineTriageDirective,
	determineTriageDirectives,
	AUTO_RECYCLE_LABEL,
	PENDING_ACTION_LABEL,
} from '../src/Gmail/actionRules';
import {
	executeTriageActions,
	type LabelLike,
	type ThreadLikeWithId,
} from '../src/Gmail/actionExecutor';
import type {
	ExtractedEmailSnippet,
	TriageClassification,
} from '../src/types/Gmail/triage';

interface MockThread {
	id: string;
	getId(): string;
}

const createMockThread = (id: string): MockThread => ({
	id,
	getId: () => id,
});

test('fisherYatesShuffle maintains all elements and works with deterministic random', () => {
	const items = ['a', 'b', 'c', 'd', 'e'];
	const shuffled = fisherYatesShuffle(items, () => 0);
	assert.equal(shuffled.length, items.length);
	assert.deepEqual(new Set(shuffled), new Set(items));
});

test('selectCascadeThreads prioritizes unread inbox and detects overflow', () => {
	const unreadPool = Array.from({ length: 50 }, (_, i) =>
		createMockThread(`unread-${i}`)
	);
	let queryExecuted: string[] = [];

	const result = selectCascadeThreads({
		limit: 50,
		search: (query) => {
			queryExecuted.push(query);
			if (query === CASCADE_QUERIES.unreadInbox) {
				return unreadPool;
			}
			return [];
		},
	});

	assert.equal(result.threads.length, 50);
	assert.equal(result.isHighVolumeOverflow, true);
	assert.equal(result.counts.unreadInbox, 50);
	assert.equal(result.counts.oldInbox, 0);
	assert.equal(result.counts.archived, 0);
	assert.deepEqual(queryExecuted, [CASCADE_QUERIES.unreadInbox]);
});

test('selectCascadeThreads cascades to old inbox and archived pools when slots remain', () => {
	const unreadPool = [createMockThread('u1'), createMockThread('u2')];
	const oldInboxPool = [
		createMockThread('o1'),
		createMockThread('o2'),
		createMockThread('o3'),
	];
	const archivedPool = [
		createMockThread('a1'),
		createMockThread('a2'),
		createMockThread('a3'),
	];

	const queriesCalled: string[] = [];
	const result = selectCascadeThreads({
		limit: 6,
		search: (query, _start, max) => {
			queriesCalled.push(query);
			if (query === CASCADE_QUERIES.unreadInbox) {
				return unreadPool;
			}
			if (query === CASCADE_QUERIES.oldInbox) {
				return oldInboxPool.slice(0, max);
			}
			if (query === CASCADE_QUERIES.archived) {
				return archivedPool.slice(0, max);
			}
			return [];
		},
		random: () => 0.5,
	});

	assert.equal(result.isHighVolumeOverflow, false);
	assert.equal(result.threads.length, 6);
	assert.equal(result.counts.unreadInbox, 2);
	assert.equal(result.counts.oldInbox, 3);
	assert.equal(result.counts.archived, 1);
	assert.deepEqual(queriesCalled, [
		CASCADE_QUERIES.unreadInbox,
		CASCADE_QUERIES.oldInbox,
		CASCADE_QUERIES.archived,
	]);
});

test('selectCascadeThreads avoids duplicate thread IDs across pools', () => {
	const unreadPool = [createMockThread('duplicate-1')];
	const oldInboxPool = [
		createMockThread('duplicate-1'),
		createMockThread('o1'),
	];

	const result = selectCascadeThreads({
		limit: 5,
		search: (query) => {
			if (query === CASCADE_QUERIES.unreadInbox) return unreadPool;
			if (query === CASCADE_QUERIES.oldInbox) return oldInboxPool;
			return [];
		},
	});

	const ids = result.threads.map((t) => t.getId());
	assert.deepEqual(ids, ['duplicate-1', 'o1']);
});

test('determineTriageDirective routes time-sensitive stale mail to recycle-7d-only', () => {
	const email: ExtractedEmailSnippet = {
		id: 't-stale',
		sender: 'promo@store.com',
		senderDomain: 'store.com',
		subject: 'Flash Sale',
		snippet: '24hr flash sale ends today',
		hasAttachment: false,
		attachmentTypes: [],
		attachmentIcons: [],
		ageInDays: 10,
		sizeKb: 5,
		date: new Date(),
	};

	const classification: TriageClassification = {
		id: 't-stale',
		category: 'triage/junk',
		timeSensitive: true,
		actionRequired: false,
		summary: 'Stale promo flash sale.',
		highlights: [],
		keyDetail: '',
	};

	const directive = determineTriageDirective(email, classification, 7);
	assert.equal(directive.actionType, 'recycle-7d-only');
	assert.equal(directive.triageLabel, undefined);
	assert.equal(directive.recycleLabel, AUTO_RECYCLE_LABEL);
	assert.ok(directive.reason.includes('Time-sensitive message is stale'));
});

test('determineTriageDirective routes non-stale ephemeral categories to label + recycle-7d', () => {
	const email: ExtractedEmailSnippet = {
		id: 't-newsletter',
		sender: 'digest@tech.com',
		senderDomain: 'tech.com',
		subject: 'Weekly Tech Digest',
		snippet: 'This week in web dev',
		hasAttachment: false,
		attachmentTypes: [],
		attachmentIcons: [],
		ageInDays: 2,
		sizeKb: 8,
		date: new Date(),
	};

	const classification: TriageClassification = {
		id: 't-newsletter',
		category: 'triage/newsletters',
		timeSensitive: false,
		actionRequired: false,
		summary: 'Weekly tech articles.',
		highlights: ['TypeScript 5.9'],
		keyDetail: '',
	};

	const directive = determineTriageDirective(email, classification, 7);
	assert.equal(directive.actionType, 'apply-label-and-recycle-7d');
	assert.equal(directive.triageLabel, 'triage/newsletters');
	assert.equal(directive.recycleLabel, AUTO_RECYCLE_LABEL);
});

test('determineTriageDirective routes retain categories to apply-label-only', () => {
	const email: ExtractedEmailSnippet = {
		id: 't-personal',
		sender: 'mom@family.org',
		senderDomain: 'family.org',
		subject: 'Holiday plans',
		snippet: 'Are you coming over for Thanksgiving?',
		hasAttachment: false,
		attachmentTypes: [],
		attachmentIcons: [],
		ageInDays: 20, // Older, but NOT timeSensitive
		sizeKb: 3,
		date: new Date(),
	};

	const classification: TriageClassification = {
		id: 't-personal',
		category: 'triage/personal',
		timeSensitive: false,
		actionRequired: true,
		summary: 'Family holiday plans note.',
		highlights: ['Thanksgiving dinner'],
		keyDetail: 'Thanksgiving',
	};

	const directive = determineTriageDirective(email, classification, 7);
	assert.equal(directive.actionType, 'apply-label-only');
	assert.equal(directive.triageLabel, 'triage/personal');
	assert.equal(directive.recycleLabel, undefined);
});

test('determineTriageDirective routes triage/unknown to apply-label-only for manual review', () => {
	const email: ExtractedEmailSnippet = {
		id: 't-unknown',
		sender: 'stranger@odd.xyz',
		senderDomain: 'odd.xyz',
		subject: 'Unusual query',
		snippet: 'Something completely unclassifiable',
		hasAttachment: false,
		attachmentTypes: [],
		attachmentIcons: [],
		ageInDays: 3,
		sizeKb: 4,
		date: new Date(),
	};

	const classification: TriageClassification = {
		id: 't-unknown',
		category: 'triage/unknown',
		timeSensitive: false,
		actionRequired: false,
		summary: 'Unclassifiable query message.',
		highlights: [],
		keyDetail: '',
	};

	const directive = determineTriageDirective(email, classification, 7);
	assert.equal(directive.actionType, 'apply-label-only');
	assert.equal(directive.triageLabel, 'triage/unknown');
	assert.equal(directive.recycleLabel, undefined);
});

test('determineTriageDirectives matches emails with classifications in batch', () => {
	const email1: ExtractedEmailSnippet = {
		id: 't-1',
		sender: 'a@b.com',
		senderDomain: 'b.com',
		subject: 'Sub 1',
		snippet: 'Body 1',
		hasAttachment: false,
		attachmentTypes: [],
		attachmentIcons: [],
		ageInDays: 1,
		sizeKb: 1,
		date: new Date(),
	};
	const email2: ExtractedEmailSnippet = {
		...email1,
		id: 't-2',
		subject: 'Sub 2',
	};

	const class1: TriageClassification = {
		id: 't-1',
		category: 'triage/finance',
		timeSensitive: false,
		actionRequired: false,
		summary: 'Finance',
		highlights: [],
		keyDetail: '',
	};
	const class2: TriageClassification = {
		id: 't-2',
		category: 'triage/alerts',
		timeSensitive: false,
		actionRequired: false,
		summary: 'Alert',
		highlights: [],
		keyDetail: '',
	};

	const directives = determineTriageDirectives(
		[email1, email2],
		[class2, class1]
	);
	assert.equal(directives.length, 2);
	assert.equal(directives[0].threadId, 't-1');
	assert.equal(directives[0].triageLabel, 'triage/finance');
	assert.equal(directives[1].threadId, 't-2');
	assert.equal(directives[1].triageLabel, 'triage/alerts');

	assert.throws(
		() => determineTriageDirectives([email1, email2], [class1]),
		/Missing classification/iu
	);
});

test('executeTriageActions dry run skips mutations and returns simulated results', () => {
	const email: ExtractedEmailSnippet = {
		id: 't-dry',
		sender: 'news@daily.com',
		senderDomain: 'daily.com',
		subject: 'Daily news',
		snippet: 'Today headline',
		hasAttachment: false,
		attachmentTypes: [],
		attachmentIcons: [],
		ageInDays: 1,
		sizeKb: 2,
		date: new Date(),
	};

	const classification: TriageClassification = {
		id: 't-dry',
		category: 'triage/newsletters',
		timeSensitive: false,
		actionRequired: false,
		summary: 'Daily news',
		highlights: [],
		keyDetail: '',
	};

	const directive = determineTriageDirective(email, classification);
	let labelAdded = false;
	let markProcessedCalled = false;

	const result = executeTriageActions([directive], {
		dryRun: true,
		getLabel: () => ({
			getName: () => 'label',
			addToThread: () => {
				labelAdded = true;
			},
		}),
		markProcessed: () => {
			markProcessedCalled = true;
		},
	});

	assert.equal(result.isDryRun, true);
	assert.equal(result.processedCount, 1);
	assert.equal(result.labeledCount, 1);
	assert.equal(result.recycledCount, 1);
	assert.equal(labelAdded, false);
	assert.equal(markProcessedCalled, false);
});

test('executeTriageActions live mode applies labels, marks processed, and respects dailyLimit', () => {
	const labelsApplied: Array<{ label: string; threadId: string }> = [];
	const processedBatches: string[][] = [];

	const mockLabels = new Map<string, LabelLike>();
	const getOrCreateLabel = (name: string): LabelLike => {
		let l = mockLabels.get(name);
		if (!l) {
			l = {
				getName: () => name,
				addToThread: (t: any) => {
					labelsApplied.push({ label: name, threadId: t.getId() });
				},
			};
			mockLabels.set(name, l);
		}
		return l;
	};

	const directives = [
		{
			threadId: 'th-1',
			classification: {
				id: 'th-1',
				category: 'triage/personal',
				timeSensitive: false,
				actionRequired: false,
				summary: '',
				highlights: [],
				keyDetail: '',
			} as TriageClassification,
			email: { id: 'th-1' } as ExtractedEmailSnippet,
			actionType: 'apply-label-only' as const,
			triageLabel: 'triage/personal' as const,
			reason: 'personal',
		},
		{
			threadId: 'th-2',
			classification: {
				id: 'th-2',
				category: 'triage/newsletters',
				timeSensitive: false,
				actionRequired: false,
				summary: '',
				highlights: [],
				keyDetail: '',
			} as TriageClassification,
			email: { id: 'th-2' } as ExtractedEmailSnippet,
			actionType: 'apply-label-and-recycle-7d' as const,
			triageLabel: 'triage/newsletters' as const,
			recycleLabel: 'Auto-Recycle/7d' as const,
			reason: 'newsletter',
		},
		{
			threadId: 'th-3',
			classification: {
				id: 'th-3',
				category: 'triage/junk',
				timeSensitive: true,
				actionRequired: false,
				summary: '',
				highlights: [],
				keyDetail: '',
			} as TriageClassification,
			email: { id: 'th-3' } as ExtractedEmailSnippet,
			actionType: 'recycle-7d-only' as const,
			recycleLabel: 'Auto-Recycle/7d' as const,
			reason: 'stale junk',
		},
	];

	const result = executeTriageActions(directives, {
		dryRun: false,
		dailyLimit: 2, // Limit to 2 threads
		getLabel: (name) => mockLabels.get(name) ?? null,
		createLabel: (name) => getOrCreateLabel(name),
		resolveThread: (id) => createMockThread(id),
		markProcessed: (threads) => {
			processedBatches.push(threads.map((t) => t.getId()));
		},
	});

	assert.equal(result.isDryRun, false);
	assert.equal(result.processedCount, 2);
	assert.equal(result.skippedCount, 1); // 3rd directive skipped due to dailyLimit=2
	assert.equal(result.labeledCount, 2);
	assert.equal(result.recycledCount, 1);

	// th-1 got triage/personal and Digest/Pending-Action
	// th-2 got triage/newsletters, Auto-Recycle/7d, and Digest/Pending-Action
	assert.deepEqual(labelsApplied, [
		{ label: 'triage/personal', threadId: 'th-1' },
		{ label: 'Digest/Pending-Action', threadId: 'th-1' },
		{ label: 'triage/newsletters', threadId: 'th-2' },
		{ label: 'Auto-Recycle/7d', threadId: 'th-2' },
		{ label: 'Digest/Pending-Action', threadId: 'th-2' },
	]);

	assert.deepEqual(processedBatches, [['th-1', 'th-2']]);
});

test('executeTriageActions applies Digest/Pending-Action to every processed thread, including recycle-7d-only', () => {
	const labelsApplied: Array<{ label: string; threadId: string }> = [];
	const mockLabels = new Map<string, LabelLike>();
	const getOrCreateLabel = (name: string): LabelLike => {
		let l = mockLabels.get(name);
		if (!l) {
			l = {
				getName: () => name,
				addToThread: (t: any) => {
					labelsApplied.push({ label: name, threadId: t.getId() });
				},
			};
			mockLabels.set(name, l);
		}
		return l;
	};

	const directive = {
		threadId: 'th-recycle',
		classification: {
			id: 'th-recycle',
			category: 'triage/junk',
			timeSensitive: true,
			actionRequired: false,
			summary: '',
			highlights: [],
			keyDetail: '',
		} as TriageClassification,
		email: { id: 'th-recycle' } as ExtractedEmailSnippet,
		actionType: 'recycle-7d-only' as const,
		recycleLabel: 'Auto-Recycle/7d' as const,
		reason: 'stale junk',
	};

	executeTriageActions([directive], {
		dryRun: false,
		getLabel: (name) => mockLabels.get(name) ?? null,
		createLabel: (name) => getOrCreateLabel(name),
		resolveThread: (id) => createMockThread(id),
		markProcessed: () => {},
	});

	assert.deepEqual(labelsApplied, [
		{ label: 'Auto-Recycle/7d', threadId: 'th-recycle' },
		{ label: 'Digest/Pending-Action', threadId: 'th-recycle' },
	]);
});
