export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const raw = decodeURIComponent(path || "");
    if (raw.startsWith("/product/")) return raw;
    if (raw.startsWith("/profile/")) return `/artisan-profile?artisanId=${encodeURIComponent(raw.split("/")[2] || "")}`;
    if (raw.startsWith("/user/")) return `/user-profile?userId=${encodeURIComponent(raw.split("/")[2] || "")}`;
    if (raw.startsWith("forus://")) {
      const clean = raw.replace(/^forus:\/\//, "");
      const [type,id] = clean.split("/");
      if (type === "product") return `/product/${id || ""}`;
      if (type === "profile") return `/artisan-profile?artisanId=${encodeURIComponent(id || "")}`;
      if (type === "user") return `/user-profile?userId=${encodeURIComponent(id || "")}`;
    }
  } catch {}
  return "/";
}
