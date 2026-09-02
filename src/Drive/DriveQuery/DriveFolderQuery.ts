import DriveQuery from './00-DriveQuery';

export default class DriveFolderQuery extends DriveQuery {
	public [Symbol.iterator]() {
		return DriveApp.searchFolders(this.query);
	}
}
