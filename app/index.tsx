import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Dimensions,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from "react-native-reanimated";
import { Feather, MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

const { height } = Dimensions.get("window");
const C = Colors.light;

function ActionButton({
  icon,
  label,
  subtitle,
  onPress,
  delay,
  variant = "primary",
}: {
  icon: React.ReactNode;
  label: string;
  subtitle: string;
  onPress: () => void;
  delay: number;
  variant?: "primary" | "gold" | "outline";
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(30);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 500 }));
    translateY.value = withDelay(delay, withSpring(0, { damping: 16 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSpring(0.97, { damping: 12 }, () => {
      scale.value = withSpring(1);
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const bgColor =
    variant === "primary"
      ? C.primary
      : variant === "gold"
        ? C.accent
        : "transparent";

  const borderStyle =
    variant === "outline" ? { borderWidth: 1.5, borderColor: C.accent } : {};

  const iconColor =
    variant === "outline" ? C.accent : variant === "gold" ? C.primary : C.accent;

  const textColor =
    variant === "outline" ? C.primary : variant === "gold" ? C.primary : C.card;

  const subColor =
    variant === "outline"
      ? C.textSecondary
      : variant === "gold"
        ? "rgba(13,27,62,0.65)"
        : "rgba(255,255,255,0.65)";

  return (
    <Animated.View style={[animStyle, pressStyle]}>
      <Pressable onPress={handlePress}>
        <View
          style={[
            styles.actionBtn,
            { backgroundColor: bgColor },
            borderStyle,
          ]}
        >
          <View
            style={[
              styles.iconWrap,
              {
                backgroundColor:
                  variant === "outline"
                    ? "rgba(201,168,76,0.12)"
                    : "rgba(255,255,255,0.12)",
              },
            ]}
          >
            {icon}
          </View>
          <View style={styles.btnTextGroup}>
            <Text style={[styles.btnLabel, { color: textColor }]}>{label}</Text>
            <Text style={[styles.btnSubtitle, { color: subColor }]}>
              {subtitle}
            </Text>
          </View>
          <Feather
            name="chevron-left"
            size={20}
            color={iconColor}
            style={{ opacity: 0.7 }}
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();

  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.7);

  useEffect(() => {
    logoOpacity.value = withTiming(1, {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    });
    logoScale.value = withSpring(1, { damping: 14 });
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const topPad =
    Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad =
    Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#0D1B3E", "#162452", "#0D1B3E"]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.container, { paddingTop: topPad + 20, paddingBottom: bottomPad + 20 }]}>
        <Animated.View style={[styles.logoSection, logoStyle]}>
          <View style={styles.logoCircle}>
            <LinearGradient
              colors={[C.accent, C.accentLight]}
              style={styles.logoGradient}
            >
              <MaterialCommunityIcons name="lightning-bolt" size={42} color={C.primary} />
            </LinearGradient>
          </View>
          <Text style={styles.appName}>مندوبك السريع</Text>
          <Text style={styles.appTagline}>خدمات الإيداع والسحب بكل سهولة</Text>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <View style={styles.dividerDot} />
            <View style={styles.dividerLine} />
          </View>
        </Animated.View>

        <View style={styles.btnGroup}>
          <ActionButton
            icon={<Feather name="user-plus" size={22} color={C.accent} />}
            label="تسجيل حساب جديد"
            subtitle="أنشئ حسابك الآن"
            onPress={() => router.push("/register")}
            delay={200}
            variant="outline"
          />
          <ActionButton
            icon={<Feather name="log-in" size={22} color={C.primary} />}
            label="تسجيل الدخول"
            subtitle="ادخل إلى حسابك"
            onPress={() => router.push("/login")}
            delay={350}
            variant="gold"
          />
          <ActionButton
            icon={<Ionicons name="shield-checkmark" size={22} color={C.accent} />}
            label="وصول المشرف"
            subtitle="لأصحاب النظام فقط"
            onPress={() => router.push("/admin")}
            delay={500}
            variant="primary"
          />
        </View>

        <Animated.View
          style={[
            styles.footer,
            useAnimatedStyle(() => ({
              opacity: withDelay(700, withTiming(1, { duration: 500 })),
            })),
          ]}
        >
          <Text style={styles.footerText}>
            منصة موثوقة وآمنة لإدارة طلباتك المالية
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0D1B3E",
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  logoSection: {
    alignItems: "center",
    gap: 10,
  },
  logoCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    marginBottom: 8,
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 16,
  },
  logoGradient: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
  },
  appName: {
    fontSize: 32,
    fontFamily: "Cairo_700Bold",
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  appTagline: {
    fontSize: 14,
    fontFamily: "Cairo_400Regular",
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    width: "60%",
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(201,168,76,0.3)",
  },
  dividerDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: C.accent,
  },
  btnGroup: {
    gap: 14,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 14,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnTextGroup: {
    flex: 1,
    alignItems: "flex-end",
  },
  btnLabel: {
    fontSize: 16,
    fontFamily: "Cairo_600SemiBold",
    textAlign: "right",
  },
  btnSubtitle: {
    fontSize: 12,
    fontFamily: "Cairo_400Regular",
    textAlign: "right",
    marginTop: 1,
  },
  footer: {
    alignItems: "center",
  },
  footerText: {
    fontSize: 12,
    fontFamily: "Cairo_400Regular",
    color: "rgba(255,255,255,0.35)",
    textAlign: "center",
  },
});
