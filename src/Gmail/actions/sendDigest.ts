import {
	type DailyDigestData,
} from '@/types/Gmail/triage';
import {
	composeDigestBody,
	composeDigestHtml,
	composeDigestSubject,
	composeBacklogOnlyDigestBody,
	composeBacklogOnlyDigestHtml,
	composeBacklogOnlyDigestSubject,
} from '../digestComposer';

export interface EmailSender {
	sendEmail(
		recipient: string,
		subject: string,
		body: string,
		options?: { htmlBody?: string }
	): void;
}

export interface SendDigestOptions {
	recipient?: string;
	emailSender?: EmailSender;
}

export interface SendDigestResult {
	recipient: string;
	subject: string;
	body: string;
}

const defaultEmailSender: EmailSender = {
	sendEmail(
		recipient: string,
		subject: string,
		body: string,
		options?: { htmlBody?: string }
	): void {
		if (typeof GmailApp === 'undefined' || !GmailApp.sendEmail) {
			throw new Error('GmailApp is not available in this environment.');
		}
		GmailApp.sendEmail(recipient, subject, body, options);
	},
};

export const resolveRecipient = (explicitRecipient?: string): string => {
	if (explicitRecipient) {
		return explicitRecipient;
	}

	if (
		typeof Session !== 'undefined' &&
		Session.getActiveUser &&
		Session.getActiveUser().getEmail
	) {
		const email = Session.getActiveUser().getEmail();
		if (email) {
			return email;
		}
	}

	throw new Error(
		'Could not resolve recipient email address from Session.getActiveUser(). Please provide an explicit recipient.'
	);
};

export const sendDigest = (
	data: DailyDigestData,
	options: SendDigestOptions = {}
): SendDigestResult => {
	const recipient = resolveRecipient(options.recipient);
	const subject = composeDigestSubject(data.date, data.isDryRun);
	const body = composeDigestBody(data);
	const sender = options.emailSender ?? defaultEmailSender;

	const htmlBody = composeDigestHtml(data);

	sender.sendEmail(recipient, subject, body, { htmlBody });

	if (typeof Logger !== 'undefined') {
		Logger.log(`Sent daily email digest to ${recipient}: "${subject}"`);
	}

	return {
		recipient,
		subject,
		body,
	};
};

export interface SendBacklogOnlyDigestOptions extends SendDigestOptions {
	date?: Date;
	isDryRun?: boolean;
}

export interface SendBacklogOnlyDigestResult {
	recipient: string;
	subject: string;
	body: string;
}

export const sendBacklogOnlyDigest = (
	pendingCount: number,
	actionsPageUrl: string,
	options: SendBacklogOnlyDigestOptions = {}
): SendBacklogOnlyDigestResult => {
	const recipient = resolveRecipient(options.recipient);
	const date = options.date ?? new Date();
	const isDryRun = options.isDryRun ?? false;
	const subject = composeBacklogOnlyDigestSubject(date, pendingCount, isDryRun);
	const body = composeBacklogOnlyDigestBody(pendingCount, actionsPageUrl);
	const htmlBody = composeBacklogOnlyDigestHtml(pendingCount, actionsPageUrl);
	const sender = options.emailSender ?? defaultEmailSender;

	sender.sendEmail(recipient, subject, body, { htmlBody });

	if (typeof Logger !== 'undefined') {
		Logger.log(`Sent backlog-only digest to ${recipient}: "${subject}"`);
	}

	return { recipient, subject, body };
};
