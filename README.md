# n8n-mcp-server

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that exposes [n8n](https://n8n.io) workflow automation as tools for Claude.

## Tools

| Tool | Description |
|------|-------------|
| `list_workflows` | List all n8n workflows |
| `get_workflow` | Get details of a specific workflow |
| `execute_workflow` | Execute a workflow by ID (disabled by default) |
| `activate_workflow` | Activate or deactivate a workflow (disabled by default) |

## Setup

```bash
npm install
```

## Usage

Register with Claude Code:

```bash
claude mcp add n8n --scope user \
  -e N8N_BASE_URL=http://localhost:5678 \
  -e N8N_API_KEY=<your-key> \
  -- node /path/to/n8n-mcp-server/server.js
```

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `N8N_API_KEY` | — | n8n API key (Settings → API → API Keys) |
| `N8N_BASE_URL` | `http://127.0.0.1:5678` | n8n instance URL |
| `N8N_ALLOW_REMOTE` | `false` | Must be `true` for a non-loopback HTTPS URL |
| `N8N_ENABLE_WRITES` | `false` | Register mutation tools only when explicitly enabled before startup |

## Security defaults

- The server refuses to start without `N8N_API_KEY`.
- Remote targets require HTTPS and the explicit `N8N_ALLOW_REMOTE=true` opt-in.
- URLs containing credentials, query parameters, or fragments are rejected.
- Redirects and ambient proxy settings are disabled so the API key cannot be
  forwarded to another host; request and response bodies are size-limited.
- Only `list_workflows` and `get_workflow` are registered by default.
- When writes are enabled, every mutation still requires an exact phrase tied
  to its action and workflow ID, such as `EXECUTE abc123` or
  `DEACTIVATE abc123`.
- API error bodies are not returned to the model.

Enabling writes is an operator decision; it is not a substitute for reviewing
the target workflow and its external side effects.

## Verification

```bash
npm test
npm run check
npm audit --audit-level=high
```

## License

[Apache 2.0](LICENSE)
