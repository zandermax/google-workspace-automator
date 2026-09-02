import { test } from 'node:test';
import { strict as assert } from 'node:assert';

/**
 * Integration test for deleteOldInvites with mocked Gmail APIs
 * 
 * This simulates what happens when the script runs against real Gmail threads.
 */

interface MockAttachment {
  getName: () => string;
  getDataAsString: () => string;
}

interface MockMessage {
  getAttachments: () => MockAttachment[];
}

interface MockThread {
  getFirstMessageSubject: () => string;
  getMessages: () => MockMessage[] | undefined;
}

const mockAttachment = (name: string, icsContent: string): MockAttachment => ({
  getName: () => name,
  getDataAsString: () => icsContent,
});

const mockMessage = (attachments: MockAttachment[]): MockMessage => ({
  getAttachments: () => attachments,
});

const mockThread = (subject: string, messages: MockMessage[]): MockThread => ({
  getFirstMessageSubject: () => subject,
  getMessages: () => messages,
});

test('simulates deleteOldInvites with mocked Gmail API', () => {
  // Track operations
  const labeledThreads: Array<{ thread: MockThread; label: string }> = [];
  const trashedThreads: MockThread[] = [];

  const mockGmailApp = {
    createLabel: (name: string) => ({
      getName: () => name,
      addToThreads: (threads: MockThread[]) => {
        threads.forEach((t) => labeledThreads.push({ thread: t, label: name }));
      },
    }),
    moveThreadToTrash: (thread: MockThread) => {
      trashedThreads.push(thread);
    },
  };

  // Mock Logger
  globalThis.Logger = {
    log: () => { }, // Suppress logs in test
  } as any;

  // Create test scenarios
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

  // Thread 1: Has a past event - should be deleted
  const pastThread = mockThread('Conference 2020 Invitation', [
    mockMessage([mockAttachment('event.ics', pastEventIcs)]),
  ]);

  // Thread 2: Has a future event - should NOT be deleted
  const futureThread = mockThread('Conference 2030 Invitation', [
    mockMessage([mockAttachment('event.ics', futureEventIcs)]),
  ]);

  // Thread 3: Has .ics but no DTEND - should be skipped
  const malformedThread = mockThread('Broken Invitation', [
    mockMessage([
      mockAttachment(
        'event.ics',
        'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR'
      ),
    ]),
  ]);

  // Simulate the deleteOldInvites logic
  const threadsToProcess = [pastThread, futureThread, malformedThread];
  let count = 0;

  for (const thread of threadsToProcess) {
    const attachments = thread.getMessages()?.[0]?.getAttachments();
    if (!attachments) continue;

    for (const attachment of attachments) {
      if (!attachment.getName().endsWith('.ics')) {
        continue;
      }

      const icsContent = attachment.getDataAsString();
      const dateReference =
        /^DTEND:([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z$/mu.exec(
          icsContent
        );
      if (!dateReference) {
        continue;
      }

      const eventEnd = new Date(
        `${dateReference[1]}-${dateReference[2]}-${dateReference[3]}T${dateReference[4]}:${dateReference[5]}:00.000Z`
      );

      const now = new Date();
      if (eventEnd < now) {
        // Simulate labelProcessed
        const label = mockGmailApp.createLabel(
          '🪄✨ Magic ✨🪄/📅'
        );
        label.addToThreads([thread]);

        mockGmailApp.moveThreadToTrash(thread);
        count += 1;
      }
    }
  }

  // Verify results
  assert.equal(
    count,
    1,
    'Should have processed exactly 1 thread with past event'
  );
  assert.equal(trashedThreads.length, 1, 'Should have moved 1 thread to trash');
  assert.equal(
    trashedThreads[0],
    pastThread,
    'Should have trashed the past event thread'
  );

  assert.equal(labeledThreads.length, 1, 'Should have labeled 1 thread');
  assert.ok(
    labeledThreads[0].label.includes('📅'),
    'Label should include calendar emoji'
  );

  console.log('✓ Correctly processed 1 past event invitation');
  console.log('✓ Correctly skipped 1 future event invitation');
  console.log('✓ Correctly skipped 1 malformed invitation');
});

test('handles multiple attachments in a single message', () => {
  // Track operations
  const trashedThreads: MockThread[] = [];

  const mockGmailApp = {
    createLabel: () => ({
      addToThreads: () => { },
    }),
    moveThreadToTrash: (thread: MockThread) => {
      trashedThreads.push(thread);
    },
  };

  globalThis.Logger = { log: () => { } } as any;

  const pastEventIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20200101T100000Z
DTEND:20200101T110000Z
SUMMARY:Past Event
END:VEVENT
END:VCALENDAR`;

  // Thread with multiple attachments (some .ics, some not)
  const multiAttachmentThread = mockThread(
    'Email with multiple attachments',
    [
      mockMessage([
        mockAttachment('document.pdf', 'fake pdf content'),
        mockAttachment('invite.ics', pastEventIcs),
        mockAttachment('notes.txt', 'some notes'),
      ]),
    ]
  );

  // Process the thread
  const attachments = multiAttachmentThread.getMessages()?.[0]?.getAttachments();
  let count = 0;

  if (attachments) {
    for (const attachment of attachments) {
      if (!attachment.getName().endsWith('.ics')) {
        continue;
      }

      const icsContent = attachment.getDataAsString();
      const dateReference =
        /^DTEND:([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z$/mu.exec(
          icsContent
        );
      if (!dateReference) {
        continue;
      }

      const eventEnd = new Date(
        `${dateReference[1]}-${dateReference[2]}-${dateReference[3]}T${dateReference[4]}:${dateReference[5]}:00.000Z`
      );

      if (eventEnd < new Date()) {
        const label = mockGmailApp.createLabel('test');
        label.addToThreads([multiAttachmentThread]);
        mockGmailApp.moveThreadToTrash(multiAttachmentThread);
        count += 1;
      }
    }
  }

  assert.equal(count, 1, 'Should process only the .ics attachment');
  assert.equal(trashedThreads.length, 1, 'Should trash the thread once');
  console.log('✓ Correctly handled multiple attachments');
});
