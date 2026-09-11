import {
	queryPendingThreads,
	groupPendingItemsByCategory,
} from '../../Gmail/queryPendingThreads';
import { renderActionsPageHtml } from '../../Gmail/actionsPageRenderer';
import {
	archiveDigestThread,
	deleteDigestThread,
} from '../../Gmail/digestActionResolver';

export const doGet = (): GoogleAppsScript.HTML.HtmlOutput => {
	const items = queryPendingThreads();
	const groups = groupPendingItemsByCategory(items);
	const html = renderActionsPageHtml(groups);

	return HtmlService.createHtmlOutput(html).setTitle('Pending Triage Actions');
};

export const handleArchiveDigestThread = (threadId: string): boolean =>
	archiveDigestThread(threadId).resolved;

export const handleDeleteDigestThread = (threadId: string): boolean =>
	deleteDigestThread(threadId).resolved;
