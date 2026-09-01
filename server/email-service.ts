export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

type EmailErrorLike = {
  name?: unknown;
  code?: unknown;
  command?: unknown;
  responseCode?: unknown;
  response?: unknown;
  message?: unknown;
};

function getEmailConfig() {
  const user = process.env.EMAIL_USER?.trim();
  // EMAIL_PASSWORD is the canonical name. EMAIL_PASS remains supported for
  // existing deployments while they migrate to the clearer name.
  const password = process.env.EMAIL_PASSWORD?.trim() || process.env.EMAIL_PASS?.trim();

  if (!user || !password) {
    throw new Error(
      "Email service is not configured: set EMAIL_USER and EMAIL_PASSWORD",
    );
  }

  const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const parsedPort = Number(process.env.SMTP_PORT || "465");
  const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 465;

  return { user, password, host, port };
}

function describeEmailError(error: unknown) {
  const err = (error || {}) as EmailErrorLike;
  return {
    name: String(err.name || "Error"),
    code: String(err.code || ""),
    command: String(err.command || ""),
    responseCode: err.responseCode ?? null,
    response: String(err.response || ""),
    message: String(err.message || error || "Unknown email error"),
  };
}

function safeDirectErrorMessage(error: unknown): string {
  const details = describeEmailError(error);
  const searchable = `${details.code} ${details.response} ${details.message}`.toLowerCase();

  if (searchable.includes("invalid_grant")) {
    return "فشل اعتماد Gmail OAuth — تم استخدام إعداد OAuth منتهي أو ملغى. استخدم EMAIL_PASSWORD ككلمة مرور تطبيق Gmail.";
  }

  if (
    details.responseCode === 535 ||
    searchable.includes("badcredentials") ||
    searchable.includes("bad credentials") ||
    searchable.includes("username and password not accepted")
  ) {
    return "رفض Gmail بيانات الدخول — تأكد من EMAIL_USER وأن EMAIL_PASSWORD هي كلمة مرور تطبيق Gmail من 16 خانة مع تفعيل التحقق بخطوتين.";
  }

  if (
    details.code === "ENOTFOUND" ||
    details.code === "EAI_AGAIN" ||
    searchable.includes("getaddrinfo")
  ) {
    return "تعذّر الوصول إلى خادم البريد — تحقق من SMTP_HOST واتصال الخادم.";
  }

  if (
    details.code === "ETIMEDOUT" ||
    details.code === "ECONNRESET" ||
    details.code === "ECONNREFUSED"
  ) {
    return "انتهت مهلة الاتصال بخادم البريد — تحقق من SMTP_HOST وSMTP_PORT.";
  }

  const directMessage = details.message
    .replace(/(?:password|pass|token|secret)\s*[=:]\s*\S+/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);

  return directMessage
    ? `تعذّر إرسال البريد: ${directMessage}`
    : "تعذّر إرسال البريد بسبب خطأ SMTP غير معروف";
}

async function createTransporter() {
  const config = getEmailConfig();
  const nodemailer = await import("nodemailer");

  // Explicit SMTP auth intentionally avoids OAuth2 refresh tokens. This is
  // stable for Gmail App Passwords and does not produce expired invalid_grant
  // refresh-token failures.
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.password,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return { transporter, user: config.user };
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  try {
    const { transporter, user } = await createTransporter();
    await transporter.sendMail({
      from: `"فورس - ForUs" <${user}>`,
      ...message,
    });
  } catch (error) {
    console.error("[EmailService] SMTP send failed:", describeEmailError(error));
    throw error;
  }
}

export async function verifyEmailTransport(): Promise<void> {
  try {
    const { transporter } = await createTransporter();
    await transporter.verify();
  } catch (error) {
    console.error("[EmailService] SMTP verification failed:", describeEmailError(error));
    throw error;
  }
}

export function getEmailErrorMessage(error: unknown): string {
  return safeDirectErrorMessage(error);
}