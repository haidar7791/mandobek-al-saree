import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import {
  addProfilePostComment,
  getPostComments,
  togglePostCommentLike,
  type HomeFeedComment,
  type ProfilePost,
} from "@/lib/db_logic";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const C = Colors.light;

type Props = {
  visible: boolean;
  post: ProfilePost | null;
  postDocumentId?: string | null;
  onClose: () => void;
  onCommentCountChange?: (count: number) => void;
};

export default function ProfileCommentsModal({
  visible,
  post,
  postDocumentId,
  onClose,
  onCommentCountChange,
}: Props) {
  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState<HomeFeedComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [text, setText] = useState("");
  const countChangeRef = useRef(onCommentCountChange);

  useEffect(() => {
    countChangeRef.current = onCommentCountChange;
  }, [onCommentCountChange]);

  const commentId = postDocumentId || (post ? post.id : "");

  useEffect(() => {
    if (!visible || !commentId) return;
    let cancelled = false;
    setLoading(true);
    setText("");
    getPostComments(commentId)
      .then((items) => {
        if (cancelled) return;
        setComments(items);
        countChangeRef.current?.(items.length);
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [commentId, visible]);

  const submit = async () => {
    const cleanText = text.trim();
    if (!commentId || !cleanText || posting) return;
    setPosting(true);
    try {
      const added = await addProfilePostComment(commentId, cleanText);
      setComments((current) => {
        const next = [added, ...current];
        countChangeRef.current?.(next.length);
        return next;
      });
      setText("");
    } catch {
      // The profile remains usable if a comment write is rejected.
    } finally {
      setPosting(false);
    }
  };

  const toggleLike = async (comment: HomeFeedComment) => {
    try {
      const liked = await togglePostCommentLike(commentId, comment.id);
      setComments((current) =>
        current.map((item) =>
          item.id === comment.id
            ? {
                ...item,
                isLiked: liked,
                likesCount: Math.max(0, Number(item.likesCount ?? 0) + (liked ? 1 : -1)),
              }
            : item,
        ),
      );
    } catch {
      // Ignore a stale comment reaction; the next open reloads the source.
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(8, insets.bottom + 8) }]}>
          <View style={styles.header}>
            <Text style={styles.title}>التعليقات</Text>
            <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button">
              <Ionicons name="close" size={23} color={C.text} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="small" color={C.accent} />
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => item.id}
              contentContainerStyle={comments.length ? styles.commentsContent : styles.emptyContent}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <View style={styles.commentRow}>
                  <View style={styles.commentBody}>
                    <Text style={styles.commentName}>{item.userName}</Text>
                    <Text style={styles.commentText}>{item.text}</Text>
                  </View>
                  <Pressable
                    onPress={() => void toggleLike(item)}
                    style={styles.commentLike}
                    accessibilityRole="button"
                    accessibilityLabel={item.isLiked ? "إلغاء إعجاب التعليق" : "الإعجاب بالتعليق"}
                  >
                    <Ionicons
                      name={item.isLiked ? "heart" : "heart-outline"}
                      size={17}
                      color={item.isLiked ? "#EF4444" : C.textMuted}
                    />
                    <Text style={styles.commentLikes}>{item.likesCount ?? 0}</Text>
                  </Pressable>
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Feather name="message-circle" size={30} color={C.textMuted} />
                  <Text style={styles.emptyText}>لا توجد تعليقات بعد</Text>
                </View>
              }
            />
          )}

          <View style={[styles.composer, { paddingBottom: Math.max(10, insets.bottom + 10) }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="اكتب تعليقاً..."
              placeholderTextColor={C.textMuted}
              multiline
              style={styles.input}
              textAlign="right"
              editable={!posting}
            />
            <Pressable
              onPress={() => void submit()}
              disabled={!text.trim() || posting}
              style={[styles.sendButton, (!text.trim() || posting) && styles.sendDisabled]}
              accessibilityRole="button"
              accessibilityLabel="إرسال التعليق"
            >
              {posting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Feather name="send" size={17} color="#FFF" />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    maxHeight: "84%",
    minHeight: 280,
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 14,
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  title: { color: C.text, fontSize: 16, fontWeight: "800", textAlign: "right" },
  closeButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  loading: { minHeight: 210, alignItems: "center", justifyContent: "center" },
  commentsContent: { paddingVertical: 8, gap: 8 },
  emptyContent: { flexGrow: 1, justifyContent: "center" },
  empty: { alignItems: "center", gap: 8, paddingVertical: 28 },
  emptyText: { color: C.textMuted, fontSize: 13 },
  commentRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  commentBody: { flex: 1, gap: 3, alignItems: "flex-end" },
  commentName: { color: C.text, fontSize: 12, fontWeight: "800" },
  commentText: { color: C.textSecondary, fontSize: 13, textAlign: "right", flexShrink: 1 },
  commentLike: { alignItems: "center", gap: 2, minWidth: 28 },
  commentLikes: { color: C.textMuted, fontSize: 10 },
  composer: {
    flexDirection: "row-reverse",
    alignItems: "flex-end",
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 90,
    color: C.text,
    backgroundColor: C.inputBg,
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.45 },
});