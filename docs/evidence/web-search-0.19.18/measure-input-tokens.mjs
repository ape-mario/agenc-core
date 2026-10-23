// Run with DEEPSEEK_API_KEY supplied by the calling subshell. Never log credentials.
import { readFileSync } from "node:fs";
const rows = JSON.parse(readFileSync(new URL("./token-probe-payloads.json", import.meta.url), "utf8"));
if (!process.env.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY is required");
for (const { light, mode, body } of rows) {
  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Token probe HTTP ${response.status}`);
  const result = await response.json();
  console.log(JSON.stringify({ light, mode, usage: result.usage }));
}
