export interface ActionsPageUrlProvider {
	getActionsPageUrl(): string;
}

const defaultActionsPageUrlProvider: ActionsPageUrlProvider = {
	getActionsPageUrl(): string {
		if (typeof ScriptApp === 'undefined' || !ScriptApp.getService) {
			throw new Error('ScriptApp is not available in this environment.');
		}

		return ScriptApp.getService().getUrl();
	},
};

export const getActionsPageUrl = (
	provider: ActionsPageUrlProvider = defaultActionsPageUrlProvider
): string => provider.getActionsPageUrl();
