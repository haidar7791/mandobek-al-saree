import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Image,
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
  getFarmParcelExpansionCost,
  getFarmParcelAt,
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

type WorldPoint = { x: number; y: number };

function parcelCorner(column: number, row: number): WorldPoint {
  const x = column * FARM_PARCEL_WIDTH * FARM_TILE_SIZE;
  const y = row * FARM_PARCEL_HEIGHT * FARM_TILE_SIZE;
  const interior = column > 0
    && column < FARM_PARCEL_COLUMNS
    && row > 0
    && row < FARM_PARCEL_ROWS;
  if (!interior) return { x, y };
  const xNudge = ((column * 17 + row * 11) % 39) - 19;
  const yNudge = ((column * 7 + row * 13) % 33) - 16;
  return { x: x + xNudge, y: y + yNudge };
}

function parcelPath(column: number, row: number): string {
  const topLeft = parcelCorner(column, row);
  const topRight = parcelCorner(column + 1, row);
  const bottomRight = parcelCorner(column + 1, row + 1);
  const bottomLeft = parcelCorner(column, row + 1);
  return `M ${topLeft.x} ${topLeft.y} L ${topRight.x} ${topRight.y} L ${bottomRight.x} ${bottomRight.y} L ${bottomLeft.x} ${bottomLeft.y} Z`;
}

function parcelAtWorldPoint(worldX: number, worldY: number): { column: number; row: number } {
  for (let row = 0; row < FARM_PARCEL_ROWS; row += 1) {
    for (let column = 0; column < FARM_PARCEL_COLUMNS; column += 1) {
      const points = [
        parcelCorner(column, row),
        parcelCorner(column + 1, row),
        parcelCorner(column + 1, row + 1),
        parcelCorner(column, row + 1),
      ];
      let inside = false;
      for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
        const current = points[index];
        const prior = points[previous];
        const intersects = (current.y > worldY) !== (prior.y > worldY)
          && worldX < ((prior.x - current.x) * (worldY - current.y)) / (prior.y - current.y) + current.x;
        if (intersects) inside = !inside;
      }
      if (inside) return { column, row };
    }
  }
  return getFarmParcelAt(
    Math.floor(worldX / FARM_TILE_SIZE),
    Math.floor(worldY / FARM_TILE_SIZE),
  );
}

function FarmHouse({ level }: { level: number }) {
  return (
    <G>
      <Ellipse cx={20} cy={67} rx={42} ry={9} fill="#263E28" opacity={0.3} />
      <Polygon points="-19,48 20,29 59,47 20,67" fill="#6D573C" />
      <Polygon points="-8,30 20,45 20,66 -8,51" fill="#C7A77C" stroke="#79583B" strokeWidth={1.5} />
      <Polygon points="20,45 49,29 49,51 20,66" fill="#9B7958" stroke="#79583B" strokeWidth={1.5} />
      <Polygon points="-20,29 17,4 23,8 -12,35" fill="#7B4936" stroke="#573527" strokeWidth={1.5} />
      <Polygon points="17,4 60,27 51,34 23,17" fill={level > 1 ? "#B96D48" : "#A75D3D"} stroke="#573527" strokeWidth={1.5} />
      <Path d="M -13 32 L 19 11 L 53 29" fill="none" stroke="#D5915A" strokeWidth={3} />
      <Polygon points="10,39 20,44 20,66 10,60" fill="#644634" />
      <Rect x={31} y={45} width={10} height={10} rx={1} fill="#C9E5DD" stroke="#694B34" strokeWidth={1.4} />
      <Line x1={36} y1={45} x2={36} y2={55} stroke="#694B34" strokeWidth={1} />
      <Line x1={31} y1={50} x2={41} y2={50} stroke="#694B34" strokeWidth={1} />
      <Rect x={23} y={2} width={7} height={15} fill="#755039" stroke="#573527" strokeWidth={1} />
      <Path d="M 20 81 Q 20 75 20 72" stroke="#543F31" strokeWidth={1.5} />
      <SvgText x={20} y={75} fontSize={8} fill="#FFF8DB" stroke="#3B432D" strokeWidth={1.5} textAnchor="middle" fontWeight="800">
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
    <G transform={`translate(${plot.x * FARM_TILE_SIZE + 16} ${plot.y * FARM_TILE_SIZE}) scale(1.2 1.1)`}>
      <Ellipse cx={20} cy={50} rx={35} ry={6} fill="#263E28" opacity={0.28} />
      <Polygon points="-13,13 18,1 53,11 53,41 20,52 -13,41" fill="#815132" stroke="#65412E" strokeWidth={2} />
      <Polygon points="-7,14 19,5 47,13 47,38 20,47 -7,38" fill="#96613D" />
      <Path d="M -8 21 L 47 19 M -8 29 L 47 27 M -8 37 L 47 35 M 3 9 L 3 43 M 22 5 L 22 46 M 39 10 L 39 41" stroke="#B17B4D" strokeWidth={1.7} opacity={0.9} />
      {crop ? (
        growth?.ready ? (
          <>
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <SvgText
                key={index}
                x={1 + (index % 3) * 19}
                y={24 + Math.floor(index / 3) * 15}
                fontSize={15}
                textAnchor="middle"
              >
                {crop.emoji}
              </SvgText>
            ))}
          </>
        ) : (
        <>
          {[1, 20, 39].map((offset, index) => (
            <G key={offset}>
              {stage === 0 ? (
                <Circle cx={offset} cy={34 - index % 2 * 5} r={3.2} fill={crop.color} />
              ) : (
                <>
                  <Line x1={offset} y1={40} x2={offset} y2={40 - stage * 7} stroke="#47783C" strokeWidth={2.8} />
                  <Ellipse cx={offset - 4} cy={35 - stage * 4} rx={4.4} ry={2.6} fill="#5F9B4A" transform={`rotate(-25 ${offset - 4} ${35 - stage * 4})`} />
                  <Ellipse cx={offset + 4} cy={34 - stage * 4} rx={4.2} ry={2.5} fill="#78AA55" transform={`rotate(25 ${offset + 4} ${34 - stage * 4})`} />
                  {stage >= 2 ? (
                    <Ellipse cx={offset} cy={25 - stage} rx={3} ry={5} fill={crop.color} />
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
  const topLeft = parcelCorner(column, row);
  const topRight = parcelCorner(column + 1, row);
  const bottomRight = parcelCorner(column + 1, row + 1);
  const bottomLeft = parcelCorner(column, row + 1);
  const centerX = (topLeft.x + topRight.x + bottomRight.x + bottomLeft.x) / 4;
  const centerY = (topLeft.y + topRight.y + bottomRight.y + bottomLeft.y) / 4;
  const adjacent = isFarmParcelAdjacent(farm, column, row);
  const price = getFarmParcelExpansionCost(farm, column, row);
  const lockY = centerY - 32;
  return (
    <G>
      <Path
        d={parcelPath(column, row)}
        fill="#E7E1B8"
        fillOpacity={0.035}
        stroke="#E8D8A1"
        strokeOpacity={0.52}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <Path
        d={`M ${centerX - 10} ${lockY + 2} v-7 a10 10 0 0 1 20 0 v7`}
        fill="none"
        stroke="#302F26"
        strokeWidth={7}
        strokeLinecap="round"
      />
      <Path
        d={`M ${centerX - 10} ${lockY + 2} v-7 a10 10 0 0 1 20 0 v7`}
        fill="none"
        stroke="#C8C7B8"
        strokeWidth={4}
        strokeLinecap="round"
      />
      <Rect x={centerX - 16} y={lockY - 1} width={32} height={27} rx={5} fill="#323329" opacity={0.94} />
      <Rect x={centerX - 13} y={lockY + 2} width={26} height={21} rx={3} fill="#A6A698" stroke="#ECE8D5" strokeWidth={1.2} />
      <Circle cx={centerX} cy={lockY + 10} r={2.4} fill="#55564D" />
      <Path d={`M ${centerX} ${lockY + 11} l-2 5 h4 z`} fill="#55564D" />
      <Rect x={centerX - 50} y={centerY + 9} width={100} height={26} rx={5} fill="#25291F" opacity={0.82} stroke="#E9D497" strokeOpacity={0.75} strokeWidth={1} />
      <SvgText
        x={centerX}
        y={centerY + 27}
        fontSize={14}
        textAnchor="middle"
        fill="#FFF5D3"
        fontWeight="800"
      >
        {`${price.toLocaleString("en-US")} 🪙`}
      </SvgText>
      {adjacent ? (
        <SvgText x={centerX} y={centerY + 49} fontSize={8} textAnchor="middle" fill="#FFF9E4" fontWeight="700">
          اضغط للشراء
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
  const topLeft = parcelCorner(column, row);
  const topRight = parcelCorner(column + 1, row);
  const bottomRight = parcelCorner(column + 1, row + 1);
  const bottomLeft = parcelCorner(column, row + 1);
  const edges = [
    {
      key: "top",
      exposed: !isFarmParcelOwned(farm, column, row - 1),
      start: topLeft,
      end: topRight,
    },
    {
      key: "bottom",
      exposed: !isFarmParcelOwned(farm, column, row + 1),
      start: bottomLeft,
      end: bottomRight,
    },
    {
      key: "left",
      exposed: !isFarmParcelOwned(farm, column - 1, row),
      start: topLeft,
      end: bottomLeft,
    },
    {
      key: "right",
      exposed: !isFarmParcelOwned(farm, column + 1, row),
      start: topRight,
      end: bottomRight,
    },
  ];
  return (
    <G>
      {edges.filter((edge) => edge.exposed).map((edge) => (
        <G key={edge.key}>
          <Path
            d={`M ${edge.start.x} ${edge.start.y} L ${edge.end.x} ${edge.end.y}`}
            stroke="#694329"
            strokeWidth={4}
            strokeLinecap="round"
          />
          <Path
            d={`M ${edge.start.x} ${edge.start.y - 5} L ${edge.end.x} ${edge.end.y - 5}`}
            stroke="#B18453"
            strokeWidth={2.2}
            strokeLinecap="round"
          />
          {Array.from(
            { length: Math.max(3, Math.ceil(Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y) / 48)) },
            (_, index) => {
              const postCount = Math.max(3, Math.ceil(Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y) / 48));
              const progress = index / (postCount - 1);
              const x = edge.start.x + (edge.end.x - edge.start.x) * progress;
              const y = edge.start.y + (edge.end.y - edge.start.y) * progress;
              return (
            <Rect
              key={`${edge.key}-${index}`}
              x={x - 2}
              y={y - 7.5}
              width={4}
              height={15}
              rx={2}
              fill="#8C603A"
              stroke="#5F3D27"
              strokeWidth={0.8}
            />
              );
            },
          )}
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
      <Ellipse cx={x + 20} cy={y + 57} rx={25} ry={6} fill="#263E28" opacity={0.3} />
      <Rect x={x + 16} y={y + 24} width={9} height={34} rx={4} fill="#805233" />
      <Circle cx={x + 20} cy={y + 17} r={21} fill={definition.color} />
      <Circle cx={x + 5} cy={y + 24} r={13} fill="#70A958" />
      <Circle cx={x + 35} cy={y + 24} r={13} fill="#4F8C4A" />
      <Circle cx={x + 12} cy={y + 8} r={12} fill="#76A95A" />
      <Circle cx={x + 29} cy={y + 9} r={12} fill="#5C9148" />
      {state.ready ? (
        <>
          <SvgText x={x + 7} y={y + 21} fontSize={13} textAnchor="middle">
            {definition.emoji}
          </SvgText>
          <SvgText x={x + 31} y={y + 15} fontSize={13} textAnchor="middle">
            {definition.emoji}
          </SvgText>
          <SvgText x={x + 20} y={y + 37} fontSize={13} textAnchor="middle">
            {definition.emoji}
          </SvgText>
          <Circle cx={x + 40} cy={y + 7} r={7} fill="#F3D56E" stroke="#FFF0B6" strokeWidth={1} />
        </>
      ) : (
        <Circle cx={x + 40} cy={y + 7} r={6} fill="#F1E2A1" opacity={0.92} />
      )}
      <SvgText x={x + 20} y={y + 70} fontSize={8} fill="#FFF8DF" stroke="#3B432D" strokeWidth={1.4} textAnchor="middle" fontWeight="800">
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
  const y = position.y * FARM_TILE_SIZE + (harvesting ? 12 : 8);
  const harvestProgress = getWorkerHarvestProgress(worker, now);
  const dx = worker.to ? worker.to.x - worker.from.x : 0;
  const dy = worker.to ? worker.to.y - worker.from.y : 0;
  const direction = worker.state !== "walking" || !worker.to
    ? "stationary"
    : Math.abs(dx) >= Math.abs(dy)
      ? (dx < 0 ? "left" : "right")
      : (dy < 0 ? "up" : "down");
  const mirrored = direction === "right";
  return (
    <G>
      {harvesting ? (
        <>
          <Rect x={x - 2} y={y - 4} width={44} height={7} rx={3.5} fill="#36583B" stroke="#FFFFFF" strokeWidth={1} />
          <Rect x={x} y={y - 2} width={40 * harvestProgress} height={3} rx={1.5} fill="#F4D35E" />
        </>
      ) : null}
      <Ellipse cx={x + 20} cy={y + 45} rx={13} ry={4} fill="#263E28" opacity={0.32} />
      {direction === "up" ? (
        <G>
          <Circle cx={x + 20} cy={y + 13} r={8} fill="#D9AF86" stroke="#80583C" strokeWidth={1} />
          <Path
            d={`M ${x + 8} ${y + 39} Q ${x + 8} ${y + 22} ${x + 20} ${y + 21} Q ${x + 32} ${y + 22} ${x + 32} ${y + 39} Z`}
            fill="#A85F39"
            stroke="#75442F"
            strokeWidth={1.3}
          />
          <Path d={`M ${x + 12} ${y + 26} Q ${x + 20} ${y + 30} ${x + 28} ${y + 26}`} fill="none" stroke="#D89162" strokeWidth={1.5} />
          <Line x1={x + 15} y1={y + 38} x2={x + 12} y2={y + 46} stroke="#4C4239" strokeWidth={3.4} strokeLinecap="round" />
          <Line x1={x + 25} y1={y + 38} x2={x + 28} y2={y + 46} stroke="#4C4239" strokeWidth={3.4} strokeLinecap="round" />
        </G>
      ) : direction === "down" ? (
        <SvgText x={x + 20} y={y + 42} fontSize={40} textAnchor="middle">
          🧍
        </SvgText>
      ) : (
        <SvgText
          x={x + 20}
          y={y + 42}
          fontSize={40}
          textAnchor="middle"
          transform={mirrored ? `translate(${(x + 20) * 2} 0) scale(-1 1)` : undefined}
        >
          🚶
        </SvgText>
      )}
      <SvgText x={x + 20} y={y + 59} fontSize={9} fill="#FFF8DF" stroke="#3B432D" strokeWidth={1.4} textAnchor="middle" fontWeight="800">
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
  const dragGrabOffsetRef = useRef({ x: 0, y: 0 });
  const farmRef = useRef(farm);
  const onTilePressRef = useRef(onTilePress);
  const onObjectDragEndRef = useRef(onObjectDragEnd);
  farmRef.current = farm;
  onTilePressRef.current = onTilePress;
  onObjectDragEndRef.current = onObjectDragEnd;
  const centeredRef = useRef(false);
  const layoutMeasuredRef = useRef(false);
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
      layoutMeasuredRef.current = true;
      setSize(nextSize);
    }
  };

  React.useEffect(() => {
    if (centeredRef.current || !layoutMeasuredRef.current || !farm.housePosition) return;
    centeredRef.current = true;
    const nextZoom = Math.min(2.6, Math.max(0.68, size.width / WORLD_WIDTH));
    const landscapePreviewOffset = nextZoom < 0.75 ? WORLD_HEIGHT * 0.09 : 0;
    const nextCamera = clampCamera(
      farm.housePosition.x * FARM_TILE_SIZE - size.width / nextZoom / 2,
      farm.housePosition.y * FARM_TILE_SIZE - size.height / nextZoom / 2 - landscapePreviewOffset,
      nextZoom,
    );
    zoomRef.current = nextZoom;
    cameraRef.current = nextCamera;
    setZoom(nextZoom);
    setCamera(nextCamera);
  }, [farm.housePosition, size.height, size.width]);

  const findObject = useCallback((worldX: number, worldY: number): FarmObjectRef | null => {
    const currentFarm = farmRef.current;
    const inside = (left: number, top: number, right: number, bottom: number) => (
      worldX >= left && worldX <= right && worldY >= top && worldY <= bottom
    );
    if (
      currentFarm.houseBuilt
      && currentFarm.housePosition
      && inside(
        currentFarm.housePosition.x * FARM_TILE_SIZE - 22,
        currentFarm.housePosition.y * FARM_TILE_SIZE,
        currentFarm.housePosition.x * FARM_TILE_SIZE + 62,
        currentFarm.housePosition.y * FARM_TILE_SIZE + 84,
      )
    ) {
      return { type: "house", id: "house" };
    }
    const tree = currentFarm.trees.find((item) => inside(
      item.x * FARM_TILE_SIZE - 10,
      item.y * FARM_TILE_SIZE - 10,
      item.x * FARM_TILE_SIZE + 50,
      item.y * FARM_TILE_SIZE + 73,
    ));
    if (tree) return { type: "tree", id: tree.id };
    const plot = currentFarm.plots.find((item) => inside(
      item.x * FARM_TILE_SIZE,
      item.y * FARM_TILE_SIZE,
      item.x * FARM_TILE_SIZE + 80,
      item.y * FARM_TILE_SIZE + 58,
    ));
    if (plot) return { type: "plot", id: plot.id };
    const x = Math.floor(worldX / FARM_TILE_SIZE);
    const y = Math.floor(worldY / FARM_TILE_SIZE);
    const obstacle = currentFarm.obstacles.find((item) => item.x === x && item.y === y);
    if (obstacle) return { type: "obstacle", id: obstacle.id };
    const decoration = currentFarm.decorations.find((item) => item.x === x && item.y === y);
    if (decoration) return { type: "decoration", id: decoration.id };
    const parcel = parcelAtWorldPoint(worldX, worldY);
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
    onTilePressRef.current({ x, y }, findObject(worldX, worldY));
  }, [findObject]);

  const screenToWorldPoint = useCallback((locationX: number, locationY: number) => {
    const currentCamera = cameraRef.current;
    const currentZoom = zoomRef.current;
    return {
      x: currentCamera.x + locationX / currentZoom,
      y: currentCamera.y + locationY / currentZoom,
    };
  }, []);

  const screenToWorld = useCallback((
    locationX: number,
    locationY: number,
    offset = { x: 0, y: 0 },
  ) => {
    const point = screenToWorldPoint(locationX, locationY);
    return {
      x: Math.floor((point.x - offset.x) / FARM_TILE_SIZE),
      y: Math.floor((point.y - offset.y) / FARM_TILE_SIZE),
    };
  }, [screenToWorldPoint]);

  const handleObjectDragStart = useCallback((locationX: number, locationY: number) => {
    const point = screenToWorldPoint(locationX, locationY);
    const object = findObject(point.x, point.y);
    if (!object || !["house", "plot", "tree"].includes(object.type)) return;
    const currentFarm = farmRef.current;
    const objectPosition = object.type === "house"
      ? currentFarm.housePosition
      : object.type === "plot"
        ? currentFarm.plots.find((item) => item.id === object.id)
        : currentFarm.trees.find((item) => item.id === object.id);
    if (!objectPosition) return;
    dragGrabOffsetRef.current = {
      x: point.x - objectPosition.x * FARM_TILE_SIZE,
      y: point.y - objectPosition.y * FARM_TILE_SIZE,
    };
    dragSessionRef.current = object;
    setDraggedObject(object);
    setDragPosition({ x: objectPosition.x, y: objectPosition.y });
  }, [findObject, screenToWorldPoint]);

  const handleObjectDragMove = useCallback((locationX: number, locationY: number) => {
    if (!dragSessionRef.current) return;
    setDragPosition(screenToWorld(locationX, locationY, dragGrabOffsetRef.current));
  }, [screenToWorld]);

  const handleObjectDragEnd = useCallback((locationX: number, locationY: number) => {
    const object = dragSessionRef.current;
    if (!object) return;
    const position = screenToWorld(locationX, locationY, dragGrabOffsetRef.current);
    const inBounds = position.x >= 0
      && position.x < FARM_MAP_COLUMNS
      && position.y >= 0
      && position.y < FARM_MAP_ROWS;
    const targetObject = inBounds
      ? findObject(
        (position.x + 0.5) * FARM_TILE_SIZE,
        (position.y + 0.5) * FARM_TILE_SIZE,
      )
      : null;
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
          const worldX = currentCamera.x + (screenX - left) / currentZoom;
          const worldY = currentCamera.y + (screenY - top) / currentZoom;
          const x = Math.floor(worldX / FARM_TILE_SIZE);
          const y = Math.floor(worldY / FARM_TILE_SIZE);
          if (x < 0 || x >= FARM_MAP_COLUMNS || y < 0 || y >= FARM_MAP_ROWS) {
            resolve(null);
            return;
          }
          resolve({ position: { x, y }, object: findObject(worldX, worldY) });
        });
      }),
  }), [findObject]);

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
        <Image
          source={require("../../assets/forus-farm-landscape.jpg")}
          resizeMode="stretch"
          style={[
            styles.worldBackground,
            {
              left: -camera.x * zoom,
              top: -camera.y * zoom,
              width: WORLD_WIDTH * zoom,
              height: WORLD_HEIGHT * zoom,
            },
          ]}
        />
        <Svg
          style={styles.worldOverlay}
          width="100%"
          height="100%"
          viewBox={`${camera.x} ${camera.y} ${size.width / zoom} ${size.height / zoom}`}
          preserveAspectRatio="none"
          pointerEvents="none"
        >
          <Rect x={0} y={0} width={WORLD_WIDTH} height={WORLD_HEIGHT} fill="#203B26" opacity={0.055} />
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
  worldBackground: {
    position: "absolute",
    zIndex: 0,
    pointerEvents: "none",
  },
  worldOverlay: {
    zIndex: 1,
  },
});
