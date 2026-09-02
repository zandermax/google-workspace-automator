import GmailQuery from '../../Gmail/GmailQuery';
import { labelProcessed } from '../../Gmail/actions/labelAsProcessed';

export const getInviteExpiration = (icsContent: string, now = new Date()) => {
	const unfoldedIcsContent = icsContent.replace(/\r?\n[ \t]/gu, '');
	const dateReference =
		// Supports UTC, local-time, and all-day ICS DTEND properties.
		/^DTEND(?:;[^:]*)?:([0-9]{4})([0-9]{2})([0-9]{2})(?:T([0-9]{2})([0-9]{2})([0-9]{2})(Z)?)?$/mu.exec(
			unfoldedIcsContent
		);
	if (!dateReference) {
		return null;
	}

	const eventEnd = new Date(
		Date.UTC(
			Number(dateReference[1]),
			Number(dateReference[2]) - 1,
			Number(dateReference[3]),
			Number(dateReference[4] ?? 0),
			Number(dateReference[5] ?? 0),
			Number(dateReference[6] ?? 0)
		)
	);

	return { eventEnd, isExpired: eventEnd < now };
};

export const markThreadForProcessing = (
	processedThreadIds: Set<string>,
	threadId: string
) => {
	if (processedThreadIds.has(threadId)) {
		return false;
	}

	processedThreadIds.add(threadId);
	return true;
};

export const deleteOldInvites = () => {
	const now = new Date();
	const processedThreadIds = new Set<string>();
	let count = 0;

	for (const invitationThreads of new GmailQuery()
		.fileName('.ics')
		.in('inbox')) {
		for (const thread of invitationThreads) {
			const attachments = thread.getMessages()?.[0]?.getAttachments();
			if (!attachments) continue;

			for (const attachment of attachments) {
				if (!attachment.getName().endsWith('.ics')) {
					continue;
				}

				Logger.log(
					`Found message containing invite with subject "${thread.getFirstMessageSubject()}"`
				);

				// Use ICS format to get invitation date
				const icsContent = attachment.getDataAsString();
				const inviteExpiration = getInviteExpiration(icsContent, now);
				if (!inviteExpiration) {
					continue;
				}

				// I'd want to process these in batches, but I don't really get many invites in Gmail
				if (
					inviteExpiration.isExpired &&
					markThreadForProcessing(processedThreadIds, thread.getId())
				) {
					labelProcessed('Gmail-Old-Invites', thread);
					GmailApp.moveThreadToTrash(thread);
					count += 1;
				}
			}
		}
	}

	Logger.log(`Processed ${count} threads with out-of-date invites`);
	return count;
};

export const dryRunDeleteOldInvites = () => {
	const now = new Date();
	const processedThreadIds = new Set<string>();
	let candidateCount = 0;
	let expiredThreadCount = 0;

	Logger.log('Dry-run deleteOldInvites started; no Gmail mutations will be applied.');

	for (const invitationThreads of new GmailQuery().fileName('.ics').in('inbox')) {
		for (const thread of invitationThreads) {
			const attachments = thread.getMessages()?.[0]?.getAttachments();
			if (!attachments) continue;

			for (const attachment of attachments) {
				if (!attachment.getName().endsWith('.ics')) {
					continue;
				}

				candidateCount += 1;
				const inviteExpiration = getInviteExpiration(
					attachment.getDataAsString(),
					now
				);

				if (!inviteExpiration) {
					Logger.log(
						`Dry-run: would skip invite with unparseable end date; subject "${thread.getFirstMessageSubject()}", attachment "${attachment.getName()}"`
					);
					continue;
				}

				if (
					inviteExpiration.isExpired &&
					markThreadForProcessing(processedThreadIds, thread.getId())
				) {
					expiredThreadCount += 1;
				}

				Logger.log(
					`Dry-run: ${
						inviteExpiration.isExpired ? 'would trash' : 'would keep'
					} invite; subject "${thread.getFirstMessageSubject()}", attachment "${attachment.getName()}", event end ${inviteExpiration.eventEnd.toISOString()}`
				);
			}
		}
	}

	Logger.log(
		`Dry-run deleteOldInvites complete: ${expiredThreadCount} expired invite threads would be processed out of ${candidateCount} .ics attachments scanned.`
	);
	return expiredThreadCount;
};
