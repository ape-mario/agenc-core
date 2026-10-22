/**
 * OpenRouter's refusal when its data policy leaves no endpoint for a model.
 *
 * With `provider.zdr = true` (AgenC's default) a model that has no
 * zero-data-retention endpoint is refused before anything is generated. The
 * answer seen on 2026-10-22 was HTTP 404 with
 * `{"error":{"message":"No endpoints found matching your data policy (Zero
 * data retention). Configure: https://openrouter.ai/settings/privacy",
 * "code":404,"metadata":{"failed_routing_step":"Filter by Data Policy"}}}`.
 * The same refusal comes from the account's own privacy settings. It never
 * succeeds on retry, so the turn gets a plain explanation instead.
 *
 * @module
 */

const DATA_POLICY_MESSAGE = /no endpoints found matching your data policy/iu;
const ZERO_RETENTION_POLICY = /zero data retention/iu;

function bodyText(body: unknown): string {
  if (typeof body === "string") return body;
  if (body === undefined || body === null) return "";
  try {
    return JSON.stringify(body);
  } catch {
    return "";
  }
}

export type OpenRouterDataPolicyRefusal = "zero-data-retention" | "other";

/** Which data policy refused the request, or undefined for any other failure. */
export function readOpenRouterDataPolicyRefusal(args: {
  readonly providerName: string;
  readonly status: number;
  readonly message: string;
  readonly body: unknown;
}): OpenRouterDataPolicyRefusal | undefined {
  if (args.providerName !== "openrouter" || args.status !== 404) return undefined;
  const text = `${args.message}\n${bodyText(args.body)}`;
  if (!DATA_POLICY_MESSAGE.test(text) && !/"failed_routing_step"\s*:\s*"Filter by Data Policy"/u.test(text)) {
    return undefined;
  }
  return ZERO_RETENTION_POLICY.test(text) ? "zero-data-retention" : "other";
}

export function openRouterDataPolicyErrorMessage(refusal: OpenRouterDataPolicyRefusal): string {
  return refusal === "zero-data-retention"
    ? [
        "OpenRouter has no zero-data-retention endpoint for this model, so it refused the request.",
        "Choose a model in /model that is not marked no ZDR, or set zero_data_retention = false under [providers.openrouter].",
        "If your OpenRouter account itself requires ZDR, change that at https://openrouter.ai/settings/privacy.",
      ].join(" ")
    : [
        "OpenRouter's data policy for this account leaves no endpoint for this model, so it refused the request.",
        "Choose another model, or change the policy at https://openrouter.ai/settings/privacy.",
      ].join(" ");
}
