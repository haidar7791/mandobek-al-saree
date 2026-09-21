import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { auth } from "@/lib/firebase";
import {
  fetchProductsOnce,
  searchUsersByName,
  type Product,
  type ShareUserResult,
} from "@/lib/db_logic";
import Colors from "@/constants/colors";
import { goHome, navigateWithHomeBase } from "@/lib/navigation";

const C = Colors.light;

export default function UserSearchScreen() {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const [queryText, setQueryText] = useState("");
  const [results, setResults] = useState<ShareUserResult[]>([]);
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  const topPad =
    Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 220);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const term = queryText.trim();

    if (!term) {
      setResults([]);
      setProductResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      const uid = auth.currentUser?.uid;

      if (!uid) {
        setResults([]);
        setProductResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const [users, products] = await Promise.all([
          searchUsersByName(term, uid),
          fetchProductsOnce(),
        ]);

        if (cancelled) return;

        const q = term.toLowerCase();

        const matchingProducts = products.filter((product) => {
          if (product.status !== "available") return false;

          return (
            product.title?.toLowerCase().includes(q) ||
            product.description?.toLowerCase().includes(q)
          );
        });

        setResults(users);
        setProductResults(matchingProducts);
      } catch (error) {
        console.error("global search failed:", error);

        if (!cancelled) {
          setResults([]);
          setProductResults([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [queryText]);

  const openProfile = (user: ShareUserResult) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    navigateWithHomeBase({
      pathname: "/user-profile",
      params: {
        userId: user.userId,
        userName: user.name,
      },
    } as any);
  };

  const openProduct = (product: Product) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    navigateWithHomeBase({
      pathname: "/product/[id]",
      params: {
        productId: product.id,
        id: product.id,
        product: JSON.stringify(product),
      },
    } as any);
  };

  const hasResults = results.length > 0 || productResults.length > 0;

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
          onPress={goHome}
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
            placeholder="ابحث عن مستخدم أو منتج..."
            placeholderTextColor={C.textMuted}
            textAlign="right"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />

          {!!queryText && (
            <Pressable
              onPress={() => setQueryText("")}
              hitSlop={8}
            >
              <Feather
                name="x-circle"
                size={17}
                color={C.textMuted}
              />
            </Pressable>
          )}
        </View>
      </LinearGradient>

      {queryText.trim() === "" ? (
        <View style={styles.center}>
          <View style={styles.centerIcon}>
            <Feather name="search" size={32} color={C.accent} />
          </View>

          <Text style={styles.emptyTitle}>
            البحث في المستخدمين والمنتجات
          </Text>

          <Text style={styles.emptySub}>
            اكتب اسم مستخدم أو اسم منتج للبحث
          </Text>
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : !hasResults ? (
        <View style={styles.center}>
          <Feather
            name="search"
            size={44}
            color={C.textMuted}
          />

          <Text style={styles.emptyTitle}>
            لا توجد نتائج مطابقة
          </Text>

          <Text style={styles.emptySub}>
            جرّب كتابة بداية اسم المستخدم أو المنتج
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => `user-${item.userId}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            productResults.length > 0 ? (
              <View>
                <Text style={styles.sectionTitle}>
                  المنتجات
                </Text>

                {productResults.map((product) => (
                  <Pressable
                    key={`product-${product.id}`}
                    style={({ pressed }) => [
                      styles.productRow,
                      pressed && { opacity: 0.72 },
                    ]}
                    onPress={() => openProduct(product)}
                  >
                    {product.thumbnailUrl || product.imageUrl ? (
                      <Image
                        source={{
                          uri:
                            product.thumbnailUrl ||
                            product.imageUrl,
                        }}
                        style={styles.productImage}
                      />
                    ) : (
                      <View style={styles.productImageFallback}>
                        <Feather
                          name="shopping-bag"
                          size={22}
                          color={C.accent}
                        />
                      </View>
                    )}

                    <View style={styles.productInfo}>
                      <Text
                        style={styles.productName}
                        numberOfLines={1}
                      >
                        {product.title}
                      </Text>

                      {!!product.sellerName && (
                        <Text
                          style={styles.productSeller}
                          numberOfLines={1}
                        >
                          {product.sellerName}
                        </Text>
                      )}

                      <Text style={styles.productPrice}>
                        {Number(
                          product.price || 0
                        ).toLocaleString("ar-IQ")}{" "}
                        د.ع
                      </Text>
                    </View>

                    <Feather
                      name="chevron-left"
                      size={20}
                      color={C.textMuted}
                    />
                  </Pressable>
                ))}
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.row,
                pressed && { opacity: 0.72 },
              ]}
              onPress={() => openProfile(item)}
            >
              {item.photoUri ? (
                <Image
                  source={{ uri: item.photoUri }}
                  style={styles.avatar}
                />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.initial}>
                    {(item.name || "?")[0]}
                  </Text>
                </View>
              )}

              <View style={styles.info}>
                <Text
                  style={styles.name}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>

                <View style={styles.roleRow}>
                  <Ionicons
                    name={
                      item.role === "artisan"
                        ? "briefcase-outline"
                        : "person-outline"
                    }
                    size={13}
                    color={C.textMuted}
                  />

                  <Text style={styles.role}>
                    {item.roleLabel}
                  </Text>
                </View>
              </View>

              <Feather
                name="chevron-left"
                size={19}
                color={C.textMuted}
              />
            </Pressable>
          )}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.background,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },

  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  inputWrap: {
    flex: 1,
    minHeight: 44,
    borderRadius: 13,
    backgroundColor: "#FFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },

  input: {
    flex: 1,
    minHeight: 44,
    fontSize: 14,
    fontFamily: undefined,
    color: C.text,
    paddingVertical: 0,
  },

  list: {
    padding: 14,
    gap: 10,
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: C.text,
    textAlign: "right",
    marginBottom: 8,
    marginTop: 4,
  },

  productRow: {
    minHeight: 76,
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 14,
    paddingHorizontal: 10,
    marginBottom: 8,
  },

  productImage: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: "#F1F3F5",
  },

  productImageFallback: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: "#F1F3F5",
    alignItems: "center",
    justifyContent: "center",
  },

  productInfo: {
    flex: 1,
    alignItems: "flex-end",
    marginHorizontal: 10,
  },

  productName: {
    width: "100%",
    fontSize: 14,
    fontWeight: "700",
    color: C.text,
    textAlign: "right",
  },

  productSeller: {
    width: "100%",
    fontSize: 11,
    color: C.textMuted,
    textAlign: "right",
    marginTop: 3,
  },

  productPrice: {
    width: "100%",
    fontSize: 12,
    fontWeight: "700",
    color: C.accent,
    textAlign: "right",
    marginTop: 3,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 12,
  },

  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },

  avatarFallback: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(201,168,76,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },

  initial: {
    fontSize: 21,
    fontFamily: undefined,
    color: C.accent,
  },

  info: {
    flex: 1,
    gap: 3,
  },

  name: {
    fontSize: 15,
    fontFamily: undefined,
    color: C.text,
    textAlign: "right",
  },

  roleRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 5,
  },

  role: {
    fontSize: 12,
    fontFamily: undefined,
    color: C.textMuted,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 10,
  },

  centerIcon: {
    width: 70,
    height: 70,
    borderRadius: 22,
    backgroundColor: "rgba(201,168,76,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyTitle: {
    fontSize: 17,
    fontFamily: undefined,
    color: C.text,
  },

  emptySub: {
    fontSize: 13,
    fontFamily: undefined,
    color: C.textSecondary,
    textAlign: "center",
  },
});
