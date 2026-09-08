import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
	deleteOldInvites,
	dryRunDeleteOldInvites,
} from '../src/_s/Gmail/delete-old-invites';

interface MockAttachment {
	getName: () => string;
	getDataAsString: () => string;
}

interface MockMessage {
	getAttachments: () => MockAttachment[];
}

interface MockThread {
	getId: () => string;
	getFirstMessageSubject: () => string;
	getMessages: () => MockMessage[];
}

const mockAttachment = (name: string, icsContent: string): MockAttachment => ({
	getName: () => name,
	getDataAsString: () => icsContent,
});

const mockMessage = (attachments: MockAttachment[]): MockMessage => ({
	getAttachments: () => attachments,
});

const mockThread = (
	id: string,
	subject: string,
	messages: MockMessage[]
): MockThread => ({
	getId: () => id,
	getFirstMessageSubject: () => subject,
	getMessages: () => messages,
});

const pastEventIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20200101T100000Z
DTEND:20200101T110000Z
SUMMARY:Old Conference
END:VEVENT
END:VCALENDAR`;

const futureEventIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20300101T100000Z
DTEND:20300101T110000Z
SUMMARY:Future Conference
END:VEVENT
END:VCALENDAR`;

const unsupportedTzIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20200101T100000
DTEND;TZID=America/New_York:20200101T110000
SUMMARY:Named TZ Conference
END:VEVENT
END:VCALENDAR`;

const originalGmailApp = (globalThis as any).GmailApp;
const originalLogger = (globalThis as any).Logger;

test.afterEach(() => {
	if (originalGmailApp !== undefined) {
		(globalThis as any).GmailApp = originalGmailApp;
	} else {
		delete (globalThis as any).GmailApp;
	}
	if (originalLogger !== undefined) {
		(globalThis as any).Logger = originalLogger;
	} else {
		delete (globalThis as any).Logger;
	}
});

test('deleteOldInvites trashes expired thread and skips future or malformed invite threads', () => {
	const trashedThreads: string[] = [];
	const labeledThreads: { label: string; ids: string[] }[] = [];

	const pastThread = mockThread('thread-past', 'Past Conference Invitation', [
		mockMessage([mockAttachment('invite.ics', pastEventIcs)]),
	]);
	const futureThread = mockThread(
		'thread-future',
		'Future Conference Invitation',
		[mockMessage([mockAttachment('invite.ics', futureEventIcs)])]
	);
	const malformedThread = mockThread('thread-malformed', 'Broken Invitation', [
		mockMessage([
			mockAttachment(
				'broken.ics',
				'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR'
			),
		]),
	]);

	const allMockThreads = [pastThread, futureThread, malformedThread];

	(globalThis as any).GmailApp = {
		search: (_query: string, start = 0, max = 100) =>
			allMockThreads.slice(start, start + max),
		createLabel: (name: string) => ({
			getName: () => name,
			addToThreads: (threads: MockThread[]) => {
				labeledThreads.push({
					label: name,
					ids: threads.map((t) => t.getId()),
				});
			},
		}),
		moveThreadToTrash: (thread: MockThread) => {
			trashedThreads.push(thread.getId());
		},
	};

	(globalThis as any).Logger = { log: () => {} };

	const processedCount = deleteOldInvites();

	assert.equal(processedCount, 1, 'Should process exactly 1 expired thread');
	assert.deepEqual(trashedThreads, ['thread-past']);
	assert.equal(labeledThreads.length, 1);
	assert.deepEqual(labeledThreads[0].ids, ['thread-past']);
	assert.ok(labeledThreads[0].label.includes('📅'));
});

test('deleteOldInvites keeps thread when rescheduled with future invite in a later message', () => {
	const trashedThreads: string[] = [];

	// Message 0 has past event; Message 1 has updated future event
	const updatedThread = mockThread('thread-updated', 'Rescheduled Meeting', [
		mockMessage([mockAttachment('original.ics', pastEventIcs)]),
		mockMessage([mockAttachment('rescheduled.ics', futureEventIcs)]),
	]);
	const mockThreads = [updatedThread];

	(globalThis as any).GmailApp = {
		search: (_query: string, start = 0, max = 100) =>
			mockThreads.slice(start, start + max),
		createLabel: () => ({
			getName: () => 'label',
			addToThreads: () => {},
		}),
		moveThreadToTrash: (thread: MockThread) => {
			trashedThreads.push(thread.getId());
		},
	};

	(globalThis as any).Logger = { log: () => {} };

	const processedCount = deleteOldInvites();

	assert.equal(
		processedCount,
		0,
		'Must NOT delete thread with active future update'
	);
	assert.equal(trashedThreads.length, 0);
});

test('deleteOldInvites preserves thread when invite has unsupported named TZID', () => {
	const trashedThreads: string[] = [];

	const tzThread = mockThread('thread-tz', 'TZ Meeting', [
		mockMessage([mockAttachment('invite.ics', unsupportedTzIcs)]),
	]);
	const mockThreads = [tzThread];

	(globalThis as any).GmailApp = {
		search: (_query: string, start = 0, max = 100) =>
			mockThreads.slice(start, start + max),
		createLabel: () => ({
			getName: () => 'label',
			addToThreads: () => {},
		}),
		moveThreadToTrash: (thread: MockThread) => {
			trashedThreads.push(thread.getId());
		},
	};

	(globalThis as any).Logger = { log: () => {} };

	const processedCount = deleteOldInvites();

	assert.equal(processedCount, 0, 'Must fail safe on unsupported named TZID');
	assert.equal(trashedThreads.length, 0);
});

test('deleteOldInvites labels and trashes thread only once when it has multiple expired attachments across messages', () => {
	const trashedThreads: string[] = [];
	const labeledThreads: { label: string; ids: string[] }[] = [];

	const multiAttachmentThread = mockThread('thread-multi', 'Multiple Expired', [
		mockMessage([
			mockAttachment('document.pdf', 'fake pdf'),
			mockAttachment('part1.ics', pastEventIcs),
		]),
		mockMessage([mockAttachment('part2.ics', pastEventIcs)]),
	]);
	const mockThreads = [multiAttachmentThread];

	(globalThis as any).GmailApp = {
		search: (_query: string, start = 0, max = 100) =>
			mockThreads.slice(start, start + max),
		createLabel: (name: string) => ({
			getName: () => name,
			addToThreads: (threads: MockThread[]) => {
				labeledThreads.push({
					label: name,
					ids: threads.map((t) => t.getId()),
				});
			},
		}),
		moveThreadToTrash: (thread: MockThread) => {
			trashedThreads.push(thread.getId());
		},
	};

	(globalThis as any).Logger = { log: () => {} };

	const processedCount = deleteOldInvites();

	assert.equal(processedCount, 1);
	assert.deepEqual(trashedThreads, ['thread-multi']);
	assert.equal(labeledThreads.length, 1);
	assert.deepEqual(labeledThreads[0].ids, ['thread-multi']);
});

test('dryRunDeleteOldInvites calculates expired threads without performing any mutations', () => {
	const mutations: string[] = [];

	const pastThread = mockThread('thread-past', 'Past Conference', [
		mockMessage([mockAttachment('invite.ics', pastEventIcs)]),
	]);
	const futureThread = mockThread('thread-future', 'Future Conference', [
		mockMessage([mockAttachment('invite.ics', futureEventIcs)]),
	]);
	const mockThreads = [pastThread, futureThread];

	(globalThis as any).GmailApp = {
		search: (_query: string, start = 0, max = 100) =>
			mockThreads.slice(start, start + max),
		createLabel: () => {
			mutations.push('createLabel');
			return {
				getName: () => 'label',
				addToThreads: () => {
					mutations.push('addToThreads');
				},
			};
		},
		moveThreadToTrash: () => {
			mutations.push('moveThreadToTrash');
		},
	};

	(globalThis as any).Logger = { log: () => {} };

	const wouldProcess = dryRunDeleteOldInvites();

	assert.equal(
		wouldProcess,
		1,
		'Should report 1 expired thread would be processed'
	);
	assert.deepEqual(mutations, [], 'Dry run must not perform any mutations');
});
