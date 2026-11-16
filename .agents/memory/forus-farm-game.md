---
name: FORUS farm-game direction
description: The requested product direction is a mobile farm-management game with per-player Firebase progress.
---

FORUS is being transformed from its marketplace/social home experience into a farm-management game. Keep Firebase Auth for player accounts and save each player's game progress privately in Firestore.

In Replit's development web preview, open a clearly labeled demo farm with local sample state by default. The demo must never write to Firestore or replace authentication in production builds or native apps.

The farm world is an open grid: crops, the house, fruit trees, and decorations can be placed or moved within the player's land. A new player starts in one fenced parcel with a house, three fields, and a worker. Only adjacent parcels can be bought, shared fences disappear as owned parcels merge, and new parcels have obstacles that players clear manually by spending gems earned from quests. Workers visibly move between fruit trees and are the only way to harvest fruit; worker and expansion prices increase with each purchase. Apples, oranges, peaches, and lemons are collectible fruit trees. Crop growth continues in real time without watering.

The play area should read as one broad grassy landscape without visible tile-grid lines or manual zoom buttons. Put tools and purchases in a separate collapsible panel that takes its own layout space; use one-finger pan and two-finger pinch for world navigation. Empty purchased fields stay in place after harvest, and tapping one opens the crop picker.

**Why:** the user asked for a classic open-grid farm game with real-time crops, collectible fruit trees, movable buildings and decorations, and saved player progress.

**How to apply:** Treat the farm gameplay as the primary signed-in experience. Keep Replit's web demo separate from authenticated player saves; do not add watering mechanics or restore the marketplace dashboard as the home screen unless the user asks; preserve existing Firebase accounts and migrate each player's existing farm data forward without deleting it. Keep empty field objects persistent and start crop growth only after the player chooses a crop in the field picker. Preserve fenced parcel ownership and require expansions to connect to current land. Save quest progress, gems, worker movement, and fruit collection per player; workers harvest fruit but never clear obstacles, which require a manual gem payment.
