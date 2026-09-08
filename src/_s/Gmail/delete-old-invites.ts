import GmailQuery from '../../Gmail/GmailQuery';
import { labelProcessed } from '../../Gmail/actions/labelAsProcessed';

export const getInviteExpiration = (icsContent: string, now = new Date()) => {
	const unfoldedIcsContent = icsContent.replace(/\r?\n[ \t]/gu, '');

	// Supported formats:
	// 1. Explicit UTC date-time ending with 'Z' (e.g. DTEND:20260901T110000Z or DTEND;...:20260901T110000Z)
	const utcDateTimeMatch =
		/^DTEND(?:;[^:]*)?:([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z$/mu.exec(
			unfoldedIcsContent
		);
	if (utcDateTimeMatch) {
		const eventEnd = new Date(
			Date.UTC(
				Number(utcDateTimeMatch[1]),
				Number(utcDateTimeMatch[2]) - 1,
				Number(utcDateTimeMatch[3]),
				Number(utcDateTimeMatch[4]),
				Number(utcDateTimeMatch[5]),
				Number(utcDateTimeMatch[6])
			)
		);
		return { eventEnd, isExpired: eventEnd < now };
	}

	// 2. Date-only values (e.g. DTEND;VALUE=DATE:20260901 or DTEND:20260901)
	// In ICS (RFC 5545), date-only DTEND is end-exclusive at 00:00:00 UTC
	const dateOnlyMatch =
		/^DTEND(?:;VALUE=DATE)?:([0-9]{4})([0-9]{2})([0-9]{2})$/mu.exec(
			unfoldedIcsContent
		);
	if (dateOnlyMatch) {
		const eventEnd = new Date(
			Date.UTC(
				Number(dateOnlyMatch[1]),
				Number(dateOnlyMatch[2]) - 1,
				Number(dateOnlyMatch[3]),
				0,
				0,
				0
			)
		);
		return { eventEnd, isExpired: eventEnd < now };
	}

	// Named local time zones (e.g. DTEND;TZID=America/New_York:...) and floating local
	// date-times without 'Z' are explicitly unsupported and return null to fail safe
	// rather than silently misinterpreting them as UTC.
	return null;
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

	const query = new GmailQuery().fileName('.ics').in('inbox');
	query.processSync({
		callback: (invitationThreads) => {
			for (const thread of invitationThreads) {
				const messages = thread.getMessages() ?? [];
				let hasIcs = false;
				let hasExpired = false;
				let hasActiveOrUnsupported = false;

				for (const message of messages) {
					const attachments = message.getAttachments() ?? [];
					for (const attachment of attachments) {
						if (!attachment.getName().endsWith('.ics')) {
							continue;
						}

						hasIcs = true;
						Logger.log(
							`Found message containing invite with subject "${thread.getFirstMessageSubject()}"`
						);

						const icsContent = attachment.getDataAsString();
						const inviteExpiration = getInviteExpiration(icsContent, now);

						if (!inviteExpiration) {
							hasActiveOrUnsupported = true;
							continue;
						}

						if (inviteExpiration.isExpired) {
							hasExpired = true;
						} else {
							hasActiveOrUnsupported = true;
						}
					}
				}

				if (
					hasIcs &&
					hasExpired &&
					!hasActiveOrUnsupported &&
					markThreadForProcessing(processedThreadIds, thread.getId())
				) {
					labelProcessed('Gmail-Old-Invites', thread);
					GmailApp.moveThreadToTrash(thread);
					count += 1;
				}
			}
		},
	});

	Logger.log(`Processed ${count} threads with out-of-date invites`);
	return count;
};

export const dryRunDeleteOldInvites = () => {
	const now = new Date();
	const processedThreadIds = new Set<string>();
	let candidateCount = 0;
	let expiredThreadCount = 0;

	Logger.log(
		'Dry-run deleteOldInvites started; no Gmail mutations will be applied.'
	);

	const query = new GmailQuery().fileName('.ics').in('inbox');
	query.processSync({
		callback: (invitationThreads) => {
			for (const thread of invitationThreads) {
				const messages = thread.getMessages() ?? [];
				let hasIcs = false;
				let hasExpired = false;
				let hasActiveOrUnsupported = false;

				for (const message of messages) {
					const attachments = message.getAttachments() ?? [];
					for (const attachment of attachments) {
						if (!attachment.getName().endsWith('.ics')) {
							continue;
						}

						candidateCount += 1;
						hasIcs = true;
						const icsContent = attachment.getDataAsString();
						const inviteExpiration = getInviteExpiration(icsContent, now);

						if (!inviteExpiration) {
							hasActiveOrUnsupported = true;
							Logger.log(
								`Dry-run: would skip invite with unparseable end date; subject "${thread.getFirstMessageSubject()}", attachment "${attachment.getName()}"`
							);
							continue;
						}

						if (inviteExpiration.isExpired) {
							hasExpired = true;
						} else {
							hasActiveOrUnsupported = true;
						}

						Logger.log(
							`Dry-run: ${
								inviteExpiration.isExpired ? 'would trash' : 'would keep'
							} invite; subject "${thread.getFirstMessageSubject()}", attachment "${attachment.getName()}", event end ${inviteExpiration.eventEnd.toISOString()}`
						);
					}
				}

				if (
					hasIcs &&
					hasExpired &&
					!hasActiveOrUnsupported &&
					markThreadForProcessing(processedThreadIds, thread.getId())
				) {
					expiredThreadCount += 1;
				}
			}
		},
	});

	Logger.log(
		`Dry-run deleteOldInvites complete: ${expiredThreadCount} expired invite threads would be processed out of ${candidateCount} .ics attachments scanned.`
	);
	return expiredThreadCount;
};
