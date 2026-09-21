import React, { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { ResizeMode, Video } from "expo-av";

type Props = {
  uri: string;
  thumbnailUri?: string | null;
  style?: StyleProp<ViewStyle>;
  resizeMode?: ResizeMode;
  shouldMount: boolean;
  shouldPlay: boolean;
  isMuted: boolean;
  isLooping?: boolean;
  placeholder?: ReactNode;
};

/**
 * Keeps only the small playback window mounted and explicitly releases the
 * native player when an item leaves that window.
 */
export default function ManagedVideoSurface({
  uri,
  thumbnailUri,
  style,
  resizeMode = ResizeMode.COVER,
  shouldMount,
  shouldPlay,
  isMuted,
  isLooping = true,
  placeholder,
}: Props) {
  const videoRef = useRef<Video | null>(null);
  const [renderVideo, setRenderVideo] = useState(shouldMount);

  const releasePlayer = useCallback(async (player: Video | null) => {
    if (!player) return;
    try {
      await player.stopAsync();
    } catch {
      // The player may already be unloaded during rapid list changes.
    }
    try {
      await player.unloadAsync();
    } catch {
      // The player may already be unloaded during rapid list changes.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (shouldMount) {
      setRenderVideo(true);
      return () => {
        cancelled = true;
      };
    }

    const player = videoRef.current;
    if (!player) {
      setRenderVideo(false);
      return;
    }

    void releasePlayer(player).finally(() => {
      if (!cancelled) setRenderVideo(false);
    });

    return () => {
      cancelled = true;
    };
  }, [releasePlayer, shouldMount]);

  useEffect(() => {
    return () => {
      void releasePlayer(videoRef.current);
    };
  }, [releasePlayer]);

  return (
    <View style={[styles.root, style]}>
      {renderVideo ? (
        <Video
          ref={videoRef}
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode={resizeMode}
          shouldPlay={shouldMount && shouldPlay}
          isMuted={isMuted}
          isLooping={isLooping}
          useNativeControls={false}
        />
      ) : thumbnailUri ? (
        <Image
          source={{ uri: thumbnailUri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.placeholder}>{placeholder}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: "hidden",
    backgroundColor: "#000",
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
  },
});