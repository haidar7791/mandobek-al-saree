---
name: EAS Node and Metro watcher constraints
description: Non-obvious EAS version validation and Replit/Metro watcher behavior around global EAS installations.
---

EAS build profiles require a complete Node semver such as `22.22.0`; a wildcard like `22.x` is rejected by EAS config validation even though it clearly denotes the desired major version.

**Why:** A valid-looking wildcard caused every profile to fail EAS config validation, and a global EAS installation nested under the workspace consumed enough file watchers to make Metro fail with `ENOSPC`.

**How to apply:** Pin the exact Node 22 version available to the build environment in every EAS build profile. Run EAS through `npx` rather than keeping a global EAS package inside the project workspace, especially for Expo/Metro projects.

Metro can also exhaust the watcher limit when it crawls an expanded Yarn cache inside the workspace at `.cache/yarn`. Exclude that subtree through Metro's resolver block list; an `ENOSPC` path under the cache is distinct from a project dependency or application-code failure.

**Why:** Expo web export succeeded while the development server failed to watch the cache tree, so excluding the cache let Metro start without changing app code or the workflow port.

**How to apply:** When Metro reports `ENOSPC` in `.cache/yarn`, verify the workflow port and add a block-list pattern for that cache path before restarting.