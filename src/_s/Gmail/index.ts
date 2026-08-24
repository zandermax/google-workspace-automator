const driveTriggerFunctions = ['deleteOldUntitledSpreadsheets'] as const;

const gmailTriggerFunctions = [
	'deleteBotSmsEmails',
	'deleteOldInvites',
	'deleteOldPromos',
	'deleteOldUnread',
	'deleteOldUpdates',
	'dryRunSortInbox',
	'recycle',
] as const;

export type TriggerFunction = (
	typeof driveTriggerFunctions | typeof gmailTriggerFunctions
)[number];
