import { PENDING_ACTION_LABEL } from './actionRules';

export interface PendingCountProvider {
	countPending(): number;
}

const defaultPendingCountProvider: PendingCountProvider = {
	countPending(): number {
		if (typeof GmailApp === 'undefined') {
			throw new Error('GmailApp is not available in this environment.');
		}

		return GmailApp.search(`label:"${PENDING_ACTION_LABEL}" -in:trash`).length;
	},
};

export const getPendingActionCount = (
	provider: PendingCountProvider = defaultPendingCountProvider
): number => provider.countPending();
