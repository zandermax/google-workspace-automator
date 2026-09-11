import {
	type DailyDigestData,
	type TriageCategory,
	type TriageExecutionDirective,
	TRIAGE_CATEGORIES,
} from '@/types/Gmail/triage';
import { formatBytes, formatGigabytes, formatMegabytes } from './StorageStats';
import { escapeHtml } from '../helpers/html';

const HTML_FONT_STACK =
	"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const SECTION_SEPARATOR = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

export interface CategoryMetadata {
	icon: string;
	title: string;
	labelKey: string;
	/** Card accent border/text color used by the HTML digest. */
	accent: string;
	/** Card background tint used by the HTML digest. */
	tint: string;
}

export const CATEGORY_METADATA: Record<TriageCategory, CategoryMetadata> = {
	'triage/personal': {
		icon: '👤',
		title: 'PERSONAL',
		labelKey: 'triage%2Fpersonal',
		accent: '#7c3aed',
		tint: '#f5f3ff',
	},
	'triage/finance': {
		icon: '💳',
		title: 'FINANCE',
		labelKey: 'triage%2Ffinance',
		accent: '#059669',
		tint: '#ecfdf5',
	},
	'triage/govt': {
		icon: '🏛️',
		title: 'GOVT',
		labelKey: 'triage%2Fgovt',
		accent: '#2563eb',
		tint: '#eff6ff',
	},
	'triage/receipts': {
		icon: '🧾',
		title: 'RECEIPTS',
		labelKey: 'triage%2Freceipts',
		accent: '#d97706',
		tint: '#fffbeb',
	},
	'triage/newsletters': {
		icon: '📰',
		title: 'NEWSLETTERS',
		labelKey: 'triage%2Fnewsletters',
		accent: '#0284c7',
		tint: '#f0f9ff',
	},
	'triage/alerts': {
		icon: '🚨',
		title: 'ALERTS',
		labelKey: 'triage%2Falerts',
		accent: '#e11d48',
		tint: '#fff1f2',
	},
	'triage/junk': {
		icon: '🗑️',
		title: 'JUNK',
		labelKey: 'triage%2Fjunk',
		accent: '#6b7280',
		tint: '#f9fafb',
	},
	'triage/unknown': {
		icon: '❓',
		title: 'UNKNOWN',
		labelKey: 'triage%2Funknown',
		accent: '#71717a',
		tint: '#fafafa',
	},
};

/** Accent used for the ACTION REQUIRED and RECYCLING sections, which have no category. */
export const ACTION_REQUIRED_ACCENT = { accent: '#dc2626', tint: '#fef2f2' };
export const RECYCLING_ACCENT = { accent: '#6b7280', tint: '#f9fafb' };

/** Builds a Gmail deep link that opens a thread from any label (including All Mail). */
export const buildThreadLink = (threadId: string): string =>
	`https://mail.google.com/mail/u/0/#all/${threadId}`;

export const formatIsoDate = (date: Date): string => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
};

export const formatRelativeAge = (ageInDays: number): string => {
	if (ageInDays <= 0) {
		return 'today';
	}
	if (ageInDays === 1) {
		return '1 day ago';
	}
	if (ageInDays < 7) {
		return `${ageInDays} days ago`;
	}
	if (ageInDays < 14) {
		return '1 week ago';
	}
	if (ageInDays < 30) {
		return `${Math.floor(ageInDays / 7)} weeks ago`;
	}
	if (ageInDays < 60) {
		return '1 month ago';
	}
	return `${Math.floor(ageInDays / 30)} months ago`;
};

export const formatSizeKb = (sizeKb: number): string => {
	if (sizeKb >= 1024) {
		const mb = sizeKb / 1024;
		return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
	}
	return `${sizeKb} KB`;
};

const renderEmailItem = (
	directive: TriageExecutionDirective,
	options: { includeCategoryInMeta?: boolean; index?: number } = {}
): string[] => {
	const { email, classification } = directive;
	const ageStr = formatRelativeAge(email.ageInDays);
	const sizeStr = formatSizeKb(email.sizeKb);

	const metaLine = options.includeCategoryInMeta
		? `${email.sender} · ${ageStr} · ${classification.category} · ${sizeStr}`
		: `${email.sender} · ${ageStr} · ${sizeStr}`;

	const numberPrefix = options.index !== undefined ? `${options.index}. ` : '';
	const lines = [`${numberPrefix}${metaLine}`, email.subject];

	if (email.attachmentIcons && email.attachmentIcons.length > 0) {
		lines.push(email.attachmentIcons.join(' '));
	}

	lines.push(`→ ${classification.summary}`);

	for (const highlight of classification.highlights) {
		if (highlight.trim()) {
			lines.push(`   • ${highlight.trim()}`);
		}
	}

	if (classification.keyDetail && classification.keyDetail.trim()) {
		lines.push(`   ⏰ ${classification.keyDetail.trim()}`);
	}

	if (
		directive.effectiveDuplicates &&
		directive.effectiveDuplicates.length > 0
	) {
		lines.push('   Effective duplicates:');
		for (const dup of directive.effectiveDuplicates) {
			lines.push(`   • ${dup.subject}`);
		}
	}

	if (email.unsubscribeUrl) {
		lines.push(`   🔗 Unsubscribe: ${email.unsubscribeUrl}`);
	} else if (email.unsubscribeMailto) {
		lines.push(`   ✉️ Unsubscribe: ${email.unsubscribeMailto}`);
	}

	return lines;
};

export const composeDigestSubject = (date: Date, isDryRun = false): string => {
	const dateStr = formatIsoDate(date);
	const base = `📬 Daily Email Digest — ${dateStr}`;
	return isDryRun ? `[DRY RUN] ${base}` : base;
};

export const composeBacklogOnlyDigestSubject = (
	date: Date,
	pendingCount: number,
	isDryRun = false
): string => {
	const dateStr = formatIsoDate(date);
	const base = `📬 Daily Email Digest — ${dateStr} — ${pendingCount} pending, none new`;
	return isDryRun ? `[DRY RUN] ${base}` : base;
};

const pendingCountPhrase = (pendingCount: number): string =>
	`${pendingCount} item${pendingCount === 1 ? '' : 's'} pending your review`;

export const composeBacklogOnlyDigestBody = (
	pendingCount: number,
	actionsPageUrl: string
): string =>
	[
		`No new emails processed — ${pendingCountPhrase(pendingCount)}.`,
		`👉 Review & take action: ${actionsPageUrl}`,
	].join('\n');

export const composeBacklogOnlyDigestHtml = (
	pendingCount: number,
	actionsPageUrl: string
): string => `<div style="font-family:${HTML_FONT_STACK};font-size:14px;line-height:1.5;color:#1f2937;max-width:640px;margin:0 auto;">
	<div style="font-size:16px;margin-bottom:12px;">No new emails processed — ${pendingCountPhrase(pendingCount)}.</div>
	<div><a href="${escapeHtml(actionsPageUrl)}" target="_blank" rel="noopener" style="font-size:17px;font-weight:600;color:#2563eb;text-decoration:none;">👉 Review &amp; Take Action →</a></div>
</div>`;

export const composeDigestBody = (data: DailyDigestData): string => {
	const lines: string[] = [];
	const dateStr = formatIsoDate(data.date);

	// Header banner
	const headerTitle = data.isDryRun
		? `[DRY RUN] 📬 Daily Email Digest — ${dateStr}`
		: `📬 Daily Email Digest — ${dateStr}`;

	lines.push(headerTitle);
	lines.push(`👉 Review & take action: ${data.actionsPageUrl}`);

	const spaceFreedStr = formatMegabytes(data.storage.estimatedRecycleBytes);
	lines.push(
		`Processed: ${data.processedCount} / ${data.dailyLimit} | Action needed: ${data.actionRequiredCount} | Auto-recycling: ${data.autoRecyclingCount} | Space freed: ${spaceFreedStr}`
	);
	lines.push('');

	// Storage Section
	lines.push('🗄️ Storage');
	if (data.storage.gmailTotalBytes > 0) {
		lines.push(
			`- Gmail/Drive used: ${formatBytes(data.storage.gmailUsedBytes)} / ${formatGigabytes(data.storage.gmailTotalBytes)}`
		);
	} else {
		lines.push(`- Storage used: ${formatBytes(data.storage.gmailUsedBytes)}`);
	}

	if (data.storage.driveFreeBytes !== undefined) {
		lines.push(`- Free space: ${formatGigabytes(data.storage.driveFreeBytes)}`);
	}
	lines.push(`- Estimated MB queued for recycle this run: ${spaceFreedStr}`);
	lines.push('');

	// High volume overflow warning banner
	if (data.isHighVolumeOverflow) {
		lines.push(
			`⚠️ High inbox volume: ${data.processedCount}+ new unread emails today (limit: ${data.dailyLimit}).`
		);
		lines.push(
			`   Only the first ${data.dailyLimit} were processed. Consider raising DAILY_LIMIT.`
		);
		lines.push(
			'   Unprocessed new emails: https://mail.google.com/mail/u/0/#inbox'
		);
		lines.push('');
	}

	// 1. ACTION REQUIRED Section
	const actionRequiredItems = data.entries.filter(
		(e) => e.classification.actionRequired
	);
	if (actionRequiredItems.length > 0) {
		lines.push(SECTION_SEPARATOR);
		lines.push('⚡ ACTION REQUIRED');
		lines.push(SECTION_SEPARATOR);
		lines.push('');

		for (let i = 0; i < actionRequiredItems.length; i += 1) {
			lines.push(...renderEmailItem(actionRequiredItems[i], { index: i + 1 }));
			if (i < actionRequiredItems.length - 1) {
				lines.push('');
			}
		}
		lines.push('');
	}

	// 2. CATEGORIZED SECTIONS in priority order
	for (const category of TRIAGE_CATEGORIES) {
		const items = data.entries.filter(
			(e) => e.classification.category === category
		);
		if (items.length === 0) {
			continue;
		}

		const meta = CATEGORY_METADATA[category];
		const labelUrl = `https://mail.google.com/mail/u/0/#label/${meta.labelKey}`;

		lines.push(SECTION_SEPARATOR);
		lines.push(`${meta.icon} ${meta.title}  (${items.length})  → ${labelUrl}`);
		lines.push(SECTION_SEPARATOR);
		lines.push('');

		for (let i = 0; i < items.length; i += 1) {
			lines.push(...renderEmailItem(items[i], { index: i + 1 }));
			if (i < items.length - 1) {
				lines.push('');
			}
		}
		lines.push('');
	}

	// 3. RECYCLING IN 7 DAYS Section
	const recyclingItems = data.entries.filter(
		(e) => e.recycleLabel !== undefined
	);
	if (recyclingItems.length > 0) {
		const totalRecycleBytes = recyclingItems.reduce(
			(acc, e) => acc + (e.email.sizeKb || 0) * 1024,
			0
		);
		const recycleSizeStr = formatMegabytes(totalRecycleBytes);

		lines.push(SECTION_SEPARATOR);
		lines.push(
			`🕰️ RECYCLING IN 7 DAYS  (${recyclingItems.length} · ${recycleSizeStr} total)`
		);
		lines.push(SECTION_SEPARATOR);
		lines.push('');

		for (let i = 0; i < recyclingItems.length; i += 1) {
			lines.push(
				...renderEmailItem(recyclingItems[i], {
					includeCategoryInMeta: true,
					index: i + 1,
				})
			);
			if (i < recyclingItems.length - 1) {
				lines.push('');
			}
		}
		lines.push('');
		lines.push(
			'[Rescue any thread before deletion by removing the Auto-Recycle/7d label in Gmail]'
		);
	}

	if (data.entries.length === 0) {
		lines.push(SECTION_SEPARATOR);
		lines.push('🎉 All caught up! No unprocessed emails found for today.');
		lines.push(SECTION_SEPARATOR);
	}

	return lines.join('\n');
};

const renderEmailItemHtml = (
	directive: TriageExecutionDirective,
	options: { includeCategoryInMeta?: boolean; index?: number } = {}
): string => {
	const { email, classification, threadId } = directive;
	const ageStr = formatRelativeAge(email.ageInDays);
	const sizeStr = formatSizeKb(email.sizeKb);

	const metaText = options.includeCategoryInMeta
		? `${email.sender} · ${ageStr} · ${classification.category} · ${sizeStr}`
		: `${email.sender} · ${ageStr} · ${sizeStr}`;
	const numberPrefix = options.index !== undefined ? `${options.index}. ` : '';

	const attachmentsHtml =
		email.attachmentIcons && email.attachmentIcons.length > 0
			? `<div style="margin-top:2px;">${email.attachmentIcons.join(' ')}</div>`
			: '';

	const highlightsHtml = classification.highlights
		.filter((highlight) => highlight.trim())
		.map(
			(highlight) => `<li style="margin:2px 0;">${escapeHtml(highlight.trim())}</li>`
		)
		.join('');

	const keyDetailHtml =
		classification.keyDetail && classification.keyDetail.trim()
			? `<div style="margin-top:4px;color:#374151;">⏰ ${escapeHtml(classification.keyDetail.trim())}</div>`
			: '';

	let duplicatesHtml = '';
	if (
		directive.effectiveDuplicates &&
		directive.effectiveDuplicates.length > 0
	) {
		const dupItemsHtml = directive.effectiveDuplicates
			.map(
				(dup) =>
					`<li style="margin:2px 0;"><a href="${buildThreadLink(dup.threadId)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(dup.subject)}</a></li>`
			)
			.join('\n\t\t');
		duplicatesHtml = `<div style="margin-top:6px;font-size:12px;color:#4b5563;">
	<span style="font-weight:600;">Effective duplicates:</span>
	<ul style="margin:2px 0 0 18px;padding:0;color:#374151;">
		${dupItemsHtml}
	</ul>
</div>`;
	}

	let unsubscribeHtml = '';
	if (email.unsubscribeUrl) {
		unsubscribeHtml = `<div style="margin-top:6px;"><a href="${escapeHtml(email.unsubscribeUrl)}" style="color:#6b7280;font-size:12px;text-decoration:none;">🔗 Unsubscribe</a></div>`;
	} else if (email.unsubscribeMailto) {
		unsubscribeHtml = `<div style="margin-top:6px;"><a href="${escapeHtml(email.unsubscribeMailto)}" style="color:#6b7280;font-size:12px;text-decoration:none;">✉️ Unsubscribe</a></div>`;
	}

	const itemStyle =
		options.index === 1
			? 'padding:0 0 10px 0;'
			: 'padding:10px 0;border-top:1px solid rgba(0,0,0,0.06);';

	return `<div style="${itemStyle}">
	<div style="font-size:11px;color:#6b7280;">${numberPrefix}${escapeHtml(metaText)}</div>
	<div style="font-size:14px;margin-top:2px;"><a href="${buildThreadLink(threadId)}" style="color:#111827;text-decoration:none;"><strong>${escapeHtml(email.subject)}</strong></a></div>
	${attachmentsHtml}
	<div style="margin-top:4px;color:#1f2937;">→ ${escapeHtml(classification.summary)}</div>
	${highlightsHtml ? `<ul style="margin:4px 0 0 18px;padding:0;color:#374151;">${highlightsHtml}</ul>` : ''}
	${keyDetailHtml}
	${duplicatesHtml}
	${unsubscribeHtml}
</div>`;
};

const renderCardHtml = (
	title: string,
	icon: string,
	accent: string,
	tint: string,
	itemsHtml: string,
	headerLinkUrl?: string
): string => {
	const headerLinkHtml = headerLinkUrl
		? ` &nbsp;·&nbsp; <a href="${headerLinkUrl}" style="color:${accent};font-weight:400;text-transform:none;letter-spacing:normal;">view label</a>`
		: '';

	return `<div style="background:${tint};border-left:4px solid ${accent};border-radius:6px;padding:12px 16px;margin-bottom:16px;">
	<div style="font-weight:700;color:${accent};text-transform:uppercase;font-size:12px;letter-spacing:0.05em;">${icon} ${escapeHtml(title)}${headerLinkHtml}</div>
	${itemsHtml}
</div>`;
};

/**
 * Builds the HTML digest body: numbered, color-accented cards per section,
 * with bold subjects linking to the real Gmail thread.
 */
export const composeDigestHtml = (data: DailyDigestData): string => {
	const dateStr = formatIsoDate(data.date);
	const headerTitle = data.isDryRun
		? `[DRY RUN] 📬 Daily Email Digest — ${dateStr}`
		: `📬 Daily Email Digest — ${dateStr}`;
	const spaceFreedStr = formatMegabytes(data.storage.estimatedRecycleBytes);

	const storageLines: string[] = [];
	if (data.storage.gmailTotalBytes > 0) {
		storageLines.push(
			`Gmail/Drive used: ${formatBytes(data.storage.gmailUsedBytes)} / ${formatGigabytes(data.storage.gmailTotalBytes)}`
		);
	} else {
		storageLines.push(
			`Storage used: ${formatBytes(data.storage.gmailUsedBytes)}`
		);
	}
	if (data.storage.driveFreeBytes !== undefined) {
		storageLines.push(
			`Free space: ${formatGigabytes(data.storage.driveFreeBytes)}`
		);
	}
	storageLines.push(
		`Estimated MB queued for recycle this run: ${spaceFreedStr}`
	);

	const storageHtml = `<div style="font-size:13px;color:#374151;margin-bottom:16px;">
	<div style="font-weight:700;margin-bottom:4px;">🗄️ Storage</div>
	${storageLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
</div>`;

	const overflowHtml = data.isHighVolumeOverflow
		? `<div style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:6px;padding:10px 14px;margin-bottom:16px;font-size:13px;color:#92400e;">
	<div>⚠️ High inbox volume: ${data.processedCount}+ new unread emails today (limit: ${data.dailyLimit}).</div>
	<div>Only the first ${data.dailyLimit} were processed. Consider raising DAILY_LIMIT.</div>
	<div><a href="https://mail.google.com/mail/u/0/#inbox" style="color:#92400e;">View unprocessed emails</a></div>
</div>`
		: '';

	const sections: string[] = [];

	const actionRequiredItems = data.entries.filter(
		(e) => e.classification.actionRequired
	);
	if (actionRequiredItems.length > 0) {
		const itemsHtml = actionRequiredItems
			.map((item, i) => renderEmailItemHtml(item, { index: i + 1 }))
			.join('');
		sections.push(
			renderCardHtml(
				'Action Required',
				'⚡',
				ACTION_REQUIRED_ACCENT.accent,
				ACTION_REQUIRED_ACCENT.tint,
				itemsHtml
			)
		);
	}

	for (const category of TRIAGE_CATEGORIES) {
		const items = data.entries.filter(
			(e) => e.classification.category === category
		);
		if (items.length === 0) {
			continue;
		}

		const meta = CATEGORY_METADATA[category];
		const labelUrl = `https://mail.google.com/mail/u/0/#label/${meta.labelKey}`;
		const itemsHtml = items
			.map((item, i) => renderEmailItemHtml(item, { index: i + 1 }))
			.join('');
		sections.push(
			renderCardHtml(
				`${meta.title} (${items.length})`,
				meta.icon,
				meta.accent,
				meta.tint,
				itemsHtml,
				labelUrl
			)
		);
	}

	const recyclingItems = data.entries.filter(
		(e) => e.recycleLabel !== undefined
	);
	let recyclingFooterHtml = '';
	if (recyclingItems.length > 0) {
		const totalRecycleBytes = recyclingItems.reduce(
			(acc, e) => acc + (e.email.sizeKb || 0) * 1024,
			0
		);
		const recycleSizeStr = formatMegabytes(totalRecycleBytes);
		const itemsHtml = recyclingItems
			.map((item, i) =>
				renderEmailItemHtml(item, { includeCategoryInMeta: true, index: i + 1 })
			)
			.join('');
		sections.push(
			renderCardHtml(
				`Recycling in 7 Days (${recyclingItems.length} · ${recycleSizeStr} total)`,
				'🕰️',
				RECYCLING_ACCENT.accent,
				RECYCLING_ACCENT.tint,
				itemsHtml
			)
		);
		recyclingFooterHtml = `<div style="font-size:12px;color:#6b7280;margin:-8px 0 16px 0;">Rescue any thread before deletion by removing the Auto-Recycle/7d label in Gmail.</div>`;
	}

	const emptyStateHtml =
		data.entries.length === 0
			? '<div style="text-align:center;padding:24px 0;color:#374151;">🎉 All caught up! No unprocessed emails found for today.</div>'
			: '';

	return `<div style="font-family:${HTML_FONT_STACK};font-size:14px;line-height:1.5;color:#1f2937;max-width:640px;margin:0 auto;">
	<div style="font-size:20px;font-weight:700;margin-bottom:4px;">${escapeHtml(headerTitle)}</div>
	<div style="margin-bottom:12px;"><a href="${escapeHtml(data.actionsPageUrl)}" target="_blank" rel="noopener" style="font-size:17px;font-weight:600;color:#2563eb;text-decoration:none;">👉 Review &amp; Take Action →</a></div>
	<div style="font-size:13px;color:#6b7280;margin-bottom:16px;">Processed: ${data.processedCount} / ${data.dailyLimit} &nbsp;·&nbsp; Action needed: ${data.actionRequiredCount} &nbsp;·&nbsp; Auto-recycling: ${data.autoRecyclingCount} &nbsp;·&nbsp; Space freed: ${spaceFreedStr}</div>
	${storageHtml}
	${overflowHtml}
	${sections.join('')}
	${recyclingFooterHtml}
	${emptyStateHtml}
</div>`;
};
