const driveTriggerFunctions = ['deleteOldUntitledSpreadsheets'] as const;

const gmailTriggerFunctions = [
	'aiSorter',
	'deleteBotSmsEmails',
	'deleteOldInvites',
	'deleteOldPromos',
	'deleteOldUnread',
	'deleteOldUpdates',
	'dryRunAiSorter',
	'dryRunSortInbox',
	'recycle',
] as const;

export type TriggerFunction = (
	typeof driveTriggerFunctions | typeof gmailTriggerFunctions
)[number];
