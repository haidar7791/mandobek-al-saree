import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserProfile } from "@/lib/db_logic";
import FarmScene, { type FarmSceneHandle } from "./FarmScene";
import {
  CROPS,
  CROP_ORDER,
  DECORATIONS,
  DECORATION_ORDER,
  FARM_HOUSE_COST,
  FARM_PLOT_COST,
  FRUIT_TREES,
  FRUIT_TREE_ORDER,
  applyFarmActionToState,
  createDemoFarmGame,
  getPlotGrowthState,
  getTreeGrowthState,
  type CropId,
  type DecorationId,
  type FarmAction,
  type FarmGameSave,
  type FarmObjectRef,
  type FarmPosition,
  type FarmTool,
  type FruitTreeId,
} from "@/lib/farm-game";
import { loadFarmGame, performFarmAction } from "@/lib/farm-game-persistence";

const C = {
  ink: "#28432B",
  muted: "#738571",
  green: "#4F8B4D",
  greenDark: "#315F3A",
  greenLight: "#EAF5E5",
  canvas: "#A9CE7E",
  paper: "#FFFDF4",
  gold: "#E7B943",
  soil: "#96603D",
  border: "#DDE8D5",
  red: "#C05A46",
};

type MenuTab = "shop" | "tools" | "storage";
type FarmPlacement =
  | { kind: "plot" }
  | { kind: "tree"; treeId: FruitTreeId }
  | { kind: "decoration"; decorationId: DecorationId }
  | { kind: "house" };

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

function toolDescription(tool: FarmTool | null): string {
  if (tool === "walk" || !tool) return "اسحب الأرض للتحرك، واضغط على العنصر للتفاعل معه.";
  if (tool === "move") return "اختر مبنى أو حقلاً أو شجرة، ثم اضغط مكاناً فارغاً لنقله.";
  if (tool === "buyPlot") return "اضغط الأرض لوضع الحقل، أو اسحبه من القائمة مباشرة.";
  if (tool === "buildHouse") return "اختر مكاناً فارغاً لبناء منزل المزرعة.";
  if (tool === "apple" || tool === "orange") return `اختر مكاناً فارغاً لوضع ${FRUIT_TREES[tool].name}.`;
  if (tool === "flowerBed" || tool === "gardenLamp" || tool === "fence") {
    return `اختر مكاناً فارغاً لوضع ${DECORATIONS[tool].name}.`;
  }
  return "المحاصيل تنمو بمرور الوقت من دون ري.";
}

function objectName(object: FarmObjectRef | null): string {
  if (!object) return "";
  if (object.type === "house") return "منزل المزرعة";
  if (object.type === "plot") return "الحقل";
  if (object.type === "tree") return "الشجرة";
  return "قطعة الديكور";
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function ShopCard({
  title,
  subtitle,
  icon,
  price,
  selected,
  disabled,
  onPress,
  onDrop,
  onDragChange,
  actionLabel,
  onAction,
  count,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  price?: number;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  onDrop?: (screenX: number, screenY: number) => void;
  onDragChange?: (active: boolean, x: number, y: number) => void;
  actionLabel?: string;
  onAction?: () => void;
  count?: string;
}) {
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          !!onDrop && Math.hypot(gesture.dx, gesture.dy) > 8,
        onPanResponderGrant: (_event, gesture) => onDragChange?.(true, gesture.moveX, gesture.moveY),
        onPanResponderMove: (_event, gesture) => onDragChange?.(true, gesture.moveX, gesture.moveY),
        onPanResponderRelease: (_event, gesture) => {
          onDragChange?.(false, gesture.moveX, gesture.moveY);
          if (Math.hypot(gesture.dx, gesture.dy) > 18) onDrop?.(gesture.moveX, gesture.moveY);
        },
        onPanResponderTerminate: (_event, gesture) => onDragChange?.(false, gesture.moveX, gesture.moveY),
        onPanResponderTerminationRequest: () => false,
      }),
    [onDrop, onDragChange],
  );

  return (
    <View style={[styles.shopCard, selected && styles.shopCardSelected, disabled && styles.disabledCard]}>
      {onDrop ? (
        <View
          {...panResponder.panHandlers}
          style={styles.dragHandle}
          accessibilityRole="button"
          accessibilityLabel={`اسحب ${title} إلى المزرعة`}
        >
          <Ionicons name="reorder-three-outline" size={22} color={C.greenDark} />
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: !!selected, disabled: !!disabled }}
        disabled={disabled || !onPress}
        onPress={onPress}
        style={styles.shopMain}
      >
        <View style={styles.shopIcon}><Ionicons name={icon} size={20} color={C.greenDark} /></View>
        <View style={styles.shopCopy}>
          <Text style={styles.shopName}>{title}</Text>
          <Text style={styles.shopMeta}>{subtitle}</Text>
          {count ? <Text style={styles.stockLine}>{count}</Text> : null}
        </View>
      </Pressable>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={onAction}
          style={[styles.buyButton, disabled && styles.disabled]}
        >
          <Text style={styles.buyButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : price !== undefined ? (
        <View style={styles.pricePill}>
          <Ionicons name="cash-outline" size={13} color="#8A6420" />
          <Text style={styles.priceText}>{formatCoins(price)}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function FarmGameScreen({ previewMode = false }: { previewMode?: boolean }) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const player = auth.currentUser;
  const sceneRef = useRef<FarmSceneHandle>(null);
  const [farm, setFarm] = useState<FarmGameSave | null>(null);
  const [tool, setTool] = useState<FarmTool | null>(null);
  const [selectedMoveObject, setSelectedMoveObject] = useState<FarmObjectRef | null>(null);
  const [cropPickerPlotId, setCropPickerPlotId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTab, setMenuTab] = useState<MenuTab>("shop");
  const [playerName, setPlayerName] = useState("المزارع");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [dragPreview, setDragPreview] = useState<{ label: string; x: number; y: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const playerId = player?.uid ?? "";
  const isWide = windowWidth >= 850;

  const readyFields = useMemo(
    () => farm?.plots.filter((plot) => plot.cropId && getPlotGrowthState(plot, now).ready).length ?? 0,
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

  const selectTool = (nextTool: FarmTool) => {
    if (nextTool === "buildHouse" && farm?.houseBuilt) {
      setTool("move");
      setSelectedMoveObject({ type: "house", id: "house" });
      setHint("المنزل مبني بالفعل. اختر مكاناً فارغاً لنقله.");
      setMenuOpen(false);
      return;
    }
    setTool(nextTool);
    setSelectedMoveObject(null);
    setHint(toolDescription(nextTool));
    setMenuOpen(false);
  };

  const placeShopItem = async (placement: FarmPlacement, position: FarmPosition) => {
    if (placement.kind === "plot") {
      await act({ type: "buyPlotAt", x: position.x, y: position.y });
    } else if (placement.kind === "tree") {
      await act({ type: "buyTreeAt", treeId: placement.treeId, x: position.x, y: position.y });
    } else if (placement.kind === "decoration") {
      await act({ type: "buyDecorationAt", decorationId: placement.decorationId, x: position.x, y: position.y });
    } else if (farm?.houseBuilt) {
      await act({
        type: "moveObjectTo",
        object: { type: "house", id: "house" },
        x: position.x,
        y: position.y,
      });
    } else {
      await act({ type: "buildHouseAt", x: position.x, y: position.y });
    }
    setTool(null);
  };

  const handleShopDrop = async (placement: FarmPlacement, screenX: number, screenY: number) => {
    const target = await sceneRef.current?.resolveDropPosition(screenX, screenY);
    if (!target) {
      setHint("اسحب العنصر إلى مساحة الأرض لوضعه.");
      return;
    }
    if (target.object) {
      setHint("هذا المكان مشغول. اسحب العنصر إلى خانة خضراء فارغة.");
      return;
    }
    await placeShopItem(placement, target.position);
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
      if (!plot) return;
      if (!plot.cropId) {
        setCropPickerPlotId(plot.id);
        return;
      }
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

    if (!tool || tool === "walk") {
      await act({ type: "movePlayerTo", x: position.x, y: position.y });
      return;
    }

    switch (tool) {
      case "plant":
        setHint("المحاصيل تزرع في الحقول. اضغط على حقل فارغ لاختيار المحصول.");
        break;
      case "buyPlot":
        await act({ type: "buyPlotAt", x: position.x, y: position.y });
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

  const handleCropChoice = async (cropId: CropId) => {
    if (!farm || cropPickerPlotId === null) return;
    if (farm.seeds[cropId] < 1) {
      const bought = await act({ type: "buySeed", cropId });
      if (bought) setHint(`تم شراء بذرة ${CROPS[cropId].name}. اضغطها مجدداً لزراعتها.`);
      return;
    }
    const planted = await act({ type: "plantInPlot", plotId: cropPickerPlotId, cropId });
    if (planted) setCropPickerPlotId(null);
  };

  const beginDrag = (label: string, active: boolean, x: number, y: number) => {
    setDragPreview(active ? { label, x, y } : null);
  };

  const panelHeight = Math.min(310, Math.max(220, windowHeight * 0.34));

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
        <Pressable onPress={() => void refreshFarm()} style={styles.retryButton}>
          <Ionicons name="refresh-outline" size={17} color="#FFFFFF" />
          <Text style={styles.retryText}>إعادة المحاولة</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 3, paddingBottom: insets.bottom + 3 }]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.topBar}>
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
          <Text style={styles.title} numberOfLines={1}>أهلاً، {playerName}</Text>
          <Text style={styles.subtitle}>المستوى {level} · {readyFields + readyTrees} جاهز للجمع</Text>
        </View>
        {previewMode ? (
          <View style={styles.previewTag}><Ionicons name="eye-outline" size={13} color={C.greenDark} /><Text style={styles.previewText}>تجربة</Text></View>
        ) : null}
        <View style={styles.coins}>
          <Ionicons name="cash" size={17} color="#986D1F" />
          <Text style={styles.coinText}>{formatCoins(farm.coins)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={menuOpen ? "إغلاق قائمة المزرعة" : "فتح قائمة المزرعة"}
          onPress={() => setMenuOpen((value) => !value)}
          style={[styles.menuToggle, menuOpen && styles.menuToggleActive]}
        >
          <Ionicons name={menuOpen ? "close" : "grid-outline"} size={19} color={menuOpen ? "#FFFFFF" : C.greenDark} />
        </Pressable>
      </View>

      <View style={[styles.workspace, isWide ? styles.workspaceWide : styles.workspaceNarrow]}>
        <View style={styles.worldPane}>
          <FarmScene
            ref={sceneRef}
            farm={farm}
            now={now}
            style={styles.scene}
            onTilePress={(position, object) => void handleTilePress(position, object)}
          />
        </View>

        {menuOpen ? (
          <View style={[styles.menuPanel, isWide ? styles.menuPanelWide : { height: panelHeight }]}>
            <View style={styles.menuHeader}>
              <View>
                <Text style={styles.menuTitle}>مستلزمات المزرعة</Text>
                <Text style={styles.menuHint}>اسحب العناصر من المقبض إلى الأرض</Text>
              </View>
              <Pressable onPress={() => setMenuOpen(false)} style={styles.closeMenuButton}>
                <Ionicons name="chevron-down" size={18} color={C.greenDark} />
              </Pressable>
            </View>
            <View style={styles.tabs}>
              {([
                ["shop", "المتجر", "basket-outline"],
                ["tools", "الأدوات", "construct-outline"],
                ["storage", "المخزن", "cube-outline"],
              ] as const).map(([key, label, icon]) => (
                <Pressable
                  key={key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: menuTab === key }}
                  onPress={() => setMenuTab(key)}
                  style={[styles.tab, menuTab === key && styles.tabActive]}
                >
                  <Ionicons name={icon} size={15} color={menuTab === key ? "#FFFFFF" : C.greenDark} />
                  <Text style={[styles.tabText, menuTab === key && styles.tabTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {menuTab === "shop" ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.menuContent}>
                <SectionLabel>الأرض والمنزل</SectionLabel>
                <ShopCard
                  title="حقل جديد"
                  subtitle="حقل فارغ يبقى بعد الحصاد"
                  icon="grid-outline"
                  price={FARM_PLOT_COST}
                  selected={tool === "buyPlot"}
                  onPress={() => selectTool("buyPlot")}
                  onDrop={(x, y) => void handleShopDrop({ kind: "plot" }, x, y)}
                  onDragChange={(active, x, y) => beginDrag("حقل جديد", active, x, y)}
                />
                <ShopCard
                  title={farm.houseBuilt ? "نقل منزل المزرعة" : "بناء منزل المزرعة"}
                  subtitle={farm.houseBuilt ? "اسحب المنزل إلى مكان جديد" : "اسحب المنزل إلى أرض فارغة"}
                  icon="home-outline"
                  price={farm.houseBuilt ? undefined : FARM_HOUSE_COST}
                  selected={tool === "buildHouse" || (tool === "move" && selectedMoveObject?.type === "house")}
                  onPress={() => selectTool("buildHouse")}
                  onDrop={(x, y) => void handleShopDrop({ kind: "house" }, x, y)}
                  onDragChange={(active, x, y) => beginDrag("منزل المزرعة", active, x, y)}
                />

                <SectionLabel>البذور والمحاصيل</SectionLabel>
                {CROP_ORDER.map((cropId) => (
                  <ShopCard
                    key={cropId}
                    title={`بذور ${CROPS[cropId].name}`}
                    subtitle={`تنمو خلال ${formatTime(CROPS[cropId].growMs)} · ${CROPS[cropId].harvestAmount} للحصاد`}
                    icon="leaf-outline"
                    count={`المتاح: ${farm.seeds[cropId]}`}
                    actionLabel={`شراء ${formatCoins(CROPS[cropId].seedPrice)}`}
                    onAction={() => void act({ type: "buySeed", cropId })}
                  />
                ))}

                <SectionLabel>أشجار مثمرة</SectionLabel>
                {FRUIT_TREE_ORDER.map((treeId) => {
                  const tree = FRUIT_TREES[treeId];
                  const count = farm.trees.filter((item) => item.kind === treeId).length;
                  return (
                    <ShopCard
                      key={treeId}
                      title={tree.name}
                      subtitle={`أول ثمار بعد ${formatTime(tree.growMs)} · ${tree.harvestAmount} ${tree.fruitName}`}
                      icon="nutrition-outline"
                      price={tree.price}
                      count={`في المزرعة: ${count}`}
                      selected={tool === treeId}
                      onPress={() => selectTool(treeId)}
                      onDrop={(x, y) => void handleShopDrop({ kind: "tree", treeId }, x, y)}
                      onDragChange={(active, x, y) => beginDrag(tree.name, active, x, y)}
                    />
                  );
                })}

                <SectionLabel>الزينة</SectionLabel>
                {DECORATION_ORDER.map((decorationId) => (
                  <ShopCard
                    key={decorationId}
                    title={DECORATIONS[decorationId].name}
                    subtitle="اسحبها إلى أي مكان فارغ"
                    icon={
                      decorationId === "flowerBed"
                        ? "flower-outline"
                        : decorationId === "gardenLamp"
                          ? "bulb-outline"
                          : "grid-outline"
                    }
                    price={DECORATIONS[decorationId].price}
                    selected={tool === decorationId}
                    onPress={() => selectTool(decorationId)}
                    onDrop={(x, y) => void handleShopDrop({ kind: "decoration", decorationId }, x, y)}
                    onDragChange={(active, x, y) => beginDrag(DECORATIONS[decorationId].name, active, x, y)}
                  />
                ))}
              </ScrollView>
            ) : null}

            {menuTab === "tools" ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.menuContent}>
                <SectionLabel>طريقة اللعب</SectionLabel>
                <ShopCard
                  title="تحريك المزارع"
                  subtitle="اسحب الأرض للتنقل، أو اضغط وجهة على العشب"
                  icon="walk-outline"
                  selected={!tool || tool === "walk"}
                  onPress={() => {
                    setTool("walk");
                    setSelectedMoveObject(null);
                    setHint(toolDescription("walk"));
                    setMenuOpen(false);
                  }}
                />
                <ShopCard
                  title="نقل عنصر"
                  subtitle="اختر منزلاً أو حقلاً أو شجرة ثم مكاناً فارغاً"
                  icon="move-outline"
                  selected={tool === "move"}
                  onPress={() => selectTool("move")}
                />
                {tool || selectedMoveObject ? (
                  <Pressable
                    onPress={() => {
                      setTool(null);
                      setSelectedMoveObject(null);
                      setHint("تم إلغاء وضع البناء أو النقل.");
                    }}
                    style={styles.cancelTool}
                  >
                    <Ionicons name="close-circle-outline" size={17} color={C.red} />
                    <Text style={styles.cancelToolText}>إلغاء الاختيار الحالي</Text>
                  </Pressable>
                ) : null}
                <View style={styles.helpCard}>
                  <Ionicons name="hand-left-outline" size={19} color={C.greenDark} />
                  <Text style={styles.helpText}>
                    اسحب بإصبع واحد للتحرك، وقرّب أو باعد إصبعين لتغيير حجم العرض. لا يوجد نظام ري.
                  </Text>
                </View>
              </ScrollView>
            ) : null}

            {menuTab === "storage" ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.menuContent}>
                <SectionLabel>المحاصيل والثمار · {totalStored} عنصر</SectionLabel>
                {CROP_ORDER.map((cropId) => (
                  <StorageRow
                    key={cropId}
                    title={CROPS[cropId].name}
                    count={farm.inventory[cropId]}
                    unitPrice={CROPS[cropId].sellPrice}
                    disabled={busy || farm.inventory[cropId] < 1}
                    onSell={() => void act({ type: "sellCrop", cropId })}
                  />
                ))}
                {FRUIT_TREE_ORDER.map((treeId) => (
                  <StorageRow
                    key={treeId}
                    title={FRUIT_TREES[treeId].fruitName}
                    count={farm.fruitInventory[treeId]}
                    unitPrice={FRUIT_TREES[treeId].sellPrice}
                    disabled={busy || farm.fruitInventory[treeId] < 1}
                    onSell={() => void act({ type: "sellFruit", treeId })}
                  />
                ))}
                {totalStored === 0 ? <Text style={styles.emptyStorage}>سيظهر ما تجمعه من محاصيل وثمار هنا.</Text> : null}
              </ScrollView>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.bottomBar}>
        <View style={styles.hintIcon}><Ionicons name="leaf-outline" size={15} color={C.greenDark} /></View>
        <Text style={styles.hintText} numberOfLines={2}>
          {hint || (selectedMoveObject
            ? `اختر مكاناً جديداً لـ ${objectName(selectedMoveObject)}.`
            : toolDescription(tool))}
        </Text>
        {busy ? <ActivityIndicator size="small" color={C.green} /> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="تحديث المزرعة"
          onPress={() => void refreshFarm()}
          style={styles.refreshButton}
        >
          <Ionicons name="refresh-outline" size={17} color={C.greenDark} />
        </Pressable>
      </View>

      {previewMode ? (
        <View pointerEvents="none" style={styles.previewNotice}>
          <Ionicons name="eye-outline" size={13} color={C.greenDark} />
          <Text style={styles.previewNoticeText}>مزرعة تجريبية — التغييرات لا تُحفظ</Text>
        </View>
      ) : null}

      {dragPreview ? (
        <View pointerEvents="none" style={[styles.dragGhost, { left: dragPreview.x - 58, top: dragPreview.y - 24 }]}>
          <Ionicons name="leaf" size={15} color="#FFFFFF" />
          <Text style={styles.dragGhostText}>{dragPreview.label}</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorToast}>
          <Text style={styles.errorToastText}>{error}</Text>
          <Pressable onPress={() => void refreshFarm()}><Ionicons name="refresh-outline" size={17} color={C.red} /></Pressable>
        </View>
      ) : null}

      <Modal
        visible={cropPickerPlotId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCropPickerPlotId(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.cropModal}>
            <View style={styles.modalHeading}>
              <View>
                <Text style={styles.modalTitle}>ماذا تريد أن تزرع؟</Text>
                <Text style={styles.modalSubtitle}>اختر محصولاً ليبدأ نموه فوراً</Text>
              </View>
              <Pressable onPress={() => setCropPickerPlotId(null)} style={styles.closeMenuButton}>
                <Ionicons name="close" size={18} color={C.greenDark} />
              </Pressable>
            </View>
            {CROP_ORDER.map((cropId) => {
              const crop = CROPS[cropId];
              const hasSeed = farm.seeds[cropId] > 0;
              return (
                <Pressable
                  key={cropId}
                  disabled={busy}
                  onPress={() => void handleCropChoice(cropId)}
                  style={styles.cropChoice}
                >
                  <View style={[styles.cropChoiceIcon, { backgroundColor: crop.lightColor }]}>
                    <Ionicons name="leaf" size={18} color={crop.color} />
                  </View>
                  <View style={styles.cropChoiceCopy}>
                    <Text style={styles.cropChoiceTitle}>{crop.name}</Text>
                    <Text style={styles.cropChoiceMeta}>
                      {formatTime(crop.growMs)} · البذور: {farm.seeds[cropId]}
                    </Text>
                  </View>
                  <View style={[styles.cropChoiceButton, !hasSeed && styles.cropChoiceBuy]}>
                    <Text style={styles.cropChoiceButtonText}>
                      {hasSeed ? "ازرع" : `شراء ${formatCoins(crop.seedPrice)}`}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function StorageRow({
  title,
  count,
  unitPrice,
  disabled,
  onSell,
}: {
  title: string;
  count: number;
  unitPrice: number;
  disabled: boolean;
  onSell: () => void;
}) {
  return (
    <View style={styles.storageRow}>
      <Text style={styles.storageCount}>× {count}</Text>
      <View style={styles.storageCopy}>
        <Text style={styles.storageName}>{title}</Text>
        <Text style={styles.storageMeta}>{unitPrice} عملات للحبة</Text>
      </View>
      <Pressable disabled={disabled} onPress={onSell} style={[styles.sellButton, disabled && styles.disabled]}>
        <Text style={styles.sellText}>بيع</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.canvas },
  loadingPage: { flex: 1, backgroundColor: C.canvas, alignItems: "center", justifyContent: "center", padding: 26, gap: 13 },
  loadingIcon: { width: 62, height: 62, borderRadius: 22, backgroundColor: "#E6F2DC", alignItems: "center", justifyContent: "center" },
  loadingText: { color: C.ink, fontSize: 14, fontWeight: "800" },
  errorIcon: { width: 62, height: 62, borderRadius: 22, backgroundColor: "#FBE6DE", alignItems: "center", justifyContent: "center" },
  errorTitle: { color: C.ink, fontSize: 17, fontWeight: "900" },
  errorCopy: { color: C.muted, fontSize: 13, textAlign: "center", lineHeight: 21 },
  retryButton: { minHeight: 42, paddingHorizontal: 16, borderRadius: 14, backgroundColor: C.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  retryText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  topBar: { minHeight: 57, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: "#F7F7E8", borderBottomWidth: 1, borderBottomColor: "rgba(70,104,50,0.14)" },
  headerIconButton: { width: 38, height: 38, borderRadius: 13, backgroundColor: "#E8F0DB", alignItems: "center", justifyContent: "center" },
  greeting: { flex: 1, minWidth: 0 },
  title: { color: C.ink, fontSize: 14, fontWeight: "900", textAlign: "right" },
  subtitle: { color: C.muted, fontSize: 9, marginTop: 2, textAlign: "right" },
  previewTag: { paddingHorizontal: 7, paddingVertical: 6, borderRadius: 10, backgroundColor: "#E7F2DF", flexDirection: "row", alignItems: "center", gap: 4 },
  previewText: { color: C.greenDark, fontSize: 9, fontWeight: "800" },
  coins: { minHeight: 35, paddingHorizontal: 9, borderRadius: 12, backgroundColor: "#FFF3D0", flexDirection: "row", alignItems: "center", gap: 4 },
  coinText: { color: "#775517", fontSize: 11, fontWeight: "900" },
  menuToggle: { width: 38, height: 38, borderRadius: 13, backgroundColor: "#E8F0DB", alignItems: "center", justifyContent: "center" },
  menuToggleActive: { backgroundColor: C.green },
  workspace: { flex: 1, minHeight: 0 },
  workspaceWide: { flexDirection: "row-reverse" },
  workspaceNarrow: { flexDirection: "column" },
  worldPane: { flex: 1, minHeight: 220, overflow: "hidden", backgroundColor: C.canvas },
  scene: { flex: 1 },
  menuPanel: { backgroundColor: C.paper, borderColor: "rgba(54,94,48,0.18)", overflow: "hidden" },
  menuPanelWide: { width: 320, height: "100%", borderLeftWidth: 1 },
  menuHeader: { minHeight: 54, paddingHorizontal: 13, paddingVertical: 8, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#E8EDDF" },
  menuTitle: { color: C.ink, fontSize: 13, fontWeight: "900", textAlign: "right" },
  menuHint: { color: C.muted, fontSize: 9, marginTop: 3, textAlign: "right" },
  closeMenuButton: { width: 32, height: 32, borderRadius: 11, backgroundColor: "#EDF3E7", alignItems: "center", justifyContent: "center" },
  tabs: { padding: 7, flexDirection: "row-reverse", gap: 5, borderBottomWidth: 1, borderBottomColor: "#E8EDDF" },
  tab: { flex: 1, minHeight: 34, borderRadius: 10, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4 },
  tabActive: { backgroundColor: C.green },
  tabText: { color: C.greenDark, fontSize: 10, fontWeight: "800" },
  tabTextActive: { color: "#FFFFFF" },
  menuContent: { padding: 9, paddingBottom: 15, gap: 7 },
  sectionLabel: { color: C.greenDark, fontSize: 10, fontWeight: "900", textAlign: "right", marginTop: 6, marginBottom: 1 },
  shopCard: { minHeight: 60, paddingHorizontal: 7, paddingVertical: 7, borderRadius: 13, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: C.border, flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  shopCardSelected: { borderColor: "#84AF70", backgroundColor: "#F3FAED" },
  disabledCard: { opacity: 0.6 },
  dragHandle: { width: 31, height: 40, borderRadius: 9, backgroundColor: "#EAF3E3", alignItems: "center", justifyContent: "center", touchAction: "none" as any },
  shopMain: { flex: 1, minWidth: 0, flexDirection: "row-reverse", alignItems: "center", gap: 7 },
  shopIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#EAF3E3", alignItems: "center", justifyContent: "center" },
  shopCopy: { flex: 1, minWidth: 0, alignItems: "flex-end" },
  shopName: { color: C.ink, fontSize: 10, fontWeight: "900", textAlign: "right" },
  shopMeta: { color: C.muted, fontSize: 8, lineHeight: 12, marginTop: 2, textAlign: "right" },
  stockLine: { color: C.green, fontSize: 8, fontWeight: "800", marginTop: 2 },
  pricePill: { minHeight: 28, paddingHorizontal: 6, borderRadius: 9, backgroundColor: "#FFF4D4", flexDirection: "row-reverse", alignItems: "center", gap: 2 },
  priceText: { color: "#805F1D", fontSize: 9, fontWeight: "900" },
  buyButton: { minHeight: 30, paddingHorizontal: 8, borderRadius: 9, backgroundColor: C.green, alignItems: "center", justifyContent: "center" },
  buyButtonText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900" },
  disabled: { opacity: 0.42 },
  cancelTool: { minHeight: 42, borderRadius: 12, backgroundColor: "#FCECE7", flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 7 },
  cancelToolText: { color: C.red, fontSize: 10, fontWeight: "900" },
  helpCard: { padding: 12, borderRadius: 13, backgroundColor: "#EAF3E3", flexDirection: "row-reverse", alignItems: "flex-start", gap: 8, marginTop: 4 },
  helpText: { flex: 1, color: C.greenDark, fontSize: 10, lineHeight: 17, textAlign: "right" },
  storageRow: { minHeight: 50, paddingHorizontal: 6, flexDirection: "row-reverse", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: "#EFF3EC" },
  storageCopy: { flex: 1, alignItems: "flex-end" },
  storageName: { color: C.ink, fontSize: 10, fontWeight: "900" },
  storageMeta: { color: C.muted, fontSize: 8, marginTop: 2 },
  storageCount: { color: C.ink, fontSize: 10, fontWeight: "900", minWidth: 38, textAlign: "left" },
  sellButton: { minWidth: 44, minHeight: 29, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "#E8F3E3" },
  sellText: { color: C.greenDark, fontSize: 9, fontWeight: "900" },
  emptyStorage: { color: C.muted, fontSize: 10, textAlign: "center", paddingVertical: 18 },
  bottomBar: { minHeight: 42, paddingHorizontal: 10, paddingVertical: 4, flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: "#F7F7E8", borderTopWidth: 1, borderTopColor: "rgba(70,104,50,0.14)" },
  hintIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: "#E7F0DC", alignItems: "center", justifyContent: "center" },
  hintText: { flex: 1, color: C.greenDark, fontSize: 9, fontWeight: "700", textAlign: "right" },
  refreshButton: { width: 30, height: 30, borderRadius: 9, backgroundColor: "#E8F0DB", alignItems: "center", justifyContent: "center" },
  previewNotice: { position: "absolute", top: 64, alignSelf: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: "rgba(255,253,244,0.92)", flexDirection: "row", alignItems: "center", gap: 5 },
  previewNoticeText: { color: C.greenDark, fontSize: 9, fontWeight: "800" },
  dragGhost: { position: "absolute", minHeight: 38, paddingHorizontal: 10, borderRadius: 12, backgroundColor: "rgba(49,95,58,0.92)", flexDirection: "row-reverse", alignItems: "center", gap: 6, zIndex: 20, elevation: 8 },
  dragGhostText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  errorToast: { position: "absolute", left: 14, right: 14, bottom: 52, minHeight: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: "#FCEAE4", flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 8 },
  errorToastText: { flex: 1, color: C.red, fontSize: 10, textAlign: "right" },
  modalBackdrop: { flex: 1, padding: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(20,37,22,0.48)" },
  cropModal: { width: "100%", maxWidth: 390, padding: 14, borderRadius: 20, backgroundColor: C.paper, gap: 8, elevation: 10 },
  modalHeading: { marginBottom: 4, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { color: C.ink, fontSize: 15, fontWeight: "900", textAlign: "right" },
  modalSubtitle: { color: C.muted, fontSize: 10, marginTop: 3, textAlign: "right" },
  cropChoice: { minHeight: 56, paddingHorizontal: 8, borderRadius: 13, backgroundColor: "#F4F7EC", flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  cropChoiceIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  cropChoiceCopy: { flex: 1, alignItems: "flex-end" },
  cropChoiceTitle: { color: C.ink, fontSize: 11, fontWeight: "900" },
  cropChoiceMeta: { color: C.muted, fontSize: 9, marginTop: 3 },
  cropChoiceButton: { minWidth: 56, minHeight: 31, paddingHorizontal: 8, borderRadius: 9, backgroundColor: C.green, alignItems: "center", justifyContent: "center" },
  cropChoiceBuy: { backgroundColor: "#D8A844" },
  cropChoiceButtonText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900" },
});
