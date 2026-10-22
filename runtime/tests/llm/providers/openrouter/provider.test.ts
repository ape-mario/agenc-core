import { describe, expect, test, vi } from "vitest";

import {
  OPENROUTER_DEFAULT_REFERER,
  OPENROUTER_DEFAULT_TITLE,
  OpenRouterProvider,
  openRouterExtraBody,
} from "./index.js";
import {
  BUILT_IN_PROVIDER_BASE_URLS,
  BUILT_IN_PROVIDER_DEFAULT_MODELS,
  BUILT_IN_PROVIDER_MODEL_CATALOG,
} from "../../registry/provider-info.js";
import { isLLMPreGenerationRejection, LLMProviderError } from "../../errors.js";
import { createProvider } from "../../provider.js";

describe("OpenRouterProvider", () => {
  test("sends OpenRouter routing headers on chat-completions requests", async () => {
    const model = BUILT_IN_PROVIDER_DEFAULT_MODELS.openrouter;
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "chatcmpl_openrouter",
          model,
          choices: [
            {
              message: {
                role: "assistant",
                content: "ok",
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 4,
            completion_tokens: 1,
            total_tokens: 5,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const provider = new OpenRouterProvider({
      apiKey: "or-test",
      model,
      fetchImpl,
    });

    const response = await provider.chat([{ role: "user", content: "hello" }]);

    expect(response.content).toBe("ok");
    const [requestUrl, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(requestUrl)).toBe(
      `${BUILT_IN_PROVIDER_BASE_URLS.openrouter}/chat/completions`,
    );
    const headers = init?.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer or-test");
    expect(headers.get("http-referer")).toBe(OPENROUTER_DEFAULT_REFERER);
    expect(headers.get("x-title")).toBe(OPENROUTER_DEFAULT_TITLE);
    const requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(requestBody.model).toBe(model);
    expect(requestBody.stream).toBe(false);
  });

  test("routes only to zero-data-retention endpoints by default, and sends no routing block when turned off", async () => {
    const reply = () =>
      new Response(
        JSON.stringify({
          id: "chatcmpl_zdr",
          model: BUILT_IN_PROVIDER_DEFAULT_MODELS.openrouter,
          choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => reply());
    const model = BUILT_IN_PROVIDER_DEFAULT_MODELS.openrouter;

    await new OpenRouterProvider({ apiKey: "or-test", model, fetchImpl, zeroDataRetention: true })
      .chat([{ role: "user", content: "hello" }]);
    await new OpenRouterProvider({ apiKey: "or-test", model, fetchImpl, zeroDataRetention: false })
      .chat([{ role: "user", content: "hello" }]);
    await new OpenRouterProvider({
      apiKey: "or-test",
      model,
      fetchImpl,
      zeroDataRetention: true,
      extraBody: { provider: { data_collection: "deny" } },
    }).chat([{ role: "user", content: "hello" }]);
    // Nothing set: the user's own key routes to zero-data-retention endpoints.
    await new OpenRouterProvider({ apiKey: "or-test", model, fetchImpl })
      .chat([{ role: "user", content: "hello" }]);

    const bodies = fetchImpl.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body)) as Record<string, unknown>,
    );
    expect(bodies[0]?.provider).toEqual({ zdr: true });
    expect(bodies[1]).not.toHaveProperty("provider");
    // An existing routing block keeps its other preferences.
    expect(bodies[2]?.provider).toEqual({ data_collection: "deny", zdr: true });
    expect(bodies[3]?.provider).toEqual({ zdr: true });
    expect(openRouterExtraBody({})).toEqual({ provider: { zdr: true } });
    expect(openRouterExtraBody({ zeroDataRetention: false })).toBeUndefined();

    // The factory path a session takes, streaming as a turn does.
    const chunk = (delta: Record<string, unknown>, finish: string | null, usage?: Record<string, number>) =>
      `data: ${JSON.stringify({ id: "chatcmpl_zdr_stream", object: "chat.completion.chunk", model, choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) })}\n\n`;
    const streamFetch = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response(
        chunk({ role: "assistant", content: "ok" }, null) +
          chunk({}, "stop", { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 }) +
          "data: [DONE]\n\n",
        { status: 200, headers: { "content-type": "text/event-stream" } },
      ));
    const streamed = await createProvider("openrouter", { apiKey: "or-test", model, extra: { fetchImpl: streamFetch } })
      .chatStream!([{ role: "user", content: "hello" }], () => {});
    expect(streamed.content).toBe("ok");
    const [, streamInit] = streamFetch.mock.calls[0] ?? [];
    const streamBody = JSON.parse(String(streamInit?.body)) as Record<string, unknown>;
    expect(streamBody.stream).toBe(true);
    expect(streamBody.provider).toEqual({ zdr: true });
  });

  test("sends no routing block on the managed AgenC gateway, which pins zero data retention itself", async () => {
    // The gateway's request schema is strict: an unreviewed `provider` field
    // made every managed DeepSeek request fail as a 503 "provider_unavailable".
    const model = "deepseek/deepseek-v4.1-flash";
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          id: "chatcmpl_managed",
          model,
          choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ));

    await new OpenRouterProvider({
      apiKey: "managed-test",
      model,
      baseURL: "https://id.agenc.ag/v1/auth/openrouter/v1",
      fetchImpl,
      managedRequestId: true,
      zeroDataRetention: true,
    }).chat([{ role: "user", content: "hello" }]);

    // The default (nothing set) stays off the managed route as well.
    await new OpenRouterProvider({
      apiKey: "managed-test",
      model,
      baseURL: "https://id.agenc.ag/v1/auth/openrouter/v1",
      fetchImpl,
      managedRequestId: true,
    }).chat([{ role: "user", content: "hello" }]);

    for (const [, init] of fetchImpl.mock.calls) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.model).toBe(model);
      expect(body).not.toHaveProperty("provider");
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(
      openRouterExtraBody({ zeroDataRetention: true, managedRequestId: true }),
    ).toBeUndefined();
    expect(openRouterExtraBody({ managedRequestId: true })).toBeUndefined();
  });

  // Live answer on 2026-10-22 for a model with no zero-data-retention
  // endpoint (google/gemini-2.5-flash-lite, provider.zdr = true, streaming).
  const ZDR_REFUSAL = {
    error: {
      message: "No endpoints found matching your data policy (Zero data retention). Configure: https://openrouter.ai/settings/privacy",
      code: 404,
      metadata: {
        routing_funnel: [
          { step: "Initial Endpoints", endpoint_count: 3 },
          { step: "Filter by Tier Endpoint Rows", endpoint_count: 1, reason: "Excluded tier endpoint rows the request did not opt into" },
        ],
        failed_routing_step: "Filter by Data Policy",
      },
    },
  };
  const refusing = () =>
    vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response(JSON.stringify(ZDR_REFUSAL), {
        status: 404,
        headers: { "content-type": "application/json" },
      }));

  test("names zero data retention and the setting when no endpoint qualifies, without retrying", async () => {
    const model = "google/gemini-2.5-flash-lite";
    const fetchImpl = refusing();
    // Retries stay at their default: a refusal must not be sent again.
    const client = createProvider("openrouter", { apiKey: "or-test", model, extra: { fetchImpl } });

    const streamed = await client.chatStream!([{ role: "user", content: "hello" }], () => {})
      .catch((error: unknown) => error as LLMProviderError);
    expect(streamed).toBeInstanceOf(LLMProviderError);
    expect(streamed.statusCode).toBe(404);
    expect(streamed.message).toBe(
      "openrouter error: OpenRouter has no zero data retention endpoint for google/gemini-2.5-flash-lite, so it refused the request. " +
        "Zero data retention is on by default. Choose another model, or set zero_data_retention = false under [providers.openrouter] in config.toml to use this one.",
    );
    // Not the wrong-base-URL hint the bare 404 used to get.
    expect(streamed.message).not.toContain("OPENAI_BASE_URL");
    expect(fetchImpl).toHaveBeenCalledOnce();

    const answered = await client.chat([{ role: "user", content: "hello" }], { model: "openai/o3" })
      .catch((error: unknown) => error as LLMProviderError);
    expect(answered).toBeInstanceOf(LLMProviderError);
    expect(answered.message).toContain("no zero data retention endpoint for openai/o3,");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("tells admission that a zero data retention refusal ran nothing", async () => {
    const model = "google/gemini-2.5-flash-lite";
    const client = createProvider("openrouter", { apiKey: "or-test", model, extra: { fetchImpl: refusing() } });
    // Admitted calls make one wire attempt: OpenRouter refused while routing, so the reservation is released at zero.
    const admitted = await client.chatStream!([{ role: "user", content: "hello" }], () => {}, { singleWireAttempt: true })
      .catch((error: unknown) => error as LLMProviderError);
    expect(admitted).toBeInstanceOf(LLMProviderError);
    expect(admitted.message).toContain("no zero data retention endpoint");
    expect(isLLMPreGenerationRejection(admitted, "openrouter")).toBe(true);
    // Without the one-attempt contract nothing is claimed.
    const plain = await client.chatStream!([{ role: "user", content: "hello" }], () => {})
      .catch((error: unknown) => error as LLMProviderError);
    expect(isLLMPreGenerationRejection(plain, "openrouter")).toBe(false);
    // Another 404 is no such evidence.
    const missing = createProvider("openrouter", {
      apiKey: "or-test",
      model,
      extra: {
        fetchImpl: vi.fn<typeof fetch>().mockImplementation(async () =>
          new Response(JSON.stringify({ error: { message: "Not Found", code: 404 } }), {
            status: 404,
            headers: { "content-type": "application/json" },
          })),
      },
    });
    const notFound = await missing.chatStream!([{ role: "user", content: "hello" }], () => {}, { singleWireAttempt: true })
      .catch((error: unknown) => error as LLMProviderError);
    expect(notFound).toBeInstanceOf(LLMProviderError);
    expect(isLLMPreGenerationRejection(notFound, "openrouter")).toBe(false);
  });

  test("points at the account's privacy settings when AgenC did not ask for zero data retention", async () => {
    const fetchImpl = refusing();
    const client = createProvider("openrouter", {
      apiKey: "or-test",
      model: "google/gemini-2.5-flash-lite",
      extra: { fetchImpl, zeroDataRetention: false },
    });
    const error = await client.chatStream!([{ role: "user", content: "hello" }], () => {})
      .catch((caught: unknown) => caught as LLMProviderError);
    const [, init] = fetchImpl.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).not.toHaveProperty("provider");
    expect(error).toBeInstanceOf(LLMProviderError);
    expect(error.message).toContain("no zero data retention endpoint for google/gemini-2.5-flash-lite");
    expect(error.message).toContain("Your OpenRouter privacy settings require zero data retention (https://openrouter.ai/settings/privacy)");
    expect(error.message).not.toContain("zero_data_retention = false");
  });

  test("leaves the managed route's errors as they are", async () => {
    const fetchImpl = refusing();
    const error = await new OpenRouterProvider({
      apiKey: "managed-test",
      model: "deepseek/deepseek-v4.1-flash",
      baseURL: "https://id.agenc.ag/v1/auth/openrouter/v1",
      fetchImpl,
      managedRequestId: true,
    }).chat([{ role: "user", content: "hello" }]).catch((caught: unknown) => caught as Error);
    expect(error.message).toContain("No endpoints found matching your data policy");
    expect(error.message).not.toContain("zero_data_retention = false");
  });

  test.each(
    BUILT_IN_PROVIDER_MODEL_CATALOG.openrouter.filter(
      (model) => model !== BUILT_IN_PROVIDER_DEFAULT_MODELS.openrouter,
    ),
  )(
    "routes OpenRouter model %s through chat completions",
    async (model) => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "chatcmpl_openrouter_route",
            model,
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "ok",
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 4,
              completion_tokens: 1,
              total_tokens: 5,
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );

      const provider = new OpenRouterProvider({
        apiKey: "or-test",
        model: BUILT_IN_PROVIDER_DEFAULT_MODELS.openrouter,
        fetchImpl,
      });

      const response = await provider.chat(
        [{ role: "user", content: "hello" }],
        { model },
      );

      expect(response.content).toBe("ok");
      const [requestUrl, init] = fetchImpl.mock.calls[0] ?? [];
      expect(String(requestUrl)).toBe(
        `${BUILT_IN_PROVIDER_BASE_URLS.openrouter}/chat/completions`,
      );
      const headers = init?.headers as Headers;
      expect(headers.get("authorization")).toBe("Bearer or-test");
      expect(headers.get("http-referer")).toBe(OPENROUTER_DEFAULT_REFERER);
      expect(headers.get("x-title")).toBe(OPENROUTER_DEFAULT_TITLE);
      const requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(requestBody.model).toBe(model);
      expect(BUILT_IN_PROVIDER_MODEL_CATALOG.openrouter).toContain(model);
    },
  );

  test("lets explicit OpenRouter routing headers override AgenC defaults", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "chatcmpl_openrouter_headers",
          model: "openai/gpt-5",
          choices: [
            {
              message: {
                role: "assistant",
                content: "ok",
              },
              finish_reason: "stop",
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const provider = new OpenRouterProvider({
      apiKey: "or-test",
      model: BUILT_IN_PROVIDER_DEFAULT_MODELS.openrouter,
      defaultHeaders: {
        "HTTP-Referer": "https://app.agenc.tech",
        "X-Title": "AgenC Test",
      },
      fetchImpl,
    });

    await provider.chat([{ role: "user", content: "hello" }]);

    const [, init] = fetchImpl.mock.calls[0] ?? [];
    const headers = init?.headers as Headers;
    expect(headers.get("http-referer")).toBe("https://app.agenc.tech");
    expect(headers.get("x-title")).toBe("AgenC Test");
  });
});
