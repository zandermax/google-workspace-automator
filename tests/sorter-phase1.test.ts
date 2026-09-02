import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  DAILY_LIMIT,
  selectMailForRun,
  buildGeminiFixture,
} from '../src/sorter/selection-logic';

interface MailItem {
  id: string;
}

interface SelectionOptions {
  unreadInbox: MailItem[];
  oldInbox: MailItem[];
  archived: MailItem[];
  random?: () => number;
}

test('daily limit is configured as a conservative cap', () => {
  assert.equal(DAILY_LIMIT, 50);
});

test('selection logic rejects unimplemented sorter behavior until implemented', () => {
  assert.throws(() => selectMailForRun(), /not implemented/i);
});

test('selection prioritizes unread inbox mail before older pools', () => {
  const unreadInbox: MailItem[] = [
    { id: 'unread-1' },
    { id: 'unread-2' },
  ];
  const oldInbox: MailItem[] = [{ id: 'old-1' }];
  const archived: MailItem[] = [{ id: 'archived-1' }];

  const selected = selectMailForRun({
    unreadInbox,
    oldInbox,
    archived,
  } as SelectionOptions);

  assert.deepEqual(selected, [
    { id: 'unread-1' },
    { id: 'unread-2' },
    { id: 'old-1' },
    { id: 'archived-1' },
  ]);
});

test('selection samples the old inbox pool instead of always taking its first items', () => {
  const oldInbox: MailItem[] = [
    { id: 'old-1' },
    { id: 'old-2' },
    { id: 'old-3' },
    { id: 'old-4' },
  ];

  const selected = selectMailForRun({
    unreadInbox: [],
    oldInbox,
    archived: [],
    random: () => 0,
  } as SelectionOptions);

  assert.deepEqual(selected, [
    { id: 'old-2' },
    { id: 'old-3' },
    { id: 'old-4' },
    { id: 'old-1' },
  ]);
});

test('selection never exceeds the daily limit', () => {
  const unreadInbox: MailItem[] = Array.from(
    { length: DAILY_LIMIT + 1 },
    (_, index) => ({
      id: `unread-${index}`,
    })
  );

  const selected = selectMailForRun({
    unreadInbox,
    oldInbox: [{ id: 'old-1' }],
    archived: [{ id: 'archived-1' }],
  } as SelectionOptions);

  assert.equal(selected.length, DAILY_LIMIT);
  assert.equal(selected.at(-1)?.id, `unread-${DAILY_LIMIT - 1}`);
});

test('Gemini fixture factory produces a valid thread stub for dry-run tests', () => {
  const fixture = buildGeminiFixture();
  assert.ok(fixture.id);
  assert.ok(fixture.sender);
  assert.ok(fixture.subject);
  assert.ok(typeof fixture.hasAttachment === 'boolean');
  assert.ok(typeof fixture.ageInDays === 'number');
});
