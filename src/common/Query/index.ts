import { checkQuery } from './utils';

type Searcher = (...args: any[]) => any[];

export default abstract class Query<G extends Searcher> {
	protected search: G;

	protected query: string;

	public constructor(searcher: G, startQuery = '') {
		this.search = searcher;
		this.query = typeof startQuery === 'string' ? startQuery : '';
	}

	// ************************************************************************** //
	// ***************************** Query operators **************************** //
	// ************************************************************************** //

	/**
	 * Used in operations that will convert this object to a string.
	 *
	 * @returns the query string
	 */
	public readonly toString = () => this.query;

	// ************************************************************************** //
	// *************************** Execution functions ************************** //
	// ************************************************************************** //

	public *[Symbol.iterator](...searchParameters: Parameters<G>) {
		checkQuery(this.query);

		const nextStart =
			typeof searchParameters[1] === 'number' ? Number(searchParameters[1]) : 0;
		const nextMax =
			typeof searchParameters[2] === 'number'
				? Number(searchParameters[2])
				: 100;
		const pages: ReturnType<G>[] = [];
		let currentStart = nextStart;

		while (true) {
			const results = this.search(
				this.query,
				currentStart,
				nextMax
			) as ReturnType<G>;
			if (results.length === 0) {
				break;
			}
			pages.push([...results]);
			currentStart += results.length;
		}

		for (const page of pages) {
			yield page;
		}
	}

	public readonly processSync = (options: {
		callback: (threads: ReturnType<G>) => void;
		start?: number;
		maxResults?: number;
	}) => {
		const query = typeof this.query === 'string' ? this.query : '';
		checkQuery(query);

		const { callback, start = 0, maxResults = 100 } = options;
		const pages: ReturnType<G>[] = [];
		let currentStart = start;

		while (true) {
			const results = this.search(
				query,
				currentStart,
				maxResults
			) as ReturnType<G>;
			if (results.length === 0) {
				break;
			}
			pages.push([...results]);
			currentStart += results.length;
		}

		for (const page of pages) {
			callback(page);
		}
	};

	/**
	 * Gets the number of results returned by the current query
	 */
	public readonly numberOfResults = () => {
		checkQuery(this.query);
		return this.search(this.query).length;
	};
}
