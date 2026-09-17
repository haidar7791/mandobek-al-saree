import {
  Directory,
  File,
  Paths,
} from "expo-file-system";

const CACHE_DIR_NAME = "forus-video-cache";
const MAX_CACHED_VIDEOS = 6;

type CacheEntry = {
  uri: string;
  localUri: string;
  lastUsedAt: number;
};

const memoryCache = new Map<string, CacheEntry>();
const pendingDownloads = new Map<string, Promise<string | null>>();

function safeKey(value: string): string {
  return encodeURIComponent(value).replace(/%/g, "_");
}

function getCacheDirectory(): Directory {
  return new Directory(Paths.cache, CACHE_DIR_NAME);
}

function getVideoFile(uri: string): File {
  return new File(getCacheDirectory(), `${safeKey(uri)}.mp4`);
}

function touch(uri: string, localUri: string): void {
  memoryCache.set(uri, {
    uri,
    localUri,
    lastUsedAt: Date.now(),
  });
}

async function ensureCacheDirectory(): Promise<void> {
  const directory = getCacheDirectory();

  if (!directory.exists) {
    directory.create({
      idempotent: true,
      intermediates: true,
    });
  }
}

export async function getCachedVideo(uri: string): Promise<string | null> {
  if (!uri) return null;

  try {
    const memoryEntry = memoryCache.get(uri);

    if (memoryEntry) {
      const file = new File(memoryEntry.localUri);

      if (file.exists) {
        touch(uri, file.uri);
        return file.uri;
      }

      memoryCache.delete(uri);
    }

    await ensureCacheDirectory();

    const file = getVideoFile(uri);

    if (!file.exists) return null;

    touch(uri, file.uri);

    return file.uri;
  } catch {
    return null;
  }
}

export async function cacheVideo(uri: string): Promise<string | null> {
  if (!uri) return null;

  const cached = await getCachedVideo(uri);
  if (cached) return cached;

  const pending = pendingDownloads.get(uri);
  if (pending) return pending;

  const downloadPromise = (async () => {
    try {
      await ensureCacheDirectory();

      const destination = getVideoFile(uri);

      if (destination.exists) {
        touch(uri, destination.uri);
        return destination.uri;
      }

      const downloaded = await File.downloadFileAsync(
        uri,
        destination,
        { idempotent: true }
      );

      if (!downloaded.exists) {
        return null;
      }

      touch(uri, downloaded.uri);

      await cleanupVideoCache([uri]);

      return downloaded.uri;
    } catch {
      return null;
    } finally {
      pendingDownloads.delete(uri);
    }
  })();

  pendingDownloads.set(uri, downloadPromise);

  return downloadPromise;
}

export async function preloadVideo(uri: string): Promise<void> {
  if (!uri) return;

  await cacheVideo(uri);
}

export async function cleanupVideoCache(
  keepUris: string[] = []
): Promise<void> {
  try {
    await ensureCacheDirectory();

    const directory = getCacheDirectory();
    const entries = directory.list();

    const keep = new Set(keepUris);

    const files: Array<{
      file: File;
      uri: string | null;
      lastUsedAt: number;
    }> = [];

    for (const entry of entries) {
      if (!(entry instanceof File)) continue;

      const known = Array.from(memoryCache.values()).find(
        (item) => item.localUri === entry.uri
      );

      files.push({
        file: entry,
        uri: known?.uri ?? null,
        lastUsedAt: known?.lastUsedAt ?? 0,
      });
    }

    files.sort((a, b) => b.lastUsedAt - a.lastUsedAt);

    const retained = new Set<string>();

    for (const item of files) {
      if (item.uri && keep.has(item.uri)) {
        retained.add(item.file.uri);
      }
    }

    for (const item of files) {
      if (retained.has(item.file.uri)) continue;

      if (retained.size < MAX_CACHED_VIDEOS) {
        retained.add(item.file.uri);
        continue;
      }

      try {
        item.file.delete();
      } catch {
        // Ignore individual cache deletion failures.
      }

      if (item.uri) {
        memoryCache.delete(item.uri);
      }
    }
  } catch {
    // Cache cleanup must never affect video playback.
  }
}

export async function clearVideoCache(): Promise<void> {
  try {
    const directory = getCacheDirectory();

    if (directory.exists) {
      directory.delete();
    }

    memoryCache.clear();
    pendingDownloads.clear();
  } catch {
    // Ignore cache cleanup errors.
  }
}
