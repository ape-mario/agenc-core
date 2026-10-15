/** Venice error bodies can be plain strings. Redact the actual credential
 * before shared diagnostics see them, even if an upstream error echoes it.
 */
export function veniceFetch(fetchImpl: typeof fetch, apiKey: string | undefined): typeof fetch {
  const redact = (value: string): string => apiKey ? value.replaceAll(apiKey, "[REDACTED]") : value;
  return async (input, init) => {
    let response: Response;
    try {
      response = await fetchImpl(input, init);
    } catch (error) {
      if (!(error instanceof Error) || !apiKey || !error.message.includes(apiKey)) throw error;
      throw new Error(redact(error.message));
    }
    if (response.ok) return response;
    const headers = new Headers(response.headers);
    headers.forEach((value, name) => headers.set(name, redact(value)));
    // Venice's request reset is a Unix timestamp. Its token reset is a delay
    // in seconds. Convert to the shared Retry-After contract without
    // overriding a standard Retry-After header supplied by the endpoint.
    if (response.status === 429 && !headers.has("retry-after")) {
      const requestReset = headers.get("x-ratelimit-reset-requests");
      const tokenReset = headers.get("x-ratelimit-reset-tokens");
      const requestSeconds = requestReset !== null && /^\d+(?:\.\d+)?$/u.test(requestReset)
        ? Math.max(0, Number(requestReset) - Date.now() / 1000) : 0;
      const tokenSeconds = tokenReset !== null && /^\d+(?:\.\d+)?$/u.test(tokenReset)
        ? Number(tokenReset) : 0;
      const seconds = Math.ceil(Math.max(requestSeconds, tokenSeconds));
      if (Number.isSafeInteger(seconds) && seconds > 0) headers.set("retry-after", String(seconds));
    }
    const body = redact(await response.text());
    headers.delete("content-length");
    headers.delete("content-encoding");
    return new Response(body, { status: response.status, statusText: redact(response.statusText), headers });
  };
}
