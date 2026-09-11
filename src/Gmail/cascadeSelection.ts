import { type ThreadLike } from './extraction';

export const DAILY_LIMIT = 50;
export const OVERSAMPLE_MULTIPLIER = 5;

export const CASCADE_QUERIES = {
	unreadInbox: 'in:inbox is:unread -label:"🪄✨ Magic ✨🪄"',
	oldInbox: 'in:inbox -label:"🪄✨ Magic ✨🪄"',
	archived: 'in:anywhere -in:inbox -in:trash -in:spam -label:"🪄✨ Magic ✨🪄"',
} as const;

/** Share of each run's slots drawn from each pool, as percentages of the daily limit. */
export const DEFAULT_SLOT_PERCENTAGES = {
	inbox: 60,
	largeElsewhere: 20,
} as const;

export interface SlotPercentages {
	inbox: number;
	largeElsewhere: number;
}

export interface SlotBudget {
	inbox: number;
	largeElsewhere: number;
	randomElsewhere: number;
}

const clampPercentage = (value: number, fallback: number): number =>
	Number.isFinite(value) && value >= 0 && value <= 100 ? value : fallback;

/**
 * Splits a run's slots across the three pools. Inbox and large-mail shares are
 * rounded down so the leftover always lands in the random-elsewhere remainder,
 * which keeps the three counts summing to exactly `limit`.
 */
export const allocateSlotBudget = (
	limit: number,
	percentages: Partial<SlotPercentages> = {}
): SlotBudget => {
	if (!Number.isFinite(limit) || limit <= 0) {
		return { inbox: 0, largeElsewhere: 0, randomElsewhere: 0 };
	}

	const inboxPercent = clampPercentage(
		percentages.inbox ?? DEFAULT_SLOT_PERCENTAGES.inbox,
		DEFAULT_SLOT_PERCENTAGES.inbox
	);
	const largePercent = clampPercentage(
		percentages.largeElsewhere ?? DEFAULT_SLOT_PERCENTAGES.largeElsewhere,
		DEFAULT_SLOT_PERCENTAGES.largeElsewhere
	);

	const totalPercent = inboxPercent + largePercent;
	const normalizer = totalPercent > 100 ? 100 / totalPercent : 1;

	const inbox = Math.floor((limit * inboxPercent * normalizer) / 100);
	const largeElsewhere = Math.floor((limit * largePercent * normalizer) / 100);

	return {
		inbox,
		largeElsewhere,
		randomElsewhere: limit - inbox - largeElsewhere,
	};
};

export type SearchFunction<T> = (
	query: string,
	start: number,
	max: number
) => T[];

export interface CascadeSelectionOptions<T> {
	limit?: number;
	search?: SearchFunction<T>;
	random?: () => number;
	percentages?: Partial<SlotPercentages>;
	sizeThresholds?: readonly string[];
}

export interface CascadeSelectionCounts {
	unreadInbox: number;
	oldInbox: number;
	largeElsewhere: number;
	archived: number;
}

export interface CascadeSelectionResult<T> {
	threads: T[];
	isHighVolumeOverflow: boolean;
	counts: CascadeSelectionCounts;
}

export const fisherYatesShuffle = <T>(
	items: readonly T[],
	random: () => number = Math.random
): T[] => {
	const result = [...items];
	for (let i = result.length - 1; i > 0; i -= 1) {
		const j = Math.floor(random() * (i + 1));
		const temp = result[i];
		result[i] = result[j];
		result[j] = temp;
	}

	return result;
};

const defaultGmailSearch: SearchFunction<ThreadLike> = (query, start, max) => {
	if (typeof GmailApp === 'undefined') {
		throw new Error('GmailApp is not available in this environment.');
	}

	return GmailApp.search(query, start, max);
};

/** Probed biggest-first; each threshold's result set contains the next one's. */
export const BIG_SIZE_THRESHOLDS = ['10M', '5M', '2M', '1M', '500K'] as const;

const readScriptProperty = (key: string): string | undefined => {
	if (
		typeof PropertiesService === 'undefined' ||
		!PropertiesService.getScriptProperties
	) {
		return undefined;
	}

	return PropertiesService.getScriptProperties().getProperty(key) ?? undefined;
};

/** Invalid values fall through to the defaults inside `allocateSlotBudget`. */
export const resolveSlotPercentages = (): SlotPercentages => ({
	inbox: Number(
		readScriptProperty('SORTER_INBOX_PERCENT') ??
			DEFAULT_SLOT_PERCENTAGES.inbox
	),
	largeElsewhere: Number(
		readScriptProperty('SORTER_LARGE_MAIL_PERCENT') ??
			DEFAULT_SLOT_PERCENTAGES.largeElsewhere
	),
});

/** Thresholds are interpolated into a Gmail query, so only `<digits><K|M>` is accepted. */
export const resolveSizeThresholds = (): readonly string[] => {
	const raw = readScriptProperty('SORTER_SIZE_THRESHOLDS');
	if (!raw) {
		return BIG_SIZE_THRESHOLDS;
	}

	const parsed = raw
		.split(',')
		.map((value) => value.trim())
		.filter((value) => /^\d+[KM]$/i.test(value));

	return parsed.length > 0 ? parsed : BIG_SIZE_THRESHOLDS;
};

export const buildLargeMailQuery = (threshold: string): string =>
	`${CASCADE_QUERIES.archived} larger:${threshold}`;

export interface LargeCandidateOptions<T> {
	budget: number;
	search: SearchFunction<T>;
	seenIds?: ReadonlySet<string>;
	thresholds?: readonly string[];
}

export interface LargeCandidateResult<T> {
	candidates: T[];
	threshold?: string;
}

/**
 * Gmail sorts results by date and exposes no result count, so a true size
 * percentile would mean enumerating the whole mailbox. Instead, probe nested
 * `larger:` thresholds from biggest down and stop at the first one that fills
 * the budget, falling back to the broadest pool found.
 */
export const selectLargeCandidates = <T extends { getId(): string }>(
	options: LargeCandidateOptions<T>
): LargeCandidateResult<T> => {
	const { budget, search } = options;

	if (budget <= 0) {
		return { candidates: [] };
	}

	const seenIds = options.seenIds ?? new Set<string>();
	const thresholds = options.thresholds ?? BIG_SIZE_THRESHOLDS;
	const max = budget * OVERSAMPLE_MULTIPLIER;

	let best: LargeCandidateResult<T> = { candidates: [] };

	for (const threshold of thresholds) {
		const candidates = search(buildLargeMailQuery(threshold), 0, max).filter(
			(thread) => !seenIds.has(thread.getId())
		);

		if (candidates.length > best.candidates.length) {
			best = { candidates, threshold };
		}

		if (candidates.length >= budget) {
			break;
		}
	}

	return best;
};

export const selectCascadeThreads = <T extends { getId(): string }>(
	options: CascadeSelectionOptions<T> = {}
): CascadeSelectionResult<T> => {
	const limit = options.limit ?? DAILY_LIMIT;
	const search = options.search ?? (defaultGmailSearch as unknown as SearchFunction<T>);
	const random = options.random ?? Math.random;
	const budget = allocateSlotBudget(
		limit,
		options.percentages ?? resolveSlotPercentages()
	);

	const selectedThreads: T[] = [];
	const seenIds = new Set<string>();
	const counts: CascadeSelectionCounts = {
		unreadInbox: 0,
		oldInbox: 0,
		largeElsewhere: 0,
		archived: 0,
	};

	/** Fills up to `slots` from `candidates` and returns the slots left unfilled. */
	const take = (
		candidates: readonly T[],
		slots: number,
		countKey: keyof CascadeSelectionCounts
	): number => {
		let taken = 0;

		for (const thread of candidates) {
			if (taken >= slots || selectedThreads.length >= limit) {
				break;
			}

			const id = thread.getId();
			if (seenIds.has(id)) {
				continue;
			}

			selectedThreads.push(thread);
			seenIds.add(id);
			counts[countKey] += 1;
			taken += 1;
		}

		return slots - taken;
	};

	// Step 1: Unread inbox, capped at the inbox budget so elsewhere pools keep their slots.
	// One extra result is requested purely to detect overflow.
	let isHighVolumeOverflow = false;
	let inboxUnfilled = budget.inbox;

	if (budget.inbox > 0) {
		const unreadPool = search(
			CASCADE_QUERIES.unreadInbox,
			0,
			budget.inbox + 1
		);
		isHighVolumeOverflow = unreadPool.length > budget.inbox;
		inboxUnfilled = take(unreadPool, budget.inbox, 'unreadInbox');
	}

	// Step 2: Old inbox fills whatever the unread pool left of the inbox budget.
	if (inboxUnfilled > 0) {
		const oldInboxPool = search(
			CASCADE_QUERIES.oldInbox,
			0,
			inboxUnfilled * OVERSAMPLE_MULTIPLIER
		);
		inboxUnfilled = take(
			fisherYatesShuffle(oldInboxPool, random),
			inboxUnfilled,
			'oldInbox'
		);
	}

	// Step 3: Size-biased non-inbox mail.
	let largeUnfilled = budget.largeElsewhere;

	if (budget.largeElsewhere > 0) {
		const large = selectLargeCandidates({
			budget: budget.largeElsewhere,
			search,
			seenIds,
			thresholds: options.sizeThresholds ?? resolveSizeThresholds(),
		});
		largeUnfilled = take(
			fisherYatesShuffle(large.candidates, random),
			budget.largeElsewhere,
			'largeElsewhere'
		);
	}

	// Step 4: Random non-inbox mail, absorbing every unfilled slot from steps 1-3.
	const randomElsewhereSlots =
		budget.randomElsewhere + inboxUnfilled + largeUnfilled;

	if (randomElsewhereSlots > 0) {
		const archivedPool = search(
			CASCADE_QUERIES.archived,
			0,
			randomElsewhereSlots * OVERSAMPLE_MULTIPLIER
		);
		take(
			fisherYatesShuffle(archivedPool, random),
			randomElsewhereSlots,
			'archived'
		);
	}

	return {
		threads: selectedThreads,
		isHighVolumeOverflow,
		counts,
	};
};
