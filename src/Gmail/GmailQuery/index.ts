import Query from 'common/Query';
import { makeArray } from '../../helpers/array';
import { add0, getDateQuery } from './utils';
import {
	type GmailLabel,
	type GmailLocation,
	type Mark,
	type HasType,
	type Category,
	type Status,
} from '@/types/Gmail';
import { type TimePeriod } from '@/types/Gmail/dateAndTime';

type GmailSearch = (query: string, start?: number, max?: number) => unknown[];

const getGmailSearch = (): GmailSearch => {
	const gmailApp = globalThis as typeof globalThis & {
		GmailApp?: { search: GmailSearch };
	};
	const search = gmailApp.GmailApp?.search;

	if (typeof search !== 'function') {
		throw new Error('GmailApp.search is not available in this runtime.');
	}

	return search;
};

// Same order as https://support.google.com/mail/answer/7190?hl=en

export default class GmailQuery extends Query<GmailSearch> {
	public constructor(startQuery?: string) {
		super(getGmailSearch(), startQuery);
	}

	/**
	 * Specify the sender
	 *
	 * @param sender sender(s) to use in the query
	 */
	public readonly from = (sender: string[] | string) => {
		const senders = makeArray(sender);
		this.query += ` from:(${senders.join(' ')})`;
		return this;
	};

	/**
	 * Specify a recipient
	 *
	 * @param recipient recipient(s) to use in the query
	 */
	public readonly to = (recipient: string[] | string) => {
		const recipients = makeArray(recipient);
		this.query += ` to:(${recipients.join(' ')})`;
		return this;
	};

	/**
	 * Specify a recipient who received a copy
	 *
	 * @param recipient recipient(s) to use in the query
	 */
	public readonly cc = (recipient: string[] | string) => {
		const recipients = makeArray(recipient);
		this.query += ` cc:(${recipients.join(' ')})`;
		return this;
	};

	/**
	 * Specify a recipient who received a copy
	 *
	 * @param recipient recipient(s) to use in the query
	 */
	public readonly bcc = (recipient: string[] | string) => {
		const recipients = makeArray(recipient);
		this.query += ` bcc:(${recipients.join(' ')})`;
		return this;
	};

	/**
	 * Words in the subject line
	 *
	 * @param subject subject(s) to use in the query
	 */
	public readonly subject = (subject: string[] | string) => {
		const subjects = makeArray(subject);
		this.query += ` subject:"${subjects.join(' ')}"`;
		return this;
	};

	/**
	 * Messages that match multiple terms
	 *
	 * @param strings strings to group together in the query
	 */
	public readonly OR = (...strings: string[]) => {
		this.query += ` {${strings.join(' ')}}`;
		return this;
	};

	/**
	 * Negate part of the query
	 *
	 * @param strings strings to negate in the query
	 */
	public readonly NOT = (...strings: string[]) => {
		this.query += `${strings.map((string_) => `-${string_}`).join(' ')}`;
		return this;
	};

	/**
	 * Find messages with words near each other. Use the number to say how many words apart the words can
	 * be.
	 * Add quotes to find messages in which the word you put first stays first.
	 */
	public readonly around = (firstString: string, secondString: string) => {
		this.query += `${firstString} AROUND ${secondString}`;
		return this;
	};

	/**
	 * Messages that have a certain label
	 *
	 * @param label label(s) to use in the query
	 */
	public readonly label = (label: GmailLabel | GmailLabel[]) => {
		const labels = makeArray(label);
		this.query += ` label:(${labels.join(' ')})`;
		return this;
	};

	/**
	 * Messages that have a certain label
	 *
	 * @param type type(s) to use in the query
	 */
	public readonly has = (type: HasType | HasType[]) => {
		const types = makeArray(type);
		this.query += types.map((typeValue) => ` has:${typeValue}`).join('');
		return this;
	};

	/**
	 * Helper method for stars
	 *
	 * @param mark type(s) of mark / star to use in the query
	 */
	public readonly hasMark = (mark: Mark | Mark[]) => this.has(mark);

	/**
	 * Messages from a mailing list
	 *
	 * @param list list to use in the query
	 */
	public readonly mailingList = (list: string) => {
		this.query += ` list:${list}`;
		return this;
	};

	/**
	 * Attachments with a certain name or file type
	 *
	 * @param filename name of file to query for
	 */
	public readonly fileName = (filename: string) => {
		this.query += ` filename:${filename}`;
		return this;
	};

	/**
	 * Messages in any folder, including Spam and Trash
	 *
	 * @param location location(s) to use in query, may also be a label
	 */
	public readonly in = (location: GmailLocation | GmailLocation[]) => {
		const locations = makeArray(location);
		this.query += ` in:(${locations.join(' ')})`;
		return this;
	};

	/**
	 * Starred, snoozed, unread, or read messages
	 *
	 * @param status status to query for
	 */
	public readonly is = (status: Status) => {
		this.query += ` is:${status}`;
		return this;
	};

	/**
	 * Not starred, snoozed, unread, or read messages
	 *
	 * @param status status(es) to filter threads by (i.e. threads that are not this status will be
	 * returned)
	 */
	public readonly isNot = (status: Status | Status[]) => {
		const statuses = makeArray(status);
		this.query += statuses.map((stat) => ` NOT is:${stat}`).join('');
		return this;
	};

	/**
	 * Not starred, snoozed, unread, or read messages
	 *
	 * @param location location(s) to filter threads by (i.e. threads that are not this location will be
	 * returned)
	 */
	public readonly isNotIn = (location: GmailLocation | GmailLocation[]) => {
		const locations = makeArray(location);
		this.query += locations.map((loc) => ` NOT in:${loc}`).join('');
		return this;
	};

	/**
	 * Search for messages sent after a certain time period
	 *
	 * @param date to search for messages that were sent after
	 * @param date.year year to use for search - default is this year
	 * @param date.month month to use for search
	 * @param date.day day to use for search
	 */
	public readonly after = (date: Date) => {
		this.query += ` after:${date.getUTCFullYear()}/${add0(date.getUTCMonth() + 1)}/${add0(
			date.getUTCDate()
		)}`;
		return this;
	};

	/**
	 * Search for messages sent before a certain time period
	 *
	 * @param date to search for messages that were sent before
	 * @param date.year year to use for search - default is this year
	 * @param date.month month to use for search
	 * @param date.day day to use for search
	 */
	public readonly before = (date: Date) => {
		this.query += ` before:${date.getUTCFullYear()}/${add0(date.getUTCMonth() + 1)}/${add0(
			date.getUTCDate()
		)}`;
		return this;
	};

	/**
	 * Search for messages older or newer than a time period
	 *
	 * @param timePeriod time to search for messages older than
	 */
	public readonly olderThan = (timePeriod: TimePeriod) => {
		this.query += ` older_than:${getDateQuery(timePeriod)}`;
		return this;
	};

	/**
	 * Search for messages older or newer than a time period
	 *
	 * @param timePeriod time to search for messages newer than
	 */
	public readonly newerThan = (timePeriod: TimePeriod) => {
		this.query += ` newer_than:${getDateQuery(timePeriod)}`;
		return this;
	};

	/**
	 * Messages in a certain category
	 */
	public readonly category = (category: Category | Category[]) => {
		const categories = makeArray(category);
		this.query += categories.map((cat) => ` category:${cat}`).join('');
		return this;
	};

	/**
	 * Messages larger than a certain size in bytes
	 */
	public readonly size = (largerThanInBytes: number) => {
		this.query = ` size:${largerThanInBytes}`;
		return this;
	};

	/**
	 * Messages larger than a certain size in bytes
	 *
	 * @example largerThan("10M"), largerThan(1000000)
	 */
	public readonly larger = (largerThanInBytes: number | `${number}M`) => {
		this.query = ` larger:${largerThanInBytes}`;
		return this;
	};

	/**
	 * Messages smaller than a certain size in bytes
	 *
	 * @example smallerThan("10M"), smallerThan(1000000)
	 */
	public readonly smaller = (smallerThanInBytes: number | `${number}M`) => {
		this.query = ` smaller:${smallerThanInBytes}`;
		return this;
	};

	/**
	 * Messages that have a label
	 */
	public readonly hasLabels = () => {
		this.query += ' has:userlabels';
		return this;
	};

	/**
	 * Messages that don't have a label
	 */
	public readonly hasNoLabels = () => {
		this.query += ' has:nouserlabels';
		return this;
	};

	/**
	 * Messages with a certain message-id header
	 */
	public readonly Rfc822msgid = (...headers: string[]) => {
		this.query += headers.map((header) => ` rfc822msgid:${header}`).join('');
		return this;
	};

	/**
	 * Results that match a word exactly
	 *
	 * @param word word(s) to search for exactly in the query
	 */
	public readonly exactWord = (word: string[] | string) => {
		const words = makeArray(word);
		this.query = words.map((nextWord) => ` +${nextWord}`).join('');
		return this;
	};

	// ************************************************************************** //
	// *************************** Execution functions ************************** //
	// ************************************************************************** //

	public *[Symbol.iterator]() {
		let start = 0;
		const maxResults = 100;
		let results = this.search(
			this.query,
			start,
			maxResults
		) as ReturnType<GmailSearch>;

		while (results.length) {
			yield results;
			start += maxResults;
			results = this.search(
				this.query,
				start,
				maxResults
			) as ReturnType<GmailSearch>;
		}
	}
}
