import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { getPendingActionCount } from '../src/Gmail/pendingActions';

test('getPendingActionCount delegates to the injected provider', () => {
	const count = getPendingActionCount({ countPending: () => 7 });
	assert.equal(count, 7);
});

test('getPendingActionCount returns zero when nothing is pending', () => {
	const count = getPendingActionCount({ countPending: () => 0 });
	assert.equal(count, 0);
});

test('getPendingActionCount throws a clear error when GmailApp is unavailable and no provider is given', () => {
	assert.throws(() => getPendingActionCount(), /GmailApp is not available/u);
});
