# FND algorithm baseline v1

This artifact records bounded current and historical-reference observations.
Every row is informational: no result is a performance threshold or gate.
Generated inputs are synthetic and created only for the benchmark process.

- JSON SHA-256: `4a77b2a112d41ca48501c0f1e95ee3b31bde47be61a5d15665f88f0cd0d44bbc`
- Source revision: `b0597a1c1394dfb45aa908f55a501d8838dbe9f4`
- Production tree: `runtime/src` at Git object `b1c1e83195b5480565f99dd5868385c0a092139d`
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
| `csv_scheduler_progress_scan` | `rowCount=1000` | `completed` | 77.753 | 5.153 | 185413632 | 184037376 |
| `csv_scheduler_progress_scan` | `rowCount=2000` | `completed` | 149.041 | 2.697 | 202756096 | 199749632 |
| `csv_scheduler_progress_scan` | `rowCount=4000` | `completed` | 299.673 | 4.598 | 251748352 | 249241600 |
| `patch_delete_parser_historical_comparison` | `hunkCount=8000` | `completed` | 2.384 | 0.251 | 89079808 | 89079808 |
| `patch_delete_parser_historical_comparison` | `hunkCount=16000` | `completed` | 5.054 | 0.455 | 104919040 | 104722432 |
| `patch_delete_parser_historical_comparison` | `hunkCount=32000` | `completed` | 9.972 | 0.597 | 125431808 | 125431808 |

## Assessment notes

- `csv_scheduler_progress_scan`: Array.shift queue movement and full progress-map scans have quadratic operation counts; the prior audit observed about 35/112/392 ms at 8k/16k/32k items.
- `patch_delete_parser_historical_comparison`: Historical comparison only: artifact commit 3431a40ea, bound to source revision 925f3ec2860abf48e0c6c0830d135da2587a4d69 (JSON SHA-256 8c72fc88fd10dfde2f91bd7cc3ce8028af552781b7b699db9931529cac0abd07), recorded a 355.764281 ms median for 32,000 delete hunks while the old parser repeatedly sliced the unconsumed suffix. Current production advances line indices without suffix slicing; this case replays the same generated workload and is not a performance threshold.

## Reproduce

Run on the same pinned runtime and machine state; compare medians, MAD,
operation counts, and relative scaling rather than one wall-clock sample.

```sh
npm run benchmark:fnd-baseline --workspace=@tetsuo-ai/runtime -- --source-revision b0597a1c1394dfb45aa908f55a501d8838dbe9f4 --output /tmp/agenc-fnd-baseline.v1.json --markdown-output /tmp/agenc-fnd-baseline.v1.md
npm run check:fnd-benchmark-baseline --workspace=@tetsuo-ai/runtime
```

Completed workers report their actual process high-water RSS from
`process.resourceUsage().maxRSS`, normalized from KiB to bytes. A worker
terminated during synchronous work cannot emit that final high-water mark,
so its peak is `n/a`; its last start RSS remains a clearly labeled lower
bound. Endpoint observations are retained as diagnostics and are never
presented as the worker peak.
