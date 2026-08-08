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

  /** Convert any Iraqi phone input to E.164 (+9647xxxxxxxx) */
  function toE164Server(phone: string): string {
    const t = phone.trim().replace(/[\s\-]/g, "");
    if (t.startsWith("+")) return t;
    if (t.startsWith("00964")) return "+" + t.slice(2);
    if (t.startsWith("964"))   return "+" + t;
    if (t.startsWith("07"))    return "+964" + t.slice(1);
    if (t.startsWith("7"))     return "+964" + t;
    return "+964" + t;
  }

  /**
   * POST /api/send-whatsapp-otp
   * Body: { phone: string }
   * Generates a 6-digit OTP, stores it for 5 minutes, and sends it via UltraMsg.
   */
  app.post("/api/send-whatsapp-otp", async (req: Request, res: Response) => {
    const { phone } = req.body as { phone?: string };
    if (!phone) {
      res.status(400).json({ error: "phone is required" });
      return;
    }

    const e164   = toE164Server(phone);
    const waPhone = e164.replace(/^\+/, ""); // UltraMsg wants no leading +

    // Clean stale entries then generate fresh OTP
    const now = Date.now();
    for (const [k, v] of otpStore) if (v.expiresAt < now) otpStore.delete(k);

    const code = generateOtp();
    otpStore.set(e164, { code, expiresAt: now + 5 * 60 * 1000 });

    const instanceId = process.env.ULTRAMSG_INSTANCE_ID ?? "instance187756";
    const token      = process.env.ULTRAMSG_TOKEN      ?? "us2d3muaswe5s4kp";

    console.log(`[WhatsApp OTP] sending to ${e164} (wa: ${waPhone})`);
    try {
      const response = await fetch(
        `https://api.ultramsg.com/${instanceId}/messages/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            token,
            to:   waPhone,
            body: `رمز التحقق الخاص بك هو: ${code}\nصالح لمدة 5 دقائق`,
          }).toString(),
        }
      );
      const data = await response.json() as any;
      console.log("[WhatsApp OTP] UltraMsg HTTP status:", response.status);
      console.log("[WhatsApp OTP] UltraMsg full response:", JSON.stringify(data));

      // UltraMsg returns { sent: "true", message: "..." } on success
      // and { error: "...", ... } on failure
      if (!response.ok) {
        throw new Error(`UltraMsg HTTP ${response.status}: ${JSON.stringify(data)}`);
      }
      if (data?.error) {
        throw new Error(`UltraMsg error: ${data.error}`);
      }
      if (data?.sent === false || data?.sent === "false") {
        throw new Error(`UltraMsg rejected: ${JSON.stringify(data)}`);
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
    const { phone, code } = req.body as { phone?: string; code?: string };
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

      // Get existing Firebase Auth user or create a new one for this phone
      let uid: string;
      try {
        const existing = await getAuth(admin).getUserByPhoneNumber(e164);
        uid = existing.uid;
      } catch {
        const created = await getAuth(admin).createUser({ phoneNumber: e164 });
        uid = created.uid;
      }

      const customToken = await getAuth(admin).createCustomToken(uid);
      res.json({ ok: true, customToken, uid, e164 });
    } catch (err: any) {
      console.error("[WhatsApp OTP] verify error:", err);
      res.status(500).json({ error: err.message ?? "فشل التحقق من الرمز" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
