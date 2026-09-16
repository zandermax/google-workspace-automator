import {
	type TriageCategory,
	type TriageExecutionDirective,
} from '@/types/Gmail/triage';

const PROPERTY_PREFIX = 'TRIAGE_SUMMARY_';

export interface TriageSummary {
	category?: TriageCategory;
	summary: string;
	highlights: string[];
	keyDetail: string;
}

export interface TriageSummaryPropertyStore {
	getProperty(key: string): string | null;
	setProperty(key: string, value: string): void;
	deleteProperty(key: string): void;
}

const defaultStore = (): TriageSummaryPropertyStore | undefined => {
	if (typeof PropertiesService === 'undefined') {
		return undefined;
	}

	return PropertiesService.getScriptProperties();
};

const propertyKey = (threadId: string): string => `${PROPERTY_PREFIX}${threadId}`;

export const saveTriageSummaries = (
	directives: readonly TriageExecutionDirective[],
	store: TriageSummaryPropertyStore | undefined = defaultStore()
): void => {
	if (!store) {
		return;
	}

	for (const directive of directives) {
		const { category, summary, highlights, keyDetail } = directive.classification;
		store.setProperty(
			propertyKey(directive.threadId),
			JSON.stringify({ category, summary, highlights, keyDetail } satisfies TriageSummary)
		);
	}
};

export const getTriageSummary = (
	threadId: string,
	store: TriageSummaryPropertyStore | undefined = defaultStore()
): TriageSummary | undefined => {
	if (!store) {
		return undefined;
	}

	const raw = store.getProperty(propertyKey(threadId));
	if (!raw) {
		return undefined;
	}

	try {
		const parsed = JSON.parse(raw) as Partial<TriageSummary>;
		if (
			typeof parsed.summary !== 'string' ||
			!Array.isArray(parsed.highlights) ||
			!parsed.highlights.every((highlight) => typeof highlight === 'string') ||
			typeof parsed.keyDetail !== 'string'
		) {
			return undefined;
		}

		return {
			...(typeof parsed.category === 'string' ? { category: parsed.category as TriageCategory } : {}),
			summary: parsed.summary,
			highlights: parsed.highlights,
			keyDetail: parsed.keyDetail,
		};
	} catch {
		return undefined;
	}
};

export const removeTriageSummary = (
	threadId: string,
	store: TriageSummaryPropertyStore | undefined = defaultStore()
): void => {
	if (!store) {
		return;
	}

	store.deleteProperty(propertyKey(threadId));
};