import { Platform } from "react-native";
import { getThumbnailAsync } from "expo-video-thumbnails";

function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: "loadedmetadata" | "loadeddata" | "seeked",
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out while reading video frame"));
    }, 15_000);

    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener(eventName, onReady);
      video.removeEventListener("error", onError);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Unable to read video frame"));
    };

    video.addEventListener(eventName, onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

async function createWebVideoThumbnail(uri: string, timeMs: number): Promise<string> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`Unable to read video (${response.status})`);

  const objectUrl = URL.createObjectURL(await response.blob());
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = objectUrl;

  try {
    const metadata = waitForVideoEvent(video, "loadedmetadata");
    video.load();
    await metadata;

    const requestedTime = Math.max(0, timeMs / 1000);
    const frameTime = Number.isFinite(video.duration)
      ? Math.min(requestedTime, Math.max(0, video.duration - 0.05))
      : requestedTime;
    if (frameTime > 0) {
      const seeked = waitForVideoEvent(video, "seeked");
      video.currentTime = frameTime;
      await seeked;
    }
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await waitForVideoEvent(video, "loadeddata");
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) throw new Error("Video has no usable frame");

    const scale = Math.min(1, 640 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

/** Creates a local JPEG thumbnail without a privileged server endpoint. */
export async function createVideoThumbnail(
  uri: string,
  timeMs = 2000,
): Promise<string> {
  if (Platform.OS === "web") return createWebVideoThumbnail(uri, timeMs);
  const result = await getThumbnailAsync(uri, { time: timeMs, quality: 0.82 });
  return result.uri;
}
