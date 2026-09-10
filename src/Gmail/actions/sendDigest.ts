import {
	type DailyDigestData,
} from '@/types/Gmail/triage';
import { escapeHtml } from '../../helpers/html';
import {
	composeDigestBody,
	composeDigestSubject,
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

const resolveRecipient = (explicitRecipient?: string): string => {
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

	const htmlBody = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, monospace; white-space: pre-wrap; font-size: 13px; line-height: 1.5;">${escapeHtml(body)}</div>`;

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
