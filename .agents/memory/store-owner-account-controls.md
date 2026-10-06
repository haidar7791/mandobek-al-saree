---
name: Store-owner account controls
description: Where store owners manage account identity while their profile route leads to the storefront.
---

Keep account-level actions for users with the store specialty on the owner-only controls of their own storefront. Do not redirect them away from the storefront just to reach these settings.

**Why:** Store owners use the same storefront customers see, and the profile route forwards them there; profile-only settings would otherwise be inaccessible or disrupt that navigation.

**How to apply:** Gate the controls by the authenticated user matching the store ID. If the user changes to a non-store specialty, send them to the regular profile screen.
