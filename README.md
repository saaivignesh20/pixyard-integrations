# pixyard integrations

Ways to use [pixyard](https://pixyard.resources-f3c.workers.dev) (image generation and photo editing) from
agents and automation tools.

| Folder | What it is |
|---|---|
| [`skills/pixyard`](skills/pixyard/SKILL.md) | An agent skill: the API, the MCP server, polling and text-in-picture tips |
| [`n8n-nodes-pixyard`](n8n-nodes-pixyard) | An n8n community node: Generate Image, Edit Image, Get Generation |

## Agent skill

```sh
npx skills add saaivignesh20/pixyard-integrations --skill pixyard
```

Works with agents that read `SKILL.md` files (Claude Code, Codex, Cursor and others). The skill expects a key in
`PIXYARD_API_KEY`, or the MCP server connected:

```sh
claude mcp add --transport http pixyard https://pixyard.resources-f3c.workers.dev/mcp
```

## n8n node

In n8n: **Settings → Community Nodes → Install**, then enter:

```
n8n-nodes-pixyard
```

Self-hosted with npm: `npm install n8n-nodes-pixyard`. Then add a **pixyard API** credential with a key from
the API keys page. Details in [its README](n8n-nodes-pixyard/README.md).

## Get a key

Sign in at https://pixyard.resources-f3c.workers.dev/login (a new email gets an account), add credit on the Billing page, then create a key on
the API keys page. Each picture's price comes off your credit.

## Licence

[MIT](LICENSE)
