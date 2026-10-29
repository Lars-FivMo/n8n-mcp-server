import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  createApiClient,
  createServer,
  loadConfig,
  normalizeBaseUrl,
  requireWriteConfirmation,
} from "../server.js";

async function listedToolNames(writesEnabled) {
  const server = createServer({
    apiKey: "test-key",
    baseUrl: "http://127.0.0.1:5678",
    writesEnabled,
  });
  const client = new Client({ name: "security-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const result = await client.listTools();
    return result.tools.map((tool) => tool.name).sort();
  } finally {
    await client.close();
    await server.close();
  }
}

test("local HTTP URL is accepted", () => {
  assert.equal(normalizeBaseUrl("http://127.0.0.1:5678/"), "http://127.0.0.1:5678");
});

test("remote HTTP URL is always rejected", () => {
  assert.throws(() => normalizeBaseUrl("http://n8n.example.com", true), /require HTTPS/);
});

test("remote HTTPS URL requires an explicit opt-in", () => {
  assert.throws(() => normalizeBaseUrl("https://n8n.example.com"), /N8N_ALLOW_REMOTE=true/);
  assert.equal(
    normalizeBaseUrl("https://n8n.example.com/", true),
    "https://n8n.example.com",
  );
});

test("base URL rejects embedded credentials, queries, and fragments", () => {
  assert.throws(() => normalizeBaseUrl("https://user:pass@n8n.example.com", true));
  assert.throws(() => normalizeBaseUrl("https://n8n.example.com?debug=true", true));
  assert.throws(() => normalizeBaseUrl("https://n8n.example.com#fragment", true));
});

test("API key is mandatory and writes default to disabled", () => {
  assert.throws(() => loadConfig({}), /N8N_API_KEY is required/);
  const config = loadConfig({ N8N_API_KEY: "test-key" });
  assert.equal(config.writesEnabled, false);
  assert.equal(config.baseUrl, "http://127.0.0.1:5678");
});

test("HTTP client refuses redirects and ambient proxy settings", () => {
  const client = createApiClient({
    apiKey: "test-key",
    baseUrl: "https://n8n.example.com",
  });
  assert.equal(client.defaults.maxRedirects, 0);
  assert.equal(client.defaults.proxy, false);
  assert.equal(client.defaults.maxContentLength, 5 * 1024 * 1024);
});

test("write confirmation must match the exact action and workflow", () => {
  assert.throws(
    () => requireWriteConfirmation(false, "EXECUTE 123", "EXECUTE 123"),
    /disabled/,
  );
  assert.throws(
    () => requireWriteConfirmation(true, "yes", "EXECUTE 123"),
    /Explicit confirmation required/,
  );
  assert.doesNotThrow(() =>
    requireWriteConfirmation(true, "DEACTIVATE abc-123", "DEACTIVATE abc-123"),
  );
});

test("mutation tools are absent from the default read-only server", async () => {
  assert.deepEqual(await listedToolNames(false), ["get_workflow", "list_workflows"]);
});

test("mutation tools appear only after the explicit startup opt-in", async () => {
  assert.deepEqual(await listedToolNames(true), [
    "activate_workflow",
    "execute_workflow",
    "get_workflow",
    "list_workflows",
  ]);
});
