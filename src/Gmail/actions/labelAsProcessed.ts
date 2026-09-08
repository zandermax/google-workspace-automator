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

/**
 * Neat icons to add to labels
 */
const scriptEmoji: Record<SourceScript, string> = {
	'Gmail-AI-Sorter': '🧠',
	'Gmail-Autorecycle': '♻️',
	'Gmail-Old-Invites': '📅',
	'Gmail-Old-Promos': '🤑',
	'Gmail-Old-Unread': '🫥',
	'Gmail-Old-Updates': '👋',
	'Gmail-SMS-Bot-Recycler': '🤖📱',
};

/**
 * Mark one or more threads as processed by a script (in the form of a label)
 *
 * @param sourceScript the script that processed the thread(s)
 * @param threads thread(s) to mark as processed
 */
export const labelProcessed = (
	sourceScript: SourceScript,
	threads:
		GoogleAppsScript.Gmail.GmailThread | GoogleAppsScript.Gmail.GmailThread[]
) => {
	const threadsToProcess = Array.isArray(threads) ? threads : [threads];
	const label = GmailApp.createLabel(
		`🪄✨ Magic ✨🪄/${scriptEmoji[sourceScript]}`
	);
	label.addToThreads(threadsToProcess);
	Logger.log(
		`Processed ${
			threadsToProcess.length
		} threads, using label ${label.getName()}`
	);
};
