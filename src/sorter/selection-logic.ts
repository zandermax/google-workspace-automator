export const DAILY_LIMIT = 50;

interface MailItem {
  id: string;
}

interface MailPools {
  unreadInbox?: MailItem[];
  oldInbox?: MailItem[];
  archived?: MailItem[];
  random?: () => number;
}

interface GeminiFixture {
  id: string;
  sender: string;
  subject: string;
  snippet: string;
  hasAttachment: boolean;
  ageInDays: number;
  sizeKb: number;
}

export function selectMailForRun(pools?: MailPools): MailItem[] {
  if (!pools) {
    throw new Error('Sorter selection logic not implemented yet.');
  }

  const unreadInbox = pools.unreadInbox ?? [];
  const random = pools.random ?? Math.random;
  const oldInbox = shuffle(pools.oldInbox ?? [], random);
  const archived = shuffle(pools.archived ?? [], random);

  return [...unreadInbox, ...oldInbox, ...archived].slice(0, DAILY_LIMIT);
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

export function buildGeminiFixture(): GeminiFixture {
  return {
    id: 'fixture-1',
    sender: 'test@example.com',
    subject: 'Fixture email',
    snippet: 'Example snippet',
    hasAttachment: false,
    ageInDays: 1,
    sizeKb: 12,
  };
}
