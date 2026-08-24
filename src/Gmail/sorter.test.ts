import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { classifyThreadForInboxSort } from './sorter';

test('classifies obvious finance mail', () => {
	const result = classifyThreadForInboxSort({
		subject: 'Bank of America statement available',
		sender: 'alerts@bankofamerica.com',
		body: 'Your recent statement is ready for review. Payment due on 12/10.',
	});

	assert.equal(result.category, 'Finance');
	assert.equal(result.action, 'label-only');
});

test('classifies personal mail as personal', () => {
	const result = classifyThreadForInboxSort({
		subject: 'Dinner Friday?',
		sender: 'laura@gmail.com',
		body: 'Are we still doing dinner Friday night?',
	});

	assert.equal(result.category, 'Personal');
	assert.equal(result.action, 'label-only');
});

test('classifies newsletters conservatively', () => {
	const result = classifyThreadForInboxSort({
		subject: 'Weekly product digest',
		sender: 'newsletter@substack.com',
		body: 'Here are the latest product updates and links to this week’s posts.',
	});

	assert.equal(result.category, 'Newsletters');
	assert.equal(result.action, 'label-only');
});

test('routes ambiguous mail to review', () => {
	const result = classifyThreadForInboxSort({
		subject: 'Quick question',
		sender: 'unknown@somewhere.example',
		body: 'Can you take a look?',
	});

	assert.equal(result.category, 'Review');
	assert.equal(result.action, 'review');
});
