# Kimi integration report

Funded continuation in progress. Updated 2026-10-23T17:18:47.382850+00:00.

Worktree: `/Users/tetsuoarena/claude-agenc/wt-kimi`, branch `feat/kimi-k3-1`. The previous quota-only report is preserved as `glm-fit/QUOTA-K-REPORT.md`.

The new account started with $24.9991 available ($20 cash and $4.9991 vouchers). Six native models are still offered. The sweep runs newest first, through the built CLI in the six approved isolated slots. Both home variables use the supplied home-zdr directory.

## Running spend ledger

Current priced Moonshot usage: $2.20157045. Observed owner spend from balance changes: $1.91555712, including $0.191416725 historical OpenRouter use. Available balance: $23.27496000. Balance settlement lags usage. Admission uses the higher of observed spend and priced usage with a 10% margin, plus a request reserve, under the $24 owner cap and $1 account floor.

| Model | Task | Phase | Solve | Calls | Input / output tokens | Priced USD | Seconds |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| kimi-k3.1-pro | file #1 | before | failed-completion-contract | 8 | 30857 / 6374 | 0.08720760 | 88.170 |
| kimi-k3.1-pro | file #1 | after | solved | 3 | 5727 / 406 | 0.00675880 | 12.727 |
| kimi-k3.1-pro | file #2 | after | solved | 3 | 5897 / 491 | 0.00748800 | 13.363 |
| kimi-k3.1-pro | multi-file #1 | after | solved | 4 | 8821 / 716 | 0.01236040 | 12.790 |
| kimi-k3.1-pro | multi-file #2 | after | solved | 4 | 9070 / 808 | 0.01285680 | 13.508 |
| kimi-k3.1-pro | debug #1 | after | solved | 5 | 11229 / 571 | 0.01204000 | 15.422 |
| kimi-k3.1-pro | debug #2 | after | solved | 5 | 11284 / 622 | 0.01127760 | 16.097 |
| kimi-k3.1-pro | replay #1 | after | solved | 17 | 64771 / 2638 | 0.05085960 | 74.161 |
| kimi-k3.1-pro | replay #2 | after | solved | 17 | 66862 / 2782 | 0.05233440 | 78.915 |
| kimi-k3.1-pro | vision #1 | after | solved | 4 | 8958 / 700 | 0.01231420 | 23.595 |
| kimi-k3.1-pro | vision #2 | after | solved | 4 | 8618 / 589 | 0.00990320 | 20.131 |
| kimi-k3.1-pro | long-context #1 | after | solved | 4 | 399890 / 614 | 0.26540160 | 24.492 |
| kimi-k3.1-pro | long-context #2 | after | solved | 3 | 299396 / 433 | 0.06582920 | 12.782 |
| kimi-k3.1-pro-highspeed | file #1 | after | solved | 3 | 5599 / 355 | 0.01684960 | 7.772 |
| kimi-k3.1-pro-highspeed | file #2 | after | solved | 3 | 5753 / 424 | 0.01300880 | 7.829 |
| kimi-k3.1-pro-highspeed | multi-file #1 | after | solved | 4 | 8844 / 731 | 0.02373040 | 9.452 |
| kimi-k3.1-pro-highspeed | multi-file #2 | after | solved | 4 | 8834 / 739 | 0.02190480 | 10.569 |
| kimi-k3.1-pro-highspeed | debug #1 | after | solved | 5 | 11959 / 895 | 0.02974240 | 11.199 |
| kimi-k3.1-pro-highspeed | debug #2 | after | solved | 5 | 12273 / 1038 | 0.02996720 | 16.176 |
| kimi-k3.1-pro-highspeed | replay #1 | after | solved | 18 | 69829 / 2946 | 0.09892720 | 44.143 |
| kimi-k3.1-pro-highspeed | replay #2 | after | solved | 17 | 65023 / 2961 | 0.09556800 | 44.261 |
| kimi-k3.1-pro-highspeed | vision #1 | after | solved | 4 | 8801 / 662 | 0.02184020 | 12.193 |
| kimi-k3.1-pro-highspeed | vision #2 | after | solved | 4 | 9409 / 860 | 0.02400280 | 12.342 |
| kimi-k3.1-pro-highspeed | long-context #1 | after | solved | 3 | 300125 / 830 | 0.45539760 | 18.066 |
| kimi-k3.1-pro-highspeed | long-context #2 | after | solved | 3 | 299660 / 567 | 0.07569520 | 12.791 |
| kimi-k3 | file #1 | after | solved | 2 | 3508 / 246 | 0.01006680 | 8.952 |
| kimi-k3 | file #2 | after | solved | 3 | 5217 / 151 | 0.00547440 | 7.550 |
| kimi-k3 | multi-file #1 | after | solved | 4 | 8324 / 458 | 0.01456200 | 17.200 |
| kimi-k3 | multi-file #2 | after | solved | 4 | 9057 / 810 | 0.01927620 | 20.188 |
| kimi-k3 | debug #1 | after | solved | 5 | 10941 / 509 | 0.01695720 | 15.608 |
| kimi-k3 | debug #2 | after | solved | 5 | 11667 / 791 | 0.02060040 | 19.202 |
| kimi-k3 | replay #1 | after | solved | 16 | 51995 / 1545 | 0.05267040 | 56.370 |
| kimi-k3 | replay #2 | after | solved | 16 | 51643 / 1605 | 0.05251440 | 58.320 |
| kimi-k3 | vision #1 | after | solved | 3 | 5875 / 369 | 0.01116930 | 17.881 |
| kimi-k3 | vision #2 | after | solved | 3 | 5749 / 267 | 0.00763860 | 22.549 |
| kimi-k3 | long-context #1 | after | solved | 3 | 299186 / 324 | 0.36259080 | 24.812 |
| kimi-k3 | long-context #2 | after | solved | 3 | 299100 / 301 | 0.09656700 | 27.077 |
| kimi-k2.7-code | file #1 | after | solved | 3 | 4490 / 119 | 0.00279590 | 7.516 |
| kimi-k2.7-code | file #2 | after | solved | 2 | 2987 / 137 | 0.00144005 | 6.609 |
| kimi-k2.7-code | multi-file #1 | after | solved | 5 | 10149 / 460 | 0.00525563 | 19.865 |
| kimi-k2.7-code | multi-file #2 | after | solved | 4 | 7119 / 360 | 0.00372817 | 12.814 |
| kimi-k2.7-code | debug #1 | after | solved | 5 | 9392 / 478 | 0.00499760 | 18.094 |

## Findings so far

The first funded file sample produced the correct artifact but exhausted the prose completion gate because the task required only hi. The suite now requests structured CLI output, which activates the existing exactOutput contract, and flags completion warnings. Two confirmations passed in three calls each. The original sample remains a failed completion contract, not an unqualified solve.

Moonshot now publishes K3.1 prices in the rendered [pricing table](https://platform.kimi.ai/docs/pricing/chat): Pro input/output/cache $2/$10/$0.20 per million tokens, Highspeed $4/$20/$0.20. Native pricing entries and cache accounting tests are added. Balance lag is handled by persistent usage-based accounting, with tests.

The native Kimi badge is retained/red for all six models. The [privacy policy](https://platform.kimi.ai/docs/agreement/userprivacy) retains input while an account is active. [Enterprise ZDR](https://platform.kimi.ai/docs/guide/zero-data-retention) must be enabled server-side on request; AgenC cannot verify that account arrangement. The classification already matches, so it is retained with citations and regression coverage. OpenRouter moonshotai models instead use request-level provider.zdr; its current ZDR endpoint list includes K3, K2.7 Code, K2.6, K2.5, K2 Thinking, K2 0905 and K2. This does not establish direct-account ZDR.

Validation so far: 178 focused TypeScript tests, six wire/ledger tests, five fixture tests, and typecheck including test support pass.

## Open issues

The full matrix and full $20 Moonshot usage target are still running. Delayed account balance settlement is tracked separately from priced token usage. Final build, commit and push remain pending.

## Prepared PR description

Add native K3.1 Pro and Highspeed support using the shared K3 wire contract, preserve reasoning and response-local tool identity, and classify insufficient-balance refusals as terminal. Add the now-published native prices with cache accounting tests.

Exercise all native models through built-CLI file, multi-file, debugging, reasoning replay, vision and calibrated long-context tasks. Keep owner accounting across delayed billing and deposits, enforce the balance floor, and use structured CLI output with independent grading. Document native enterprise ZDR separately from OpenRouter request enforcement. Funded validation remains in progress.
