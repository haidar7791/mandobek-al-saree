/**
 * stories_logic.ts
 * Firestore + Storage helpers for the Stories (قصص) feature.
 *
 * Schema — stories/{storyId}:
 *   userId, userName, userPhotoUri,
 *   mediaUrl, mediaType ("image" | "video"),
 *   text?, textColor?,
 *   musicName?,
 *   createdAt (ISO), expiresAt (ISO = createdAt + 24 h),
 *   views: string[]  — userIds who viewed
 *   likes: string[]  — userIds who liked
 */
import { auth, db, storage } from "./firebase";
import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  arrayUnion,
  arrayRemove,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Story {
  id: string;
  userId: string;
  userName: string;
  userPhotoUri: string | null;
  mediaUrl: string;
  mediaType: "image" | "video";
  /** For video stories: the uploaded still-frame thumbnail URL. For images: same as mediaUrl. */
  thumbnailUrl?: string | null;
  text: string | null;
  textColor: string | null;
  musicName: string | null;
  createdAt: string;
  expiresAt: string;
  views: string[];
  likes: string[];
}

/** One circle in the story strip = one user + all their active stories */
export interface StoryGroup {
  userId: string;
  userName: string;
  userPhotoUri: string | null;
  /** The cover image shown inside the circle: thumbnailUrl (video) or mediaUrl (image) of the latest story. */
  coverImageUri: string | null;
  stories: Story[];
  /** True when the viewing user hasn't watched all stories in the group */
  hasUnseen: boolean;
}

// ─── Upload helpers ────────────────────────────────────────────────────────────

/**
 * Upload story media to Firebase Storage, return public download URL.
 *
 * Preserves the real MIME type and filename from the picker when provided.
 * Falls back to legacy behaviour (mp4/jpg) when only uri+type are supplied,
 * so existing callers that omit mimeType/fileName remain compatible.
 */
export async function uploadStoryMedia(
  uri: string,
  type: "image" | "video",
  userId: string,
  mimeType?: string,
  fileName?: string
): Promise<string> {
  const allowedExtensions = new Set(
    type === "video"
      ? ["mp4", "mov", "m4v", "webm", "3gp"]
      : ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"]
  );
  const namedExtension = fileName?.split(".").pop()?.toLowerCase();

  // Derive extension from a matching filename or MIME type.
  let ext: string;
  if (namedExtension && allowedExtensions.has(namedExtension)) {
    ext = namedExtension;
  } else if (mimeType) {
    const subtype = mimeType.split("/")[1] ?? "";
    // Handle common aliases
    if (subtype === "quicktime") ext = "mov";
    else if (subtype === "jpeg") ext = "jpg";
    else if (subtype) ext = subtype.split("+")[0]; // e.g. "svg+xml" → "svg"
    else ext = type === "video" ? "mp4" : "jpg";
  } else {
    ext = type === "video" ? "mp4" : "jpg";
  }

  const response = await fetch(uri);
  if (!response.ok && response.status !== 0) {
    throw new Error(`Failed to read selected story media (${response.status})`);
  }
  const blob = await response.blob();
  const mimeByExtension: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    webm: "video/webm",
    "3gp": "video/3gpp",
  };
  const contentType =
    mimeType?.startsWith(`${type}/`)
      ? mimeType
      : blob.type?.startsWith(`${type}/`)
        ? blob.type
        : mimeByExtension[ext] ||
          (type === "video" ? "video/mp4" : "image/jpeg");
  const path = `stories/${userId}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType });
  return getDownloadURL(storageRef);
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createStory(data: {
  userId: string;
  userName: string;
  userPhotoUri: string | null;
  mediaUrl: string;
  mediaType: "image" | "video";
  thumbnailUrl?: string | null;
  text: string | null;
  textColor: string | null;
  musicName: string | null;
}): Promise<string> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const docRef = await addDoc(collection(db, "stories"), {
    ...data,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    views: [],
    likes: [],
  });
  return docRef.id;
}

const STORY_API_ORIGIN = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

/**
 * Generate the thumbnail for a newly published video story.
 * The server seeks to second 2 before extracting the JPEG, avoiding the
 * commonly black first frame. Existing stories are intentionally untouched.
 */
export async function generateStoryVideoThumbnail(
  storyId: string,
): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;

  const idToken = await user.getIdToken();
  const response = await fetch(
    `${STORY_API_ORIGIN}/api/stories/${encodeURIComponent(storyId)}/video-thumbnail`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
    },
  );
  if (!response.ok) {
    throw new Error(`Story thumbnail generation failed (${response.status})`);
  }

  const data = (await response.json()) as { thumbnailUrl?: string };
  return data.thumbnailUrl ?? null;
}

export async function deleteStory(storyId: string): Promise<void> {
  await deleteDoc(doc(db, "stories", storyId));
}

export async function markStoryViewed(storyId: string, userId: string): Promise<void> {
  if (!userId) return; // guard: never write an empty userId into views
  await updateDoc(doc(db, "stories", storyId), { views: arrayUnion(userId) });
}

export async function toggleStoryLike(
  storyId: string,
  userId: string,
  currentlyLiked: boolean
): Promise<void> {
  await updateDoc(doc(db, "stories", storyId), {
    likes: currentlyLiked ? arrayRemove(userId) : arrayUnion(userId),
  });
}

// ─── Realtime listeners ───────────────────────────────────────────────────────

/**
 * Subscribe to all OTHER users' active stories (last 24 h), grouped per user.
 * Returns an unsubscribe function.
 */
export function subscribeToActiveStories(
  currentUserId: string,
  onData: (groups: StoryGroup[]) => void
): () => void {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  // Single-field filter + client-side date check avoids composite index requirement
  const q = query(
    collection(db, "stories"),
    where("createdAt", ">", since)
  );
  return onSnapshot(
    q,
    (snap) => {
      const all: Story[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Story, "id">),
      }));
      // Group by userId, exclude the current user's own stories
      const map = new Map<string, StoryGroup>();
      for (const story of all) {
        if (story.userId === currentUserId) continue;
        if (!map.has(story.userId)) {
          map.set(story.userId, {
            userId: story.userId,
            userName: story.userName,
            userPhotoUri: story.userPhotoUri,
            coverImageUri: null,
            stories: [],
            hasUnseen: false,
          });
        }
        const group = map.get(story.userId)!;
        group.stories.push(story);
        if (!story.views.includes(currentUserId)) group.hasUnseen = true;
      }
      // Sort stories within each group by createdAt ascending (client-side)
      for (const group of map.values()) {
        group.stories.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      }
      // Compute coverImageUri = latest story's thumbnail (video) or mediaUrl (image)
      for (const group of map.values()) {
        const latest = group.stories[group.stories.length - 1];
        if (latest) {
          group.coverImageUri =
            latest.mediaType === "video"
              ? (latest.thumbnailUrl ?? latest.userPhotoUri)
              : latest.mediaUrl;
        }
      }
      // Sort groups: promoted users (priorityScore > 0) first, then by latest story
      const groups = Array.from(map.values());
      groups.sort((a, b) => {
        const pa = Math.max(...a.stories.map((s: any) => s.priorityScore ?? 0), 0);
        const pb = Math.max(...b.stories.map((s: any) => s.priorityScore ?? 0), 0);
        if (pb !== pa) return pb - pa;
        // Within same tier: unseen first, then by most-recent story
        if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
        const latestA = a.stories[a.stories.length - 1]?.createdAt ?? "";
        const latestB = b.stories[b.stories.length - 1]?.createdAt ?? "";
        return latestB.localeCompare(latestA);
      });
      onData(groups);
    },
    (err) => {
      console.error("[stories] subscribeToActiveStories error:", err);
      onData([]);
    }
  );
}

/**
 * Subscribe to the current user's own active stories.
 * Uses a single-field equality query (no composite index needed) and filters/sorts client-side.
 */
export function subscribeToMyStories(
  userId: string,
  onData: (stories: Story[]) => void
): () => void {
  // Single equality filter only — no composite index required
  const q = query(
    collection(db, "stories"),
    where("userId", "==", userId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const active = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Story, "id">) }))
        .filter((s) => s.createdAt > since)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      onData(active);
    },
    (err) => {
      console.error("[stories] subscribeToMyStories error:", err);
      onData([]);
    }
  );
}

/** One-shot fetch of a user's active stories (used inside the viewer).
 *  Single-field query — no composite index required.
 *  Retries up to 2 times with a 1.5 s back-off to survive transient
 *  Firestore WebChannel transport errors. */
export async function fetchUserStories(userId: string): Promise<Story[]> {
  // Single equality filter — no composite index required; sort client-side
  const q = query(
    collection(db, "stories"),
    where("userId", "==", userId)
  );
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) {
        // Brief back-off before retrying (1.5 s × attempt)
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Story, "id">) }))
        .filter((s) => s.createdAt > since)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } catch (err) {
      console.error(`[stories] fetchUserStories attempt ${attempt + 1} failed:`, err);
      lastError = err;
    }
  }
  throw lastError;
}
