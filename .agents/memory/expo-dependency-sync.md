---
name: Expo dependency sync
description: Expo config-plugin startup failures caused by a declared but absent node_modules package
---

When Expo reports that a configured plugin cannot be resolved, verify both package.json and node_modules; a declared dependency may still need to be installed in the current workspace.

**Why:** The frontend workflow failed during validation because the Google Sign-In package was declared but absent from node_modules; installing the declared version restored Metro without changing app configuration.

**How to apply:** Check the installed package directory before changing app.config.js or removing a plugin, then synchronize the dependency through the project package manager and restart Expo once.