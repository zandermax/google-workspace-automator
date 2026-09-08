import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
	createTimeBasedTrigger,
	removeExistingTriggers,
	twiceDailyTrigger,
	dailyTrigger,
	dryRunDailyTrigger,
	weeklyTrigger,
} from '../src/_t/triggerFactory';
import { deleteOldInvitesTrigger } from '../src/_t/Gmail/delete-old-invites_trigger';
import { deleteOldUntitledSsTrigger } from '../src/_t/Drive/delete-old-untitled-ss_trigger';
import { type TriggerFunction } from '../src/_s/Gmail';

interface MockTrigger {
	id: string;
	handlerFunction: string;
	schedule: {
		weeks?: number;
		days?: number;
		hours?: number;
		minutes?: number;
	};
	getHandlerFunction: () => string;
	getUniqueId: () => string;
}

const createMockTrigger = (
	id: string,
	handlerFunction: string,
	schedule: {
		weeks?: number;
		days?: number;
		hours?: number;
		minutes?: number;
	} = {}
): MockTrigger => ({
	id,
	handlerFunction,
	schedule,
	getHandlerFunction: () => handlerFunction,
	getUniqueId: () => id,
});

const originalScriptApp = (globalThis as any).ScriptApp;
const originalLogger = (globalThis as any).Logger;

test.afterEach(() => {
	if (originalScriptApp !== undefined) {
		(globalThis as any).ScriptApp = originalScriptApp;
	} else {
		delete (globalThis as any).ScriptApp;
	}
	if (originalLogger !== undefined) {
		(globalThis as any).Logger = originalLogger;
	} else {
		delete (globalThis as any).Logger;
	}
});

const setupMockScriptApp = (initialTriggers: MockTrigger[] = []) => {
	let idCounter = 1;
	const triggers: MockTrigger[] = [...initialTriggers];
	const deletedTriggerIds: string[] = [];
	const logs: string[] = [];

	(globalThis as any).Logger = {
		log: (msg: string) => {
			logs.push(msg);
		},
	};

	(globalThis as any).ScriptApp = {
		getProjectTriggers: () => [...triggers],
		deleteTrigger: (trigger: MockTrigger) => {
			deletedTriggerIds.push(trigger.getUniqueId());
			const index = triggers.findIndex(
				(t) => t.getUniqueId() === trigger.getUniqueId()
			);
			if (index >= 0) {
				triggers.splice(index, 1);
			}
		},
		newTrigger: (functionName: string) => {
			const pendingSchedule: {
				weeks?: number;
				days?: number;
				hours?: number;
				minutes?: number;
			} = {};

			const clockBuilder = {
				everyWeeks: (weeks: number) => {
					pendingSchedule.weeks = weeks;
					return clockBuilder;
				},
				everyDays: (days: number) => {
					pendingSchedule.days = days;
					return clockBuilder;
				},
				everyHours: (hours: number) => {
					pendingSchedule.hours = hours;
					return clockBuilder;
				},
				everyMinutes: (minutes: number) => {
					pendingSchedule.minutes = minutes;
					return clockBuilder;
				},
				create: () => {
					const newTrig = createMockTrigger(
						`trig-${idCounter++}`,
						functionName,
						pendingSchedule
					);
					triggers.push(newTrig);
					return newTrig;
				},
			};

			return {
				timeBased: () => clockBuilder,
			};
		},
	};

	return {
		triggers,
		deletedTriggerIds,
		logs,
	};
};

test('twiceDailyTrigger installs a trigger when none exists', () => {
	const env = setupMockScriptApp();

	const created = twiceDailyTrigger('deleteOldInvites');

	assert.equal(env.triggers.length, 1);
	assert.equal(env.triggers[0].getHandlerFunction(), 'deleteOldInvites');
	assert.deepEqual(env.triggers[0].schedule, { hours: 12 });
	assert.equal(created.getUniqueId(), env.triggers[0].getUniqueId());
	assert.ok(
		env.logs.some((l) => l.includes('Created trigger for deleteOldInvites'))
	);
});

test('re-running twiceDailyTrigger replaces existing trigger without creating duplicates', () => {
	const initial = createMockTrigger('existing-1', 'deleteOldInvites', {
		hours: 12,
	});
	const env = setupMockScriptApp([initial]);

	const created = twiceDailyTrigger('deleteOldInvites');

	assert.equal(env.triggers.length, 1, 'Should keep only 1 trigger');
	assert.equal(env.deletedTriggerIds.length, 1);
	assert.equal(env.deletedTriggerIds[0], 'existing-1');
	assert.equal(created.getHandlerFunction(), 'deleteOldInvites');
	assert.notEqual(created.getUniqueId(), 'existing-1');
	assert.ok(
		env.logs.some((l) =>
			l.includes('Removed 1 existing trigger(s) for deleteOldInvites')
		)
	);
});

test('repeated installation preserves unrelated triggers for other handlers', () => {
	const unrelated1 = createMockTrigger('unrelated-1', 'deleteBotSmsEmails', {
		hours: 12,
	});
	const unrelated2 = createMockTrigger('unrelated-2', 'recycle', { hours: 12 });
	const env = setupMockScriptApp([unrelated1, unrelated2]);

	twiceDailyTrigger('deleteOldInvites');

	assert.equal(env.triggers.length, 3);
	assert.ok(
		env.triggers.some((t) => t.getHandlerFunction() === 'deleteBotSmsEmails')
	);
	assert.ok(env.triggers.some((t) => t.getHandlerFunction() === 'recycle'));
	assert.ok(
		env.triggers.some((t) => t.getHandlerFunction() === 'deleteOldInvites')
	);
	assert.deepEqual(env.deletedTriggerIds, []);

	// Re-run for deleteOldInvites
	twiceDailyTrigger('deleteOldInvites');

	assert.equal(env.triggers.length, 3, 'Should still have exactly 3 triggers');
	assert.equal(env.deletedTriggerIds.length, 1);
	assert.equal(
		env.triggers.filter((t) => t.getHandlerFunction() === 'deleteOldInvites')
			.length,
		1
	);
});

test('removes multiple duplicate triggers if they previously accumulated', () => {
	const dup1 = createMockTrigger('dup-1', 'deleteOldPromos', { hours: 12 });
	const dup2 = createMockTrigger('dup-2', 'deleteOldPromos', { hours: 12 });
	const dup3 = createMockTrigger('dup-3', 'deleteOldPromos', { hours: 12 });
	const env = setupMockScriptApp([dup1, dup2, dup3]);

	const created = twiceDailyTrigger('deleteOldPromos');

	assert.equal(env.triggers.length, 1);
	assert.equal(env.deletedTriggerIds.length, 3);
	assert.deepEqual(env.deletedTriggerIds, ['dup-1', 'dup-2', 'dup-3']);
	assert.equal(created.getHandlerFunction(), 'deleteOldPromos');
	assert.ok(
		env.logs.some((l) =>
			l.includes('Removed 3 existing trigger(s) for deleteOldPromos')
		)
	);
});

test('supports schedule helpers: dailyTrigger, dryRunDailyTrigger, weeklyTrigger', () => {
	const env = setupMockScriptApp();

	const daily = dailyTrigger('deleteOldUnread');
	assert.deepEqual(daily.schedule, { days: 1 });

	const dryRun = dryRunDailyTrigger('dryRunSortInbox');
	assert.deepEqual(dryRun.schedule, { days: 1 });

	const weekly = weeklyTrigger('deleteOldUpdates');
	assert.deepEqual(weekly?.schedule, { weeks: 1 });

	assert.equal(env.triggers.length, 3);
});

test('wrapper functions deleteOldInvitesTrigger and deleteOldUntitledSsTrigger install idempotently', () => {
	const env = setupMockScriptApp();

	deleteOldInvitesTrigger();
	deleteOldInvitesTrigger();
	deleteOldUntitledSsTrigger();
	deleteOldUntitledSsTrigger();

	assert.equal(env.triggers.length, 2);
	assert.equal(
		env.triggers.filter((t) => t.getHandlerFunction() === 'deleteOldInvites')
			.length,
		1
	);
	assert.equal(
		env.triggers.filter(
			(t) => t.getHandlerFunction() === 'deleteOldUntitledSpreadsheets'
		).length,
		1
	);
});

test('logs error and rethrows if ScriptApp fails during trigger creation', () => {
	setupMockScriptApp();

	(globalThis as any).ScriptApp.getProjectTriggers = () => {
		throw new Error('Service invoked too many times: ScriptApp');
	};

	assert.throws(
		() => twiceDailyTrigger('deleteOldInvites'),
		/Service invoked too many times: ScriptApp/
	);
});
