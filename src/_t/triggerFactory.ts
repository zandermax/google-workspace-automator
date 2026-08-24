import { type TriggerFunction } from '_s/Gmail';

const createTimeBasedTrigger = (
	triggerFunction: TriggerFunction,
	time: { days?: number; hours?: number; minutes?: number; weeks?: number }
) => {
	const trigger = ScriptApp.newTrigger(triggerFunction).timeBased();
	if (time.weeks) trigger.everyWeeks(time.weeks);
	if (time.days) trigger.everyDays(time.days);
	if (time.hours) trigger.everyHours(time.hours);
	if (time.minutes) trigger.everyMinutes(time.minutes);

	return trigger.create();
};

export const twiceDailyTrigger = (triggerFunction: TriggerFunction) =>
	createTimeBasedTrigger(triggerFunction, { hours: 12 });

export const dailyTrigger = (triggerFunction: TriggerFunction) =>
	createTimeBasedTrigger(triggerFunction, { days: 1 });

export const dryRunDailyTrigger = (triggerFunction: TriggerFunction) =>
	createTimeBasedTrigger(triggerFunction, { days: 1 });

export const weeklyTrigger = (triggerFunction: TriggerFunction) => {
	createTimeBasedTrigger(triggerFunction, { weeks: 1 });
};
