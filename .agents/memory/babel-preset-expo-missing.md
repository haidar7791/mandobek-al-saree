---
name: babel-preset-expo missing after fresh npm install
description: Metro bundler 500s with "Cannot find module 'babel-preset-expo'" even right after npm install, in this Expo SDK 54 project.
---

After a clean `rm -rf node_modules package-lock.json && npm install`, Metro can still fail
to bundle with `Cannot find module 'babel-preset-expo'` (surfaces as a 500 on
`/node_modules/expo-router/entry.bundle` and a blank preview). `npm ls babel-preset-expo`
shows it only nested under `expo`, not hoisted to top-level `node_modules/babel-preset-expo`,
even though the root babel config needs the top-level module resolution.

**Why:** npm's dependency resolution in this project doesn't reliably hoist `babel-preset-expo`
to the top level on every install, but Babel resolves presets via top-level `require`, not
from nested `node_modules/expo/node_modules/`.

**How to apply:** if the frontend workflow bundles with this exact error, run
`npm install babel-preset-expo@<version matching installed expo's dependency> --save-dev`
to force it into top-level `node_modules` and `package.json`, then restart the frontend
workflow. Check the version expo wants via `npm ls babel-preset-expo`.
