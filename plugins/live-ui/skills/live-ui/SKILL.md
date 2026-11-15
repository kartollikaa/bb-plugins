---
name: live-ui
description: Display a JSON report as an bounded live Metric, Table, Chart or Pipeline in a BB reply.
---

Create an already-produced JSON report in this thread's workspace or storage. Emit a closed `live-ui` fence containing JSON:

```live-ui
{"source":{"root":"storage","path":"report.json"},"view":"Metric","title":"Build report"}
```

File schema (sections are optional; choose the matching view):

```json
{"metrics":[{"label":"Passed","value":12}],"table":{"columns":["Job","Status"],"rows":[["Tests","passed"]]},"chart":[{"label":"Today","value":12}],"pipeline":[{"label":"Tests","status":"passed"}]}
```

Views: Metric, Table, Chart, Pipeline. Pipeline statuses: pending, running, passed, failed, skipped. Use root workspace or storage with a relative path; no symlinks/traversal. JSON only; no code, URL, shell or automatic producer runs. Keep files within 256 KiB, tables within 200 rows/20 columns. Inspect active counts with `bb live-ui status`. Validate configuration using `bb live-ui check '<json>'`.

Live starts on the first visible mount of a new block/source under the owner-authorized default. It does not repeat the initial grant after hiding, expiry or reload. Resume Live explicitly starts another session. Refresh reads once. Effective duration is shown (default ten minutes, configurable 1–60); hidden/offscreen/unmounted views pause, and visibility leases expire after 45 seconds. Data never extends consent. Reload/reconnect cannot silently restore expired consent. Errors mark the last good snapshot stale; access denial hides it. Current live status is separate from pinned historical evidence. Do not claim runtime success just because a fence was emitted. GenUI's ui/app languages remain separate.
