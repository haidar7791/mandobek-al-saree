---
name: FORUS farm-game direction
description: The requested product direction is a mobile farm-management game with per-player Firebase progress.
---

FORUS is being transformed from its marketplace/social home experience into a farm-management game. Keep Firebase Auth for player accounts and save each player's game progress privately in Firestore.

**Why:** the user asked to turn the app into a farm game with planting, harvesting, resource management, and saved player progress.

**How to apply:** Treat the farm gameplay as the primary signed-in experience. Do not restore the marketplace dashboard as the home screen unless the user asks; preserve existing Firebase accounts and unrelated stored data.
