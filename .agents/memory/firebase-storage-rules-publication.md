---
name: Firebase Storage rules publication
description: Local Storage rule changes need a separate Firebase publication before new media paths can upload.
---

New Storage paths must not be considered live just because they appear in `storage.rules`.

**Why:** The repository has no Firebase rules deployment configuration. A real signed-in upload can receive `storage/unauthorized` for a locally defined path when the Firebase Console still serves older rules or the app points to a different bucket.

**How to apply:** Before treating a new media flow as complete, confirm the selected Firebase project and bucket, publish the reviewed Storage rules without making the bucket public, then smoke-test upload, download, Firestore write, and playback with an authenticated account.