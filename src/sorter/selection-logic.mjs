export const DAILY_LIMIT = 50;

export function selectMailForRun(pools) {
    if (!pools) {
        throw new Error('Sorter selection logic not implemented yet.');
    }

    const unreadInbox = pools.unreadInbox ?? [];
    const random = pools.random ?? Math.random;
    const oldInbox = shuffle(pools.oldInbox ?? [], random);
    const archived = shuffle(pools.archived ?? [], random);

    return [...unreadInbox, ...oldInbox, ...archived].slice(0, DAILY_LIMIT);
}

function shuffle(items, random) {
    const shuffled = [...items];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }

    return shuffled;
}

export function buildGeminiFixture() {
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
