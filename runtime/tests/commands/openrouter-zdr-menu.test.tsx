import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { ReactNode } from "react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EnvSnapshot } from "../config/env.js";
import { resolveHomeContext } from "../config/home.js";
import type { ConfigStore } from "../config/store.js";
import { BUILT_IN_PROVIDER_MODEL_CATALOG } from "../llm/registry/provider-info.js";
import type { Session } from "../session/session.js";
import { modelMenuFallback, readModelMenuSnapshot } from "./model-menu-snapshot.js";
import { clearOpenRouterZdrModels } from "./openrouter-zdr-models.js";
import { openProvidersHub } from "./providers-hub.js";
import { readProvidersHubModels } from "./providers-hub-snapshot.js";
import type { SlashCommandContext } from "./types.js";
import { renderPtyRows } from "../../scripts/check-tui-e2e/harness.mjs";
import { createRoot } from "../tui/ink.js";
import { AppStateProvider, getDefaultAppState } from "../tui/state/AppState.js";

// Opening the providers screen probes the local runtimes on localhost. Report
// none running, so these tests make no network attempt; OpenRouter's list
// comes from the local server below.
vi.mock("../../src/onboarding/Onboarding.js", () => ({
  detectRunningLocalProviders: async () => [],
}));

// Seven entries of OpenRouter's public GET /api/v1/endpoints/zdr answer on
// 2026-10-22, as served: five of them are models in AgenC's catalog.
const fixture = readFileSync(new URL("../llm/fixtures/openrouter-zdr-endpoints.json", import.meta.url), "utf8");
const WITH_ZDR = [
  "x-ai/grok-4.5",
  "deepseek/deepseek-v4.1-flash-1017",
  "z-ai/glm-5.3",
  "qwen/qwen3-coder-next",
  "anthropic/claude-sonnet-5.5",
];
const HINT = "to use a dimmed model, set zero_data_retention = false under [providers.openrouter].";

const homes: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  clearOpenRouterZdrModels();
  for (const path of homes.splice(0)) rmSync(path, { recursive: true, force: true });
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  })));
});

async function fakeOpenRouter(options: { readonly status?: number } = {}) {
  const requests: { readonly method?: string; readonly url?: string; readonly authorization?: string }[] = [];
  const server = createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization });
    if (req.url !== "/api/v1/endpoints/zdr") {
      res.writeHead(404).end();
      return;
    }
    const status = options.status ?? 200;
    res.writeHead(status, { "content-type": "application/json" });
    res.end(status === 200 ? fixture : JSON.stringify({ error: { message: "unavailable" } }));
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no server address");
  return { baseURL: `http://127.0.0.1:${address.port}/api/v1`, requests };
}

function context(params: { readonly baseURL: string; readonly zeroDataRetention?: boolean }) {
  const path = mkdtempSync(join(tmpdir(), "agenc-openrouter-zdr-menu-"));
  homes.push(path);
  const environment: EnvSnapshot = Object.freeze({ AGENC_HOME: path, OPENROUTER_API_KEY: "fake-openrouter-key" });
  const home = resolveHomeContext(environment, { platformHome: tmpdir() });
  const config = {
    providers: {
      openrouter: {
        base_url: params.baseURL,
        ...(params.zeroDataRetention === undefined ? {} : { zero_data_retention: params.zeroDataRetention }),
      },
    },
  };
  const configStore = {
    homeContext: home,
    current: () => config as ReturnType<ConfigStore["current"]>,
    reload: async () => ({}),
  };
  const services: Record<string, unknown> = { configStore, providerEnvironment: environment };
  const session = {
    state: {
      unsafePeek: () => ({
        sessionConfiguration: {
          provider: { slug: "openrouter" },
          collaborationMode: { model: "x-ai/grok-4.5" },
        },
        history: [],
      }),
    },
    activeTurn: { unsafePeek: () => null },
    pendingProviderSwitch: null as unknown,
    services,
    setPendingProviderSwitch(next: unknown) {
      this.pendingProviderSwitch = next;
    },
  };
  let jsx: ReactNode = null;
  const ctx = {
    session: session as unknown as Session & { pendingProviderSwitch: unknown },
    argsRaw: "",
    cwd: "/ws",
    home: "/home/test",
    appState: { setToolJSX: (next: { readonly jsx?: ReactNode }) => { jsx = next.jsx ?? null; } },
  } as unknown as SlashCommandContext & { readonly session: Session & { pendingProviderSwitch: unknown } };
  return { ctx, shown: () => jsx };
}

async function mount(element: ReactNode) {
  const stdin = new PassThrough() as PassThrough & {
    isTTY?: boolean;
    setRawMode?: (enabled: boolean) => void;
    ref?: () => void;
    unref?: () => void;
  };
  const stdout = new PassThrough() as PassThrough & { columns?: number; rows?: number; isTTY?: boolean };
  stdin.isTTY = true;
  stdin.setRawMode = vi.fn();
  stdin.ref = () => {};
  stdin.unref = () => {};
  stdout.columns = 120;
  stdout.rows = 30;
  stdout.isTTY = true;
  let written = "";
  stdout.on("data", (chunk: Buffer) => {
    written += chunk.toString("utf8");
  });
  const root = await createRoot({
    patchConsole: false,
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
  });
  root.render(<AppStateProvider initialState={getDefaultAppState()}>{element}</AppStateProvider>);
  await sleep();
  return {
    /** The screen as a terminal shows it now, lowercased (popup titles render in capitals). */
    screen(): string {
      return (renderPtyRows(written, { cols: 120, rows: 30 }) as string[]).join("\n").toLowerCase();
    },
    async press(...keys: string[]) {
      for (const key of keys) {
        stdin.write(key);
        await sleep();
      }
    },
    unmount: () => root.unmount(),
  };
}

function sleep(ms = 30): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function until(check: () => boolean, what: string, read: () => string): Promise<void> {
  for (let waited = 0; waited < 5_000; waited += 25) {
    if (check()) return;
    await sleep(25);
  }
  throw new Error(`timed out waiting for ${what}:\n${read()}`);
}

async function openModels(ctx: SlashCommandContext, shown: () => ReactNode) {
  // As `/model` does: straight to the current provider's models.
  expect(openProvidersHub(ctx, { currentModels: true })).toBe(true);
  return await mount(shown());
}

describe("OpenRouter models under zero data retention", () => {
  it("dims the models with no zero-data-retention endpoint, names the setting, and does not switch to one", async () => {
    const openrouter = await fakeOpenRouter();
    const { ctx, shown } = context({ baseURL: openrouter.baseURL });
    const hub = await openModels(ctx, shown);
    try {
      await until(() => hub.screen().includes(HINT), "the zero data retention hint", () => hub.screen());
      // One public read: the list needs no key, so none is sent.
      expect(openrouter.requests).toEqual([{ method: "GET", url: "/api/v1/endpoints/zdr", authorization: undefined }]);

      const rows = readProvidersHubModels(ctx, "openrouter");
      // Every catalog model stays listed; only the marking changes.
      expect(rows).toHaveLength(BUILT_IN_PROVIDER_MODEL_CATALOG.openrouter.length);
      const dimmed = rows.filter(row => row.noZeroDataRetention === true).map(row => row.displayModel);
      expect(rows.filter(row => row.noZeroDataRetention !== true).map(row => row.displayModel).sort())
        .toEqual([...WITH_ZDR].sort());
      expect(dimmed).toContain("google/gemini-2.5-flash-lite");
      expect(rows.find(row => row.displayModel === "google/gemini-2.5-flash-lite")?.tags).toMatch(/^no zero retention/u);
      expect(rows.find(row => row.displayModel === "x-ai/grok-4.5")).toMatchObject({ current: true });
      expect(rows.find(row => row.displayModel === "x-ai/grok-4.5")?.tags ?? "").not.toContain("no zero retention");

      // `/model` without a terminal says the same.
      const text = modelMenuFallback(readModelMenuSnapshot(ctx));
      expect(text).toContain("openrouter:google/gemini-2.5-flash-lite (no zero data retention endpoint)");
      expect(text).toContain("set zero_data_retention = false under [providers.openrouter]");

      // A dimmed model is not used: Enter says why and keeps the session as it is.
      await hub.press(..."gemini-2.5-flash-lite");
      await until(() => /▌\s+google\/gemini-2\.5-flash-lite/u.test(hub.screen()), "the dimmed model under the cursor", () => hub.screen());
      await hub.press("\r");
      await until(
        () => hub.screen().includes("google/gemini-2.5-flash-lite has no zero data retention endpoint"),
        "the notice",
        () => hub.screen(),
      );
      expect(ctx.session.pendingProviderSwitch).toBeNull();
    } finally {
      hub.unmount();
    }
  });

  it("marks nothing and does not ask OpenRouter when zero data retention is off", async () => {
    const openrouter = await fakeOpenRouter();
    const { ctx, shown } = context({ baseURL: openrouter.baseURL, zeroDataRetention: false });
    const hub = await openModels(ctx, shown);
    try {
      await until(() => hub.screen().includes("openrouter · "), "the models", () => hub.screen());
      await sleep(200);
      expect(openrouter.requests).toEqual([]);
      expect(hub.screen()).not.toContain("zero_data_retention");
      expect(readProvidersHubModels(ctx, "openrouter").some(row => row.noZeroDataRetention === true)).toBe(false);
    } finally {
      hub.unmount();
    }
  });

  it("marks nothing and says so when OpenRouter's list cannot be read", async () => {
    const openrouter = await fakeOpenRouter({ status: 503 });
    const { ctx, shown } = context({ baseURL: openrouter.baseURL });
    const hub = await openModels(ctx, shown);
    try {
      await until(
        () => hub.screen().includes("could not read openrouter's zero data retention list, so no model is marked."),
        "the note",
        () => hub.screen(),
      );
      const rows = readProvidersHubModels(ctx, "openrouter");
      expect(rows).toHaveLength(BUILT_IN_PROVIDER_MODEL_CATALOG.openrouter.length);
      expect(rows.some(row => row.noZeroDataRetention === true)).toBe(false);
      expect(hub.screen()).not.toContain(HINT);
    } finally {
      hub.unmount();
    }
  });
});
