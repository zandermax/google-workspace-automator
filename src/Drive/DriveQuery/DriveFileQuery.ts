import DriveQuery from './00-DriveQuery';

type OperandExtender = (operand: string) => {
	[x: string]: (value: string) => DriveFileQuery;
};

export default class DriveFileQuery extends DriveQuery {
	// Probably overly clever, but with this queries can be chained
	private readonly getMethods = (
		methods: Array<keyof DriveQuery>,
		operand: string
	) => {
		const result: Partial<
			Record<keyof DriveQuery, (value: string) => DriveFileQuery>
		> = {};
		for (const method of methods) {
			result[method] = (value: string) => {
				this.query += ` ${operand}`;
				return this[method](value);
			};
		}

		return result;
	};

	private readonly _canBeEqual: OperandExtender = (operand) =>
		this.getMethods(['equal', 'notEqual'], operand);

	private readonly _canContain: OperandExtender = (operand) =>
		this.getMethods(['contains'], operand);

	private readonly _canUseOperators: OperandExtender = (operand) =>
		this.getMethods(
			[
				'equal',
				'notEqual',
				'lessThan',
				'lessThanOrEqualTo',
				'greaterThan',
				'greaterToOrEqualThan',
			],
			operand
		);

	private readonly _canBeIn: OperandExtender = (operand) =>
		this.getMethods(['in'], operand);

	private readonly _canHasCheeseburgers: OperandExtender = (operand) =>
		this.getMethods(['has'], operand);

	// Same order as https://developers.google.com/drive/api/guides/ref-search-terms

	/**
	 * Name of the file. Surround with single quotes '. Escape single quotes in queries with \', such
	 * as 'Valentine\'s Day'.
	 *
	 * @memberof DriveFileQuery
	 */
	public readonly name = {
		...this._canContain,
		...this._canBeEqual,
	};

	/**
	 * Whether the name, description, indexableText properties, or text in the file's content or
	 * metadata of the file matches. Surround with single quotes '. Escape single quotes in queries
	 * with \', such as 'Valentine\'s Day'.
	 *
	 * @memberof DriveFileQuery
	 */
	public readonly fullText = {
		...this._canContain,
	};

	/**
	 * MIME type of the file. Surround with single quotes '. Escape single quotes in queries with \',
	 * such as 'Valentine\'s Day'. For further information on MIME types, see Google Workspace and
	 * Drive MIME Types (https://developers.google.com/drive/api/guides/mime-types).
	 *
	 * @memberof DriveFileQuery
	 */
	public readonly mimeType = {
		...this._canContain,
		...this._canBeEqual,
	};

	/**
	 *Date of the last modification of the file. RFC 3339 format, default time zone is UTC, such as
	 * 2012-06-04T12:00:00-08:00. Fields of type date are not currently comparable to each other, only
	 * to constant dates.
	 *
	 * @memberof DriveFileQuery
	 */
	public readonly modifiedTime = {
		...this._canUseOperators,
	};

	/**
	 * Date that the user last viewed a file. RFC 3339 format, default time zone is UTC, such as
	 * 2012-06-04T12:00:00-08:00. Fields of type date are not currently comparable to each other,
	 * only to constant dates.
	 *
	 * @memberof DriveFileQuery
	 */
	public readonly viewedByMeTime = {
		...this._canUseOperators,
	};

	/**
	 * Whether the file is in the trash or not. Can be either true or false.
	 *
	 * @memberof DriveFileQuery
	 */
	public readonly trashed = {
		...this._canBeEqual,
	};

	/**
	 * Whether the file is starred or not. Can be either true or false.
	 */
	public readonly starred = {
		...this._canBeEqual,
	};

	/**
	 * Whether the parents collection contains the specified ID.
	 *
	 * @memberof DriveFileQuery
	 */
	public readonly parents = {
		...this._canBeIn,
	};

	/**
	 * Users who own the file.
	 *
	 * @memberof DriveFileQuery
	 */
	public readonly owners = {
		...this._canBeIn,
	};

	/**
	 * Users or groups who have permission to modify the file. See Permissions resource reference.
	 * (https://developers.google.com/drive/api/v3/reference/permissions)
	 *
	 * @memberof DriveFileQuery
	 */
	public readonly writers = {
		...this._canBeIn,
	};

	/**
	 * Users or groups who have permission to read the file. See Permissions resource reference.
	 * (https://developers.google.com/drive/api/v3/reference/permissions)
	 *
	 * @memberof DriveFileQuery
	 */
	public readonly readers = {
		...this._canBeIn,
	};

	/**
	 * Files that are in the user's "Shared with me" collection. All file users are in the file's
	 * Access Control List (ACL). Can be either true or false.
	 * (https://developers.google.com/drive/api/guides/about-files)
	 *
	 * @memberof DriveFileQuery
	 */
	public sharedWithMe = {
		...this._canBeEqual,
	};

	/**
	 * Date when the shared drive was created. Use RFC 3339 format, default time zone is UTC, such
	 * as 2012-06-04T12:00:00-08:00.
	 *
	 * @memberof DriveFileQuery
	 */
	public createdTime = {
		...this._canBeEqual,
	};

	/**
	 * Public custom file properties.
	 *
	 * @memberof DriveFileQuery
	 */
	public readonly properties = {
		...this._canHasCheeseburgers,
	};

	/**
	 * Private custom file properties.
	 *
	 * @memberof DriveFileQuery
	 */
	public readonly appProperties = {
		...this._canHasCheeseburgers,
	};

	/**
	 * The visibility level of the file. Valid values are anyoneCanFind, anyoneWithLink,
	 * domainCanFind, domainWithLink, and limited. Surround with single quotes '.
	 *
	 * @memberof DriveFileQuery
	 */
	public readonly visibility = {
		...this._canBeEqual,
	};

	/**
	 * The ID of the item the shortcut points to.
	 *
	 * @memberof DriveFileQuery
	 */
	public readonly shortcutDetails_targetId = {
		...this._canBeEqual,
	};

	// For `.forEach`
	public [Symbol.iterator]() {
		return DriveApp.searchFiles(this.query);
	}
}
