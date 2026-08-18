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
            stories: [],
            hasUnseen: false,
          });
        }
        const group = map.get(story.userId)!;
        group.stories.push(story);
        if (!story.views.includes(currentUserId)) group.hasUnseen = true;
      }
      onData(Array.from(map.values()));
    },
    () => onData([])
  );
}

/**
 * Subscribe to the current user's own active stories.
 * Returns an unsubscribe function.
 */
export function subscribeToMyStories(
  userId: string,
  onData: (stories: Story[]) => void
): () => void {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const q = query(
    collection(db, "stories"),
    where("userId", "==", userId),
    where("createdAt", ">", since),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Story, "id">) })));
    },
    () => onData([])
  );
}

/** One-shot fetch of a user's active stories (used inside the viewer) */
export async function fetchUserStories(userId: string): Promise<Story[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const q = query(
    collection(db, "stories"),
    where("userId", "==", userId),
    where("createdAt", ">", since),
    orderBy("createdAt", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Story, "id">) }));
}
