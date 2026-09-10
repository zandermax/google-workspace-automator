import {
	type DailyDigestData,
	type TriageCategory,
	type TriageExecutionDirective,
	TRIAGE_CATEGORIES,
} from '@/types/Gmail/triage';
import {
	formatBytes,
	formatGigabytes,
	formatMegabytes,
} from './StorageStats';

export const SECTION_SEPARATOR = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

export interface CategoryMetadata {
	icon: string;
	title: string;
	labelKey: string;
}

export const CATEGORY_METADATA: Record<TriageCategory, CategoryMetadata> = {
	'triage/personal': {
		icon: '👤',
		title: 'PERSONAL',
		labelKey: 'triage%2Fpersonal',
	},
	'triage/finance': {
		icon: '💳',
		title: 'FINANCE',
		labelKey: 'triage%2Ffinance',
	},
	'triage/govt': {
		icon: '🏛️',
		title: 'GOVT',
		labelKey: 'triage%2Fgovt',
	},
	'triage/receipts': {
		icon: '🧾',
		title: 'RECEIPTS',
		labelKey: 'triage%2Freceipts',
	},
	'triage/newsletters': {
		icon: '📰',
		title: 'NEWSLETTERS',
		labelKey: 'triage%2Fnewsletters',
	},
	'triage/alerts': {
		icon: '🚨',
		title: 'ALERTS',
		labelKey: 'triage%2Falerts',
	},
	'triage/junk': {
		icon: '🗑️',
		title: 'JUNK',
		labelKey: 'triage%2Fjunk',
	},
};

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
	options: { includeCategoryInMeta?: boolean } = {}
): string[] => {
	const { email, classification } = directive;
	const ageStr = formatRelativeAge(email.ageInDays);
	const sizeStr = formatSizeKb(email.sizeKb);

	const metaLine = options.includeCategoryInMeta
		? `${email.sender} · ${ageStr} · ${classification.category} · ${sizeStr}`
		: `${email.sender} · ${ageStr} · ${sizeStr}`;

	const lines = [metaLine, email.subject];

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

	if (email.unsubscribeUrl) {
		lines.push(`   ⛓️‍💥 Unsubscribe: ${email.unsubscribeUrl}`);
	} else if (email.unsubscribeMailto) {
		lines.push(`   ⛓️‍💥 Unsubscribe ✉️: ${email.unsubscribeMailto}`);
	}

	return lines;
};

export const composeDigestSubject = (
	date: Date,
	isDryRun = false
): string => {
	const dateStr = formatIsoDate(date);
	const base = `📬 Daily Email Digest — ${dateStr}`;
	return isDryRun ? `[DRY RUN] ${base}` : base;
};

export const composeDigestBody = (data: DailyDigestData): string => {
	const lines: string[] = [];
	const dateStr = formatIsoDate(data.date);

	// Header banner
	const headerTitle = data.isDryRun
		? `[DRY RUN] 📬 Daily Email Digest — ${dateStr}`
		: `📬 Daily Email Digest — ${dateStr}`;

	lines.push(headerTitle);

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
		lines.push(
			`- Storage used: ${formatBytes(data.storage.gmailUsedBytes)}`
		);
	}

	if (data.storage.driveFreeBytes !== undefined) {
		lines.push(`- Free space: ${formatGigabytes(data.storage.driveFreeBytes)}`);
	}
	lines.push(
		`- Estimated MB queued for recycle this run: ${spaceFreedStr}`
	);
	lines.push('');

	// High volume overflow warning banner
	if (data.isHighVolumeOverflow) {
		lines.push(
			`⚠️ High inbox volume: ${data.processedCount}+ new unread emails today (limit: ${data.dailyLimit}).`
		);
		lines.push(
			`   Only the first ${data.dailyLimit} were processed. Consider raising DAILY_LIMIT.`
		);
		lines.push('   Unprocessed new emails: https://mail.google.com/mail/u/0/#inbox');
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
			lines.push(...renderEmailItem(actionRequiredItems[i]));
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
			lines.push(...renderEmailItem(items[i]));
			if (i < items.length - 1) {
				lines.push('');
			}
		}
		lines.push('');
	}

	// 3. RECYCLING IN 7 DAYS Section
	const recyclingItems = data.entries.filter((e) => e.recycleLabel !== undefined);
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
