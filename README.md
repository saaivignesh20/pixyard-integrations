# Piku integrations

Ways to use [Piku](https://piku.dv4.ai) (image generation and photo editing) from
agents and automation tools. Piku is the API platform for [DV4](https://dv4.ai).

| Folder | What it is |
|---|---|
| [`skills/piku`](skills/piku/SKILL.md) | An agent skill: the API, the MCP server, polling and text-in-picture tips |
| [`n8n-nodes-piku`](n8n-nodes-piku) | An n8n community node: Generate Image, Edit Image, Get Generation |

## Agent skill

```sh
npx skills add saaivignesh20/piku-integrations --skill piku
```

Works with agents that read `SKILL.md` files (Claude Code, Codex, Cursor and others). The skill expects a key in
`PIKU_API_KEY`, or the MCP server connected:

```sh
claude mcp add --transport http piku https://piku.dv4.ai/mcp
```

## n8n node

In n8n: **Settings → Community Nodes → Install**, then enter:

```
n8n-nodes-piku
```

Self-hosted with npm: `npm install n8n-nodes-piku`. Then add a **Piku API** credential with a key from
the API keys page. Details in [its README](n8n-nodes-piku/README.md).

## Get a key

Sign in at https://piku.dv4.ai/login (a new email gets an account), add credit on the Billing page, then create a key on
the API keys page. Each picture's price comes off your credit.

## Changelog

- 2026-11-13: renamed to Piku; it was called pixyard until 2026-11-13.

## Licence

[MIT](LICENSE)
