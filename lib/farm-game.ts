import { doc, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type CropId = "wheat" | "carrot" | "corn";

export interface CropDefinition {
  id: CropId;
  name: string;
  seedPrice: number;
  growMs: number;
  harvestAmount: number;
  sellPrice: number;
  color: string;
  lightColor: string;
}

export const CROPS: Record<CropId, CropDefinition> = {
  wheat: {
    id: "wheat",
    name: "قمح",
    seedPrice: 5,
    growMs: 30_000,
    harvestAmount: 3,
    sellPrice: 4,
    color: "#DDA93F",
    lightColor: "#F7E9B7",
  },
  carrot: {
    id: "carrot",
    name: "جزر",
    seedPrice: 8,
    growMs: 60_000,
    harvestAmount: 2,
    sellPrice: 9,
    color: "#EF8446",
    lightColor: "#FBE0CC",
  },
  corn: {
    id: "corn",
    name: "ذرة",
    seedPrice: 12,
    growMs: 90_000,
    harvestAmount: 2,
    sellPrice: 13,
    color: "#E4C24E",
    lightColor: "#F8F0C8",
  },
};

export const CROP_ORDER: CropId[] = ["wheat", "carrot", "corn"];
export const FARM_PLOT_COUNT = 24;
export const INITIAL_UNLOCKED_PLOTS = 6;
export const FIRST_PLOT_EXPANSION_COST = 90;
export const FARM_HOUSE_COST = 180;
export const FARM_HOUSE_MAX_LEVEL = 3;
export const FARM_HOUSE_UPGRADE_COSTS = [260, 420] as const;
export const WATER_CAPACITY = 8;
export const WATER_REGEN_MS = 30_000;
export const WATERING_DURATION_MS = 45_000;

export interface FarmPlot {
  id: number;
  unlocked: boolean;
  cropId: CropId | null;
  plantedAt: number | null;
  growthProgressMs: number;
  lastGrowthAt: number | null;
  wateredUntil: number | null;
}

export interface FarmGameSave {
  version: 3;
  coins: number;
  seeds: Record<CropId, number>;
  inventory: Record<CropId, number>;
  plots: FarmPlot[];
  water: number;
  waterUpdatedAt: number;
  houseBuilt: boolean;
  houseLevel: number;
  totalHarvests: number;
  createdAt: number;
  updatedAt: number;
}

export type FarmAction =
  | { type: "plant"; plotId: number; cropId: CropId }
  | { type: "harvest"; plotId: number }
  | { type: "buySeed"; cropId: CropId }
  | { type: "sellCrop"; cropId: CropId }
  | { type: "unlockPlot"; plotId: number }
  | { type: "waterPlot"; plotId: number }
  | { type: "buildHouse" }
  | { type: "upgradeHouse" };

export function getFarmHouseActionCost(level: number): number | null {
  if (level <= 0) return FARM_HOUSE_COST;
  if (level >= FARM_HOUSE_MAX_LEVEL) return null;
  return FARM_HOUSE_UPGRADE_COSTS[level - 1] ?? null;
}

function count(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

function isCropId(value: unknown): value is CropId {
  return value === "wheat" || value === "carrot" || value === "corn";
}

function createInitialFarm(now = Date.now()): FarmGameSave {
  return {
    version: 3,
    coins: 80,
    seeds: { wheat: 3, carrot: 1, corn: 0 },
    inventory: { wheat: 0, carrot: 0, corn: 0 },
    plots: Array.from({ length: FARM_PLOT_COUNT }, (_, id) => ({
      id,
      unlocked: id < INITIAL_UNLOCKED_PLOTS,
      cropId: null,
      plantedAt: null,
      growthProgressMs: 0,
      lastGrowthAt: null,
      wateredUntil: null,
    })),
    water: WATER_CAPACITY,
    waterUpdatedAt: now,
    houseBuilt: false,
    houseLevel: 0,
    totalHarvests: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function createDemoFarmGame(now = Date.now()): FarmGameSave {
  const farm = createInitialFarm(now);
  farm.coins = 245;
  farm.seeds = { wheat: 4, carrot: 2, corn: 1 };
  farm.inventory = { wheat: 3, carrot: 1, corn: 0 };
  farm.totalHarvests = 4;
  farm.plots[0] = {
    ...farm.plots[0],
    cropId: "wheat",
    plantedAt: now - 35_000,
    growthProgressMs: CROPS.wheat.growMs,
  };
  farm.plots[1] = {
    ...farm.plots[1],
    cropId: "carrot",
    plantedAt: now - 24_000,
    growthProgressMs: 25_000,
    lastGrowthAt: now,
    wateredUntil: now + 20_000,
  };
  farm.plots[2] = {
    ...farm.plots[2],
    cropId: "corn",
    plantedAt: now - 48_000,
    growthProgressMs: 28_000,
    lastGrowthAt: now,
    wateredUntil: null,
  };
  farm.plots[3] = {
    ...farm.plots[3],
    cropId: "wheat",
    plantedAt: now - 7_000,
    growthProgressMs: 7_000,
    lastGrowthAt: now,
    wateredUntil: null,
  };
  farm.water = 5;
  farm.updatedAt = now;
  return farm;
}

function getGrowthProgressMs(plot: FarmPlot, now: number): number {
  if (!plot.cropId) return 0;
  const base = Math.max(0, plot.growthProgressMs);
  const growthStart = plot.lastGrowthAt ?? now;
  const growthEnd = plot.wateredUntil === null ? growthStart : Math.min(now, plot.wateredUntil);
  const activeGrowth = Math.max(0, growthEnd - growthStart);
  return Math.min(CROPS[plot.cropId].growMs, base + activeGrowth);
}

function advanceFarmTime(farm: FarmGameSave, now: number): FarmGameSave {
  const next: FarmGameSave = {
    ...farm,
    seeds: { ...farm.seeds },
    inventory: { ...farm.inventory },
    plots: farm.plots.map((plot) => ({ ...plot })),
    updatedAt: now,
  };
  const elapsedWaterTime = Math.max(0, now - farm.waterUpdatedAt);
  const regeneratedWater = Math.floor(elapsedWaterTime / WATER_REGEN_MS);
  next.water = Math.min(WATER_CAPACITY, farm.water + regeneratedWater);
  next.waterUpdatedAt =
    next.water >= WATER_CAPACITY
      ? now
      : farm.waterUpdatedAt + regeneratedWater * WATER_REGEN_MS;

  for (const plot of next.plots) {
    if (!plot.cropId) continue;
    plot.growthProgressMs = getGrowthProgressMs(plot, now);
    plot.lastGrowthAt = now;
  }
  return next;
}

export function getCurrentWater(farm: FarmGameSave, now = Date.now()): number {
  const regenerated = Math.floor(Math.max(0, now - farm.waterUpdatedAt) / WATER_REGEN_MS);
  return Math.min(WATER_CAPACITY, farm.water + regenerated);
}

export function getWaterRefillMs(farm: FarmGameSave, now = Date.now()): number {
  if (getCurrentWater(farm, now) >= WATER_CAPACITY) return 0;
  const elapsed = Math.max(0, now - farm.waterUpdatedAt);
  return WATER_REGEN_MS - (elapsed % WATER_REGEN_MS);
}

export function getPlotGrowthState(plot: FarmPlot, now = Date.now()) {
  if (!plot.cropId) {
    return { progressMs: 0, progress: 0, remaining: 0, ready: false, watered: false };
  }
  const duration = CROPS[plot.cropId].growMs;
  const progressMs = getGrowthProgressMs(plot, now);
  const progress = Math.min(1, progressMs / duration);
  return {
    progressMs,
    progress,
    remaining: Math.max(0, duration - progressMs),
    ready: progress >= 1,
    watered: plot.wateredUntil !== null && plot.wateredUntil > now,
  };
}

function normalizeFarm(data: Record<string, unknown>, now = Date.now()): FarmGameSave {
  const seeds = (data.seeds ?? {}) as Record<string, unknown>;
  const inventory = (data.inventory ?? {}) as Record<string, unknown>;
  const rawPlots = Array.isArray(data.plots) ? data.plots : [];
  const initial = createInitialFarm(now);

  const normalized: FarmGameSave = {
    version: 3,
    coins: count(data.coins, initial.coins),
    seeds: {
      wheat: count(seeds.wheat, initial.seeds.wheat),
      carrot: count(seeds.carrot, initial.seeds.carrot),
      corn: count(seeds.corn, initial.seeds.corn),
    },
    inventory: {
      wheat: count(inventory.wheat),
      carrot: count(inventory.carrot),
      corn: count(inventory.corn),
    },
    plots: Array.from({ length: FARM_PLOT_COUNT }, (_, id) => {
      const raw = (rawPlots[id] ?? {}) as Record<string, unknown>;
      const cropId = isCropId(raw.cropId) ? raw.cropId : null;
      const plantedAt = typeof raw.plantedAt === "number" ? raw.plantedAt : null;
      const legacyGrowth =
        cropId && plantedAt !== null
          ? Math.min(CROPS[cropId].growMs, Math.max(0, now - plantedAt))
          : 0;
      return {
        id,
        unlocked:
          raw.unlocked === true ||
          (rawPlots.length === 0 && id < INITIAL_UNLOCKED_PLOTS),
        cropId: cropId && plantedAt ? cropId : null,
        plantedAt: cropId && plantedAt ? plantedAt : null,
        growthProgressMs: count(raw.growthProgressMs, legacyGrowth),
        lastGrowthAt:
          cropId && plantedAt
            ? (typeof raw.lastGrowthAt === "number" ? raw.lastGrowthAt : now)
            : null,
        wateredUntil:
          cropId && typeof raw.wateredUntil === "number" ? raw.wateredUntil : null,
      };
    }),
    water: Math.min(WATER_CAPACITY, count(data.water, initial.water)),
    waterUpdatedAt: count(data.waterUpdatedAt, now),
    houseBuilt: data.houseBuilt === true || count(data.houseLevel) > 0,
    houseLevel: Math.min(
      FARM_HOUSE_MAX_LEVEL,
      data.houseBuilt === true
        ? Math.max(1, count(data.houseLevel, 1))
        : count(data.houseLevel),
    ),
    totalHarvests: count(data.totalHarvests),
    createdAt: count(data.createdAt, now),
    updatedAt: count(data.updatedAt, now),
  };
  return advanceFarmTime(normalized, now);
}

export async function loadFarmGame(playerId: string): Promise<FarmGameSave> {
  const farmRef = doc(db, "farms", playerId);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(farmRef);
    if (snapshot.exists()) {
      const data = snapshot.data();
      const farm = normalizeFarm(data);
      const needsMigration =
        data.version !== 3 ||
        !Array.isArray(data.plots) ||
        data.plots.length !== FARM_PLOT_COUNT ||
        !("water" in data) ||
        !("waterUpdatedAt" in data) ||
        !("houseBuilt" in data) ||
        !("houseLevel" in data);
      if (needsMigration) transaction.set(farmRef, farm);
      return farm;
    }

    const initial = createInitialFarm();
    transaction.set(farmRef, initial);
    return initial;
  });
}

export async function performFarmAction(
  playerId: string,
  action: FarmAction,
): Promise<FarmGameSave> {
  const farmRef = doc(db, "farms", playerId);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(farmRef);
    const farm = snapshot.exists()
      ? normalizeFarm(snapshot.data())
      : createInitialFarm();
    const next = applyFarmActionToState(farm, action);
    transaction.set(farmRef, next);
    return next;
  });
}

export function applyFarmActionToState(
  farm: FarmGameSave,
  action: FarmAction,
  now = Date.now(),
): FarmGameSave {
  const next = advanceFarmTime(farm, now);
  const plot =
    action.type === "buySeed" ||
    action.type === "sellCrop" ||
    action.type === "buildHouse" ||
    action.type === "upgradeHouse"
      ? undefined
      : next.plots[action.plotId];

  switch (action.type) {
    case "buySeed": {
      const crop = CROPS[action.cropId];
      if (next.coins < crop.seedPrice) throw new Error("لا توجد عملات كافية لشراء البذور");
      next.coins -= crop.seedPrice;
      next.seeds[action.cropId] += 1;
      break;
    }
    case "sellCrop": {
      const amount = next.inventory[action.cropId];
      if (amount < 1) throw new Error("لا يوجد محصول للبيع");
      next.coins += amount * CROPS[action.cropId].sellPrice;
      next.inventory[action.cropId] = 0;
      break;
    }
    case "unlockPlot": {
      if (!plot || plot.unlocked) throw new Error("هذه الأرض مفتوحة بالفعل");
      const unlockedCount = next.plots.filter((item) => item.unlocked).length;
      const cost = FIRST_PLOT_EXPANSION_COST + Math.max(0, unlockedCount - INITIAL_UNLOCKED_PLOTS) * 35;
      if (next.coins < cost) throw new Error("اجمع المزيد من العملات لفتح أرض جديدة");
      plot.unlocked = true;
      next.coins -= cost;
      break;
    }
    case "buildHouse": {
      if (next.houseBuilt) throw new Error("المنزل مبني بالفعل");
      if (next.coins < FARM_HOUSE_COST) throw new Error("اجمع المزيد من العملات لبناء المنزل");
      next.coins -= FARM_HOUSE_COST;
      next.houseBuilt = true;
      next.houseLevel = 1;
      break;
    }
    case "upgradeHouse": {
      if (!next.houseBuilt || next.houseLevel < 1) throw new Error("ابنِ المنزل أولاً قبل تطويره");
      const cost = getFarmHouseActionCost(next.houseLevel);
      if (cost === null) throw new Error("وصل المنزل إلى أعلى مستوى");
      if (next.coins < cost) throw new Error("اجمع المزيد من العملات لتطوير المنزل");
      next.coins -= cost;
      next.houseLevel += 1;
      break;
    }
    case "plant": {
      if (!plot?.unlocked) throw new Error("افتح هذه الأرض أولاً");
      if (plot.cropId) throw new Error("هذه الأرض مزروعة بالفعل");
      if (next.seeds[action.cropId] < 1) throw new Error("لا توجد بذور كافية؛ اشترِ بذوراً من السوق");
      next.seeds[action.cropId] -= 1;
      plot.cropId = action.cropId;
      plot.plantedAt = now;
      plot.growthProgressMs = 0;
      plot.lastGrowthAt = now;
      plot.wateredUntil = null;
      break;
    }
    case "waterPlot": {
      if (!plot?.unlocked || !plot.cropId) throw new Error("ازرع الحقل قبل سقيه");
      if (getGrowthProgressMs(plot, now) >= CROPS[plot.cropId].growMs) {
        throw new Error("المحصول جاهز للحصاد ولا يحتاج إلى الري");
      }
      if (plot.wateredUntil !== null && plot.wateredUntil > now) {
        throw new Error("هذا الحقل رُوي بالفعل؛ انتظر حتى يحتاج إلى الماء");
      }
      if (next.water < 1) throw new Error("نفد الماء؛ سيتجدد تلقائياً خلال قليل");
      next.water -= 1;
      plot.lastGrowthAt = now;
      plot.wateredUntil = now + WATERING_DURATION_MS;
      break;
    }
    case "harvest": {
      if (!plot?.cropId) throw new Error("لا يوجد محصول في هذه الأرض");
      const crop = CROPS[plot.cropId];
      if (getGrowthProgressMs(plot, now) < crop.growMs) throw new Error("المحصول لم ينضج بعد");
      next.inventory[plot.cropId] += crop.harvestAmount;
      next.totalHarvests += 1;
      plot.cropId = null;
      plot.plantedAt = null;
      plot.growthProgressMs = 0;
      plot.lastGrowthAt = null;
      plot.wateredUntil = null;
      break;
    }
  }

  return next;
}
