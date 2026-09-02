// Format according to Google's guidance:
// "Escape single quotes in queries with \\, such as 'Valentine\'s Day'."
const formatQuery = (query: string) =>
	query.replaceAll('\\', '\\\\').replaceAll("'", "\\'");

export default abstract class DriveQuery {
	protected query: string;

	public constructor(startQuery = '') {
		this.query = formatQuery(startQuery);
	}

	private readonly _addOperator = (operator: string, operand: string) => {
		this.query += ` ${operator} ${formatQuery(operand)}`;
		return this;
	};

	// ************************************************************************** //
	// **************************** Query operations **************************** //
	// ************************************************************************** //

	// From https://developers.google.com/drive/api/guides/ref-search-terms

	/**
	 * "Return items that match both queries."
	 */
	public readonly and = (condition: string) =>
		this._addOperator('and', condition);

	/**
	 * "The content of one string is present in the other."
	 */
	public readonly contains = (within: string) =>
		this._addOperator('contains', within);

	/**
	 * "The content of a string or boolean is equal to the other."
	 */
	public readonly equal = (equalTo: string) => this._addOperator('=', equalTo);

	/**
	 * "A value is greater than another."
	 */
	public readonly greaterThan = (greaterThan: string) =>
		this._addOperator('>', greaterThan);

	/**
	 * "A value is greater than or equal to another."
	 */
	public readonly greaterToOrEqualThan = (value: string) =>
		this._addOperator('>=', value);

	/**
	 * "A collection contains an element matching the parameters."
	 */
	public readonly has = (has: string) => this._addOperator('has', has);

	/**
	 * "An element is contained within a collection."
	 */
	public readonly in = (collection: string) =>
		this._addOperator('in', collection);

	/**
	 * "A value is less than another."
	 */
	public readonly lessThan = (lessThan: string) =>
		this._addOperator('<', lessThan);

	/**
	 * "A value is less than or equal to another."
	 */
	public readonly lessThanOrEqualTo = (value: string) =>
		this._addOperator('<=', value);

	/**
	 * "Negates a search query."
	 */
	public readonly not = (value: string) => this._addOperator('not', value);

	/**
	 * "The content of a string or boolean is not equal to the other."
	 */
	public readonly notEqual = (notEqualTo: string) =>
		this._addOperator('!=', notEqualTo);

	/**
	 * "Return items that match either query."
	 */
	public readonly or = (condition: string) => this._addOperator('or', condition);
}