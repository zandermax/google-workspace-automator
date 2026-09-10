import {
	type ExtractedEmailSnippet,
	type TriageClassification,
	type TriageExecutionDirective,
	type TriageCategory,
} from '@/types/Gmail/triage';

export const DEFAULT_STALE_DAYS_THRESHOLD = 7;
export const AUTO_RECYCLE_LABEL = 'Auto-Recycle/7d' as const;

export const AUTO_RECYCLE_CATEGORIES: ReadonlySet<TriageCategory> = new Set([
	'triage/newsletters',
	'triage/alerts',
	'triage/junk',
]);

export const determineTriageDirective = (
	email: ExtractedEmailSnippet,
	classification: TriageClassification,
	staleDaysThreshold = DEFAULT_STALE_DAYS_THRESHOLD
): TriageExecutionDirective => {
	const isStale = email.ageInDays >= staleDaysThreshold;

	// Rule 1: Time-sensitive and stale -> skip triage label, queue directly to Auto-Recycle/7d
	if (classification.timeSensitive && isStale) {
		return {
			threadId: email.id,
			classification,
			email,
			actionType: 'recycle-7d-only',
			recycleLabel: AUTO_RECYCLE_LABEL,
			reason: `Time-sensitive message is stale (${email.ageInDays} days old); skipped triage label and queued for 7-day auto-recycle.`,
		};
	}

	// Rule 2: Ephemeral categories (newsletters, alerts, junk) -> apply triage label + Auto-Recycle/7d
	if (AUTO_RECYCLE_CATEGORIES.has(classification.category)) {
		return {
			threadId: email.id,
			classification,
			email,
			actionType: 'apply-label-and-recycle-7d',
			triageLabel: classification.category,
			recycleLabel: AUTO_RECYCLE_LABEL,
			reason: `${classification.category} tagged with category label and queued for 7-day auto-recycle.`,
		};
	}

	// Rule 3: Retain categories (personal, finance, govt, receipts) -> label only, manual action
	return {
		threadId: email.id,
		classification,
		email,
		actionType: 'apply-label-only',
		triageLabel: classification.category,
		reason: `Retained for user review under ${classification.category}.`,
	};
};

export const determineTriageDirectives = (
	emails: ExtractedEmailSnippet[],
	classifications: TriageClassification[],
	staleDaysThreshold = DEFAULT_STALE_DAYS_THRESHOLD
): TriageExecutionDirective[] => {
	const classificationMap = new Map<string, TriageClassification>();
	for (const item of classifications) {
		classificationMap.set(item.id, item);
	}

	const directives: TriageExecutionDirective[] = [];

	for (const email of emails) {
		const classification = classificationMap.get(email.id);
		if (!classification) {
			throw new Error(
				`Missing classification for email thread id "${email.id}".`
			);
		}

		directives.push(
			determineTriageDirective(email, classification, staleDaysThreshold)
		);
	}

	return directives;
};
