import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons, Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { Video, ResizeMode } from "expo-av";
import Colors from "@/constants/colors";
const C = Colors.light;
import {
  FoodItem,
  fetchFoodItems,
  getIsFoodLiked,
  toggleFoodLike,
} from "../lib/db_logic";
import { auth } from "../lib/firebase";


const SCREEN_WIDTH = Dimensions.get("window").width;

function FoodMedia({ item }: { item: FoodItem }) {
  const first = item.media?.[0];

  if (!first) {
    return (
      <View style={styles.emptyMedia}>
        <Ionicons
          name="restaurant-outline"
          size={42}
          color={C.accent}
        />
      </View>
    );
  }

  if (first.type === "video") {
    return <FoodVideo uri={first.url} />;
  }

  return (
    <Image
      source={{ uri: first.url }}
      style={styles.media}
      resizeMode="contain"
    />
  );
}

function FoodVideo({ uri }: { uri: string }) {
  return (
    <View style={styles.videoWrap}>
      <Video
        source={{ uri }}
        style={styles.media}
        resizeMode={ResizeMode.CONTAIN}
        useNativeControls
        isLooping
      />
    </View>
  );
}

function FoodCard({ item }: { item: FoodItem }) {
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(
    item.likesCount || 0
  );
  const [liking, setLiking] = useState(false);

  useEffect(() => {
    let active = true;

    const checkLike = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      try {
        const value = await getIsFoodLiked(item.id, uid);
        if (active) setLiked(value);
      } catch (error) {
        console.error("food like check failed:", error);
      }
    };

    void checkLike();

    return () => {
      active = false;
    };
  }, [item.id]);

  const handleLike = async () => {
    const uid = auth.currentUser?.uid;

    if (!uid || liking) return;

    setLiking(true);

    try {
      const nextLiked = await toggleFoodLike(item.id, uid);

      setLiked(nextLiked);
      setLikesCount((count) =>
        Math.max(0, count + (nextLiked ? 1 : -1))
      );
    } catch (error: any) {
      Alert.alert(
        "تعذر الإعجاب",
        error?.message || "حدث خطأ."
      );
    } finally {
      setLiking(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.ownerRow}>
        {item.userPhoto ? (
          <Image
            source={{ uri: item.userPhoto }}
            style={styles.avatar}
          />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Feather name="user" size={18} color={C.textMuted} />
          </View>
        )}

        <Text style={styles.ownerName} numberOfLines={1}>
          {item.userName || "مستخدم"}
        </Text>
      </View>

      <FoodMedia item={item} />

      <View style={styles.info}>
        <View style={styles.namePriceRow}>
          <Text style={styles.foodName} numberOfLines={2}>
            {item.name}
          </Text>

          <Text style={styles.price}>
            {Number(item.price || 0).toLocaleString("en-US")} د.ع
          </Text>
        </View>

        {!!item.appetizers?.trim() && (
          <View style={styles.appetizersRow}>
            <Ionicons
              name="restaurant-outline"
              size={17}
              color={C.accent}
            />
            <Text style={styles.appetizers}>
              {item.appetizers}
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <Pressable
            style={styles.action}
            onPress={() => void handleLike()}
            disabled={liking}
          >
            <Ionicons
              name={liked ? "heart" : "heart-outline"}
              size={23}
              color={liked ? "#e53935" : C.text}
            />
            <Text style={styles.actionText}>
              {likesCount}
            </Text>
          </Pressable>

          <Pressable
            style={styles.action}
            onPress={() =>
              Alert.alert(
                "التعليقات",
                "سيتم فتح قسم التعليقات في الخطوة التالية."
              )
            }
          >
            <Ionicons
              name="chatbubble-outline"
              size={22}
              color={C.text}
            />
            <Text style={styles.actionText}>
              {item.commentsCount || 0}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function FoodScreen() {
  const [items, setItems] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const result = await fetchFoodItems();
      setItems(result);
    } catch (error: any) {
      console.error("fetch food failed:", error);

      Alert.alert(
        "تعذر تحميل المأكولات",
        error?.message || "حدث خطأ أثناء تحميل الأطباق."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [])
  );

  const refresh = () => {
    setRefreshing(true);
    void load();
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={C.accent} />
        <Text style={styles.loadingText}>
          جاري تحميل المأكولات...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
        >
          <Feather name="arrow-right" size={22} color="#FFF" />
        </Pressable>

        <View style={styles.headerTitle}>
          <Ionicons
            name="restaurant-outline"
            size={23}
            color={C.accent}
          />
          <Text style={styles.headerText}>
            المأكولات
          </Text>
        </View>

        <View style={styles.backBtn} />
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons
            name="restaurant-outline"
            size={58}
            color={C.accent}
          />
          <Text style={styles.emptyTitle}>
            لا توجد أطباق منشورة بعد
          </Text>
          <Text style={styles.emptyText}>
            كن أول من يضيف طبقًا إلى قسم المأكولات
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <FoodCard item={item} />
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
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

  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  headerText: {
    color: "#FFF",
    fontSize: 19,
    fontWeight: "900",
  },

  list: {
    padding: 12,
    paddingBottom: 35,
  },

  card: {
    backgroundColor: C.card,
    borderRadius: 17,
    overflow: "hidden",
    marginBottom: 15,
    borderWidth: 1,
    borderColor: C.border,
  },

  ownerRow: {
    minHeight: 51,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },

  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },

  avatarPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.background,
    alignItems: "center",
    justifyContent: "center",
  },

  ownerName: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "right",
  },

  media: {
    width: "100%",
    height: SCREEN_WIDTH * 0.78,
    backgroundColor: "#111",
  },

  videoWrap: {
    width: "100%",
    height: SCREEN_WIDTH * 0.78,
    backgroundColor: "#111",
  },

  emptyMedia: {
    width: "100%",
    height: SCREEN_WIDTH * 0.78,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.background,
  },

  info: {
    padding: 13,
  },

  namePriceRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  foodName: {
    flex: 1,
    color: C.text,
    fontSize: 18,
    fontWeight: "900",
    textAlign: "right",
  },

  price: {
    color: C.accent,
    fontSize: 16,
    fontWeight: "900",
  },

  appetizersRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 8,
  },

  appetizers: {
    flex: 1,
    color: C.textMuted,
    fontSize: 13,
    textAlign: "right",
    lineHeight: 20,
  },

  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginTop: 12,
    paddingTop: 10,
  },

  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  actionText: {
    color: C.text,
    fontSize: 13,
    fontWeight: "700",
  },

  loading: {
    flex: 1,
    backgroundColor: C.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },

  loadingText: {
    color: C.textMuted,
    fontSize: 13,
  },

  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },

  emptyTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 15,
  },

  emptyText: {
    color: C.textMuted,
    fontSize: 13,
    textAlign: "center",
    marginTop: 7,
  },
});
