---
name: Notification copy and routing
description: Durable rules for notification wording and order destinations in the ForUs app
---

Notification text should be generated centrally from the actor name, entity type, and order action; order notification destinations should use explicit action metadata to choose the seller or buyer tab.

**Why:** Scattered Arabic message fragments caused duplicate actor names, generic “مستخدم” wording, and incoming orders opening the wrong order surface.

**How to apply:** Add new activity types and order states to the shared notification formatter and preserve `new`, `accepted`, or `rejected` metadata when adding a notification tap route.