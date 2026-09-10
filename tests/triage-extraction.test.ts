import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
	sanitizeSnippet,
	parseDomainFromEmail,
	classifyAttachment,
	parseUnsubscribeHeaders,
	calculateAgeInDays,
	extractEmailSnippetFromMessage,
	extractEmailSnippetFromThread,
	toGeminiClassificationInput,
	type MessageLike,
	type ThreadLike,
} from '../src/Gmail/extraction';
import { ATTACHMENT_ICONS, TRIAGE_CATEGORIES } from '../src/types/Gmail/triage';

test('triage categories contain all 8 planned categories including unknown', () => {
	assert.equal(TRIAGE_CATEGORIES.length, 8);
	assert.ok(TRIAGE_CATEGORIES.includes('triage/personal'));
	assert.ok(TRIAGE_CATEGORIES.includes('triage/finance'));
	assert.ok(TRIAGE_CATEGORIES.includes('triage/govt'));
	assert.ok(TRIAGE_CATEGORIES.includes('triage/receipts'));
	assert.ok(TRIAGE_CATEGORIES.includes('triage/newsletters'));
	assert.ok(TRIAGE_CATEGORIES.includes('triage/alerts'));
	assert.ok(TRIAGE_CATEGORIES.includes('triage/junk'));
	assert.ok(TRIAGE_CATEGORIES.includes('triage/unknown'));
});

test('sanitizeSnippet strips HTML tags, scripts, styles, and decodes entities', () => {
	const raw = `
		<style>.main { color: red; }</style>
		<div>
			<h1>Order Update &amp; Receipt</h1>
			<p>Hello &lt;Customer&gt;, thank you for your order&#39;s confirmation! &quot;Special Deal&quot;&nbsp;included.</p>
			<script>console.log("tracking");</script>
		</div>
	`;
	const sanitized = sanitizeSnippet(raw);

	assert.equal(
		sanitized,
		'Order Update & Receipt Hello <Customer>, thank you for your order\'s confirmation! "Special Deal" included.'
	);
});

test('sanitizeSnippet cleanly truncates to 300 characters', () => {
	const longText = 'Word '.repeat(100); // 500 chars
	const sanitized = sanitizeSnippet(longText, 300);

	assert.ok(sanitized.length <= 300);
	assert.ok(sanitized.endsWith('Word'));
});

test('sanitizeSnippet returns empty string for empty or missing input', () => {
	assert.equal(sanitizeSnippet(''), '');
	assert.equal(sanitizeSnippet(undefined), '');
});

test('parseDomainFromEmail extracts domain correctly', () => {
	assert.equal(
		parseDomainFromEmail('John Doe <john.doe@example.com>'),
		'example.com'
	);
	assert.equal(parseDomainFromEmail('alerts@monitoring.org'), 'monitoring.org');
	assert.equal(parseDomainFromEmail('Invalid Address'), '');
	assert.equal(parseDomainFromEmail(''), '');
});

test('classifyAttachment accurately maps MIME types and filenames', () => {
	assert.equal(classifyAttachment('image/png', 'photo.png'), 'photo');
	assert.equal(classifyAttachment('application/pdf', 'invoice.pdf'), 'doc');
	assert.equal(classifyAttachment('text/calendar', 'invite.ics'), 'calendar');
	assert.equal(classifyAttachment('audio/mpeg', 'podcast.mp3'), 'audio');
	assert.equal(classifyAttachment('video/mp4', 'recording.mp4'), 'video');
	assert.equal(
		classifyAttachment('application/octet-stream', 'archive.bin'),
		'generic'
	);
});

test('parseUnsubscribeHeaders parses URL and mailto links from RFC 2369 header', () => {
	const header =
		'<https://newsletter.example.com/unsub?id=42>, <mailto:unsub@example.com?subject=cancel>';
	const parsed = parseUnsubscribeHeaders(header);

	assert.equal(parsed.url, 'https://newsletter.example.com/unsub?id=42');
	assert.equal(parsed.mailto, 'mailto:unsub@example.com?subject=cancel');
});

test('parseUnsubscribeHeaders handles standalone URL or mailto', () => {
	assert.deepEqual(parseUnsubscribeHeaders('<https://service.com/opt-out>'), {
		url: 'https://service.com/opt-out',
		mailto: undefined,
	});
	assert.deepEqual(parseUnsubscribeHeaders('<mailto:leave@service.com>'), {
		url: undefined,
		mailto: 'mailto:leave@service.com',
	});
	assert.deepEqual(parseUnsubscribeHeaders(undefined), {});
});

test('calculateAgeInDays measures time elapsed correctly', () => {
	const now = new Date('2026-09-08T12:00:00Z');
	const today = new Date('2026-09-08T08:00:00Z');
	const threeDaysAgo = new Date('2026-09-05T12:00:00Z');

	assert.equal(calculateAgeInDays(today, now), 0);
	assert.equal(calculateAgeInDays(threeDaysAgo, now), 3);
});

test('extractEmailSnippetFromMessage extracts full metadata from message', () => {
	const now = new Date('2026-09-08T12:00:00Z');
	const messageDate = new Date('2026-09-06T12:00:00Z');

	const mockMessage: MessageLike = {
		getId: () => 'msg-123',
		getFrom: () => 'Bank Notification <alerts@mybank.com>',
		getSubject: () => 'Your September Bank Statement',
		getPlainBody: () => 'Your statement is ready to view. Balance: $1,250.00.',
		getDate: () => messageDate,
		getAttachments: () => [
			{
				getContentType: () => 'application/pdf',
				getName: () => 'statement-september.pdf',
				getSize: () => 10240,
			},
		],
		getHeader: (name: string) =>
			name === 'List-Unsubscribe'
				? '<https://mybank.com/notifications/prefs>'
				: '',
		getThread: () => ({ getId: () => 'thread-789' }),
	};

	const snippet = extractEmailSnippetFromMessage(mockMessage, now);

	assert.equal(snippet.id, 'thread-789');
	assert.equal(snippet.sender, 'Bank Notification <alerts@mybank.com>');
	assert.equal(snippet.senderDomain, 'mybank.com');
	assert.equal(snippet.subject, 'Your September Bank Statement');
	assert.equal(
		snippet.snippet,
		'Your statement is ready to view. Balance: $1,250.00.'
	);
	assert.equal(snippet.hasAttachment, true);
	assert.deepEqual(snippet.attachmentTypes, ['doc']);
	assert.deepEqual(snippet.attachmentIcons, [ATTACHMENT_ICONS.doc]);
	assert.equal(snippet.ageInDays, 2);
	assert.ok(snippet.sizeKb >= 10);
	assert.equal(
		snippet.unsubscribeUrl,
		'https://mybank.com/notifications/prefs'
	);
});

test('extractEmailSnippetFromThread falls back cleanly when thread has no messages', () => {
	const emptyThread: ThreadLike = {
		getId: () => 'empty-thread',
		getMessages: () => [],
	};

	const snippet = extractEmailSnippetFromThread(emptyThread);
	assert.equal(snippet.id, 'empty-thread');
	assert.equal(snippet.sender, '(unknown sender)');
	assert.equal(snippet.subject, '(no subject)');
	assert.equal(snippet.snippet, '');
	assert.equal(snippet.hasAttachment, false);
});

test('toGeminiClassificationInput extracts only the 7 LLM schema fields', () => {
	const snippet = {
		id: 't-1',
		sender: 'alice@example.com',
		senderDomain: 'example.com',
		subject: 'Catch up coffee',
		snippet: 'Hey, are you free this Friday for coffee?',
		hasAttachment: false,
		attachmentTypes: [],
		attachmentIcons: [],
		ageInDays: 1,
		sizeKb: 2,
		date: new Date(),
	};

	const input = toGeminiClassificationInput(snippet);
	assert.deepEqual(input, {
		id: 't-1',
		sender: 'alice@example.com',
		subject: 'Catch up coffee',
		snippet: 'Hey, are you free this Friday for coffee?',
		hasAttachment: false,
		ageInDays: 1,
		sizeKb: 2,
	});
});
