import { type TriggerFunction } from '_s/Gmail';

export const removeExistingTriggers = (
	triggerFunction: TriggerFunction
): number => {
	const existingTriggers = ScriptApp.getProjectTriggers();
	let deletedCount = 0;

	for (const trigger of existingTriggers) {
		if (trigger.getHandlerFunction() === triggerFunction) {
			ScriptApp.deleteTrigger(trigger);
			deletedCount += 1;
		}
	}

	if (deletedCount > 0) {
		Logger.log(
			`Removed ${deletedCount} existing trigger(s) for ${triggerFunction}`
		);
	}

	return deletedCount;
};

export const createTimeBasedTrigger = (
	triggerFunction: TriggerFunction,
	time: { days?: number; hours?: number; minutes?: number; weeks?: number; atHour?: number }
) => {
	try {
		removeExistingTriggers(triggerFunction);

		const trigger = ScriptApp.newTrigger(triggerFunction).timeBased();
		if (time.weeks) trigger.everyWeeks(time.weeks);
		if (time.days) trigger.everyDays(time.days);
		if (time.hours) trigger.everyHours(time.hours);
		if (time.minutes) trigger.everyMinutes(time.minutes);
		if (time.atHour !== undefined) {
			if (!time.days && !time.weeks) {
				trigger.everyDays(1);
			}
			trigger.atHour(time.atHour);
		}

		const created = trigger.create();
		Logger.log(`Created trigger for ${triggerFunction}`);
		return created;
	} catch (error) {
		Logger.log(
			`Failed to create trigger for ${triggerFunction}: ${(error as Error).message}`
		);
		throw error;
	}
};

export const twiceDailyTrigger = (triggerFunction: TriggerFunction) =>
	createTimeBasedTrigger(triggerFunction, { hours: 12 });

export const dailyTrigger = (triggerFunction: TriggerFunction) =>
	createTimeBasedTrigger(triggerFunction, { days: 1 });

export const dailyAtHourTrigger = (
	triggerFunction: TriggerFunction,
	hour: number
) => createTimeBasedTrigger(triggerFunction, { days: 1, atHour: hour });

export const dryRunDailyTrigger = (triggerFunction: TriggerFunction) =>
	createTimeBasedTrigger(triggerFunction, { days: 1 });

export const weeklyTrigger = (triggerFunction: TriggerFunction) =>
	createTimeBasedTrigger(triggerFunction, { weeks: 1 });
