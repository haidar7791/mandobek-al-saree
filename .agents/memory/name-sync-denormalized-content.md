---
name: Denormalized name sync
description: The durable rule for propagating profile-name changes into older Firestore content.
---

Profile-name changes must reconcile all denormalized post and product records, including legacy documents that identify ownership with different fields. A filtered query on only the current ownership field can leave older published content stale.

**Why:** Older content schemas used more than one owner identifier, so a rename could succeed on the profile while silently missing previously published records.

**How to apply:** On a rename or repair pass, read the relevant content collections, match every supported ownership field locally, update all displayed name fields in batches, and use the current profile name when creating new content.