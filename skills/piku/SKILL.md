---
name: piku
description: Generate and edit images, and start Live Avatar sessions (a real-time talking AI avatar in the browser), with the Piku API or its MCP server: auth, endpoints, polling, text-in-image tips. Use when an agent needs a picture, a photo edit or a talking avatar.
---

# Piku

Piku makes a picture from a prompt, edits a photo from one sentence, and runs Live Avatar, a real-time talking AI
avatar in the browser. Use it through the HTTP API with a key, or through its MCP server when your client supports
remote MCP.

## Two ways in

| Way | When | Auth |
|---|---|---|
| MCP server `https://piku.dv4.ai/mcp` | Your agent speaks MCP (Claude Code, Codex, Cursor, VS Code, ChatGPT, Claude) | OAuth sign-in, or `Authorization: Bearer piku_…` |
| HTTP API `https://piku.dv4.ai/v1` | Scripts, back ends, anything else | `Authorization: Bearer piku_…` |

Get a key: sign in at https://piku.dv4.ai/login (a new email gets an account), then create one on the API keys page.
Keep it in an environment variable (`PIKU_API_KEY`); never print it or commit it.

### MCP

Claude Code:

```sh
claude mcp add --transport http piku https://piku.dv4.ai/mcp
```

Then run `/mcp` in Claude Code and sign in. Codex: `codex mcp add piku --url <address>` then
`codex mcp login piku`. Other clients: https://piku.dv4.ai/assistants.

Tools:

- `generate_image` `{prompt, aspect_ratio?, seed?}`: returns the picture plus `{id, status, image_url, width, height,
  seconds, price_usd}`.
- `edit_image` `{prompt, image_url, aspect_ratio?, seed?}`: `image_url` is a public https link to a JPEG, PNG or WebP
  of at most 7 MiB.
- `get_generation` `{id}`: when a call answers "Still running", ask again with its id.
- `create_live_session` `{persona?}`: starts a Live Avatar session; gives its `join_url`, or its place in line.
- `get_live_session` `{id}`: the session now; ask again while it is queued.

## HTTP API

Base: `https://piku.dv4.ai/v1`. JSON in, JSON out.

Models:

- `qwen-image/text-to-image` (Qwen-Image 2512): a picture from a prompt.
- `qwen-image/edit` (Qwen-Image Edit 2511): an edited picture from a prompt plus an uploaded photo (`image`).

`GET /v1/models` (no key) lists each model's options, limits, defaults and price.

### Make a picture: two calls

1. Start it. Send a new `Idempotency-Key` (a UUID) for each new picture, and the same one when you retry the same
   request after a network error.

   ```sh
   curl -s https://piku.dv4.ai/v1/generations \
     -H "Authorization: Bearer $PIKU_API_KEY" \
     -H "Content-Type: application/json" \
     -H "Idempotency-Key: $(uuidgen)" \
     -d '{"model": "qwen-image/text-to-image", "prompt": "A ceramic mug on a wooden desk, morning light", "aspect_ratio": "16:9"}'
   ```

   The answer is `202` with `id` and `status: "queued"`.

2. Wait for it. Call `GET /v1/generations/{id}?wait=10` until `status` is `done`, `failed` or `cancelled`. Each call
   answers as soon as the run ends, or after 10 seconds with the run still going.

   ```sh
   curl -s "https://piku.dv4.ai/v1/generations/$ID?wait=10" \
     -H "Authorization: Bearer $PIKU_API_KEY"
   ```

   When `done`, download `result.image_url` (a signed link, no key needed, valid 15 minutes). `result` also has
   `width`, `height` and `expires_at`. A `failed` run has `error: {type, message}`.

Fields of `POST /v1/generations`:

| Field | Takes |
|---|---|
| `model` | `qwen-image/text-to-image` or `qwen-image/edit` (required) |
| `prompt` | Up to 2,000 characters (required) |
| `aspect_ratio` | `1:1` (default), `16:9`, `9:16`. Text to image: 1328×1328, 1664×928, 928×1664. Edit: 1024×1024, 1280×720, 720×1280 |
| `steps` | Fixed per model (8 for text to image, 4 for edit); leave it out |
| `seed` | Integer 0 to 2147483647; the same seed and inputs give the same picture |
| `output_format` | `png` (default), `jpeg` or `webp`; jpeg and webp arrive sooner |
| `image` | Edit only: the `asset_id` of an upload (required for edits) |

The first picture after a quiet spell takes longer while a GPU worker starts; keep polling.

### Edit a photo: upload first

1. `POST /v1/uploads` with `{"kind": "image", "mime": "image/jpeg", "bytes": <file size>, "filename": "photo.jpg"}`.
   The answer is `201` with `asset_id`, `upload_url`, `upload_headers` and `expires_at`.
2. `PUT` the file's bytes to `upload_url` with every header in `upload_headers`. The link is signed (no key) and works
   for 15 minutes.
3. Start the edit with the `asset_id` as `image`, then poll as above.

```sh
SIZE=$(wc -c < photo.jpg | tr -d ' ')
UP=$(curl -s https://piku.dv4.ai/v1/uploads \
  -H "Authorization: Bearer $PIKU_API_KEY" -H "Content-Type: application/json" \
  -d "{\"kind\": \"image\", \"mime\": \"image/jpeg\", \"bytes\": $SIZE, \"filename\": \"photo.jpg\"}")
curl -s -X PUT "$(echo "$UP" | jq -r .upload_url)" -H "Content-Type: image/jpeg" --data-binary @photo.jpg
curl -s https://piku.dv4.ai/v1/generations \
  -H "Authorization: Bearer $PIKU_API_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d "{\"model\": \"qwen-image/edit\", \"prompt\": \"Put the bottle on a beach at sunset\", \"image\": \"$(echo "$UP" | jq -r .asset_id)\"}"
```

Uploads take JPEG, PNG or WebP, at most 7 MiB, checked by the file's first bytes.

## Live Avatar

A talking AI avatar ("Aria" by default) that runs in a web browser: the person opens a link, allows the microphone
and talks with it. It runs one session at a time across all of Piku, so a session may wait in line. It tells people
it is an AI avatar. $0.10 per minute, billed by the second from the account's credit; the first 10 minutes (600
seconds) per account are free. Time in line is not billed.

1. Create: `POST /v1/live/sessions` with `{"persona": {...}}` or `{}`. The answer is `201` with `id` and `status`.
   Persona fields, all optional text: `name` (up to 40 characters), `maker` (60), `greeting` (300), `instructions`
   (4,000), `knowledge` (12,000). No other fields.

   ```sh
   curl -s https://piku.dv4.ai/v1/live/sessions \
     -H "Authorization: Bearer $PIKU_API_KEY" -H "Content-Type: application/json" \
     -d '{"persona": {"name": "Mira", "greeting": "Hi! Ask me anything about our kites.", "instructions": "Be warm and brief."}}'
   ```

2. Poll: while `status` is `queued`, wait `retry_after_s` seconds (5 to 60), then `GET /v1/live/sessions/{id}`.
   `queue_position` is the place in line (1 is next). The line only moves when sessions are read, so keep asking.
3. Open: when `status` is `ready`, give the user `join_url` to open in a browser before `expires_at` (5 minutes),
   else it `expired`. Anyone with the link can join; share it only with the person who should talk. The session is
   `live` once the call starts.
4. End: closing the tab ends the call, or `POST /v1/live/sessions/{id}/end` (queued or ready: `cancelled`, nothing
   charged; live: stopped now and billed to that moment). Read it again for `status: "ended"`, `seconds` and
   `price_usd`. If the answer has `end_requested: true` and is still `live`, the avatar wasn't reached: send the end
   again.

`GET /v1/live/sessions` lists the account's 20 newest sessions with `free_seconds_left`. A session's time limit
(`max_s`) is the free seconds left plus what the balance pays for, at most 30 minutes.

| Status and type | What to do |
|---|---|
| `402 insufficient_credit` | The free minutes are used and the balance is under $0.10 (one minute). Tell the user to add credit on Billing; do not retry until they have. |
| `409 live_session_active` | The account already has a queued, ready or live session. Use that one, end it, or let it finish. |
| `429 queue_full` | The line (20 sessions across Piku) is full. Retry after `retry_after_s`. |
| `503 unavailable` | Live Avatar isn't available right now. Retry later. |

## Text in pictures

Pictures with printed words (labels, signs, packaging, posters, screens) come out readable when the prompt gives the
words:

- Put the exact words in double quotes: `a candle whose label reads "EMBER"`.
- Say where they sit and how they look: `in thin black capitals across the centre of the label`.
- Keep it short: one to four words per line, at most two lines.
- Want no text? Say `unlabeled`, `blank` or `plain unmarked`.

## Errors

Every error has one shape: `{"error": {"type", "message", "field", "retry_after_s"}}`.

| Status and type | What to do |
|---|---|
| `400 invalid_request` | Fix the field named in `field`. |
| `401 unauthenticated` | Check the key. |
| `404 not_found` | Check the id. |
| `409 idempotency_conflict` | Use a new `Idempotency-Key` for a new picture. |
| `413 file_too_large`, `415 unsupported_file` | Send a JPEG, PNG or WebP under 7 MiB. |
| `422 asset_not_ready` | PUT the file to `upload_url` first. |
| `402 insufficient_credit` | The account's credit doesn't cover the picture. Tell the user to add credit on the console's Billing page; do not retry until they have. |
| `503 unavailable` | Retry later with the same `Idempotency-Key`. |

## Checklist for an agent

1. Key in `PIKU_API_KEY`, or MCP connected.
2. New `Idempotency-Key` per picture.
3. Poll with `?wait=10`, never a tight loop.
4. Download `result.image_url` within 15 minutes.
5. Quote the words you want printed.
6. On `402 insufficient_credit`, stop and tell the user to add credit.
7. Live Avatar: one session per account; poll a queued session after `retry_after_s`; hand the user `join_url` within
   5 minutes.
