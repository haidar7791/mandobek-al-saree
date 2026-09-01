---
name: EAS Node and Metro watcher constraints
description: Non-obvious EAS version validation and Replit/Metro watcher behavior around global EAS installations.
---

EAS build profiles require a complete Node semver such as `22.22.0`; a wildcard like `22.x` is rejected by EAS config validation even though it clearly denotes the desired major version.

**Why:** A valid-looking wildcard caused every profile to fail EAS config validation, and a global EAS installation nested under the workspace consumed enough file watchers to make Metro fail with `ENOSPC`.

**How to apply:** Pin the exact Node 22 version available to the build environment in every EAS build profile. Run EAS through `npx` rather than keeping a global EAS package inside the project workspace, especially for Expo/Metro projects.