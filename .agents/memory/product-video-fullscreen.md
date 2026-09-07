---
name: Product video fullscreen behavior
description: Fullscreen playback changes for the shared product media carousel must remain opt-in.
---

When changing product video fullscreen behavior, keep pause/resume and playback-position handoff behind an explicit prop/callback from the owning screen rather than changing the carousel's default behavior.

**Why:** ProductMediaCarousel is reused across multiple screens, so an unconditional fullscreen change can alter unrelated product and profile flows.

**How to apply:** Enable the fullscreen synchronization prop only in the products feed flow that owns the fullscreen modal; leave standalone carousel viewers on their existing defaults.