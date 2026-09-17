import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { renderActionsPageHtml } from '../src/Gmail/actionsPageRenderer';
import { type PendingItemGroup } from '../src/Gmail/queryPendingThreads';

test('renderActionsPageHtml renders category groups with Archive/Delete buttons wired to google.script.run', () => {
	const groups: PendingItemGroup[] = [
		{
			category: 'triage/personal',
			items: [
				{
					threadId: 't-1',
					category: 'triage/personal',
					subject: 'Hi',
					sender: 'a@b.com',
					ageInDays: 400,
					sizeKb: 250,
					summary: 'The week in product updates.',
					unsubscribeUrl: 'https://newsletter.example.com/unsubscribe',
				} as PendingItemGroup['items'][number],
			],
		},
	];

	const html = renderActionsPageHtml(groups);

	assert.ok(html.includes('👤'));
	assert.ok(html.includes('PERSONAL'));
	assert.ok(html.includes('a@b.com &middot; 1y 1mo 5d &middot; 250 KB'));
	assert.ok(html.includes('The week in product updates.'));
	assert.ok(html.includes('href="https://mail.google.com/mail/u/0/#all/t-1"'));
	assert.ok(html.includes('target="_blank"'));
	assert.ok(html.includes("archiveItem('t-1')"));
	assert.ok(html.includes("deleteItem('t-1')"));
	assert.ok(
		html.includes(
			'href="https://newsletter.example.com/unsubscribe"'
		)
	);
	assert.ok(
		html.indexOf("deleteItem('t-1')") < html.indexOf('Unsubscribe')
	);
	assert.ok(html.includes('google.script.run'));
	assert.ok(html.includes('handleArchiveDigestThread'));
	assert.ok(html.includes('handleDeleteDigestThread'));
	assert.ok(html.includes('withFailureHandler'));
	assert.ok(html.includes('if (resolved)'));
	assert.ok(html.includes('Working...'));
	assert.ok(html.includes('setRowPending(threadId, true)'));
	assert.ok(html.includes('setRowPending(threadId, false)'));
	assert.ok(html.includes("completeRow(threadId, 'Archived')"));
	assert.ok(html.includes("completeRow(threadId, 'Deleted')"));
	assert.ok(html.includes('[Archived]'));
	assert.ok(html.includes('[Deleted]'));
	assert.ok(!html.includes('removeRow(threadId)'));
});

test('renderActionsPageHtml falls back to (no subject) and formats MB sizes', () => {
	const groups: PendingItemGroup[] = [
		{
			category: 'triage/newsletters',
			items: [
				{
					threadId: 't-2',
					category: 'triage/newsletters',
					subject: '   ',
					sender: 'news@example.com',
					ageInDays: 30,
					sizeKb: 2400,
				} as PendingItemGroup['items'][number],
			],
		},
	];

	const html = renderActionsPageHtml(groups);

	assert.ok(html.includes('news@example.com &middot; 0y 1mo 0d &middot; 2.3 MB'));
	assert.ok(
		html.includes(
			'<a href="https://mail.google.com/mail/u/0/#all/t-2" target="_blank" rel="noopener" style="color:#111827;text-decoration:none;"><strong>(no subject)</strong></a>'
		)
	);
});

test('renderActionsPageHtml shows an empty state when nothing is pending', () => {
	const html = renderActionsPageHtml([]);
	assert.ok(html.includes('Nothing pending review'));
});
