const SOURCE_SCRIPTS = [
	'Gmail-AI-Sorter',
	'Gmail-Autorecycle',
	'Gmail-Old-Invites',
	'Gmail-Old-Promos',
	'Gmail-Old-Unread',
	'Gmail-Old-Updates',
	'Gmail-SMS-Bot-Recycler',
] as const;
export type SourceScript = (typeof SOURCE_SCRIPTS)[number];

export const MAGIC_LABEL = '🪄✨ Magic ✨🪄';

/**
 * Mark one or more threads as processed by a script (in the form of a label)
 *
 * @param _sourceScript the script that processed the thread(s) (preserved for caller compatibility)
 * @param threads thread(s) to mark as processed
 */
export const labelProcessed = (
	_sourceScript: SourceScript,
	threads:
		GoogleAppsScript.Gmail.GmailThread | GoogleAppsScript.Gmail.GmailThread[]
) => {
	const threadsToProcess = Array.isArray(threads) ? threads : [threads];
	const label = GmailApp.createLabel(MAGIC_LABEL);
	label.addToThreads(threadsToProcess);
	Logger.log(
		`Processed ${threadsToProcess.length} threads, using label ${label.getName()}`
	);
};
