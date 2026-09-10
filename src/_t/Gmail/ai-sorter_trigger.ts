import { dailyAtHourTrigger, dryRunDailyTrigger } from '../triggerFactory';

export const aiSorterTrigger = () => dailyAtHourTrigger('aiSorter', 6);

export const dryRunAiSorterTrigger = () => dryRunDailyTrigger('dryRunAiSorter');
