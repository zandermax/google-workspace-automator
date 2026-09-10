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
