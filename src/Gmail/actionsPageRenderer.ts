import { CATEGORY_METADATA } from './digestComposer';
import { escapeHtml } from '../helpers/html';
import { type PendingItem, type PendingItemGroup } from './queryPendingThreads';

const formatAge = (ageInDays: number): string => {
	const years = Math.floor(ageInDays / 365);
	const remainingDays = ageInDays % 365;
	const months = Math.floor(remainingDays / 30);
	const days = remainingDays % 30;

	return `${years}y ${months}mo ${days}d`;
};

const renderItemHtml = (item: PendingItem): string => `<div id="pending-${escapeHtml(item.threadId)}" style="padding:10px 0;border-top:1px solid rgba(0,0,0,0.06);">
	<div style="font-size:11px;color:#6b7280;">${escapeHtml(item.sender)} &middot; ${formatAge(item.ageInDays)}</div>
	<div style="font-size:14px;margin-top:2px;"><strong>${escapeHtml(item.subject)}</strong></div>
	${item.summary ? `<div style="margin-top:4px;color:#1f2937;">&rarr; ${escapeHtml(item.summary)}</div>` : ''}
	<div style="margin-top:6px;">
		<button data-action-button onclick="archiveItem('${escapeHtml(item.threadId)}')" style="margin-right:8px;">Archive</button>
		<button data-action-button onclick="deleteItem('${escapeHtml(item.threadId)}')">Delete</button>
		${item.unsubscribeUrl ? `<a href="${escapeHtml(item.unsubscribeUrl)}" target="_blank" rel="noopener" style="margin-left:8px;">Unsubscribe</a>` : item.unsubscribeMailto ? `<a href="${escapeHtml(item.unsubscribeMailto)}" style="margin-left:8px;">Unsubscribe</a>` : ''}
		<span data-action-status style="display:none;margin-left:8px;color:#6b7280;">Working...</span>
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
			setRowPending(threadId, true);
			google.script.run
				.withSuccessHandler(function (resolved) {
					if (resolved) {
						completeRow(threadId, 'Archived');
					} else {
						setRowPending(threadId, false);
						alert('Could not resolve that thread — it may have already been moved. Refresh the page.');
					}
				})
				.withFailureHandler(function (error) {
					setRowPending(threadId, false);
					alert('Action failed: ' + error.message);
				})
				.handleArchiveDigestThread(threadId);
		}
		function deleteItem(threadId) {
			setRowPending(threadId, true);
			google.script.run
				.withSuccessHandler(function (resolved) {
					if (resolved) {
						completeRow(threadId, 'Deleted');
					} else {
						setRowPending(threadId, false);
						alert('Could not resolve that thread — it may have already been moved. Refresh the page.');
					}
				})
				.withFailureHandler(function (error) {
					setRowPending(threadId, false);
					alert('Action failed: ' + error.message);
				})
				.handleDeleteDigestThread(threadId);
		}
		function setRowPending(threadId, pending) {
			var row = document.getElementById('pending-' + threadId);
			if (!row) { return; }
			var buttons = row.querySelectorAll('[data-action-button]');
			for (var i = 0; i < buttons.length; i += 1) { buttons[i].disabled = pending; }
			var status = row.querySelector('[data-action-status]');
			if (status) { status.style.display = pending ? 'inline' : 'none'; }
		}
		function completeRow(threadId, action) {
			var row = document.getElementById('pending-' + threadId);
			if (!row) { return; }
			row.style.opacity = '0.55';
			var buttons = row.querySelectorAll('[data-action-button]');
			for (var i = 0; i < buttons.length; i += 1) { buttons[i].remove(); }
			var status = row.querySelector('[data-action-status]');
			if (status) { status.remove(); }
			var completion = document.createElement('span');
			completion.textContent = action === 'Deleted' ? '[Deleted]' : '[Archived]';
			completion.style.marginLeft = '8px';
			completion.style.color = action === 'Deleted' ? '#dc2626' : '#6b7280';
			row.querySelector('div[style="margin-top:6px;"]').appendChild(completion);
		}
	</script>
</body>
</html>`;
};
