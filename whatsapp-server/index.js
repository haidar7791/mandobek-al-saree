"use strict";

/**
 * ForUs – WhatsApp Password-Reset Server
 *
 * Exposes:  POST /api/reset-password  { "phoneNumber": "07XXXXXXXXX" }
 *
 * Flow:
 *  1. Convert Iraqi phone → Firebase email  (07xx → 07xx@sanad.app)
 *  2. Generate a Firebase password-reset link via Admin SDK
 *  3. Convert phone to international WhatsApp JID  (07xx → 964xx@c.us)
 *  4. Send the link via whatsapp-web.js
 *
 * Setup:
 *  • Copy .env.example → .env and fill in values
 *  • Place your Firebase service-account JSON at ./serviceAccountKey.json
 *    (download from Firebase Console → Project Settings → Service Accounts)
 *  • npm install
 *  • node index.js   — scan the QR that appears in the terminal
 */

const express = require("express");
const qrcode  = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const admin   = require("firebase-admin");
const fs      = require("fs");
const path    = require("path");

// ─── Load env ────────────────────────────────────────────────────────────────
require("./env");   // tiny helper – see env.js

const PORT            = process.env.PORT            || 3001;
const FIREBASE_PID    = process.env.FIREBASE_PROJECT_ID || "mandobek-al-saree";

// ─── Firebase Admin init ─────────────────────────────────────────────────────
function initFirebase() {
  let credential;

  // Option A: JSON file path via GOOGLE_APPLICATION_CREDENTIALS
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && fs.existsSync(path.resolve(credPath))) {
    const serviceAccount = JSON.parse(
      fs.readFileSync(path.resolve(credPath), "utf8")
    );
    credential = admin.credential.cert(serviceAccount);
    console.log("✅ Firebase Admin: loaded from", credPath);
  }
  // Option B: full JSON string in env var
  else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    credential = admin.credential.cert(serviceAccount);
    console.log("✅ Firebase Admin: loaded from FIREBASE_SERVICE_ACCOUNT_JSON");
  }
  else {
    console.error(
      "❌  Firebase Admin credential not found.\n" +
      "    Place serviceAccountKey.json in whatsapp-server/ and set\n" +
      "    GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json in .env"
    );
    process.exit(1);
  }

  admin.initializeApp({ credential, projectId: FIREBASE_PID });
}

initFirebase();

// ─── WhatsApp client ──────────────────────────────────────────────────────────
const waClient = new Client({
  authStrategy: new LocalAuth({ dataPath: ".wwebjs_auth" }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
    ],
  },
});

let waReady = false;

waClient.on("qr", (qr) => {
  console.log("\n══════════════════════════════════════════════");
  console.log("  امسح رمز QR بواتساب رقم 07827263200");
  console.log("══════════════════════════════════════════════\n");
  qrcode.generate(qr, { small: true });
});

waClient.on("authenticated", () => {
  console.log("✅ WhatsApp: تمت المصادقة بنجاح");
});

waClient.on("ready", () => {
  waReady = true;
  console.log("✅ WhatsApp: العميل جاهز لإرسال الرسائل");
});

waClient.on("auth_failure", (msg) => {
  console.error("❌ WhatsApp auth failure:", msg);
  waReady = false;
});

waClient.on("disconnected", (reason) => {
  console.warn("⚠️  WhatsApp disconnected:", reason);
  waReady = false;
});

waClient.initialize().catch((err) => {
  console.error("❌ WhatsApp initialize error:", err.message);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalize Iraqi phone number to international format for WhatsApp JID.
 *   07XXXXXXXX  → 9647XXXXXXXX@c.us
 *   7XXXXXXXX   → 9647XXXXXXXX@c.us
 *   9647XXXXXXXX → 9647XXXXXXXX@c.us
 */
function toWhatsAppJid(phone) {
  let digits = phone.replace(/\D/g, "");          // strip non-digits
  if (digits.startsWith("964")) {
    // already international
  } else if (digits.startsWith("0")) {
    digits = "964" + digits.slice(1);             // 07xx → 9647xx
  } else if (digits.startsWith("7")) {
    digits = "964" + digits;                      // 7xx → 9647xx
  }
  return digits + "@c.us";
}

/**
 * Convert phone to the Firebase email format used by the app.
 *   07XXXXXXXX → 07XXXXXXXX@sanad.app
 */
function toFirebaseEmail(phone) {
  return phone.trim() + "@sanad.app";
}

/** Basic Iraqi phone validation */
function isValidIraqiPhone(phone) {
  const digits = phone.replace(/\D/g, "");
  return /^(964)?07\d{8}$/.test(digits) || /^07\d{8}$/.test(digits);
}

// ─── Express app ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    whatsapp: waReady ? "ready" : "not_ready",
  });
});

/**
 * POST /api/reset-password
 * Body: { "phoneNumber": "07XXXXXXXXX" }
 */
app.post("/api/reset-password", async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber || typeof phoneNumber !== "string") {
    return res.status(400).json({ error: "phoneNumber مطلوب" });
  }

  const phone = phoneNumber.trim();

  if (!isValidIraqiPhone(phone)) {
    return res.status(400).json({
      error: "رقم الهاتف غير صحيح — يجب أن يكون رقماً عراقياً (07XXXXXXXXX)",
    });
  }

  if (!waReady) {
    return res.status(503).json({
      error: "خدمة الواتساب غير جاهزة — يرجى انتظار مسح رمز QR",
    });
  }

  // 1. Build Firebase email
  const userEmail = toFirebaseEmail(phone);

  // 2. Generate password-reset link
  let resetLink;
  try {
    resetLink = await admin.auth().generatePasswordResetLink(userEmail);
  } catch (err) {
    const code = err.errorInfo?.code || err.code || "unknown";

    if (code === "auth/user-not-found") {
      return res.status(404).json({
        error: "لا يوجد حساب مرتبط بهذا الرقم",
      });
    }

    console.error("Firebase generatePasswordResetLink error:", err.message);
    return res.status(500).json({
      error: "فشل توليد رابط إعادة التعيين — يرجى المحاولة لاحقاً",
    });
  }

  // 3. Send via WhatsApp
  const jid = toWhatsAppJid(phone);
  const message =
    `مرحباً 👋\n\n` +
    `تلقينا طلب إعادة تعيين كلمة المرور لحسابك في تطبيق *فورس - ForUs*.\n\n` +
    `اضغط على الرابط التالي لإعادة تعيين كلمة المرور:\n${resetLink}\n\n` +
    `⏰ الرابط صالح لمدة ساعة واحدة فقط.\n\n` +
    `إذا لم تطلب إعادة التعيين، يمكنك تجاهل هذه الرسالة.`;

  try {
    await waClient.sendMessage(jid, message);
    console.log(`✅ Password-reset link sent to ${phone} (${jid})`);
    return res.json({ success: true, message: "تم إرسال رابط إعادة التعيين عبر الواتساب" });
  } catch (err) {
    console.error("WhatsApp sendMessage error:", err.message);
    return res.status(500).json({
      error: "فشل إرسال رسالة الواتساب — يرجى المحاولة لاحقاً",
    });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 ForUs WhatsApp Server يعمل على المنفذ ${PORT}`);
  console.log(`   GET  http://localhost:${PORT}/health`);
  console.log(`   POST http://localhost:${PORT}/api/reset-password\n`);
  console.log("⏳ جاري تهيئة WhatsApp — انتظر رمز QR ...\n");
});
