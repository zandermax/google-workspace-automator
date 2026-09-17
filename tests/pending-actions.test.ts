import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { getPendingActionCount } from '../src/Gmail/pendingActions';
import {
	getTriageSummary,
	removeTriageSummary,
	saveTriageSummaries,
	type TriageSummaryPropertyStore,
} from '../src/Gmail/pendingTriageSummaries';
import type { TriageExecutionDirective } from '../src/types/Gmail/triage';

const createPropertyStore = (): TriageSummaryPropertyStore & {
	properties: Map<string, string>;
} => {
	const properties = new Map<string, string>();
	return {
		properties,
		getProperty: (key) => properties.get(key) ?? null,
		setProperty: (key, value) => properties.set(key, value),
		deleteProperty: (key) => properties.delete(key),
	};
};

const createDirective = (threadId: string): TriageExecutionDirective => ({
	threadId,
	classification: {
		id: threadId,
		category: 'triage/newsletters',
		timeSensitive: false,
		actionRequired: false,
		summary: 'Weekly product updates and announcements.',
		highlights: ['Release notes', 'Upcoming webinar'],
		keyDetail: 'Webinar Friday',
	},
	email: {
		id: threadId,
		sender: 'news@example.com',
		senderDomain: 'example.com',
		subject: 'Weekly update',
		snippet: '',
		hasAttachment: false,
		attachmentTypes: [],
		attachmentIcons: [],
		ageInDays: 1,
		sizeKb: 1,
		date: new Date(),
	},
	actionType: 'apply-label-only',
	triageLabel: 'triage/newsletters',
	reason: 'Newsletter',
});

test('getPendingActionCount delegates to the injected provider', () => {
	const count = getPendingActionCount({ countPending: () => 7 });
	assert.equal(count, 7);
});

test('getPendingActionCount returns zero when nothing is pending', () => {
	const count = getPendingActionCount({ countPending: () => 0 });
	assert.equal(count, 0);
});

test('getPendingActionCount throws a clear error when GmailApp is unavailable and no provider is given', () => {
	assert.throws(() => getPendingActionCount(), /GmailApp is not available/u);
});

test('triage summaries persist by thread ID and are removed after resolution', () => {
	const store = createPropertyStore();

	saveTriageSummaries([createDirective('thread-1')], store);
	assert.deepEqual(getTriageSummary('thread-1', store), {
		category: 'triage/newsletters',
		summary: 'Weekly product updates and announcements.',
		highlights: ['Release notes', 'Upcoming webinar'],
		keyDetail: 'Webinar Friday',
		sizeKb: 1,
	});

	removeTriageSummary('thread-1', store);
	assert.equal(getTriageSummary('thread-1', store), undefined);
});
