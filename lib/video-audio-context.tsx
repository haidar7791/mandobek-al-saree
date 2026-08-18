/**
 * video-audio-context.tsx
 * Global mute/unmute state shared across all video cards.
 * Instagram-style: toggling the mute button on any card affects every card.
 */
import React, { createContext, useCallback, useContext, useState } from "react";

interface VideoAudioContextValue {
  /** true = all videos are muted (default on app start) */
  isAudioMuted: boolean;
  /** Toggle global mute — instantly reflects on every mounted video */
  toggleMute: () => void;
}

const VideoAudioContext = createContext<VideoAudioContextValue>({
  isAudioMuted: true,
  toggleMute: () => {},
});

export function VideoAudioProvider({ children }: { children: React.ReactNode }) {
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const toggleMute = useCallback(() => setIsAudioMuted((m) => !m), []);

  return (
    <VideoAudioContext.Provider value={{ isAudioMuted, toggleMute }}>
      {children}
    </VideoAudioContext.Provider>
  );
}

/** Consume global mute state + toggle from any component */
export function useVideoAudio() {
  return useContext(VideoAudioContext);
}
