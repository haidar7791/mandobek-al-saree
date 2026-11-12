---
name: FORUS farm-game direction
description: The requested product direction is a mobile farm-management game with per-player Firebase progress.
---

FORUS is being transformed from its marketplace/social home experience into a farm-management game. Keep Firebase Auth for player accounts and save each player's game progress privately in Firestore.

In Replit's development web preview, open a clearly labeled demo farm with local sample state by default. The demo must never write to Firestore or replace authentication in production builds or native apps.

**Why:** the user asked to turn the app into a farm game with planting, harvesting, resource management, and saved player progress.

**How to apply:** Treat the farm gameplay as the primary signed-in experience. Keep Replit's web demo separate from authenticated player saves; do not restore the marketplace dashboard as the home screen unless the user asks, and preserve existing Firebase accounts and unrelated stored data.
