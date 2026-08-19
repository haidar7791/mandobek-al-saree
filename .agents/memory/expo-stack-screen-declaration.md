---
name: Expo Stack screens must be declared in _layout.tsx
description: Every screen file in app/ must have a matching Stack.Screen entry in _layout.tsx or Expo Router throws "This screen doesn't exist" at runtime.
---

## Rule
Any new screen file added to `app/` must also be registered in the `<Stack>` inside `app/_layout.tsx`.

**Why:** Expo Router's file-based routing still requires each screen to be declared in the Stack (inside a `Stack.Protected` guard or at root level). Without the declaration the router refuses to navigate there and shows a "This screen doesn't exist" error — the screen file's existence alone is not enough.

**How to apply:**
- `story-creator` and `story-viewer` are both declared inside `Stack.Protected guard={isLoggedIn}`.
- When adding any new screen, add `<Stack.Screen name="screen-name" />` in the appropriate Protected block before testing navigation.
