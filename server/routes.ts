import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";

// ─── Firebase Admin (lazy-initialized) ───────────────────────────────────────
// Requires FIREBASE_SERVICE_ACCOUNT env-var to be set to the JSON contents of
// a Firebase service account key (Project Settings → Service accounts →
// Generate new private key).

let adminApp: import("firebase-admin/app").App | null = null;

async function getAdminApp(): Promise<import("firebase-admin/app").App> {
  if (adminApp) return adminApp;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT environment variable is not set. " +
        "Generate a service account key from Firebase Console → Project Settings " +
        "→ Service accounts, paste the JSON as the FIREBASE_SERVICE_ACCOUNT secret."
    );
  }

  const { initializeApp, cert, getApps, getApp } = await import(
    "firebase-admin/app"
  );
  if (getApps().length > 0) {
    adminApp = getApp();
    return adminApp;
  }

  const serviceAccount = JSON.parse(raw);
  adminApp = initializeApp({ credential: cert(serviceAccount) });
  return adminApp;
}

// ─── Phone normalizer ─────────────────────────────────────────────────────────
// Firebase Phone Auth stores numbers in E.164 format (+9647xxxxxxxx).
// Firestore users store raw Iraqi format (07xxxxxxxx).
// This converts E.164 → 07xxxxxxxx for lookups.

function e164ToIraqiLocal(e164: string): string {
  // +9647xxxxxxxx → 07xxxxxxxx
  if (e164.startsWith("+9647")) return "0" + e164.slice(4);
  if (e164.startsWith("9647")) return "0" + e164.slice(3);
  return e164;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  /**
   * POST /api/reset-password
   *
   * Body: { idToken: string, newPassword: string }
   *
   * Flow:
   *  1. Verify the Firebase Phone Auth id-token to confirm phone ownership.
   *  2. Derive the raw Iraqi phone from the token's phone_number claim.
   *  3. Look up the Firestore `users` collection for a user with that phone.
   *  4. Update the user's Firebase Auth password via Admin SDK.
   */
  app.post("/api/reset-password", async (req: Request, res: Response) => {
    try {
      const { idToken, newPassword } = req.body as {
        idToken?: string;
        newPassword?: string;
      };

      if (!idToken || !newPassword) {
        res.status(400).json({ error: "idToken and newPassword are required" });
        return;
      }

      if (typeof newPassword !== "string" || newPassword.length < 6) {
        res
          .status(400)
          .json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
        return;
      }

      // ── 1. Verify id-token ──────────────────────────────────────────────
      const admin = await getAdminApp();
      const { getAuth } = await import("firebase-admin/auth");
      const { getFirestore } = await import("firebase-admin/firestore");

      const decoded = await getAuth(admin).verifyIdToken(idToken);

      const phoneE164: string | undefined = decoded.phone_number;
      if (!phoneE164) {
        res.status(403).json({
          error:
            "الرمز المُرسَل لا يحتوي على رقم هاتف — يرجى التحقق مجدداً",
        });
        return;
      }

      // ── 2. Normalise phone to Iraqi local format ─────────────────────────
      const localPhone = e164ToIraqiLocal(phoneE164);

      // ── 3. Find the email/password user by phone in Firestore ────────────
      const db = getFirestore(admin);
      const snap = await db
        .collection("users")
        .where("phone", "==", localPhone)
        .limit(1)
        .get();

      if (snap.empty) {
        res
          .status(404)
          .json({ error: "لم يُعثر على حساب مرتبط بهذا الرقم" });
        return;
      }

      const targetUid = snap.docs[0].id;

      // ── 4. Update password ───────────────────────────────────────────────
      await getAuth(admin).updateUser(targetUid, { password: newPassword });

      // Optionally clean up the ephemeral phone-auth account that was created
      // during OTP verification (it's a different UID from the email/password one).
      if (decoded.uid !== targetUid) {
        try {
          await getAuth(admin).deleteUser(decoded.uid);
        } catch {
          // Non-fatal — the phone account is orphaned but harmless.
        }
      }

      res.json({ ok: true });
    } catch (err: any) {
      console.error("[reset-password] error:", err);

      if (err.message?.includes("FIREBASE_SERVICE_ACCOUNT")) {
        res.status(503).json({
          error:
            "خدمة إعادة تعيين كلمة المرور غير مهيأة بعد — يرجى التواصل مع الدعم",
        });
        return;
      }

      const code: string = err.code ?? "";
      if (code === "auth/id-token-expired") {
        res.status(401).json({ error: "انتهت صلاحية رمز التحقق — أعد المحاولة" });
      } else if (code === "auth/argument-error" || code === "auth/invalid-id-token") {
        res.status(401).json({ error: "رمز تحقق غير صالح" });
      } else {
        res.status(500).json({ error: "حدث خطأ أثناء تحديث كلمة المرور" });
      }
    }
  });

  // ─── WhatsApp OTP via UltraMsg ───────────────────────────────────────────────

  /** In-memory OTP store: E.164 phone → { code, expiresAt } (5-min TTL) */
  const otpStore = new Map<string, { code: string; expiresAt: number }>();

  function generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Convert any Iraqi phone input to E.164 (+9647xxxxxxxx).
   * Handles: spaces/dashes/parens/plus signs, 00964/+964/964 prefix with
   * optional redundant leading zero (e.g. 96407… → +9647…), and bare
   * local formats (07…, 7…).
   */
  function toE164Server(phone: string): string {
    // Strip everything that isn't a digit
    const t = phone.trim().replace(/[\s\-()+]/g, "");

    if (t.startsWith("00964")) {
      const rest = t.slice(5);                          // digits after 00964
      return "+964" + (rest.startsWith("0") ? rest.slice(1) : rest);
    }
    if (t.startsWith("964")) {
      const rest = t.slice(3);                          // digits after 964
      return "+964" + (rest.startsWith("0") ? rest.slice(1) : rest);
    }
    if (t.startsWith("07")) return "+964" + t.slice(1); // 07… → +9647…
    if (t.startsWith("0"))  return "+964" + t.slice(1); // 0…  → +964…
    if (t.startsWith("7"))  return "+964" + t;           // 7…  → +9647…
    return "+964" + t;
  }

  /**
   * POST /api/send-whatsapp-otp
   * Body: { phone: string }
   * Generates a 6-digit OTP, stores it for 5 minutes, and sends it via UltraMsg.
   */
  app.post("/api/send-whatsapp-otp", async (req: Request, res: Response) => {
    const { phone, forRegistration } = req.body as { phone?: string; forRegistration?: boolean };
    if (!phone) {
      res.status(400).json({ error: "phone is required" });
      return;
    }

    const e164   = toE164Server(phone);
    const waPhone = e164.replace(/^\+/, ""); // UltraMsg wants no leading +

    // ── Duplicate check for new registrations ───────────────────────────────
    if (forRegistration) {
      try {
        const admin = await getAdminApp();
        const { getAuth } = await import("firebase-admin/auth");
        await getAuth(admin).getUserByPhoneNumber(e164);
        // Reached here → user already exists
        res.status(409).json({ ok: false, error: "الحساب موجود بالفعل، يرجى تسجيل الدخول", exists: true });
        return;
      } catch (authErr: any) {
        if (authErr.code !== "auth/user-not-found") {
          // Unexpected error (network, config, etc.)
          console.error("[WhatsApp OTP] duplicate-check error:", authErr);
          res.status(500).json({ error: "تعذّر التحقق من الحساب — حاول مجدداً" });
          return;
        }
        // auth/user-not-found → no existing account → proceed
      }
    }

    // Clean stale entries then generate fresh OTP
    const now = Date.now();
    for (const [k, v] of otpStore) if (v.expiresAt < now) otpStore.delete(k);

    const code = generateOtp();
    otpStore.set(e164, { code, expiresAt: now + 5 * 60 * 1000 });

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
      console.error("[WhatsApp OTP] WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN not set");
      otpStore.delete(e164);
      res.status(503).json({ error: "خدمة الرسائل غير مهيأة — يرجى التواصل مع الدعم" });
      return;
    }

    // waPhone is E.164 without leading + (Meta API format)
    console.log(`[WhatsApp OTP] sending to ${e164} via Meta Cloud API`);
    try {
      const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME;

      const msgBody = templateName
        // ── Template message (production: pre-approved OTP template) ──
        ? {
            messaging_product: "whatsapp",
            to: waPhone,
            type: "template",
            template: {
              name: templateName,
              language: { code: "ar" },
              components: [{
                type: "body",
                parameters: [{ type: "text", text: code }],
              }],
            },
          }
        // ── Text message (testing / open conversations) ──
        : {
            messaging_product: "whatsapp",
            to: waPhone,
            type: "text",
            text: { body: `رمز التحقق الخاص بك في تطبيق فورس هو: *${code}*\nصالح لمدة 5 دقائق ⏱` },
          };

      const response = await fetch(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(msgBody),
        }
      );
      const data = await response.json() as any;
      console.log("[WhatsApp OTP] Meta API status:", response.status);
      console.log("[WhatsApp OTP] Meta API response:", JSON.stringify(data));

      if (!response.ok || data?.error) {
        throw new Error(
          data?.error?.message ?? `Meta API HTTP ${response.status}: ${JSON.stringify(data)}`
        );
      }

      res.json({ ok: true });
    } catch (err: any) {
      console.error("[WhatsApp OTP] send error:", err);
      otpStore.delete(e164);
      res.status(500).json({ error: err.message ?? "فشل إرسال رمز التحقق" });
    }
  });

  /**
   * POST /api/verify-whatsapp-otp
   * Body: { phone: string, code: string }
   * Validates the OTP, then gets-or-creates a Firebase Auth user and returns a custom token.
   */
  app.post("/api/verify-whatsapp-otp", async (req: Request, res: Response) => {
    const { phone, code, password, forRegistration } = req.body as {
      phone?: string; code?: string; password?: string; forRegistration?: boolean;
    };
    if (!phone || !code) {
      res.status(400).json({ error: "phone and code are required" });
      return;
    }

    const e164  = toE164Server(phone);
    const entry = otpStore.get(e164);

    if (!entry) {
      res.status(400).json({ error: "لم يُرسل رمز لهذا الرقم — أرسل رمزاً جديداً" });
      return;
    }
    if (Date.now() > entry.expiresAt) {
      otpStore.delete(e164);
      res.status(400).json({ error: "انتهت صلاحية الرمز — اطلب رمزاً جديداً" });
      return;
    }
    if (entry.code !== code.trim()) {
      res.status(400).json({ error: "الرمز غير صحيح — تحقق وأعد المحاولة" });
      return;
    }

    // OTP valid — consume it (single-use)
    otpStore.delete(e164);

    try {
      const admin = await getAdminApp();
      const { getAuth } = await import("firebase-admin/auth");

      // Fake-email used for password-based login compatibility (matches client toFirebaseEmail)
      const rawLocal  = e164ToIraqiLocal(e164); // 07xxxxxxxx
      const fakeEmail = `${rawLocal}@sanad.app`;
      const safePass  = password && password.length >= 6 ? password : undefined;

      let uid: string;
      try {
        const existing = await getAuth(admin).getUserByPhoneNumber(e164);
        uid = existing.uid;
        // On registration: ensure the user has fake-email + password for signInWithEmailAndPassword
        if (forRegistration && safePass) {
          await getAuth(admin).updateUser(uid, {
            email: fakeEmail,
            emailVerified: true,
            password: safePass,
          }).catch(() => {/* non-fatal if email already claimed */});
        }
      } catch (notFound: any) {
        if (notFound.code !== "auth/user-not-found") throw notFound;
        // New user — create with phone + fake-email + password for dual-auth
        const created = await getAuth(admin).createUser({
          phoneNumber: e164,
          ...(safePass ? {
            email: fakeEmail,
            emailVerified: true,
            password: safePass,
          } : {}),
        });
        uid = created.uid;
      }

      const customToken = await getAuth(admin).createCustomToken(uid);
      res.json({ ok: true, customToken, uid, e164 });
    } catch (err: any) {
      console.error("[WhatsApp OTP] verify error:", err);
      res.status(500).json({ error: err.message ?? "فشل التحقق من الرمز" });
    }
  });

  /**
   * POST /api/verify-otp-only
   * Body: { phone: string, code: string }
   *
   * Validates a WhatsApp OTP without creating or modifying any Firebase Auth user.
   * Used by the profile screen to verify a new phone number before persisting it.
   */
  app.post("/api/verify-otp-only", async (req: Request, res: Response) => {
    const { phone, code } = req.body as { phone?: string; code?: string };
    if (!phone || !code) {
      res.status(400).json({ ok: false, error: "phone and code are required" });
      return;
    }
    const e164  = toE164Server(phone);
    const entry = otpStore.get(e164);
    if (!entry) {
      res.status(400).json({ ok: false, error: "لم يُرسل رمز لهذا الرقم — أرسل رمزاً جديداً" });
      return;
    }
    if (Date.now() > entry.expiresAt) {
      otpStore.delete(e164);
      res.status(400).json({ ok: false, error: "انتهت صلاحية الرمز — اطلب رمزاً جديداً" });
      return;
    }
    if (entry.code !== code.trim()) {
      res.status(400).json({ ok: false, error: "الرمز غير صحيح — تحقق وأعد المحاولة" });
      return;
    }
    // Valid — consume (single-use)
    otpStore.delete(e164);
    res.json({ ok: true });
  });

  // ─── Email OTP ───────────────────────────────────────────────────────────────

  /** In-memory Email OTP store: email → { code, expiresAt } (5-min TTL) */
  const emailOtpStore = new Map<string, { code: string; expiresAt: number }>();

  /**
   * POST /api/send-email-otp
   * Body: { email: string }
   * Generates a 6-digit OTP and sends it via Gmail (nodemailer).
   * Requires EMAIL_USER and EMAIL_PASS environment variables.
   */
  app.post("/api/send-email-otp", async (req: Request, res: Response) => {
    const { email, forRegistration } = req.body as { email?: string; forRegistration?: boolean };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "بريد إلكتروني غير صحيح" });
      return;
    }

    // ── Duplicate check for new registrations ───────────────────────────────
    if (forRegistration) {
      try {
        const admin = await getAdminApp();
        const { getAuth } = await import("firebase-admin/auth");
        await getAuth(admin).getUserByEmail(email.toLowerCase().trim());
        res.status(409).json({ ok: false, error: "الحساب موجود بالفعل، يرجى تسجيل الدخول", exists: true });
        return;
      } catch (authErr: any) {
        if (authErr.code !== "auth/user-not-found") {
          console.error("[Email OTP] duplicate-check error:", authErr);
          res.status(500).json({ error: "تعذّر التحقق من الحساب — حاول مجدداً" });
          return;
        }
        // auth/user-not-found → no existing account → proceed
      }
    }

    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;
    if (!emailUser || !emailPass) {
      console.error("[Email OTP] EMAIL_USER / EMAIL_PASS not set");
      res.status(503).json({ error: "خدمة البريد غير مهيأة — يرجى التواصل مع الدعم" });
      return;
    }

    // Clean stale entries
    const now = Date.now();
    for (const [k, v] of emailOtpStore) if (v.expiresAt < now) emailOtpStore.delete(k);

    const code = generateOtp();
    const key  = email.toLowerCase().trim();
    emailOtpStore.set(key, { code, expiresAt: now + 5 * 60 * 1000 });

    console.log(`[Email OTP] sending to ${key}`);
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: emailUser, pass: emailPass },
      });

      await transporter.sendMail({
        from: `"فورس - ForUs" <${emailUser}>`,
        to: email,
        subject: "رمز التحقق - فورس",
        html: `
          <div dir="rtl" style="font-family:Arial,sans-serif;text-align:right;padding:24px;max-width:480px;margin:auto">
            <h2 style="color:#0D1B3E">رمز التحقق الخاص بك</h2>
            <p style="color:#444">أدخل الرمز التالي لإتمام إنشاء حسابك في تطبيق <strong>فورس</strong>:</p>
            <div style="background:#f5f0e8;border-radius:12px;padding:20px;text-align:center;margin:20px 0">
              <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#C9A84C">${code}</span>
            </div>
            <p style="color:#888;font-size:13px">صالح لمدة 5 دقائق فقط · لا تشاركه مع أحد</p>
          </div>`,
      });

      console.log(`[Email OTP] sent ✓ to ${key}`);
      res.json({ ok: true });
    } catch (err: any) {
      emailOtpStore.delete(key);
      console.error("[Email OTP] send error:", err);
      res.status(500).json({ error: "فشل إرسال رمز التحقق — تحقق من البريد وأعد المحاولة" });
    }
  });

  /**
   * POST /api/verify-email-otp
   * Body: { email: string, code: string, password?: string }
   * Validates OTP, gets-or-creates Firebase Auth user, returns custom token.
   */
  app.post("/api/verify-email-otp", async (req: Request, res: Response) => {
    const { email, code, password } = req.body as {
      email?: string; code?: string; password?: string;
    };

    if (!email || !code) {
      res.status(400).json({ error: "email and code are required" });
      return;
    }

    const key   = email.toLowerCase().trim();
    const entry = emailOtpStore.get(key);

    if (!entry) {
      res.status(400).json({ error: "لم يُرسل رمز لهذا البريد — أرسل رمزاً جديداً" });
      return;
    }
    if (Date.now() > entry.expiresAt) {
      emailOtpStore.delete(key);
      res.status(400).json({ error: "انتهت صلاحية الرمز — اطلب رمزاً جديداً" });
      return;
    }
    if (entry.code !== code.trim()) {
      res.status(400).json({ error: "الرمز غير صحيح — تحقق وأعد المحاولة" });
      return;
    }

    // OTP valid — single use
    emailOtpStore.delete(key);

    try {
      const admin = await getAdminApp();
      const { getAuth } = await import("firebase-admin/auth");

      let uid: string;
      try {
        const existing = await getAuth(admin).getUserByEmail(email);
        uid = existing.uid;
      } catch {
        // User doesn't exist — create with email. Use provided password or a strong random one.
        const safePass = (password && password.length >= 6)
          ? password
          : Math.random().toString(36).slice(-8) + "Aa1!";
        const created = await getAuth(admin).createUser({
          email,
          emailVerified: true,
          ...(safePass ? { password: safePass } : {}),
        });
        uid = created.uid;
      }

      const customToken = await getAuth(admin).createCustomToken(uid);
      res.json({ ok: true, customToken, uid, email });
    } catch (err: any) {
      console.error("[Email OTP] verify error:", err);
      res.status(500).json({ error: err.message ?? "فشل التحقق من الرمز" });
    }
  });

  // ─── Forgot / Reset password via secure token ────────────────────────────────

  /** Reset token store: hex-token → { uid, identifier, type, expiresAt } (15-min TTL) */
  const resetTokenStore = new Map<string, {
    uid: string;
    identifier: string;
    type: "phone" | "email";
    expiresAt: number;
  }>();

  function generateResetToken(): string {
    // 40-char alphanumeric token — no native crypto needed on Node 18
    return Array.from({ length: 40 }, () =>
      Math.floor(Math.random() * 36).toString(36)
    ).join("");
  }

  function getResetLinkBase(): string {
    // Always use the stable Cloud Run URL so reset links work from any device
    return "https://forus-backend-laoeoqcoza-ew.a.run.app";
  }

  // ─── Reset-password web page (opened from the link in WhatsApp / email) ─────
  /**
   * GET /reset-password?token=<token>
   *
   * Serves a self-contained HTML form. The user enters a new password and
   * the page POSTs to /api/reset-password-with-token via fetch — no Expo needed.
   */
  app.get("/reset-password", (req: Request, res: Response) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";

    // Validate token exists and has not expired — do NOT delete it here.
    // The token is only consumed after a successful POST /api/reset-password-with-token.
    const tokenEntry = token ? resetTokenStore.get(token) : null;
    const tokenValid = tokenEntry != null && Date.now() <= tokenEntry.expiresAt;

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>إعادة تعيين كلمة المرور – فورس</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#0D1B3E;min-height:100vh;
         display:flex;align-items:center;justify-content:center;padding:20px}
    .card{background:#fff;border-radius:20px;padding:32px 28px;width:100%;max-width:420px;
          box-shadow:0 20px 60px rgba(0,0,0,.35)}
    .logo{text-align:center;margin-bottom:24px}
    .logo h1{font-size:26px;color:#0D1B3E;font-weight:800;letter-spacing:1px}
    .logo p{font-size:13px;color:#888;margin-top:4px}
    label{display:block;font-size:13px;font-weight:600;color:#333;margin-bottom:6px}
    .field{margin-bottom:18px;position:relative}
    input[type=password],input[type=text]{width:100%;padding:13px 16px;border:1.5px solid #e0e0e0;
      border-radius:12px;font-size:15px;outline:none;transition:border .2s;text-align:right;
      font-family:inherit;color:#111}
    input:focus{border-color:#C9A84C;box-shadow:0 0 0 3px rgba(201,168,76,.15)}
    .toggle{position:absolute;left:14px;top:50%;transform:translateY(-50%);
            background:none;border:none;cursor:pointer;color:#aaa;font-size:18px;padding:4px}
    .btn{width:100%;padding:15px;background:linear-gradient(90deg,#C9A84C,#e0c068);
         color:#0D1B3E;font-size:16px;font-weight:800;border:none;border-radius:14px;
         cursor:pointer;transition:opacity .2s;margin-top:4px}
    .btn:disabled{opacity:.55;cursor:not-allowed}
    .msg{margin-top:18px;padding:14px 16px;border-radius:12px;font-size:14px;text-align:center;display:none}
    .msg.success{background:#e8f5e9;color:#2e7d32;display:block}
    .msg.error{background:#fdecea;color:#c62828;display:block}
    .spinner{display:inline-block;width:16px;height:16px;border:2px solid #0D1B3E;
             border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite;
             vertical-align:middle;margin-left:8px}
    @keyframes spin{to{transform:rotate(360deg)}}
    .invalid-token{text-align:center;padding:24px 0}
    .invalid-token p{color:#c62828;font-size:15px;margin-top:8px}
  </style>
</head>
<body>
<div class="card">
  <div class="logo">
    <h1>فورس</h1>
    <p>إعادة تعيين كلمة المرور</p>
  </div>

  ${!tokenValid ? `
  <div class="invalid-token">
    <p>⚠️ رابط إعادة التعيين غير صالح أو منتهي الصلاحية.</p>
    <p style="margin-top:12px;font-size:13px;color:#888">يرجى طلب رابط جديد من التطبيق.</p>
  </div>
  ` : `
  <form id="form" onsubmit="handleSubmit(event)">
    <div class="field">
      <label for="np">كلمة المرور الجديدة</label>
      <input type="password" id="np" placeholder="6 أحرف على الأقل" required minlength="6"/>
      <button type="button" class="toggle" onclick="toggleVis('np',this)">👁</button>
    </div>
    <div class="field">
      <label for="cp">تأكيد كلمة المرور</label>
      <input type="password" id="cp" placeholder="أعد إدخال كلمة المرور" required minlength="6"/>
      <button type="button" class="toggle" onclick="toggleVis('cp',this)">👁</button>
    </div>
    <input type="hidden" id="tokenField" value="${token}"/>
    <button class="btn" id="btn" type="submit">تغيير كلمة المرور</button>
  </form>
  <div id="msg" class="msg"></div>

  <script>
    function toggleVis(id, btn) {
      var el = document.getElementById(id);
      el.type = el.type === 'password' ? 'text' : 'password';
      btn.textContent = el.type === 'password' ? '👁' : '🙈';
    }
    async function handleSubmit(e) {
      e.preventDefault();
      var np  = document.getElementById('np').value;
      var cp  = document.getElementById('cp').value;
      var tok = document.getElementById('tokenField').value;
      var msg = document.getElementById('msg');
      var btn = document.getElementById('btn');
      msg.className = 'msg'; msg.textContent = '';
      if (np !== cp) { showErr('كلمتا المرور غير متطابقتين'); return; }
      if (!tok)      { showErr('رابط إعادة التعيين غير صالح'); return; }
      btn.disabled = true;
      btn.innerHTML = 'جارٍ الحفظ… <span class="spinner"></span>';
      try {
        var apiUrl = window.location.origin + '/api/reset-password-with-token';
        var r = await fetch(apiUrl, {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ token: tok, newPassword: np })
        });
        var d = await r.json();
        if (!r.ok || !d.ok) { showErr(d.error || 'حدث خطأ غير متوقع'); return; }
        document.getElementById('form').style.display = 'none';
        msg.className = 'msg success';
        msg.textContent = '✅ تم تغيير كلمة المرور بنجاح — يمكنك الآن تسجيل الدخول في التطبيق.';
      } catch(err) {
        showErr('تعذّر الاتصال بالخادم — تحقق من الإنترنت وأعد المحاولة');
      } finally {
        if (btn.disabled) { btn.disabled = false; btn.textContent = 'تغيير كلمة المرور'; }
      }
    }
    function showErr(t) {
      var msg = document.getElementById('msg');
      msg.className = 'msg error'; msg.textContent = t;
      document.getElementById('btn').disabled = false;
      document.getElementById('btn').textContent = 'تغيير كلمة المرور';
    }
  </script>
  `}
</div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  });

  /**
   * POST /api/forgot-password
   * Body: { identifier: string }  — E.164 phone or email address
   *
   * 1. Checks that the account exists in Firebase Auth.
   * 2. Generates a 40-char secure token (15-min TTL).
   * 3. Sends the reset link via WhatsApp (phone) or email.
   */
  app.post("/api/forgot-password", async (req: Request, res: Response) => {
    const { identifier } = req.body as { identifier?: string };
    if (!identifier) {
      res.status(400).json({ error: "identifier is required" });
      return;
    }

    const trimmed = identifier.trim();
    const isPhone = /^[\d\+]/.test(trimmed) && !trimmed.includes("@");

    try {
      const admin = await getAdminApp();
      const { getAuth } = await import("firebase-admin/auth");

      let uid: string;

      if (isPhone) {
        const e164 = toE164Server(trimmed);
        try {
          const user = await getAuth(admin).getUserByPhoneNumber(e164);
          uid = user.uid;
        } catch {
          // Also try the fake-email pattern
          const rawLocal = e164ToIraqiLocal(e164);
          const fakeEmail = `${rawLocal}@sanad.app`;
          try {
            const user = await getAuth(admin).getUserByEmail(fakeEmail);
            uid = user.uid;
          } catch {
            res.status(404).json({ error: "رقم الهاتف غير مسجل في النظام" });
            return;
          }
        }
      } else {
        // email path
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
          res.status(400).json({ error: "بريد إلكتروني غير صحيح" });
          return;
        }
        try {
          const user = await getAuth(admin).getUserByEmail(trimmed.toLowerCase());
          uid = user.uid;
        } catch {
          res.status(404).json({ error: "البريد الإلكتروني غير مسجل في النظام" });
          return;
        }
      }

      // Clean stale tokens
      const now = Date.now();
      for (const [k, v] of resetTokenStore) if (v.expiresAt < now) resetTokenStore.delete(k);

      const token = generateResetToken();
      resetTokenStore.set(token, {
        uid,
        identifier: trimmed,
        type: isPhone ? "phone" : "email",
        expiresAt: now + 15 * 60 * 1000,
      });

      const resetLink = `${getResetLinkBase()}/reset-password?token=${token}`;
      console.log(`[ForgotPassword] token for uid=${uid} link=${resetLink}`);

      if (isPhone) {
        // ── Send via Meta WhatsApp Cloud API ──
        const e164    = toE164Server(trimmed);
        const waPhone = e164.replace(/^\+/, ""); // E.164 without leading +
        const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN;

        if (!phoneNumberId || !accessToken) {
          res.status(503).json({ error: "خدمة WhatsApp غير مهيأة — يرجى التواصل مع الدعم" });
          return;
        }

        const waBody =
          `مرحباً، تم طلب إعادة تعيين كلمة المرور لحسابك في تطبيق فورس.\n` +
          `انقر على الرابط لإعادة تعيين كلمة المرور (صالح 15 دقيقة):\n${resetLink}`;

        const waRes = await fetch(
          `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: waPhone,
              type: "text",
              text: { body: waBody },
            }),
          }
        );
        const waData = await waRes.json() as any;
        if (!waRes.ok || waData?.error) {
          throw new Error(waData?.error?.message ?? `Meta API HTTP ${waRes.status}: ${JSON.stringify(waData)}`);
        }
        console.log(`[ForgotPassword] WhatsApp reset link sent to ${e164} via Meta Cloud API`);
      } else {
        // ── Send via Email ──
        const emailUser = process.env.EMAIL_USER;
        const emailPass = process.env.EMAIL_PASS;
        if (!emailUser || !emailPass) {
          res.status(503).json({ error: "خدمة البريد غير مهيأة — يرجى التواصل مع الدعم" });
          return;
        }
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: { user: emailUser, pass: emailPass },
        });
        await transporter.sendMail({
          from: `"فورس - ForUs" <${emailUser}>`,
          to: trimmed,
          subject: "إعادة تعيين كلمة المرور - فورس",
          html: `
            <div dir="rtl" style="font-family:Arial,sans-serif;text-align:right;padding:24px;max-width:520px;margin:auto">
              <h2 style="color:#0D1B3E">إعادة تعيين كلمة المرور</h2>
              <p style="color:#444">تلقّينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك في تطبيق <strong>فورس</strong>.</p>
              <p style="color:#444">انقر على الزر أدناه لاختيار كلمة مرور جديدة. الرابط صالح لمدة <strong>15 دقيقة</strong> فقط.</p>
              <div style="text-align:center;margin:28px 0">
                <a href="${resetLink}"
                   style="background:#C9A84C;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:16px;font-weight:bold;display:inline-block">
                  إعادة تعيين كلمة المرور
                </a>
              </div>
              <p style="color:#888;font-size:12px">إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة بأمان.</p>
              <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
              <p style="color:#aaa;font-size:11px;text-align:center">فورس - ForUs</p>
            </div>`,
        });
        console.log(`[ForgotPassword] Email reset link sent to ${trimmed}`);
      }

      res.json({ ok: true });
    } catch (err: any) {
      console.error("[ForgotPassword] error:", err);
      res.status(500).json({ error: err.message ?? "تعذّر إرسال رابط إعادة التعيين" });
    }
  });

  /**
   * POST /api/reset-password-with-token
   * Body: { token: string, newPassword: string }
   *
   * Validates the token, updates the Firebase Auth password, then invalidates the token.
   */
  app.post("/api/reset-password-with-token", async (req: Request, res: Response) => {
    const { token, newPassword } = req.body as { token?: string; newPassword?: string };

    if (!token || !newPassword) {
      res.status(400).json({ error: "token and newPassword are required" });
      return;
    }
    if (typeof newPassword !== "string" || newPassword.length < 6) {
      res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
      return;
    }

    const entry = resetTokenStore.get(token);
    if (!entry) {
      res.status(400).json({ error: "رابط إعادة التعيين غير صالح أو مستخدم مسبقاً" });
      return;
    }
    if (Date.now() > entry.expiresAt) {
      resetTokenStore.delete(token);
      res.status(400).json({ error: "انتهت صلاحية الرابط — يرجى طلب رابط جديد" });
      return;
    }

    try {
      const admin = await getAdminApp();
      const { getAuth } = await import("firebase-admin/auth");
      await getAuth(admin).updateUser(entry.uid, { password: newPassword });
      // Invalidate only after successful update (single-use, no retry penalty on failure)
      resetTokenStore.delete(token);
      console.log(`[ResetPassword] password updated for uid=${entry.uid}`);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[ResetPassword] error:", err);
      res.status(500).json({ error: err.message ?? "فشل تحديث كلمة المرور" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
