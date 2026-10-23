# Kimi integration report

Updated 2026-10-23. Worktree: `/Users/tetsuoarena/claude-agenc/wt-kimi`. Branch: `feat/kimi-k3-1`. Continuation baseline: `58aed4d0d`.

The full native success benchmark remains blocked by Moonshot funding. The account returned $0 available, $0 vouchers, and -$0.09476 cash both before and after this continuation. All six currently offered native models were submitted through the freshly built CLI with all six task inputs. All 36 requests returned HTTP 429 `exceeded_current_quota_error`, explicitly citing insufficient balance. Six final file-task confirmations also stopped after one request each. These 42 refusals are not model solves or evidence of model quality.

New Moonshot spend is $0. Including the first agent's $0.191416725 OpenRouter spend conservatively against the owner's $20 total cap leaves $19.808583275 unspent. The requested full-budget testing cannot proceed until this Moonshot account is funded. No alternate provider was charged in this continuation.

The first agent's complete report is preserved locally as `glm-fit/FIRST-AGENT-K-REPORT.md`. Its implementation commit `58aed4d0d` and draft [PR #3264](https://github.com/tetsuo-ai/agenc-core/pull/3264) remain the delivery baseline. No merge was performed.

## Native discovery and scope

Authenticated `GET /v1/models` still returns exactly these six IDs. No separate `kimi-k2-thinking`, K2.5, K2, or `moonshot-v1` model is listed by this native global account. Retired IDs were not guessed, and OpenRouter listings were not substituted for native availability. All six listed models advertise image input and reasoning.

| Model | Context | Reasoning |
| --- | ---: | --- |
| `kimi-k3.1-pro` | 1,048,576 | always on, low/high/max |
| `kimi-k3.1-pro-highspeed` | 1,048,576 | always on, low/high/max |
| `kimi-k3` | 1,048,576 | always on, low/high/max |
| `kimi-k2.7-code` | 262,144 | code model with preserved thinking |
| `kimi-k2.7-code-highspeed` | 262,144 | code model with preserved thinking |
| `kimi-k2.6` | 262,144 | thinking enabled with full replay |

The [official parameter reference](https://platform.kimi.ai/docs/api/models-overview) allows omitted thinking controls for K2.7 Code, requires reasoning preservation, and gives K3 its effort enum. K2.6 uses `thinking: {type: "enabled", keep: "all"}`. K3.1 metadata comes from authenticated discovery; public K3.1 pricing is still absent. The branch retains K3 as default and does not invent K3.1 prices.

## Procedure and fixtures

Both `HOME` and `AGENC_HOME` were the exact supplied `.../scratchpad/orsweep/home-zdr` path. This corrects the earlier runner's use of its `.agenc` child. The six exact slot directories were trusted through the built CLI's terminal prompt, without writing or copying `trusted-projects.json`. Those trust setup invocations had no API key and made no inference calls. The isolated daemon was then stopped and restarted with the measurement hook, and stopped again after the sweep.

The Moonshot key was sourced only within a subshell from the supplied provider env file, with tracing disabled. Only `MOONSHOT_API_KEY` was forwarded to CLI runs. No key was printed, logged, copied to disk, or committed. No real-home AgenC, Codex, SSH, or unrelated credential files were used. All slot contents were preserved in per-run backups.

Each CLI run used `-p --bypass-approvals --light --task-max-calls 24 --deadline +300 --deadline-reserve 1s`, with output limited to 4,096 tokens per request. Prompts were passed through stdin. Calls were sequential, newest models first. Times below are CLI wall seconds, excluding fixture creation and tokenizer calibration.

| Task | Required evidence |
| --- | --- |
| file | Write exact `hi` bytes, then read the file with a tool. |
| multi-file | Rename an export and its consumer, preserve behavior, run the protected test. |
| debug | Run the test before edits, observe its assertion failure, fix the loop, rerun successfully. |
| replay | Implement six sequential pipeline stages, inspect each stage result, compose and test the pipeline, preserve reasoning across calls. |
| vision | Inspect the actual PNG attachment, write and read back counts of red squares, blue circles, and green triangles. |
| long-context | Retrieve three separated records from a provider-calibrated 96k to 101k token prompt and write/read the answer. |

All six image probes contained an image part in the outgoing API request. Moonshot's tokenizer also refused every calibration request for insufficient balance. The long-input refusal probes therefore used a deterministic 4,200-record fallback, with outgoing request bodies of 246,122 to 246,167 bytes. Their token count is unmeasured. They prove only that the CLI forwarded a long input to the endpoint, not that a near-100k-token task was solved. Funded runs require successful tokenizer calibration.

## Before and after native results

`Before` is the first sweep on the continuation baseline. `After` is the final file-task confirmation after harness bookkeeping and test coverage updates. No provider behavior change was needed for this account refusal. All outcomes are blocked by funds. A second full paid sample was unavailable; the other after cells are explicitly unrun. Input/output tokens are billed tokens from successful responses, so refusal rows contain zero, not an estimate of submitted tokens.

| Model | Task | Phase | Solve | Calls | Input / output | USD | Seconds |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| `kimi-k3.1-pro` | file | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.719 |
| `kimi-k3.1-pro` | multi-file | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.359 |
| `kimi-k3.1-pro` | debug | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.149 |
| `kimi-k3.1-pro` | replay | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.140 |
| `kimi-k3.1-pro` | vision | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.194 |
| `kimi-k3.1-pro` | long-context | before | blocked | 1 | 0 / 0 | 0.00000000 | 2.567 |
| `kimi-k3.1-pro` | file | after | blocked | 1 | 0 / 0 | 0.00000000 | 1.398 |
| `kimi-k3.1-pro-highspeed` | file | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.090 |
| `kimi-k3.1-pro-highspeed` | multi-file | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.151 |
| `kimi-k3.1-pro-highspeed` | debug | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.094 |
| `kimi-k3.1-pro-highspeed` | replay | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.041 |
| `kimi-k3.1-pro-highspeed` | vision | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.072 |
| `kimi-k3.1-pro-highspeed` | long-context | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.552 |
| `kimi-k3.1-pro-highspeed` | file | after | blocked | 1 | 0 / 0 | 0.00000000 | 1.088 |
| `kimi-k3` | file | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.210 |
| `kimi-k3` | multi-file | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.074 |
| `kimi-k3` | debug | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.137 |
| `kimi-k3` | replay | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.242 |
| `kimi-k3` | vision | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.205 |
| `kimi-k3` | long-context | before | blocked | 1 | 0 / 0 | 0.00000000 | 2.122 |
| `kimi-k3` | file | after | blocked | 1 | 0 / 0 | 0.00000000 | 1.306 |
| `kimi-k2.7-code` | file | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.314 |
| `kimi-k2.7-code` | multi-file | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.144 |
| `kimi-k2.7-code` | debug | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.255 |
| `kimi-k2.7-code` | replay | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.094 |
| `kimi-k2.7-code` | vision | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.200 |
| `kimi-k2.7-code` | long-context | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.565 |
| `kimi-k2.7-code` | file | after | blocked | 1 | 0 / 0 | 0.00000000 | 1.305 |
| `kimi-k2.7-code-highspeed` | file | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.088 |
| `kimi-k2.7-code-highspeed` | multi-file | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.364 |
| `kimi-k2.7-code-highspeed` | debug | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.097 |
| `kimi-k2.7-code-highspeed` | replay | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.147 |
| `kimi-k2.7-code-highspeed` | vision | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.151 |
| `kimi-k2.7-code-highspeed` | long-context | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.735 |
| `kimi-k2.7-code-highspeed` | file | after | blocked | 1 | 0 / 0 | 0.00000000 | 1.363 |
| `kimi-k2.6` | file | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.189 |
| `kimi-k2.6` | multi-file | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.418 |
| `kimi-k2.6` | debug | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.254 |
| `kimi-k2.6` | replay | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.343 |
| `kimi-k2.6` | vision | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.134 |
| `kimi-k2.6` | long-context | before | blocked | 1 | 0 / 0 | 0.00000000 | 1.532 |
| `kimi-k2.6` | file | after | blocked | 1 | 0 / 0 | 0.00000000 | 1.192 |

After runs for multi-file, debug, replay, vision, and long-context are not run for any model. Cached input and reasoning replay counts are zero across all live native rows because no completion was generated. Total native continuation: 42 HTTP completion attempts, 0 successful responses, 0 measured solves, 0 input/output/cache tokens, $0, 54.794 CLI wall seconds. There were also seven refused tokenizer requests, including the initial setup attempt, with no balance change.

The historical first-agent native K3.1 before rows rejected the unknown ID locally with zero calls. After the original catalog change, its four tasks reached Moonshot and each received one funds refusal. Its highspeed smoke also received one refusal. This continuation confirms that the same refusal is terminal for every currently offered native model.

## First-agent OpenRouter comparison retained

These earlier results are from OpenRouter K3, not native Moonshot. They must not be read as K3.1 inference validation.

| Task | Phase | Solves | Calls | Input | Output | USD | Seconds |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| file | before | 1 | 7 | 16,276 | 1,806 | 0.02509003 | 50.07 |
| file | after | 1 | 5 | 9,857 | 336 | 0.00753956 | 23.43 |
| refactor-extract-helper | before | 1 | 6 | 14,002 | 1,276 | 0.03053712 | 14.34 |
| refactor-extract-helper | after | 1 | 7 | 17,659 | 1,689 | 0.02644245 | 19.63 |
| rename-typo-symbol | before | 1 | 7 | 16,725 | 1,277 | 0.01429350 | 22.17 |
| rename-typo-symbol | after | 1 | 6 | 13,751 | 995 | 0.01677883 | 14.95 |
| write-slugify-tests | before | 1 | 9 | 27,873 | 2,375 | 0.03435634 | 27.30 |
| write-slugify-tests | after | 1 | 8 | 20,373 | 1,237 | 0.02203653 | 18.20 |

The additional historical replay probe solved the rename task in 6 calls, with 13,858 input tokens, 949 output tokens, $0.014342366 and 12.44 seconds. Historical before/after samples are single observations, with varying routes and cache state. The first report records total settled OpenRouter spend of $0.191416725 across all 61 successful calls, including setup calls and the replay probe.

## Failure causes, fixes, and confirmation

| Failure | Root cause | General handling and test | Confirmation |
| --- | --- | --- | --- |
| 42 completion refusals | Account balance is unavailable and cash is negative. | Keep the existing terminal funds classification. Expand its JSON and SSE regression coverage to every native catalog ID. | 13 funds tests pass; every live refusal stopped after one HTTP attempt. Funding is the external remedy. |
| Initial tokenizer setup aborted | The tokenizer endpoint also requires a usable account balance. | Record a typed provider error; normal runs require calibration, while an explicit quota probe records an unmeasured input. Test both successful calibration and refusal handling. | All six long-input CLI probes reached Moonshot after this harness fix; token counts remain unknown. |
| Prior balance accounting hid debt | `available_balance` clamps negative cash to zero. | Reconcile cash plus vouchers, persist cumulative spend across deposits, retain unresolved request reservations. | Unit tests cover debt, top-ups, cap admission, missing usage limits and outstanding reservations. Live cash and voucher balances are unchanged. |
| Prior isolated-home mismatch | Earlier runner used `home-zdr/.agenc`. | Use the owner's exact path for both home variables, establish trust through AgenC. | All six exact directories reached the endpoint. No hand-written trust file. |
| New test assertion initially failed | The added K2 assertion incorrectly expected `max_tokens`; the existing contract uses `max_completion_tokens`. | Correct the test to the established wire contract, and distinguish documented K2.6 thinking controls from K2.7 omission. | All 95 focused provider tests pass. No unnecessary provider patch. |

The broadened harness test exercises reasoning replay, multiple tools, response-local tool IDs, fixed sampling omission and stable prefix behavior across all six native models in JSON and SSE. A mocked stream test additionally verifies capture, joined tool argument fragments, serialized reservations and absence of credential values in recorded evidence. Fixture tests reject incomplete renames and protected-test tampering and verify that the debugging task starts red and passes only after the implementation fix.

## Running spend ledger

Cash and voucher snapshots are preserved alongside each run in the private evidence directory. Account debt at the starting snapshot is pre-existing and is not attributed to this continuation. Every new observed balance delta is zero.

| Checkpoint | New USD | Cumulative owner USD | Remaining USD |
| --- | ---: | ---: | ---: |
| Prior report, settled OpenRouter total | 0.191416725 | 0.191416725 | 19.808583275 |
| `kimi-k3.1-pro`, six task probes | 0.000000000 | 0.191416725 | 19.808583275 |
| `kimi-k3.1-pro-highspeed`, six task probes | 0.000000000 | 0.191416725 | 19.808583275 |
| `kimi-k3`, six task probes | 0.000000000 | 0.191416725 | 19.808583275 |
| `kimi-k2.7-code`, six task probes | 0.000000000 | 0.191416725 | 19.808583275 |
| `kimi-k2.7-code-highspeed`, six task probes | 0.000000000 | 0.191416725 | 19.808583275 |
| `kimi-k2.6`, six task probes | 0.000000000 | 0.191416725 | 19.808583275 |
| Six final confirmation probes | 0.000000000 | 0.191416725 | 19.808583275 |
| Final balance recheck | 0.000000000 | 0.191416725 | 19.808583275 |

Start snapshot: `2026-10-23T16:52:00.824901+00:00`. Final snapshot: `2026-10-23T17:04:41.316699+00:00`. Both: available $0, vouchers $0, cash -$0.09476. The [official balance documentation](https://platform.kimi.ai/docs/api/balance) confirms that nonpositive available balance prevents inference.

The guard uses a conservative per-request reservation and an explicit output cap. Reservation rates are an experimental envelope, not published K3.1 pricing. Full-budget consumption and paid cost validation remain unfinished. No funds were moved or account billing settings changed.

## Validation and delivery

- Fresh branch build passed, including package entrypoints and generated SDK types.
- Typecheck and test-support typecheck passed.
- Four focused provider test files passed: 95 tests. The first agent had already passed its broader 1,268-test selection.
- Four wire/ledger tests and four fixture/calibration tests passed.
- `git diff --check` passed. No em dash was introduced.
- Build and typecheck used `npm_config_force=true` for the repository's npm version restriction, under the isolated home.
- New reusable runner and fixtures are in `runtime/eval/kimi-native`. Sanitized structured results are in `evidence.json` there. Detailed private logs and run artifacts are in `glm-fit/kimi-evidence/owner-20usd`.
- Implementation commit: `d938095fd` (`Add native Kimi task sweep and budget ledger`). The accompanying report/evidence commit is also left locally. Push from the isolated home failed because HTTPS Git credentials were unavailable: `could not read Username for https://github.com: terminal prompts disabled`. No alternate credential files were accessed. The existing remote PR was not updated.

## Open issues

1. The Moonshot account must be funded. Native solves, live reasoning replay, live cache hits, vision accuracy, and measured near-100k-token completion are all unverified.
2. Two successful samples per applicable model/task and use of the remaining authorized budget are still outstanding. Refusal probes cannot replace those samples.
3. K3.1 prices and its dedicated public parameter guide remain unpublished. No price or default-model change was invented.
4. The new paid-path runner has mocked streaming coverage, but the account blockage prevents a successful end-to-end native run. A finite test suite also cannot establish perfection.

## Prepared PR description

Moonshot's native catalog includes `kimi-k3.1-pro` and `kimi-k3.1-pro-highspeed`, which AgenC previously rejected before HTTP. Add both to the shared native catalog and apply the K3 family wire contract, including image inputs, reasoning replay, effort handling and output defaults. Keep K3 as the default and leave unpublished K3.1 prices unknown.

Preserve reasoning and repair response-local tool IDs across tool steps, account for automatic cache writes without double counting, and classify Moonshot's insufficient-balance 429 as a terminal funds error. Extend JSON and SSE regression coverage across all six native IDs. Add a reusable built-CLI suite with independently graded file, multi-file, debugging, sequential reasoning, image and long-context fixtures, plus persistent owner-spend accounting.

Validation: build and typecheck pass; 95 focused provider tests and eight runner/fixture tests pass. The earlier broader selection passed 1,268 tests. The earlier OpenRouter K3 before/after samples solved four of four tasks, with 29 versus 26 calls and $0.10427699 versus $0.07279737 measured per-response cost. Those gateway observations do not establish native performance.

Native validation is blocked: all 36 model/task submissions and six confirmation probes reached Moonshot, then stopped after one insufficient-balance refusal. No native tokens or charges were generated. Both balance checks returned $0 available and -$0.09476 cash. All six image requests carried an image part. The tokenizer was also refused, so no measured 100k-token result is claimed. Total owner spend remains $0.191416725 of the $20 cap, including prior OpenRouter usage. Keep the PR draft until funded native runs establish successful behavior.
