import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { groupDirectivesByDuplicates } from '../src/Gmail/deduplication';
import type {
	ExtractedEmailSnippet,
	TriageClassification,
	TriageExecutionDirective,
} from '../src/types/Gmail/triage';

function createMockDirective(
	id: string,
	options: {
		threadId?: string;
		subject?: string;
		duplicateOfId?: string;
		date?: Date;
		ageInDays?: number;
		actionRequired?: boolean;
		category?: TriageClassification['category'];
	} = {}
): TriageExecutionDirective {
	const email: ExtractedEmailSnippet = {
		id,
		sender: `Sender ${id} <${id}@example.com>`,
		senderDomain: 'example.com',
		subject: options.subject ?? `Subject of ${id}`,
		snippet: `Snippet body text for ${id}`,
		hasAttachment: false,
		attachmentTypes: [],
		attachmentIcons: [],
		ageInDays: options.ageInDays ?? 2,
		sizeKb: 50,
		date: options.date ?? new Date('2026-09-08T10:00:00Z'),
	};

	const classification: TriageClassification = {
		id,
		category: options.category ?? 'triage/alerts',
		timeSensitive: false,
		actionRequired: options.actionRequired ?? false,
		summary: `Summary of email ${id}`,
		highlights: [`Highlight 1 for ${id}`],
		keyDetail: '',
		duplicateOfId: options.duplicateOfId,
	};

	return {
		threadId: options.threadId ?? `thread-${id}`,
		classification,
		email,
		actionType: 'apply-label-only',
		triageLabel: classification.category,
		reason: 'test reason',
	};
}

test('returns identical array when no duplicates exist', () => {
	const d1 = createMockDirective('1');
	const d2 = createMockDirective('2');
	const d3 = createMockDirective('3');

	const result = groupDirectivesByDuplicates([d1, d2, d3]);
	assert.strictEqual(result.length, 3);
	assert.deepStrictEqual(result, [d1, d2, d3]);
	assert.strictEqual(result[0].effectiveDuplicates, undefined);
	assert.strictEqual(result[1].effectiveDuplicates, undefined);
	assert.strictEqual(result[2].effectiveDuplicates, undefined);
});

test('handles empty and single-element arrays', () => {
	assert.deepStrictEqual(groupDirectivesByDuplicates([]), []);
	const d1 = createMockDirective('1');
	assert.deepStrictEqual(groupDirectivesByDuplicates([d1]), [d1]);
});

test('discards duplicateOfId that does not match any real email id in the batch', () => {
	const d1 = createMockDirective('1', { duplicateOfId: 'non-existent-id' });
	const d2 = createMockDirective('2', { duplicateOfId: 'another-fake-id' });

	const result = groupDirectivesByDuplicates([d1, d2]);
	assert.strictEqual(result.length, 2);
	assert.deepStrictEqual(result, [d1, d2]);
	assert.strictEqual(result[0].effectiveDuplicates, undefined);
	assert.strictEqual(result[1].effectiveDuplicates, undefined);
});

test('discards self-referential duplicateOfId === id', () => {
	const d1 = createMockDirective('1', { duplicateOfId: '1' });
	const d2 = createMockDirective('2');

	const result = groupDirectivesByDuplicates([d1, d2]);
	assert.strictEqual(result.length, 2);
	assert.deepStrictEqual(result, [d1, d2]);
	assert.strictEqual(result[0].effectiveDuplicates, undefined);
	assert.strictEqual(result[1].effectiveDuplicates, undefined);
});

test('handles multi-step chains (C -> B -> A) and clusters them together', () => {
	const d1 = createMockDirective('1', {
		subject: 'Reminder 1',
		date: new Date('2026-09-08T08:00:00Z'),
	});
	const d2 = createMockDirective('2', {
		subject: 'Reminder 2',
		duplicateOfId: '1',
		date: new Date('2026-09-08T10:00:00Z'),
	});
	const d3 = createMockDirective('3', {
		subject: 'Reminder 3',
		duplicateOfId: '2',
		date: new Date('2026-09-08T12:00:00Z'),
	});

	const result = groupDirectivesByDuplicates([d1, d2, d3]);
	assert.strictEqual(result.length, 1);
	// d3 is the newest (12:00), so it should be primary
	assert.strictEqual(result[0].email.id, '3');
	assert.deepStrictEqual(result[0].effectiveDuplicates, [
		{ threadId: 'thread-2', subject: 'Reminder 2' },
		{ threadId: 'thread-1', subject: 'Reminder 1' },
	]);
});

test('handles cyclic references (A -> B -> A)', () => {
	const d1 = createMockDirective('1', {
		subject: 'Cyclic A',
		duplicateOfId: '2',
		date: new Date('2026-09-08T10:00:00Z'),
	});
	const d2 = createMockDirective('2', {
		subject: 'Cyclic B',
		duplicateOfId: '1',
		date: new Date('2026-09-08T11:00:00Z'),
	});

	const result = groupDirectivesByDuplicates([d1, d2]);
	assert.strictEqual(result.length, 1);
	// d2 is newer
	assert.strictEqual(result[0].email.id, '2');
	assert.deepStrictEqual(result[0].effectiveDuplicates, [
		{ threadId: 'thread-1', subject: 'Cyclic A' },
	]);
});

test('selects the most recent email by date descending as primary', () => {
	const older = createMockDirective('1', {
		subject: 'Older email',
		date: new Date('2026-09-05T10:00:00Z'),
	});
	const newer = createMockDirective('2', {
		subject: 'Newer email',
		duplicateOfId: '1',
		date: new Date('2026-09-10T10:00:00Z'),
	});

	const result = groupDirectivesByDuplicates([older, newer]);
	assert.strictEqual(result.length, 1);
	assert.strictEqual(result[0].email.id, '2');
	assert.deepStrictEqual(result[0].effectiveDuplicates, [
		{ threadId: 'thread-1', subject: 'Older email' },
	]);
});

test('selects by ageInDays ascending if date is identical or missing', () => {
	const sharedDate = new Date('2026-09-08T10:00:00Z');
	const olderAge = createMockDirective('1', {
		subject: 'Older age',
		date: sharedDate,
		ageInDays: 5,
	});
	const newerAge = createMockDirective('2', {
		subject: 'Newer age',
		duplicateOfId: '1',
		date: sharedDate,
		ageInDays: 1,
	});

	const result = groupDirectivesByDuplicates([olderAge, newerAge]);
	assert.strictEqual(result.length, 1);
	assert.strictEqual(result[0].email.id, '2');
	assert.deepStrictEqual(result[0].effectiveDuplicates, [
		{ threadId: 'thread-1', subject: 'Older age' },
	]);
});

test('elevates actionRequired to true on primary if any cluster member has actionRequired: true', () => {
	const older = createMockDirective('1', {
		subject: 'Action item email',
		duplicateOfId: undefined,
		actionRequired: true,
		date: new Date('2026-09-05T10:00:00Z'),
	});
	const newer = createMockDirective('2', {
		subject: 'Reminder email',
		duplicateOfId: '1',
		actionRequired: false,
		date: new Date('2026-09-10T10:00:00Z'),
	});

	const result = groupDirectivesByDuplicates([older, newer]);
	assert.strictEqual(result.length, 1);
	assert.strictEqual(result[0].email.id, '2');
	assert.strictEqual(result[0].classification.actionRequired, true);
});

test('preserves original relative order among unique clusters', () => {
	// Cluster A: id 1 and id 4 (1 appears first at index 0)
	// Cluster B: id 2 (appears at index 1)
	// Cluster C: id 3 and id 5 (3 appears at index 2)
	const a1 = createMockDirective('1', {
		subject: 'A1',
		date: new Date('2026-09-01T10:00:00Z'),
	});
	const b1 = createMockDirective('2', {
		subject: 'B1',
		date: new Date('2026-09-02T10:00:00Z'),
	});
	const c1 = createMockDirective('3', {
		subject: 'C1',
		date: new Date('2026-09-03T10:00:00Z'),
	});
	const a2 = createMockDirective('4', {
		subject: 'A2',
		duplicateOfId: '1',
		date: new Date('2026-09-05T10:00:00Z'), // newer in cluster A
	});
	const c2 = createMockDirective('5', {
		subject: 'C2',
		duplicateOfId: '3',
		date: new Date('2026-09-06T10:00:00Z'), // newer in cluster C
	});

	// Input order: [a1, b1, c1, a2, c2]
	// First appearance of Cluster A is index 0 (primary is a2)
	// First appearance of Cluster B is index 1 (primary is b1)
	// First appearance of Cluster C is index 2 (primary is c2)
	const result = groupDirectivesByDuplicates([a1, b1, c1, a2, c2]);
	assert.strictEqual(result.length, 3);
	assert.strictEqual(result[0].email.id, '4'); // Cluster A primary
	assert.strictEqual(result[1].email.id, '2'); // Cluster B primary
	assert.strictEqual(result[2].email.id, '5'); // Cluster C primary
});
