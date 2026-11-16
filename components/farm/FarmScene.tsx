import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, {
  Circle,
  Ellipse,
  G,
  Line,
  Path,
  Polygon,
  Rect,
  Text as SvgText,
} from "react-native-svg";
import {
  CROPS,
  FARM_MAP_COLUMNS,
  FARM_MAP_ROWS,
  FARM_OBSTACLE_CLEAR_COST,
  FARM_PARCEL_COLUMNS,
  FARM_PARCEL_HEIGHT,
  FARM_PARCEL_ROWS,
  FARM_PARCEL_WIDTH,
  FARM_TILE_SIZE,
  FRUIT_TREES,
  getFarmParcelAt,
  getNextLandExpansionCost,
  getPlotGrowthState,
  getTreeGrowthState,
  getWorkerHarvestProgress,
  getWorkerPosition,
  isFarmParcelAdjacent,
  isFarmParcelOwned,
  type FarmGameSave,
  type FarmObstacle,
  type FarmObjectRef,
  type FarmPosition,
  type FarmWorker,
} from "@/lib/farm-game";

export interface FarmSceneProps {
  farm: FarmGameSave;
  now: number;
  onTilePress: (position: FarmPosition, object: FarmObjectRef | null) => void;
  onObjectDragEnd?: (
    object: FarmObjectRef,
    position: FarmPosition,
    targetObject: FarmObjectRef | null,
  ) => void;
  style?: StyleProp<ViewStyle>;
}

export interface FarmSceneHandle {
  resolveDropPosition: (
    screenX: number,
    screenY: number,
  ) => Promise<{ position: FarmPosition; object: FarmObjectRef | null } | null>;
}

const WORLD_WIDTH = FARM_MAP_COLUMNS * FARM_TILE_SIZE;
const WORLD_HEIGHT = FARM_MAP_ROWS * FARM_TILE_SIZE;

function FarmHouse({ level }: { level: number }) {
  return (
    <G>
      <Ellipse cx={20} cy={34} rx={18} ry={4} fill="#456E42" opacity={0.25} />
      <SvgText
        x={20}
        y={41}
        fontSize={level > 1 ? 52 : 48}
        textAnchor="middle"
      >
        🏠
      </SvgText>
      <SvgText x={20} y={50} fontSize={7} fill="#4F5839" textAnchor="middle" fontWeight="700">
        منزل المزرعة
      </SvgText>
    </G>
  );
}

function Field({ plot, now }: { plot: FarmGameSave["plots"][number]; now: number }) {
  const crop = plot.cropId ? CROPS[plot.cropId] : null;
  const growth = crop ? getPlotGrowthState(plot, now) : null;
  const stage = growth?.ready ? 3 : (growth?.progress ?? 0) > 0.66 ? 2 : (growth?.progress ?? 0) > 0.12 ? 1 : 0;
  return (
    <G transform={`translate(${plot.x * FARM_TILE_SIZE} ${plot.y * FARM_TILE_SIZE})`}>
      <Ellipse cx={20} cy={35} rx={22} ry={4} fill="#456E42" opacity={0.2} />
      <Rect x={-1} y={2} width={42} height={36} rx={7} fill="#815132" stroke="#65412E" strokeWidth={1.7} />
      <Rect x={2} y={5} width={36} height={30} rx={5} fill="#96613D" />
      <Line x1={3} y1={11} x2={37} y2={11} stroke="#B17B4D" strokeWidth={1.8} />
      <Line x1={3} y1={19} x2={37} y2={19} stroke="#B17B4D" strokeWidth={1.8} />
      <Line x1={3} y1={27} x2={37} y2={27} stroke="#B17B4D" strokeWidth={1.8} />
      {crop ? (
        growth?.ready ? (
          <SvgText
            x={20}
            y={31}
            fontSize={25}
            textAnchor="middle"
          >
            {crop.id === "wheat" ? "🌾" : crop.id === "carrot" ? "🥕" : "🌽"}
          </SvgText>
        ) : (
        <>
          {[8, 16, 24, 32].map((offset, index) => (
            <G key={offset}>
              {stage === 0 ? (
                <Circle cx={offset} cy={25 - index % 2} r={2.5} fill={crop.color} />
              ) : (
                <>
                  <Line x1={offset} y1={31} x2={offset} y2={31 - stage * 6} stroke="#47783C" strokeWidth={2.1} />
                  <Ellipse cx={offset - 2.8} cy={27 - stage * 4} rx={3.6} ry={2} fill="#5F9B4A" transform={`rotate(-25 ${offset - 2.8} ${27 - stage * 4})`} />
                  <Ellipse cx={offset + 2.8} cy={26 - stage * 4} rx={3.4} ry={2} fill="#78AA55" transform={`rotate(25 ${offset + 2.8} ${26 - stage * 4})`} />
                  {stage >= 2 ? (
                    <Ellipse cx={offset} cy={18 - stage} rx={2.5} ry={4} fill={crop.color} />
                  ) : null}
                </>
              )}
            </G>
          ))}
        </>
        )
      ) : null}
    </G>
  );
}

function FarmObstacleView({ obstacle }: { obstacle: FarmObstacle }) {
  const x = obstacle.x * FARM_TILE_SIZE;
  const y = obstacle.y * FARM_TILE_SIZE;
  if (obstacle.kind === "rock") {
    return (
      <G>
        <Ellipse cx={x + 20} cy={y + 33} rx={14} ry={4} fill="#405C3E" opacity={0.28} />
        <Polygon points={`${x + 5},${y + 29} ${x + 8},${y + 17} ${x + 16},${y + 10} ${x + 26},${y + 12} ${x + 34},${y + 22} ${x + 32},${y + 31}`} fill="#858B80" stroke="#666D63" strokeWidth={1.5} />
        <Polygon points={`${x + 8},${y + 18} ${x + 16},${y + 11} ${x + 23},${y + 13} ${x + 17},${y + 22}`} fill="#A8ADA2" opacity={0.9} />
        <Path d={`M ${x + 17} ${y + 21} l 6 -4 M ${x + 23} ${y + 27} l 5 -4`} stroke="#687067" strokeWidth={1.1} />
        <Rect x={x + 5} y={y + 34} width={30} height={12} rx={5} fill="#FFF8DD" stroke="#B99A52" strokeWidth={0.8} />
        <SvgText x={x + 20} y={y + 43} fontSize={7} textAnchor="middle" fill="#6C5520" fontWeight="800">
          {FARM_OBSTACLE_CLEAR_COST} 💎
        </SvgText>
      </G>
    );
  }
  return (
    <G>
      <Ellipse cx={x + 20} cy={y + 34} rx={11} ry={3} fill="#405C3E" opacity={0.25} />
      <Path d={`M ${x + 19} ${y + 34} Q ${x + 17} ${y + 23} ${x + 22} ${y + 15}`} fill="none" stroke="#805233" strokeWidth={3} />
      <Circle cx={x + 18} cy={y + 19} r={7} fill="#6C9F51" />
      <Circle cx={x + 25} cy={y + 14} r={7} fill="#5C9148" />
      <Circle cx={x + 27} cy={y + 23} r={6} fill="#78A95A" />
      <Path d={`M ${x + 7} ${y + 35} q 4 -5 8 0 M ${x + 27} ${y + 35} q 4 -5 8 0`} fill="none" stroke="#6E9148" strokeWidth={2} />
      <Rect x={x + 5} y={y + 34} width={30} height={12} rx={5} fill="#FFF8DD" stroke="#B99A52" strokeWidth={0.8} />
      <SvgText x={x + 20} y={y + 43} fontSize={7} textAnchor="middle" fill="#6C5520" fontWeight="800">
        {FARM_OBSTACLE_CLEAR_COST} 💎
      </SvgText>
    </G>
  );
}

function LandParcel({
  farm,
  column,
  row,
}: {
  farm: FarmGameSave;
  column: number;
  row: number;
}) {
  if (isFarmParcelOwned(farm, column, row)) return null;
  const x = column * FARM_PARCEL_WIDTH * FARM_TILE_SIZE;
  const y = row * FARM_PARCEL_HEIGHT * FARM_TILE_SIZE;
  const width = FARM_PARCEL_WIDTH * FARM_TILE_SIZE;
  const height = FARM_PARCEL_HEIGHT * FARM_TILE_SIZE;
  const adjacent = isFarmParcelAdjacent(farm, column, row);
  return (
    <G>
      <Rect
        x={x + 5}
        y={y + 5}
        width={width - 10}
        height={height - 10}
        rx={14}
        fill="#53634B"
        fillOpacity={0.3}
        stroke="#42563D"
        strokeOpacity={0.75}
        strokeWidth={2}
        strokeDasharray="8 6"
      />
      <SvgText x={x + width / 2} y={y + height / 2 - 10} fontSize={23} textAnchor="middle" fill="#F7F5DA">
        🔒
      </SvgText>
      <SvgText
        x={x + width / 2}
        y={y + height / 2 + 17}
        fontSize={11}
        textAnchor="middle"
        fill="#F7F5DA"
        fontWeight="800"
      >
        {adjacent ? `${getNextLandExpansionCost(farm)} 🪙` : "مقفلة"}
      </SvgText>
      {adjacent ? (
        <SvgText
          x={x + width / 2}
          y={y + height / 2 + 34}
          fontSize={8}
          textAnchor="middle"
          fill="#F7F5DA"
        >
          اضغط للتوسعة
        </SvgText>
      ) : null}
    </G>
  );
}

function ParcelFence({
  farm,
  column,
  row,
}: {
  farm: FarmGameSave;
  column: number;
  row: number;
}) {
  if (!isFarmParcelOwned(farm, column, row)) return null;
  const x = column * FARM_PARCEL_WIDTH * FARM_TILE_SIZE;
  const y = row * FARM_PARCEL_HEIGHT * FARM_TILE_SIZE;
  const width = FARM_PARCEL_WIDTH * FARM_TILE_SIZE;
  const height = FARM_PARCEL_HEIGHT * FARM_TILE_SIZE;
  const edges = [
    {
      key: "top",
      exposed: !isFarmParcelOwned(farm, column, row - 1),
      x1: x,
      y1: y + 3,
      x2: x + width,
      y2: y + 3,
      posts: Array.from({ length: 7 }, (_, index) => ({ x: x + index * width / 6, y: y - 5, width: 3, height: 18 })),
    },
    {
      key: "bottom",
      exposed: !isFarmParcelOwned(farm, column, row + 1),
      x1: x,
      y1: y + height - 3,
      x2: x + width,
      y2: y + height - 3,
      posts: Array.from({ length: 7 }, (_, index) => ({ x: x + index * width / 6, y: y + height - 13, width: 3, height: 18 })),
    },
    {
      key: "left",
      exposed: !isFarmParcelOwned(farm, column - 1, row),
      x1: x + 3,
      y1: y,
      x2: x + 3,
      y2: y + height,
      posts: Array.from({ length: 7 }, (_, index) => ({ x: x - 5, y: y + index * height / 6, width: 18, height: 3 })),
    },
    {
      key: "right",
      exposed: !isFarmParcelOwned(farm, column + 1, row),
      x1: x + width - 3,
      y1: y,
      x2: x + width - 3,
      y2: y + height,
      posts: Array.from({ length: 7 }, (_, index) => ({ x: x + width - 13, y: y + index * height / 6, width: 18, height: 3 })),
    },
  ];
  return (
    <G>
      {edges.filter((edge) => edge.exposed).map((edge) => (
        <G key={edge.key}>
          <Line
            x1={edge.x1}
            y1={edge.y1}
            x2={edge.x2}
            y2={edge.y2}
            stroke="#754A2B"
            strokeWidth={4}
            strokeLinecap="round"
          />
          <Line
            x1={edge.key === "top" || edge.key === "bottom" ? edge.x1 : edge.x1 + 7}
            y1={edge.key === "top" || edge.key === "bottom" ? edge.y1 + (edge.key === "top" ? 8 : -8) : edge.y1}
            x2={edge.key === "top" || edge.key === "bottom" ? edge.x2 : edge.x2 + (edge.key === "left" ? 8 : -8)}
            y2={edge.key === "top" || edge.key === "bottom" ? edge.y2 + (edge.key === "top" ? 8 : -8) : edge.y2}
            stroke="#A4774B"
            strokeWidth={2.5}
          />
          {edge.posts.map((post, index) => (
            <Rect
              key={`${edge.key}-${index}`}
              x={post.x}
              y={post.y}
              width={post.width}
              height={post.height}
              rx={1.5}
              fill="#855832"
              stroke="#684426"
              strokeWidth={0.6}
            />
          ))}
        </G>
      ))}
    </G>
  );
}

function FruitTree({ tree, now }: { tree: FarmGameSave["trees"][number]; now: number }) {
  const definition = FRUIT_TREES[tree.kind];
  const state = getTreeGrowthState(tree, now);
  const x = tree.x * FARM_TILE_SIZE;
  const y = tree.y * FARM_TILE_SIZE;
  return (
    <G>
      <Ellipse cx={x + 20} cy={y + 35} rx={16} ry={4} fill="#456E42" opacity={0.24} />
      <Rect x={x + 17} y={y + 19} width={7} height={17} rx={3} fill="#805233" />
      <Circle cx={x + 20} cy={y + 15} r={15} fill={definition.color} />
      <Circle cx={x + 10} cy={y + 18} r={9} fill="#70A958" />
      <Circle cx={x + 30} cy={y + 18} r={9} fill="#4F8C4A" />
      {state.ready ? (
        <>
          <SvgText x={x + 13} y={y + 17} fontSize={12} textAnchor="middle">
            {definition.emoji}
          </SvgText>
          <SvgText x={x + 27} y={y + 15} fontSize={12} textAnchor="middle">
            {definition.emoji}
          </SvgText>
          <SvgText x={x + 20} y={y + 28} fontSize={12} textAnchor="middle">
            {definition.emoji}
          </SvgText>
          <Circle cx={x + 34} cy={y + 5} r={6} fill="#F3D56E" stroke="#FFF0B6" strokeWidth={1} />
        </>
      ) : (
        <Circle cx={x + 34} cy={y + 5} r={5} fill="#F1E2A1" opacity={0.92} />
      )}
      <SvgText x={x + 20} y={y + 47} fontSize={7} fill="#405C36" textAnchor="middle" fontWeight="700">
        {definition.fruitName}
      </SvgText>
    </G>
  );
}

function Decoration({
  decoration,
}: {
  decoration: FarmGameSave["decorations"][number];
}) {
  const x = decoration.x * FARM_TILE_SIZE;
  const y = decoration.y * FARM_TILE_SIZE;
  if (decoration.kind === "flowerBed") {
    return (
      <G>
        <Ellipse cx={x + 20} cy={y + 29} rx={15} ry={7} fill="#865638" />
        {[10, 18, 26, 32].map((offset, index) => (
          <G key={offset}>
            <Line x1={x + offset} y1={y + 29} x2={x + offset} y2={y + 15 + index % 2 * 3} stroke="#4C8244" strokeWidth={1.5} />
            <Circle cx={x + offset} cy={y + 14 + index % 2 * 3} r={3.5} fill={["#E76A70", "#F1CB54", "#A276D2", "#F4E2C6"][index]} />
          </G>
        ))}
      </G>
    );
  }
  if (decoration.kind === "gardenLamp") {
    return (
      <G>
        <Ellipse cx={x + 20} cy={y + 35} rx={9} ry={3} fill="#456E42" opacity={0.25} />
        <Line x1={x + 20} y1={y + 35} x2={x + 20} y2={y + 11} stroke="#674D39" strokeWidth={3} />
        <Rect x={x + 13} y={y + 7} width={14} height={9} rx={3} fill="#E8C55F" stroke="#8C6943" strokeWidth={1.5} />
        <Circle cx={x + 20} cy={y + 11} r={4} fill="#FFF2B5" opacity={0.9} />
      </G>
    );
  }
  return (
    <G>
      <Line x1={x + 2} y1={y + 27} x2={x + 38} y2={y + 27} stroke="#875A36" strokeWidth={3} />
      <Line x1={x + 5} y1={y + 13} x2={x + 5} y2={y + 36} stroke="#9A704A" strokeWidth={3} />
      <Line x1={x + 35} y1={y + 13} x2={x + 35} y2={y + 36} stroke="#9A704A" strokeWidth={3} />
      <Line x1={x + 7} y1={y + 17} x2={x + 33} y2={y + 17} stroke="#AE8051" strokeWidth={2.3} />
    </G>
  );
}

function FarmWorkerSprite({ worker, now }: { worker: FarmWorker; now: number }) {
  const position = getWorkerPosition(worker, now);
  const x = position.x * FARM_TILE_SIZE;
  const harvesting = worker.state === "harvesting";
  const y = position.y * FARM_TILE_SIZE + (harvesting ? 4 : 0);
  const harvestProgress = getWorkerHarvestProgress(worker, now);
  return (
    <G>
      {harvesting ? (
        <>
          <Rect x={x + 3} y={y - 2} width={34} height={6} rx={3} fill="#36583B" stroke="#FFFFFF" strokeWidth={1} />
          <Rect x={x + 4} y={y - 1} width={32 * harvestProgress} height={4} rx={2} fill="#F4D35E" />
        </>
      ) : null}
      <Ellipse cx={x + 20} cy={y + 35} rx={9} ry={3} fill="#35563B" opacity={0.3} />
      <SvgText x={x + 20} y={y + 32} fontSize={27} textAnchor="middle">
        🚶
      </SvgText>
      <SvgText x={x + 20} y={y + 47} fontSize={7} fill="#405C36" textAnchor="middle" fontWeight="700">
        {harvesting ? "يجمع" : "عامل"}
      </SvgText>
    </G>
  );
}

const FarmScene = forwardRef<FarmSceneHandle, FarmSceneProps>(function FarmScene(
  { farm, now, onTilePress, onObjectDragEnd, style },
  ref,
) {
  const [size, setSize] = useState({ width: 360, height: 330 });
  const [zoom, setZoom] = useState(1);
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [draggedObject, setDraggedObject] = useState<FarmObjectRef | null>(null);
  const [dragPosition, setDragPosition] = useState<FarmPosition | null>(null);
  const shellRef = useRef<View>(null);
  const dragSessionRef = useRef<FarmObjectRef | null>(null);
  const farmRef = useRef(farm);
  const onTilePressRef = useRef(onTilePress);
  const onObjectDragEndRef = useRef(onObjectDragEnd);
  farmRef.current = farm;
  onTilePressRef.current = onTilePress;
  onObjectDragEndRef.current = onObjectDragEnd;
  const centeredRef = useRef(false);
  const cameraRef = useRef(camera);
  const zoomRef = useRef(zoom);
  const sizeRef = useRef(size);
  cameraRef.current = camera;
  zoomRef.current = zoom;
  sizeRef.current = size;

  const clampCamera = (x: number, y: number, nextZoom = zoomRef.current) => {
    const currentSize = sizeRef.current;
    return {
      x: Math.max(0, Math.min(WORLD_WIDTH - currentSize.width / nextZoom, x)),
      y: Math.max(0, Math.min(WORLD_HEIGHT - currentSize.height / nextZoom, y)),
    };
  };

  const handleLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    if (layout.width > 0 && layout.height > 0) {
      const nextSize = { width: layout.width, height: layout.height };
      sizeRef.current = nextSize;
      setSize(nextSize);
      if (!centeredRef.current) {
        centeredRef.current = true;
        const nextZoom = zoomRef.current;
        setCamera(
          clampCamera(
            (farm.housePosition?.x ?? 8) * FARM_TILE_SIZE - nextSize.width / nextZoom / 2,
            (farm.housePosition?.y ?? 8) * FARM_TILE_SIZE - nextSize.height / nextZoom / 2,
            nextZoom,
          ),
        );
      }
    }
  };

  const findObject = useCallback((x: number, y: number): FarmObjectRef | null => {
    const currentFarm = farmRef.current;
    if (currentFarm.houseBuilt && currentFarm.housePosition?.x === x && currentFarm.housePosition.y === y) {
      return { type: "house", id: "house" };
    }
    const tree = currentFarm.trees.find((item) => item.x === x && item.y === y);
    if (tree) return { type: "tree", id: tree.id };
    const obstacle = currentFarm.obstacles.find((item) => item.x === x && item.y === y);
    if (obstacle) return { type: "obstacle", id: obstacle.id };
    const decoration = currentFarm.decorations.find((item) => item.x === x && item.y === y);
    if (decoration) return { type: "decoration", id: decoration.id };
    const plot = currentFarm.plots.find((item) => item.x === x && item.y === y);
    if (plot) return { type: "plot", id: plot.id };
    const parcel = getFarmParcelAt(x, y);
    if (!isFarmParcelOwned(currentFarm, parcel.column, parcel.row)) {
      return { type: "landParcel", id: `${parcel.column}:${parcel.row}` };
    }
    return null;
  }, []);

  const handlePress = useCallback((locationX: number, locationY: number) => {
    const currentCamera = cameraRef.current;
    const currentZoom = zoomRef.current;
    const worldX = currentCamera.x + locationX / currentZoom;
    const worldY = currentCamera.y + locationY / currentZoom;
    const x = Math.floor(worldX / FARM_TILE_SIZE);
    const y = Math.floor(worldY / FARM_TILE_SIZE);
    if (x < 0 || x >= FARM_MAP_COLUMNS || y < 0 || y >= FARM_MAP_ROWS) return;
    onTilePressRef.current({ x, y }, findObject(x, y));
  }, [findObject]);

  const screenToWorld = useCallback((locationX: number, locationY: number) => {
    const currentCamera = cameraRef.current;
    const currentZoom = zoomRef.current;
    return {
      x: Math.floor((currentCamera.x + locationX / currentZoom) / FARM_TILE_SIZE),
      y: Math.floor((currentCamera.y + locationY / currentZoom) / FARM_TILE_SIZE),
    };
  }, []);

  const handleObjectDragStart = useCallback((locationX: number, locationY: number) => {
    const position = screenToWorld(locationX, locationY);
    const object = findObject(position.x, position.y);
    if (!object || !["house", "plot", "tree"].includes(object.type)) return;
    dragSessionRef.current = object;
    setDraggedObject(object);
    setDragPosition(position);
  }, [findObject, screenToWorld]);

  const handleObjectDragMove = useCallback((locationX: number, locationY: number) => {
    if (!dragSessionRef.current) return;
    setDragPosition(screenToWorld(locationX, locationY));
  }, [screenToWorld]);

  const handleObjectDragEnd = useCallback((locationX: number, locationY: number) => {
    const object = dragSessionRef.current;
    if (!object) return;
    const position = screenToWorld(locationX, locationY);
    const inBounds = position.x >= 0
      && position.x < FARM_MAP_COLUMNS
      && position.y >= 0
      && position.y < FARM_MAP_ROWS;
    const targetObject = inBounds ? findObject(position.x, position.y) : null;
    dragSessionRef.current = null;
    setDraggedObject(null);
    setDragPosition(null);
    if (inBounds) onObjectDragEndRef.current?.(object, position, targetObject);
  }, [findObject, screenToWorld]);

  const panOrigin = useRef(camera);
  const pinchOrigin = useRef({ camera, zoom, worldX: 0, worldY: 0 });
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .minDistance(7)
        .runOnJS(true)
        .onStart(() => {
          panOrigin.current = cameraRef.current;
        })
        .onUpdate((event) => {
          const currentZoom = zoomRef.current;
          setCamera(
            clampCamera(
              panOrigin.current.x - event.translationX / currentZoom,
              panOrigin.current.y - event.translationY / currentZoom,
              currentZoom,
            ),
          );
        }),
    [],
  );
  const objectDragGesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(450)
        .runOnJS(true)
        .onStart((event) => handleObjectDragStart(event.x, event.y))
        .onUpdate((event) => handleObjectDragMove(event.x, event.y))
        .onEnd((event) => handleObjectDragEnd(event.x, event.y)),
    [handleObjectDragEnd, handleObjectDragMove, handleObjectDragStart],
  );
  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onStart((event) => {
          const currentZoom = zoomRef.current;
          const currentCamera = cameraRef.current;
          pinchOrigin.current = {
            camera: currentCamera,
            zoom: currentZoom,
            worldX: currentCamera.x + event.focalX / currentZoom,
            worldY: currentCamera.y + event.focalY / currentZoom,
          };
        })
        .onUpdate((event) => {
          const nextZoom = Math.max(0.55, Math.min(2.6, pinchOrigin.current.zoom * event.scale));
          const nextCamera = clampCamera(
            pinchOrigin.current.worldX - event.focalX / nextZoom,
            pinchOrigin.current.worldY - event.focalY / nextZoom,
            nextZoom,
          );
          zoomRef.current = nextZoom;
          setZoom(nextZoom);
          setCamera(nextCamera);
        }),
    [],
  );
  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(350)
        .maxDistance(9)
        .runOnJS(true)
        .onEnd((event, success) => {
          if (success) handlePress(event.x, event.y);
        }),
    [handlePress],
  );
  const worldGesture = useMemo(
    () => Gesture.Race(pinchGesture, objectDragGesture, panGesture, tapGesture),
    [objectDragGesture, panGesture, pinchGesture, tapGesture],
  );

  useImperativeHandle(ref, () => ({
    resolveDropPosition: (screenX, screenY) =>
      new Promise((resolve) => {
        const shell = shellRef.current;
        if (!shell) {
          resolve(null);
          return;
        }
        shell.measureInWindow((left, top, width, height) => {
          if (screenX < left || screenX > left + width || screenY < top || screenY > top + height) {
            resolve(null);
            return;
          }
          const currentZoom = zoomRef.current;
          const currentCamera = cameraRef.current;
          const x = Math.floor((currentCamera.x + (screenX - left) / currentZoom) / FARM_TILE_SIZE);
          const y = Math.floor((currentCamera.y + (screenY - top) / currentZoom) / FARM_TILE_SIZE);
          if (x < 0 || x >= FARM_MAP_COLUMNS || y < 0 || y >= FARM_MAP_ROWS) {
            resolve(null);
            return;
          }
          resolve({ position: { x, y }, object: findObject(x, y) });
        });
      }),
  }), [findObject]);

  const grassPatches = useMemo(
    () =>
      Array.from({ length: 94 }, (_, index) => ({
        x: (index * 197 + 41) % WORLD_WIDTH,
        y: (index * 283 + 67) % WORLD_HEIGHT,
        rx: 2 + (index % 4),
        ry: 1 + (index % 3),
        opacity: 0.05 + (index % 5) * 0.012,
        fill: index % 2 === 0 ? "#E5F0B1" : "#5B934C",
      })),
    [],
  );

  return (
    <GestureDetector gesture={worldGesture}>
      <View
        ref={shellRef}
        style={[styles.shell, style]}
        onLayout={handleLayout}
        accessible
        accessibilityRole="image"
        accessibilityLabel="أرض مزرعة مفتوحة. اسحب للتحرك، واستخدم إصبعين للتكبير والتصغير، واضغط للتفاعل."
      >
        <Svg
          width="100%"
          height="100%"
          viewBox={`${camera.x} ${camera.y} ${size.width / zoom} ${size.height / zoom}`}
          preserveAspectRatio="none"
          pointerEvents="none"
        >
          <Rect x={-1200} y={-1000} width={WORLD_WIDTH + 2400} height={WORLD_HEIGHT + 2000} fill="#A9CE7E" />
          {grassPatches.map((patch, index) => (
            <Ellipse
              key={`grass-${index}`}
              cx={patch.x}
              cy={patch.y}
              rx={patch.rx}
              ry={patch.ry}
              fill={patch.fill}
              opacity={patch.opacity}
            />
          ))}
          <Path d="M 0 180 Q 120 145 270 190 T 560 190" fill="none" stroke="#E7D09B" strokeWidth={12} opacity={0.65} />
          <Path d="M 0 180 Q 120 145 270 190 T 560 190" fill="none" stroke="#F4E6BF" strokeWidth={4} opacity={0.9} />
          {Array.from({ length: FARM_PARCEL_COLUMNS * FARM_PARCEL_ROWS }, (_, index) => (
            <LandParcel
              key={`land-${index}`}
              farm={farm}
              column={index % FARM_PARCEL_COLUMNS}
              row={Math.floor(index / FARM_PARCEL_COLUMNS)}
            />
          ))}
          {farm.obstacles.map((obstacle) => (
            <FarmObstacleView key={obstacle.id} obstacle={obstacle} />
          ))}
          {farm.plots.map((plot) => (
            draggedObject?.type === "plot" && draggedObject.id === plot.id
              ? null
              : <Field key={`plot-${plot.id}`} plot={plot} now={now} />
          ))}
          {farm.trees.map((tree) => (
            draggedObject?.type === "tree" && draggedObject.id === tree.id
              ? null
              : <FruitTree key={tree.id} tree={tree} now={now} />
          ))}
          {farm.decorations.map((item) => <Decoration key={`decor-${item.id}`} decoration={item} />)}
          {farm.houseBuilt && farm.housePosition && draggedObject?.type !== "house" ? (
            <G transform={`translate(${farm.housePosition.x * FARM_TILE_SIZE} ${farm.housePosition.y * FARM_TILE_SIZE})`}>
              <FarmHouse level={farm.houseLevel} />
            </G>
          ) : null}
          {draggedObject && dragPosition ? (
            <G opacity={0.82}>
              <Ellipse
                cx={dragPosition.x * FARM_TILE_SIZE + FARM_TILE_SIZE / 2}
                cy={dragPosition.y * FARM_TILE_SIZE + FARM_TILE_SIZE / 2}
                rx={25}
                ry={21}
                fill="#F8F4B3"
                opacity={0.42}
              />
              {draggedObject.type === "plot" ? (
                <Field
                  plot={{
                    ...farm.plots.find((item) => item.id === draggedObject.id)!,
                    ...dragPosition,
                  }}
                  now={now}
                />
              ) : null}
              {draggedObject.type === "tree" ? (
                <FruitTree
                  tree={{
                    ...farm.trees.find((item) => item.id === draggedObject.id)!,
                    ...dragPosition,
                  }}
                  now={now}
                />
              ) : null}
              {draggedObject.type === "house" ? (
                <G transform={`translate(${dragPosition.x * FARM_TILE_SIZE} ${dragPosition.y * FARM_TILE_SIZE})`}>
                  <FarmHouse level={farm.houseLevel} />
                </G>
              ) : null}
            </G>
          ) : null}
          {Array.from({ length: FARM_PARCEL_COLUMNS * FARM_PARCEL_ROWS }, (_, index) => (
            <ParcelFence
              key={`fence-${index}`}
              farm={farm}
              column={index % FARM_PARCEL_COLUMNS}
              row={Math.floor(index / FARM_PARCEL_COLUMNS)}
            />
          ))}
          {farm.workers.map((worker) => (
            <FarmWorkerSprite key={worker.id} worker={worker} now={now} />
          ))}
        </Svg>
      </View>
    </GestureDetector>
  );
});

export default FarmScene;

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    width: "100%",
    minHeight: 220,
    overflow: "hidden",
    borderRadius: 19,
    backgroundColor: "#A9CE7E",
  },
});
