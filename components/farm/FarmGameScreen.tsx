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
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { signOut, updateProfile } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { getUserProfile } from "@/lib/db_logic";
import FarmScene, { type FarmSceneHandle } from "./FarmScene";
import {
  CROPS,
  CROP_ORDER,
  FARM_HOUSE_COST,
  FARM_OBSTACLE_CLEAR_COST,
  FARM_PLOT_COST,
  FRUIT_TREES,
  FRUIT_TREE_ORDER,
  applyFarmActionToState,
  advanceFarmGameTime,
  createDemoFarmGame,
  getNextLandExpansionCost,
  getNextWorkerCost,
  getPlotGrowthState,
  getTreeGrowthState,
  isFarmParcelAdjacent,
  type CropId,
  type FarmAction,
  type FarmGameSave,
  type FarmLandParcel,
  type FarmObjectRef,
  type FarmPosition,
  type FarmQuest,
  type FarmTool,
  type FruitTreeId,
} from "@/lib/farm-game";
import { loadFarmGame, performFarmAction, syncFarmSimulation } from "@/lib/farm-game-persistence";

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

type MenuTab = "shop" | "storage" | "quests";
type FarmPlacement =
  | { kind: "plot" }
  | { kind: "tree"; treeId: FruitTreeId }
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
  if (!tool) return "اضغط على الحقول للتفاعل، واسحب مطولاً المنزل أو الحقل أو الشجرة لنقلها.";
  if (tool === "buyPlot") return "اضغط الأرض لوضع الحقل، أو اسحبه من القائمة مباشرة.";
  if (tool === "buildHouse") return "اختر مكاناً فارغاً لبناء منزل المزرعة.";
  if (tool && FRUIT_TREE_ORDER.includes(tool as FruitTreeId)) {
    return `اختر مكاناً فارغاً لوضع ${FRUIT_TREES[tool as FruitTreeId].name}.`;
  }
  return "المحاصيل تنمو بمرور الوقت من دون ري.";
}

function objectName(object: FarmObjectRef | null): string {
  if (!object) return "";
  if (object.type === "house") return "منزل المزرعة";
  if (object.type === "plot") return "الحقل";
  if (object.type === "tree") return "الشجرة";
  if (object.type === "obstacle") return "العائق";
  if (object.type === "landParcel") return "قطعة أرض مقفلة";
  return "قطعة الديكور";
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function getQuestTitle(quest: FarmQuest): string {
  if (quest.id.startsWith("plant_")) {
    const treeId = quest.id.slice("plant_".length) as FruitTreeId;
    return `ضع ${quest.target} أشجار ${FRUIT_TREES[treeId].fruitName}`;
  }
  if (quest.id.startsWith("harvest_")) {
    const cropId = quest.id.slice("harvest_".length) as CropId;
    return `ازرع واحصد ${quest.target} مرات من ${CROPS[cropId].name}`;
  }
  return `اشترِ ${quest.target} ${quest.target === 1 ? "قطعة أرض" : "قطع أراضٍ"}`;
}

function FarmQuestCard({ quest }: { quest: FarmQuest }) {
  const completed = quest.progress >= quest.target;
  const progress = Math.min(1, quest.progress / quest.target);
  return (
    <View style={[styles.questCard, completed && styles.questCardCompleted]}>
      <View style={styles.questCardHeader}>
        <Text style={styles.questReward}>+{formatCoins(quest.rewardGems)} 💎</Text>
        <Text style={styles.questTitle}>{getQuestTitle(quest)}</Text>
      </View>
      <View style={styles.questProgressTrack}>
        <View style={[styles.questProgressFill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.questStatus}>
        {completed ? "مكتملة" : `${formatCoins(quest.progress)} / ${formatCoins(quest.target)}`}
      </Text>
    </View>
  );
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
  const [cropPickerPlotId, setCropPickerPlotId] = useState<number | null>(null);
  const [pendingLandParcel, setPendingLandParcel] = useState<FarmLandParcel | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTab, setMenuTab] = useState<MenuTab>("shop");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingPlayerName, setEditingPlayerName] = useState(false);
  const [playerNameDraft, setPlayerNameDraft] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [playerName, setPlayerName] = useState("المزارع");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [dragPreview, setDragPreview] = useState<{ label: string; x: number; y: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const farmRef = useRef<FarmGameSave | null>(null);
  const workerSyncingRef = useRef(false);
  const workerSyncPendingRef = useRef(false);
  const workerSyncRetryAtRef = useRef(0);
  farmRef.current = farm;
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
  const nextLandExpansionCost = farm ? getNextLandExpansionCost(farm) : 0;
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
    const timer = setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      const current = farmRef.current;
      if (!current) return;
      const advanced = advanceFarmGameTime(current, tick);
      farmRef.current = advanced;
      setFarm(advanced);

      const simulationChanged = advanced.totalHarvests > current.totalHarvests
        || advanced.obstacles.length < current.obstacles.length
        || advanced.workers.some((worker) => (
          worker.state === "harvesting"
          && current.workers.find((previous) => previous.id === worker.id)?.state !== "harvesting"
        ));
      if (simulationChanged) workerSyncPendingRef.current = true;
      if (
        !previewMode
        && playerId
        && workerSyncPendingRef.current
        && tick >= workerSyncRetryAtRef.current
        && !workerSyncingRef.current
      ) {
        workerSyncingRef.current = true;
        void syncFarmSimulation(playerId, tick)
          .then(() => {
            workerSyncPendingRef.current = false;
            workerSyncRetryAtRef.current = 0;
          })
          .catch((syncError) => {
            workerSyncRetryAtRef.current = Date.now() + 5_000;
            console.error("Could not save farm worker progress:", syncError);
          })
          .finally(() => {
            workerSyncingRef.current = false;
          });
      }
    }, 250);
    return () => clearInterval(timer);
  }, [playerId, previewMode]);

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
        const gemsEarned = updated.gems - farm.gems;
        if (updated.questCycle > farm.questCycle) {
          setHint(`اكتملت مجموعة المهام! بدأت مجموعة جديدة بأهداف ومكافآت مضاعفة · +${formatCoins(gemsEarned)} 💎`);
        } else if (gemsEarned > 0) {
          setHint(`أُنجزت مهمة وربحت ${formatCoins(gemsEarned)} 💎.`);
        } else if (action.type === "clearObstacle") {
          setHint(`أزلت العائق مقابل ${formatCoins(FARM_OBSTACLE_CLEAR_COST)} 💎.`);
        } else {
          setHint("");
        }
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
    if (nextTool === "buildHouse" && farm?.houseBuilt) return;
    setTool(nextTool);
    setHint(toolDescription(nextTool));
    setMenuOpen(false);
  };

  const placeShopItem = async (placement: FarmPlacement, position: FarmPosition) => {
    let placed = false;
    if (placement.kind === "plot") {
      placed = await act({ type: "buyPlotAt", x: position.x, y: position.y });
    } else if (placement.kind === "tree") {
      placed = await act({ type: "buyTreeAt", treeId: placement.treeId, x: position.x, y: position.y });
    } else {
      placed = await act({ type: "buildHouseAt", x: position.x, y: position.y });
    }
    if (placed) setTool(null);
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

    if (object?.type === "landParcel") {
      const [columnText, rowText] = object.id.split(":");
      const parcel = { column: Number(columnText), row: Number(rowText) };
      if (isFarmParcelAdjacent(farm, parcel.column, parcel.row)) {
        setPendingLandParcel(parcel);
      } else {
        setHint("اشترِ قطعة ملاصقة لأرضك أولاً لتتمكن من الوصول إلى هذه المنطقة.");
      }
      return;
    }

    if (object?.type === "obstacle") {
      await act({ type: "clearObstacle", obstacleId: object.id });
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
        const assignedWorker = farm.workers.find((worker) => worker.targetTreeId === tree.id);
        setHint(
          assignedWorker?.state === "harvesting"
            ? `العامل يجمع ${FRUIT_TREES[tree.kind].fruitName} الآن؛ سيكتمل خلال ${formatTime(Math.max(0, assignedWorker.arrivesAt - now))}.`
            : assignedWorker
            ? `العامل في طريقه لجمع ${FRUIT_TREES[tree.kind].fruitName}.`
            : `سيجمع العامل ${FRUIT_TREES[tree.kind].fruitName} تلقائياً.`,
        );
      } else {
        setHint(`ثمار ${FRUIT_TREES[tree.kind].fruitName} تنمو؛ سيجمعها العامل بعد نضجها.`);
      }
      return;
    }

    if (object) {
      setHint("هذه الخانة مشغولة. اختر خانة خضراء فارغة.");
      return;
    }

    if (!tool) return;

    let placed = false;
    switch (tool) {
      case "buyPlot":
        placed = await act({ type: "buyPlotAt", x: position.x, y: position.y });
        break;
      case "buildHouse":
        placed = await act({ type: "buildHouseAt", x: position.x, y: position.y });
        break;
      case "apple":
      case "orange":
      case "peach":
      case "lemon":
        placed = await act({ type: "buyTreeAt", treeId: tool, x: position.x, y: position.y });
        break;
    }
    if (placed) setTool(null);
  };

  const handleObjectDragEnd = async (
    object: FarmObjectRef,
    position: FarmPosition,
    targetObject: FarmObjectRef | null,
  ) => {
    if (targetObject && !(targetObject.type === object.type && targetObject.id === object.id)) {
      setHint(targetObject.type === "landParcel"
        ? "لا يمكن وضع العناصر على أرض مقفلة."
        : "هذا المكان مشغول. اسحب العنصر إلى خانة فارغة داخل أرضك.");
      return;
    }
    const moved = await act({
      type: "moveObjectTo",
      object,
      x: position.x,
      y: position.y,
    });
    if (moved) setHint(`تم نقل ${objectName(object)} إلى المكان الجديد.`);
  };

  const savePlayerName = async () => {
    const nextName = playerNameDraft.trim();
    if (!nextName || nextName.length > 32) {
      setError("اكتب اسماً من حرف واحد إلى 32 حرفاً.");
      return;
    }
    if (!player || previewMode) {
      setPlayerName(nextName);
      setEditingPlayerName(false);
      setHint("تم تحديث اسم اللاعب في العرض التجريبي.");
      return;
    }
    setNameSaving(true);
    setError("");
    try {
      await setDoc(doc(db, "users", player.uid), { name: nextName }, { merge: true });
      setPlayerName(nextName);
      setEditingPlayerName(false);
      setHint("تم تحديث اسم اللاعب.");
      await updateProfile(player, { displayName: nextName }).catch((profileError) => {
        console.warn("Farm name saved, but Firebase Auth profile sync failed:", profileError);
      });
    } catch (saveError) {
      console.error("Could not update farm player name:", saveError);
      setError("تعذّر حفظ الاسم. تحقق من الاتصال ثم حاول مجدداً.");
    } finally {
      setNameSaving(false);
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
        {!playerId ? (
          <Pressable
            onPress={() => router.replace("/?showLogin=1" as any)}
            style={styles.retryButton}
          >
            <Ionicons name="log-in-outline" size={17} color="#FFFFFF" />
            <Text style={styles.retryText}>تسجيل الدخول بالبريد الإلكتروني</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 3 }]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.topBar}>
        <View style={styles.greeting}>
          <Text style={styles.title} numberOfLines={1}>أهلاً، {playerName}</Text>
          <Text style={styles.subtitle}>المستوى {level} · {readyFields + readyTrees} جاهز للجمع</Text>
        </View>
        {previewMode ? (
          <View style={styles.previewTag}><Ionicons name="eye-outline" size={13} color={C.greenDark} /><Text style={styles.previewText}>تجربة</Text></View>
        ) : null}
        <View style={styles.balanceGroup}>
          <View style={styles.coins}>
            <Ionicons name="cash" size={17} color="#986D1F" />
            <Text style={styles.coinText}>{formatCoins(farm.coins)}</Text>
          </View>
          <View style={styles.gems}>
            <Text style={styles.gemIcon}>💎</Text>
            <Text style={styles.gemText}>{formatCoins(farm.gems)}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.workspace, isWide ? styles.workspaceWide : styles.workspaceNarrow]}>
        <View style={styles.worldPane}>
          <FarmScene
            ref={sceneRef}
            farm={farm}
            now={now}
            style={styles.scene}
            onTilePress={(position, object) => void handleTilePress(position, object)}
            onObjectDragEnd={(object, position, targetObject) => {
              void handleObjectDragEnd(object, position, targetObject);
            }}
          />
          {tool ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="إغلاق وضع الشراء"
              onPress={() => {
                setTool(null);
                setHint("تم إغلاق وضع الشراء.");
              }}
              style={styles.placementClose}
              hitSlop={8}
            >
              <Ionicons name="close" size={18} color="#FFFFFF" />
              <Text style={styles.placementCloseText}>إغلاق</Text>
            </Pressable>
          ) : null}
        </View>

        {menuOpen ? (
          <View style={[styles.menuPanel, isWide ? styles.menuPanelWide : { height: panelHeight }]}>
            <View style={styles.menuHeader}>
              <View>
                <Text style={styles.menuTitle}>
                  {menuTab === "shop" ? "متجر المزرعة" : menuTab === "storage" ? "مخزن المزرعة" : "مهام المزرعة"}
                </Text>
                <Text style={styles.menuHint}>
                  {menuTab === "shop" ? "اختر ما تحتاجه لمزرعتك" : menuTab === "storage" ? "محاصيلك وثمارك المتاحة" : "أنجز المهام واكسب الجواهر"}
                </Text>
              </View>
              <Pressable onPress={() => setMenuOpen(false)} style={styles.closeMenuButton}>
                <Ionicons name="close" size={18} color={C.greenDark} />
              </Pressable>
            </View>

            {menuTab === "shop" ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.menuContent}>
                <SectionLabel>العمال والأرض</SectionLabel>
                <ShopCard
                  title="توظيف عامل مزرعة"
                  subtitle="يتنقل ويجمع ثمار الأشجار الناضجة"
                  icon="person-add-outline"
                  count={`العمال: ${farm.workers.length}`}
                  actionLabel={`توظيف · ${formatCoins(getNextWorkerCost(farm))}`}
                  disabled={busy || farm.coins < getNextWorkerCost(farm)}
                  onAction={() => void act({ type: "buyWorker" })}
                />
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
                {!farm.houseBuilt ? (
                  <ShopCard
                    title="بناء منزل المزرعة"
                    subtitle="اسحب المنزل إلى أرض فارغة"
                    icon="home-outline"
                    price={FARM_HOUSE_COST}
                    selected={tool === "buildHouse"}
                    onPress={() => selectTool("buildHouse")}
                    onDrop={(x, y) => void handleShopDrop({ kind: "house" }, x, y)}
                    onDragChange={(active, x, y) => beginDrag("منزل المزرعة", active, x, y)}
                  />
                ) : null}

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
                      title={`${tree.emoji} ${tree.name}`}
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
                    title={`${FRUIT_TREES[treeId].emoji} ${FRUIT_TREES[treeId].fruitName}`}
                    count={farm.fruitInventory[treeId]}
                    unitPrice={FRUIT_TREES[treeId].sellPrice}
                    disabled={busy || farm.fruitInventory[treeId] < 1}
                    onSell={() => void act({ type: "sellFruit", treeId })}
                  />
                ))}
                {totalStored === 0 ? <Text style={styles.emptyStorage}>سيظهر ما تجمعه من محاصيل وثمار هنا.</Text> : null}
              </ScrollView>
            ) : null}

            {menuTab === "quests" ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.menuContent}>
                <View style={styles.questIntro}>
                  <View style={styles.questIntroTop}>
                    <Text style={styles.questGemBalance}>{formatCoins(farm.gems)} 💎</Text>
                    <Text style={styles.questCycle}>المجموعة {formatCoins(farm.questCycle + 1)}</Text>
                  </View>
                  <Text style={styles.questIntroText}>
                    تُضاف الجواهر عند إنجاز كل مهمة. أكمل المجموعة لتتضاعف أهداف ومكافآت المجموعة التالية.
                  </Text>
                </View>
                <SectionLabel>المهام الحالية</SectionLabel>
                {farm.quests.map((quest) => (
                  <FarmQuestCard key={quest.id} quest={quest} />
                ))}
              </ScrollView>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.bottomBar}>
        <View style={styles.hintIcon}><Ionicons name="leaf-outline" size={15} color={C.greenDark} /></View>
        <Text style={styles.hintText} numberOfLines={2}>{hint || toolDescription(tool)}</Text>
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

      <View style={[styles.bottomNavigation, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {([
          ["shop", "المتجر", "basket-outline"],
          ["storage", "المخزن", "cube-outline"],
          ["quests", "المهام", "flag-outline"],
          ["settings", "الإعدادات", "settings-outline"],
        ] as const).map(([key, label, icon]) => {
          const selected = key === "settings" ? settingsOpen : menuOpen && menuTab === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                if (key === "settings") {
                  setMenuOpen(false);
                  setSettingsOpen(true);
                  setPlayerNameDraft(playerName);
                  setEditingPlayerName(false);
                  return;
                }
                setSettingsOpen(false);
                if (menuOpen && menuTab === key) {
                  setMenuOpen(false);
                } else {
                  setMenuTab(key);
                  setMenuOpen(true);
                }
              }}
              style={[styles.bottomNavButton, selected && styles.bottomNavButtonActive]}
            >
              <Ionicons name={icon} size={20} color={selected ? "#FFFFFF" : C.greenDark} />
              <Text style={[styles.bottomNavLabel, selected && styles.bottomNavLabelActive]}>{label}</Text>
              {key === "storage" && totalStored > 0 ? (
                <View style={styles.navBadge}><Text style={styles.navBadgeText}>{Math.min(totalStored, 99)}</Text></View>
              ) : null}
            </Pressable>
          );
        })}
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
        visible={settingsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSettingsOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.settingsModal}>
            <View style={styles.modalHeading}>
              <View>
                <Text style={styles.modalTitle}>إعدادات اللاعب</Text>
                <Text style={styles.modalSubtitle}>الاسم وحساب حفظ المزرعة</Text>
              </View>
              <Pressable onPress={() => setSettingsOpen(false)} style={styles.closeMenuButton}>
                <Ionicons name="close" size={18} color={C.greenDark} />
              </Pressable>
            </View>

            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>اسم اللاعب</Text>
              {editingPlayerName ? (
                <View style={styles.nameEditRow}>
                  <TextInput
                    value={playerNameDraft}
                    onChangeText={setPlayerNameDraft}
                    placeholder="اكتب اسم اللاعب"
                    placeholderTextColor={C.muted}
                    maxLength={32}
                    autoFocus
                    textAlign="right"
                    style={styles.nameInput}
                  />
                  <Pressable disabled={nameSaving} onPress={() => void savePlayerName()} style={styles.nameSaveButton}>
                    {nameSaving
                      ? <ActivityIndicator size="small" color="#FFFFFF" />
                      : <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setEditingPlayerName(false);
                      setPlayerNameDraft(playerName);
                    }}
                    style={styles.nameCancelButton}
                  >
                    <Ionicons name="close" size={18} color={C.greenDark} />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.settingsNameRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="تعديل اسم اللاعب"
                    onPress={() => {
                      setPlayerNameDraft(playerName);
                      setEditingPlayerName(true);
                    }}
                    style={styles.editNameButton}
                  >
                    <Text style={styles.editNameLabel}>تعديل</Text>
                    <Text style={styles.editNameIcon}>✏️</Text>
                  </Pressable>
                  <Text style={styles.settingsPlayerName}>{playerName}</Text>
                </View>
              )}
            </View>

            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>حساب حفظ اللعبة</Text>
              <Text style={styles.accountEmail}>
                {previewMode ? "وضع التجربة — لا يرتبط بحساب" : player?.email || "لا يوجد بريد إلكتروني"}
              </Text>
              <Pressable
                onPress={() => {
                  if (player && !previewMode) {
                    void signOut(auth)
                      .then(() => router.replace("/?showLogin=1" as any))
                      .catch((signOutError) => {
                        console.error("Could not sign out from farm settings:", signOutError);
                        setError("تعذّر تسجيل الخروج. حاول مجدداً.");
                      });
                  } else {
                    router.replace("/?showLogin=1" as any);
                  }
                }}
                style={styles.authActionButton}
              >
                <Ionicons
                  name={player && !previewMode ? "log-out-outline" : "log-in-outline"}
                  size={18}
                  color="#FFFFFF"
                />
                <Text style={styles.authActionText}>
                  {player && !previewMode ? "تسجيل الخروج" : "تسجيل الدخول بالبريد الإلكتروني"}
                </Text>
              </Pressable>
              <Text style={styles.settingsFootnote}>
                {previewMode
                  ? "التجربة لا تحفظ تغييراتها على الحساب."
                  : "مزرعتك محفوظة في Firebase Firestore ضمن الحساب المسجّل."}
              </Text>
            </View>
          </View>
        </View>
      </Modal>

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

      <Modal
        visible={pendingLandParcel !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingLandParcel(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.cropModal}>
            <View style={styles.modalHeading}>
              <View>
                <Text style={styles.modalTitle}>توسعة أرض المزرعة</Text>
                <Text style={styles.modalSubtitle}>تُدمج القطعة فور الشراء ويتوسع السياج حول أرضك.</Text>
              </View>
              <Pressable onPress={() => setPendingLandParcel(null)} style={styles.closeMenuButton}>
                <Ionicons name="close" size={18} color={C.greenDark} />
              </Pressable>
            </View>
            <View style={styles.expansionPrice}>
              <Ionicons name="cash-outline" size={19} color="#986D1F" />
              <Text style={styles.expansionPriceText}>
                السعر: {formatCoins(nextLandExpansionCost)} عملة
              </Text>
            </View>
            <Text style={styles.expansionBalance}>رصيدك: {formatCoins(farm.coins)} عملة</Text>
            <Pressable
              disabled={busy || farm.coins < nextLandExpansionCost}
              onPress={async () => {
                if (!pendingLandParcel) return;
                const bought = await act({
                  type: "buyLandParcel",
                  column: pendingLandParcel.column,
                  row: pendingLandParcel.row,
                });
                if (bought) setPendingLandParcel(null);
              }}
              style={[
                styles.expansionBuyButton,
                (busy || farm.coins < nextLandExpansionCost) && styles.disabled,
              ]}
            >
              <Text style={styles.expansionBuyText}>
                {farm.coins < nextLandExpansionCost ? "عملات غير كافية" : "شراء ودمج الأرض"}
              </Text>
            </Pressable>
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
  greeting: { flex: 1, minWidth: 0 },
  title: { color: C.ink, fontSize: 14, fontWeight: "900", textAlign: "right" },
  subtitle: { color: C.muted, fontSize: 9, marginTop: 2, textAlign: "right" },
  previewTag: { paddingHorizontal: 7, paddingVertical: 6, borderRadius: 10, backgroundColor: "#E7F2DF", flexDirection: "row", alignItems: "center", gap: 4 },
  previewText: { color: C.greenDark, fontSize: 9, fontWeight: "800" },
  balanceGroup: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  coins: { minHeight: 35, paddingHorizontal: 9, borderRadius: 12, backgroundColor: "#FFF3D0", flexDirection: "row", alignItems: "center", gap: 4 },
  coinText: { color: "#775517", fontSize: 11, fontWeight: "900" },
  gems: { minHeight: 35, paddingHorizontal: 8, borderRadius: 12, backgroundColor: "#EEE6FA", flexDirection: "row", alignItems: "center", gap: 4 },
  gemIcon: { fontSize: 14 },
  gemText: { color: "#6944A0", fontSize: 11, fontWeight: "900" },
  workspace: { flex: 1, minHeight: 0 },
  workspaceWide: { flexDirection: "row-reverse" },
  workspaceNarrow: { flexDirection: "column" },
  worldPane: { position: "relative", flex: 1, minHeight: 220, overflow: "hidden", backgroundColor: C.canvas },
  scene: { flex: 1 },
  placementClose: { position: "absolute", top: 13, right: 13, minHeight: 38, paddingHorizontal: 12, borderRadius: 14, backgroundColor: "rgba(49,95,58,0.95)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, zIndex: 5, elevation: 8 },
  placementCloseText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  menuPanel: { backgroundColor: C.paper, borderColor: "rgba(54,94,48,0.18)", overflow: "hidden" },
  menuPanelWide: { width: 320, height: "100%", borderLeftWidth: 1 },
  menuHeader: { minHeight: 54, paddingHorizontal: 13, paddingVertical: 8, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#E8EDDF" },
  menuTitle: { color: C.ink, fontSize: 13, fontWeight: "900", textAlign: "right" },
  menuHint: { color: C.muted, fontSize: 9, marginTop: 3, textAlign: "right" },
  closeMenuButton: { width: 32, height: 32, borderRadius: 11, backgroundColor: "#EDF3E7", alignItems: "center", justifyContent: "center" },
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
  storageRow: { minHeight: 50, paddingHorizontal: 6, flexDirection: "row-reverse", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: "#EFF3EC" },
  storageCopy: { flex: 1, alignItems: "flex-end" },
  storageName: { color: C.ink, fontSize: 10, fontWeight: "900" },
  storageMeta: { color: C.muted, fontSize: 8, marginTop: 2 },
  storageCount: { color: C.ink, fontSize: 10, fontWeight: "900", minWidth: 38, textAlign: "left" },
  sellButton: { minWidth: 44, minHeight: 29, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "#E8F3E3" },
  sellText: { color: C.greenDark, fontSize: 9, fontWeight: "900" },
  emptyStorage: { color: C.muted, fontSize: 10, textAlign: "center", paddingVertical: 18 },
  questIntro: { padding: 11, borderRadius: 13, backgroundColor: "#F1EAFB", gap: 6 },
  questIntroTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  questCycle: { color: "#51387C", fontSize: 11, fontWeight: "900" },
  questGemBalance: { color: "#6944A0", fontSize: 10, fontWeight: "900" },
  questIntroText: { color: "#695783", fontSize: 9, lineHeight: 15, textAlign: "right" },
  questCard: { padding: 10, borderRadius: 12, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E6DEEF", gap: 7 },
  questCardCompleted: { backgroundColor: "#F0F7E9", borderColor: "#9FBE87" },
  questCardHeader: { flexDirection: "row-reverse", alignItems: "flex-start", justifyContent: "space-between", gap: 6 },
  questTitle: { flex: 1, color: C.ink, fontSize: 10, lineHeight: 15, fontWeight: "800", textAlign: "right" },
  questReward: { color: "#6944A0", fontSize: 9, fontWeight: "900" },
  questProgressTrack: { height: 6, overflow: "hidden", borderRadius: 4, backgroundColor: "#E9E7E2" },
  questProgressFill: { height: "100%", borderRadius: 4, backgroundColor: C.green },
  questStatus: { color: C.muted, fontSize: 8, textAlign: "right" },
  bottomBar: { minHeight: 42, paddingHorizontal: 10, paddingVertical: 4, flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: "#F7F7E8", borderTopWidth: 1, borderTopColor: "rgba(70,104,50,0.14)" },
  hintIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: "#E7F0DC", alignItems: "center", justifyContent: "center" },
  hintText: { flex: 1, color: C.greenDark, fontSize: 9, fontWeight: "700", textAlign: "right" },
  refreshButton: { width: 30, height: 30, borderRadius: 9, backgroundColor: "#E8F0DB", alignItems: "center", justifyContent: "center" },
  bottomNavigation: { minHeight: 61, paddingTop: 6, paddingHorizontal: 9, backgroundColor: "#FFFDF4", borderTopWidth: 1, borderTopColor: "rgba(70,104,50,0.18)", flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-around", gap: 5 },
  bottomNavButton: { position: "relative", flex: 1, minHeight: 49, borderRadius: 14, alignItems: "center", justifyContent: "center", gap: 3 },
  bottomNavButtonActive: { backgroundColor: C.green },
  bottomNavLabel: { color: C.greenDark, fontSize: 9, fontWeight: "800" },
  bottomNavLabelActive: { color: "#FFFFFF" },
  navBadge: { position: "absolute", top: 2, right: "23%", minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, backgroundColor: C.gold, alignItems: "center", justifyContent: "center" },
  navBadgeText: { color: "#5B4518", fontSize: 8, fontWeight: "900" },
  previewNotice: { position: "absolute", top: 64, alignSelf: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: "rgba(255,253,244,0.92)", flexDirection: "row", alignItems: "center", gap: 5 },
  previewNoticeText: { color: C.greenDark, fontSize: 9, fontWeight: "800" },
  dragGhost: { position: "absolute", minHeight: 38, paddingHorizontal: 10, borderRadius: 12, backgroundColor: "rgba(49,95,58,0.92)", flexDirection: "row-reverse", alignItems: "center", gap: 6, zIndex: 20, elevation: 8 },
  dragGhostText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  errorToast: { position: "absolute", left: 14, right: 14, bottom: 52, minHeight: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: "#FCEAE4", flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 8 },
  errorToastText: { flex: 1, color: C.red, fontSize: 10, textAlign: "right" },
  modalBackdrop: { flex: 1, padding: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(20,37,22,0.48)" },
  cropModal: { width: "100%", maxWidth: 390, padding: 14, borderRadius: 20, backgroundColor: C.paper, gap: 8, elevation: 10 },
  settingsModal: { width: "100%", maxWidth: 430, padding: 16, borderRadius: 22, backgroundColor: C.paper, gap: 14, elevation: 12 },
  settingsSection: { padding: 13, borderRadius: 15, backgroundColor: "#F5F7ED", gap: 9 },
  settingsLabel: { color: C.greenDark, fontSize: 11, fontWeight: "900", textAlign: "right" },
  settingsNameRow: { minHeight: 44, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 8 },
  settingsPlayerName: { flex: 1, color: C.ink, fontSize: 13, fontWeight: "900", textAlign: "right" },
  editNameButton: { minHeight: 34, paddingHorizontal: 10, borderRadius: 11, backgroundColor: "#E5EFDB", flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  editNameLabel: { color: C.greenDark, fontSize: 10, fontWeight: "800" },
  editNameIcon: { fontSize: 14 },
  nameEditRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  nameInput: { flex: 1, minHeight: 42, paddingHorizontal: 11, borderRadius: 11, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: C.border, color: C.ink, fontSize: 12 },
  nameSaveButton: { width: 39, height: 39, borderRadius: 12, backgroundColor: C.green, alignItems: "center", justifyContent: "center" },
  nameCancelButton: { width: 39, height: 39, borderRadius: 12, backgroundColor: "#E5EFDB", alignItems: "center", justifyContent: "center" },
  accountEmail: { color: C.ink, fontSize: 11, fontWeight: "700", textAlign: "right", writingDirection: "ltr" },
  authActionButton: { minHeight: 43, paddingHorizontal: 12, borderRadius: 13, backgroundColor: C.green, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 7 },
  authActionText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  settingsFootnote: { color: C.muted, fontSize: 9, textAlign: "right", lineHeight: 14 },
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
  expansionPrice: { minHeight: 46, borderRadius: 13, backgroundColor: "#FFF4D4", flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  expansionPriceText: { color: "#805F1D", fontSize: 12, fontWeight: "900" },
  expansionBalance: { color: C.muted, fontSize: 10, textAlign: "center" },
  expansionBuyButton: { minHeight: 43, borderRadius: 13, backgroundColor: C.green, alignItems: "center", justifyContent: "center", marginTop: 3 },
  expansionBuyText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
});
