---
name: Firebase Admin Storage bucket selection
description: How server-side media jobs should locate the Firebase Storage bucket when Admin credentials omit a default bucket.
---

Server-side Firebase Admin initialization from a service-account credential may not expose a default Storage bucket or `admin.options.projectId`, even though Firestore and Auth work.

**Why:** Video thumbnail generation failed at upload time when calling `getStorage(admin).bucket()` without an explicit bucket.

**How to apply:** For jobs working from Firebase download URLs, derive the bucket name from the `/v0/b/<bucket>/o/` path in that URL and pass it explicitly to `getStorage(admin).bucket(bucketName)`. Do not assume the project ID or default bucket is available.