# n8n-mcp-server

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that exposes [n8n](https://n8n.io) workflow automation as tools for Claude.

## Tools

| Tool | Description |
|------|-------------|
| `list_workflows` | List all n8n workflows |
| `get_workflow` | Get details of a specific workflow |
| `execute_workflow` | Execute a workflow by ID |

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
| `N8N_BASE_URL` | `http://localhost:5678` | n8n instance URL |

## License

[Apache 2.0](LICENSE)
