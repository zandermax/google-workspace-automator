import GmailQuery from 'Gmail/GmailQuery';
import { labelProcessed } from 'Gmail/actions/labelAsProcessed';

export const deleteOldPromos = () => {
	const query = new GmailQuery()
		.category('promotions')
		.isNot('starred')
		.olderThan('15days')
		.isNot('read');
	let count = 0;

	query.processSync({
		callback: (threads) => {
			count += threads.length;
			labelProcessed('Gmail-Old-Promos', threads);
			GmailApp.moveThreadsToTrash(threads);
		},
	});

	Logger.log(`Processed ${count} old promos`);
};
