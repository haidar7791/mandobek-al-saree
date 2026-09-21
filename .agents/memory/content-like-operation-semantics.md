---
name: Content like operation semantics
description: The distinction between an idempotent like operation result and the final UI state
---

Like and unlike helpers for products and profile posts return whether a document was created or deleted. A `false` result can therefore mean the requested state was already present or absent, not that the requested final state failed.

**Why:** Treating the operation result as the final state caused an optimistic heart and count to reverse incorrectly when the initial state read was stale or a repeated tap raced with the first write.

**How to apply:** After a successful, non-throwing like/unlike call, keep the requested optimistic final state. Roll back only on an exception; use the operation result only for side effects that require a newly-created like.