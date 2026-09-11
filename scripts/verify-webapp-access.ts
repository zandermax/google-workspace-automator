export interface FetchResponseLike {
	status: number;
	text(): Promise<string>;
}

export type FetchLike = (url: string) => Promise<FetchResponseLike>;

export interface VerifyResult {
	passed: boolean;
	message: string;
}

const OWNER_ONLY_MARKERS = [
	'accounts.google.com',
	'You need permission',
	'You do not have permission',
	'Sign in',
];

export const verifyWebAppAccessIsRestricted = async (
	url: string,
	fetchImpl: FetchLike = fetch
): Promise<VerifyResult> => {
	const response = await fetchImpl(url);
	const body = await response.text();

	const looksLikeOwnerOnlyPage = OWNER_ONLY_MARKERS.some((marker) =>
		body.includes(marker)
	);

	if (looksLikeOwnerOnlyPage) {
		return {
			passed: true,
			message: 'Anonymous request was rejected as expected (owner-only access).',
		};
	}

	return {
		passed: false,
		message: `Anonymous request returned content that did not match any expected access-denied marker (status ${response.status}). The Web App may not be correctly restricted to "Only myself".`,
	};
};

const isMainModule = (): boolean => {
	try {
		return import.meta.url === `file://${process.argv[1]}`;
	} catch {
		return false;
	}
};

async function main(): Promise<void> {
	const url = process.argv[2];
	if (!url) {
		console.error('Usage: npm run verify:webapp-access -- <deployed-web-app-url>');
		process.exit(1);
	}

	const result = await verifyWebAppAccessIsRestricted(url);
	console.log(result.message);
	process.exit(result.passed ? 0 : 1);
}

if (isMainModule()) {
	main();
}
