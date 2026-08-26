// lib/config.ts

// الرابط المباشر والدائم لسيرفر Google Cloud Run الحالي
export const API_BASE_URL = "https://forus-backend-911663879269.europe-west1.run.app";

// Public HTTPS host used for Android App Links and external sharing.
// This is the current Cloud Run service URL; replace it only when a custom
// domain you control is mapped to the same service.
export const PUBLIC_SHARE_BASE_URL = API_BASE_URL;

/**
 * دالة مساعدة لبناء الروابط بشكل آمن لجميع شاشات التطبيق
 */
export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return `${API_BASE_URL}/${cleanPath}`;
}

