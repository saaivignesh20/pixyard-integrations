# n8n-nodes-piku

An [n8n](https://n8n.io) community node for [Piku](https://piku.dv4.ai): make a
picture from a prompt, or edit a photo with one sentence. The node also works as a tool for n8n's AI Agent.
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

| Operation | What it does |
|---|---|
| Generate Image | Starts a picture from a prompt, waits up to 120 seconds for it, and puts the file in the binary field `data`. |
| Edit Image | Uploads the picture in an input binary field (JPEG, PNG or WebP, at most 7 MiB), edits it from the prompt, waits, and returns the result the same way. |
| Get Generation | Gets a generation by its ID, and downloads the picture when it is done. |

Options: aspect ratio (1:1, 16:9, 9:16), seed, output format (PNG, JPEG, WebP), the output binary field name, and
whether to download the picture at all.

When a run takes longer than 120 seconds, the node returns the generation with its `status` and no file; pass its
`id` to **Get Generation** later.

## Text in pictures

Put the words you want printed in double quotes, say where they sit and how they look, and keep them short. Write
"unlabeled" or "blank" when you want no text.

## Limits

Pictures are paid from the account's prepaid credit, shared by the console, API keys and assistants. When the credit
doesn't cover a picture, the node fails with the API's `insufficient_credit` message; add credit on the Billing page.

## Licence

MIT
