import { test } from 'node:test';
import { strict as assert } from 'node:assert';

/**
 * Test for deleteOldInvites logic
 * 
 * Since the function depends on Google Apps Script APIs (GmailApp, Logger),
 * we'll test the core logic: extracting event end date from ICS and comparing to now.
 */

test('extracts event end date from ICS DTEND line', () => {
  // This is the regex from the actual code
  const icsRegex =
    /^DTEND:([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z$/mu;

  // Example ICS content with an event that ended in 2020
  const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test@example.com
DTSTART:20200515T100000Z
DTEND:20200515T110000Z
SUMMARY:Past Conference
DESCRIPTION:A conference that already happened
END:VEVENT
END:VCALENDAR`;

  const dateReference = icsRegex.exec(icsContent);
  assert.ok(dateReference, 'Should extract DTEND line');
  assert.deepEqual(
    [dateReference[1], dateReference[2], dateReference[3]],
    ['2020', '05', '15'],
    'Should extract year, month, day correctly'
  );

  const eventEnd = new Date(
    `${dateReference[1]}-${dateReference[2]}-${dateReference[3]}T${dateReference[4]}:${dateReference[5]}:00.000Z`
  );
  const now = new Date();

  assert.ok(eventEnd < now, 'Past event should be older than now');
});

test('ignores ICS without DTEND line', () => {
  const icsRegex =
    /^DTEND:([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z$/mu;

  const invalidIcsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test@example.com
DTSTART:20300515T100000Z
SUMMARY:Future Event with no end
END:VEVENT
END:VCALENDAR`;

  const dateReference = icsRegex.exec(invalidIcsContent);
  assert.equal(dateReference, null, 'Should not match if no DTEND present');
});

test('correctly identifies future events as not eligible for deletion', () => {
  const icsRegex =
    /^DTEND:([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z$/mu;

  // Event 10 years in the future
  const futureDate = new Date();
  futureDate.setFullYear(futureDate.getFullYear() + 10);

  const year = futureDate.getUTCFullYear();
  const month = String(futureDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(futureDate.getUTCDate()).padStart(2, '0');

  const icsContent = `DTEND:${year}${month}${day}T150000Z`;
  const dateReference = icsRegex.exec(icsContent);

  assert.ok(dateReference, 'Should match valid DTEND format');

  const eventEnd = new Date(
    `${dateReference[1]}-${dateReference[2]}-${dateReference[3]}T${dateReference[4]}:${dateReference[5]}:00.000Z`
  );
  const now = new Date();

  assert.ok(eventEnd > now, 'Future event should be newer than now');
  assert.ok(!(eventEnd < now), 'Future event should NOT be marked for deletion');
});

test('correctly handles edge case: event ending one second ago', () => {
  const icsRegex =
    /^DTEND:([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z$/mu;

  const now = new Date();
  const oneSecondAgo = new Date(now.getTime() - 1000);

  const year = oneSecondAgo.getUTCFullYear();
  const month = String(oneSecondAgo.getUTCMonth() + 1).padStart(2, '0');
  const day = String(oneSecondAgo.getUTCDate()).padStart(2, '0');
  const hours = String(oneSecondAgo.getUTCHours()).padStart(2, '0');
  const minutes = String(oneSecondAgo.getUTCMinutes()).padStart(2, '0');
  const seconds = String(oneSecondAgo.getUTCSeconds()).padStart(2, '0');

  const icsContent = `DTEND:${year}${month}${day}T${hours}${minutes}${seconds}Z`;
  const dateReference = icsRegex.exec(icsContent);

  assert.ok(dateReference, 'Should match time from one second ago');

  const eventEnd = new Date(
    `${dateReference[1]}-${dateReference[2]}-${dateReference[3]}T${dateReference[4]}:${dateReference[5]}:00.000Z`
  );

  // Event that ended 1 second ago should be marked for deletion
  assert.ok(eventEnd < now, 'Event ending 1 second ago should be marked for deletion');
});

test('parses a realistic calendar invite ICS file', () => {
  const icsRegex =
    /^DTEND:([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z$/mu;

  // Real-world example: a past conference
  const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Conference Invitation
X-WR-TIMEZONE:UTC
BEGIN:VEVENT
DTSTART:20180911T090000Z
DTEND:20180911T170000Z
DTSTAMP:20180901T120000Z
UID:abc123@google.com
CREATED:20180901T120000Z
DESCRIPTION:Annual Tech Conference 2018
LOCATION:San Francisco Convention Center
SEQUENCE:0
STATUS:CONFIRMED
SUMMARY:Annual Tech Conference
TRANSP:OPAQUE
END:VEVENT
END:VCALENDAR`;

  const dateReference = icsRegex.exec(icsContent);
  assert.ok(dateReference, 'Should extract DTEND from real calendar file');
  assert.deepEqual(
    [dateReference[1], dateReference[2], dateReference[3]],
    ['2018', '09', '11'],
    'Should correctly parse 2018-09-11'
  );

  const eventEnd = new Date(
    `${dateReference[1]}-${dateReference[2]}-${dateReference[3]}T${dateReference[4]}:${dateReference[5]}:00.000Z`
  );
  const now = new Date();

  assert.ok(eventEnd < now, '2018 event should be in the past');
});
