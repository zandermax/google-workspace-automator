import GmailQuery from 'Gmail/GmailQuery';
import { labelProcessed } from 'Gmail/actions/labelAsProcessed';

export const deleteOldUpdates = () => {
	const query = new GmailQuery()
		.category('updates')
		.isNot('starred')
		.olderThan('15days')
		.isNot('read');
	let count = 0;

	query.processSync({
		callback: (threads) => {
			count += threads.length;
			labelProcessed('Gmail-Old-Updates', threads);
			GmailApp.moveThreadsToTrash(threads);
		},
	});

	Logger.log(`Processed ${count} old updates`);
};
