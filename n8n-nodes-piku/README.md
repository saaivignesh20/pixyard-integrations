# n8n-nodes-piku

An [n8n](https://n8n.io) community node for [Piku](https://piku.dv4.ai): make a
picture from a prompt, edit a photo with one sentence, or start a Live Avatar session (a real-time talking AI avatar
in the browser). The node also works as a tool for n8n's AI Agent.
Piku is the API platform for [DV4](https://dv4.ai).

## Install

In n8n: **Settings → Community Nodes → Install**, then enter `n8n-nodes-piku`.
Self-hosted with npm: `npm install n8n-nodes-piku` in your n8n custom nodes folder
(see [n8n's guide](https://docs.n8n.io/integrations/community-nodes/installation/)).

## Credentials

1. Sign in at https://piku.dv4.ai/login (a new email gets an account).
2. Create a key on the API keys page. It starts with `piku_` and shows once.
3. In n8n, add a **Piku API** credential and paste the key. n8n checks it by listing one of your generations.

## Operations

Pick a **Resource** (Image or Live Avatar), then an operation.

| Operation | What it does |
|---|---|
| Generate Image | Starts a picture from a prompt, waits up to 120 seconds for it, and puts the file in the binary field `data`. |
| Edit Image | Uploads the picture in an input binary field (JPEG, PNG or WebP, at most 7 MiB), edits it from the prompt, waits, and returns the result the same way. |
| Get Generation | Gets a generation by its ID, and downloads the picture when it is done. |
| Start Live Avatar Session | Starts a Live Avatar session, with an optional persona (name, maker, greeting, instructions, knowledge), and returns it: `id`, `status`, `queue_position`, `retry_after_s`, `join_url`, `expires_at`, `price_per_minute_usd`, `included_seconds_left` and more. |
| Get Live Avatar Session | Gets a Live Avatar session by its ID: its place in line, its `join_url` once it is its turn, or how it ended (`seconds`, `price_usd`). |
| End Live Avatar Session | Ends a Live Avatar session: a queued or ready one is cancelled at no charge; a live call is stopped and billed up to that moment. |

Options: aspect ratio (1:1, 16:9, 9:16), seed, output format (PNG, JPEG, WebP), the output binary field name, and
whether to download the picture at all.

When a run takes longer than 120 seconds, the node returns the generation with its `status` and no file; pass its
`id` to **Get Generation** later.

## Live Avatar

Live Avatar is a talking AI avatar ("Aria" unless you give it a persona) that runs in a web browser. It runs one
session at a time across all of Piku, so a new session may be `queued`: run **Get Live Avatar Session** again after
`retry_after_s` seconds (a Wait node works) until `status` is `ready` and `join_url` is set. Open `join_url` in a
browser within 5 minutes (before `expires_at`) and allow the microphone to talk. Close the tab, or run **End Live
Avatar Session**, to end the call. The avatar tells people it is an AI avatar. Anyone with `join_url` can open the
session, so share it only with the person who should talk.

Persona fields, all optional: name (up to 40 characters), maker (60), greeting (300), instructions (4,000) and
knowledge (12,000). An account has one queued, ready or live session at a time (`409 live_session_active`); the line
holds at most 20 sessions across Piku (`429 queue_full`).

## Text in pictures

Put the words you want printed in double quotes, say where they sit and how they look, and keep them short. Write
"unlabeled" or "blank" when you want no text.

## Limits

Pictures are paid from the account's prepaid credit, shared by the console, API keys and assistants. When the credit
doesn't cover a picture, the node fails with the API's `insufficient_credit` message; add credit on the Billing page.

Live Avatar costs $0.10 per minute, billed by the second from the same credit; 10 minutes are included on every
account. Time in line, or with the page open before the call connects, is not billed. A session can't start
(`402 insufficient_credit`) once the included minutes are used and the balance is under $0.10.

## Licence

MIT
