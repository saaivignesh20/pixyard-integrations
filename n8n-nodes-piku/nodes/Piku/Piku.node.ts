import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import {
	jsonParse,
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	randomString,
	sleep,
} from 'n8n-workflow';

const BASE_URL = 'https://piku.dv4.ai';
const MODEL_GENERATE = 'qwen-image/text-to-image';
const MODEL_EDIT = 'qwen-image/edit';
const TERMINAL = ['done', 'failed', 'cancelled'];
const MAX_WAIT_MS = 120_000;
const UPLOAD_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const EXTENSION: Record<string, string> = { png: 'png', jpeg: 'jpg', webp: 'webp' };
const IMAGE_OPERATIONS = ['generateImage', 'editImage', 'getGeneration'];
const LIVE_SESSION_OPERATIONS = ['getLiveSession', 'endLiveSession'];
/** The persona fields POST /v1/live/sessions takes; the API trims them and checks their lengths */
const PERSONA_FIELDS = ['name', 'maker', 'greeting', 'instructions', 'knowledge'];

interface Generation extends IDataObject {
	id: string;
	status: string;
	result: { image_url: string; width: number; height: number; expires_at: string } | null;
	error: { type: string; message: string } | null;
}

interface Upload extends IDataObject {
	asset_id: string;
	upload_url: string;
	upload_headers?: Record<string, string>;
}

interface Options {
	downloadImage?: boolean;
	outputFormat?: string;
	binaryPropertyName?: string;
	seed?: number;
}

async function api<T>(
	ctx: IExecuteFunctions,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	headers?: Record<string, string>,
): Promise<T> {
	const options: IHttpRequestOptions = {
		method,
		url: `${BASE_URL}${path}`,
		headers,
		body,
		json: true,
	};
	return (await ctx.helpers.httpRequestWithAuthentication.call(
		ctx,
		'pikuApi',
		options,
	)) as T;
}

/** Polls GET /v1/generations/{id}?wait=10 until the run ends or MAX_WAIT_MS passes, then returns the latest view. */
async function waitFor(ctx: IExecuteFunctions, gen: Generation): Promise<Generation> {
	const deadline = Date.now() + MAX_WAIT_MS;
	let current = gen;
	while (!TERMINAL.includes(current.status) && Date.now() < deadline) {
		current = await api<Generation>(
			ctx,
			'GET',
			`/v1/generations/${encodeURIComponent(current.id)}?wait=10`,
		);
		if (!TERMINAL.includes(current.status)) await sleep(250);
	}
	return current;
}

async function startGeneration(ctx: IExecuteFunctions, body: IDataObject): Promise<Generation> {
	const gen = await api<Generation>(ctx, 'POST', '/v1/generations', body, {
		'Idempotency-Key': randomString(32),
	});
	return await waitFor(ctx, gen);
}

async function toItem(
	ctx: IExecuteFunctions,
	gen: Generation,
	options: Options,
	itemIndex: number,
): Promise<INodeExecutionData> {
	if (gen.status === 'failed') {
		throw new NodeOperationError(ctx.getNode(), gen.error?.message ?? 'The run failed. Try again.', {
			itemIndex,
			description: gen.error?.type,
		});
	}
	const item: INodeExecutionData = { json: gen, pairedItem: { item: itemIndex } };
	if (gen.status !== 'done' || !gen.result || options.downloadImage === false) return item;
	const response = (await ctx.helpers.httpRequest({
		method: 'GET',
		url: gen.result.image_url,
		encoding: 'arraybuffer',
		returnFullResponse: true,
	})) as { body: ArrayBuffer; headers: Record<string, string> };
	const mimeType = String(response.headers['content-type'] ?? 'image/png').split(';')[0];
	const format = mimeType.replace('image/', '');
	const fileName = `${gen.id}.${EXTENSION[format] ?? 'png'}`;
	const property = options.binaryPropertyName || 'data';
	item.binary = {
		[property]: await ctx.helpers.prepareBinaryData(Buffer.from(response.body), fileName, mimeType),
	};
	return item;
}

function generationBody(
	model: string,
	prompt: string,
	aspectRatio: string,
	options: Options,
): IDataObject {
	const body: IDataObject = { model, prompt, aspect_ratio: aspectRatio };
	if (options.seed !== undefined) body.seed = options.seed;
	if (options.outputFormat) body.output_format = options.outputFormat;
	return body;
}

async function upload(ctx: IExecuteFunctions, itemIndex: number, field: string): Promise<string> {
	const binary = ctx.helpers.assertBinaryData(itemIndex, field);
	if (!UPLOAD_MIMES.includes(binary.mimeType)) {
		throw new NodeOperationError(
			ctx.getNode(),
			`The file in "${field}" is ${binary.mimeType}; Piku edits JPEG, PNG or WebP pictures.`,
			{ itemIndex },
		);
	}
	const bytes = await ctx.helpers.getBinaryDataBuffer(itemIndex, field);
	const body: IDataObject = { kind: 'image', mime: binary.mimeType, bytes: bytes.length };
	if (binary.fileName) body.filename = binary.fileName.slice(0, 200);
	const up = await api<Upload>(ctx, 'POST', '/v1/uploads', body);
	await ctx.helpers.httpRequest({
		method: 'PUT',
		url: up.upload_url,
		headers: up.upload_headers ?? { 'Content-Type': binary.mimeType },
		body: bytes,
		json: false,
	});
	return up.asset_id;
}

/** The Piku error body's message ({"error": {"type", "message", ...}}), when the HTTP error carries one. */
function apiMessage(error: unknown): string | undefined {
	const response = (error as { response?: { body?: unknown; data?: unknown } } | undefined)?.response;
	for (const raw of [response?.body, response?.data]) {
		const body = typeof raw === 'string' ? jsonParse<IDataObject>(raw, { fallbackValue: {} }) : raw;
		const message = (body as { error?: { message?: unknown } } | undefined)?.error?.message;
		if (typeof message === 'string') return message;
	}
	return undefined;
}

export class Piku implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Piku',
		name: 'piku',
		icon: { light: 'file:../../icons/piku.svg', dark: 'file:../../icons/piku.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description:
			'Generate images from a prompt, edit photos with one sentence, and start Live Avatar sessions',
		defaults: {
			name: 'piku',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'pikuApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Image', value: 'image' },
					{ name: 'Live Avatar', value: 'liveAvatar' },
				],
				default: 'image',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['image'] } },
				options: [
					{
						name: 'Edit Image',
						value: 'editImage',
						description: 'Edit a picture from the input with one sentence',
						action: 'Edit an image',
					},
					{
						name: 'Generate Image',
						value: 'generateImage',
						description: 'Make a picture from a prompt',
						action: 'Generate an image',
					},
					{
						name: 'Get Generation',
						value: 'getGeneration',
						description: 'Get a generation by its ID',
						action: 'Get a generation',
					},
				],
				default: 'generateImage',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['liveAvatar'] } },
				options: [
					{
						name: 'End Live Avatar Session',
						value: 'endLiveSession',
						description:
							'End a Live Avatar session. A queued or ready one is cancelled at no charge; a live call is stopped and billed up to that moment.',
						action: 'End a live avatar session',
					},
					{
						name: 'Get Live Avatar Session',
						value: 'getLiveSession',
						description:
							'Get a Live Avatar session by its ID: its place in line, its join_url once it is its turn, or how it ended',
						action: 'Get a live avatar session',
					},
					{
						name: 'Start Live Avatar Session',
						value: 'startLiveSession',
						description:
							'Start a real-time talking AI avatar session to open in a browser. One session at a time across Piku, so it may wait in line. $0.10 per minute, billed by the second; the first 10 minutes per account are free.',
						action: 'Start a live avatar session',
					},
				],
				default: 'startLiveSession',
			},
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				typeOptions: { rows: 4 },
				required: true,
				default: '',
				placeholder: 'A candle on a wooden table whose label reads "EMBER"',
				description:
					'What the picture shows, or for an edit, what to change. Up to 2,000 characters. Put any words you want printed in double quotes.',
				displayOptions: { show: { operation: ['generateImage', 'editImage'] } },
			},
			{
				displayName: 'Input Binary Field',
				name: 'inputBinaryField',
				type: 'string',
				required: true,
				default: 'data',
				hint: 'The name of the input binary field that holds the picture to edit (JPEG, PNG or WebP, at most 7 MiB)',
				displayOptions: { show: { operation: ['editImage'] } },
			},
			{
				displayName: 'Aspect Ratio',
				name: 'aspectRatio',
				type: 'options',
				options: [
					{ name: 'Landscape 16:9 (1664×928; Edits 1280×720)', value: '16:9' },
					{ name: 'Portrait 9:16 (928×1664; Edits 720×1280)', value: '9:16' },
					{ name: 'Square 1:1 (1328×1328; Edits 1024×1024)', value: '1:1' },
				],
				default: '1:1',
				description: "The picture's shape",
				displayOptions: { show: { operation: ['generateImage', 'editImage'] } },
			},
			{
				displayName: 'Generation ID',
				name: 'generationId',
				type: 'string',
				required: true,
				default: '',
				description: 'The ID returned by Generate Image or Edit Image',
				displayOptions: { show: { operation: ['getGeneration'] } },
			},
			{
				displayName:
					'Live Avatar is a real-time talking AI avatar ("Aria" unless you name it) that runs in a web browser. It runs one session at a time across all of Piku: when it is busy the session is "queued"; run Get Live Avatar Session again after retry_after_s seconds until status is "ready" and join_url is set. Open join_url in a browser within 5 minutes (before expires_at) and allow the microphone to talk. $0.10 per minute, billed by the second from your credit; the first 10 minutes per account are free. The avatar tells people it is an AI avatar. Anyone with join_url can open the session, so share it only with the person who should talk.',
				name: 'liveNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { operation: ['startLiveSession'] } },
			},
			{
				displayName: 'Persona',
				name: 'persona',
				type: 'collection',
				placeholder: 'Add persona field',
				default: {},
				description:
					'Who the avatar is. Every field is optional; leave them all out for the default avatar, Aria. Fixed when the session starts.',
				displayOptions: { show: { operation: ['startLiveSession'] } },
				options: [
					{
						displayName: 'Greeting',
						name: 'greeting',
						type: 'string',
						typeOptions: { rows: 2 },
						default: '',
						placeholder: 'Hi! Ask me anything about our kites.',
						description: 'The first thing the avatar says. Up to 300 characters.',
					},
					{
						displayName: 'Instructions',
						name: 'instructions',
						type: 'string',
						typeOptions: { rows: 4 },
						default: '',
						placeholder: 'Be warm and brief.',
						description: 'How the avatar behaves and what it talks about. Up to 4,000 characters.',
					},
					{
						displayName: 'Knowledge',
						name: 'knowledge',
						type: 'string',
						typeOptions: { rows: 6 },
						default: '',
						placeholder: 'We sell three kites: Delta ($40), Box ($55) and Stunt ($90).',
						description: 'Facts the avatar can draw on. Up to 12,000 characters.',
					},
					{
						displayName: 'Maker',
						name: 'maker',
						type: 'string',
						default: '',
						description: 'Who the avatar says made it. Up to 60 characters.',
					},
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
						placeholder: 'Mira',
						description: 'The name the avatar goes by. Up to 40 characters.',
					},
				],
			},
			{
				displayName: 'Session ID',
				name: 'sessionId',
				type: 'string',
				required: true,
				default: '',
				description: 'The ID returned by Start Live Avatar Session',
				displayOptions: { show: { operation: LIVE_SESSION_OPERATIONS } },
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: IMAGE_OPERATIONS } },
				options: [
					{
						displayName: 'Download Image',
						name: 'downloadImage',
						type: 'boolean',
						default: true,
						description:
							'Whether to download the finished picture into a binary field. Off returns only the JSON with a signed image_url that expires after 15 minutes.',
					},
					{
						displayName: 'Output Format',
						name: 'outputFormat',
						type: 'options',
						options: [
							{ name: 'JPEG', value: 'jpeg' },
							{ name: 'PNG', value: 'png' },
							{ name: 'WebP', value: 'webp' },
						],
						default: 'png',
						description: 'The file type. JPEG and WebP arrive sooner and are smaller.',
						displayOptions: { show: { '/operation': ['generateImage', 'editImage'] } },
					},
					{
						displayName: 'Put Output File in Field',
						name: 'binaryPropertyName',
						type: 'string',
						default: 'data',
						hint: 'The name of the output binary field for the picture',
					},
					{
						displayName: 'Seed',
						name: 'seed',
						type: 'number',
						typeOptions: { minValue: 0, maxValue: 2147483647, numberPrecision: 0 },
						default: 0,
						description: 'The same seed and inputs give the same picture. Random when not set.',
						displayOptions: { show: { '/operation': ['generateImage', 'editImage'] } },
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;
				if (operation === 'startLiveSession') {
					const fields = this.getNodeParameter('persona', i, {}) as Record<string, string>;
					const persona: IDataObject = {};
					for (const key of PERSONA_FIELDS) {
						const value = fields[key]?.trim();
						if (value) persona[key] = value;
					}
					const body: IDataObject = Object.keys(persona).length ? { persona } : {};
					const session = await api<IDataObject>(this, 'POST', '/v1/live/sessions', body);
					returnData.push({ json: session, pairedItem: { item: i } });
					continue;
				}
				if (LIVE_SESSION_OPERATIONS.includes(operation)) {
					const id = encodeURIComponent((this.getNodeParameter('sessionId', i) as string).trim());
					const session =
						operation === 'endLiveSession'
							? await api<IDataObject>(this, 'POST', `/v1/live/sessions/${id}/end`, {})
							: await api<IDataObject>(this, 'GET', `/v1/live/sessions/${id}`);
					returnData.push({ json: session, pairedItem: { item: i } });
					continue;
				}
				const options = this.getNodeParameter('options', i, {}) as Options;
				let gen: Generation;
				if (operation === 'getGeneration') {
					const id = this.getNodeParameter('generationId', i) as string;
					gen = await api<Generation>(
						this,
						'GET',
						`/v1/generations/${encodeURIComponent(id.trim())}`,
					);
				} else {
					const prompt = this.getNodeParameter('prompt', i) as string;
					const aspectRatio = this.getNodeParameter('aspectRatio', i) as string;
					if (operation === 'editImage') {
						const field = this.getNodeParameter('inputBinaryField', i) as string;
						const body = generationBody(MODEL_EDIT, prompt, aspectRatio, options);
						body.image = await upload(this, i, field);
						gen = await startGeneration(this, body);
					} else {
						const body = generationBody(MODEL_GENERATE, prompt, aspectRatio, options);
						gen = await startGeneration(this, body);
					}
				}
				returnData.push(await toItem(this, gen, options, i));
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				if (error instanceof NodeOperationError) {
					throw new NodeOperationError(this.getNode(), error, { itemIndex: i });
				}
				const message = apiMessage(error);
				throw new NodeApiError(this.getNode(), error as JsonObject, {
					itemIndex: i,
					...(message ? { message } : {}),
				});
			}
		}

		return [returnData];
	}
}
