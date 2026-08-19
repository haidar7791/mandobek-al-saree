---
name: Stories Firestore composite index trap
description: Firestore queries on stories with userId equality + createdAt inequality require a composite index that doesn't exist; causes silent fetch failure → story viewer exits immediately.
---

## Rule
Never combine `where("userId", "==", x)` + `where("createdAt", ">", since)` + `orderBy("createdAt")` in a single Firestore query for the `stories` collection.

**Why:** Firestore auto-creates single-field indexes only. A compound query with an equality filter on one field and an inequality on another requires a manually-created composite index. Without it the SDK throws an error (with a link to create the index). In the story viewer this error is caught and triggers `router.back()` — making it look like a loading spinner followed by an instant exit, with no visible crash.

**How to apply:**
- `fetchUserStories` and `subscribeToMyStories`: query with `where("userId", "==", uid)` + `orderBy("createdAt", "asc")` only, then filter `createdAt > since` client-side after mapping the docs.
- `subscribeToActiveStories`: uses `where("createdAt", ">", since)` alone (single-field inequality) which works with the auto-index.
- General rule: if Firestore throws and a screen immediately exits/backs, suspect a missing composite index before suspecting auth rules.
