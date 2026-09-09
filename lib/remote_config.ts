import { getRemoteConfig, fetchAndActivate, getString } from "firebase/remote-config";
import { app } from "./firebase";

const DEFAULT_MIN_REQUIRED_VERSION = "0";

export async function getMinimumRequiredVersion(): Promise<string> {
  try {
    const remoteConfig = getRemoteConfig(app);
    remoteConfig.settings = {
      minimumFetchIntervalMillis: 0,
      fetchTimeoutMillis: 8000,
    };
    remoteConfig.defaultConfig = {
      min_required_version: DEFAULT_MIN_REQUIRED_VERSION,
    };
    await fetchAndActivate(remoteConfig);
    return getString(remoteConfig, "min_required_version") || DEFAULT_MIN_REQUIRED_VERSION;
  } catch (error) {
    // Remote Config must never prevent the app from starting when the network
    // or Remote Config service is temporarily unavailable.
    console.warn("[Remote Config] fetch failed:", error);
    return DEFAULT_MIN_REQUIRED_VERSION;
  }
}

export function compareVersions(current: string, required: string): number {
  const normalize = (value: string) =>
    String(value || "")
      .trim()
      .replace(/^[vV]/, "")
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);

  const a = normalize(current);
  const b = normalize(required);
  const length = Math.max(a.length, b.length);

  for (let i = 0; i < length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  return 0;
}
