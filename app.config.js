// app.config.js — evaluated by Metro at startup time (server-side).
// process.env.REPLIT_DEV_DOMAIN is available in the Replit shell environment,
// so we bake it into Constants.expoConfig.extra for the native bundle.
const appJson = require("./app.json");

const replitDomain = process.env.REPLIT_DEV_DOMAIN ?? null;

module.exports = {
  ...appJson.expo,
  extra: {
    ...appJson.expo.extra,
    // Baked at Metro startup — available as Constants.expoConfig.extra.replitDomain
    replitDomain,
  },
};
