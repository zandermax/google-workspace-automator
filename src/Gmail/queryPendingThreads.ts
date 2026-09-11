import {
	TRIAGE_CATEGORIES,
	type TriageCategory,
} from '@/types/Gmail/triage';
import { PENDING_ACTION_LABEL } from './actionRules';

export interface PendingThreadLike {
	getId(): string;
	getFirstMessageSubject(): string;
	getLastMessageDate(): Date;
	getLabels(): Array<{ getName(): string }>;
	getMessages(): Array<{ getFrom(): string }>;
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

	return GmailApp.search(
		`label:"${PENDING_ACTION_LABEL}" -in:trash`
	) as unknown as PendingThreadLike[];
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

export const queryPendingThreads = (
	search: PendingThreadSearchFunction = defaultSearch,
	now: Date = new Date()
): PendingItem[] => {
	const threads = search();

	const items: PendingItem[] = threads.map((thread) => {
		const messages = thread.getMessages();
		const lastMessage = messages[messages.length - 1];

		return {
			threadId: thread.getId(),
			category: resolveCategory(thread),
			subject: thread.getFirstMessageSubject(),
			sender: lastMessage ? lastMessage.getFrom() : '',
			ageInDays: daysSince(thread.getLastMessageDate(), now),
		};
	});

	return items.sort((a, b) => b.ageInDays - a.ageInDays);
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
