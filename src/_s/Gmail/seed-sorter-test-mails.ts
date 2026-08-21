const TEST_LABEL_ROOT = 'Sorter-Test';
const TEST_SEED_LABEL = `${TEST_LABEL_ROOT}/Seed`;
const TEST_RUN_LABEL = `${TEST_LABEL_ROOT}/Run`;
const MAX_LOOKUP_ATTEMPTS = 8;
const LOOKUP_SLEEP_MS = 750;

type SeedCase = {
    slug: string;
    body: string;
    archive: boolean;
    withAttachment: boolean;
};

const seedCases: SeedCase[] = [
    {
        slug: 'personal',
        body: 'Hey, can we meet next Wednesday to catch up over coffee?',
        archive: false,
        withAttachment: false,
    },
    {
        slug: 'personal-follow-up',
        body: 'Just checking if you saw my last note. No rush.',
        archive: true,
        withAttachment: false,
    },
    {
        slug: 'receipt-order',
        body: 'Order confirmation #A-31415. Total charged: EUR 42.18.',
        archive: false,
        withAttachment: true,
    },
    {
        slug: 'finance-statement',
        body: 'Your monthly statement is available. Balance due by 2026-09-01.',
        archive: true,
        withAttachment: false,
    },
    {
        slug: 'newsletter-tech',
        body: 'This week: modern TypeScript patterns and debugging checklists.',
        archive: false,
        withAttachment: false,
    },
    {
        slug: 'newsletter-career',
        body: 'Career digest: communication tips and useful productivity habits.',
        archive: true,
        withAttachment: false,
    },
    {
        slug: 'alert-ci-failure',
        body: 'Alert: CI job failed in stage build-linux at 03:42 UTC.',
        archive: false,
        withAttachment: false,
    },
    {
        slug: 'alert-disk-space',
        body: 'Warning: disk usage exceeded 85 percent on host app-worker-2.',
        archive: true,
        withAttachment: false,
    },
];

const getSelfAddress = () => {
    const address = Session.getEffectiveUser().getEmail();
    if (!address) {
        throw new Error('Could not resolve an account email for seed delivery.');
    }

    return address;
};

const ensureLabel = (name: string) =>
    GmailApp.getUserLabelByName(name) ?? GmailApp.createLabel(name);

const escapeForQuery = (value: string) => value.replace(/"/gu, '\\"');

const findThreadByExactSubject = (subject: string) => {
    const escaped = escapeForQuery(subject);
    for (let attempt = 1; attempt <= MAX_LOOKUP_ATTEMPTS; attempt += 1) {
        const threads = GmailApp.search(`subject:"${escaped}" newer_than:2d`, 0, 5);
        if (threads.length > 0) {
            return threads[0];
        }

        Utilities.sleep(LOOKUP_SLEEP_MS);
    }

    return null;
};

export const seedSorterTestEmails = () => {
    const recipient = getSelfAddress();
    const runToken = Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        'yyyyMMdd-HHmmss'
    );
    const seedLabel = ensureLabel(TEST_SEED_LABEL);
    const runLabel = ensureLabel(TEST_RUN_LABEL);

    const createdSubjects: string[] = [];
    let archivedCount = 0;

    for (const [index, seedCase] of seedCases.entries()) {
        const subject = `Sorter test ${seedCase.slug} ${runToken}-${index + 1}`;
        const options: Parameters<typeof GmailApp.sendEmail>[3] = {};

        if (seedCase.withAttachment) {
            options.attachments = [
                Utilities.newBlob(
                    `Attachment fixture for ${seedCase.slug}`,
                    'text/plain',
                    `sorter-${seedCase.slug}.txt`
                ),
            ];
        }

        GmailApp.sendEmail(recipient, subject, seedCase.body, options);

        const thread = findThreadByExactSubject(subject);
        if (!thread) {
            Logger.log(`Could not find thread for subject: ${subject}`);
            continue;
        }

        seedLabel.addToThread(thread);
        runLabel.addToThread(thread);

        if (seedCase.archive) {
            thread.moveToArchive();
            archivedCount += 1;
        }

        createdSubjects.push(subject);
    }

    Logger.log(
        [
            `Seeded ${createdSubjects.length} sorter test threads.`,
            `Archived ${archivedCount}.`,
            `Inbox ${createdSubjects.length - archivedCount}.`,
            `Run token: ${runToken}`,
        ].join(' ')
    );
};

export const cleanupSorterTestEmails = () => {
    const runLabel = GmailApp.getUserLabelByName(TEST_RUN_LABEL);
    if (!runLabel) {
        Logger.log('No sorter test run label found. Nothing to clean up.');
        return;
    }

    const threads = runLabel.getThreads(0, 500);
    let cleaned = 0;

    for (const thread of threads) {
        for (const label of thread.getLabels()) {
            if (label.getName().startsWith(`${TEST_LABEL_ROOT}/`)) {
                label.removeFromThread(thread);
            }
        }

        thread.moveToTrash();
        cleaned += 1;
    }

    Logger.log(`Cleaned up ${cleaned} sorter test threads.`);
};