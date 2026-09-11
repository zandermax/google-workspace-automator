import {
	TRIAGE_CATEGORIES,
	type TriageCategory,
} from '@/types/Gmail/triage';
import { PENDING_ACTION_SEARCH_QUERY } from './actionRules';

export interface PendingThreadLike {
	getId(): string;
	getFirstMessageSubject(): string;
	getLastMessageDate(): Date;
	getLabels(): Array<{ getName(): string }>;
	getMessages(): Array<{ getFrom(): string }>;
	isInInbox(): boolean;
}

export interface PendingItem {
	threadId: string;
	category: TriageCategory;
	subject: string;
	sender: string;
	ageInDays: number;
}

export interface PendingItemGroup {
	category: TriageCategory;
	items: PendingItem[];
}

export type PendingThreadSearchFunction = () => PendingThreadLike[];

const defaultSearch: PendingThreadSearchFunction = () => {
	if (typeof GmailApp === 'undefined') {
		throw new Error('GmailApp is not available in this environment.');
	}

	return GmailApp.search(PENDING_ACTION_SEARCH_QUERY) as unknown as PendingThreadLike[];
};

const resolveCategory = (thread: PendingThreadLike): TriageCategory => {
	const labelNames = thread.getLabels().map((label) => label.getName());
	for (const category of TRIAGE_CATEGORIES) {
		if (labelNames.includes(category)) {
			return category;
		}
	}

	return 'triage/unknown';
};

const daysSince = (date: Date, now: Date): number =>
	Math.max(0, Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)));
// Threads already moved out of the inbox sort first, so users see nagging reminders
// to finish clearing the label on items they've already actioned natively in Gmail.
const inboxPartitionRank = (inInbox: boolean): number => (inInbox ? 1 : 0);

export const queryPendingThreads = (
	search: PendingThreadSearchFunction = defaultSearch,
	now: Date = new Date()
): PendingItem[] => {
	const threads = search();

	const ranked = threads.map((thread) => {
		const messages = thread.getMessages();
		const lastMessage = messages[messages.length - 1];

		const item: PendingItem = {
			threadId: thread.getId(),
			category: resolveCategory(thread),
			subject: thread.getFirstMessageSubject(),
			sender: lastMessage ? lastMessage.getFrom() : '',
			ageInDays: daysSince(thread.getLastMessageDate(), now),
		};

		return { item, inInbox: thread.isInInbox() };
	});

	ranked.sort((a, b) => {
		const partitionDiff = inboxPartitionRank(a.inInbox) - inboxPartitionRank(b.inInbox);
		return partitionDiff !== 0 ? partitionDiff : b.item.ageInDays - a.item.ageInDays;
	});

	return ranked.map((r) => r.item);
};

export const groupPendingItemsByCategory = (
	items: PendingItem[]
): PendingItemGroup[] => {
	const groups: PendingItemGroup[] = [];

	for (const category of TRIAGE_CATEGORIES) {
		const categoryItems = items.filter((item) => item.category === category);
		if (categoryItems.length > 0) {
			groups.push({ category, items: categoryItems });
		}
	}

	return groups;
};
