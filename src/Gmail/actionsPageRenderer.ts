import { CATEGORY_METADATA } from './digestComposer';
import { escapeHtml } from '../helpers/html';
import { type PendingItem, type PendingItemGroup } from './queryPendingThreads';

const renderItemHtml = (item: PendingItem): string => `<div id="pending-${escapeHtml(item.threadId)}" style="padding:10px 0;border-top:1px solid rgba(0,0,0,0.06);">
	<div style="font-size:11px;color:#6b7280;">${escapeHtml(item.sender)} &middot; ${item.ageInDays}d</div>
	<div style="font-size:14px;margin-top:2px;"><strong>${escapeHtml(item.subject)}</strong></div>
	<div style="margin-top:6px;">
		<button onclick="archiveItem('${escapeHtml(item.threadId)}')" style="margin-right:8px;">Archive</button>
		<button onclick="deleteItem('${escapeHtml(item.threadId)}')">Delete</button>
	</div>
</div>`;

const renderGroupHtml = (group: PendingItemGroup): string => {
	const meta = CATEGORY_METADATA[group.category];
	const itemsHtml = group.items.map(renderItemHtml).join('');

	return `<div style="background:${meta.tint};border-left:4px solid ${meta.accent};border-radius:6px;padding:12px 16px;margin-bottom:16px;">
	<div style="font-weight:700;color:${meta.accent};text-transform:uppercase;font-size:12px;letter-spacing:0.05em;">${meta.icon} ${escapeHtml(meta.title)} (${group.items.length})</div>
	${itemsHtml}
</div>`;
};

export const renderActionsPageHtml = (groups: PendingItemGroup[]): string => {
	const bodyHtml =
		groups.length > 0
			? groups.map(renderGroupHtml).join('')
			: '<div style="text-align:center;padding:24px 0;color:#374151;">🎉 Nothing pending review.</div>';

	return `<!DOCTYPE html>
<html>
<head><base target="_top"></head>
<body style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;max-width:640px;margin:0 auto;padding:16px;">
	<div style="font-size:20px;font-weight:700;margin-bottom:16px;">📋 Pending Triage Actions</div>
	${bodyHtml}
	<script>
		function archiveItem(threadId) {
			google.script.run
				.withSuccessHandler(function (resolved) {
					if (resolved) {
						removeRow(threadId);
					} else {
						alert('Could not resolve that thread — it may have already been moved. Refresh the page.');
					}
				})
				.withFailureHandler(function (error) { alert('Action failed: ' + error.message); })
				.handleArchiveDigestThread(threadId);
		}
		function deleteItem(threadId) {
			google.script.run
				.withSuccessHandler(function (resolved) {
					if (resolved) {
						removeRow(threadId);
					} else {
						alert('Could not resolve that thread — it may have already been moved. Refresh the page.');
					}
				})
				.withFailureHandler(function (error) { alert('Action failed: ' + error.message); })
				.handleDeleteDigestThread(threadId);
		}
		function removeRow(threadId) {
			var row = document.getElementById('pending-' + threadId);
			if (row) { row.remove(); }
		}
	</script>
</body>
</html>`;
};
