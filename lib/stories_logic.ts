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
import { db, storage } from "./firebase";
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
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

/** Upload story media to Firebase Storage, return public download URL */
export async function uploadStoryMedia(
  uri: string,
  type: "image" | "video",
  userId: string
): Promise<string> {
  const ext = type === "video" ? "mp4" : "jpg";
  const path = `stories/${userId}/${Date.now()}.${ext}`;
  const response = await fetch(uri);
  const blob = await response.blob();
  const contentType = type === "video" ? "video/mp4" : "image/jpeg";
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

export async function deleteStory(storyId: string): Promise<void> {
  await deleteDoc(doc(db, "stories", storyId));
}

export async function markStoryViewed(storyId: string, userId: string): Promise<void> {
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
  const q = query(
    collection(db, "stories"),
    where("createdAt", ">", since),
    orderBy("createdAt", "asc")
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
    () => onData([])
  );
}

/**
 * Subscribe to the current user's own active stories.
 * Uses a single-field query (no composite index needed) and filters client-side.
 */
export function subscribeToMyStories(
  userId: string,
  onData: (stories: Story[]) => void
): () => void {
  // Single equality filter only — no composite index required
  const q = query(
    collection(db, "stories"),
    where("userId", "==", userId),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(
    q,
    (snap) => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const active = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Story, "id">) }))
        .filter((s) => s.createdAt > since);
      onData(active);
    },
    () => onData([])
  );
}

/** One-shot fetch of a user's active stories (used inside the viewer).
 *  Single-field query — no composite index required. */
export async function fetchUserStories(userId: string): Promise<Story[]> {
  // Query by userId only, filter last-24h client-side to avoid composite index
  const q = query(
    collection(db, "stories"),
    where("userId", "==", userId),
    orderBy("createdAt", "asc")
  );
  const snap = await getDocs(q);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Story, "id">) }))
    .filter((s) => s.createdAt > since);
}
