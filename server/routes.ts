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

  const httpServer = createServer(app);
  return httpServer;
}
