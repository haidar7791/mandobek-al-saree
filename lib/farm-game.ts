export type CropId = "wheat" | "carrot" | "corn";
export type FruitTreeId = "apple" | "orange";
export type DecorationId = "flowerBed" | "gardenLamp" | "fence";
export type FarmTool =
  | "walk"
  | "plant"
  | "move"
  | "buyPlot"
  | "buildHouse"
  | "apple"
  | "orange"
  | "flowerBed"
  | "gardenLamp"
  | "fence";

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
export const FRUIT_TREES: Record<FruitTreeId, {
  id: FruitTreeId;
  name: string;
  fruitName: string;
  price: number;
  growMs: number;
  harvestAmount: number;
  sellPrice: number;
  color: string;
  fruitColor: string;
}> = {
  apple: {
    id: "apple",
    name: "شجرة تفاح",
    fruitName: "تفاح",
    price: 85,
    growMs: 120_000,
    harvestAmount: 3,
    sellPrice: 16,
    color: "#5B984D",
    fruitColor: "#E85A49",
  },
  orange: {
    id: "orange",
    name: "شجرة برتقال",
    fruitName: "برتقال",
    price: 100,
    growMs: 150_000,
    harvestAmount: 3,
    sellPrice: 19,
    color: "#518F4A",
    fruitColor: "#F39A36",
  },
};
export const FRUIT_TREE_ORDER: FruitTreeId[] = ["apple", "orange"];
export const DECORATIONS: Record<DecorationId, {
  id: DecorationId;
  name: string;
  price: number;
}> = {
  flowerBed: { id: "flowerBed", name: "حوض زهور", price: 18 },
  gardenLamp: { id: "gardenLamp", name: "مصباح حديقة", price: 32 },
  fence: { id: "fence", name: "سياج خشبي", price: 12 },
};
export const DECORATION_ORDER: DecorationId[] = ["flowerBed", "gardenLamp", "fence"];

export const FARM_MAP_COLUMNS = 24;
export const FARM_MAP_ROWS = 18;
export const FARM_TILE_SIZE = 40;
export const FARM_PLOT_COST = 25;
export const FARM_HOUSE_COST = 180;
export const INITIAL_SEEDS: Record<CropId, number> = {
  wheat: 4,
  carrot: 2,
  corn: 1,
};

export interface FarmPosition {
  x: number;
  y: number;
}

export interface FarmPlot extends FarmPosition {
  id: number;
  unlocked?: boolean;
  cropId: CropId | null;
  plantedAt: number | null;
  growthProgressMs: number;
  lastGrowthAt: number | null;
}

export interface FarmFruitTree extends FarmPosition {
  id: string;
  kind: FruitTreeId;
  plantedAt: number;
  nextHarvestAt: number;
}

export interface FarmDecoration extends FarmPosition {
  id: string;
  kind: DecorationId;
}

export interface FarmGameSave {
  version: 4;
  coins: number;
  seeds: Record<CropId, number>;
  inventory: Record<CropId, number>;
  fruitInventory: Record<FruitTreeId, number>;
  plots: FarmPlot[];
  trees: FarmFruitTree[];
  decorations: FarmDecoration[];
  houseBuilt: boolean;
  houseLevel: number;
  housePosition: FarmPosition | null;
  playerPosition: FarmPosition;
  nextPlotId: number;
  totalHarvests: number;
  createdAt: number;
  updatedAt: number;
}

export type FarmObjectRef =
  | { type: "plot"; id: number }
  | { type: "tree"; id: string }
  | { type: "decoration"; id: string }
  | { type: "house"; id: "house" };
type OccupancyException = FarmObjectRef | { type: "player"; id: "player" };

export type FarmAction =
  | { type: "buyPlotAt"; x: number; y: number }
  | { type: "plantInPlot"; plotId: number; cropId: CropId }
  | { type: "plantAt"; x: number; y: number; cropId: CropId }
  | { type: "harvestPlot"; plotId: number }
  | { type: "buySeed"; cropId: CropId }
  | { type: "sellCrop"; cropId: CropId }
  | { type: "buyTreeAt"; treeId: FruitTreeId; x: number; y: number }
  | { type: "harvestFruit"; treeId: string }
  | { type: "sellFruit"; treeId: FruitTreeId }
  | { type: "buildHouseAt"; x: number; y: number }
  | { type: "moveHouseTo"; x: number; y: number }
  | { type: "buyDecorationAt"; decorationId: DecorationId; x: number; y: number }
  | { type: "moveObjectTo"; object: FarmObjectRef; x: number; y: number }
  | { type: "movePlayerTo"; x: number; y: number };

function nonNegativeInt(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

function isCropId(value: unknown): value is CropId {
  return value === "wheat" || value === "carrot" || value === "corn";
}

function isFruitTreeId(value: unknown): value is FruitTreeId {
  return value === "apple" || value === "orange";
}

function isDecorationId(value: unknown): value is DecorationId {
  return value === "flowerBed" || value === "gardenLamp" || value === "fence";
}

function clampPosition(x: unknown, y: unknown): FarmPosition {
  return {
    x: Math.max(0, Math.min(FARM_MAP_COLUMNS - 1, nonNegativeInt(x))),
    y: Math.max(0, Math.min(FARM_MAP_ROWS - 1, nonNegativeInt(y))),
  };
}

function createInitialFarm(now = Date.now()): FarmGameSave {
  return {
    version: 4,
    coins: 140,
    seeds: { ...INITIAL_SEEDS },
    inventory: { wheat: 0, carrot: 0, corn: 0 },
    fruitInventory: { apple: 0, orange: 0 },
    plots: [],
    trees: [],
    decorations: [],
    houseBuilt: false,
    houseLevel: 0,
    housePosition: null,
    playerPosition: { x: 4, y: 5 },
    nextPlotId: 1,
    totalHarvests: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function createInitialFarmSave(now = Date.now()): FarmGameSave {
  return createInitialFarm(now);
}

export function createDemoFarmGame(now = Date.now()): FarmGameSave {
  const farm = createInitialFarm(now);
  farm.coins = 345;
  farm.seeds = { wheat: 5, carrot: 3, corn: 2 };
  farm.inventory = { wheat: 4, carrot: 2, corn: 1 };
  farm.fruitInventory = { apple: 2, orange: 1 };
  farm.totalHarvests = 4;
  farm.plots = [
    { id: 1, x: 7, y: 6, cropId: "wheat", plantedAt: now - 40_000, growthProgressMs: 30_000, lastGrowthAt: now },
    { id: 2, x: 8, y: 6, cropId: "carrot", plantedAt: now - 25_000, growthProgressMs: 25_000, lastGrowthAt: now },
    { id: 3, x: 7, y: 7, cropId: "corn", plantedAt: now - 50_000, growthProgressMs: 50_000, lastGrowthAt: now },
    { id: 4, x: 9, y: 7, cropId: "wheat", plantedAt: now - 12_000, growthProgressMs: 12_000, lastGrowthAt: now },
  ];
  farm.trees = [
    { id: "demo-apple", kind: "apple", x: 13, y: 6, plantedAt: now - 180_000, nextHarvestAt: now - 1_000 },
    { id: "demo-orange", kind: "orange", x: 15, y: 9, plantedAt: now - 40_000, nextHarvestAt: now + 110_000 },
  ];
  farm.houseBuilt = true;
  farm.houseLevel = 1;
  farm.housePosition = { x: 4, y: 4 };
  farm.decorations = [
    { id: "demo-flowers", kind: "flowerBed", x: 5, y: 7 },
    { id: "demo-lamp", kind: "gardenLamp", x: 3, y: 6 },
  ];
  farm.playerPosition = { x: 6, y: 5 };
  farm.nextPlotId = 5;
  return farm;
}

export function getPlotGrowthState(plot: FarmPlot, now = Date.now()) {
  if (!plot.cropId) return { progressMs: 0, progress: 0, remaining: 0, ready: false };
  const duration = CROPS[plot.cropId].growMs;
  const progressMs = Math.min(
    duration,
    Math.max(0, plot.growthProgressMs) + Math.max(0, now - (plot.lastGrowthAt ?? now)),
  );
  return {
    progressMs,
    progress: Math.min(1, progressMs / duration),
    remaining: Math.max(0, duration - progressMs),
    ready: progressMs >= duration,
  };
}

export function getTreeGrowthState(tree: FarmFruitTree, now = Date.now()) {
  const definition = FRUIT_TREES[tree.kind];
  const age = Math.max(0, now - tree.plantedAt);
  const firstCycle = Math.min(1, age / definition.growMs);
  const ready = now >= tree.nextHarvestAt;
  const remaining = ready ? 0 : Math.max(0, tree.nextHarvestAt - now);
  return { ageProgress: firstCycle, ready, remaining };
}

function advanceFarmTime(farm: FarmGameSave, now: number): FarmGameSave {
  return {
    ...farm,
    plots: farm.plots.map((plot) => {
      const growth = getPlotGrowthState(plot, now);
      return plot.cropId
        ? { ...plot, growthProgressMs: growth.progressMs, lastGrowthAt: now }
        : { ...plot };
    }),
    trees: farm.trees.map((tree) => ({ ...tree })),
    decorations: farm.decorations.map((item) => ({ ...item })),
    updatedAt: now,
  };
}

export function isFarmPositionFree(
  farm: FarmGameSave,
  x: number,
  y: number,
  except?: OccupancyException,
): boolean {
  const same = (position: FarmPosition) => position.x === x && position.y === y;
  if (farm.plots.some((item) => same(item) && !(except?.type === "plot" && except.id === item.id))) return false;
  if (farm.trees.some((item) => same(item) && !(except?.type === "tree" && except.id === item.id))) return false;
  if (farm.decorations.some((item) => same(item) && !(except?.type === "decoration" && except.id === item.id))) return false;
  if (farm.houseBuilt && farm.housePosition && same(farm.housePosition) && except?.type !== "house") return false;
  if (same(farm.playerPosition) && except?.type !== "player") return false;
  return x >= 0 && x < FARM_MAP_COLUMNS && y >= 0 && y < FARM_MAP_ROWS;
}

function assertFree(farm: FarmGameSave, x: number, y: number, except?: OccupancyException) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !isFarmPositionFree(farm, x, y, except)) {
    throw new Error("هذه الخانة مشغولة أو خارج حدود مزرعتك.");
  }
}

export function normalizeFarm(data: Record<string, unknown>, now = Date.now()): FarmGameSave {
  const initial = createInitialFarm(now);
  const rawPlots = Array.isArray(data.plots) ? data.plots : [];
  const plots: FarmPlot[] = [];
  for (let index = 0; index < rawPlots.length; index += 1) {
    const raw = rawPlots[index] as Record<string, unknown>;
    const cropId = isCropId(raw.cropId) ? raw.cropId : null;
    if (!cropId && raw.unlocked !== true) continue;
    const fallbackPosition = {
      x: 5 + (index % 6),
      y: 6 + Math.floor(index / 6),
    };
    const position = clampPosition(
      typeof raw.x === "number" ? raw.x : fallbackPosition.x,
      typeof raw.y === "number" ? raw.y : fallbackPosition.y,
    );
    const duration = cropId ? CROPS[cropId].growMs : 0;
    const oldProgress = nonNegativeInt(raw.growthProgressMs);
    const plantedAt = typeof raw.plantedAt === "number" ? raw.plantedAt : now;
    const plotId = typeof raw.id === "number" && Number.isFinite(raw.id)
      ? Math.max(0, Math.floor(raw.id))
      : index + 1;
    plots.push({
      id: plotId,
      ...position,
      cropId,
      plantedAt: cropId ? plantedAt : null,
      growthProgressMs: cropId ? Math.min(duration, oldProgress) : 0,
      lastGrowthAt: cropId ? (typeof raw.lastGrowthAt === "number" ? raw.lastGrowthAt : plantedAt) : null,
    });
  }

  const trees: FarmFruitTree[] = [];
  if (Array.isArray(data.trees)) {
    for (const value of data.trees) {
      const raw = value as Record<string, unknown>;
      if (!isFruitTreeId(raw.kind) || typeof raw.id !== "string") continue;
      const position = clampPosition(raw.x, raw.y);
      const plantedAt = nonNegativeInt(raw.plantedAt, now);
      trees.push({
        id: raw.id,
        kind: raw.kind,
        ...position,
        plantedAt,
        nextHarvestAt: nonNegativeInt(
          raw.nextHarvestAt,
          plantedAt + FRUIT_TREES[raw.kind].growMs,
        ),
      });
    }
  }

  const decorations: FarmDecoration[] = [];
  if (Array.isArray(data.decorations)) {
    for (const value of data.decorations) {
      const raw = value as Record<string, unknown>;
      if (!isDecorationId(raw.kind) || typeof raw.id !== "string") continue;
      decorations.push({ id: raw.id, kind: raw.kind, ...clampPosition(raw.x, raw.y) });
    }
  }
  const houseBuilt = data.houseBuilt === true || nonNegativeInt(data.houseLevel) > 0;
  const housePositionRaw = data.housePosition as Record<string, unknown> | undefined;
  const legacyHousePosition = houseBuilt ? clampPosition(3, 3) : null;
  const housePosition = houseBuilt
    ? housePositionRaw && typeof housePositionRaw.x === "number" && typeof housePositionRaw.y === "number"
      ? clampPosition(housePositionRaw.x, housePositionRaw.y)
      : legacyHousePosition
    : null;
  const seeds = (data.seeds ?? {}) as Record<string, unknown>;
  const inventory = (data.inventory ?? {}) as Record<string, unknown>;
  const fruitInventory = (data.fruitInventory ?? {}) as Record<string, unknown>;
  const playerPositionRaw = data.playerPosition as Record<string, unknown> | undefined;
  const farm: FarmGameSave = {
    version: 4,
    coins: nonNegativeInt(data.coins, initial.coins),
    seeds: {
      wheat: nonNegativeInt(seeds.wheat, initial.seeds.wheat),
      carrot: nonNegativeInt(seeds.carrot, initial.seeds.carrot),
      corn: nonNegativeInt(seeds.corn, initial.seeds.corn),
    },
    inventory: {
      wheat: nonNegativeInt(inventory.wheat),
      carrot: nonNegativeInt(inventory.carrot),
      corn: nonNegativeInt(inventory.corn),
    },
    fruitInventory: {
      apple: nonNegativeInt(fruitInventory.apple),
      orange: nonNegativeInt(fruitInventory.orange),
    },
    plots,
    trees,
    decorations,
    houseBuilt,
    houseLevel: houseBuilt ? Math.max(1, Math.min(3, nonNegativeInt(data.houseLevel, 1))) : 0,
    housePosition,
    playerPosition: playerPositionRaw
      ? clampPosition(playerPositionRaw.x, playerPositionRaw.y)
      : { ...initial.playerPosition },
    nextPlotId: Math.max(
      nonNegativeInt(data.nextPlotId, 1),
      ...plots.map((plot) => plot.id + 1),
    ),
    totalHarvests: nonNegativeInt(data.totalHarvests),
    createdAt: nonNegativeInt(data.createdAt, now),
    updatedAt: nonNegativeInt(data.updatedAt, now),
  };

  // Resolve collisions from older saves before persisting the expanded map.
  const claimed = new Set<string>();
  const key = (position: FarmPosition) => `${position.x},${position.y}`;
  for (const plot of farm.plots) {
    while (claimed.has(key(plot))) {
      plot.x = (plot.x + 1) % FARM_MAP_COLUMNS;
      if (plot.x === 0) plot.y = (plot.y + 1) % FARM_MAP_ROWS;
    }
    claimed.add(key(plot));
  }
  for (const tree of farm.trees) {
    while (claimed.has(key(tree))) {
      tree.x = (tree.x + 1) % FARM_MAP_COLUMNS;
      if (tree.x === 0) tree.y = (tree.y + 1) % FARM_MAP_ROWS;
    }
    claimed.add(key(tree));
  }
  for (const item of farm.decorations) {
    while (claimed.has(key(item))) {
      item.x = (item.x + 1) % FARM_MAP_COLUMNS;
      if (item.x === 0) item.y = (item.y + 1) % FARM_MAP_ROWS;
    }
    claimed.add(key(item));
  }
  if (farm.houseBuilt && farm.housePosition) {
    while (claimed.has(key(farm.housePosition))) {
      farm.housePosition.x = (farm.housePosition.x + 1) % FARM_MAP_COLUMNS;
      if (farm.housePosition.x === 0) farm.housePosition.y = (farm.housePosition.y + 1) % FARM_MAP_ROWS;
    }
  }
  return advanceFarmTime(farm, now);
}

export function applyFarmActionToState(
  farm: FarmGameSave,
  action: FarmAction,
  now = Date.now(),
): FarmGameSave {
  const next = advanceFarmTime(farm, now);

  switch (action.type) {
    case "buySeed": {
      const crop = CROPS[action.cropId];
      if (next.coins < crop.seedPrice) throw new Error("لا توجد عملات كافية لشراء البذور.");
      next.coins -= crop.seedPrice;
      next.seeds[action.cropId] += 1;
      break;
    }
    case "sellCrop": {
      const amount = next.inventory[action.cropId];
      if (amount < 1) throw new Error("لا يوجد محصول للبيع.");
      next.coins += amount * CROPS[action.cropId].sellPrice;
      next.inventory[action.cropId] = 0;
      break;
    }
    case "plantAt": {
      assertFree(next, action.x, action.y);
      if (next.seeds[action.cropId] < 1) throw new Error("لا توجد بذور كافية؛ اشترِ بذوراً من المتجر.");
      const id = next.nextPlotId++;
      next.seeds[action.cropId] -= 1;
      next.plots.push({
        id,
        x: action.x,
        y: action.y,
        cropId: action.cropId,
        plantedAt: now,
        growthProgressMs: 0,
        lastGrowthAt: now,
      });
      break;
    }
    case "buyPlotAt": {
      assertFree(next, action.x, action.y);
      if (next.coins < FARM_PLOT_COST) throw new Error("لا توجد عملات كافية لشراء حقل جديد.");
      next.coins -= FARM_PLOT_COST;
      next.plots.push({
        id: next.nextPlotId++,
        x: action.x,
        y: action.y,
        unlocked: true,
        cropId: null,
        plantedAt: null,
        growthProgressMs: 0,
        lastGrowthAt: null,
      });
      break;
    }
    case "plantInPlot": {
      const plot = next.plots.find((item) => item.id === action.plotId);
      if (!plot) throw new Error("لم يتم العثور على الحقل.");
      if (plot.cropId) throw new Error("هذا الحقل مزروع بالفعل.");
      if (next.seeds[action.cropId] < 1) throw new Error("لا توجد بذور كافية؛ اشترِ بذوراً من المتجر.");
      next.seeds[action.cropId] -= 1;
      plot.cropId = action.cropId;
      plot.plantedAt = now;
      plot.growthProgressMs = 0;
      plot.lastGrowthAt = now;
      plot.unlocked = true;
      break;
    }
    case "harvestPlot": {
      const plot = next.plots.find((item) => item.id === action.plotId);
      if (!plot?.cropId) throw new Error("لا يوجد محصول في هذه الخانة.");
      const timing = getPlotGrowthState(plot, now);
      if (!timing.ready) throw new Error("المحصول لم ينضج بعد.");
      const cropId = plot.cropId;
      next.inventory[cropId] += CROPS[cropId].harvestAmount;
      next.totalHarvests += 1;
      plot.cropId = null;
      plot.plantedAt = null;
      plot.growthProgressMs = 0;
      plot.lastGrowthAt = null;
      plot.unlocked = true;
      break;
    }
    case "buyTreeAt": {
      assertFree(next, action.x, action.y);
      const tree = FRUIT_TREES[action.treeId];
      if (next.coins < tree.price) throw new Error("اجمع المزيد من العملات لشراء هذه الشجرة.");
      next.coins -= tree.price;
      next.trees.push({
        id: `tree-${now}-${next.trees.length + 1}`,
        kind: action.treeId,
        x: action.x,
        y: action.y,
        plantedAt: now,
        nextHarvestAt: now + tree.growMs,
      });
      break;
    }
    case "harvestFruit": {
      const tree = next.trees.find((item) => item.id === action.treeId);
      if (!tree) throw new Error("لم يتم العثور على الشجرة.");
      if (now < tree.nextHarvestAt) throw new Error("ثمار الشجرة لم تنضج بعد.");
      const definition = FRUIT_TREES[tree.kind];
      next.fruitInventory[tree.kind] += definition.harvestAmount;
      next.totalHarvests += 1;
      tree.nextHarvestAt = now + definition.growMs;
      break;
    }
    case "sellFruit": {
      const amount = next.fruitInventory[action.treeId];
      if (amount < 1) throw new Error("لا توجد ثمار للبيع.");
      next.coins += amount * FRUIT_TREES[action.treeId].sellPrice;
      next.fruitInventory[action.treeId] = 0;
      break;
    }
    case "buildHouseAt": {
      if (next.houseBuilt) throw new Error("منزلك مبني بالفعل. استخدم أداة التحريك لنقله.");
      assertFree(next, action.x, action.y);
      if (next.coins < FARM_HOUSE_COST) throw new Error("تحتاج إلى عملات أكثر لبناء المنزل.");
      next.coins -= FARM_HOUSE_COST;
      next.houseBuilt = true;
      next.houseLevel = 1;
      next.housePosition = { x: action.x, y: action.y };
      break;
    }
    case "moveHouseTo": {
      if (!next.houseBuilt || !next.housePosition) throw new Error("ابنِ المنزل أولاً.");
      assertFree(next, action.x, action.y, { type: "house", id: "house" });
      next.housePosition = { x: action.x, y: action.y };
      break;
    }
    case "buyDecorationAt": {
      assertFree(next, action.x, action.y);
      const decoration = DECORATIONS[action.decorationId];
      if (next.coins < decoration.price) throw new Error("لا توجد عملات كافية لشراء هذا الديكور.");
      next.coins -= decoration.price;
      next.decorations.push({
        id: `decor-${now}-${next.decorations.length + 1}`,
        kind: action.decorationId,
        x: action.x,
        y: action.y,
      });
      break;
    }
    case "moveObjectTo": {
      assertFree(next, action.x, action.y, action.object);
      if (action.object.type === "plot") {
        const item = next.plots.find((plot) => plot.id === action.object.id);
        if (!item) throw new Error("تعذّر العثور على الحقل.");
        item.x = action.x;
        item.y = action.y;
      } else if (action.object.type === "tree") {
        const item = next.trees.find((tree) => tree.id === action.object.id);
        if (!item) throw new Error("تعذّر العثور على الشجرة.");
        item.x = action.x;
        item.y = action.y;
      } else if (action.object.type === "decoration") {
        const item = next.decorations.find((decoration) => decoration.id === action.object.id);
        if (!item) throw new Error("تعذّر العثور على الديكور.");
        item.x = action.x;
        item.y = action.y;
      } else {
        if (!next.houseBuilt) throw new Error("ابنِ المنزل أولاً.");
        next.housePosition = { x: action.x, y: action.y };
      }
      break;
    }
    case "movePlayerTo": {
      assertFree(next, action.x, action.y, { type: "player", id: "player" });
      next.playerPosition = { x: action.x, y: action.y };
      break;
    }
  }
  next.updatedAt = now;
  return next;
}
