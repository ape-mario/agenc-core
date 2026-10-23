# Manual web search evidence

Tested on 2026-10-23 in `feat/web-search-toggle`, based on `bb42aee00`.
Target release: 0.19.18. Providers were real paid APIs. The TUI ran under a
132-column, 42-row PTY. Every run had its own HOME and AGENC_HOME. Project
trust and page-fetch approvals were accepted through the real TUI cards.

## Token measurement

DeepSeek Flash's reported `usage.prompt_tokens`, using the actual registry
schemas, the production wire-name encoding, an identical short base prompt,
and one output token. The On variants add the final system instruction.
No MCP tools or workspace content were included. Counts isolate the extra
request cost; they are not the full live conversation's context size.

| Mode | Light input tokens | Added | Standard input tokens | Added |
|---|---:|---:|---:|---:|
| Auto | 786 | 0 | 2215 | 0 |
| WebSearch alone | 927 | 141 | 2349 | 134 |
| On: WebSearch + web_fetch | 1065 | 279 | 2478 | 263 |

`tokens.json` contains usage receipts and tool names. `token-probe-payloads.json`
contains the exact wire payloads. `measure-input-tokens.mjs` repeats the six
one-token requests when DEEPSEEK_API_KEY is supplied by a calling subshell.
`tool_choice` must be `auto`: DeepSeek ignores tool schemas with `none`.
Early probes with `none` were discarded. The search-only comparison removes
web_fetch from On and restores its deferred-tool pointer in standard mode.
Other providers can tokenize these schemas differently.

## Live runs

Prompt, unchanged in every run:

> Search the web: what did China's State Council announce this week? Give 3 points, each with a link from gov.cn or xinhua.net.

| Run | First tool | Search backend | Calls | Recorded USD |
|---|---|---|---|---:|
| DeepSeek Flash, search-only candidate | WebSearch | DeepSeek | 6 searches, 4 model calls | 0.012542340 |
| DeepSeek Flash, Auto | system.searchTools | DeepSeek after discovery | 4 discovery calls, 5 searches, 5 fetches, 11 model calls | 0.019833888 |
| DeepSeek Flash, final On | WebSearch | DeepSeek | 5 searches, 4 fetches, 7 model calls | 0.013132668 |
| OpenAI GPT-6 Luna, On | WebSearch | DuckDuckGo | 6 searches, 4 fetches, 9 model calls | 0.002435476 |

The search-only candidate finished in 14 seconds but explicitly said it had
not opened the pages. That motivated including web_fetch. Final On read the
pages and returned three gov.cn links. Its only shell call was `date -u`.
There were no curl or wget calls in either On run. Auto also searched
successfully, after four discovery calls. This preserves its existing
behavior; Auto does not prohibit search.

DeepSeek's tool rows show `8 results via DeepSeek search`. OpenAI's rows show
results via DuckDuckGo. The final On, Auto, and OpenAI wall times include
manual waits at page-fetch approval cards and should not be compared as
provider speed measurements.

Mistral Small was attempted first but returned rate limits. Grok 4.3 then
reported no credits. Both failed before billed model output. Their diagnostic
transcripts and screens are retained. OpenAI completed the non-DeepSeek check.

Recorded live spend totals **$0.047944372**, including search receipts.
Allowing $0.02 for all token probes, including discarded attempts, keeps the
entire task below **$0.07**, well below the $2 cap. Every live session had a
$0.30 admission cap. Keys were loaded only in a subshell and were not saved
in test config or evidence.

## Artifacts

- `deepseek-on.png`, `deepseek-auto.png`, `openai-on.png`: final PTY screens.
- `deepseek-search-only.png`: the first measurement run.
- `model-picker.png`: final /model row, including DeepSeek Search state.
- `trust-card.png`: the real project trust card.
- Each `.jsonl`: session metadata, all conversation response items, and final
  usage. Unicode is JSON-escaped without changing transcript content.
- Each `-summary.json`: tool sequence and exact cost receipt.
- Each `.ansi.gz`: complete recorded PTY output. PNG screens are rendered
  from this output with the repository's terminal renderer. A Ctrl+L redraw
  was used for the final screens.

## Validation

- Typecheck, including test support: passed.
- Production build, package entrypoints, generated SDK parity: passed.
- 14 affected test files: 473 passed.
- `git diff --check`: passed.
- Extra `npm run test:required-gates`: 155 passed, 15 failed, 3 skipped.
  This broader gate-contract suite requires Linux and Node 26.12.1. This
  host runs macOS and Node 26.8.1. Failures include Linux-only mount/cgroup
  assumptions, the exact Node version assertion, macOS temporary-path
  permission probes, and process cleanup contracts. These gate files are
  unchanged by this PR. Full Linux gate validation remains outstanding.

The four `.log` files preserve typecheck, build, affected-test, and additional
gate-suite output, with terminal color and trailing whitespace removed.

Affected test command:

```sh
npm run test:host-functional --workspace=@tetsuo-ai/runtime -- \
  tests/tools/rare-tool-deferral.test.ts \
  tests/config/payload-switches-config.test.ts \
  tests/config/strict-schema-validation.test.ts \
  tests/prompts/system-prompt.test.ts \
  tests/bin/model-facing-tools.test.ts \
  tests/commands/providers-hub.render.test.tsx \
  tests/commands/providers-hub-model-search.render.test.tsx \
  tests/commands/providers-hub.test.ts \
  tests/commands/web-search-mode.test.ts \
  tests/tui/components/statusLineLayout.test.ts \
  tests/tui/components/FullscreenLayout.usage-indicators.test.tsx \
  tests/llm/provider-environment.test.ts \
  tests/llm/providers/deepseek/web-search.test.ts \
  tests/session/light-fixed-prefix.test.ts
```
