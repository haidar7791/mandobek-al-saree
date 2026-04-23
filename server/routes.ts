import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import nodemailer from "nodemailer";

interface OtpRecord {
  code: string;
  expiresAt: number;
  attempts: number;
  verified: boolean;
  verifiedAt?: number;
}

const otpStore = new Map<string, OtpRecord>();
const OTP_TTL_MS = 10 * 60 * 1000;
const VERIFIED_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
const lastSentAt = new Map<string, number>();

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_APP_PASS;
  if (!user || !pass) {
    const err: any = new Error("GMAIL_USER / GMAIL_APP_PASSWORD not configured");
    err.code = "email_not_configured";
    throw err;
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

function buildEmailHtml(code: string): string {
  return `
  <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; background:#0D1B3E; padding:40px 20px; color:#fff; text-align:center;">
    <div style="max-width:480px; margin:0 auto; background:#162452; border-radius:16px; padding:32px 24px;">
      <h1 style="margin:0 0 8px; font-size:28px; color:#C9A84C;">سند</h1>
      <p style="margin:0 0 24px; color:rgba(255,255,255,0.65); font-size:13px;">منصة خدمات المنزل والسيارة</p>
      <h2 style="margin:0 0 12px; font-size:18px; color:#fff;">رمز التحقق الخاص بك</h2>
      <p style="margin:0 0 20px; color:rgba(255,255,255,0.7); font-size:14px;">استخدم الرمز التالي لإكمال عملية تسجيل حسابك في تطبيق سند:</p>
      <div style="background:#0D1B3E; border:2px solid #C9A84C; border-radius:12px; padding:18px; margin:0 0 18px;">
        <span style="font-size:34px; letter-spacing:8px; font-weight:bold; color:#C9A84C;">${code}</span>
      </div>
      <p style="margin:0 0 8px; color:rgba(255,255,255,0.55); font-size:12px;">صالح لمدة 10 دقائق فقط.</p>
      <p style="margin:0; color:rgba(255,255,255,0.45); font-size:11px;">إذا لم تطلب هذا الرمز، يرجى تجاهل هذه الرسالة.</p>
    </div>
  </div>`;
}

async function sendOtpEmail(email: string, code: string): Promise<void> {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"سند - Sanad" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `رمز التحقق: ${code}`,
    text: `رمز التحقق الخاص بك في تطبيق سند هو: ${code}\n\nصالح لمدة 10 دقائق.`,
    html: buildEmailHtml(code),
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/otp/request", async (req: Request, res: Response) => {
    try {
      const rawEmail = (req.body?.email as string) || "";
      const email = normalizeEmail(rawEmail);
      if (!email || !isValidEmail(email)) {
        return res.status(400).json({ ok: false, error: "invalid_email" });
      }

      const last = lastSentAt.get(email);
      if (last && Date.now() - last < RESEND_COOLDOWN_MS) {
        const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - last)) / 1000);
        return res.status(429).json({ ok: false, error: "cooldown", waitSeconds: wait });
      }

      const code = generateCode();
      otpStore.set(email, {
        code,
        expiresAt: Date.now() + OTP_TTL_MS,
        attempts: 0,
        verified: false,
      });
      lastSentAt.set(email, Date.now());

      await sendOtpEmail(email, code);
      console.log(`[otp] sent to ${email}`);
      return res.json({ ok: true, expiresIn: OTP_TTL_MS / 1000 });
    } catch (err: any) {
      console.error("[otp] request error:", err?.message || err, err?.response || "");
      const code = err?.code === "email_not_configured" ? "email_not_configured" : "send_failed";
      return res.status(500).json({ ok: false, error: code, message: err?.message || "send failed" });
    }
  });

  app.post("/api/otp/verify", async (req: Request, res: Response) => {
    try {
      const email = normalizeEmail((req.body?.email as string) || "");
      const code = ((req.body?.code as string) || "").trim();
      if (!email || !code) {
        return res.status(400).json({ ok: false, error: "missing_fields" });
      }
      const record = otpStore.get(email);
      if (!record) {
        return res.status(400).json({ ok: false, error: "no_otp" });
      }
      if (Date.now() > record.expiresAt) {
        otpStore.delete(email);
        return res.status(400).json({ ok: false, error: "expired" });
      }
      record.attempts += 1;
      if (record.attempts > MAX_ATTEMPTS) {
        otpStore.delete(email);
        return res.status(429).json({ ok: false, error: "too_many_attempts" });
      }
      if (record.code !== code) {
        return res.status(400).json({
          ok: false,
          error: "wrong_code",
          attemptsLeft: MAX_ATTEMPTS - record.attempts,
        });
      }
      record.verified = true;
      record.verifiedAt = Date.now();
      console.log(`[otp] verified ${email}`);
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[otp] verify error:", err?.message || err);
      return res.status(500).json({ ok: false, error: "verify_failed" });
    }
  });

  app.post("/api/otp/check", async (req: Request, res: Response) => {
    const email = normalizeEmail((req.body?.email as string) || "");
    const record = otpStore.get(email);
    if (!record || !record.verified || !record.verifiedAt) {
      return res.json({ ok: false });
    }
    if (Date.now() - record.verifiedAt > VERIFIED_TTL_MS) {
      otpStore.delete(email);
      return res.json({ ok: false });
    }
    return res.json({ ok: true });
  });

  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of otpStore.entries()) {
      const verifiedExpired = v.verified && v.verifiedAt && now - v.verifiedAt > VERIFIED_TTL_MS;
      if (now > v.expiresAt || verifiedExpired) otpStore.delete(k);
    }
    for (const [k, t] of lastSentAt.entries()) {
      if (now - t > RESEND_COOLDOWN_MS * 2) lastSentAt.delete(k);
    }
  }, 60 * 1000);

  const httpServer = createServer(app);
  return httpServer;
}
