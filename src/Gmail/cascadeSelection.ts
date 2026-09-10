import { type ThreadLike } from './extraction';

export const DAILY_LIMIT = 50;
export const OVERSAMPLE_MULTIPLIER = 5;

export const CASCADE_QUERIES = {
	unreadInbox: 'in:inbox is:unread -label:"🪄✨ Magic ✨🪄"',
	oldInbox: 'in:inbox -label:"🪄✨ Magic ✨🪄"',
	archived: 'in:anywhere -in:inbox -in:trash -in:spam -label:"🪄✨ Magic ✨🪄"',
} as const;

export type SearchFunction<T> = (
	query: string,
	start: number,
	max: number
) => T[];

export interface CascadeSelectionOptions<T> {
	limit?: number;
	search?: SearchFunction<T>;
	random?: () => number;
}

export interface CascadeSelectionCounts {
	unreadInbox: number;
	oldInbox: number;
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

export const selectCascadeThreads = <T extends { getId(): string }>(
	options: CascadeSelectionOptions<T> = {}
): CascadeSelectionResult<T> => {
	const limit = options.limit ?? DAILY_LIMIT;
	const search = options.search ?? (defaultGmailSearch as unknown as SearchFunction<T>);
	const random = options.random ?? Math.random;

	const selectedThreads: T[] = [];
	const seenIds = new Set<string>();

	// Step 1: Unread inbox
	const unreadPool = search(CASCADE_QUERIES.unreadInbox, 0, limit);
	const isHighVolumeOverflow = unreadPool.length >= limit;

	for (const thread of unreadPool) {
		if (selectedThreads.length < limit && !seenIds.has(thread.getId())) {
			selectedThreads.push(thread);
			seenIds.add(thread.getId());
		}
	}

	const unreadCount = selectedThreads.length;

	// If unread pool saturated or exceeded the limit, stop early per architecture spec
	if (selectedThreads.length >= limit || isHighVolumeOverflow) {
		return {
			threads: selectedThreads,
			isHighVolumeOverflow,
			counts: {
				unreadInbox: unreadCount,
				oldInbox: 0,
				archived: 0,
			},
		};
	}

	// Step 2: Old inbox (random sample)
	let remainingSlots = limit - selectedThreads.length;
	const oldInboxCandidatePool = search(
		CASCADE_QUERIES.oldInbox,
		0,
		remainingSlots * OVERSAMPLE_MULTIPLIER
	).filter((thread) => !seenIds.has(thread.getId()));

	const shuffledOldInbox = fisherYatesShuffle(oldInboxCandidatePool, random);
	let oldInboxCount = 0;

	for (const thread of shuffledOldInbox) {
		if (selectedThreads.length < limit && !seenIds.has(thread.getId())) {
			selectedThreads.push(thread);
			seenIds.add(thread.getId());
			oldInboxCount += 1;
		}
	}

	// Step 3: Archived (random sample)
	remainingSlots = limit - selectedThreads.length;
	let archivedCount = 0;

	if (remainingSlots > 0) {
		const archivedCandidatePool = search(
			CASCADE_QUERIES.archived,
			0,
			remainingSlots * OVERSAMPLE_MULTIPLIER
		).filter((thread) => !seenIds.has(thread.getId()));

		const shuffledArchived = fisherYatesShuffle(archivedCandidatePool, random);

		for (const thread of shuffledArchived) {
			if (selectedThreads.length < limit && !seenIds.has(thread.getId())) {
				selectedThreads.push(thread);
				seenIds.add(thread.getId());
				archivedCount += 1;
			}
		}
	}

	return {
		threads: selectedThreads,
		isHighVolumeOverflow: false,
		counts: {
			unreadInbox: unreadCount,
			oldInbox: oldInboxCount,
			archived: archivedCount,
		},
	};
};
