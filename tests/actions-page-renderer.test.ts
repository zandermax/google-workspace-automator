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
					summary: 'The week in product updates.',
					unsubscribeUrl: 'https://newsletter.example.com/unsubscribe',
				} as PendingItemGroup['items'][number],
			],
		},
	];

	const html = renderActionsPageHtml(groups);

	assert.ok(html.includes('👤'));
	assert.ok(html.includes('PERSONAL'));
	assert.ok(html.includes('a@b.com &middot; 1y 1mo 5d'));
	assert.ok(html.includes('The week in product updates.'));
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
});

test('renderActionsPageHtml shows an empty state when nothing is pending', () => {
	const html = renderActionsPageHtml([]);
	assert.ok(html.includes('Nothing pending review'));
});
