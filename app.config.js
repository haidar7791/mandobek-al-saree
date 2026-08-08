// app.config.js — evaluated by Metro at startup time (server-side).
// REACT_NATIVE_PACKAGER_HOSTNAME is set by the npm script and is confirmed
// to reach Metro (the QR code URL uses it). We bake it into extra so the
// native bundle can reach the Express server without relying on localhost.
const appJson = require("./app.json");

// Prefer REACT_NATIVE_PACKAGER_HOSTNAME (confirmed set by npm script via shell expansion).
// Fall back to REPLIT_DEV_DOMAIN if available.
// Both are plain domain strings like "abc.pike.replit.dev" (no protocol, no trailing slash).
const rawDomain =
  process.env.REACT_NATIVE_PACKAGER_HOSTNAME ||
  process.env.REPLIT_DEV_DOMAIN ||
  "";

// Guard: must look like a real hostname (contains a dot, no spaces, not localhost/127.0.0.1)
const replitDomain =
  rawDomain &&
  rawDomain.includes(".") &&
  !rawDomain.includes("127.0.0.1") &&
  !rawDomain.includes("localhost")
    ? rawDomain
    : "";

// Log during Metro startup so we can see what was baked in
console.log("[app.config.js] REACT_NATIVE_PACKAGER_HOSTNAME =", process.env.REACT_NATIVE_PACKAGER_HOSTNAME);
console.log("[app.config.js] REPLIT_DEV_DOMAIN             =", process.env.REPLIT_DEV_DOMAIN);
console.log("[app.config.js] baking replitDomain =", replitDomain || "(empty — will use fallback)");

module.exports = {
  ...appJson.expo,
  extra: {
    ...appJson.expo.extra,
    // Always a plain string (empty string if not found, never null/undefined/object)
    replitDomain,
  },
};
