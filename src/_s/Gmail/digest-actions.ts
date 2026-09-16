import {
	queryPendingThreads,
	groupPendingItemsByCategory,
} from '../../Gmail/queryPendingThreads';
import { renderActionsPageHtml } from '../../Gmail/actionsPageRenderer';
import {
	archiveDigestThread,
	deleteDigestThread,
} from '../../Gmail/digestActionResolver';
import { removeTriageSummary } from '../../Gmail/pendingTriageSummaries';

export const doGet = (): GoogleAppsScript.HTML.HtmlOutput => {
	const items = queryPendingThreads();
	const groups = groupPendingItemsByCategory(items);
	const html = renderActionsPageHtml(groups);

	return HtmlService.createHtmlOutput(html).setTitle('Pending Triage Actions');
};

export const handleArchiveDigestThread = (threadId: string): boolean => {
	const result = archiveDigestThread(threadId);
	if (result.resolved) {
		removeTriageSummary(threadId);
	}
	return result.resolved;
};

export const handleDeleteDigestThread = (threadId: string): boolean => {
	const result = deleteDigestThread(threadId);
	if (result.resolved) {
		removeTriageSummary(threadId);
	}
	return result.resolved;
};
