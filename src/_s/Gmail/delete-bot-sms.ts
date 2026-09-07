import GmailQuery from 'Gmail/GmailQuery';
import { labelProcessed } from 'Gmail/actions/labelAsProcessed';

export const deleteBotSmsEmails = () => {
	const googleVoiceEmails = new GmailQuery()
		.from('voice-noreply@google.com')
		.subject('New text message from')
		.olderThan('2days');
	let count = 0;

	googleVoiceEmails.processSync({
		callback: (threads) => {
			for (const thread of threads) {
				if (
					/^New text message from \d{5}$/u.test(thread.getFirstMessageSubject())
				) {
					labelProcessed('Gmail-SMS-Bot-Recycler', thread);
					thread.moveToTrash();
					count += 1;
				}
			}
		},
	});

	Logger.log(`Processed ${count} SMS threads from bots`);
};
