export const checkQuery = (query: string | null | undefined = '') => {
	if (typeof query !== 'string' || query.trim() === '') {
		throw new Error('No query specified');
	}
};
