# FND algorithm baseline v1

This artifact records bounded current and historical-reference observations.
Every row is informational: no result is a performance threshold or gate.
Generated inputs are synthetic and created only for the benchmark process.

- JSON SHA-256: `565bbc0297bb0ef7f3d78be865763a5a55ba16dfc64fcd70497894c0b4bac9e4`
- Source revision: `eedc2fadc8d9980e2a6dccb85f2864614e719cd7`
- Production tree: `runtime/src` at Git object `20eb2bd5d0f40d4a20b19449e901163f450a20da`
- Loaded production closure: `92` module bindings across `2` cases
- Plan SHA-256: `672538014498283c935efce76c0a5244abd280aadaeb5a03a9d835f041db2ebe`
- Node/npm: `v26.5.0` / `11.17.0`
- OS/CPU: `linux 7.0.0-34-generic x64` / `AMD Ryzen 9 9900X 12-Core Processor` (24 logical)
- RAM: `32214446080` bytes
- Source filesystem: type `61267`, block `4096` bytes
- Fixture filesystem: type `61267`, block `4096` bytes
- SQLite/ripgrep: `3.53.3` / `ripgrep 15.0.0 (rev 3a612f88b8)`

| Case | Input | Status | Median ms | MAD ms | Worker peak RSS bytes | RSS lower-bound bytes |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| `csv_scheduler_progress_scan` | `rowCount=1000` | `completed` | 80.430 | 0.647 | 183349248 | 183349248 |
| `csv_scheduler_progress_scan` | `rowCount=2000` | `completed` | 168.239 | 2.902 | 203943936 | 200265728 |
| `csv_scheduler_progress_scan` | `rowCount=4000` | `completed` | 329.334 | 9.063 | 217407488 | 214863872 |
| `patch_delete_parser_historical_comparison` | `hunkCount=8000` | `completed` | 2.432 | 0.185 | 91774976 | 91774976 |
| `patch_delete_parser_historical_comparison` | `hunkCount=16000` | `completed` | 5.136 | 0.235 | 105979904 | 105783296 |
| `patch_delete_parser_historical_comparison` | `hunkCount=32000` | `completed` | 10.931 | 0.955 | 127361024 | 127361024 |

## Assessment notes

- `csv_scheduler_progress_scan`: Array.shift queue movement and full progress-map scans have quadratic operation counts; the prior audit observed about 35/112/392 ms at 8k/16k/32k items.
- `patch_delete_parser_historical_comparison`: Historical comparison only: artifact commit 3431a40ea, bound to source revision 925f3ec2860abf48e0c6c0830d135da2587a4d69 (JSON SHA-256 8c72fc88fd10dfde2f91bd7cc3ce8028af552781b7b699db9931529cac0abd07), recorded a 355.764281 ms median for 32,000 delete hunks while the old parser repeatedly sliced the unconsumed suffix. Current production advances line indices without suffix slicing; this case replays the same generated workload and is not a performance threshold.

## Reproduce

Run on the same pinned runtime and machine state; compare medians, MAD,
operation counts, and relative scaling rather than one wall-clock sample.

```sh
npm run benchmark:fnd-baseline --workspace=@tetsuo-ai/runtime -- --source-revision eedc2fadc8d9980e2a6dccb85f2864614e719cd7 --output /tmp/agenc-fnd-baseline.v1.json --markdown-output /tmp/agenc-fnd-baseline.v1.md
npm run check:fnd-benchmark-baseline --workspace=@tetsuo-ai/runtime
```

Completed workers report their actual process high-water RSS from
`process.resourceUsage().maxRSS`, normalized from KiB to bytes. A worker
terminated during synchronous work cannot emit that final high-water mark,
so its peak is `n/a`; its last start RSS remains a clearly labeled lower
bound. Endpoint observations are retained as diagnostics and are never
presented as the worker peak.
