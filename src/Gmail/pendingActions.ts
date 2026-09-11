import { PENDING_ACTION_SEARCH_QUERY } from './actionRules';

export interface PendingCountProvider {
	countPending(): number;
}

const defaultPendingCountProvider: PendingCountProvider = {
	countPending(): number {
		if (typeof GmailApp === 'undefined') {
			throw new Error('GmailApp is not available in this environment.');
		}

		return GmailApp.search(PENDING_ACTION_SEARCH_QUERY).length;
	},
};

export const getPendingActionCount = (
	provider: PendingCountProvider = defaultPendingCountProvider
): number => provider.countPending();
