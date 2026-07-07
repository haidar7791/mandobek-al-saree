---
name: EAS Build lockfile issue
description: package-lock.json generated inside Replit contains package-firewall.replit.local resolved URLs that break EAS Build
---

# Rule
Never commit `package-lock.json` generated on Replit to git when using EAS Build (or any external CI).

**Why:** npm install inside Replit goes through `http://package-firewall.replit.local/npm/...` — a Replit-internal proxy. The generated `package-lock.json` records these internal URLs in every `"resolved"` field. EAS build servers cannot reach `package-firewall.replit.local`, so `npm ci` fails silently or resolves incorrectly, causing "expo package was not found" and plugin resolution failures.

**How to apply:** Keep `package-lock.json` in `.gitignore` for all Expo/React Native projects built with EAS. This ensures EAS runs a clean `npm install` from the public npm registry.
