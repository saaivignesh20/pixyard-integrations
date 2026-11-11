import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class PixyardApi implements ICredentialType {
	name = 'pixyardApi';

	displayName = 'pixyard API';

	icon: Icon = { light: 'file:../icons/pixyard.svg', dark: 'file:../icons/pixyard.dark.svg' };

	documentationUrl =
		'https://github.com/saaivignesh20/pixyard-integrations/tree/main/n8n-nodes-pixyard#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'A pixyard API key (starts with px_). Create one on the API keys page after signing in.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// GET /v1/models is public, so it would pass with any key; listing one generation needs a valid key.
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://pixyard.resources-f3c.workers.dev',
			url: '/v1/generations',
			method: 'GET',
			qs: { limit: 1 },
		},
	};
}
