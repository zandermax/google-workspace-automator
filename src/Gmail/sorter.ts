export type SortCategory =
	'Personal' | 'Finance' | 'Newsletters' | 'Alerts' | 'Follow-up' | 'Review';

export type SortAction = 'label-only' | 'review' | 'star';

export type ThreadClassificationInput = {
	subject?: string;
	sender?: string;
	body?: string;
};

export type ThreadClassification = {
	category: SortCategory;
	action: SortAction;
	reason: string;
};

export type InboxSortDryRunEntry = ThreadClassification & {
	threadId: string;
	subject: string;
	sender: string;
};

export type InboxSortDryRunResult = {
	processed: number;
	results: InboxSortDryRunEntry[];
};

export type InboxSortDryRunSummary = {
	processed: number;
	dryRun: true;
	totals: Record<SortCategory, number>;
	reviewQueue: InboxSortDryRunEntry[];
};

const personalKeywords = [
	'dinner',
	'friday',
	'weekend',
	'thanks',
	'thank you',
	'call me',
	'love',
	'family',
	'catch up',
	'can we',
	'are we still',
	"let's do",
	'see you',
];

const financeKeywords = [
	'bank',
	'payment',
	'credit card',
	'statement',
	'invoice',
	'billing',
	'paypal',
	'visa',
	'amex',
	'ach',
	'wire',
	'receipt',
	'charge',
	'refund',
];

const newsletterKeywords = [
	'newsletter',
	'weekly digest',
	'product updates',
	'this week in',
	'issue #',
	'morning brief',
	'substack',
	'latest posts',
	'updates from',
	'promo',
	'newsletter issue',
];

const alertsKeywords = [
	'alert',
	'failed',
	'failure',
	'error',
	'monitoring',
	'incident',
	'status update',
	'deployment',
	'uptime',
	'server',
];

const followUpKeywords = [
	'follow up',
	'please review',
	'can you review',
	'action required',
	'pending approval',
	'needs your attention',
	'confirm',
	'waiting on you',
];

const normalizeText = (value?: string) => (value ?? '').toLowerCase();

const hasAnyKeyword = (value: string, keywords: readonly string[]) =>
	keywords.some((keyword) => value.includes(keyword));

export const classifyThreadForInboxSort = (
	input: ThreadClassificationInput
): ThreadClassification => {
	const subject = normalizeText(input.subject);
	const sender = normalizeText(input.sender);
	const body = normalizeText(input.body);
	const haystack = `${subject} ${sender} ${body}`;

	if (hasAnyKeyword(haystack, financeKeywords)) {
		return {
			category: 'Finance',
			action: 'label-only',
			reason: 'Financial or account-related mail is treated conservatively.',
		};
	}

	if (hasAnyKeyword(haystack, newsletterKeywords)) {
		return {
			category: 'Newsletters',
			action: 'label-only',
			reason:
				'Subscription or digest content should be separated from primary inbox traffic.',
		};
	}

	if (hasAnyKeyword(haystack, alertsKeywords)) {
		return {
			category: 'Alerts',
			action: 'label-only',
			reason:
				'System or service notifications should remain visible but low-risk.',
		};
	}

	if (hasAnyKeyword(haystack, followUpKeywords)) {
		return {
			category: 'Follow-up',
			action: 'star',
			reason:
				'The message asks for a decision or response that needs attention.',
		};
	}

	if (hasAnyKeyword(haystack, personalKeywords)) {
		return {
			category: 'Personal',
			action: 'label-only',
			reason:
				'This appears to be personal communication or a direct human message.',
		};
	}

	return {
		category: 'Review',
		action: 'review',
		reason:
			'Ambiguous mail should stay in review instead of being auto-classified.',
	};
};

export const dryRunSortInboxThread = (input: ThreadClassificationInput) =>
	classifyThreadForInboxSort(input);

export const summarizeInboxSortDryRun = (
	results: InboxSortDryRunEntry[]
): InboxSortDryRunSummary => {
	const totals: Record<SortCategory, number> = {
		Personal: 0,
		Finance: 0,
		Newsletters: 0,
		Alerts: 0,
		'Follow-up': 0,
		Review: 0,
	};

	for (const entry of results) {
		totals[entry.category] += 1;
	}

	return {
		processed: results.length,
		dryRun: true,
		totals,
		reviewQueue: results.filter((entry) => entry.category === 'Review'),
	};
};

export const runInboxSortDryRun = (
	options: {
		maxThreads?: number;
		includeRead?: boolean;
	} = {}
): InboxSortDryRunResult => {
	const maxThreads = options.maxThreads ?? 20;
	const query =
		options.includeRead === true
			? 'in:inbox -label:"🪄✨ Magic ✨🪄"'
			: 'in:inbox is:unread -label:"🪄✨ Magic ✨🪄"';

	const matchingThreads = GmailApp.search(query, 0, maxThreads);
	const results: InboxSortDryRunEntry[] = [];

	for (const thread of matchingThreads) {
		const messages = thread.getMessages();
		const message = messages[0];
		if (!message) {
			continue;
		}

		const subject = message.getSubject() || '(no subject)';
		const sender = message.getFrom() || '(unknown sender)';
		const body = message.getPlainBody() || message.getBody() || '';
		const classification = classifyThreadForInboxSort({
			subject,
			sender,
			body,
		});

		results.push({
			threadId: thread.getId(),
			subject,
			sender,
			...classification,
		});
	}

	Logger.log(
		`Dry-run sorter processed ${results.length} threads from inbox; no mutations were applied.`
	);

	return {
		processed: results.length,
		results,
	};
};

export const sendDryRunInboxSortDigest = (
	options: {
		maxThreads?: number;
		includeRead?: boolean;
		recipient?: string;
	} = {}
): InboxSortDryRunSummary => {
	const result = runInboxSortDryRun(options);
	const summary = summarizeInboxSortDryRun(result.results);
	const recipient = options.recipient ?? Session.getActiveUser().getEmail();
	const lines = [
		'📬 Dry-run inbox sort summary',
		`Processed: ${summary.processed}`,
		`Personal: ${summary.totals.Personal}`,
		`Finance: ${summary.totals.Finance}`,
		`Newsletters: ${summary.totals.Newsletters}`,
		`Alerts: ${summary.totals.Alerts}`,
		`Follow-up: ${summary.totals['Follow-up']}`,
		`Review: ${summary.totals.Review}`,
		'',
		'Review queue:',
		...summary.reviewQueue.map(
			(entry) => `- ${entry.subject} (${entry.sender}) -> ${entry.category}`
		),
	];

	if (summary.reviewQueue.length === 0) {
		lines.push('No items require review.');
	}

	GmailApp.sendEmail(
		recipient,
		'📬 Dry-run inbox sort summary',
		lines.join('\n')
	);

	return summary;
};
