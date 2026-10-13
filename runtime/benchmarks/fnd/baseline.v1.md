# FND algorithm baseline v1

This artifact records bounded current and historical-reference observations.
Every row is informational: no result is a performance threshold or gate.
Generated inputs are synthetic and created only for the benchmark process.

- JSON SHA-256: `a3d00497e1444045fefe628775a077d129330f9e02981e7ce4fa622435986853`
- Source revision: `d79eeb11c987d87a8c72bf60215df515aa53ea31`
- Production tree: `runtime/src` at Git object `fe4e6b4ff84af988cd1a454b231177342f4cce0b`
- Loaded production closure: `91` module bindings across `2` cases
- Plan SHA-256: `672538014498283c935efce76c0a5244abd280aadaeb5a03a9d835f041db2ebe`
- Node/npm: `v26.5.0` / `11.17.0`
- OS/CPU: `linux 7.0.0-34-generic x64` / `AMD Ryzen 9 9900X 12-Core Processor` (24 logical)
- RAM: `32214446080` bytes
- Source filesystem: type `61267`, block `4096` bytes
- Fixture filesystem: type `16914836`, block `4096` bytes
- SQLite/ripgrep: `3.53.3` / `ripgrep 15.0.0 (rev 3a612f88b8)`

| Case | Input | Status | Median ms | MAD ms | Worker peak RSS bytes | RSS lower-bound bytes |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| `csv_scheduler_progress_scan` | `rowCount=1000` | `completed` | 94.852 | 11.270 | 183349248 | 183349248 |
| `csv_scheduler_progress_scan` | `rowCount=2000` | `completed` | 198.505 | 7.533 | 202096640 | 199151616 |
| `csv_scheduler_progress_scan` | `rowCount=4000` | `completed` | 438.231 | 11.632 | 214745088 | 213618688 |
| `patch_delete_parser_historical_comparison` | `hunkCount=8000` | `completed` | 2.825 | 0.260 | 90624000 | 90624000 |
| `patch_delete_parser_historical_comparison` | `hunkCount=16000` | `completed` | 5.863 | 0.385 | 104685568 | 104488960 |
| `patch_delete_parser_historical_comparison` | `hunkCount=32000` | `completed` | 12.410 | 1.221 | 114765824 | 114176000 |

## Assessment notes

- `csv_scheduler_progress_scan`: Array.shift queue movement and full progress-map scans have quadratic operation counts; the prior audit observed about 35/112/392 ms at 8k/16k/32k items.
- `patch_delete_parser_historical_comparison`: Historical comparison only: artifact commit 3431a40ea, bound to source revision 925f3ec2860abf48e0c6c0830d135da2587a4d69 (JSON SHA-256 8c72fc88fd10dfde2f91bd7cc3ce8028af552781b7b699db9931529cac0abd07), recorded a 355.764281 ms median for 32,000 delete hunks while the old parser repeatedly sliced the unconsumed suffix. Current production advances line indices without suffix slicing; this case replays the same generated workload and is not a performance threshold.

## Reproduce

Run on the same pinned runtime and machine state; compare medians, MAD,
operation counts, and relative scaling rather than one wall-clock sample.

```sh
npm run benchmark:fnd-baseline --workspace=@tetsuo-ai/runtime -- --source-revision d79eeb11c987d87a8c72bf60215df515aa53ea31 --output /tmp/agenc-fnd-baseline.v1.json --markdown-output /tmp/agenc-fnd-baseline.v1.md
npm run check:fnd-benchmark-baseline --workspace=@tetsuo-ai/runtime
```

Completed workers report their actual process high-water RSS from
`process.resourceUsage().maxRSS`, normalized from KiB to bytes. A worker
terminated during synchronous work cannot emit that final high-water mark,
so its peak is `n/a`; its last start RSS remains a clearly labeled lower
bound. Endpoint observations are retained as diagnostics and are never
presented as the worker peak.
