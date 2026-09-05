import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, FlatList,
  Image, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { auth } from "@/lib/firebase";
import { searchUsersByName, type ShareUserResult } from "@/lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;

export default function UserSearchScreen() {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [queryText, setQueryText] = useState("");
  const [results, setResults] = useState<ShareUserResult[]>([]);
  const [loading, setLoading] = useState(false);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 220);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const term = queryText.trim();
    if (!term) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      setLoading(true);
      try {
        const data = await searchUsersByName(term, uid);
        if (!cancelled) setResults(data);
      } catch (error) {
        console.error("global user search failed:", error);
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [queryText]);

  const openProfile = (user: ShareUserResult) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Same profile route used by the Home feed and conversation flows.
    router.push({
      pathname: "/user-profile",
      params: { userId: user.userId, userName: user.name },
    } as any);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <LinearGradient
        colors={["#0D1B3E", "#162452"]}
        style={[styles.header, { paddingTop: topPad + 8 }]}
      >
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityLabel="رجوع"
        >
          <Feather name="chevron-right" size={24} color="#FFF" />
        </Pressable>

        <View style={styles.inputWrap}>
          <Feather name="search" size={18} color={C.textMuted} />
          <TextInput
            ref={inputRef}
            value={queryText}
            onChangeText={setQueryText}
            style={styles.input}
            placeholder="ابحث عن اسم المستخدم..."
            placeholderTextColor={C.textMuted}
            textAlign="right"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {!!queryText && (
            <Pressable onPress={() => setQueryText("")} hitSlop={8}>
              <Feather name="x-circle" size={17} color={C.textMuted} />
            </Pressable>
          )}
        </View>
      </LinearGradient>

      {queryText.trim() === "" ? (
        <View style={styles.center}>
          <View style={styles.centerIcon}>
            <Feather name="users" size={32} color={C.accent} />
          </View>
          <Text style={styles.emptyTitle}>البحث عن المستخدمين</Text>
          <Text style={styles.emptySub}>ابحث عن أي حساب عام أو صاحب اختصاص</Text>
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : results.length === 0 ? (
        <View style={styles.center}>
          <Feather name="user-x" size={44} color={C.textMuted} />
          <Text style={styles.emptyTitle}>لا توجد حسابات مطابقة</Text>
          <Text style={styles.emptySub}>جرّب كتابة بداية الاسم</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.userId}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.72 }]}
              onPress={() => openProfile(item)}
            >
              {item.photoUri ? (
                <Image source={{ uri: item.photoUri }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.initial}>{(item.name || "?")[0]}</Text>
                </View>
              )}
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <View style={styles.roleRow}>
                  <Ionicons
                    name={item.role === "artisan" ? "briefcase-outline" : "person-outline"}
                    size={13}
                    color={C.textMuted}
                  />
                  <Text style={styles.role}>{item.roleLabel}</Text>
                </View>
              </View>
              <Feather name="chevron-left" size={19} color={C.textMuted} />
            </Pressable>
          )}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  inputWrap: {
    flex: 1, minHeight: 44, borderRadius: 13,
    backgroundColor: "#FFF",
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, gap: 8,
  },
  input: {
    flex: 1, minHeight: 44,
    fontSize: 14, fontFamily: "Cairo_400Regular",
    color: C.text, paddingVertical: 0,
  },
  list: { padding: 14, gap: 10 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.card, borderRadius: 16, padding: 12,
  },
  avatar: { width: 54, height: 54, borderRadius: 27 },
  avatarFallback: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: "rgba(201,168,76,0.16)",
    alignItems: "center", justifyContent: "center",
  },
  initial: { fontSize: 21, fontFamily: "Cairo_700Bold", color: C.accent },
  info: { flex: 1, gap: 3 },
  name: { fontSize: 15, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },
  roleRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 5 },
  role: { fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textMuted },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 10 },
  centerIcon: {
    width: 70, height: 70, borderRadius: 22,
    backgroundColor: "rgba(201,168,76,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 17, fontFamily: "Cairo_700Bold", color: C.text },
  emptySub: { fontSize: 13, fontFamily: "Cairo_400Regular", color: C.textSecondary, textAlign: "center" },
});
