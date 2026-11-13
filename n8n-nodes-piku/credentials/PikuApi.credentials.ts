import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class PikuApi implements ICredentialType {
	name = 'pikuApi';

	displayName = 'Piku API';

	icon: Icon = { light: 'file:../icons/piku.svg', dark: 'file:../icons/piku.dark.svg' };

	documentationUrl =
		'https://github.com/saaivignesh20/piku-integrations/tree/main/n8n-nodes-piku#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'A Piku API key (starts with piku_). Create one on the API keys page after signing in.',
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
			baseURL: 'https://piku.dv4.ai',
			url: '/v1/generations',
			method: 'GET',
			qs: { limit: 1 },
		},
	};
}
