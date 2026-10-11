# Luna max: where Light's model time went

Light loses time mainly while generating more fresh reasoning, at a lower effective output rate. The largest actionable request difference is that Light discards the returned reasoning state between calls, while Pi replays it. Pi also requests automatic reasoning summaries. The recordings cannot separate the causal effect of those two differences from the prompts and the different work each agent chooses. They do show that a changing early Light instruction is not the explanation.

There is a material correction to the premise: both arms **send** `max_output_tokens: 8192`, but the served responses report `max_output_tokens: null`. Twenty-two Light calls and eight Pi calls exceed 8,192 output tokens. This is an acquisition with equal requested caps, not an acquisition with an enforced 8,192 generation cap. No code-only change in Core can establish that the remote relay enforces it.

Candidate commit: `8a324604d8f5e381cbf6364013c00c3b3410296e` on `r3/lx`, directly based on main `fdd18bfc2068`. It completes the existing, default-off OpenAI reasoning replay experiment by choosing automatic summaries when the user has not selected a summary mode. It preserves an explicit `none`. No default promotion is recommended from these recordings.

## Evidence and limits

This audit reads the 23 scored pair selections in `jobs/lu/hard28-luna-max-v7/pairs`, following their original result paths into earlier epochs. Discarded setup attempts and the three later disk cancellations are excluded. The actual Pi installation is the recorded Pi 1.0.0, rather than the Pi 0.73.1 in the initial round plan. Light is main `fdd18bfc2068`, bypass mode, balanced 2.4M task budget; Pi has no task token budget. The model is `gpt-6-luna`, effort `max`, through the same recording route and relay.

[validation.json](validation.json) verifies 2,647 immutable file hashes, 46 selected results and 867 unique physical calls. Counts and all four usage totals exactly reproduce lu. Light has six calls without usage and Pi has two. Every token total here remains a lower bound where applicable. [calls.json](calls.json) holds every call's parameters, tool names and sizes, instruction hashes, input size, cached tokens, latency, output/reasoning tokens, effective tokens per second and replay evidence. It points to the original request, response and receipt, without copying cells. [TIMEOUT-CALLS.md](TIMEOUT-CALLS.md) walks every call in all six timeout/solve cells, with input, cache, output, reasoning, seconds and actions. [timelines.json](timelines.json) retains short preceding-result excerpts for that review.

Seconds are descriptive concurrent recordings. There is no matched A/A noise floor and no causal speed, cost or solve-retention result. Per-call latency is `finished_monotonic - started_monotonic`. Per-task model time is lu's union of those intervals clipped to the agent's start/end. Raw call durations include recording cleanup after a task stops and can include a waiting arrival, so their sums are slightly greater than the clipped task totals.

**Local time to first byte was not recorded.** The proxy saves request start, receipt finalization and raw SSE bytes, but no per-chunk arrival timestamps. File timestamps and SSE sequence numbers cannot recover TTFB. The `response.created` and `completed_at` timestamps are whole-second server timestamps, useful only as coarse generation evidence. The mean server-created-minus-local-request timestamp is 0.556 s for Light and 0.552 s for Pi, without clock synchronization or subsecond precision. These are not TTFB measurements.

## Exact wire comparison

These values hold for every forwarded call; cell-specific cache-key strings and varying tool schemas are in the per-call ledger.

| Field | Light, 395 calls | Pi, 472 calls |
|---|---|---|
| `model`, `stream` | `gpt-6-luna`, `true` | Same |
| `reasoning` | `{"effort":"max"}` | `{"effort":"max","summary":"auto"}` |
| `include` | Absent | `["reasoning.encrypted_content"]` |
| `store` | `false` | `false` |
| `previous_response_id` | Absent | Absent |
| `prompt_cache_key` | Stable `conv-...` within a cell | Stable session UUID within a cell |
| `parallel_tool_calls` | `true` | Absent; served as `true` |
| `max_output_tokens` | `8192`; served as `null` | Same |
| `text`, `service_tier` | Absent | Absent |
| Prior reasoning in input | None | Replayed, provider-returned reasoning items |
| `instructions` | 2,685 UTF-8 bytes, 654 attributed tokens | Absent; coding prompt is the first developer input |
| System/developer input text | Stable 495-byte system tail at the end | Usually 2,703-byte developer prompt at the beginning |
| Mean compact serialized request / input bytes | 77,278 / 70,914 | 294,717 / 291,689 |
| Mean input tokens on known-usage calls | 24,191 | 37,971 |

For the usual four-tool schemas, compact sizes per tool are Light search 669, exec 844, FileRead 786 and apply_patch 677 bytes; Pi read 671, bash 530, edit 1,166 and write 417 bytes. Array punctuation is included in the list totals of 2,981 and 2,789 bytes. Every other tool list and size is retained per call rather than treated as the usual schema.

## Arithmetic of the gap

| Metric | Light | Pi |
|---|---:|---:|
| Scored tasks / solves | 23 / 11 | 23 / 14 |
| Physical calls | 395 | 472 |
| Raw request seconds, total / per call | 16,226.72 / 41.08 | 8,078.39 / 17.12 |
| Clipped model seconds per task | 702.69 | 351.23 |
| Agent wall seconds per task | 729.36 | 376.52 |
| Input / cached input | 9,410,420 / 2,266,624 | 17,846,403 / 6,712,832 |
| Cache share | 24.09% | 37.61% |
| Known output / reasoning | 820,029 / 712,280 | 563,645 / 444,218 |
| Known output per all calls | 2,076.02 | 1,194.16 |
| Known reasoning per all calls | 1,803.24 | 941.14 |
| Calls with authoritative usage | 389 | 470 |
| Seconds per call, known usage only | 39.67 | 17.15 |
| Output / reasoning per known call | 2,108.04 / 1,831.05 | 1,199.24 / 945.14 |
| Effective output tokens/s, known output divided by known-call seconds | 53.14 | 69.94 |

Reasoning is already included in output, not added to it. On known-usage calls, 885.91 of the 908.80 extra output tokens per call are reasoning, or 97.48%. Per task, Light has 11,654.87 more known reasoning tokens, while its non-reasoning output is 507.74 tokens lower. Light makes 3.35 fewer calls per task, so excess call count is not the explanation in this acquisition.

An exact accounting identity, using Pi's observed effective output rate as a reference, splits the known-call mean gap of **22.52 s/call** into **12.99 s/call from the output-volume difference** and **9.53 s/call from the effective-rate difference**. The corresponding known-call task totals split into **159.39 and 161.11 s/task**, or 320.50 s/task combined. Unknown-usage calls add a raw 33.78 s/task difference. The raw total gap is 354.27 s/task; interval union and task clipping give the reported 351.46 s/task gap. This decomposition is arithmetic, not an estimated saving from either intervention. See [decomposition.json](decomposition.json).

Coarse server generation accounts for the known-call means as well: Light 38.37 s and Pi 15.85 s, with approximately 1.30 s/call residual in both arms. Pi sends more total input, more uncached input per known call, and about four times the serialized request bytes. Thus larger input or local request serialization cannot explain Light's positive time gap on their own.

## Ranked causes and interventions

### 1. Missing reasoning continuity is the strongest fixable mechanism

All 395 Light inputs contain **zero reasoning items**. All 449 Pi follow-up requests contain replayed reasoning; **all 1,107 preceding-response reasoning items are replayed with identical item values**. This includes their ids, summaries and encrypted content. Light's responses actually contain 1,648 completed encrypted reasoning items despite its missing `include` parameter. The important loss is their persistence and replay, not simply whether the server returned encrypted content.

Both arms use `store: false` and omit `previous_response_id`. Light therefore supplies neither server-side conversation continuity nor stateless reasoning continuity. It sends prior visible text, function calls and results, but the reasoning that led to those actions is missing. Pi supplies that state in its growing stateless input. This is a plausible mechanism for repeated planning and reconstruction, especially in the long binary/image tasks. The recordings cannot measure how many of Light's 712,280 reasoning tokens would disappear under replay.

The direct exposure is the 256,384 additional known output tokens and 268,062 additional known reasoning tokens over 23 tasks, together with the 159.39 s/task output-volume component above. Do not assign all of that to replay. Different prompts, strategies and solve trajectories also contribute. The three missed Pi solves make the hypothesis concrete: Light spends its time inspecting and reasoning without writing the requested implementation, rather than consuming an extra completion-gate tail.

Main already has a tested replay switch, `AGENC_OPENAI_REASONING_REPLAY=1`. In `runtime/src/llm/providers/openai/adapter.ts`, `openAiReasoningReplayEnabled` reads the session-captured environment and `reasoningReplayOptions` enables only the `openai` adapter. The stream retains done reasoning items, including a fallback when the terminal output is empty. In `runtime/src/llm/wire/responses-openai.ts`, `extractOpenAIReasoningReplay` keeps id, summary and encrypted content with provider/model provenance; `replayedReasoningItems` rejects absent, mismatched or malformed provenance. The builder requests encrypted content and places it before a message's function calls, or before text on a tool-free turn. Durable history already preserves the state.

**Implemented candidate:** retain that default-off switch, and make its unset summary selection `auto` when a non-`none` reasoning effort is selected. The task loop previously materialized the model metadata default `none`, making it indistinguishable from an explicit user disable. The patch carries that distinction from `buildTurnContext` through `buildProviderOptions` to the Responses builder. Explicit `none`, `concise`, `detailed` and `auto` win. Stored requests, replay-off requests, non-reasoning requests and other provider adapters retain their existing wire behavior. The default CLI request remains unchanged. The added metadata flag is not sent on the wire.

Expected effect: preserved state may reduce repeated fresh reasoning, and the combined experiment reaches Pi's `include` and summary settings without lowering effort. A numerical solve-preserving saving is unknown and could be zero. Solve risk is real: stale reasoning can reinforce a bad plan; extra replayed input can reach the 2.4M task budget sooner; automatic summaries can add output or change strategy. Pi's replayed reasoning alone accounts for 6,302,670 input tokens, 274,029 per task. Keep the candidate off and measure quality before considering a default.

### 2. The summary setting is associated with the effective-rate difference

Every Light request sends `reasoning: {effort: "max"}`. Every Pi request adds `summary: "auto"`. Every served Light snapshot reports `summary: null`; every Pi snapshot reports `summary: "detailed"`. Other served reasoning fields match: `effort: max`, `context: all_turns`, `mode: standard`. Pi emits about 161.64 summary characters per call on average; Light emits none. Both finish on service tier `default` when complete.

For complete calls with at least 512 output tokens, Light has 224 calls / 785,603 tokens / 14,561.42 seconds, an effective 53.95 tokens/s. Pi has 199 / 505,995 / 6,730.61, or 75.18 tokens/s. Using the coarse server generation interval, 128 of those Pi calls exceed 90 tokens/s versus one Light call. This is not just a handful of long Light timeouts.

The cache evidence does not explain this separation: Light's large-call effective rate is 53.88 with cached tokens and 53.98 without; Pi's is 69.06 with cached tokens and 80.32 without. Selection by output length, task and trajectory remains a confounder. There are no within-Light recordings that toggle summary or replay independently. The 9.53 s/call and 161.11 s/task effective-rate component is not a causal summary effect, and the backend's scheduling or decoding mechanism is not recorded.

The same candidate permits a four-arm check: replay off / explicit `none`; replay off / explicit `auto`; replay on / explicit `none`; replay on / unset summary, which becomes `auto`. This is preferable to claiming that either parameter alone explains the rate. No effort reduction, early stream interruption or default change was implemented.

### 3. The relay's missing cap permits long reasoning calls in both arms

The recording proxy checks the input cap and forwards the original request body unchanged. All requests pass 8,192 and all served snapshots report no cap. Complete usage exceeds 8,192 in **22 Light calls, consuming 5,226.97 seconds and 287,756 output tokens**, versus **eight Pi calls, consuming 1,224.69 seconds and 107,503 output tokens**. Their full-call exposure differs by 174.01 s/task. This overlaps the output/rate accounting and is not extra time to add to it, nor the time that enforcing a cap would save.

Examples: Light polyglot call 2 is 396.96 s / 21,980 output / 21,941 reasoning. Light configure-git call 2 is 368.89 s / 20,399 / 17,149. Light MIPS call 20 is 210.36 s / 11,582 / 11,463. Pi also exceeds the cap, including its MIPS implementation call 14, 116.31 s / 17,972 output. Enforcing 8,192 could truncate productive implementations and require recovery; it cannot be assumed solve-safe.

No Core cap enforcement patch is proposed. Aborting after an estimated token count would recreate the intervention tq found unsafe and would leave authoritative usage unknown. The lead should verify the relay's accepted/forwarded generation parameters before calling a future study an 8,192-cap comparison. The next check must either demonstrate enforcement or label the backend uncapped explicitly.

### 4. Cache breaks exist, but a changing early instruction does not dominate

Within every Light cell, the 2,685-byte `instructions` field is identical across calls, and so is the system-role dynamic tail. There are **zero instruction-text changes and zero wire cache-key changes in 372 Light transitions**. The tail lives at the end of input; inserting new conversation items before it preserves the preceding conversation prefix. The relay's served instruction field also stays identical within each Light cell. There is no moving timestamp, remaining-budget counter or continually rewritten permission text in the early instruction prefix in this acquisition.

The concrete changes are:

| Prefix event | Light calls affected | Raw seconds total / per task | Known input | Cached | Known reasoning |
|---|---:|---:|---:|---:|---:|
| Replace older tool output with microcompact markers | 10 | 149.36 / 6.49 | 678,672 | 0 | 6,408 |
| Change tool schema list or presentation | 11 | 68.88 / 2.99 | 247,920 | 0 | 875 |
| Either, deduplicated | 20 | 213.97 / 9.30 | 895,623 | 0 | 7,214 |

These are full-call exposures, not measured cache penalties. One OCaml call belongs to both rows. The other 352 Light follow-ups with stable earlier input and tools account for 15,949.92 raw seconds, 703,286 known reasoning tokens and all 2,266,624 cached tokens. Prefix changes on the 20 directly affected calls cannot by themselves explain the dominant stable-call generation gap. A longer cache warm-up effect after a break is possible and is not identified here.

The ten old-output changes are OCaml calls 15 and 30, MIPS 11, path-tracing 36-40 and 45, and reverse-tracing 10. The earliest preserved-input length is eight items in the MIPS and reverse cells. Their original results become `[microcompact:N] Older tool output compressed; original length ...` in the next request. Main's `services/compact/microCompact.ts` clears older large results under a 120,000-character pressure limit, preserving recent results and the latest read per path. `session/run-turn-query-messages.ts` also budgets tool results and bounds retained memory. Disabling these bounds to preserve cache would risk memory/context failures; no such change is included.

The eleven schema changes occur when deferred tools become available, `write_stdin` is introduced, or an advanced exec schema replaces the lean one. Pi's four-tool list is unchanged in every transition. Pi has one early input rewrite, path-tracing call 37, where its developer prompt's installation documentation paths change. That call also has zero cached tokens.

There is a separate routing warning: although each arm's **sent** cache key is stable within its cell, every `response.created` echoes a different UUID cache key, 395 unique in Light and 472 in Pi. The recording proxy forwards the raw body; the transformation happens beyond it. The files do not prove whether the echoed value is the actual routing key, but one cannot assume the stable client key reaches the backend unchanged. This affects both arms, so it is not a Light-specific explanation.

Provider attribution shows the cache-share difference is not merely an encrypted-payload denominator artifact. Pi attributes 6,302,670 input / 2,157,100 cached tokens to reasoning items. After subtracting them, Pi still has 11,543,733 input / 4,555,732 cached, 39.47%. Light's corresponding share is about 24.09%. However, Pi also has more uncached input per known call, approximately 23,688 versus 18,365. Cache share is not a substitute for measured prefill time. See [cache-attribution.json](cache-attribution.json).

### 5. Tool batching, policies and budget messages are secondary here

Light explicitly sends `parallel_tool_calls: true`; Pi omits it, but both served snapshots report `true`. Light's usual four tools are the encoded search tool, lean `exec_command`, `FileRead` and `apply_patch`. Pi uses `read`, `bash`, `edit` and `write`. Light's usual schema is 2,981 compact UTF-8 bytes and 545 attributed input tokens; Pi's is 2,789 bytes and 478 tokens. Light's variable schemas average 3,467 bytes / 620 tokens. Light's static instructions are 654 attributed tokens, while Pi places its roughly comparable coding prompt in the first developer input item. The serialized sizes are recomputed from recorded JSON, not a retained HTTP Content-Length.

Nothing in these schemas produces a mandatory 24-second runtime wait per model call. Light actually makes fewer samples. The three timeout traces do not show a completion-gate or continuation-nudge tail, and lu reports zero reasoning-only caps. ci's DeepSeek finding about Pi ending on capped reasoning cannot be transferred to this cohort. Path-tracing does contain a repeat-poll advisory before call 21 and a native budget reminder before call 46. Neither changes the early instructions; the last reminder is appended conversation text. Its 207.09-second interrupted response is included once in the unknown-usage time, not charged again as a separate cause.

## The three Light timeouts

Every call and its parameters are retained in the linked ledger and [TIMEOUT-CALLS.md](TIMEOUT-CALLS.md). The phase accounting below uses raw call durations; the task table uses lu's clipped model duration. Wall minus model is a residual that includes tools and harness/runtime gaps, not a measurement of tool execution alone.

| Task | Light / Pi calls | Light / Pi wall s | Light / Pi clipped model s | Light / Pi wall-minus-model s | Light / Pi known output | Light / Pi known reasoning |
|---|---:|---:|---:|---:|---:|---:|
| make-mips-interpreter | 37 / 22 | 1,802.26 / 393.75 | 1,795.91 / 387.41 | 6.35 / 6.34 | 92,855 / 37,990 | 84,530 / 23,645 |
| path-tracing | 46 / 59 | 1,804.61 / 1,198.86 | 1,611.90 / 1,046.58 | 192.71 / 152.28 | 74,293 / 83,815 | 65,825 / 67,906 |
| path-tracing-reverse | 24 / 36 | 1,802.23 / 833.66 | 1,795.97 / 825.94 | 6.26 / 7.72 | 84,859 / 49,131 | 80,582 / 41,508 |

### make-mips-interpreter

Light calls 1-13 spend 278.48 s inspecting source, ELF headers, syscall handling and opcodes, generating 11,060 reasoning tokens. Call 14 loses its stream after 35.47 s with no usage and no complete action. Calls 15-27 spend another 724.58 s, 34,779 known reasoning tokens, on more source/disassembly exploration. Call 20 alone spends 210.36 s generating 11,463 reasoning tokens before another short read command.

Calls 28-36 spend 734.32 s on memory allocation, large ELF/BSS layout and opcode coverage, generating 38,691 reasoning tokens. Call 28 tests WebAssembly memory after 196.74 model seconds and 10,728 reasoning tokens. Calls 31, 35 and 36 take 124.17, 124.42 and 126.63 s, respectively, for more inspection/probes. None writes `vm.js`. Call 37 is stopped while reasoning, 39.21 recorded seconds and no authoritative usage. The raw total is 1,812.06 s; the clipped task model total is 1,795.91 s.

Pi calls 1-13 spend 129.06 s inspecting the same source and binary, 9,876 reasoning tokens. Call 14 writes `vm.js` after 116.31 s, with 17,972 total output but only 7,384 reasoning. Calls 15-17 boot Doom and inspect its first frame in 32.16 s. Call 18 edits the interpreter in 60.97 s. Calls 19-22 spend 48.92 s checking syntax, booting, verifying two frames and finishing. The hidden grader passes. Pi commits to an implementation early enough to test it; Light never reaches that stage.

### path-tracing

Light calls 1-9 spend 85.19 s on image and pixel structure. Calls 10-17 spend 666.71 s / 34,222 reasoning tokens on geometry, then start a background grid fit. Calls 18-23 spend 169.10 model seconds while that work runs. Four direct poll responses are short; calls 21 and 22 spend **151.94 s / 8,133 reasoning tokens** to issue `ls -la` and a process listing. The repeat-poll advisory appears before call 21. This is expensive reasoning while waiting, not 151 seconds of tool polling.

Calls 24-32 spend 388.14 s / 17,771 reasoning tokens on fitting and code snippets, including compile/link-order repairs. Calls 33-45 spend 108.70 s on an `orig` binary detour, disassembly, colors and another comparison. Microcompaction changes old tool outputs in calls 36-40 and 45. The final input adds the native near-budget reminder. Call 46 consumes 207.09 recorded seconds, returns 22 completed encrypted reasoning items but no completed action or usage, and is cut at the task deadline. No requested `image.c` was written. The timeout stop completed 2.350 s late, retained as an unsolved timeout per lu's adjudication.

Pi also investigates pixels and geometry extensively: calls 1-18 133.86 s, 19-40 618.04 s and 41-54 236.71 s. Call 55 writes `image.c` in 20.45 s. Calls 56-59 compile, compare, check residual checker errors and finish in 37.52 s. It solves with **more** known output and reasoning than Light, 83,815 / 67,906 versus 74,293 / 65,825. Here output volume alone cannot explain the miss. Pi's greater effective rate and Light's long final interrupted response matter, along with the waiting decisions and different exploration. Both are text-only on the recorded wire: Pi's attempted preview read explicitly omits the image because its model metadata says images are unsupported. There is no recorded visual-input advantage to credit Pi.

### path-tracing-reverse

Light calls 1-9 spend 115.32 s inspecting the binary and rendered image. Calls 10-17 spend 828.90 s / 43,812 reasoning tokens on pixel geometry and disassembly. Calls 18-23 spend another 623.74 s / 33,065 reasoning tokens on more analysis. Call 21 alone is 254.26 s / 14,009 output / 13,726 reasoning before issuing another pixel-bounds command. Light never writes `mystery.c`. Call 24 is interrupted after 244.64 recorded seconds, with 26 completed reasoning items and no completed action or usage. Raw call time is 1,812.61 s; clipped model time is 1,795.97 s.

Pi calls 1-14 inspect the binary and image in 325.67 s. Call 15 writes `mystery.c` in 99.26 s, generating 14,139 output / 13,223 reasoning tokens. Calls 16-28 spend 330.45 s compiling, comparing pixels and editing the renderer, including one long 216.06-second edit. Calls 29-36 spend 70.57 s obtaining exact image and stderr comparisons, repairing progress output, cleaning generated files and finishing. The hidden grader passes. Both arms contain long reasoning, but Pi repeatedly carries its state forward and reaches a tested file within the deadline.

## Code, validation and next check

The patch changes only the existing replay experiment and the provenance needed to select its default summary. It does not alter the task budget, effort, output limit, tool concurrency, shell-write rules, admissions, sandbox, approvals, verification, retention bounds or durability format. Tests cover wire-default preservation, explicit overrides, storage, reasoning disabled, same-provider/model replay, durable restoration, streaming and buffered Luna calls, and the actual turn-context to sampling-options to wire path. The exact final commit passed **183 tests across seven hermetic files**, through `round3/lead/test-commit.sh` and its heavy wrappers. Logs and the command are in [TESTS.md](TESTS.md).

Reproduce all offline evidence, without importing the live harness or loading credentials:

```sh
python3 /home/paul/claude-agenc-work/light-swarm/round3/jobs/lx/audit.py
python3 /home/paul/claude-agenc-work/light-swarm/round3/jobs/lx/analyze.py
/home/paul/claude-agenc-work/light-swarm/round3/bin/heavy python3 /home/paul/claude-agenc-work/light-swarm/round3/jobs/lx/validate.py
```

The live proposal is in STATUS. It separates replay from summaries and verifies the relay cap before a matched task check. No live provider call, paid panel, Docker task run, push or upload was launched. All new evidence files are small local derivatives; lu, t4, Pi installations and their dependencies were not modified.

SWARM_RESULT: 8a324604d8f5e381cbf6364013c00c3b3410296e | Offline 867-call Luna audit: missing reasoning replay, summary/rate association, ineffective relay cap, bounded cache breaks; default-off replay-summary candidate, no live efficacy claim.
