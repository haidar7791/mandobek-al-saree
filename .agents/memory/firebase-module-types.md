---
name: Firebase module type exports
description: Firebase 12 runtime subpath imports may lack top-level declaration files after the Replit install.
---

Firebase 12.17.1 can expose working runtime entry points for `firebase/storage` and `firebase/remote-config` without declarations discoverable by TypeScript.

**Why:** The app uses those direct subpath imports, so a clean TypeScript check otherwise reports false missing-declaration errors even though Metro and the runtime bundle correctly.

**How to apply:** Keep a small project-local declaration shim that re-exports the corresponding `@firebase/*` package types instead of weakening TypeScript checks or changing runtime imports.