# FND algorithm baseline v1

This artifact records bounded current and historical-reference observations.
Every row is informational: no result is a performance threshold or gate.
Generated inputs are synthetic and created only for the benchmark process.

- JSON SHA-256: `e5e75b676db3ebe282ef36943446a3e10f86290caef5e2e7a59bd38d2b605b62`
- Source revision: `7a03e01b32b076840dd23333eba47ba987d1b2fa`
- Production tree: `runtime/src` at Git object `b9ea282b4330c2ea6a74560c9a6dc93b47f9972e`
- Loaded production closure: `95` module bindings across `2` cases
- Plan SHA-256: `672538014498283c935efce76c0a5244abd280aadaeb5a03a9d835f041db2ebe`
- Node/npm: `v26.12.1` / `11.17.0`
- OS/CPU: `linux 7.0.0-38-generic x64` / `AMD Ryzen 9 9900X 12-Core Processor` (24 logical)
- RAM: `32214417408` bytes
- Source filesystem: type `61267`, block `4096` bytes
- Fixture filesystem: type `61267`, block `4096` bytes
- SQLite/ripgrep: `3.54.0` / `ripgrep 15.0.0 (rev 3a612f88b8)`

| Case | Input | Status | Median ms | MAD ms | Worker peak RSS bytes | RSS lower-bound bytes |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| `csv_scheduler_progress_scan` | `rowCount=1000` | `completed` | 98.768 | 9.095 | 183836672 | 182460416 |
| `csv_scheduler_progress_scan` | `rowCount=2000` | `completed` | 195.241 | 17.460 | 201154560 | 198094848 |
| `csv_scheduler_progress_scan` | `rowCount=4000` | `completed` | 401.131 | 14.926 | 217440256 | 214335488 |
| `patch_delete_parser_historical_comparison` | `hunkCount=8000` | `completed` | 2.804 | 0.298 | 87482368 | 87482368 |
| `patch_delete_parser_historical_comparison` | `hunkCount=16000` | `completed` | 5.610 | 0.298 | 103342080 | 103342080 |
| `patch_delete_parser_historical_comparison` | `hunkCount=32000` | `completed` | 11.853 | 1.546 | 127557632 | 126771200 |

## Assessment notes

- `csv_scheduler_progress_scan`: Array.shift queue movement and full progress-map scans have quadratic operation counts; the prior audit observed about 35/112/392 ms at 8k/16k/32k items.
- `patch_delete_parser_historical_comparison`: Historical comparison only: artifact commit 3431a40ea, bound to source revision 925f3ec2860abf48e0c6c0830d135da2587a4d69 (JSON SHA-256 8c72fc88fd10dfde2f91bd7cc3ce8028af552781b7b699db9931529cac0abd07), recorded a 355.764281 ms median for 32,000 delete hunks while the old parser repeatedly sliced the unconsumed suffix. Current production advances line indices without suffix slicing; this case replays the same generated workload and is not a performance threshold.

## Reproduce

Run on the same pinned runtime and machine state; compare medians, MAD,
operation counts, and relative scaling rather than one wall-clock sample.

```sh
npm run benchmark:fnd-baseline --workspace=@tetsuo-ai/runtime -- --source-revision 7a03e01b32b076840dd23333eba47ba987d1b2fa --output /tmp/agenc-fnd-baseline.v1.json --markdown-output /tmp/agenc-fnd-baseline.v1.md
npm run check:fnd-benchmark-baseline --workspace=@tetsuo-ai/runtime
```

Completed workers report their actual process high-water RSS from
`process.resourceUsage().maxRSS`, normalized from KiB to bytes. A worker
terminated during synchronous work cannot emit that final high-water mark,
so its peak is `n/a`; its last start RSS remains a clearly labeled lower
bound. Endpoint observations are retained as diagnostics and are never
presented as the worker peak.
