---
name: ProfileAvatar steals touch inside story strip
description: ProfileAvatar wraps its content in a Pressable that always routes to /profile; when placed inside another Pressable (story circle) it intercepts the touch before the outer handler fires.
---

## Rule
Always pass `disableNavigation={true}` to `<ProfileAvatar>` when it sits inside any outer `Pressable` (story circles, list items, cards, etc.).

**Why:** `ProfileAvatar` contains its own `<Pressable onPress={() => router.push("/profile")}>`. React Native's touch responder system lets the inner Pressable capture the gesture first, so the outer circle's `onPress` (→ story-viewer) never fires. The user sees the profile screen instead of the expected action.

**How to apply:**
- Story strip in `dashboard.tsx`: both own-story circle fallback and other-user fallback use `<ProfileAvatar ... disableNavigation />`.
- Any new card or list item that places ProfileAvatar inside a tappable container must pass `disableNavigation`.
- The prop renders a plain `View` instead of `Pressable`, so layout is unaffected.
