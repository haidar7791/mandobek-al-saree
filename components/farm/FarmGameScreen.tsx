import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserProfile } from "@/lib/db_logic";
import FarmScene from "./FarmScene";
import {
  CROPS,
  CROP_ORDER,
  FARM_PLOT_COUNT,
  FIRST_PLOT_EXPANSION_COST,
  INITIAL_UNLOCKED_PLOTS,
  WATER_CAPACITY,
  applyFarmActionToState,
  createDemoFarmGame,
  getFarmHouseActionCost,
  getCurrentWater,
  getPlotGrowthState,
  getWaterRefillMs,
  loadFarmGame,
  performFarmAction,
  type CropId,
  type FarmAction,
  type FarmGameSave,
  type FarmPlot,
} from "@/lib/farm-game";

const C = {
  ink: "#173D2B",
  muted: "#67816E",
  green: "#33834F",
  greenDark: "#205D3A",
  greenLight: "#E9F5E6",
  canvas: "#F3F8EC",
  paper: "#FFFFFF",
  gold: "#E7B943",
  soil: "#9C653D",
  soilDark: "#74482D",
  border: "#E1EBDD",
  red: "#C05A46",
};

function formatCoins(value: number): string {
  return new Intl.NumberFormat("ar-IQ", { maximumFractionDigits: 0 }).format(value);
}

function formatTime(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  if (seconds < 60) return `${seconds} ث`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function getUnlockCost(farm: FarmGameSave): number {
  const unlockedCount = farm.plots.filter((plot) => plot.unlocked).length;
  return FIRST_PLOT_EXPANSION_COST + Math.max(0, unlockedCount - INITIAL_UNLOCKED_PLOTS) * 35;
}

function getPlotTiming(plot: FarmPlot, now: number) {
  return getPlotGrowthState(plot, now);
}

function FarmActionButton({
  label,
  icon,
  onPress,
  disabled,
  variant = "green",
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  variant?: "green" | "gold" | "quiet";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        variant === "green" && styles.actionButtonGreen,
        variant === "gold" && styles.actionButtonGold,
        variant === "quiet" && styles.actionButtonQuiet,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Ionicons
        name={icon}
        size={17}
        color={variant === "quiet" ? C.greenDark : "#FFFFFF"}
      />
      <Text
        style={[
          styles.actionButtonText,
          variant === "quiet" && styles.actionButtonTextQuiet,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function PlotTile({
  plot,
  now,
  selectedCrop,
  seedCount,
  expansionCost,
  toolMode,
  busy,
  onPress,
}: {
  plot: FarmPlot;
  now: number;
  selectedCrop: CropId;
  seedCount: number;
  expansionCost: number;
  toolMode: "plant" | "water";
  busy: boolean;
  onPress: () => void;
}) {
  const timing = getPlotTiming(plot, now);
  const crop = plot.cropId ? CROPS[plot.cropId] : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        !plot.unlocked
          ? `فتح أرض جديدة مقابل ${expansionCost} عملة`
          : crop
            ? toolMode === "water"
              ? `سقي ${crop.name}`
              : timing.ready
                ? `حصاد ${crop.name}`
                : `${crop.name}، ${timing.watered ? "تنمو" : "بحاجة إلى الري"}`
            : toolMode === "water"
              ? "لا يوجد محصول للسقي"
              : `زراعة ${CROPS[selectedCrop].name}`
      }
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.plotTile,
        !plot.unlocked && styles.lockedPlot,
        timing.ready && styles.readyPlot,
        toolMode === "water" && crop && !timing.ready && styles.waterTargetPlot,
        pressed && !busy && styles.plotPressed,
      ]}
    >
      {!plot.unlocked ? (
        <>
          <View style={styles.lockIconCircle}>
            <Ionicons name="lock-closed-outline" size={20} color="#8B846A" />
          </View>
          <Text style={styles.lockedTitle}>أرض جديدة</Text>
          <Text style={styles.lockedCost}>{formatCoins(expansionCost)} عملة</Text>
        </>
      ) : crop ? (
        <>
          <View style={[styles.cropBadge, { backgroundColor: crop.lightColor }]}>
            <Ionicons
              name={
                timing.ready
                  ? "sparkles-outline"
                  : timing.progress === 0
                    ? "ellipse-outline"
                    : "leaf"
              }
              size={22}
              color={crop.color}
            />
          </View>
          <Text style={styles.plotCropName}>{crop.name}</Text>
          {timing.ready ? (
            <Text style={styles.readyLabel}>جاهز للحصاد</Text>
          ) : (
            <>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.max(6, timing.progress * 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.plotTimer}>
                {timing.progress === 0
                  ? timing.watered
                    ? "بذور مروية"
                    : "بذور"
                  : timing.watered
                    ? `تنمو · ${formatTime(timing.remaining)}`
                    : `جافة · اسقِ لتواصل`}
              </Text>
            </>
          )}
        </>
      ) : (
        <>
          <View style={styles.soilMark}>
            <Ionicons name="add" size={25} color="#FFF6DF" />
          </View>
          <Text style={styles.emptyPlotTitle}>ازرع هنا</Text>
          <Text style={styles.emptyPlotSub}>
            {seedCount > 0 ? CROPS[selectedCrop].name : "لا توجد بذور"}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export default function FarmGameScreen({ previewMode = false }: { previewMode?: boolean }) {
  const insets = useSafeAreaInsets();
  const player = auth.currentUser;
  const [farm, setFarm] = useState<FarmGameSave | null>(null);
  const [selectedCrop, setSelectedCrop] = useState<CropId>("wheat");
  const [toolMode, setToolMode] = useState<"plant" | "water">("plant");
  const [playerName, setPlayerName] = useState("المزارع");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [now, setNow] = useState(Date.now());

  const playerId = player?.uid ?? "";
  const unlockedCount = useMemo(
    () => farm?.plots.filter((plot) => plot.unlocked).length ?? 0,
    [farm],
  );
  const level = farm ? Math.floor(farm.totalHarvests / 5) + 1 : 1;
  const levelProgress = farm ? (farm.totalHarvests % 5) / 5 : 0;
  const waterCount = farm ? getCurrentWater(farm, now) : 0;
  const waterRefill = farm ? getWaterRefillMs(farm, now) : 0;

  const refreshFarm = useCallback(async () => {
    if (previewMode) {
      setFarm(createDemoFarmGame());
      setPlayerName("زائر المزرعة");
      setError("");
      setLoading(false);
      return;
    }
    if (!playerId) {
      setError("سجّل الدخول أولاً لفتح مزرعتك.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [save, profile] = await Promise.all([
        loadFarmGame(playerId),
        getUserProfile(playerId).catch(() => null),
      ]);
      setFarm(save);
      setPlayerName(profile?.name?.trim() || player?.displayName?.trim() || "المزارع");
    } catch (loadError) {
      console.error("Could not load farm:", loadError);
      setError("تعذّر تحميل المزرعة. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setLoading(false);
    }
  }, [playerId, player?.displayName, previewMode]);

  useEffect(() => {
    void refreshFarm();
  }, [refreshFarm]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const act = useCallback(
    async (action: FarmAction) => {
      if (busy || (!previewMode && !playerId) || (previewMode && !farm)) return;
      setBusy(true);
      setError("");
      setHint("");
      try {
        const updated = previewMode
          ? applyFarmActionToState(farm!, action)
          : await performFarmAction(playerId, action);
        setFarm(updated);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } catch (actionError) {
        const message =
          actionError instanceof Error
            ? actionError.message
            : "تعذّر تنفيذ الحركة. حاول مرة أخرى.";
        setHint(message);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      } finally {
        setBusy(false);
      }
    },
    [busy, farm, playerId, previewMode],
  );

  const handlePlotPress = (plot: FarmPlot) => {
    if (!farm) return;
    if (!plot.unlocked) {
      void act({ type: "unlockPlot", plotId: plot.id });
      return;
    }
    if (toolMode === "water") {
      if (!plot.cropId) {
        setHint("اختر حقلاً مزروعاً لاستخدام أداة الري.");
      } else {
        const timing = getPlotTiming(plot, now);
        if (timing.ready) {
          setHint("المحصول جاهز للحصاد ولا يحتاج إلى الري.");
        } else if (timing.watered) {
          setHint("هذا الحقل رُوي بالفعل؛ سيواصل النمو حتى ينفد الماء.");
        } else {
          void act({ type: "waterPlot", plotId: plot.id });
        }
      }
      return;
    }
    if (plot.cropId) {
      const timing = getPlotTiming(plot, now);
      if (timing.ready) {
        void act({ type: "harvest", plotId: plot.id });
      } else if (!timing.watered) {
        setHint(`توقف نمو ${CROPS[plot.cropId].name}. اختر أداة الري ليستمر نموه.`);
      } else {
        setHint(`ينمو ${CROPS[plot.cropId].name}. تبقى ${formatTime(timing.remaining)} من وقت النمو.`);
      }
      return;
    }
    if (farm.seeds[selectedCrop] < 1) {
      setHint(`لا توجد بذور ${CROPS[selectedCrop].name}. اشترِ بذوراً من السوق أدناه.`);
      return;
    }
    void act({ type: "plant", plotId: plot.id, cropId: selectedCrop });
  };

  if (loading && !farm) {
    return (
      <View style={[styles.loadingPage, { paddingTop: insets.top }]}>
        <View style={styles.loadingIcon}>
          <Ionicons name="leaf" size={30} color={C.green} />
        </View>
        <ActivityIndicator color={C.green} size="large" />
        <Text style={styles.loadingText}>نجهّز مزرعتك...</Text>
      </View>
    );
  }

  if (!farm) {
    return (
      <View style={[styles.loadingPage, { paddingTop: insets.top }]}>
        <View style={styles.errorIcon}>
          <Ionicons name="cloud-offline-outline" size={30} color={C.red} />
        </View>
        <Text style={styles.errorTitle}>تعذّر فتح المزرعة</Text>
        <Text style={styles.errorCopy}>{error || "تحقق من تسجيل الدخول والاتصال."}</Text>
        <FarmActionButton
          label="إعادة المحاولة"
          icon="refresh-outline"
          onPress={() => void refreshFarm()}
        />
      </View>
    );
  }

  const expansionCost = getUnlockCost(farm);
  const houseActionCost = getFarmHouseActionCost(farm.houseLevel);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 28 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refreshFarm()}
            tintColor={C.green}
          />
        }
      >
        {previewMode ? (
          <View style={styles.previewBanner}>
            <Ionicons name="eye-outline" size={17} color={C.greenDark} />
            <Text style={styles.previewBannerText}>
              معاينة تفاعلية ببيانات تجريبية — التغييرات هنا لا تُحفظ
            </Text>
          </View>
        ) : null}
        <LinearGradient
          colors={["#BFE5A9", "#E7F1B8", "#F5EDBC"]}
          style={styles.hero}
        >
          <View style={styles.heroSun} />
          <View style={styles.hillBack} />
          <View style={styles.hillFront} />
          <View style={styles.heroTopRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={previewMode ? "العودة إلى تسجيل الدخول" : "تسجيل الخروج"}
              onPress={() => {
                if (previewMode) {
                  router.replace("/?showLogin=1" as any);
                  return;
                }
                void signOut(auth).catch(() => {
                  setHint("تعذّر تسجيل الخروج. حاول مرة أخرى.");
                });
              }}
              style={styles.avatar}
            >
              <Ionicons
                name={previewMode ? "close-outline" : "log-out-outline"}
                size={21}
                color={C.greenDark}
              />
            </Pressable>
            <View style={styles.heroGreeting}>
              <Text style={styles.heroEyebrow}>مزرعتك الصغيرة</Text>
              <Text numberOfLines={1} style={styles.heroName}>
                أهلاً، {playerName}
              </Text>
            </View>
            <View style={styles.coinPill}>
              <Ionicons name="cash" size={17} color="#865B11" />
              <Text style={styles.coinPillText}>{formatCoins(farm.coins)}</Text>
            </View>
          </View>

          <View style={styles.heroMessage}>
            <Text style={styles.heroTitle}>ازرعها اليوم، واحصدها قريباً</Text>
            <Text style={styles.heroDescription}>
              كل محصول جديد يقرّب مزرعتك من المستوى التالي.
            </Text>
          </View>

          <View style={styles.heroGround}>
            <View style={styles.heroRow}>
              <View style={styles.tinyCrop}>
                <View style={styles.tinyStem} />
                <View style={[styles.tinyLeaf, styles.tinyLeafLeft]} />
                <View style={[styles.tinyLeaf, styles.tinyLeafRight]} />
              </View>
              <View style={[styles.tinyCrop, styles.tinyCropTwo]}>
                <View style={styles.tinyStem} />
                <View style={[styles.tinyLeaf, styles.tinyLeafLeft]} />
                <View style={[styles.tinyLeaf, styles.tinyLeafRight]} />
              </View>
              <View style={[styles.tinyCrop, styles.tinyCropThree]}>
                <View style={styles.tinyStem} />
                <View style={[styles.tinyLeaf, styles.tinyLeafLeft]} />
                <View style={[styles.tinyLeaf, styles.tinyLeafRight]} />
              </View>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.levelCard}>
          <View style={styles.levelTop}>
            <View style={styles.levelBadge}>
              <Ionicons name="ribbon-outline" size={18} color="#9A701D" />
              <Text style={styles.levelBadgeText}>المستوى {level}</Text>
            </View>
            <Text style={styles.levelHint}>{5 - (farm.totalHarvests % 5)} حصادات للمستوى التالي</Text>
          </View>
          <View style={styles.levelTrack}>
            <View style={[styles.levelFill, { width: `${Math.max(levelProgress * 100, 4)}%` }]} />
          </View>
          <View style={styles.statRow}>
            <StatItem icon="leaf-outline" value={String(farm.totalHarvests)} label="حصاد" />
            <View style={styles.statDivider} />
            <StatItem icon="grid-outline" value={`${unlockedCount}/${FARM_PLOT_COUNT}`} label="أرض مفتوحة" />
            <View style={styles.statDivider} />
            <StatItem icon="basket-outline" value={String(Object.values(farm.inventory).reduce((sum, n) => sum + n, 0))} label="في المخزن" />
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>أرض المزرعة</Text>
            <Text style={styles.sectionSubtitle}>
              {toolMode === "water"
                ? "اضغط على محصول جاف ليسقيه الماء"
                : `اختر بذرة ${CROPS[selectedCrop].name} للزراعة؛ اسقِ محصولك ليستمر في النمو`}
            </Text>
          </View>
          <View style={styles.sunTag}>
            <Ionicons name="sunny-outline" size={16} color="#A4741C" />
            <Text style={styles.sunTagText}>طقس مناسب</Text>
          </View>
        </View>

        <LinearGradient colors={["#D5E9B9", "#C7DFAB"]} style={styles.farmBoard}>
          <View style={styles.boardTop}>
            <View style={styles.boardLabel}>
              <Ionicons name="leaf" size={17} color={C.greenDark} />
              <Text style={styles.boardLabelText}>حقولك</Text>
            </View>
            <Text style={styles.boardCount}>{unlockedCount} قطع أرض مفتوحة</Text>
          </View>

          <View style={styles.housePanel}>
            <View style={styles.houseIcon}>
              <Ionicons
                name={farm.houseBuilt ? "home" : "home-outline"}
                size={22}
                color={farm.houseBuilt ? C.greenDark : "#8B633D"}
              />
            </View>
            <View style={styles.houseInfo}>
              <Text style={styles.houseTitle}>منزل المزرعة</Text>
              <Text style={styles.houseSubtitle}>
                {farm.houseBuilt
                  ? `المستوى ${farm.houseLevel} · طوّر مظهر منزلك`
                  : "ابنِ منزلك ليكتمل مركز المزرعة"}
              </Text>
            </View>
            {houseActionCost === null ? (
              <Text style={styles.houseBuiltTag}>المستوى الأعلى</Text>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${farm.houseBuilt ? "تطوير" : "بناء"} المنزل مقابل ${houseActionCost} عملة`}
                onPress={() => void act({ type: farm.houseBuilt ? "upgradeHouse" : "buildHouse" })}
                disabled={busy}
                style={({ pressed }) => [
                  styles.buildHouseButton,
                  busy && styles.disabledButton,
                  pressed && !busy && styles.pressed,
                ]}
              >
                <Ionicons
                  name={farm.houseBuilt ? "sparkles-outline" : "hammer-outline"}
                  size={15}
                  color="#FFFFFF"
                />
                <Text style={styles.buildHouseText}>
                  {farm.houseBuilt ? "تطوير" : "بناء"} · {formatCoins(houseActionCost)}
                </Text>
              </Pressable>
            )}
          </View>

          <View style={styles.toolPanel}>
            <View style={styles.waterDetails}>
              <View style={styles.waterIcon}>
                <Ionicons name="water" size={19} color="#287BA1" />
              </View>
              <View style={styles.waterCopy}>
                <Text style={styles.waterCount}>
                  الماء {waterCount}/{WATER_CAPACITY}
                </Text>
                <Text style={styles.waterRefill}>
                  {waterCount >= WATER_CAPACITY
                    ? "الخزان ممتلئ"
                    : `قطرة جديدة خلال ${formatTime(waterRefill)}`}
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: toolMode === "water" }}
              onPress={() => {
                setToolMode((current) => (current === "water" ? "plant" : "water"));
                setHint(
                  toolMode === "water"
                    ? `تم اختيار بذور ${CROPS[selectedCrop].name}.`
                    : "أداة الري جاهزة؛ اضغط على محصول جاف.",
                );
              }}
              style={({ pressed }) => [
                styles.waterToolButton,
                toolMode === "water" && styles.waterToolButtonActive,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name={toolMode === "water" ? "checkmark-circle" : "water-outline"}
                size={17}
                color={toolMode === "water" ? "#FFFFFF" : "#287BA1"}
              />
              <Text
                style={[
                  styles.waterToolText,
                  toolMode === "water" && styles.waterToolTextActive,
                ]}
              >
                {toolMode === "water" ? "الري محدد" : "أداة الري"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.farmSceneViewport}>
            <FarmScene
              plots={farm.plots}
              selectedCrop={selectedCrop}
              toolMode={toolMode}
              expansionCost={expansionCost}
              houseBuilt={farm.houseBuilt}
              houseLevel={farm.houseLevel}
              now={now}
              onPlotPress={handlePlotPress}
            />
          </View>
          <View style={styles.sceneGestureHint}>
            <Ionicons name="hand-left-outline" size={14} color="#55764A" />
            <Text style={styles.sceneGestureText}>
              اسحب لتحريك المزرعة، وقرّب بإصبعين أو بعجلة الفأرة
            </Text>
          </View>
        </LinearGradient>

        {hint ? (
          <View style={styles.hintBox}>
            <Ionicons name="information-circle-outline" size={18} color={C.greenDark} />
            <Text style={styles.hintText}>{hint}</Text>
            <Pressable onPress={() => setHint("")} hitSlop={8}>
              <Ionicons name="close" size={17} color={C.muted} />
            </Pressable>
          </View>
        ) : null}
        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={18} color={C.red} />
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>اختر البذور</Text>
            <Text style={styles.sectionSubtitle}>الرصيد يحفظ تلقائياً مع حسابك</Text>
          </View>
          <Ionicons name="water-outline" size={22} color={C.green} />
        </View>

        <View style={styles.cropList}>
          {CROP_ORDER.map((cropId) => {
            const crop = CROPS[cropId];
            const selected = selectedCrop === cropId;
            return (
              <Pressable
                key={cropId}
                onPress={() => {
                  setSelectedCrop(cropId);
                  setToolMode("plant");
                  setHint(`تم اختيار بذور ${crop.name}. اضغط على قطعة أرض فارغة لزراعتها.`);
                }}
                style={({ pressed }) => [
                  styles.cropCard,
                  selected && styles.cropCardSelected,
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.cropCardGlyph, { backgroundColor: crop.lightColor }]}>
                  <Ionicons name="leaf" size={21} color={crop.color} />
                </View>
                <View style={styles.cropInfo}>
                  <Text style={styles.cropName}>{crop.name}</Text>
                  <Text style={styles.cropMeta}>
                    ينمو خلال {formatTime(crop.growMs)} · حصاد {crop.harvestAmount}
                  </Text>
                  <Text style={styles.seedAmount}>بذورك: {farm.seeds[cropId]}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`شراء بذرة ${crop.name} مقابل ${crop.seedPrice} عملات`}
                  onPress={() => void act({ type: "buySeed", cropId })}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.buySeedButton,
                    pressed && !busy && styles.pressed,
                    busy && styles.disabledButton,
                  ]}
                >
                  <Ionicons name="add" size={17} color="#FFFFFF" />
                  <Text style={styles.buySeedText}>{crop.seedPrice}</Text>
                </Pressable>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>مخزن المحاصيل</Text>
            <Text style={styles.sectionSubtitle}>حوّل حصادك إلى عملات لتوسيع المزرعة</Text>
          </View>
          <Ionicons name="file-tray-stacked-outline" size={22} color={C.green} />
        </View>

        <View style={styles.storageCard}>
          {CROP_ORDER.map((cropId, index) => {
            const crop = CROPS[cropId];
            const amount = farm.inventory[cropId];
            return (
              <View
                key={cropId}
                style={[
                  styles.storageRow,
                  index < CROP_ORDER.length - 1 && styles.storageRowBorder,
                ]}
              >
                <View style={[styles.storageGlyph, { backgroundColor: crop.lightColor }]}>
                  <Ionicons name="leaf" size={17} color={crop.color} />
                </View>
                <View style={styles.storageInfo}>
                  <Text style={styles.storageName}>{crop.name}</Text>
                  <Text style={styles.storagePrice}>{crop.sellPrice} عملات للحبة</Text>
                </View>
                <Text style={styles.storageCount}>× {amount}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void act({ type: "sellCrop", cropId })}
                  disabled={busy || amount < 1}
                  style={({ pressed }) => [
                    styles.sellButton,
                    (busy || amount < 1) && styles.sellButtonDisabled,
                    pressed && amount > 0 && !busy && styles.pressed,
                  ]}
                >
                  <Text style={styles.sellButtonText}>بيع</Text>
                </Pressable>
              </View>
            );
          })}
          {Object.values(farm.inventory).every((amount) => amount === 0) ? (
            <View style={styles.emptyStorage}>
              <Text style={styles.emptyStorageText}>احصد أول محصول ليظهر هنا.</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.footerNote}>
          <Ionicons
            name={previewMode ? "leaf-outline" : "cloud-done-outline"}
            size={16}
            color={C.muted}
          />
          <Text style={styles.footerNoteText}>
            {previewMode
              ? "هذه تجربة فقط؛ سجل الدخول لحفظ مزرعتك في Firebase"
              : "تقدمك محفوظ في حساب Firebase الخاص بك"}
          </Text>
        </View>
      </ScrollView>
      {busy ? (
        <View pointerEvents="none" style={styles.savingPill}>
          <ActivityIndicator size="small" color="#FFFFFF" />
          <Text style={styles.savingText}>جارٍ حفظ المزرعة</Text>
        </View>
      ) : null}
    </View>
  );
}

function StatItem({
  icon,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.statItem}>
      <Ionicons name={icon} size={17} color={C.green} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.canvas },
  scrollContent: { paddingHorizontal: 18, gap: 20 },
  loadingPage: {
    flex: 1,
    backgroundColor: C.canvas,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
    gap: 16,
  },
  loadingIcon: {
    width: 66,
    height: 66,
    borderRadius: 23,
    backgroundColor: "#DDEFD5",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: { color: C.greenDark, fontSize: 16, fontWeight: "700" },
  errorIcon: {
    width: 62,
    height: 62,
    borderRadius: 22,
    backgroundColor: "#F8E7E2",
    alignItems: "center",
    justifyContent: "center",
  },
  errorTitle: { color: C.ink, fontSize: 19, fontWeight: "800", textAlign: "center" },
  errorCopy: { color: C.muted, fontSize: 14, lineHeight: 22, textAlign: "center" },
  hero: {
    minHeight: 220,
    borderRadius: 28,
    overflow: "hidden",
    padding: 18,
    justifyContent: "space-between",
  },
  heroSun: {
    position: "absolute",
    width: 70,
    height: 70,
    borderRadius: 35,
    top: 40,
    right: 24,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  hillBack: {
    position: "absolute",
    width: 280,
    height: 130,
    borderRadius: 100,
    bottom: 25,
    left: -88,
    backgroundColor: "rgba(108,171,105,0.24)",
  },
  hillFront: {
    position: "absolute",
    width: 310,
    height: 126,
    borderRadius: 100,
    bottom: 0,
    right: -105,
    backgroundColor: "rgba(93,156,86,0.26)",
  },
  heroTopRow: { flexDirection: "row", alignItems: "center", gap: 10, zIndex: 2 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  heroGreeting: { flex: 1, minWidth: 0 },
  heroEyebrow: { color: "#51795A", fontSize: 11, fontWeight: "700" },
  heroName: { color: C.ink, fontSize: 15, fontWeight: "800", marginTop: 2 },
  coinPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.8)",
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 18,
  },
  coinPillText: { color: "#744E10", fontSize: 13, fontWeight: "800" },
  heroMessage: { zIndex: 2, marginTop: 22, alignItems: "flex-start" },
  heroTitle: { color: C.ink, fontSize: 20, fontWeight: "900" },
  heroDescription: { color: "#4F7652", fontSize: 12, fontWeight: "600", marginTop: 5 },
  heroGround: {
    position: "absolute",
    bottom: -5,
    left: 0,
    right: 0,
    height: 34,
    backgroundColor: "rgba(86,142,70,0.3)",
  },
  heroRow: { flexDirection: "row", justifyContent: "space-evenly", marginTop: -18 },
  tinyCrop: { width: 20, height: 38, alignItems: "center", justifyContent: "flex-end" },
  tinyCropTwo: { height: 44 },
  tinyCropThree: { height: 33 },
  tinyStem: { width: 3, height: 24, borderRadius: 2, backgroundColor: "#43834B" },
  tinyLeaf: { position: "absolute", width: 12, height: 7, borderRadius: 8, backgroundColor: "#5E9E5E" },
  tinyLeafLeft: { left: 0, bottom: 13, transform: [{ rotate: "-28deg" }] },
  tinyLeafRight: { right: 0, bottom: 20, transform: [{ rotate: "28deg" }] },
  levelCard: {
    backgroundColor: C.paper,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  levelTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FBF1D6",
    borderRadius: 13,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  levelBadgeText: { color: "#87631B", fontSize: 12, fontWeight: "800" },
  levelHint: { color: C.muted, fontSize: 11, fontWeight: "600" },
  levelTrack: { height: 7, borderRadius: 5, backgroundColor: "#EDF1E7", marginTop: 13, overflow: "hidden" },
  levelFill: { height: "100%", borderRadius: 5, backgroundColor: C.gold },
  statRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", marginTop: 15 },
  statItem: { alignItems: "center", minWidth: 72, gap: 3 },
  statValue: { color: C.ink, fontSize: 15, fontWeight: "900" },
  statLabel: { color: C.muted, fontSize: 10, fontWeight: "600" },
  statDivider: { width: 1, height: 34, backgroundColor: C.border },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  sectionTitle: { color: C.ink, fontSize: 18, fontWeight: "900" },
  sectionSubtitle: { color: C.muted, fontSize: 11, marginTop: 4, fontWeight: "600" },
  sunTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFF5D9",
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  sunTagText: { color: "#8D6A26", fontSize: 10, fontWeight: "800" },
  farmBoard: { borderRadius: 25, padding: 14, borderWidth: 1, borderColor: "#B6D59F" },
  boardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 13 },
  boardLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  boardLabelText: { color: C.greenDark, fontSize: 14, fontWeight: "900" },
  boardCount: { color: "#5E805A", fontSize: 10, fontWeight: "700" },
  housePanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "rgba(255,255,255,0.76)",
    borderWidth: 1,
    borderColor: "rgba(115,145,94,0.24)",
    borderRadius: 16,
    padding: 9,
    marginBottom: 10,
  },
  houseIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5EBD6",
  },
  houseInfo: { flex: 1, minWidth: 0 },
  houseTitle: { color: C.ink, fontSize: 11, fontWeight: "900" },
  houseSubtitle: { color: C.muted, fontSize: 9, marginTop: 3 },
  buildHouseButton: {
    minWidth: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 8,
    borderRadius: 11,
    backgroundColor: "#98633D",
  },
  buildHouseText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  houseBuiltTag: {
    color: C.greenDark,
    backgroundColor: "#DFEFD7",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 9,
    fontWeight: "900",
  },
  toolPanel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    backgroundColor: "#E8F4F7",
    borderWidth: 1,
    borderColor: "#C8E2E9",
    borderRadius: 16,
    padding: 8,
    marginBottom: 10,
  },
  waterDetails: { flex: 1, flexDirection: "row", alignItems: "center", gap: 7 },
  waterIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#D3EAF1",
  },
  waterCopy: { flex: 1, minWidth: 0 },
  waterCount: { color: "#245D75", fontSize: 10, fontWeight: "900" },
  waterRefill: { color: "#5D7C88", fontSize: 8, marginTop: 2 },
  waterToolButton: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#B9D9E3",
    borderRadius: 12,
    paddingHorizontal: 9,
  },
  waterToolButtonActive: { backgroundColor: "#287BA1", borderColor: "#287BA1" },
  waterToolText: { color: "#287BA1", fontSize: 9, fontWeight: "900" },
  waterToolTextActive: { color: "#FFFFFF" },
  farmSceneViewport: {
    height: 390,
    width: "100%",
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#B9D991",
    borderWidth: 1,
    borderColor: "rgba(75,112,60,0.25)",
  },
  sceneGestureHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 9,
  },
  sceneGestureText: { color: "#55764A", fontSize: 10, fontWeight: "700" },
  plotTile: {
    width: "31.5%",
    minHeight: 116,
    borderRadius: 18,
    backgroundColor: C.soil,
    borderWidth: 2,
    borderColor: "#8B5938",
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    overflow: "hidden",
  },
  lockedPlot: { backgroundColor: "#E9E5D6", borderColor: "#D5D0BE" },
  waterTargetPlot: { borderColor: "#4D9DB9" },
  readyPlot: { backgroundColor: "#FFF8DF", borderColor: "#E6C45E" },
  plotPressed: { transform: [{ scale: 0.97 }] },
  lockIconCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#DCD7C8", alignItems: "center", justifyContent: "center" },
  lockedTitle: { color: "#756F5D", fontSize: 10, fontWeight: "800", marginTop: 6 },
  lockedCost: { color: "#8B7341", fontSize: 9, fontWeight: "700", marginTop: 3 },
  cropBadge: { width: 40, height: 40, borderRadius: 15, alignItems: "center", justifyContent: "center", marginBottom: 5 },
  plotCropName: { color: C.ink, fontSize: 11, fontWeight: "900" },
  readyLabel: { color: "#8A6719", fontSize: 9, fontWeight: "900", marginTop: 3 },
  progressTrack: { width: "86%", height: 5, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.5)", marginTop: 6, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#62A45C", borderRadius: 4 },
  plotTimer: { color: "#FFF8E9", fontSize: 9, fontWeight: "800", marginTop: 3 },
  soilMark: { width: 38, height: 38, borderRadius: 14, backgroundColor: "rgba(79,47,27,0.28)", alignItems: "center", justifyContent: "center" },
  emptyPlotTitle: { color: "#FFF9E9", fontSize: 10, fontWeight: "900", marginTop: 5 },
  emptyPlotSub: { color: "#F4D9AD", fontSize: 9, fontWeight: "700", marginTop: 2 },
  hintBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#E4F1DE", padding: 11, borderRadius: 14 },
  hintText: { flex: 1, color: C.greenDark, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FBE9E4", padding: 11, borderRadius: 14 },
  errorBannerText: { flex: 1, color: C.red, fontSize: 12, fontWeight: "700" },
  cropList: { gap: 9 },
  cropCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: C.paper,
    padding: 11,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
  },
  cropCardSelected: { borderColor: "#77AF68", backgroundColor: "#F4FAEF" },
  cropCardGlyph: { width: 43, height: 43, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  cropInfo: { flex: 1, minWidth: 0 },
  cropName: { color: C.ink, fontSize: 13, fontWeight: "900" },
  cropMeta: { color: C.muted, fontSize: 9, marginTop: 3 },
  seedAmount: { color: C.green, fontSize: 10, fontWeight: "800", marginTop: 3 },
  buySeedButton: {
    minWidth: 54,
    height: 37,
    borderRadius: 12,
    backgroundColor: C.green,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 8,
  },
  buySeedText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  storageCard: { backgroundColor: C.paper, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingHorizontal: 13 },
  storageRow: { minHeight: 61, flexDirection: "row", alignItems: "center", gap: 9 },
  storageRowBorder: { borderBottomWidth: 1, borderBottomColor: "#EDF1E8" },
  storageGlyph: { width: 35, height: 35, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  storageInfo: { flex: 1 },
  storageName: { color: C.ink, fontSize: 12, fontWeight: "800" },
  storagePrice: { color: C.muted, fontSize: 9, marginTop: 2 },
  storageCount: { color: C.ink, fontSize: 12, fontWeight: "800", minWidth: 38, textAlign: "center" },
  sellButton: { minWidth: 48, alignItems: "center", justifyContent: "center", borderRadius: 11, paddingVertical: 8, backgroundColor: "#E7F2E2" },
  sellButtonDisabled: { backgroundColor: "#F1F3EF", opacity: 0.65 },
  sellButtonText: { color: C.greenDark, fontSize: 10, fontWeight: "900" },
  emptyStorage: { alignItems: "center", paddingVertical: 14 },
  emptyStorageText: { color: C.muted, fontSize: 11, fontWeight: "600" },
  footerNote: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingTop: 2 },
  footerNoteText: { color: C.muted, fontSize: 10, fontWeight: "600" },
  previewBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "#DDEFD5",
    borderColor: "#BFD9B3",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  previewBannerText: { color: C.greenDark, fontSize: 10, fontWeight: "800", textAlign: "center", flexShrink: 1 },
  savingPill: {
    position: "absolute",
    bottom: 18,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.greenDark,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    elevation: 5,
  },
  savingText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  actionButton: { minHeight: 44, paddingHorizontal: 17, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  actionButtonGreen: { backgroundColor: C.green },
  actionButtonGold: { backgroundColor: "#C9972C" },
  actionButtonQuiet: { backgroundColor: "#E6F1E1" },
  actionButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  actionButtonTextQuiet: { color: C.greenDark },
  disabledButton: { opacity: 0.55 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
