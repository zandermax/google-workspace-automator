import { checkQuery } from './utils';

type Searcher = (...args: any[]) => any[];

export default abstract class Query<G extends Searcher> {
	protected search: G;

	protected query: string;

	public constructor(searcher: G, startQuery = '') {
		this.search = searcher;
		this.query = startQuery;
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

		let results = this.search(this.query, ...searchParameters.slice(1)) as ReturnType<G>;
		let queryRun = 0;

		while (results.length) {
			yield results;
			Logger.log(`Found ${results.length} threads on query run #${queryRun++}`);

			const nextStart =
				typeof searchParameters[1] === 'number' ? Number(searchParameters[1]) : 0;
			const nextMax =
				typeof searchParameters[2] === 'number' ? Number(searchParameters[2]) : 100;
			results = this.search(
				this.query,
				nextStart + nextMax,
				nextMax
			) as ReturnType<G>;
		}
	}

	public readonly processSync = (options: {
		callback: (threads: ReturnType<G>) => void;
		start?: number;
		maxResults?: number;
	}) => {
		checkQuery(this.query);

		const { callback, start = 0, maxResults = 100 } = options;
		let currentStart = start;
		let results = this.search(this.query, currentStart, maxResults) as ReturnType<G>;

		while (results.length) {
			callback(results);
			currentStart += maxResults;
			results = this.search(this.query, currentStart, maxResults) as ReturnType<G>;
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
