// lib/config.ts

// الرابط المباشر والدائم لسيرفر Google Cloud Run الحالي
export const API_BASE_URL = "https://forus-backend-911663879269.europe-west1.run.app";

/**
 * دالة مساعدة لبناء الروابط بشكل آمن لجميع شاشات التطبيق
 */
export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return `${API_BASE_URL}/${cleanPath}`;
}

