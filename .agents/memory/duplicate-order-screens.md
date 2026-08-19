---
name: Duplicate product-order screens
description: Two screens render product-order cards; the user-facing one from "طلبات واردة" is reservations.tsx, not product-orders.tsx
---

The app has TWO screens that render buyer/seller product-order cards:

- The dashboard button labeled "طلبات واردة" navigates to the reservations screen (tabs: خدماتي / منتجاتي / طلباتي / السجل). **This is what the user sees.**
- A separate product-orders screen ("طلبات المنتجات", tabs: طلباتي / منتجاتي) also exists and is reachable from other dashboard entry points.

**Why:** An entire UI change was once applied only to the product-orders screen and the user reported "no visible change" — the edit landed in the wrong file. Verified via test-account login that the reservations screen is the one shown from "طلبات واردة".

**How to apply:** Any change to product-order card UI (fields, buttons, statuses) must be applied to BOTH screens — or check which entry point the user means first. Grep for the Arabic tab labels to find both renderers.
