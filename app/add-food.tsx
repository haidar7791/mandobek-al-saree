import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Feather, Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
const C = Colors.light;
import { auth } from "../lib/firebase";
import {
  addFoodItem,
  getUserProfile,
  uploadProfilePostMedia,
} from "../lib/db_logic";



export default function AddFoodScreen() {
  const [media, setMedia] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [appetizers, setAppetizers] = useState("");
  const [publishing, setPublishing] = useState(false);

  const chooseMedia = async () => {
    if (media.length >= 5) {
      Alert.alert("تنبيه", "يمكنك اختيار 5 عناصر كحد أقصى.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      selectionLimit: 5 - media.length,
      quality: 0.9,
    });

    if (result.canceled || !result.assets?.length) return;

    setMedia((prev) => [...prev, ...result.assets].slice(0, 5));
  };

  const removeMedia = (index: number) => {
    setMedia((prev) => prev.filter((_, i) => i !== index));
  };

  const publish = async () => {
    const viewer = auth.currentUser;
    const cleanName = name.trim();
    const cleanPrice = price.replace(/[^\d]/g, "");
    const numericPrice = Number(cleanPrice);

    if (!viewer) {
      Alert.alert("تنبيه", "سجّل الدخول أولاً.");
      return;
    }

    if (!media.length) {
      Alert.alert("تنبيه", "اختر صورة أو فيديو واحداً على الأقل.");
      return;
    }

    if (!cleanName) {
      Alert.alert("تنبيه", "اكتب اسم الطبق.");
      return;
    }

    if (!numericPrice || numericPrice <= 0) {
      Alert.alert("تنبيه", "اكتب سعراً صحيحاً.");
      return;
    }

    setPublishing(true);

    try {
      const profile = await getUserProfile(viewer.uid);

      const uploaded: { url: string; type: "image" | "video" }[] = [];

      for (const asset of media) {
        const mediaType =
          asset.type === "video" ? "video" : "image";

        const result = await uploadProfilePostMedia(
          viewer.uid,
          asset.uri,
          mediaType,
          {
            mimeType: asset.mimeType,
            fileName: asset.fileName,
          }
        );

        uploaded.push({
          url: result.url,
          type: mediaType,
        });
      }

      await addFoodItem({
        userId: viewer.uid,
        userName:
          profile?.name ||
          viewer.displayName ||
          "مستخدم",
        userPhoto:
          profile?.photoUri ||
          viewer.photoURL ||
          null,
        name: cleanName,
        price: numericPrice,
        appetizers: appetizers.trim(),
        media: uploaded,
        likesCount: 0,
        commentsCount: 0,
        createdAt: Date.now(),
      });

      Alert.alert(
        "تم النشر",
        "تم نشر الطبق بنجاح في قسم المأكولات.",
        [
          {
            text: "حسناً",
            onPress: () => router.replace("/food" as any),
          },
        ]
      );
    } catch (error: any) {
      console.error("publish food failed:", error);

      Alert.alert(
        "تعذر النشر",
        error?.message || "حدث خطأ أثناء نشر الطبق."
      );
    } finally {
      setPublishing(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Feather name="arrow-right" size={22} color="#FFF" />
        </Pressable>

        <View style={styles.titleWrap}>
          <Ionicons
            name="restaurant-outline"
            size={23}
            color={C.accent}
          />
          <Text style={styles.title}>إضافة طبق طعام</Text>
        </View>

        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>الصورة أو الفيديو</Text>

        <Pressable
          style={styles.mediaPicker}
          onPress={() => void chooseMedia()}
        >
          <Ionicons
            name="images-outline"
            size={34}
            color={C.accent}
          />

          <Text style={styles.mediaTitle}>
            اختيار صورة أو فيديو
          </Text>

          <Text style={styles.mediaHint}>
            يمكنك اختيار حتى 5 عناصر
          </Text>
        </Pressable>

        {media.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.previewRow}
          >
            {media.map((item, index) => (
              <View
                style={styles.preview}
                key={`${item.uri}-${index}`}
              >
                {item.type === "video" ? (
                  <View style={styles.videoPreview}>
                    <Ionicons
                      name="videocam"
                      size={32}
                      color="#FFF"
                    />
                  </View>
                ) : (
                  <Image
                    source={{ uri: item.uri }}
                    style={styles.previewImage}
                  />
                )}

                <Pressable
                  style={styles.removeBtn}
                  onPress={() => removeMedia(index)}
                >
                  <Feather name="x" size={15} color="#FFF" />
                </Pressable>

                <View style={styles.numberBadge}>
                  <Text style={styles.numberText}>
                    {index + 1}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        <Text style={styles.label}>
          اسم الطبق أو اسم الأكلة
        </Text>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="مثال: مندي"
          placeholderTextColor={C.textMuted}
          style={styles.input}
          textAlign="right"
        />

        <Text style={styles.label}>السعر</Text>

        <View style={styles.priceBox}>
          <TextInput
            value={price}
            onChangeText={setPrice}
            placeholder="15000"
            placeholderTextColor={C.textMuted}
            style={styles.priceInput}
            keyboardType="number-pad"
            textAlign="right"
          />

          <Text style={styles.currency}>د.ع</Text>
        </View>

        <Text style={styles.label}>
          المقبلات{" "}
          <Text style={styles.optional}>(اختياري)</Text>
        </Text>

        <TextInput
          value={appetizers}
          onChangeText={setAppetizers}
          placeholder="مثال: سلطة، حمص بطحينة، بيبسي"
          placeholderTextColor={C.textMuted}
          style={[styles.input, styles.multiline]}
          multiline
          textAlign="right"
        />

        <Pressable
          style={[
            styles.publishBtn,
            publishing && styles.disabled,
          ]}
          onPress={() => void publish()}
          disabled={publishing}
        >
          {publishing ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Feather
                name="upload-cloud"
                size={20}
                color="#FFF"
              />
              <Text style={styles.publishText}>
                نشر الطبق
              </Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.background,
  },

  header: {
    height: 62,
    backgroundColor: C.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },

  headerBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  titleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  title: {
    color: "#FFF",
    fontSize: 19,
    fontWeight: "800",
  },

  content: {
    padding: 16,
    paddingBottom: 40,
  },

  label: {
    color: C.text,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "right",
    marginBottom: 8,
    marginTop: 16,
  },

  optional: {
    color: C.textMuted,
    fontWeight: "400",
  },

  mediaPicker: {
    minHeight: 125,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: C.accent,
    backgroundColor: C.card,
    alignItems: "center",
    justifyContent: "center",
  },

  mediaTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 7,
  },

  mediaHint: {
    color: C.textMuted,
    fontSize: 11,
    marginTop: 3,
  },

  previewRow: {
    gap: 9,
    paddingVertical: 12,
  },

  preview: {
    width: 100,
    height: 100,
    borderRadius: 13,
    overflow: "hidden",
    backgroundColor: "#111",
    position: "relative",
  },

  previewImage: {
    width: "100%",
    height: "100%",
  },

  videoPreview: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
  },

  removeBtn: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,.7)",
    alignItems: "center",
    justifyContent: "center",
  },

  numberBadge: {
    position: "absolute",
    bottom: 5,
    left: 5,
    width: 23,
    height: 23,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,.65)",
    alignItems: "center",
    justifyContent: "center",
  },

  numberText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "800",
  },

  input: {
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
    paddingHorizontal: 13,
    fontSize: 14,
  },

  priceBox: {
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingRight: 12,
  },

  priceInput: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    paddingHorizontal: 5,
  },

  currency: {
    color: C.accent,
    fontWeight: "800",
    paddingLeft: 12,
  },

  multiline: {
    minHeight: 85,
    paddingTop: 12,
    textAlignVertical: "top",
  },

  publishBtn: {
    minHeight: 52,
    borderRadius: 15,
    backgroundColor: C.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 28,
  },

  publishText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "900",
  },

  disabled: {
    opacity: 0.65,
  },
});
