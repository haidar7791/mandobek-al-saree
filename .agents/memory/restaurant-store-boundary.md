---
name: Restaurant/store boundary
description: Keep restaurant-specialty work isolated from the completed store-specialty experience.
---

Restaurant changes must not alter the completed store screens or behavior.

**Why:** The user emphasized that the restaurant experience should adopt the store pattern without changing anything related to the store.

**How to apply:** Keep restaurant-specific changes in restaurant routes and components. If a shared component must change, verify that the store experience remains unchanged.
