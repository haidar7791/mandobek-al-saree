---
name: Firebase Spark architecture
description: The selected hosting constraint is Firebase Spark-only, so app-facing behavior must avoid Cloud Functions.
---

Use Firebase Auth, Firestore, Storage, and static Firebase Hosting for app-facing behavior that can safely run without a privileged server. Do not add Cloud Functions or imply that they can be deployed on Spark.

**Why:** the user chose a Spark-only rearchitecture rather than moving to Blaze for Functions.

**How to apply:** When replacing a Cloud Run endpoint, move the behavior to the Firebase client SDK or static Hosting only when its security and capabilities permit it. Call out console setup, deployment, or privileged operations that remain outside the Spark architecture.
