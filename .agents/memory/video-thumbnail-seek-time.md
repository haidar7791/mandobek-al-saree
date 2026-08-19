---
name: Video thumbnail seek time
description: The standard extraction point for generated product and story video thumbnails.
---

Generate still thumbnails from second 2 of uploaded videos, rather than from second 0.

**Why:** Many uploaded videos begin with a black frame, which makes a valid thumbnail look blank in cards, story circles, and story-reply messages.

**How to apply:** Keep thumbnail generation scoped to newly created media unless a deliberate backfill is requested. Use the same seek time for product and story video thumbnail jobs.