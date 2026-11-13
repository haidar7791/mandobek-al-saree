import React, { useMemo, useRef, useState } from "react";
import {
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
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
  FARM_TILE_SIZE,
  FRUIT_TREES,
  getPlotGrowthState,
  getTreeGrowthState,
  type FarmGameSave,
  type FarmObjectRef,
  type FarmPosition,
} from "@/lib/farm-game";

export interface FarmSceneProps {
  farm: FarmGameSave;
  now: number;
  onTilePress: (position: FarmPosition, object: FarmObjectRef | null) => void;
}

const WORLD_WIDTH = FARM_MAP_COLUMNS * FARM_TILE_SIZE;
const WORLD_HEIGHT = FARM_MAP_ROWS * FARM_TILE_SIZE;

function tileColor(x: number, y: number) {
  const variation = (x * 13 + y * 7 + (x * y) % 11) % 5;
  return ["#A9CE7E", "#AED183", "#A5C979", "#B1D486", "#A8CC7C"][variation];
}

function FarmHouse({ level }: { level: number }) {
  const x = 7;
  return (
    <G>
      <Ellipse cx={20} cy={34} rx={18} ry={4} fill="#456E42" opacity={0.25} />
      <Polygon points="2,15 20,3 38,15 20,26" fill="#F6E4BE" stroke="#A8764C" strokeWidth={1.5} />
      <Polygon points="3,15 20,26 20,38 3,28" fill="#F0D9AE" stroke="#A8764C" strokeWidth={1} />
      <Polygon points="20,26 38,15 38,28 20,38" fill="#D6B985" stroke="#A8764C" strokeWidth={1} />
      <Polygon points="0,15 20,1 41,14 38,18 20,7 3,19" fill={level > 1 ? "#B94F42" : "#B75F42"} />
      <Rect x={24} y={27} width={6} height={11} fill="#855437" rx={1} />
      <Circle cx={28} cy={33} r={0.8} fill="#F3D78D" />
      <Rect x={7} y={20} width={6} height={5} fill="#99D1D0" stroke="#8B6646" strokeWidth={0.7} />
      {level >= 2 ? <Rect x={29} y={7} width={4} height={8} fill="#8E5C45" /> : null}
      <SvgText x={x} y={47} fontSize={8} fill="#4F5839" textAnchor="middle" fontWeight="700">
        منزل المزرعة
      </SvgText>
    </G>
  );
}

function Field({ plot, now }: { plot: FarmGameSave["plots"][number]; now: number }) {
  const crop = plot.cropId ? CROPS[plot.cropId] : null;
  const growth = crop ? getPlotGrowthState(plot, now) : null;
  const stage = growth?.ready ? 3 : (growth?.progress ?? 0) > 0.66 ? 2 : (growth?.progress ?? 0) > 0.12 ? 1 : 0;
  const cx = FARM_TILE_SIZE / 2;
  const cy = FARM_TILE_SIZE / 2 + 2;
  return (
    <G transform={`translate(${plot.x * FARM_TILE_SIZE} ${plot.y * FARM_TILE_SIZE})`}>
      <Rect x={2} y={8} width={36} height={28} rx={6} fill="#8A5938" stroke="#71462F" strokeWidth={1.5} />
      <Line x1={7} y1={16} x2={33} y2={16} stroke="#B17B4D" strokeWidth={1.6} />
      <Line x1={7} y1={23} x2={33} y2={23} stroke="#B17B4D" strokeWidth={1.6} />
      <Line x1={7} y1={30} x2={33} y2={30} stroke="#B17B4D" strokeWidth={1.6} />
      {crop ? (
        <>
          {[12, 20, 28].map((offset, index) => (
            <G key={offset}>
              {stage === 0 ? (
                <Circle cx={offset} cy={25 - index % 2} r={2.1} fill={crop.color} />
              ) : (
                <>
                  <Line x1={offset} y1={29} x2={offset} y2={29 - stage * 5} stroke="#548346" strokeWidth={1.8} />
                  <Ellipse cx={offset - 2.5} cy={26 - stage * 4} rx={3.2} ry={1.8} fill="#5F9B4A" transform={`rotate(-25 ${offset - 2.5} ${26 - stage * 4})`} />
                  <Ellipse cx={offset + 2.5} cy={25 - stage * 4} rx={3} ry={1.8} fill="#78AA55" transform={`rotate(25 ${offset + 2.5} ${25 - stage * 4})`} />
                </>
              )}
              {growth?.ready && (
                <Circle cx={offset} cy={15} r={2.5} fill={crop.color} stroke="#FFE8A2" strokeWidth={0.7} />
              )}
            </G>
          ))}
          {growth?.ready && <Circle cx={33} cy={7} r={6} fill="#F3D56E" stroke="#FFF0B6" strokeWidth={1} />}
        </>
      ) : (
        <SvgText x={cx} y={cy + 2} fontSize={10} fill="#F8E5BB" textAnchor="middle" fontWeight="700">
          حقل
        </SvgText>
      )}
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
          <Circle cx={x + 13} cy={y + 12} r={3.3} fill={definition.fruitColor} stroke="#FFF1BA" strokeWidth={0.7} />
          <Circle cx={x + 26} cy={y + 15} r={3.5} fill={definition.fruitColor} stroke="#FFF1BA" strokeWidth={0.7} />
          <Circle cx={x + 20} cy={y + 24} r={3.4} fill={definition.fruitColor} stroke="#FFF1BA" strokeWidth={0.7} />
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

function Player({ position }: { position: FarmPosition }) {
  const x = position.x * FARM_TILE_SIZE;
  const y = position.y * FARM_TILE_SIZE;
  return (
    <G>
      <Ellipse cx={x + 20} cy={y + 34} rx={8} ry={3} fill="#426B41" opacity={0.3} />
      <Circle cx={x + 20} cy={y + 14} r={6} fill="#F0C69A" stroke="#98694C" strokeWidth={1} />
      <Path d={`M ${x + 11} ${y + 32} Q ${x + 12} ${y + 20} ${x + 20} ${y + 20} Q ${x + 28} ${y + 20} ${x + 29} ${y + 32} Z`} fill="#4C8F5A" stroke="#356C46" strokeWidth={1} />
      <Path d={`M ${x + 15} ${y + 11} Q ${x + 20} ${y + 5} ${x + 26} ${y + 12}`} fill="none" stroke="#754E36" strokeWidth={3} />
    </G>
  );
}

export default function FarmScene({ farm, now, onTilePress }: FarmSceneProps) {
  const [size, setSize] = useState({ width: 360, height: 330 });
  const [zoom, setZoom] = useState(1);
  const [camera, setCamera] = useState({ x: 0, y: 0 });
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

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          Math.abs(gesture.dx) > 7 || Math.abs(gesture.dy) > 7,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 7 || Math.abs(gesture.dy) > 7,
        onPanResponderGrant: () => {
          panStart.current = cameraRef.current;
        },
        onPanResponderMove: (_event, gesture) => {
          const currentZoom = zoomRef.current;
          setCamera(
            clampCamera(
              panStart.current.x - gesture.dx / currentZoom,
              panStart.current.y - gesture.dy / currentZoom,
              currentZoom,
            ),
          );
        },
      }),
    [],
  );
  const panStart = useRef(camera);

  const handleLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    if (layout.width > 0 && layout.height > 0) {
      setSize({ width: layout.width, height: layout.height });
    }
  };

  const findObject = (x: number, y: number): FarmObjectRef | null => {
    if (farm.houseBuilt && farm.housePosition?.x === x && farm.housePosition.y === y) {
      return { type: "house", id: "house" };
    }
    const tree = farm.trees.find((item) => item.x === x && item.y === y);
    if (tree) return { type: "tree", id: tree.id };
    const decoration = farm.decorations.find((item) => item.x === x && item.y === y);
    if (decoration) return { type: "decoration", id: decoration.id };
    const plot = farm.plots.find((item) => item.x === x && item.y === y);
    if (plot) return { type: "plot", id: plot.id };
    return null;
  };

  const handlePress = (locationX: number, locationY: number) => {
    const worldX = camera.x + locationX / zoom;
    const worldY = camera.y + locationY / zoom;
    const x = Math.floor(worldX / FARM_TILE_SIZE);
    const y = Math.floor(worldY / FARM_TILE_SIZE);
    if (x < 0 || x >= FARM_MAP_COLUMNS || y < 0 || y >= FARM_MAP_ROWS) return;
    onTilePress({ x, y }, findObject(x, y));
  };

  const mapCells = useMemo(
    () =>
      Array.from({ length: FARM_MAP_COLUMNS * FARM_MAP_ROWS }, (_, index) => {
        const x = index % FARM_MAP_COLUMNS;
        const y = Math.floor(index / FARM_MAP_COLUMNS);
        return { x, y, color: tileColor(x, y) };
      }),
    [],
  );

  return (
    <View style={styles.shell} onLayout={handleLayout} {...panResponder.panHandlers}>
      <Svg
        width="100%"
        height="100%"
        viewBox={`${camera.x} ${camera.y} ${size.width / zoom} ${size.height / zoom}`}
        preserveAspectRatio="none"
        pointerEvents="none"
      >
        <Rect x={0} y={0} width={WORLD_WIDTH} height={WORLD_HEIGHT} fill="#A9CE7E" />
        {mapCells.map((cell) => (
          <Rect
            key={`tile-${cell.x}-${cell.y}`}
            x={cell.x * FARM_TILE_SIZE}
            y={cell.y * FARM_TILE_SIZE}
            width={FARM_TILE_SIZE}
            height={FARM_TILE_SIZE}
            fill={cell.color}
            stroke="rgba(79,122,61,0.22)"
            strokeWidth={0.8}
          />
        ))}
        <Path d="M 0 180 Q 120 145 270 190 T 560 190" fill="none" stroke="#E7D09B" strokeWidth={12} opacity={0.65} />
        <Path d="M 0 180 Q 120 145 270 190 T 560 190" fill="none" stroke="#F4E6BF" strokeWidth={4} opacity={0.9} />
        {farm.plots.map((plot) => <Field key={`plot-${plot.id}`} plot={plot} now={now} />)}
        {farm.trees.map((tree) => <FruitTree key={tree.id} tree={tree} now={now} />)}
        {farm.decorations.map((item) => <Decoration key={item.id} decoration={item} />)}
        {farm.houseBuilt && farm.housePosition ? (
          <G transform={`translate(${farm.housePosition.x * FARM_TILE_SIZE} ${farm.housePosition.y * FARM_TILE_SIZE})`}>
            <FarmHouse level={farm.houseLevel} />
          </G>
        ) : null}
        <Player position={farm.playerPosition} />
        <SvgText
          x={WORLD_WIDTH / 2}
          y={WORLD_HEIGHT - 9}
          fontSize={9}
          fill="#527344"
          textAnchor="middle"
        >
          أرض المزرعة
        </SvgText>
      </Svg>

      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={(event) => handlePress(event.nativeEvent.locationX, event.nativeEvent.locationY)}
        accessibilityRole="button"
        accessibilityLabel="أرض مزرعة مفتوحة. اسحب لاستكشافها واضغط لاختيار خانة."
      />
      <View style={styles.zoomControls}>
        <Pressable
          style={styles.zoomButton}
          accessibilityRole="button"
          accessibilityLabel="تكبير الخريطة"
          onPress={() => {
            const nextZoom = Math.min(1.8, Number((zoom + 0.2).toFixed(1)));
            const centerX = camera.x + size.width / zoom / 2;
            const centerY = camera.y + size.height / zoom / 2;
            setZoom(nextZoom);
            setCamera(clampCamera(centerX - size.width / nextZoom / 2, centerY - size.height / nextZoom / 2, nextZoom));
          }}
        >
          <Svg width={19} height={19} viewBox="0 0 24 24">
            <Line x1={12} y1={5} x2={12} y2={19} stroke="#355F3B" strokeWidth={2} />
            <Line x1={5} y1={12} x2={19} y2={12} stroke="#355F3B" strokeWidth={2} />
          </Svg>
        </Pressable>
        <Pressable
          style={styles.zoomButton}
          accessibilityRole="button"
          accessibilityLabel="تصغير الخريطة"
          onPress={() => {
            const nextZoom = Math.max(0.75, Number((zoom - 0.2).toFixed(1)));
            const centerX = camera.x + size.width / zoom / 2;
            const centerY = camera.y + size.height / zoom / 2;
            setZoom(nextZoom);
            setCamera(clampCamera(centerX - size.width / nextZoom / 2, centerY - size.height / nextZoom / 2, nextZoom));
          }}
        >
          <Svg width={19} height={19} viewBox="0 0 24 24">
            <Line x1={5} y1={12} x2={19} y2={12} stroke="#355F3B" strokeWidth={2} />
          </Svg>
        </Pressable>
        <Pressable
          style={styles.zoomButton}
          accessibilityRole="button"
          accessibilityLabel="العودة إلى المزارع"
          onPress={() => {
            const centerX = farm.playerPosition.x * FARM_TILE_SIZE;
            const centerY = farm.playerPosition.y * FARM_TILE_SIZE;
            setCamera(clampCamera(centerX - size.width / zoom / 2, centerY - size.height / zoom / 2));
          }}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Circle cx={12} cy={12} r={7} fill="none" stroke="#355F3B" strokeWidth={2} />
            <Circle cx={12} cy={12} r={2} fill="#355F3B" />
          </Svg>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: "100%",
    height: 330,
    overflow: "hidden",
    borderRadius: 19,
    backgroundColor: "#A9CE7E",
    borderWidth: 1,
    borderColor: "#7EAC68",
  },
  zoomControls: {
    position: "absolute",
    right: 9,
    top: 9,
    gap: 6,
  },
  zoomButton: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderColor: "#D9E8D0",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
  },
});
