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
export const FARM_LAND_EXPANSION_COST = 120;
export const FARM_WORKER_BASE_COST = 300;
export const FARM_HOUSE_COST = 180;
export const FARM_PARCEL_COLUMNS = 4;
export const FARM_PARCEL_ROWS = 3;
export const FARM_PARCEL_WIDTH = FARM_MAP_COLUMNS / FARM_PARCEL_COLUMNS;
export const FARM_PARCEL_HEIGHT = FARM_MAP_ROWS / FARM_PARCEL_ROWS;
export const FARM_START_PARCEL = { column: 1, row: 1 };
export const INITIAL_SEEDS: Record<CropId, number> = {
  wheat: 4,
  carrot: 2,
  corn: 1,
};

export interface FarmPosition {
  x: number;
  y: number;
}

export interface FarmLandParcel {
  column: number;
  row: number;
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

export type FarmObstacleKind = "rock" | "sapling";

export interface FarmObstacle extends FarmPosition {
  id: string;
  kind: FarmObstacleKind;
}

export type FarmWorkerState = "idle" | "walking" | "waiting";

export interface FarmWorker {
  id: string;
  from: FarmPosition;
  to: FarmPosition | null;
  targetTreeId: string | null;
  targetObstacleId: string | null;
  state: FarmWorkerState;
  startedAt: number;
  arrivesAt: number;
  wakeAt: number | null;
}

export interface FarmGameSave {
  version: 6;
  coins: number;
  seeds: Record<CropId, number>;
  inventory: Record<CropId, number>;
  fruitInventory: Record<FruitTreeId, number>;
  landParcels: FarmLandParcel[];
  expansionsPurchased: number;
  plots: FarmPlot[];
  trees: FarmFruitTree[];
  obstacles: FarmObstacle[];
  workers: FarmWorker[];
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
  | { type: "obstacle"; id: string }
  | { type: "decoration"; id: string }
  | { type: "house"; id: "house" }
  | { type: "landParcel"; id: string };
type OccupancyException = FarmObjectRef | { type: "player"; id: "player" };

export type FarmAction =
  | { type: "buyLandParcel"; column: number; row: number }
  | { type: "buyWorker" }
  | { type: "buyPlotAt"; x: number; y: number }
  | { type: "plantInPlot"; plotId: number; cropId: CropId }
  | { type: "plantAt"; x: number; y: number; cropId: CropId }
  | { type: "harvestPlot"; plotId: number }
  | { type: "buySeed"; cropId: CropId }
  | { type: "sellCrop"; cropId: CropId }
  | { type: "buyTreeAt"; treeId: FruitTreeId; x: number; y: number }
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

function isFarmObstacleKind(value: unknown): value is FarmObstacleKind {
  return value === "rock" || value === "sapling";
}

function clampPosition(x: unknown, y: unknown): FarmPosition {
  return {
    x: Math.max(0, Math.min(FARM_MAP_COLUMNS - 1, nonNegativeInt(x))),
    y: Math.max(0, Math.min(FARM_MAP_ROWS - 1, nonNegativeInt(y))),
  };
}

export function getFarmParcelAt(x: number, y: number): FarmLandParcel {
  return {
    column: Math.floor(x / FARM_PARCEL_WIDTH),
    row: Math.floor(y / FARM_PARCEL_HEIGHT),
  };
}

export function isFarmParcelOwned(
  farm: Pick<FarmGameSave, "landParcels">,
  column: number,
  row: number,
): boolean {
  return farm.landParcels.some((parcel) => parcel.column === column && parcel.row === row);
}

export function isFarmParcelAdjacent(
  farm: Pick<FarmGameSave, "landParcels">,
  column: number,
  row: number,
): boolean {
  return !isFarmParcelOwned(farm, column, row) && farm.landParcels.some(
    (parcel) => Math.abs(parcel.column - column) + Math.abs(parcel.row - row) === 1,
  );
}

export function isFarmPositionOwned(
  farm: Pick<FarmGameSave, "landParcels">,
  x: number,
  y: number,
): boolean {
  const parcel = getFarmParcelAt(x, y);
  return isFarmParcelOwned(farm, parcel.column, parcel.row);
}

export function getNextLandExpansionCost(farm: Pick<FarmGameSave, "expansionsPurchased">): number {
  return FARM_LAND_EXPANSION_COST * 2 ** farm.expansionsPurchased;
}

export function getNextWorkerCost(farm: Pick<FarmGameSave, "workers">): number {
  return FARM_WORKER_BASE_COST * 2 ** Math.max(0, farm.workers.length - 1);
}

function createIdleWorker(id: string, position: FarmPosition, now: number): FarmWorker {
  return {
    id,
    from: { ...position },
    to: null,
    targetTreeId: null,
    targetObstacleId: null,
    state: "idle",
    startedAt: now,
    arrivesAt: now,
    wakeAt: null,
  };
}

function normalizeWorker(
  value: unknown,
  index: number,
  position: FarmPosition,
  now: number,
): FarmWorker {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const fromRaw = raw.from && typeof raw.from === "object"
    ? raw.from as Record<string, unknown>
    : position;
  const toRaw = raw.to && typeof raw.to === "object"
    ? raw.to as Record<string, unknown>
    : null;
  const state = raw.state === "walking" || raw.state === "waiting" ? raw.state : "idle";
  const to = toRaw && typeof toRaw.x === "number" && typeof toRaw.y === "number"
    ? clampPosition(toRaw.x, toRaw.y)
    : null;
  const safeState = state === "walking" && !to ? "idle" : state;
  return {
    id: typeof raw.id === "string" ? raw.id : `worker-${index + 1}`,
    from: clampPosition(fromRaw.x, fromRaw.y),
    to: safeState === "walking" ? to : null,
    targetTreeId: typeof raw.targetTreeId === "string" ? raw.targetTreeId : null,
    targetObstacleId: typeof raw.targetObstacleId === "string" ? raw.targetObstacleId : null,
    state: safeState,
    startedAt: nonNegativeInt(raw.startedAt, now),
    arrivesAt: nonNegativeInt(raw.arrivesAt, now),
    wakeAt: typeof raw.wakeAt === "number" && Number.isFinite(raw.wakeAt)
      ? Math.max(0, raw.wakeAt)
      : null,
  };
}

export function getWorkerPosition(worker: FarmWorker, now = Date.now()): FarmPosition {
  if (!worker.to || worker.state !== "walking" || worker.arrivesAt <= worker.startedAt) {
    return { ...worker.from };
  }
  const progress = Math.max(0, Math.min(1, (now - worker.startedAt) / (worker.arrivesAt - worker.startedAt)));
  return {
    x: worker.from.x + (worker.to.x - worker.from.x) * progress,
    y: worker.from.y + (worker.to.y - worker.from.y) * progress,
  };
}

function createInitialFarm(now = Date.now()): FarmGameSave {
  return {
    version: 6,
    coins: 140,
    seeds: { ...INITIAL_SEEDS },
    inventory: { wheat: 0, carrot: 0, corn: 0 },
    fruitInventory: { apple: 0, orange: 0 },
    landParcels: [{ ...FARM_START_PARCEL }],
    expansionsPurchased: 0,
    plots: [
      { id: 1, x: 8, y: 9, cropId: null, plantedAt: null, growthProgressMs: 0, lastGrowthAt: null, unlocked: true },
      { id: 2, x: 9, y: 9, cropId: null, plantedAt: null, growthProgressMs: 0, lastGrowthAt: null, unlocked: true },
      { id: 3, x: 10, y: 9, cropId: null, plantedAt: null, growthProgressMs: 0, lastGrowthAt: null, unlocked: true },
    ],
    trees: [],
    obstacles: [],
    workers: [createIdleWorker("worker-1", { x: 8, y: 8 }, now)],
    decorations: [],
    houseBuilt: true,
    houseLevel: 1,
    housePosition: { x: 8, y: 7 },
    playerPosition: { x: 7, y: 8 },
    nextPlotId: 4,
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
    { id: 1, x: 8, y: 9, cropId: "wheat", plantedAt: now - 40_000, growthProgressMs: 30_000, lastGrowthAt: now },
    { id: 2, x: 9, y: 9, cropId: "carrot", plantedAt: now - 25_000, growthProgressMs: 25_000, lastGrowthAt: now },
    { id: 3, x: 10, y: 9, cropId: "corn", plantedAt: now - 50_000, growthProgressMs: 50_000, lastGrowthAt: now },
  ];
  farm.trees = [
    { id: "demo-apple", kind: "apple", x: 7, y: 7, plantedAt: now - 180_000, nextHarvestAt: now - 1_000 },
    { id: "demo-orange", kind: "orange", x: 10, y: 7, plantedAt: now - 40_000, nextHarvestAt: now + 110_000 },
  ];
  farm.houseBuilt = true;
  farm.houseLevel = 1;
  farm.housePosition = { x: 8, y: 7 };
  farm.decorations = [
    { id: "demo-flowers", kind: "flowerBed", x: 7, y: 10 },
    { id: "demo-lamp", kind: "gardenLamp", x: 11, y: 10 },
  ];
  farm.playerPosition = { x: 7, y: 8 };
  farm.nextPlotId = 4;
  return assignIdleWorkers(farm, now);
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

function workerTravelDuration(from: FarmPosition, to: FarmPosition): number {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.max(1_200, Math.ceil(distance * 900));
}

function getTreeWorkPosition(farm: FarmGameSave, tree: FarmFruitTree, from: FarmPosition): FarmPosition {
  const adjacent = [
    { x: tree.x, y: tree.y + 1 },
    { x: tree.x - 1, y: tree.y },
    { x: tree.x + 1, y: tree.y },
    { x: tree.x, y: tree.y - 1 },
  ];
  const available = adjacent.filter(
    (position) => isFarmPositionOwned(farm, position.x, position.y)
      && isFarmPositionFree(farm, position.x, position.y),
  );
  const candidates = available.length > 0
    ? available
    : adjacent.filter((position) => isFarmPositionOwned(farm, position.x, position.y));
  candidates.sort(
    (a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y),
  );
  return candidates[0] ?? { x: tree.x, y: tree.y };
}

function startWorkerRoute(farm: FarmGameSave, worker: FarmWorker, now: number): FarmWorker {
  const from = getWorkerPosition(worker, now);
  const otherWorkers = farm.workers.filter((item) => item.id !== worker.id);
  const assignedObstacleIds = new Set(
    otherWorkers
      .filter((item) => item.state === "walking" && item.targetObstacleId)
      .map((item) => item.targetObstacleId),
  );
  const obstacles = farm.obstacles
    .filter((item) => !assignedObstacleIds.has(item.id))
    .sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y));
  const obstacle = obstacles[0];
  if (obstacle) {
    return {
      ...worker,
      from,
      to: { x: obstacle.x, y: obstacle.y },
      targetTreeId: null,
      targetObstacleId: obstacle.id,
      state: "walking",
      startedAt: now,
      arrivesAt: now + workerTravelDuration(from, obstacle),
      wakeAt: null,
    };
  }

  const assignedTreeIds = new Set(
    otherWorkers
      .filter((item) => (item.state === "walking" || item.state === "waiting") && item.targetTreeId)
      .map((item) => item.targetTreeId),
  );
  const trees = farm.trees.filter((tree) => !assignedTreeIds.has(tree.id));
  const alternatives = trees.filter((tree) => tree.id !== worker.targetTreeId);
  const candidates = alternatives.length > 0 ? alternatives : trees;
  candidates.sort((a, b) => {
    const aReady = a.nextHarvestAt <= now ? 0 : 1;
    const bReady = b.nextHarvestAt <= now ? 0 : 1;
    return aReady - bReady
      || Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y)
      || a.nextHarvestAt - b.nextHarvestAt;
  });
  const tree = candidates[0];
  if (!tree) return createIdleWorker(worker.id, from, now);
  const workPosition = getTreeWorkPosition(farm, tree, from);
  return {
    ...worker,
    from,
    to: workPosition,
    targetTreeId: tree.id,
    targetObstacleId: null,
    state: "walking",
    startedAt: now,
    arrivesAt: now + workerTravelDuration(from, workPosition),
    wakeAt: null,
  };
}

function assignIdleWorkers(farm: FarmGameSave, now: number): FarmGameSave {
  for (let index = 0; index < farm.workers.length; index += 1) {
    const worker = farm.workers[index];
    if (worker.state === "idle") {
      farm.workers[index] = startWorkerRoute(farm, worker, now);
    }
  }
  return farm;
}

function advanceWorkerTasks(farm: FarmGameSave, now: number): FarmGameSave {
  assignIdleWorkers(farm, now);
  let events = 0;
  while (events < 4_096) {
    const dueWorkers = farm.workers
      .filter((worker) => (
        (worker.state === "walking" && worker.arrivesAt <= now)
        || (worker.state === "waiting" && worker.wakeAt !== null && worker.wakeAt <= now)
      ))
      .sort((a, b) => {
        const aAt = a.state === "walking" ? a.arrivesAt : a.wakeAt ?? Number.MAX_SAFE_INTEGER;
        const bAt = b.state === "walking" ? b.arrivesAt : b.wakeAt ?? Number.MAX_SAFE_INTEGER;
        return aAt - bAt;
      });
    const worker = dueWorkers[0];
    if (!worker) break;
    const eventAt = worker.state === "walking" ? worker.arrivesAt : worker.wakeAt ?? now;

    if (worker.state === "walking") {
      const arrival = worker.to ? { ...worker.to } : { ...worker.from };
      const targetObstacleId = worker.targetObstacleId;
      const targetTreeId = worker.targetTreeId;
      worker.from = arrival;
      worker.to = null;
      worker.state = "idle";
      worker.arrivesAt = eventAt;
      worker.wakeAt = null;
      if (targetObstacleId) {
        farm.obstacles = farm.obstacles.filter((obstacle) => obstacle.id !== targetObstacleId);
        worker.targetObstacleId = null;
      } else if (targetTreeId) {
        const tree = farm.trees.find((item) => item.id === targetTreeId);
        if (tree && tree.nextHarvestAt <= eventAt) {
          farm.fruitInventory[tree.kind] += FRUIT_TREES[tree.kind].harvestAmount;
          farm.totalHarvests += 1;
          tree.nextHarvestAt = eventAt + FRUIT_TREES[tree.kind].growMs;
          worker.targetTreeId = null;
        } else if (tree && farm.trees.length === 1) {
          worker.state = "waiting";
          worker.wakeAt = tree.nextHarvestAt;
        }
      }
    } else if (worker.targetTreeId) {
      const tree = farm.trees.find((item) => item.id === worker.targetTreeId);
      if (tree && tree.nextHarvestAt > eventAt) {
        worker.wakeAt = tree.nextHarvestAt;
      } else if (tree) {
        farm.fruitInventory[tree.kind] += FRUIT_TREES[tree.kind].harvestAmount;
        farm.totalHarvests += 1;
        tree.nextHarvestAt = eventAt + FRUIT_TREES[tree.kind].growMs;
        worker.targetTreeId = null;
        worker.state = "idle";
        worker.wakeAt = null;
      } else {
        worker.state = "idle";
        worker.targetTreeId = null;
        worker.wakeAt = null;
      }
    } else {
      worker.state = "idle";
      worker.wakeAt = null;
    }

    assignIdleWorkers(farm, eventAt);
    events += 1;
  }
  assignIdleWorkers(farm, now);
  return farm;
}

function advanceFarmTime(farm: FarmGameSave, now: number): FarmGameSave {
  const next: FarmGameSave = {
    ...farm,
    landParcels: farm.landParcels.map((parcel) => ({ ...parcel })),
    workers: farm.workers.map((worker) => ({
      ...worker,
      from: { ...worker.from },
      to: worker.to ? { ...worker.to } : null,
    })),
    plots: farm.plots.map((plot) => {
      const growth = getPlotGrowthState(plot, now);
      return plot.cropId
        ? { ...plot, growthProgressMs: growth.progressMs, lastGrowthAt: now }
        : { ...plot };
    }),
    trees: farm.trees.map((tree) => ({ ...tree })),
    obstacles: farm.obstacles.map((obstacle) => ({ ...obstacle })),
    fruitInventory: { ...farm.fruitInventory },
    decorations: farm.decorations.map((item) => ({ ...item })),
    updatedAt: now,
  };
  return advanceWorkerTasks(next, now);
}

export function advanceFarmGameTime(farm: FarmGameSave, now = Date.now()): FarmGameSave {
  return advanceFarmTime(farm, now);
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
  if (farm.obstacles.some((item) => same(item))) return false;
  if (farm.decorations.some((item) => same(item) && !(except?.type === "decoration" && except.id === item.id))) return false;
  if (farm.houseBuilt && farm.housePosition && same(farm.housePosition) && except?.type !== "house") return false;
  if (same(farm.playerPosition) && except?.type !== "player") return false;
  return x >= 0 && x < FARM_MAP_COLUMNS && y >= 0 && y < FARM_MAP_ROWS;
}

function assertFree(farm: FarmGameSave, x: number, y: number, except?: OccupancyException) {
  if (!isFarmPositionOwned(farm, x, y)) {
    throw new Error("هذه الأرض مقفلة. اشترِ القطعة المجاورة أولاً.");
  }
  if (!Number.isInteger(x) || !Number.isInteger(y) || !isFarmPositionFree(farm, x, y, except)) {
    throw new Error("هذه الخانة مشغولة أو خارج حدود مزرعتك.");
  }
}

function connectParcelToStart(owned: FarmLandParcel[], target: FarmLandParcel) {
  let column = FARM_START_PARCEL.column;
  let row = FARM_START_PARCEL.row;
  const add = (nextColumn: number, nextRow: number) => {
    if (!owned.some((parcel) => parcel.column === nextColumn && parcel.row === nextRow)) {
      owned.push({ column: nextColumn, row: nextRow });
    }
  };
  add(column, row);
  while (column !== target.column) {
    column += Math.sign(target.column - column);
    add(column, row);
  }
  while (row !== target.row) {
    row += Math.sign(target.row - row);
    add(column, row);
  }
}

function createParcelObstacles(column: number, row: number): FarmObstacle[] {
  const positions: [number, number, FarmObstacleKind][] = [
    [1, 1, "rock"],
    [4, 1, "sapling"],
    [2, 3, "rock"],
    [4, 4, "rock"],
    [1, 4, "sapling"],
  ];
  return positions.map(([offsetX, offsetY, kind], index) => ({
    id: `obstacle-${column}-${row}-${index + 1}`,
    kind,
    x: column * FARM_PARCEL_WIDTH + offsetX,
    y: row * FARM_PARCEL_HEIGHT + offsetY,
  }));
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
  const obstacles: FarmObstacle[] = [];
  if (Array.isArray(data.obstacles)) {
    for (const value of data.obstacles) {
      const raw = value as Record<string, unknown>;
      if (!isFarmObstacleKind(raw.kind) || typeof raw.id !== "string") continue;
      obstacles.push({ id: raw.id, kind: raw.kind, ...clampPosition(raw.x, raw.y) });
    }
  }
  const houseBuilt = data.houseBuilt === true || nonNegativeInt(data.houseLevel) > 0;
  const housePositionRaw = data.housePosition as Record<string, unknown> | undefined;
  const playerPositionRaw = data.playerPosition as Record<string, unknown> | undefined;
  const isBlankLegacySave = !Array.isArray(data.landParcels)
    && plots.length === 0
    && (!Array.isArray(data.trees) || data.trees.length === 0)
    && (!Array.isArray(data.decorations) || data.decorations.length === 0)
    && !houseBuilt;
  const normalizedHouseBuilt = houseBuilt || isBlankLegacySave;
  const legacyHousePosition = normalizedHouseBuilt ? clampPosition(8, 7) : null;
  const housePosition = houseBuilt
    ? housePositionRaw && typeof housePositionRaw.x === "number" && typeof housePositionRaw.y === "number"
      ? clampPosition(housePositionRaw.x, housePositionRaw.y)
      : legacyHousePosition
    : isBlankLegacySave ? clampPosition(8, 7) : null;
  if (isBlankLegacySave) {
    plots.push(
      { id: 1, x: 8, y: 9, cropId: null, plantedAt: null, growthProgressMs: 0, lastGrowthAt: null },
      { id: 2, x: 9, y: 9, cropId: null, plantedAt: null, growthProgressMs: 0, lastGrowthAt: null },
      { id: 3, x: 10, y: 9, cropId: null, plantedAt: null, growthProgressMs: 0, lastGrowthAt: null },
    );
  }
  const landParcels: FarmLandParcel[] = [];
  if (Array.isArray(data.landParcels)) {
    for (const value of data.landParcels) {
      const raw = value as Record<string, unknown>;
      const column = nonNegativeInt(raw.column, -1);
      const row = nonNegativeInt(raw.row, -1);
      if (
        column < FARM_PARCEL_COLUMNS
        && row < FARM_PARCEL_ROWS
        && !landParcels.some((parcel) => parcel.column === column && parcel.row === row)
      ) {
        landParcels.push({ column, row });
      }
    }
    if (!isFarmParcelOwned({ landParcels }, FARM_START_PARCEL.column, FARM_START_PARCEL.row)) {
      landParcels.unshift({ ...FARM_START_PARCEL });
    }
  } else {
    connectParcelToStart(landParcels, { ...FARM_START_PARCEL });
    const legacyPositions: FarmPosition[] = [
      ...plots,
      ...trees,
      ...decorations,
      ...(housePosition ? [housePosition] : []),
      !isBlankLegacySave && playerPositionRaw
        ? clampPosition(playerPositionRaw.x, playerPositionRaw.y)
        : { x: 7, y: 8 },
    ];
    for (const position of legacyPositions) {
      const parcel = getFarmParcelAt(position.x, position.y);
      connectParcelToStart(landParcels, parcel);
    }
  }
  const normalizedPlayerPosition = !isBlankLegacySave && playerPositionRaw
    ? clampPosition(playerPositionRaw.x, playerPositionRaw.y)
    : { ...initial.playerPosition };
  const rawWorkers = Array.isArray(data.workers) ? data.workers : [];
  const workers = rawWorkers
    .slice(0, 432)
    .map((worker, index) => normalizeWorker(worker, index, { x: 8, y: 8 }, now));
  if (workers.length === 0) {
    workers.push(createIdleWorker("worker-1", { x: 8, y: 8 }, now));
  }
  const legacyExpansionCount = Array.isArray(data.landParcels)
    ? Math.max(0, landParcels.length - 1)
    : 0;
  const seeds = (data.seeds ?? {}) as Record<string, unknown>;
  const inventory = (data.inventory ?? {}) as Record<string, unknown>;
  const fruitInventory = (data.fruitInventory ?? {}) as Record<string, unknown>;
  const farm: FarmGameSave = {
    version: 6,
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
    landParcels,
    expansionsPurchased: nonNegativeInt(data.expansionsPurchased, legacyExpansionCount),
    plots,
    trees,
    obstacles,
    workers,
    decorations,
    houseBuilt: normalizedHouseBuilt,
    houseLevel: normalizedHouseBuilt ? Math.max(1, Math.min(3, nonNegativeInt(data.houseLevel, 1))) : 0,
    housePosition,
    playerPosition: normalizedPlayerPosition,
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
    case "buyLandParcel": {
      const { column, row } = action;
      if (
        !Number.isInteger(column)
        || !Number.isInteger(row)
        || column < 0
        || column >= FARM_PARCEL_COLUMNS
        || row < 0
        || row >= FARM_PARCEL_ROWS
      ) {
        throw new Error("قطعة الأرض غير متاحة.");
      }
      if (!isFarmParcelAdjacent(next, column, row)) {
        throw new Error("يمكنك شراء قطعة ملاصقة لأرضك فقط.");
      }
      const expansionCost = getNextLandExpansionCost(next);
      if (next.coins < expansionCost) {
        throw new Error(`تحتاج إلى ${expansionCost} عملة لشراء التوسعة.`);
      }
      next.coins -= expansionCost;
      next.landParcels.push({ column, row });
      next.expansionsPurchased += 1;
      next.obstacles.push(...createParcelObstacles(column, row));
      break;
    }
    case "buyWorker": {
      const workerCost = getNextWorkerCost(next);
      if (next.coins < workerCost) {
        throw new Error(`تحتاج إلى ${workerCost} عملة لتوظيف العامل التالي.`);
      }
      next.coins -= workerCost;
      next.workers.push(
        createIdleWorker(
          `worker-${now}-${next.workers.length + 1}`,
          next.housePosition ?? next.playerPosition,
          now,
        ),
      );
      break;
    }
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
      if (!isFarmPositionOwned(next, plot.x, plot.y)) {
        throw new Error("هذا الحقل خارج أرضك الحالية.");
      }
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
      } else if (action.object.type === "house") {
        if (!next.houseBuilt) throw new Error("ابنِ المنزل أولاً.");
        next.housePosition = { x: action.x, y: action.y };
      } else {
        throw new Error("لا يمكن نقل العوائق؛ سيزيلها العامل تلقائياً.");
      }
      break;
    }
    case "movePlayerTo": {
      assertFree(next, action.x, action.y, { type: "player", id: "player" });
      next.playerPosition = { x: action.x, y: action.y };
      break;
    }
  }
  assignIdleWorkers(next, now);
  next.updatedAt = now;
  return next;
}
