#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from "axios";
import { z } from "zod";

const workflowIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,128}$/, "Invalid workflow ID");

function isLoopbackHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function normalizeBaseUrl(rawValue, allowRemote = false) {
  const raw = (rawValue || "http://127.0.0.1:5678").trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("N8N_BASE_URL must be a valid absolute URL");
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error("N8N_BASE_URL must not contain credentials, query parameters, or fragments");
  }
  if (!isLoopbackHostname(url.hostname)) {
    if (url.protocol !== "https:") {
      throw new Error("Remote n8n instances require HTTPS");
    }
    if (!allowRemote) {
      throw new Error("Remote n8n access requires N8N_ALLOW_REMOTE=true");
    }
  } else if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("N8N_BASE_URL must use HTTP or HTTPS");
  }

  return url.toString().replace(/\/$/, "");
}

export function loadConfig(environment = process.env) {
  const apiKey = (environment.N8N_API_KEY || "").trim();
  if (!apiKey) throw new Error("N8N_API_KEY is required");

  const allowRemote = environment.N8N_ALLOW_REMOTE === "true";
  return {
    apiKey,
    baseUrl: normalizeBaseUrl(environment.N8N_BASE_URL, allowRemote),
    writesEnabled: environment.N8N_ENABLE_WRITES === "true",
  };
}

export function requireWriteConfirmation(enabled, provided, expected) {
  if (!enabled) {
    throw new Error("Write tools are disabled; set N8N_ENABLE_WRITES=true before server startup");
  }
  if (provided !== expected) {
    throw new Error(`Explicit confirmation required: ${expected}`);
  }
}

function toolError(action, error) {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  const suffix = status ? ` (HTTP ${status})` : "";
  return {
    content: [{ type: "text", text: `${action} failed${suffix}` }],
    isError: true,
  };
}

export function createApiClient(config) {
  return axios.create({
    baseURL: `${config.baseUrl}/api/v1`,
    headers: { "X-N8N-API-KEY": config.apiKey },
    timeout: 30_000,
    maxRedirects: 0,
    maxContentLength: 5 * 1024 * 1024,
    maxBodyLength: 5 * 1024 * 1024,
    proxy: false,
  });
}

export function createServer(config) {
  const api = createApiClient(config);

  const server = new McpServer({ name: "n8n", version: "1.1.0" });

  server.tool("list_workflows", "List n8n workflows and their active status", {}, async () => {
    try {
      const { data } = await api.get("/workflows");
      const workflows = Array.isArray(data.data) ? data.data : [];
      if (!workflows.length) {
        return { content: [{ type: "text", text: "Keine Workflows vorhanden." }] };
      }
      const lines = workflows.map(
        (workflow) =>
          `[${workflow.active ? "aktiv" : "inaktiv"}] ${workflow.name} (ID: ${workflow.id})`,
      );
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return toolError("Listing workflows", error);
    }
  });

  server.tool(
    "get_workflow",
    "Get details of a specific n8n workflow",
    { id: workflowIdSchema.describe("Workflow ID") },
    async ({ id }) => {
      try {
        const { data } = await api.get(`/workflows/${encodeURIComponent(id)}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return toolError("Reading workflow", error);
      }
    },
  );

  if (config.writesEnabled) {
    server.tool(
      "execute_workflow",
      "Execute a workflow. Requires an exact per-call confirmation phrase.",
      {
        id: workflowIdSchema.describe("Workflow ID to execute"),
        data: z.record(z.unknown()).optional().describe("Optional workflow input"),
        confirmation: z.string().describe('Must equal "EXECUTE <workflow-id>"'),
      },
      async ({ id, data: inputData, confirmation }) => {
        try {
          requireWriteConfirmation(config.writesEnabled, confirmation, `EXECUTE ${id}`);
          const { data } = await api.post(`/workflows/${encodeURIComponent(id)}/run`, {
            data: inputData || {},
          });
          const executionId = data.data?.executionId || "unbekannt";
          return { content: [{ type: "text", text: `Workflow gestartet. Run ID: ${executionId}` }] };
        } catch (error) {
          return toolError("Executing workflow", error);
        }
      },
    );

    server.tool(
      "activate_workflow",
      "Activate or deactivate a workflow. Requires an exact per-call confirmation phrase.",
      {
        id: workflowIdSchema.describe("Workflow ID"),
        active: z.boolean().describe("true to activate, false to deactivate"),
        confirmation: z
          .string()
          .describe('Must equal "ACTIVATE <workflow-id>" or "DEACTIVATE <workflow-id>"'),
      },
      async ({ id, active, confirmation }) => {
        const action = active ? "ACTIVATE" : "DEACTIVATE";
        try {
          requireWriteConfirmation(config.writesEnabled, confirmation, `${action} ${id}`);
          await api.patch(`/workflows/${encodeURIComponent(id)}`, { active });
          return {
            content: [{ type: "text", text: `Workflow ${id} ${active ? "aktiviert" : "deaktiviert"}.` }],
          };
        } catch (error) {
          return toolError("Changing workflow state", error);
        }
      },
    );
  }

  return server;
}

export async function main() {
  const config = loadConfig();
  const server = createServer(config);
  await server.connect(new StdioServerTransport());
  console.error(
    `n8n MCP server running on stdio (${config.writesEnabled ? "writes enabled" : "read-only"})`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Fatal configuration or startup error: ${error.message}`);
    process.exit(1);
  });
}
