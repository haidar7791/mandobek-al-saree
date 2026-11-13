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
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserProfile } from "@/lib/db_logic";
import FarmScene from "./FarmScene";
import {
  CROPS,
  CROP_ORDER,
  DECORATIONS,
  DECORATION_ORDER,
  FARM_MAP_COLUMNS,
  FARM_MAP_ROWS,
  FRUIT_TREES,
  FRUIT_TREE_ORDER,
  applyFarmActionToState,
  createDemoFarmGame,
  getPlotGrowthState,
  getTreeGrowthState,
  type CropId,
  type FarmAction,
  type FarmGameSave,
  type FarmObjectRef,
  type FarmPosition,
  type FarmTool,
} from "@/lib/farm-game";
import { loadFarmGame, performFarmAction } from "@/lib/farm-game-persistence";

const C = {
  ink: "#28432B",
  muted: "#738571",
  green: "#4F8B4D",
  greenDark: "#315F3A",
  greenLight: "#EAF5E5",
  canvas: "#F3F7E9",
  paper: "#FFFFFF",
  gold: "#E7B943",
  soil: "#96603D",
  border: "#DDE8D5",
  red: "#C05A46",
};

const TOOLS: { id: FarmTool; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "walk", label: "تحرّك", icon: "walk-outline" },
  { id: "plant", label: "ازرع", icon: "leaf-outline" },
  { id: "move", label: "حرّك عنصراً", icon: "move-outline" },
  { id: "buildHouse", label: "ابنِ المنزل", icon: "home-outline" },
  { id: "apple", label: "تفاح", icon: "nutrition-outline" },
  { id: "orange", label: "برتقال", icon: "nutrition-outline" },
  { id: "flowerBed", label: "زهور", icon: "flower-outline" },
  { id: "gardenLamp", label: "مصباح", icon: "bulb-outline" },
  { id: "fence", label: "سياج", icon: "grid-outline" },
];

function formatCoins(value: number): string {
  return new Intl.NumberFormat("ar-IQ", { maximumFractionDigits: 0 }).format(value);
}

function formatTime(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  if (seconds < 60) return `${seconds} ث`;
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return remain ? `${minutes} د ${remain} ث` : `${minutes} د`;
}

function toolDescription(tool: FarmTool, selectedCrop: CropId) {
  if (tool === "walk") return "اضغط على خانة فارغة أو استخدم الأسهم ليتحرك المزارع.";
  if (tool === "plant") return `ازرع ${CROPS[selectedCrop].name} في أي مكان فارغ على الأرض.`;
  if (tool === "move") return "اختر منزلاً أو حقلاً أو شجرة أو زينة، ثم اختر مكاناً فارغاً.";
  if (tool === "buildHouse") return "اختر خانة فارغة لوضع منزل المزرعة.";
  if (tool === "apple" || tool === "orange") return `اختر خانة فارغة لشراء ووضع ${FRUIT_TREES[tool].name}.`;
  return `اختر خانة فارغة لوضع ${DECORATIONS[tool].name}.`;
}

function objectName(object: FarmObjectRef | null): string {
  if (!object) return "";
  if (object.type === "house") return "منزل المزرعة";
  if (object.type === "plot") return "حقل";
  if (object.type === "tree") return "شجرة فاكهة";
  return "قطعة ديكور";
}

export default function FarmGameScreen({ previewMode = false }: { previewMode?: boolean }) {
  const insets = useSafeAreaInsets();
  const player = auth.currentUser;
  const [farm, setFarm] = useState<FarmGameSave | null>(null);
  const [selectedCrop, setSelectedCrop] = useState<CropId>("wheat");
  const [tool, setTool] = useState<FarmTool>("walk");
  const [selectedMoveObject, setSelectedMoveObject] = useState<FarmObjectRef | null>(null);
  const [playerName, setPlayerName] = useState("المزارع");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [now, setNow] = useState(Date.now());
  const playerId = player?.uid ?? "";

  const readyFields = useMemo(
    () => farm?.plots.filter((plot) => getPlotGrowthState(plot, now).ready).length ?? 0,
    [farm, now],
  );
  const readyTrees = useMemo(
    () => farm?.trees.filter((tree) => getTreeGrowthState(tree, now).ready).length ?? 0,
    [farm, now],
  );
  const level = farm ? Math.floor(farm.totalHarvests / 5) + 1 : 1;
  const totalStored = farm
    ? Object.values(farm.inventory).reduce((sum, amount) => sum + amount, 0)
      + Object.values(farm.fruitInventory).reduce((sum, amount) => sum + amount, 0)
    : 0;

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
      setError("تعذّر تحميل المزرعة. تحقق من الاتصال وقواعد Firestore ثم أعد المحاولة.");
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
      if (busy || !farm || (!previewMode && !playerId)) return false;
      setBusy(true);
      setError("");
      try {
        const updated = previewMode
          ? applyFarmActionToState(farm, action)
          : await performFarmAction(playerId, action);
        setFarm(updated);
        setHint("");
        return true;
      } catch (actionError) {
        setHint(actionError instanceof Error ? actionError.message : "تعذّر تنفيذ الحركة. حاول مرة أخرى.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, farm, playerId, previewMode],
  );

  const changeTool = (nextTool: FarmTool) => {
    if (nextTool === "buildHouse" && farm?.houseBuilt) {
      setTool("move");
      setSelectedMoveObject({ type: "house", id: "house" });
      setHint("المنزل مبني بالفعل. اختر خانة فارغة لنقله.");
      return;
    }
    setTool(nextTool);
    setSelectedMoveObject(null);
    setHint(toolDescription(nextTool, selectedCrop));
  };

  const handleTilePress = async (position: FarmPosition, object: FarmObjectRef | null) => {
    if (!farm || busy) return;

    if (tool === "move") {
      if (!selectedMoveObject) {
        if (!object) {
          setHint("اضغط أولاً على المنزل أو الحقل أو الشجرة أو الزينة التي تريد نقلها.");
        } else {
          setSelectedMoveObject(object);
          setHint(`تم اختيار ${objectName(object)}. اختر مكاناً فارغاً لنقله.`);
        }
        return;
      }
      const moving = selectedMoveObject;
      const moved = await act({
        type: "moveObjectTo",
        object: moving,
        x: position.x,
        y: position.y,
      });
      if (moved) {
        setSelectedMoveObject(null);
        setHint(`${objectName(moving)} انتقل إلى المكان الجديد.`);
      }
      return;
    }

    if (object?.type === "plot") {
      const plot = farm.plots.find((item) => item.id === object.id);
      if (!plot?.cropId) return;
      const growth = getPlotGrowthState(plot, now);
      if (growth.ready) {
        await act({ type: "harvestPlot", plotId: plot.id });
      } else {
        setHint(`ينمو ${CROPS[plot.cropId].name} الآن. سيصبح جاهزاً خلال ${formatTime(growth.remaining)}.`);
      }
      return;
    }
    if (object?.type === "tree") {
      const tree = farm.trees.find((item) => item.id === object.id);
      if (!tree) return;
      const growth = getTreeGrowthState(tree, now);
      if (growth.ready) {
        await act({ type: "harvestFruit", treeId: tree.id });
      } else {
        setHint(`ثمار ${FRUIT_TREES[tree.kind].fruitName} تنمو. ستجهز خلال ${formatTime(growth.remaining)}.`);
      }
      return;
    }

    if (object) {
      setHint("هذه الخانة مشغولة. اختر خانة خضراء فارغة.");
      return;
    }

    switch (tool) {
      case "walk":
        await act({ type: "movePlayerTo", x: position.x, y: position.y });
        break;
      case "plant":
        if (farm.seeds[selectedCrop] < 1) {
          setHint(`لا توجد بذور ${CROPS[selectedCrop].name}. اشترِ بذوراً من المتجر.`);
          return;
        }
        await act({ type: "plantAt", x: position.x, y: position.y, cropId: selectedCrop });
        break;
      case "buildHouse":
        await act({ type: "buildHouseAt", x: position.x, y: position.y });
        break;
      case "apple":
      case "orange":
        await act({ type: "buyTreeAt", treeId: tool, x: position.x, y: position.y });
        break;
      case "flowerBed":
      case "gardenLamp":
      case "fence":
        await act({ type: "buyDecorationAt", decorationId: tool, x: position.x, y: position.y });
        break;
    }
  };

  const movePlayer = (dx: number, dy: number) => {
    if (!farm) return;
    const x = farm.playerPosition.x + dx;
    const y = farm.playerPosition.y + dy;
    if (x < 0 || x >= FARM_MAP_COLUMNS || y < 0 || y >= FARM_MAP_ROWS) {
      setHint("وصلت إلى طرف أرض المزرعة.");
      return;
    }
    void act({ type: "movePlayerTo", x, y });
  };

  if (loading && !farm) {
    return (
      <View style={[styles.loadingPage, { paddingTop: insets.top }]}>
        <View style={styles.loadingIcon}><Ionicons name="leaf" size={30} color={C.green} /></View>
        <ActivityIndicator color={C.green} size="large" />
        <Text style={styles.loadingText}>نجهّز مزرعتك...</Text>
      </View>
    );
  }

  if (!farm) {
    return (
      <View style={[styles.loadingPage, { paddingTop: insets.top }]}>
        <View style={styles.errorIcon}><Ionicons name="cloud-offline-outline" size={30} color={C.red} /></View>
        <Text style={styles.errorTitle}>تعذّر فتح المزرعة</Text>
        <Text style={styles.errorCopy}>{error || "تحقق من تسجيل الدخول والاتصال."}</Text>
        <ActionButton label="إعادة المحاولة" icon="refresh-outline" onPress={() => void refreshFarm()} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 28 },
        ]}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void refreshFarm()} tintColor={C.green} />
        }
      >
        {previewMode ? (
          <View style={styles.previewBanner}>
            <Ionicons name="eye-outline" size={16} color={C.greenDark} />
            <Text style={styles.previewBannerText}>مزرعة تجريبية — التغييرات لا تُحفظ</Text>
          </View>
        ) : null}

        <LinearGradient colors={["#DFF1C7", "#F5E8B6"]} style={styles.header}>
          <View style={styles.headerTop}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={previewMode ? "العودة إلى تسجيل الدخول" : "تسجيل الخروج"}
              onPress={() => {
                if (previewMode) router.replace("/?showLogin=1" as any);
                else void signOut(auth);
              }}
              style={styles.headerIconButton}
            >
              <Ionicons name={previewMode ? "close-outline" : "log-out-outline"} size={19} color={C.greenDark} />
            </Pressable>
            <View style={styles.greeting}>
              <Text style={styles.eyebrow}>يوم جميل في المزرعة</Text>
              <Text numberOfLines={1} style={styles.title}>أهلاً، {playerName}</Text>
            </View>
            <View style={styles.coins}>
              <Ionicons name="cash" size={17} color="#986D1F" />
              <Text style={styles.coinText}>{formatCoins(farm.coins)}</Text>
            </View>
          </View>
          <View style={styles.headerBottom}>
            <View style={styles.levelPill}>
              <Ionicons name="ribbon-outline" size={16} color="#986D1F" />
              <Text style={styles.levelText}>المستوى {level}</Text>
            </View>
            <Text style={styles.headerPrompt}>ازرع، اجمع الثمار، وزيّن أرضك كما تحب</Text>
          </View>
        </LinearGradient>

        <View style={styles.statusStrip}>
          <StatusItem icon="leaf-outline" value={String(farm.plots.length)} label="حقول" />
          <StatusItem icon="sparkles-outline" value={String(readyFields + readyTrees)} label="جاهز للجمع" />
          <StatusItem icon="basket-outline" value={String(totalStored)} label="في المخزن" />
          <StatusItem icon="home-outline" value={farm.houseBuilt ? "موجود" : "قابل للبناء"} label="المنزل" />
        </View>

        <View style={styles.sectionHead}>
          <View>
            <Text style={styles.sectionTitle}>مزرعتك المفتوحة</Text>
            <Text style={styles.sectionSubtitle}>اسحب لاستكشاف الأرض، واضغط لاختيار مكانك</Text>
          </View>
          <View style={styles.sunBadge}><Ionicons name="sunny" size={16} color="#C28D2F" /></View>
        </View>

        <View style={styles.worldCard}>
          <FarmScene farm={farm} now={now} onTilePress={(position, object) => void handleTilePress(position, object)} />
          <View style={styles.worldFooter}>
            <Ionicons name="hand-left-outline" size={15} color={C.greenDark} />
            <Text style={styles.worldFooterText}>أرض واسعة {FARM_MAP_COLUMNS} × {FARM_MAP_ROWS} — حرّك المزارع بحرية</Text>
          </View>
        </View>

        <View style={styles.currentTool}>
          <View style={styles.toolHintIcon}>
            <Ionicons name={TOOLS.find((item) => item.id === tool)?.icon ?? "hand-left-outline"} size={18} color={C.greenDark} />
          </View>
          <View style={styles.toolHintCopy}>
            <Text style={styles.toolHintTitle}>{TOOLS.find((item) => item.id === tool)?.label}</Text>
            <Text style={styles.toolHintText}>
              {selectedMoveObject ? `اختر مكاناً جديداً لـ ${objectName(selectedMoveObject)}.` : toolDescription(tool, selectedCrop)}
            </Text>
          </View>
          {busy ? <ActivityIndicator size="small" color={C.green} /> : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolList}>
          {TOOLS.map((item) => {
            const active = tool === item.id;
            const disabled = item.id === "buildHouse" && farm.houseBuilt;
            const price =
              item.id === "apple" || item.id === "orange"
                ? FRUIT_TREES[item.id].price
                : item.id === "flowerBed" || item.id === "gardenLamp" || item.id === "fence"
                  ? DECORATIONS[item.id].price
                  : null;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => changeTool(item.id)}
                style={[styles.toolButton, active && styles.toolButtonActive, disabled && styles.toolButtonDimmed]}
              >
                <Ionicons name={item.icon} size={17} color={active ? "#FFFFFF" : C.greenDark} />
                <Text style={[styles.toolButtonText, active && styles.toolButtonTextActive]}>{item.label}</Text>
                {price !== null ? <Text style={[styles.toolPrice, active && styles.toolButtonTextActive]}>{price}</Text> : null}
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.movePadSection}>
          <View style={styles.sectionHeadCompact}>
            <Text style={styles.sectionTitleSmall}>تحكّم بحركة المزارع</Text>
            <Text style={styles.sectionSubtitle}>أو اختر وجهته مباشرة على الخريطة</Text>
          </View>
          <View style={styles.movePad}>
            <View style={styles.movePadSpacer} />
            <MoveButton icon="chevron-up" label="للأعلى" onPress={() => movePlayer(0, -1)} />
            <View style={styles.movePadSpacer} />
            <MoveButton icon="chevron-back" label="لليسار" onPress={() => movePlayer(-1, 0)} />
            <View style={styles.playerDot}><Ionicons name="person" size={15} color="#FFFFFF" /></View>
            <MoveButton icon="chevron-forward" label="لليمين" onPress={() => movePlayer(1, 0)} />
            <View style={styles.movePadSpacer} />
            <MoveButton icon="chevron-down" label="للأسفل" onPress={() => movePlayer(0, 1)} />
            <View style={styles.movePadSpacer} />
          </View>
        </View>

        <View style={styles.sectionHead}>
          <View>
            <Text style={styles.sectionTitle}>متجر البذور</Text>
            <Text style={styles.sectionSubtitle}>ازرع في أي خانة خضراء فارغة</Text>
          </View>
          <Ionicons name="leaf-outline" size={21} color={C.green} />
        </View>
        <View style={styles.shopList}>
          {CROP_ORDER.map((cropId) => {
            const crop = CROPS[cropId];
            const selected = selectedCrop === cropId;
            return (
              <View key={cropId} style={[styles.shopCard, selected && styles.shopCardSelected]}>
                <Pressable
                  onPress={() => {
                    setSelectedCrop(cropId);
                    setTool("plant");
                    setSelectedMoveObject(null);
                    setHint(`تم اختيار ${crop.name}. اضغط على خانة خضراء فارغة لزراعتها.`);
                  }}
                  style={styles.shopMain}
                >
                  <View style={[styles.cropIcon, { backgroundColor: crop.lightColor }]}>
                    <Ionicons name="leaf" size={21} color={crop.color} />
                  </View>
                  <View style={styles.shopCopy}>
                    <Text style={styles.shopName}>{crop.name}</Text>
                    <Text style={styles.shopMeta}>
                      {formatTime(crop.growMs)} · {crop.harvestAmount} للحصاد
                    </Text>
                    <Text style={styles.stockLine}>البذور: {farm.seeds[cropId]}</Text>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`شراء بذرة ${crop.name} بسعر ${crop.seedPrice}`}
                  disabled={busy}
                  onPress={() => void act({ type: "buySeed", cropId })}
                  style={styles.buyButton}
                >
                  <Ionicons name="add" size={16} color="#FFFFFF" />
                  <Text style={styles.buyButtonText}>{crop.seedPrice}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        <View style={styles.sectionHead}>
          <View>
            <Text style={styles.sectionTitle}>الأشجار المثمرة</Text>
            <Text style={styles.sectionSubtitle}>اشترِ شجرة وضعها، ثم اجمع الثمار عند نضجها</Text>
          </View>
          <Ionicons name="nutrition-outline" size={22} color={C.green} />
        </View>
        <View style={styles.shopList}>
          {FRUIT_TREE_ORDER.map((treeId) => {
            const tree = FRUIT_TREES[treeId];
            const placedCount = farm.trees.filter((item) => item.kind === treeId).length;
            return (
              <View key={treeId} style={styles.shopCard}>
                <Pressable onPress={() => changeTool(treeId)} style={styles.shopMain}>
                  <View style={[styles.treeIcon, { backgroundColor: "#E3F0D4" }]}>
                    <Ionicons name="leaf" size={21} color={tree.fruitColor} />
                  </View>
                  <View style={styles.shopCopy}>
                    <Text style={styles.shopName}>{tree.name}</Text>
                    <Text style={styles.shopMeta}>
                      أول ثمار بعد {formatTime(tree.growMs)} · {tree.harvestAmount} {tree.fruitName}
                    </Text>
                    <Text style={styles.stockLine}>في المزرعة: {placedCount}</Text>
                  </View>
                </Pressable>
                <Pressable onPress={() => changeTool(treeId)} style={styles.buyButton}>
                  <Ionicons name="cart-outline" size={15} color="#FFFFFF" />
                  <Text style={styles.buyButtonText}>{tree.price}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        <View style={styles.sectionHead}>
          <View>
            <Text style={styles.sectionTitle}>الديكور والبناء</Text>
            <Text style={styles.sectionSubtitle}>ضع العناصر في أي خانة، وانقلها لاحقاً</Text>
          </View>
          <Ionicons name="color-palette-outline" size={22} color={C.green} />
        </View>
        <View style={styles.decorGrid}>
          <Pressable
            onPress={() => changeTool(farm.houseBuilt ? "move" : "buildHouse")}
            style={styles.decorCard}
          >
            <Ionicons name="home-outline" size={23} color={C.greenDark} />
            <Text style={styles.decorName}>{farm.houseBuilt ? "نقل المنزل" : "بناء المنزل"}</Text>
            <Text style={styles.decorPrice}>{farm.houseBuilt ? "مبني" : `${formatCoins(180)} عملة`}</Text>
          </Pressable>
          {DECORATION_ORDER.map((id) => (
            <Pressable key={id} onPress={() => changeTool(id)} style={styles.decorCard}>
              <Ionicons
                name={id === "flowerBed" ? "flower-outline" : id === "gardenLamp" ? "bulb-outline" : "grid-outline"}
                size={23}
                color={C.greenDark}
              />
              <Text style={styles.decorName}>{DECORATIONS[id].name}</Text>
              <Text style={styles.decorPrice}>{formatCoins(DECORATIONS[id].price)} عملة</Text>
            </Pressable>
          ))}
        </View>

        {hint ? (
          <View style={styles.hintBox}>
            <Ionicons name="information-circle-outline" size={18} color={C.greenDark} />
            <Text style={styles.hintText}>{hint}</Text>
            <Pressable onPress={() => setHint("")} hitSlop={8}><Ionicons name="close" size={17} color={C.muted} /></Pressable>
          </View>
        ) : null}
        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

        <View style={styles.sectionHead}>
          <View>
            <Text style={styles.sectionTitle}>مخزن المحاصيل والثمار</Text>
            <Text style={styles.sectionSubtitle}>بع الفائض لتحصل على عملات للمزرعة</Text>
          </View>
          <Ionicons name="basket-outline" size={22} color={C.green} />
        </View>
        <View style={styles.storageCard}>
          {CROP_ORDER.map((cropId) => (
            <View key={cropId} style={styles.storageRow}>
              <Text style={styles.storageCount}>× {farm.inventory[cropId]}</Text>
              <View style={styles.storageCopy}>
                <Text style={styles.storageName}>{CROPS[cropId].name}</Text>
                <Text style={styles.storageMeta}>{CROPS[cropId].sellPrice} عملات للحبة</Text>
              </View>
              <Pressable
                disabled={busy || farm.inventory[cropId] < 1}
                onPress={() => void act({ type: "sellCrop", cropId })}
                style={[styles.sellButton, farm.inventory[cropId] < 1 && styles.disabled]}
              >
                <Text style={styles.sellText}>بيع</Text>
              </Pressable>
            </View>
          ))}
          {FRUIT_TREE_ORDER.map((treeId) => (
            <View key={treeId} style={styles.storageRow}>
              <Text style={styles.storageCount}>× {farm.fruitInventory[treeId]}</Text>
              <View style={styles.storageCopy}>
                <Text style={styles.storageName}>{FRUIT_TREES[treeId].fruitName}</Text>
                <Text style={styles.storageMeta}>{FRUIT_TREES[treeId].sellPrice} عملات للحبة</Text>
              </View>
              <Pressable
                disabled={busy || farm.fruitInventory[treeId] < 1}
                onPress={() => void act({ type: "sellFruit", treeId })}
                style={[styles.sellButton, farm.fruitInventory[treeId] < 1 && styles.disabled]}
              >
                <Text style={styles.sellText}>بيع</Text>
              </Pressable>
            </View>
          ))}
          {farm.plots.length === 0 && farm.trees.length === 0 ? (
            <Text style={styles.emptyStock}>ازرع حقلك الأول لتبدأ بتخزين المحاصيل.</Text>
          ) : null}
        </View>

        <View style={styles.footerNote}>
          <Ionicons name={previewMode ? "leaf-outline" : "cloud-done-outline"} size={16} color={C.muted} />
          <Text style={styles.footerText}>
            {previewMode ? "هذه تجربة فقط؛ تقدمك الحقيقي يحفظ في حساب Firebase" : "مزرعتك محفوظة في حساب Firebase الخاص بك"}
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

function ActionButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.actionButton}>
      <Ionicons name={icon} size={17} color="#FFFFFF" />
      <Text style={styles.actionButtonText}>{label}</Text>
    </Pressable>
  );
}

function StatusItem({
  icon,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.statusItem}>
      <Ionicons name={icon} size={16} color={C.greenDark} />
      <Text style={styles.statusValue}>{value}</Text>
      <Text style={styles.statusLabel}>{label}</Text>
    </View>
  );
}

function MoveButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`تحرك ${label}`} onPress={onPress} style={styles.moveButton}>
      <Ionicons name={icon} size={18} color={C.greenDark} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.canvas },
  scrollContent: { width: "100%", maxWidth: 600, alignSelf: "center", paddingHorizontal: 14, gap: 14 },
  loadingPage: { flex: 1, backgroundColor: C.canvas, alignItems: "center", justifyContent: "center", padding: 26, gap: 13 },
  loadingIcon: { width: 62, height: 62, borderRadius: 22, backgroundColor: "#E6F2DC", alignItems: "center", justifyContent: "center" },
  loadingText: { color: C.ink, fontSize: 14, fontWeight: "800" },
  errorIcon: { width: 62, height: 62, borderRadius: 22, backgroundColor: "#FBE6DE", alignItems: "center", justifyContent: "center" },
  errorTitle: { color: C.ink, fontSize: 17, fontWeight: "900" },
  errorCopy: { color: C.muted, fontSize: 13, textAlign: "center", lineHeight: 21 },
  actionButton: { minHeight: 46, paddingHorizontal: 17, borderRadius: 15, backgroundColor: C.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  actionButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  previewBanner: { minHeight: 35, paddingHorizontal: 12, borderRadius: 12, backgroundColor: "#E7F2DF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  previewBannerText: { color: C.greenDark, fontSize: 11, fontWeight: "800" },
  header: { padding: 16, borderRadius: 22, borderWidth: 1, borderColor: "#D7E5BD", gap: 16, overflow: "hidden" },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerIconButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.72)", alignItems: "center", justifyContent: "center" },
  greeting: { flex: 1, minWidth: 0 },
  eyebrow: { color: C.greenDark, fontSize: 10, fontWeight: "800" },
  title: { color: C.ink, fontSize: 17, fontWeight: "900", marginTop: 2 },
  coins: { minHeight: 38, paddingHorizontal: 11, borderRadius: 14, backgroundColor: "#FFF8DA", flexDirection: "row", alignItems: "center", gap: 5 },
  coinText: { color: "#775517", fontSize: 13, fontWeight: "900" },
  headerBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 9 },
  levelPill: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.66)", flexDirection: "row", alignItems: "center", gap: 5 },
  levelText: { color: "#795B25", fontSize: 11, fontWeight: "900" },
  headerPrompt: { flex: 1, color: "#5F7552", fontSize: 11, fontWeight: "700", textAlign: "right" },
  statusStrip: { paddingVertical: 12, paddingHorizontal: 6, backgroundColor: C.paper, borderRadius: 17, borderWidth: 1, borderColor: C.border, flexDirection: "row", justifyContent: "space-around" },
  statusItem: { alignItems: "center", justifyContent: "center", minWidth: 62, gap: 3 },
  statusValue: { color: C.ink, fontSize: 12, fontWeight: "900" },
  statusLabel: { color: C.muted, fontSize: 9, fontWeight: "700" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 2 },
  sectionTitle: { color: C.ink, fontSize: 16, fontWeight: "900", textAlign: "right" },
  sectionSubtitle: { color: C.muted, fontSize: 10, marginTop: 3, textAlign: "right" },
  sunBadge: { width: 35, height: 35, borderRadius: 13, backgroundColor: "#FFF3D6", alignItems: "center", justifyContent: "center" },
  worldCard: { padding: 8, borderRadius: 22, backgroundColor: "#D8EAC3", borderWidth: 1, borderColor: "#C4DDB1", gap: 7 },
  worldFooter: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 24 },
  worldFooterText: { color: "#55734B", fontSize: 10, fontWeight: "800" },
  currentTool: { minHeight: 60, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#FFFFFF", borderRadius: 15, borderWidth: 1, borderColor: C.border, flexDirection: "row-reverse", alignItems: "center", gap: 9 },
  toolHintIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: C.greenLight, alignItems: "center", justifyContent: "center" },
  toolHintCopy: { flex: 1, alignItems: "flex-end" },
  toolHintTitle: { color: C.ink, fontSize: 12, fontWeight: "900" },
  toolHintText: { color: C.muted, fontSize: 9, marginTop: 3, textAlign: "right" },
  toolList: { flexDirection: "row-reverse", gap: 7, paddingVertical: 1 },
  toolButton: { minHeight: 46, paddingHorizontal: 11, borderRadius: 14, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: C.border, flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  toolButtonActive: { backgroundColor: C.green, borderColor: C.green },
  toolButtonDimmed: { opacity: 0.65 },
  toolButtonText: { color: C.greenDark, fontSize: 10, fontWeight: "800" },
  toolButtonTextActive: { color: "#FFFFFF" },
  toolPrice: { color: "#9C7128", fontSize: 9, fontWeight: "900" },
  movePadSection: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 18, borderWidth: 1, borderColor: C.border, backgroundColor: "#FFFFFF" },
  sectionHeadCompact: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sectionTitleSmall: { color: C.ink, fontSize: 12, fontWeight: "900" },
  movePad: { marginTop: 10, alignSelf: "center", display: "flex", flexDirection: "row", flexWrap: "wrap", width: 150, justifyContent: "center", gap: 5 },
  movePadSpacer: { width: 43, height: 39 },
  moveButton: { width: 43, height: 39, borderRadius: 12, backgroundColor: "#EDF5E8", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#DCE8D3" },
  playerDot: { width: 43, height: 39, borderRadius: 12, backgroundColor: C.green, alignItems: "center", justifyContent: "center" },
  shopList: { gap: 8 },
  shopCard: { minHeight: 76, padding: 9, borderRadius: 16, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: C.border, flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  shopCardSelected: { borderColor: "#88B574", backgroundColor: "#FBFFF8" },
  shopMain: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 9 },
  cropIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  treeIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  shopCopy: { flex: 1, alignItems: "flex-end" },
  shopName: { color: C.ink, fontSize: 12, fontWeight: "900" },
  shopMeta: { color: C.muted, fontSize: 9, marginTop: 3, textAlign: "right" },
  stockLine: { color: C.green, fontSize: 9, fontWeight: "800", marginTop: 3 },
  buyButton: { minWidth: 57, minHeight: 38, paddingHorizontal: 9, borderRadius: 12, backgroundColor: C.green, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 2 },
  buyButtonText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  decorGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  decorCard: { width: "48%", minHeight: 85, padding: 9, borderRadius: 15, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", gap: 4 },
  decorName: { color: C.ink, fontSize: 10, fontWeight: "900" },
  decorPrice: { color: C.muted, fontSize: 9 },
  hintBox: { padding: 11, borderRadius: 14, backgroundColor: "#E8F2DE", flexDirection: "row-reverse", alignItems: "center", gap: 7 },
  hintText: { flex: 1, color: C.greenDark, fontSize: 11, lineHeight: 17, textAlign: "right" },
  errorBanner: { color: C.red, padding: 10, borderRadius: 12, backgroundColor: "#FCEAE4", fontSize: 11, textAlign: "right" },
  storageCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: C.border, borderRadius: 17, paddingHorizontal: 12 },
  storageRow: { minHeight: 58, flexDirection: "row-reverse", alignItems: "center", gap: 9, borderBottomWidth: 1, borderBottomColor: "#EFF3EC" },
  storageCopy: { flex: 1, alignItems: "flex-end" },
  storageName: { color: C.ink, fontSize: 11, fontWeight: "900" },
  storageMeta: { color: C.muted, fontSize: 9, marginTop: 2 },
  storageCount: { color: C.ink, fontSize: 11, fontWeight: "900", minWidth: 45, textAlign: "left" },
  sellButton: { minWidth: 50, minHeight: 32, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#E8F3E3" },
  sellText: { color: C.greenDark, fontSize: 10, fontWeight: "900" },
  disabled: { opacity: 0.4 },
  emptyStock: { color: C.muted, padding: 13, fontSize: 10, textAlign: "center" },
  footerNote: { minHeight: 38, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6 },
  footerText: { color: C.muted, fontSize: 10, fontWeight: "700" },
  savingPill: { position: "absolute", bottom: 18, alignSelf: "center", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, backgroundColor: C.greenDark, flexDirection: "row", alignItems: "center", gap: 7, elevation: 5 },
  savingText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
});
