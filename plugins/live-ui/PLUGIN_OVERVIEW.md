# Live UI

Bounded live Metric, Table, Chart and Pipeline views of JSON reports in the current BB thread workspace or storage. A separate live-ui fence leaves GenUI unchanged.

Live starts automatically on the first visible mount of each new block/source. This owner-authorized default is recorded per scope; hiding, expiry or reload requires explicit Resume and never repeats the initial grant. Refresh reads once; Resume Live enables native watching for a visible bounded session. Default duration ten minutes, configurable 1–60; a 45-second visibility lease releases abandoned watches. No producer execution, URLs, shell or JavaScript. Reload, hide, archive, delete and expiry stop Live.

Requires BB 0.49 and SDK 0.6.132 with an enrolled host supporting native file watches. Strict JSON, canonical path validation, no symlinks/traversal, 256 KiB limit and bounded rows. Temporary read errors retain a visibly stale last-good snapshot; access revocation hides cached data. Signals carry only invalidation identifiers.

Unpublished development plugin. No community listing or release tag. See README for syntax and operating limits.
