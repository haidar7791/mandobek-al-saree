"use strict";
/**
 * Minimal .env loader — no extra dependencies.
 * Reads whatsapp-server/.env and injects into process.env.
 */
const fs   = require("fs");
const path = require("path");

const envFile = path.join(__dirname, ".env");
if (!fs.existsSync(envFile)) return;   // .env optional; defaults in index.js

const lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/);
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
  if (key && !(key in process.env)) {
    process.env[key] = val;
  }
}
