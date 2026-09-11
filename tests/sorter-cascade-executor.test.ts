import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
	selectCascadeThreads,
	selectLargeCandidates,
	fisherYatesShuffle,
	allocateSlotBudget,
	buildLargeMailQuery,
	resolveSlotPercentages,
	resolveSizeThresholds,
	BIG_SIZE_THRESHOLDS,
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

test('allocateSlotBudget splits the daily limit 60/20/20 by default', () => {
	assert.deepEqual(allocateSlotBudget(DAILY_LIMIT), {
		inbox: 30,
		largeElsewhere: 10,
		randomElsewhere: 10,
	});
});

test('allocateSlotBudget always sums to the limit despite rounding', () => {
	for (const limit of [1, 3, 7, 13, 47, 50]) {
		const budget = allocateSlotBudget(limit);
		assert.equal(
			budget.inbox + budget.largeElsewhere + budget.randomElsewhere,
			limit,
			`budget for limit ${limit} must sum to the limit`
		);
	}
});

test('allocateSlotBudget handles empty, saturated, and invalid percentages', () => {
	assert.deepEqual(allocateSlotBudget(0), {
		inbox: 0,
		largeElsewhere: 0,
		randomElsewhere: 0,
	});

	assert.deepEqual(allocateSlotBudget(20, { inbox: 100, largeElsewhere: 0 }), {
		inbox: 20,
		largeElsewhere: 0,
		randomElsewhere: 0,
	});

	// Over-subscribed percentages are normalized, never exceeding the limit
	const oversubscribed = allocateSlotBudget(20, {
		inbox: 90,
		largeElsewhere: 90,
	});
	assert.equal(
		oversubscribed.inbox +
			oversubscribed.largeElsewhere +
			oversubscribed.randomElsewhere,
		20
	);
	assert.ok(oversubscribed.randomElsewhere >= 0);

	// Invalid values fall back to the defaults
	assert.deepEqual(
		allocateSlotBudget(50, { inbox: -5, largeElsewhere: Number.NaN }),
		{ inbox: 30, largeElsewhere: 10, randomElsewhere: 10 }
	);
});

test('selectLargeCandidates stops at the first threshold that fills the budget', () => {
	const queries: string[] = [];
	const result = selectLargeCandidates({
		budget: 3,
		search: (query) => {
			queries.push(query);
			// Nothing is larger than 10M; 5M has enough
			if (query === buildLargeMailQuery('10M')) {
				return [];
			}
			if (query === buildLargeMailQuery('5M')) {
				return [
					createMockThread('big-1'),
					createMockThread('big-2'),
					createMockThread('big-3'),
				];
			}
			return [];
		},
	});

	assert.equal(result.threshold, '5M');
	assert.equal(result.candidates.length, 3);
	assert.deepEqual(queries, [
		buildLargeMailQuery('10M'),
		buildLargeMailQuery('5M'),
	]);
});

test('selectLargeCandidates falls back to the broadest pool and stays bounded', () => {
	const queries: string[] = [];
	const maxRequested: number[] = [];

	const result = selectLargeCandidates({
		budget: 10,
		search: (query, _start, max) => {
			queries.push(query);
			maxRequested.push(max);
			// Never enough to fill the budget; broadest threshold wins
			return query === buildLargeMailQuery('500K')
				? [createMockThread('big-1'), createMockThread('big-2')]
				: [];
		},
	});

	assert.equal(result.threshold, '500K');
	assert.equal(result.candidates.length, 2);
	assert.equal(queries.length, BIG_SIZE_THRESHOLDS.length);
	assert.ok(
		queries.length <= 5,
		'probe must never exceed five searches per run'
	);
	assert.deepEqual(new Set(maxRequested), new Set([50]));
});

test('selectLargeCandidates skips threads already selected by earlier pools', () => {
	const result = selectLargeCandidates({
		budget: 2,
		seenIds: new Set(['big-1']),
		search: (query) =>
			query === buildLargeMailQuery('10M')
				? [createMockThread('big-1'), createMockThread('big-2')]
				: [],
	});

	assert.deepEqual(
		result.candidates.map((thread) => thread.getId()),
		['big-2']
	);
});

test('selectLargeCandidates issues no searches when the budget is zero', () => {
	let searchCount = 0;
	const result = selectLargeCandidates({
		budget: 0,
		search: () => {
			searchCount += 1;
			return [];
		},
	});

	assert.equal(searchCount, 0);
	assert.deepEqual(result.candidates, []);
});

test('daily limit is configured as a conservative cap', () => {
	assert.equal(DAILY_LIMIT, 50);
});

test('resolveSlotPercentages and resolveSizeThresholds read script properties safely', () => {
	const globalWithProps = globalThis as any;
	const original = globalWithProps.PropertiesService;

	const withProperties = (properties: Record<string, string>) => {
		globalWithProps.PropertiesService = {
			getScriptProperties: () => ({
				getProperty: (key: string) => properties[key] ?? null,
			}),
		};
	};

	try {
		// Absent properties fall back to defaults
		delete globalWithProps.PropertiesService;
		assert.deepEqual(resolveSlotPercentages(), {
			inbox: 60,
			largeElsewhere: 20,
		});
		assert.deepEqual(resolveSizeThresholds(), BIG_SIZE_THRESHOLDS);

		withProperties({
			SORTER_INBOX_PERCENT: '40',
			SORTER_LARGE_MAIL_PERCENT: '35',
			SORTER_SIZE_THRESHOLDS: '25M, 8M ,750K',
		});
		assert.deepEqual(resolveSlotPercentages(), {
			inbox: 40,
			largeElsewhere: 35,
		});
		assert.deepEqual(resolveSizeThresholds(), ['25M', '8M', '750K']);

		// Malformed thresholds are rejected rather than injected into a Gmail query
		withProperties({ SORTER_SIZE_THRESHOLDS: '10M OR in:anywhere, -label:x' });
		assert.deepEqual(resolveSizeThresholds(), BIG_SIZE_THRESHOLDS);

		// Non-numeric percentages become NaN and are clamped back to defaults
		withProperties({ SORTER_INBOX_PERCENT: 'lots' });
		assert.deepEqual(allocateSlotBudget(50, resolveSlotPercentages()), {
			inbox: 30,
			largeElsewhere: 10,
			randomElsewhere: 10,
		});
	} finally {
		if (original === undefined) {
			delete globalWithProps.PropertiesService;
		} else {
			globalWithProps.PropertiesService = original;
		}
	}
});

test('selectCascadeThreads caps unread inbox at its budget and detects overflow', () => {
	const unreadPool = Array.from({ length: 50 }, (_, i) =>
		createMockThread(`unread-${i}`)
	);
	const bigPool = Array.from({ length: 10 }, (_, i) =>
		createMockThread(`big-${i}`)
	);
	const archivedPool = Array.from({ length: 10 }, (_, i) =>
		createMockThread(`arch-${i}`)
	);
	const queryExecuted: string[] = [];

	const result = selectCascadeThreads({
		limit: 50,
		search: (query, _start, max) => {
			queryExecuted.push(query);
			if (query === CASCADE_QUERIES.unreadInbox) {
				return unreadPool.slice(0, max);
			}
			if (query === buildLargeMailQuery('10M')) {
				return bigPool.slice(0, max);
			}
			if (query === CASCADE_QUERIES.archived) {
				return archivedPool.slice(0, max);
			}
			return [];
		},
		random: () => 0.5,
	});

	// Unread mail is effectively unlimited, yet it may not starve the other pools
	assert.equal(result.counts.unreadInbox, 30);
	assert.equal(result.counts.largeElsewhere, 10);
	assert.equal(result.counts.archived, 10);
	assert.equal(result.counts.oldInbox, 0);
	assert.equal(result.threads.length, 50);
	assert.equal(result.isHighVolumeOverflow, true);

	// Inbox budget was satisfied by unread mail, so oldInbox is never queried
	assert.ok(!queryExecuted.includes(CASCADE_QUERIES.oldInbox));
	// The probe stops at the first threshold that fills the big budget
	assert.deepEqual(queryExecuted, [
		CASCADE_QUERIES.unreadInbox,
		buildLargeMailQuery('10M'),
		CASCADE_QUERIES.archived,
	]);
});

test('selectCascadeThreads redirects unfilled inbox and large slots to random elsewhere', () => {
	const archivedPool = Array.from({ length: 20 }, (_, i) =>
		createMockThread(`arch-${i}`)
	);
	let archivedMaxRequested = 0;

	const result = selectCascadeThreads({
		limit: 10,
		search: (query, _start, max) => {
			if (query === CASCADE_QUERIES.archived) {
				archivedMaxRequested = max;
				return archivedPool.slice(0, max);
			}
			// Inbox and big pools are both empty
			return [];
		},
		random: () => 0.5,
	});

	assert.equal(result.threads.length, 10);
	assert.equal(result.counts.archived, 10);
	assert.equal(result.counts.unreadInbox, 0);
	assert.equal(result.counts.largeElsewhere, 0);
	assert.equal(result.isHighVolumeOverflow, false);
	// All 10 slots cascaded into the random-elsewhere pool, oversampled 5x
	assert.equal(archivedMaxRequested, 50);
});

test('selectCascadeThreads honors custom percentages', () => {
	const pools: Record<string, string> = {
		[CASCADE_QUERIES.unreadInbox]: 'u',
		[buildLargeMailQuery('10M')]: 'big',
		[CASCADE_QUERIES.archived]: 'arch',
	};

	const result = selectCascadeThreads({
		limit: 10,
		percentages: { inbox: 20, largeElsewhere: 50 },
		search: (query, _start, max) => {
			const prefix = pools[query];
			if (!prefix) {
				return [];
			}
			return Array.from({ length: max }, (_, i) =>
				createMockThread(`${prefix}-${i}`)
			);
		},
		random: () => 0.5,
	});

	assert.equal(result.counts.unreadInbox, 2);
	assert.equal(result.counts.largeElsewhere, 5);
	assert.equal(result.counts.archived, 3);
	assert.equal(result.threads.length, 10);
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

	// limit 6 -> inbox 3, large 1, random 2; the empty large budget cascades to archived
	assert.equal(result.isHighVolumeOverflow, false);
	assert.equal(result.threads.length, 6);
	assert.equal(result.counts.unreadInbox, 2);
	assert.equal(result.counts.oldInbox, 1);
	assert.equal(result.counts.largeElsewhere, 0);
	assert.equal(result.counts.archived, 3);
	assert.deepEqual(queriesCalled, [
		CASCADE_QUERIES.unreadInbox,
		CASCADE_QUERIES.oldInbox,
		...BIG_SIZE_THRESHOLDS.map(buildLargeMailQuery),
		CASCADE_QUERIES.archived,
	]);
	assert.ok(
		queriesCalled.length <= 8,
		'a run must never exceed eight Gmail searches'
	);
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
