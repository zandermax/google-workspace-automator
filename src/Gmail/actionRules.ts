import {
	type ExtractedEmailSnippet,
	type TriageClassification,
	type TriageExecutionDirective,
	type TriageCategory,
} from '@/types/Gmail/triage';

export const DEFAULT_STALE_DAYS_THRESHOLD = 7;
export const PENDING_ACTION_LABEL = 'Digest/Pending-Action' as const;
export const PENDING_ACTION_SEARCH_QUERY = `label:"${PENDING_ACTION_LABEL}" -in:trash` as const;

export const determineTriageDirective = (
	email: ExtractedEmailSnippet,
	classification: TriageClassification,
	_staleDaysThreshold = DEFAULT_STALE_DAYS_THRESHOLD
): TriageExecutionDirective => {
	return {
		threadId: email.id,
		classification,
		email,
		actionType: 'apply-label-only',
		reason: `Queued for manual review under ${classification.category}.`,
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
