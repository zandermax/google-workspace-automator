import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { runAiSorterPipeline } from '../src/_s/Gmail/aiSorter';
import { GeminiClient, type HttpTransport } from '../src/Gmail/GeminiClient';
import { CASCADE_QUERIES } from '../src/Gmail/cascadeSelection';
import type { MessageLike, ThreadLike } from '../src/Gmail/extraction';

const createMockMessage = (id: string, subject: string, sender: string, body: string): MessageLike => ({
	getId: () => `msg-${id}`,
	getSubject: () => subject,
	getFrom: () => sender,
	getPlainBody: () => body,
	getDate: () => new Date('2026-09-08T10:00:00Z'),
	getAttachments: () => [],
	getHeader: () => '',
	getThread: () => ({ getId: () => id }),
});

const createMockThread = (id: string, subject: string, sender: string, body: string): ThreadLike => {
	const msg = createMockMessage(id, subject, sender, body);
	return {
		getId: () => id,
		getMessages: () => [msg],
	};
};

const createMockGeminiTransport = (classifications: Array<Record<string, unknown>>): HttpTransport => ({
	fetch: () => ({
		getResponseCode: () => 200,
		getContentText: () =>
			JSON.stringify({
				candidates: [
					{
						content: {
							parts: [
								{
									text: JSON.stringify(classifications),
								},
							],
						},
					},
				],
			}),
	}),
});

test('runAiSorterPipeline dry run executes complete pipeline without mutations and produces digest', () => {
	const t1 = createMockThread('thread-1', 'Lunch tomorrow', 'friend@example.com', 'Are we still on for lunch?');
	const t2 = createMockThread('thread-2', 'Weekly Digest', 'news@daily.com', 'This week top stories');

	const geminiClassifications = [
		{
			id: 'thread-1',
			category: 'triage/personal',
			timeSensitive: false,
			actionRequired: true,
			summary: 'Lunch tomorrow inquiry.',
			highlights: ['Lunch inquiry'],
			keyDetail: 'Tomorrow',
		},
		{
			id: 'thread-2',
			category: 'triage/newsletters',
			timeSensitive: false,
			actionRequired: false,
			summary: 'Weekly top stories.',
			highlights: ['Top stories'],
			keyDetail: '',
		},
	];

	const geminiClient = new GeminiClient({
		apiKey: 'test-key',
		transport: createMockGeminiTransport(geminiClassifications),
	});

	let sentEmail: { recipient: string; subject: string; body: string } | null = null;

	const result = runAiSorterPipeline({
		dryRun: true,
		dailyLimit: 10,
		geminiClient,
		pendingCountProvider: { countPending: () => 0 },
		actionsPageUrlProvider: {
			getActionsPageUrl: () => 'https://script.google.com/macros/s/test-deployment/exec',
		},
		search: (query) => {
			if (query === CASCADE_QUERIES.unreadInbox) {
				return [t1, t2];
			}
			return [];
		},
		storageProvider: {
			getStorageUsed: () => 2 * 1024 * 1024 * 1024,
			getStorageLimit: () => 15 * 1024 * 1024 * 1024,
		},
		recipient: 'owner@example.com',
		emailSender: {
			sendEmail: (recipient, subject, body) => {
				sentEmail = { recipient, subject, body };
			},
		},
	});

	assert.equal(result.isDryRun, true);
	assert.equal(result.processedCount, 2);
	assert.equal(result.actionRequiredCount, 1);
	assert.equal(result.autoRecyclingCount, 1);
	assert.ok(result.digestSubject.startsWith('[DRY RUN]'));

	assert.ok(sentEmail !== null);
	assert.equal(sentEmail?.recipient, 'owner@example.com');
	assert.ok(sentEmail?.subject.includes('[DRY RUN] 📬 Daily Email Digest'));
	assert.ok(sentEmail?.body.includes('⚡ ACTION REQUIRED'));
	assert.ok(sentEmail?.body.includes('Lunch tomorrow'));
	assert.ok(sentEmail?.body.includes('📰 NEWSLETTERS'));
	assert.ok(sentEmail?.body.includes('Weekly Digest'));
	assert.ok(
		sentEmail?.body.includes(
			'https://script.google.com/macros/s/test-deployment/exec'
		)
	);
});

test('runAiSorterPipeline handles empty inbox run gracefully', () => {
	let emailSent = false;
	const geminiClient = new GeminiClient({
		apiKey: 'test-key',
		transport: createMockGeminiTransport([]),
	});

	const result = runAiSorterPipeline({
		dryRun: false,
		dailyLimit: 50,
		geminiClient,
		pendingCountProvider: { countPending: () => 0 },
		actionsPageUrlProvider: {
			getActionsPageUrl: () => 'https://script.google.com/macros/s/test-deployment/exec',
		},
		search: () => [],
		storageProvider: {
			getStorageUsed: () => 0,
			getStorageLimit: () => 0,
		},
		recipient: 'owner@example.com',
		emailSender: {
			sendEmail: () => {
				emailSent = true;
			},
		},
	});

	assert.equal(result.processedCount, 0);
	assert.equal(result.actionRequiredCount, 0);
	assert.equal(result.autoRecyclingCount, 0);
	assert.equal(emailSent, true);
});

test('runAiSorterPipeline groups duplicate threads in digest while processing both in execution', () => {
	const t1 = createMockThread('mock-thread-1', 'Team Sync Reminder 1', 'calendar@work.com', 'Sync reminder 1');
	const t2 = createMockThread('mock-thread-2', 'Team Sync Reminder 2', 'calendar@work.com', 'Sync reminder 2');

	const geminiClassifications = [
		{
			id: 'mock-thread-1',
			category: 'triage/personal',
			timeSensitive: false,
			actionRequired: false,
			summary: 'Initial team sync reminder.',
			highlights: ['Sync at 10am'],
			keyDetail: '10am',
		},
		{
			id: 'mock-thread-2',
			category: 'triage/personal',
			timeSensitive: false,
			actionRequired: false,
			summary: 'Duplicate team sync reminder.',
			highlights: ['Sync reminder follow-up'],
			keyDetail: '10am',
			duplicateOfId: 'mock-thread-1',
		},
	];

	const geminiClient = new GeminiClient({
		apiKey: 'test-key',
		transport: createMockGeminiTransport(geminiClassifications),
	});

	let sentEmail: {
		recipient: string;
		subject: string;
		body: string;
		options?: { htmlBody?: string };
	} | null = null;

	const result = runAiSorterPipeline({
		dryRun: true,
		dailyLimit: 10,
		geminiClient,
		pendingCountProvider: { countPending: () => 0 },
		actionsPageUrlProvider: {
			getActionsPageUrl: () => 'https://script.google.com/macros/s/test-deployment/exec',
		},
		search: (query) => {
			if (query === CASCADE_QUERIES.unreadInbox) {
				return [t1, t2];
			}
			return [];
		},
		storageProvider: {
			getStorageUsed: () => 1 * 1024 * 1024 * 1024,
			getStorageLimit: () => 15 * 1024 * 1024 * 1024,
		},
		recipient: 'owner@example.com',
		emailSender: {
			sendEmail: (recipient, subject, body, options) => {
				sentEmail = { recipient, subject, body, options };
			},
		},
	});

	// Both emails must be processed and executed
	assert.equal(result.processedCount, 2);
	assert.equal(result.executionResult.processedCount, 2);

	// Sent digest verification
	assert.ok(sentEmail !== null);
	const html = sentEmail?.options?.htmlBody ?? '';

	// Category card for personal exists
	assert.ok(html.includes('PERSONAL'));

	// Only 1 primary item displayed in personal category (not 2 separate items)
	// Both threads had subject containing 'Team Sync Reminder'
	// One is primary, the other is in 'Effective duplicates'
	assert.ok(html.includes('Effective duplicates:'));
	assert.ok(html.includes('Team Sync Reminder 2'));
	assert.ok(html.includes('https://mail.google.com/mail/u/0/#all/mock-thread-2'));

	// Check that there is only 1 primary card item in category
	// In html, each primary item has: <div style="font-size:14px;margin-top:2px;">
	const primaryItemMatches = html.match(/<div style="font-size:14px;margin-top:2px;">/g);
	assert.equal(primaryItemMatches?.length, 1);
});

test('runAiSorterPipeline skips new processing and sends a minimal digest when backlog is already at capacity', () => {
	let sentEmail: { recipient: string; subject: string; body: string } | null = null;
	let searchWasCalled = false;
	let geminiWasCalled = false;

	const geminiClient = new GeminiClient({
		apiKey: 'test-key',
		transport: {
			fetch: () => {
				geminiWasCalled = true;
				return createMockGeminiTransport([]).fetch('', {});
			},
		},
	});

	const result = runAiSorterPipeline({
		dryRun: false,
		dailyLimit: 5,
		geminiClient,
		pendingCountProvider: { countPending: () => 5 },
		actionsPageUrlProvider: {
			getActionsPageUrl: () => 'https://script.google.com/macros/s/test-deployment/exec',
		},
		search: () => {
			searchWasCalled = true;
			return [];
		},
		recipient: 'owner@example.com',
		emailSender: {
			sendEmail: (recipient, subject, body) => {
				sentEmail = { recipient, subject, body };
			},
		},
	});

	assert.equal(result.processedCount, 0);
	assert.equal(searchWasCalled, false);
	assert.equal(geminiWasCalled, false);
	assert.ok(sentEmail !== null);
	assert.ok(sentEmail?.subject.includes('5 pending, none new'));
	assert.ok(
		sentEmail?.body.includes(
			'https://script.google.com/macros/s/test-deployment/exec'
		)
	);
});

test('runAiSorterPipeline only requests remaining capacity when some backlog already exists', () => {
	const t1 = createMockThread('thread-1', 'Lunch tomorrow', 'friend@example.com', 'Are we still on for lunch?');
	let requestedLimit = -1;

	const geminiClient = new GeminiClient({
		apiKey: 'test-key',
		transport: createMockGeminiTransport([
			{
				id: 'thread-1',
				category: 'triage/personal',
				timeSensitive: false,
				actionRequired: false,
				summary: 'Lunch tomorrow inquiry.',
				highlights: [],
				keyDetail: '',
			},
		]),
	});

	runAiSorterPipeline({
		dryRun: true,
		dailyLimit: 10,
		geminiClient,
		pendingCountProvider: { countPending: () => 7 },
		actionsPageUrlProvider: { getActionsPageUrl: () => 'https://example.com/exec' },
		search: (query, _start, max) => {
			if (query === CASCADE_QUERIES.unreadInbox) {
				requestedLimit = max;
				return [t1];
			}
			return [];
		},
		storageProvider: { getStorageUsed: () => 0, getStorageLimit: () => 0 },
		recipient: 'owner@example.com',
		emailSender: { sendEmail: () => {} },
	});

	assert.equal(requestedLimit, 3);
});
