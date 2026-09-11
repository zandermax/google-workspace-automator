import GmailQuery from 'Gmail/GmailQuery';
import { DIGEST_SUBJECT_TEXT } from 'Gmail/digestComposer';

export const DIGEST_RECYCLE_LABEL = 'Auto-Recycle/1d';

export const labelDigestForRecycle = () => {
	const query = new GmailQuery().subject(DIGEST_SUBJECT_TEXT);
	let count = 0;

	query.processSync({
		callback: (threads) => {
			const label =
				GmailApp.getUserLabelByName(DIGEST_RECYCLE_LABEL) ??
				GmailApp.createLabel(DIGEST_RECYCLE_LABEL);

			for (const thread of threads) {
				label.addToThread(thread);
			}

			count += threads.length;
		},
	});

	Logger.log(`Labeled ${count} digest email(s) for 1-day auto-recycle.`);
};
