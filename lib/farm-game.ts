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
export const FARM_PLOT_COUNT = 12;
export const INITIAL_UNLOCKED_PLOTS = 6;
export const FIRST_PLOT_EXPANSION_COST = 90;

export interface FarmPlot {
  id: number;
  unlocked: boolean;
  cropId: CropId | null;
  plantedAt: number | null;
}

export interface FarmGameSave {
  version: 1;
  coins: number;
  seeds: Record<CropId, number>;
  inventory: Record<CropId, number>;
  plots: FarmPlot[];
  totalHarvests: number;
  createdAt: number;
  updatedAt: number;
}

export type FarmAction =
  | { type: "plant"; plotId: number; cropId: CropId }
  | { type: "harvest"; plotId: number }
  | { type: "buySeed"; cropId: CropId }
  | { type: "sellCrop"; cropId: CropId }
  | { type: "unlockPlot"; plotId: number };

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
    version: 1,
    coins: 80,
    seeds: { wheat: 3, carrot: 1, corn: 0 },
    inventory: { wheat: 0, carrot: 0, corn: 0 },
    plots: Array.from({ length: FARM_PLOT_COUNT }, (_, id) => ({
      id,
      unlocked: id < INITIAL_UNLOCKED_PLOTS,
      cropId: null,
      plantedAt: null,
    })),
    totalHarvests: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeFarm(data: Record<string, unknown>, now = Date.now()): FarmGameSave {
  const seeds = (data.seeds ?? {}) as Record<string, unknown>;
  const inventory = (data.inventory ?? {}) as Record<string, unknown>;
  const rawPlots = Array.isArray(data.plots) ? data.plots : [];
  const initial = createInitialFarm(now);

  return {
    version: 1,
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
      return {
        id,
        unlocked:
          raw.unlocked === true ||
          (rawPlots.length === 0 && id < INITIAL_UNLOCKED_PLOTS),
        cropId: cropId && plantedAt ? cropId : null,
        plantedAt: cropId && plantedAt ? plantedAt : null,
      };
    }),
    totalHarvests: count(data.totalHarvests),
    createdAt: count(data.createdAt, now),
    updatedAt: count(data.updatedAt, now),
  };
}

export async function loadFarmGame(playerId: string): Promise<FarmGameSave> {
  const farmRef = doc(db, "farms", playerId);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(farmRef);
    if (snapshot.exists()) return normalizeFarm(snapshot.data());

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
    const next: FarmGameSave = {
      ...farm,
      seeds: { ...farm.seeds },
      inventory: { ...farm.inventory },
      plots: farm.plots.map((plot) => ({ ...plot })),
      updatedAt: Date.now(),
    };
    const plot =
      action.type === "buySeed" || action.type === "sellCrop"
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
        next.coins -= cost;
        plot.unlocked = true;
        break;
      }
      case "plant": {
        if (!plot?.unlocked) throw new Error("افتح هذه الأرض أولاً");
        if (plot.cropId) throw new Error("هذه الأرض مزروعة بالفعل");
        if (next.seeds[action.cropId] < 1) throw new Error("لا توجد بذور كافية؛ اشترِ بذوراً من السوق");
        next.seeds[action.cropId] -= 1;
        plot.cropId = action.cropId;
        plot.plantedAt = Date.now();
        break;
      }
      case "harvest": {
        if (!plot?.cropId || !plot.plantedAt) throw new Error("لا يوجد محصول في هذه الأرض");
        const crop = CROPS[plot.cropId];
        if (Date.now() - plot.plantedAt < crop.growMs) throw new Error("المحصول لم ينضج بعد");
        next.inventory[plot.cropId] += crop.harvestAmount;
        next.totalHarvests += 1;
        plot.cropId = null;
        plot.plantedAt = null;
        break;
      }
    }

    transaction.set(farmRef, next);
    return next;
  });
}
