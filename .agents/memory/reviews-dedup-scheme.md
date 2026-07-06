---
name: Reviews one-per-client-per-artisan scheme
description: How duplicate review prevention is implemented and what Firestore rules must match
---

Reviews live in the subcollection `artisans/{artisanId}/reviews/{reviewId}`. To guarantee a client can only ever have one review per artisan (re-submitting updates it instead of duplicating), the doc ID is deterministic: `${clientId}_${artisanId}`, written via `setDoc(..., { merge: true })` instead of `addDoc`.

**Why:** `addDoc` always creates a new document with a random ID, so the same client rating the same artisan twice produced two review documents and skewed the average. A deterministic ID makes the second write an update of the first.

**How to apply:** Any Firestore security rule for reviews must target the subcollection path `artisans/{artisanId}/reviews/{reviewId}`, not a stale top-level `reviews/{reviewId}` collection — the two are unrelated paths in Firestore. When allowing `update`, check `resource.data.clientId == request.auth.uid` (not just `create`), since re-submission is a write to an existing doc.
