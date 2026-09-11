export interface ActionsPageUrlProvider {
	getActionsPageUrl(): string;
}

const defaultActionsPageUrlProvider: ActionsPageUrlProvider = {
	getActionsPageUrl(): string {
		if (typeof ScriptApp === 'undefined' || !ScriptApp.getService) {
			throw new Error('ScriptApp is not available in this environment.');
		}

		const url = ScriptApp.getService().getUrl();
		if (!url) {
			throw new Error(
				'ScriptApp.getService().getUrl() returned no URL — has the Web App been deployed yet? Deploy it first (see README), then redeploy after any code change.'
			);
		}

		return url;
	},
};

export const getActionsPageUrl = (
	provider: ActionsPageUrlProvider = defaultActionsPageUrlProvider
): string => provider.getActionsPageUrl();
