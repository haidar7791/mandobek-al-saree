import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_VERSION = "v1";

type CacheEnvelope<T> = {
  version: string;
  savedAt: number;
  data: T;
};

export async function readCache<T>(
  key: string,
  maxAgeMs?: number,
): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_VERSION}:${key}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CacheEnvelope<T>;

    if (
      !parsed ||
      parsed.version !== CACHE_VERSION ||
      typeof parsed.savedAt !== "number"
    ) {
      return null;
    }

    if (
      typeof maxAgeMs === "number" &&
      Date.now() - parsed.savedAt > maxAgeMs
    ) {
      return null;
    }

    return parsed.data ?? null;
  } catch (error) {
    console.warn("[app_cache] read failed:", key, error);
    return null;
  }
}

export async function readStaleCache<T>(
  key: string,
): Promise<{ data: T; savedAt: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_VERSION}:${key}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CacheEnvelope<T>;

    if (
      !parsed ||
      parsed.version !== CACHE_VERSION ||
      typeof parsed.savedAt !== "number"
    ) {
      return null;
    }

    return {
      data: parsed.data,
      savedAt: parsed.savedAt,
    };
  } catch (error) {
    console.warn("[app_cache] stale read failed:", key, error);
    return null;
  }
}

export async function writeCache<T>(
  key: string,
  data: T,
): Promise<void> {
  try {
    const value: CacheEnvelope<T> = {
      version: CACHE_VERSION,
      savedAt: Date.now(),
      data,
    };

    await AsyncStorage.setItem(
      `${CACHE_VERSION}:${key}`,
      JSON.stringify(value),
    );
  } catch (error) {
    console.warn("[app_cache] write failed:", key, error);
  }
}

export async function removeCache(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${CACHE_VERSION}:${key}`);
  } catch (error) {
    console.warn("[app_cache] remove failed:", key, error);
  }
}

export function userCacheKey(
  userId: string,
  key: string,
): string {
  return `user:${userId}:${key}`;
}

export async function cacheFirst<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: {
    maxAgeMs?: number;
    onCached?: (data: T) => void;
    onFresh?: (data: T) => void;
  },
): Promise<T> {
  const cached = await readCache<T>(key, options?.maxAgeMs);

  if (cached !== null) {
    options?.onCached?.(cached);

    void fetcher()
      .then(async (fresh) => {
        await writeCache(key, fresh);
        options?.onFresh?.(fresh);
      })
      .catch((error) => {
        console.warn("[app_cache] background refresh failed:", key, error);
      });

    return cached;
  }

  const fresh = await fetcher();
  await writeCache(key, fresh);
  options?.onFresh?.(fresh);
  return fresh;
}
