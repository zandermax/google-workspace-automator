import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
	getStorageMetrics,
	calculateEstimatedRecycleBytes,
	formatBytes,
	formatMegabytes,
	formatGigabytes,
} from '../src/Gmail/StorageStats';
import {
	composeDigestSubject,
	composeDigestBody,
	composeDigestHtml,
	formatIsoDate,
	formatRelativeAge,
	formatSizeKb,
	SECTION_SEPARATOR,
} from '../src/Gmail/digestComposer';
import { sendDigest } from '../src/Gmail/actions/sendDigest';
import type {
	DailyDigestData,
	TriageExecutionDirective,
	ExtractedEmailSnippet,
	TriageClassification,
} from '../src/types/Gmail/triage';

const TEST_ACTIONS_URL = 'https://script.google.com/macros/s/test-deployment/exec';

const createMockDirective = (
	id: string,
	category: TriageClassification['category'],
	overrides: {
		actionRequired?: boolean;
		timeSensitive?: boolean;
		ageInDays?: number;
		sizeKb?: number;
		recycleLabel?: 'Auto-Recycle/7d';
		attachmentIcons?: string[];
		unsubscribeUrl?: string;
		unsubscribeMailto?: string;
		keyDetail?: string;
		effectiveDuplicates?: { threadId: string; subject: string }[];
	} = {}
): TriageExecutionDirective => {
	const email: ExtractedEmailSnippet = {
		id,
		sender: `Sender ${id} <${id}@example.com>`,
		senderDomain: 'example.com',
		subject: `Subject of ${id}`,
		snippet: `Snippet body text for ${id}`,
		hasAttachment: (overrides.attachmentIcons?.length ?? 0) > 0,
		attachmentTypes: ['doc'],
		attachmentIcons: overrides.attachmentIcons ?? [],
		ageInDays: overrides.ageInDays ?? 2,
		sizeKb: overrides.sizeKb ?? 50,
		date: new Date('2026-09-08T10:00:00Z'),
		unsubscribeUrl: overrides.unsubscribeUrl,
		unsubscribeMailto: overrides.unsubscribeMailto,
	};

	const classification: TriageClassification = {
		id,
		category,
		timeSensitive: overrides.timeSensitive ?? false,
		actionRequired: overrides.actionRequired ?? false,
		summary: `Summary of email ${id}`,
		highlights: [`Highlight 1 for ${id}`, `Highlight 2 for ${id}`],
		keyDetail: overrides.keyDetail ?? '',
	};

	return {
		threadId: id,
		classification,
		email,
		actionType: overrides.recycleLabel
			? 'apply-label-and-recycle-7d'
			: 'apply-label-only',
		triageLabel: category,
		recycleLabel: overrides.recycleLabel,
		reason: 'test reason',
		effectiveDuplicates: overrides.effectiveDuplicates,
	};
};

test('StorageStats correctly calculates recycle size and formats units', () => {
	const directives: TriageExecutionDirective[] = [
		createMockDirective('1', 'triage/newsletters', {
			sizeKb: 1024,
			recycleLabel: 'Auto-Recycle/7d',
		}),
		createMockDirective('2', 'triage/personal', { sizeKb: 2048 }), // No recycle
		createMockDirective('3', 'triage/junk', {
			sizeKb: 3072,
			recycleLabel: 'Auto-Recycle/7d',
		}),
	];

	const recycleBytes = calculateEstimatedRecycleBytes(directives);
	assert.equal(recycleBytes, (1024 + 3072) * 1024);

	assert.equal(formatBytes(500), '500 B');
	assert.equal(formatBytes(15 * 1024), '15 KB');
	assert.equal(formatBytes(2.5 * 1024 * 1024), '2.5 MB');
	assert.equal(formatBytes(15 * 1024 * 1024 * 1024), '15 GB');

	assert.equal(formatMegabytes(50 * 1024 * 1024), '50 MB');
	assert.equal(formatGigabytes(10 * 1024 * 1024 * 1024), '10 GB');

	const metrics = getStorageMetrics(directives, {
		storageProvider: {
			getStorageUsed: () => 5 * 1024 * 1024 * 1024,
			getStorageLimit: () => 15 * 1024 * 1024 * 1024,
		},
	});

	assert.equal(metrics.gmailUsedBytes, 5 * 1024 * 1024 * 1024);
	assert.equal(metrics.gmailTotalBytes, 15 * 1024 * 1024 * 1024);
	assert.equal(metrics.driveFreeBytes, 10 * 1024 * 1024 * 1024);
	assert.equal(metrics.estimatedRecycleBytes, 4 * 1024 * 1024);
});

test('digestComposer formatting helpers format dates, ages, and sizes', () => {
	const testDate = new Date('2026-09-10T15:30:00Z');
	assert.equal(formatIsoDate(testDate), '2026-09-10');

	assert.equal(formatRelativeAge(0), 'today');
	assert.equal(formatRelativeAge(1), '1 day ago');
	assert.equal(formatRelativeAge(4), '4 days ago');
	assert.equal(formatRelativeAge(10), '1 week ago');
	assert.equal(formatRelativeAge(21), '3 weeks ago');
	assert.equal(formatRelativeAge(45), '1 month ago');
	assert.equal(formatRelativeAge(90), '3 months ago');

	assert.equal(formatSizeKb(350), '350 KB');
	assert.equal(formatSizeKb(2400), '2.3 MB');
});

test('composeDigestSubject prefixes [DRY RUN] only when active', () => {
	const date = new Date('2026-09-10T00:00:00Z');
	assert.equal(
		composeDigestSubject(date, false),
		'📬 Daily Email Digest — 2026-09-10'
	);
	assert.equal(
		composeDigestSubject(date, true),
		'[DRY RUN] 📬 Daily Email Digest — 2026-09-10'
	);
});

test('composeDigestBody formats complete digest with all sections, attachments, and unsubscribe', () => {
	const date = new Date('2026-09-10T00:00:00Z');
	const d1 = createMockDirective('item-1', 'triage/finance', {
		actionRequired: true,
		sizeKb: 500,
		ageInDays: 1,
		keyDetail: 'Due by 2026-09-15: $120.00',
		attachmentIcons: ['📄'],
		unsubscribeUrl: 'https://example.com/unsub',
	});
	const d2 = createMockDirective('item-2', 'triage/newsletters', {
		sizeKb: 1200,
		ageInDays: 3,
		recycleLabel: 'Auto-Recycle/7d',
		attachmentIcons: ['📷', '📎'],
		unsubscribeMailto: 'mailto:optout@news.org',
	});
	const d3 = createMockDirective('item-3', 'triage/personal', {
		actionRequired: false,
		sizeKb: 30,
		ageInDays: 0,
	});

	const data: DailyDigestData = {
		date,
		processedCount: 3,
		dailyLimit: 50,
		actionRequiredCount: 1,
		autoRecyclingCount: 1,
		isHighVolumeOverflow: false,
		isDryRun: false,
		actionsPageUrl: TEST_ACTIONS_URL,
		storage: {
			gmailUsedBytes: 4 * 1024 * 1024 * 1024,
			gmailTotalBytes: 15 * 1024 * 1024 * 1024,
			driveFreeBytes: 11 * 1024 * 1024 * 1024,
			estimatedRecycleBytes: 1200 * 1024,
		},
		entries: [d1, d2, d3],
	};

	const body = composeDigestBody(data);

	// Header checks
	assert.ok(body.includes('📬 Daily Email Digest — 2026-09-10'));
	assert.ok(
		body.includes('Processed: 3 / 50 | Action needed: 1 | Auto-recycling: 1')
	);
	assert.ok(body.includes('🗄️ Storage'));
	assert.ok(body.includes('- Gmail/Drive used: 4 GB / 15 GB'));
	assert.ok(body.includes('- Free space: 11 GB'));

	// Action required section
	assert.ok(body.includes('⚡ ACTION REQUIRED'));
	assert.ok(body.includes('1. Sender item-1 <item-1@example.com> · 1 day ago · 500 KB'));
	assert.ok(body.includes('Subject of item-1'));
	assert.ok(body.includes('📄'));
	assert.ok(body.includes('→ Summary of email item-1'));
	assert.ok(body.includes('⏰ Due by 2026-09-15: $120.00'));
	assert.ok(body.includes('🔗 Unsubscribe: https://example.com/unsub'));

	// Categorized sections
	assert.ok(
		body.includes(
			'💳 FINANCE  (1)  → https://mail.google.com/mail/u/0/#label/triage%2Ffinance'
		)
	);
	assert.ok(
		body.includes(
			'👤 PERSONAL  (1)  → https://mail.google.com/mail/u/0/#label/triage%2Fpersonal'
		)
	);
	assert.ok(
		body.includes(
			'📰 NEWSLETTERS  (1)  → https://mail.google.com/mail/u/0/#label/triage%2Fnewsletters'
		)
	);
	assert.ok(body.includes('📷 📎'));
	assert.ok(body.includes('✉️ Unsubscribe: mailto:optout@news.org'));

	// Recycling in 7 days section
	assert.ok(body.includes('🕰️ RECYCLING IN 7 DAYS  (1 · 1.2 MB total)'));
	assert.ok(body.includes('triage/newsletters'));
	assert.ok(
		body.includes(
			'[Rescue any thread before deletion by removing the Auto-Recycle/7d label in Gmail]'
		)
	);
	// Numbering restarts per section (recycling section reuses newsletters' item-2)
	assert.ok(
		body.includes(
			'1. Sender item-2 <item-2@example.com> · 3 days ago · triage/newsletters · 1.2 MB'
		)
	);
});

test('composeDigestHtml renders bold, thread-linked subjects, colored category cards, and hidden unsubscribe URLs', () => {
	const date = new Date('2026-09-10T00:00:00Z');
	const d1 = createMockDirective('item-1', 'triage/finance', {
		actionRequired: true,
		sizeKb: 500,
		ageInDays: 1,
		keyDetail: 'Due by 2026-09-15: $120.00',
		attachmentIcons: ['📄'],
		unsubscribeUrl: 'https://example.com/unsub',
	});
	const d2 = createMockDirective('item-2', 'triage/newsletters', {
		sizeKb: 1200,
		ageInDays: 3,
		recycleLabel: 'Auto-Recycle/7d',
		unsubscribeMailto: 'mailto:optout@news.org',
	});

	const data: DailyDigestData = {
		date,
		processedCount: 2,
		dailyLimit: 50,
		actionRequiredCount: 1,
		autoRecyclingCount: 1,
		isHighVolumeOverflow: false,
		isDryRun: false,
		actionsPageUrl: TEST_ACTIONS_URL,
		storage: {
			gmailUsedBytes: 4 * 1024 * 1024 * 1024,
			gmailTotalBytes: 15 * 1024 * 1024 * 1024,
			estimatedRecycleBytes: 1200 * 1024,
		},
		entries: [d1, d2],
	};

	const html = composeDigestHtml(data);

	// Bold subject linked to the real Gmail thread
	assert.ok(
		html.includes(
			'<a href="https://mail.google.com/mail/u/0/#all/item-1" style="color:#111827;text-decoration:none;"><strong>Subject of item-1</strong></a>'
		)
	);

	// Numbering restarts per section/card
	assert.ok(html.includes('1. Sender item-1'));
	assert.ok(html.includes('1. Sender item-2'));

	// Category card uses its accent color
	assert.ok(html.includes('border-left:4px solid #059669'));

	// Unsubscribe links hide the raw URL and keep distinct icons for link vs mailto
	assert.ok(
		html.includes(
			'<a href="https://example.com/unsub" style="color:#6b7280;font-size:12px;text-decoration:none;">🔗 Unsubscribe</a>'
		)
	);
	assert.ok(
		html.includes(
			'<a href="mailto:optout@news.org" style="color:#6b7280;font-size:12px;text-decoration:none;">✉️ Unsubscribe</a>'
		)
	);
	assert.ok(!html.includes('⛓️'));
});

test('composeDigestBody displays high volume overflow banner when triggered', () => {
	const data: DailyDigestData = {
		date: new Date('2026-09-10'),
		processedCount: 50,
		dailyLimit: 50,
		actionRequiredCount: 0,
		autoRecyclingCount: 0,
		isHighVolumeOverflow: true,
		isDryRun: true,
		actionsPageUrl: TEST_ACTIONS_URL,
		storage: {
			gmailUsedBytes: 0,
			gmailTotalBytes: 0,
			estimatedRecycleBytes: 0,
		},
		entries: [],
	};

	const body = composeDigestBody(data);
	assert.ok(body.includes('[DRY RUN] 📬 Daily Email Digest — 2026-09-10'));
	assert.ok(
		body.includes(
			'⚠️ High inbox volume: 50+ new unread emails today (limit: 50).'
		)
	);
	assert.ok(body.includes('Only the first 50 were processed.'));
	assert.ok(body.includes('https://mail.google.com/mail/u/0/#inbox'));
	assert.ok(
		body.includes('All caught up! No unprocessed emails found for today.')
	);
});

test('composeDigestBody formats triage/unknown section for unclassifiable mail', () => {
	const dUnknown = createMockDirective('u-1', 'triage/unknown', {
		sizeKb: 20,
		ageInDays: 1,
	});
	const data: DailyDigestData = {
		date: new Date('2026-09-10'),
		processedCount: 1,
		dailyLimit: 50,
		actionRequiredCount: 0,
		autoRecyclingCount: 0,
		isHighVolumeOverflow: false,
		isDryRun: false,
		actionsPageUrl: TEST_ACTIONS_URL,
		storage: {
			gmailUsedBytes: 0,
			gmailTotalBytes: 0,
			estimatedRecycleBytes: 0,
		},
		entries: [dUnknown],
	};

	const body = composeDigestBody(data);
	assert.ok(body.includes('UNKNOWN'));
	assert.ok(body.includes('triage%2Funknown'));
});

test('sendDigest dispatches email with correct recipient, subject, and content', () => {
	const data: DailyDigestData = {
		date: new Date('2026-09-10'),
		processedCount: 0,
		dailyLimit: 50,
		actionRequiredCount: 0,
		autoRecyclingCount: 0,
		isHighVolumeOverflow: false,
		isDryRun: false,
		actionsPageUrl: TEST_ACTIONS_URL,
		storage: {
			gmailUsedBytes: 0,
			gmailTotalBytes: 0,
			estimatedRecycleBytes: 0,
		},
		entries: [],
	};

	let sentRecipient = '';
	let sentSubject = '';
	let sentBody = '';

	const result = sendDigest(data, {
		recipient: 'owner@example.com',
		emailSender: {
			sendEmail: (r, s, b) => {
				sentRecipient = r;
				sentSubject = s;
				sentBody = b;
			},
		},
	});

	assert.equal(sentRecipient, 'owner@example.com');
	assert.equal(sentSubject, '📬 Daily Email Digest — 2026-09-10');
	assert.ok(sentBody.includes('Processed: 0 / 50'));
	assert.equal(result.recipient, 'owner@example.com');
});

test('renders effective duplicates in plain text and html when present', () => {
	const directiveWithDups = createMockDirective('primary-1', 'triage/newsletters', {
		effectiveDuplicates: [
			{ threadId: 'dup-1', subject: 'Duplicate Subject 1 <tag>' },
			{ threadId: 'dup-2', subject: 'Duplicate Subject 2' },
		],
	});
	const directiveWithoutDups = createMockDirective('solo-1', 'triage/newsletters', {
		effectiveDuplicates: [],
	});

	const data: DailyDigestData = {
		date: new Date('2026-09-10'),
		processedCount: 2,
		dailyLimit: 50,
		actionRequiredCount: 0,
		autoRecyclingCount: 0,
		isHighVolumeOverflow: false,
		isDryRun: false,
		actionsPageUrl: TEST_ACTIONS_URL,
		storage: {
			gmailUsedBytes: 0,
			gmailTotalBytes: 0,
			estimatedRecycleBytes: 0,
		},
		entries: [directiveWithDups, directiveWithoutDups],
	};

	const body = composeDigestBody(data);
	assert.ok(
		body.includes(
			'   Effective duplicates:\n   • Duplicate Subject 1 <tag>\n   • Duplicate Subject 2'
		)
	);

	const html = composeDigestHtml(data);
	const expectedHtmlBlock =
		'<div style="margin-top:6px;font-size:12px;color:#4b5563;">\n' +
		'\t<span style="font-weight:600;">Effective duplicates:</span>\n' +
		'\t<ul style="margin:2px 0 0 18px;padding:0;color:#374151;">\n' +
		'\t\t<li style="margin:2px 0;"><a href="https://mail.google.com/mail/u/0/#all/dup-1" style="color:#2563eb;text-decoration:none;">Duplicate Subject 1 &lt;tag&gt;</a></li>\n' +
		'\t\t<li style="margin:2px 0;"><a href="https://mail.google.com/mail/u/0/#all/dup-2" style="color:#2563eb;text-decoration:none;">Duplicate Subject 2</a></li>\n' +
		'\t</ul>\n' +
		'</div>';

	assert.ok(html.includes(expectedHtmlBlock));
});

test('does not render effective duplicates when list is empty or undefined', () => {
	const directiveEmpty = createMockDirective('empty-1', 'triage/personal', {
		effectiveDuplicates: [],
	});
	const directiveUndefined = createMockDirective('undef-1', 'triage/personal');

	const data: DailyDigestData = {
		date: new Date('2026-09-10'),
		processedCount: 2,
		dailyLimit: 50,
		actionRequiredCount: 0,
		autoRecyclingCount: 0,
		isHighVolumeOverflow: false,
		isDryRun: false,
		actionsPageUrl: TEST_ACTIONS_URL,
		storage: {
			gmailUsedBytes: 0,
			gmailTotalBytes: 0,
			estimatedRecycleBytes: 0,
		},
		entries: [directiveEmpty, directiveUndefined],
	};

	const body = composeDigestBody(data);
	assert.ok(!body.includes('Effective duplicates:'));

	const html = composeDigestHtml(data);
	assert.ok(!html.includes('Effective duplicates:'));
});

test('composeDigestBody includes the Actions Page link near the top', () => {
	const data: DailyDigestData = {
		date: new Date('2026-09-11'),
		processedCount: 0,
		dailyLimit: 50,
		actionRequiredCount: 0,
		autoRecyclingCount: 0,
		isHighVolumeOverflow: false,
		isDryRun: false,
		actionsPageUrl: TEST_ACTIONS_URL,
		storage: { gmailUsedBytes: 0, gmailTotalBytes: 0, estimatedRecycleBytes: 0 },
		entries: [],
	};

	const body = composeDigestBody(data);
	assert.ok(body.includes(`Review & take action: ${TEST_ACTIONS_URL}`));
});

test('composeDigestHtml renders the Actions Page link as a larger-font link that opens in a new tab', () => {
	const data: DailyDigestData = {
		date: new Date('2026-09-11'),
		processedCount: 0,
		dailyLimit: 50,
		actionRequiredCount: 0,
		autoRecyclingCount: 0,
		isHighVolumeOverflow: false,
		isDryRun: false,
		actionsPageUrl: TEST_ACTIONS_URL,
		storage: { gmailUsedBytes: 0, gmailTotalBytes: 0, estimatedRecycleBytes: 0 },
		entries: [],
	};

	const html = composeDigestHtml(data);
	assert.ok(html.includes(`href="${TEST_ACTIONS_URL}"`));
	assert.ok(html.includes('target="_blank"'));
	assert.ok(html.includes('font-size:17px'));
});
