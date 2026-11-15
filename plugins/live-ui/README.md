# Live UI

Read-only views of an already-produced JSON report in the current thread's workspace or storage. An independent `live-ui` fence renderer; GenUI's `ui` and `app` fences remain unchanged. Requires BB 0.49 and SDK 0.6.132.

Install from this repository with `bb plugin install path:/your/checkout --plugin live-ui --yes`. This is an unpublished development plugin. No release tag or community submission exists.

Write `report.json` in the thread storage, then use:

````markdown
```live-ui
{"source":{"root":"storage","path":"report.json"},"view":"Metric","title":"Build report"}
```
````

The report file:

```json
{
  "metrics": [{"label":"Passed", "value":12}],
  "table": {"columns":["Job","Status"],"rows":[["Tests","passed"]]},
  "chart": [{"label":"Monday","value":12},{"label":"Tuesday","value":18}],
  "pipeline": [{"label":"Tests","status":"passed"},{"label":"Build","status":"running"}]
}
```

Change `view` to `Table`, `Chart` or `Pipeline`. Each reads its corresponding section. `root` may be `workspace` or `storage`; `path` must be relative with no traversal or symlinks. Columns/labels and cells render as text. There is no JavaScript, URL fetch, shell command or producer execution. Unknown fields are rejected. Incomplete fences show the readable original source. Without the plugin, BB shows the JSON fence.

Live starts automatically on the first visible mount of each new block/source. This owner-authorized default is recorded per scope; hiding, expiry or reload requires explicit Resume and never repeats the initial grant. **Refresh** reads once. **Resume Live** explicitly enables native file watching for this block, source and thread. The default grant lasts ten minutes; the plugin's `durationMinutes` setting accepts an effective 1–60 minute duration. The UI shows the effective duration, visibility lease and expiration. Heartbeats renew only the 45-second visibility lease, never the consent deadline. Hidden, off-screen and unmounted blocks pause and require Resume. A vanished page loses its host watch within 45 seconds. Each mount has its own lease; duplicates share the same scoped watch. Reload/restart discards consent. Host reconnect revalidates the thread and source; Resume is required after a disconnect.

The host watches only the source's immediate directory and filters file events; atomic replacement and rescan invalidate snapshots. Watch failures pause with an error. No polling fallback exists. Archive/delete, source removal, access revocation, reload and disable stop subscriptions. No cross-thread sharing. Every read resolves authoritative BB thread/environment/storage state and validates path containment on the enrolled host. Symlinks are rejected, including links inside an authorized root. A report must be a regular file, at most 256 KiB. Limits: 24 metrics, 200 table rows / 20 columns, 100 chart points, 50 pipeline stages, 1000 characters per cell. JSON errors and temporary offline failures retain the last good snapshot and original read timestamp with a stale label. Denied access or changed scope hides cached data. Realtime signals carry only opaque invalidations, never report contents. These are current status views: save historical evidence separately.

Inspect live-block and native-watch counts with `bb live-ui status`. This reads diagnostic counts without starting subscriptions.

Validate fence configuration with `bb live-ui check '<json>'`. This checks syntax; file access is checked at Refresh/Resume. Detailed agent examples live in `skills/live-ui/SKILL.md`, loaded when needed rather than injected as a catalog.

Development: `npm ci --include=dev`, `npm test`, `npm run typecheck`, `npm run test:production`, `bb plugin build`, then install/reload. Tests exercise bounded reads, policy controls and host watcher lifecycle; live validation is also required for a completed delivery. The implementation is original MIT code and uses no GenUI source.
