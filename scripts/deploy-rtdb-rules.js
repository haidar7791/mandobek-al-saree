#!/usr/bin/env node
/**
 * Deploys Firebase Realtime Database security rules using firebase-admin SDK.
 * Run once: node scripts/deploy-rtdb-rules.js
 *
 * Requires: FIREBASE_SERVICE_ACCOUNT env var (JSON string of the service account key)
 */

const https = require("https");

const RULES = {
  rules: {
    // Presence: authenticated users can read anyone's presence,
    // but can only write their own node.
    presence: {
      $uid: {
        ".read": "auth != null",
        ".write": "auth.uid === $uid",
      },
    },
    // Deny everything else by default
    $other: {
      ".read": false,
      ".write": false,
    },
  },
};

function httpsRequest(urlStr, options, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(urlStr);
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || "GET",
      headers: options.headers || {},
    };
    const req = https.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saJson) {
    console.error("❌ FIREBASE_SERVICE_ACCOUNT env var is not set");
    process.exit(1);
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(saJson);
  } catch (e) {
    console.error("❌ Failed to parse FIREBASE_SERVICE_ACCOUNT:", e.message);
    process.exit(1);
  }

  const projectId = serviceAccount.project_id;
  const databaseURL = `https://${projectId}-default-rtdb.firebaseio.com`;
  console.log(`📡 Project: ${projectId}`);
  console.log(`📡 Database: ${databaseURL}`);

  // Initialize firebase-admin and get an access token via its credential
  const admin = require("firebase-admin");
  let app;
  try {
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL,
    });
  } catch (e) {
    // Already initialized (e.g. multiple runs)
    app = admin.app();
  }

  let token;
  try {
    const tokenResult = await app.options.credential.getAccessToken();
    token = tokenResult.access_token;
    console.log("🔑 Got access token via firebase-admin");
  } catch (e) {
    console.error("❌ Failed to get access token:", e.message);
    process.exit(1);
  }

  const rulesJson = JSON.stringify(RULES, null, 2);

  // RTDB rules endpoint: PUT /.settings/rules.json with token as query param
  const rulesUrl = `${databaseURL}/.settings/rules.json?access_token=${encodeURIComponent(token)}`;
  console.log(`\n📤 Deploying rules via RTDB REST API...`);

  const result = await httpsRequest(
    rulesUrl,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(rulesJson),
      },
    },
    rulesJson
  );

  if (result.status === 200) {
    console.log("✅ RTDB rules deployed successfully!");
    console.log("\nRules applied:");
    console.log(rulesJson);
  } else {
    console.error(`❌ Failed: HTTP ${result.status}`);
    console.error(result.body);
    
    // Print manual instructions as fallback
    console.log("\n──────────────────────────────────────────────────");
    console.log("📋 MANUAL STEPS (if automatic deploy fails):");
    console.log("1. Go to https://console.firebase.google.com/project/mandobek-al-saree/database/mandobek-al-saree-default-rtdb/rules");
    console.log("2. Replace the rules with:");
    console.log(rulesJson);
    console.log("3. Click Publish");
    console.log("──────────────────────────────────────────────────");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("❌ Unexpected error:", e.message);
  process.exit(1);
});
