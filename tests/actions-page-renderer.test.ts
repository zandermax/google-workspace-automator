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
					ageInDays: 2,
				},
			],
		},
	];

	const html = renderActionsPageHtml(groups);

	assert.ok(html.includes('👤'));
	assert.ok(html.includes('PERSONAL'));
	assert.ok(html.includes("archiveItem('t-1')"));
	assert.ok(html.includes("deleteItem('t-1')"));
	assert.ok(html.includes('google.script.run'));
	assert.ok(html.includes('handleArchiveDigestThread'));
	assert.ok(html.includes('handleDeleteDigestThread'));
});

test('renderActionsPageHtml shows an empty state when nothing is pending', () => {
	const html = renderActionsPageHtml([]);
	assert.ok(html.includes('Nothing pending review'));
});
