---
name: pixyard
description: Generate and edit images with the pixyard API or its MCP server: auth, endpoints, polling, text-in-image tips. Use when an agent needs a picture or a photo edit.
---

# pixyard

pixyard makes a picture from a prompt, or edits a photo from one sentence. Use it through the HTTP API with a
key, or through its MCP server when your client supports remote MCP.

## Two ways in

| Way | When | Auth |
|---|---|---|
| MCP server `https://pixyard.resources-f3c.workers.dev/mcp` | Your agent speaks MCP (Claude Code, Codex, Cursor, VS Code, ChatGPT, Claude) | OAuth sign-in, or `Authorization: Bearer px_…` |
| HTTP API `https://pixyard.resources-f3c.workers.dev/v1` | Scripts, back ends, anything else | `Authorization: Bearer px_…` |

Get a key: sign in at https://pixyard.resources-f3c.workers.dev/login (a new email gets an account), then create one on the API keys page.
Keep it in an environment variable (`PIXYARD_API_KEY`); never print it or commit it.

### MCP

Claude Code:

```sh
claude mcp add --transport http pixyard https://pixyard.resources-f3c.workers.dev/mcp
```

Then run `/mcp` in Claude Code and sign in. Codex: `codex mcp add pixyard --url <address>` then
`codex mcp login pixyard`. Other clients: https://pixyard.resources-f3c.workers.dev/assistants.

Tools:

- `generate_image` `{prompt, aspect_ratio?, seed?}`: returns the picture plus `{id, status, image_url, width, height,
  seconds, price_usd}`.
- `edit_image` `{prompt, image_url, aspect_ratio?, seed?}`: `image_url` is a public https link to a JPEG, PNG or WebP
  of at most 7 MiB.
- `get_generation` `{id}`: when a call answers "Still running", ask again with its id.

## HTTP API

Base: `https://pixyard.resources-f3c.workers.dev/v1`. JSON in, JSON out.

Models:

- `qwen-image/text-to-image` (Qwen-Image 2512): a picture from a prompt.
- `qwen-image/edit` (Qwen-Image Edit 2511): an edited picture from a prompt plus an uploaded photo (`image`).

`GET /v1/models` (no key) lists each model's options, limits, defaults and price.

### Make a picture: two calls

1. Start it. Send a new `Idempotency-Key` (a UUID) for each new picture, and the same one when you retry the same
   request after a network error.

   ```sh
   curl -s https://pixyard.resources-f3c.workers.dev/v1/generations \
     -H "Authorization: Bearer $PIXYARD_API_KEY" \
     -H "Content-Type: application/json" \
     -H "Idempotency-Key: $(uuidgen)" \
     -d '{"model": "qwen-image/text-to-image", "prompt": "A ceramic mug on a wooden desk, morning light", "aspect_ratio": "16:9"}'
   ```

   The answer is `202` with `id` and `status: "queued"`.

2. Wait for it. Call `GET /v1/generations/{id}?wait=10` until `status` is `done`, `failed` or `cancelled`. Each call
   answers as soon as the run ends, or after 10 seconds with the run still going.

   ```sh
   curl -s "https://pixyard.resources-f3c.workers.dev/v1/generations/$ID?wait=10" \
     -H "Authorization: Bearer $PIXYARD_API_KEY"
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
UP=$(curl -s https://pixyard.resources-f3c.workers.dev/v1/uploads \
  -H "Authorization: Bearer $PIXYARD_API_KEY" -H "Content-Type: application/json" \
  -d "{\"kind\": \"image\", \"mime\": \"image/jpeg\", \"bytes\": $SIZE, \"filename\": \"photo.jpg\"}")
curl -s -X PUT "$(echo "$UP" | jq -r .upload_url)" -H "Content-Type: image/jpeg" --data-binary @photo.jpg
curl -s https://pixyard.resources-f3c.workers.dev/v1/generations \
  -H "Authorization: Bearer $PIXYARD_API_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d "{\"model\": \"qwen-image/edit\", \"prompt\": \"Put the bottle on a beach at sunset\", \"image\": \"$(echo "$UP" | jq -r .asset_id)\"}"
```

Uploads take JPEG, PNG or WebP, at most 7 MiB, checked by the file's first bytes.

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

1. Key in `PIXYARD_API_KEY`, or MCP connected.
2. New `Idempotency-Key` per picture.
3. Poll with `?wait=10`, never a tight loop.
4. Download `result.image_url` within 15 minutes.
5. Quote the words you want printed.
6. On `402 insufficient_credit`, stop and tell the user to add credit.
