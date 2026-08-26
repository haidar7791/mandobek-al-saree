import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const execFileAsync = promisify(execFile);
const productThumbnailJobs = new Map<string, Promise<string>>();

function publicStorageUrl(bucketName: string, objectPath: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
}

async function createProductVideoThumbnail(
  productId: string,
  videoUrl: string,
): Promise<string> {
  const existingJob = productThumbnailJobs.get(productId);
  if (existingJob) return existingJob;

  const job = (async () => {
    const admin = await getAdminApp();
    const { getFirestore } = await import("firebase-admin/firestore");
    const { getStorage } = await import("firebase-admin/storage");
    const db = getFirestore(admin);
    const productRef = db.collection("products").doc(productId);
    const latestProduct = await productRef.get();
    const latestThumbnail = latestProduct.data()?.thumbnailUrl;
    if (typeof latestThumbnail === "string" && latestThumbnail) return latestThumbnail;

    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`Unable to download product video (${response.status})`);
    }

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "forus-product-thumb-"));
    const videoPath = path.join(tempDir, "source-video");
    const thumbnailPath = path.join(tempDir, "thumbnail.jpg");

    try {
      await writeFile(videoPath, Buffer.from(await response.arrayBuffer()));
      await execFileAsync("ffmpeg", [
        "-y",
        "-ss",
        "2",
        "-i",
        videoPath,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        thumbnailPath,
      ]);

      const thumbnailObjectPath = `products/${productId}/thumbnail.jpg`;
      const downloadToken = randomUUID();
      const bucketName = new URL(videoUrl).pathname.match(
        /\/v0\/b\/([^/]+)\/o\//,
      )?.[1];
      if (!bucketName) {
        throw new Error("Unable to determine Firebase Storage bucket from video URL");
      }
      const bucket = getStorage(admin).bucket(bucketName);
      await bucket.file(thumbnailObjectPath).save(await readFile(thumbnailPath), {
        resumable: false,
        metadata: {
          contentType: "image/jpeg",
          cacheControl: "public,max-age=31536000,immutable",
          metadata: { firebaseStorageDownloadTokens: downloadToken },
        },
      });

      const thumbnailUrl = publicStorageUrl(
        bucket.name,
        thumbnailObjectPath,
        downloadToken,
      );
      await productRef.update({ thumbnailUrl });
      return thumbnailUrl;
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  })();

  productThumbnailJobs.set(productId, job);
  try {
    return await job;
  } finally {
    productThumbnailJobs.delete(productId);
  }
}

const storyThumbnailJobs = new Map<string, Promise<string>>();

async function createStoryVideoThumbnail(
  storyId: string,
  userId: string,
  videoUrl: string,
): Promise<string> {
  const existingJob = storyThumbnailJobs.get(storyId);
  if (existingJob) return existingJob;

  const job = (async () => {
    const admin = await getAdminApp();
    const { getFirestore } = await import("firebase-admin/firestore");
    const { getStorage } = await import("firebase-admin/storage");
    const db = getFirestore(admin);
    const storyRef = db.collection("stories").doc(storyId);
    const latestStory = await storyRef.get();
    const latestThumbnail = latestStory.data()?.thumbnailUrl;
    if (typeof latestThumbnail === "string" && latestThumbnail) return latestThumbnail;

    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`Unable to download story video (${response.status})`);
    }

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "forus-story-thumb-"));
    const videoPath = path.join(tempDir, "source-video");
    const thumbnailPath = path.join(tempDir, "thumbnail.jpg");

    try {
      await writeFile(videoPath, Buffer.from(await response.arrayBuffer()));
      await execFileAsync("ffmpeg", [
        "-y",
        "-ss",
        "2",
        "-i",
        videoPath,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        thumbnailPath,
      ]);

      const thumbnailObjectPath = `stories/${userId}/thumbnail-${storyId}.jpg`;
      const downloadToken = randomUUID();
      const bucketName = new URL(videoUrl).pathname.match(
        /\/v0\/b\/([^/]+)\/o\//,
      )?.[1];
      if (!bucketName) {
        throw new Error("Unable to determine Firebase Storage bucket from story URL");
      }

      const bucket = getStorage(admin).bucket(bucketName);
      await bucket.file(thumbnailObjectPath).save(await readFile(thumbnailPath), {
        resumable: false,
        metadata: {
          contentType: "image/jpeg",
          cacheControl: "public,max-age=31536000,immutable",
          metadata: { firebaseStorageDownloadTokens: downloadToken },
        },
      });

      const thumbnailUrl = publicStorageUrl(
        bucket.name,
        thumbnailObjectPath,
        downloadToken,
      );
      await storyRef.update({ thumbnailUrl });
      return thumbnailUrl;
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  })();

  storyThumbnailJobs.set(storyId, job);
  try {
    return await job;
  } finally {
    storyThumbnailJobs.delete(storyId);
  }
}

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

  // Browser fallbacks for shared public profiles when the app is not installed.
  const sendProfileFallback = async (req: Request, res: Response, next: NextFunction, userId: string) => {
    if (!userId || !/^[A-Za-z0-9_-]+$/.test(userId)) return next();
    try {
      const admin = await getAdminApp();
      const { getFirestore } = await import("firebase-admin/firestore");
      const snap = await getFirestore(admin).collection("users").doc(userId).get();
      const data = snap.exists ? snap.data() || {} : null;
      const escape = (value: string) => value.replace(/[&<>\"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch] || ch));
      const name = escape(String(data?.name || "مستخدم فورس"));
      const playUrl = "https://play.google.com/store/apps/details?id=com.haidar.forus";
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(snap.exists ? 200 : 404).send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name} — فورس</title><style>body{font-family:Arial,sans-serif;background:#f8fafc;margin:0;padding:32px;text-align:center;color:#0f172a}.box{max-width:480px;margin:8vh auto;background:#fff;border-radius:20px;padding:28px;box-shadow:0 8px 30px #0001}a{display:inline-block;background:#c9a84c;color:#0d1b3e;text-decoration:none;padding:14px 24px;border-radius:12px;font-weight:700}</style></head><body><div class="box"><h1>فورس</h1><h2>${name}</h2><p>هذا الملف الشخصي متوفر داخل تطبيق فورس.</p><p>عليك تنزيل التطبيق أولاً لعرض الملف الشخصي.</p><a href="${playUrl}">تنزيل تطبيق فورس من Google Play</a></div></body></html>`);
    } catch (err) { next(err); }
  };

  app.get("/profile/:userId", async (req, res, next) => sendProfileFallback(req, res, next, req.params.userId));
  app.get("/user/:userId", async (req, res, next) => sendProfileFallback(req, res, next, req.params.userId));

  // Browser fallback for shared product links. Installed Android builds claim
  // the same HTTPS URL through Android App Links; browsers reach this page
  // when the app is not installed and can go directly to Google Play.
  app.get("/product/:productId", async (req, res, next) => {
    const productId = req.params.productId;
    if (!productId || !/^[A-Za-z0-9_-]+$/.test(productId)) return next();
    try {
      const admin = await getAdminApp();
      const { getFirestore } = await import("firebase-admin/firestore");
      const snap = await getFirestore(admin).collection("products").doc(productId).get();
      const data = snap.exists ? snap.data() || {} : null;
      const escape = (value: string) => value.replace(/[&<>\"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch] || ch));
      const title = escape(String(data?.title || "منتج على فورس"));
      const image = String(data?.imageUrl || data?.thumbnailUrl || "").replace(/[<>\"']/g, "");
      const playUrl = "https://play.google.com/store/apps/details?id=com.haidar.forus";
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(snap.exists ? 200 : 404).send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta property="og:title" content="${title}">${image ? `<meta property="og:image" content="${image}">` : ""}<title>${title} — فورس</title><style>body{font-family:Arial,sans-serif;background:#f8fafc;margin:0;padding:32px;text-align:center;color:#0f172a}.box{max-width:480px;margin:8vh auto;background:#fff;border-radius:20px;padding:28px;box-shadow:0 8px 30px #0001}a{display:inline-block;background:#c9a84c;color:#0d1b3e;text-decoration:none;padding:14px 24px;border-radius:12px;font-weight:700}</style></head><body><div class="box"><h1>فورس</h1><h2>${title}</h2><p>هذا المنتج متوفر داخل تطبيق فورس.</p><p>عليك تنزيل التطبيق أولاً لعرض المنتج مباشرة.</p><a href="${playUrl}">تنزيل تطبيق فورس من Google Play</a></div></body></html>`);
    } catch (err) { next(err); }
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  /**
   * Creates and persists a JPEG thumbnail from a product video's first frame.
   * The authenticated client only asks for a thumbnail on video-only product
   * cards; the result is cached on the product document for every future card.
   */
  app.post("/api/products/:productId/video-thumbnail", async (req, res) => {
    const authorization = req.header("authorization");
    const idToken = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : null;
    const productId = req.params.productId;

    if (!idToken) {
      res.status(401).json({ error: "Authentication is required" });
      return;
    }
    if (!productId || !/^[A-Za-z0-9_-]+$/.test(productId)) {
      res.status(400).json({ error: "Invalid product id" });
      return;
    }

    try {
      const admin = await getAdminApp();
      const { getAuth } = await import("firebase-admin/auth");
      const { getFirestore } = await import("firebase-admin/firestore");
      await getAuth(admin).verifyIdToken(idToken);

      const productSnap = await getFirestore(admin)
        .collection("products")
        .doc(productId)
        .get();
      if (!productSnap.exists) {
        res.status(404).json({ error: "Product not found" });
        return;
      }

      const product = productSnap.data() as {
        thumbnailUrl?: string;
        imageUrl?: string;
        media?: Array<{ type?: string; url?: string }>;
      };
      if (product.thumbnailUrl) {
        res.json({ thumbnailUrl: product.thumbnailUrl });
        return;
      }

      const videoUrl = product.media?.find(
        (item) => item.type === "video" && item.url,
      )?.url;
      if (!videoUrl) {
        res.status(422).json({ error: "Product has no video media" });
        return;
      }

      const thumbnailUrl = await createProductVideoThumbnail(productId, videoUrl);
      res.json({ thumbnailUrl });
    } catch (error) {
      console.error("[ProductThumbnail] generation failed:", error);
      res.status(500).json({ error: "Unable to create product thumbnail" });
    }
  });

  app.post("/api/stories/:storyId/video-thumbnail", async (req, res) => {
    const authorization = req.header("authorization");
    const idToken = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : null;
    const storyId = req.params.storyId;

    if (!idToken) {
      res.status(401).json({ error: "Authentication is required" });
      return;
    }
    if (!storyId || !/^[A-Za-z0-9_-]+$/.test(storyId)) {
      res.status(400).json({ error: "Invalid story id" });
      return;
    }

    try {
      const admin = await getAdminApp();
      const { getAuth } = await import("firebase-admin/auth");
      const { getFirestore } = await import("firebase-admin/firestore");
      const decoded = await getAuth(admin).verifyIdToken(idToken);
      const storySnap = await getFirestore(admin)
        .collection("stories")
        .doc(storyId)
        .get();

      if (!storySnap.exists) {
        res.status(404).json({ error: "Story not found" });
        return;
      }

      const story = storySnap.data() as {
        userId?: string;
        mediaType?: string;
        mediaUrl?: string;
        thumbnailUrl?: string;
      };
      if (story.userId !== decoded.uid) {
        res.status(403).json({ error: "Only the story owner can create its thumbnail" });
        return;
      }
      if (story.thumbnailUrl) {
        res.json({ thumbnailUrl: story.thumbnailUrl });
        return;
      }
      if (story.mediaType !== "video" || !story.mediaUrl) {
        res.status(422).json({ error: "Story has no video media" });
        return;
      }

      const thumbnailUrl = await createStoryVideoThumbnail(
        storyId,
        story.userId,
        story.mediaUrl,
      );
      res.json({ thumbnailUrl });
    } catch (error) {
      console.error("[StoryThumbnail] generation failed:", error);
      res.status(500).json({ error: "Unable to create story thumbnail" });
    }
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

  // ─── Email OTP ───────────────────────────────────────────────────────────────

  /** In-memory Email OTP store: email → { code, expiresAt } (5-min TTL) */
  const emailOtpStore = new Map<string, { code: string; expiresAt: number }>();

  function generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

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

  // ─── Reset-password web page ───────────────────────────────────────────────
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
   * Body: { identifier: string }  — email address
   *
   * 1. Checks that the account exists in Firebase Auth.
   * 2. Generates a 40-char secure token (15-min TTL).
   * 3. Sends the reset link via email.
   */
  app.post("/api/forgot-password", async (req: Request, res: Response) => {
    const { identifier } = req.body as { identifier?: string };
    if (!identifier) {
      res.status(400).json({ error: "identifier is required" });
      return;
    }

    const trimmed = identifier.trim();
    if (/^[\d\+]/.test(trimmed) && !trimmed.includes("@")) {
      res.status(410).json({
        ok: false,
        error: "إعادة تعيين كلمة مرور الهاتف تتم عبر Firebase Phone Auth داخل التطبيق",
      });
      return;
    }

    try {
      const admin = await getAdminApp();
      const { getAuth } = await import("firebase-admin/auth");

      let uid: string;

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

      // Clean stale tokens
      const now = Date.now();
      for (const [k, v] of resetTokenStore) if (v.expiresAt < now) resetTokenStore.delete(k);

      const token = generateResetToken();
      resetTokenStore.set(token, {
        uid,
        identifier: trimmed,
        type: "email",
        expiresAt: now + 15 * 60 * 1000,
      });

      const resetLink = `${getResetLinkBase()}/reset-password?token=${token}`;
      console.log(`[ForgotPassword] token for uid=${uid} link=${resetLink}`);

      {
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
