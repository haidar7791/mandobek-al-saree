---
name: Firestore phone lookup privacy
description: Safe pre-authentication phone existence checks without exposing user documents
---

Firestore rules cannot allow unauthenticated queries that expose only one field from a user document; reads are document-level, and query rules are not filters.

**Why:** A public `users` query would expose every returned user field, while allowing arbitrary phone queries cannot be constrained to a single field in rules.

**How to apply:** Store a minimal normalized-phone index document, allow only exact document gets publicly, block list queries, and write the index after authenticated phone registration.