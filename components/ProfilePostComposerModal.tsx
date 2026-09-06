import React from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import Colors from "@/constants/colors";

const C = Colors.light;

export type ProfilePostDraftMedia = {
  uri: string;
  mediaType: "image" | "video";
  mimeType?: string | null;
  fileName?: string | null;
};

type Props = {
  media: ProfilePostDraftMedia | null;
  caption: string;
  posting: boolean;
  onCaptionChange: (value: string) => void;
  onClose: () => void;
  onPublish: () => void;
};

export default function ProfilePostComposerModal({
  media,
  caption,
  posting,
  onCaptionChange,
  onClose,
  onPublish,
}: Props) {
  const close = () => {
    if (!posting) onClose();
  };

  return (
    <Modal
      visible={!!media}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={close}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboard}
        >
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text style={styles.title}>وصف المنشور</Text>
              <Pressable
                disabled={posting}
                onPress={close}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="إغلاق نافذة وصف المنشور"
              >
                <Feather name="x" size={19} color={C.textSecondary} />
              </Pressable>
            </View>

            {media && (
              media.mediaType === "video" ? (
                <View style={styles.previewVideo}>
                  <Video
                    source={{ uri: media.uri }}
                    style={StyleSheet.absoluteFill}
                    resizeMode={ResizeMode.COVER}
                    shouldPlay={false}
                    isMuted
                  />
                </View>
              ) : (
                <Image
                  source={{ uri: media.uri }}
                  style={styles.previewImage}
                  resizeMode="cover"
                />
              )
            )}

            <TextInput
              value={caption}
              onChangeText={onCaptionChange}
              placeholder="اكتب وصفاً أو تفاصيل عن المنشور..."
              placeholderTextColor={C.textMuted}
              style={styles.input}
              multiline
              maxLength={1000}
              textAlign="right"
              editable={!posting}
              autoFocus
            />

            <Pressable
              style={styles.publishButton}
              onPress={onPublish}
              disabled={posting}
              accessibilityRole="button"
              accessibilityLabel="نشر المنشور"
            >
              {posting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Feather name="send" size={17} color="#FFF" />
              )}
              <Text style={styles.publishText}>{posting ? "جارٍ النشر..." : "نشر"}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,.55)",
    justifyContent: "flex-end",
  },
  keyboard: { width: "100%" },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingHorizontal: 14,
    paddingBottom: 20,
    maxHeight: "88%",
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: "center",
    marginBottom: 9,
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingBottom: 10,
  },
  title: {
    fontSize: 17,
    fontFamily: "Cairo_700Bold",
    color: C.text,
    textAlign: "right",
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.background,
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: {
    width: "100%",
    height: 190,
    borderRadius: 16,
    backgroundColor: "#000",
    marginBottom: 10,
  },
  previewVideo: {
    width: "100%",
    height: 190,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#000",
    marginBottom: 10,
  },
  input: {
    minHeight: 100,
    maxHeight: 180,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.background,
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: 11,
    color: C.text,
    fontFamily: "Cairo_400Regular",
    textAlignVertical: "top",
    marginBottom: 10,
  },
  publishButton: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: C.accent,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    transform: [{ translateY: -20 }],
  },
  publishText: {
    color: "#FFF",
    fontSize: 13,
    fontFamily: "Cairo_700Bold",
  },
});