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
      ) : null}
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

const FarmScene = forwardRef<FarmSceneHandle, FarmSceneProps>(function FarmScene(
  { farm, now, onTilePress, style },
  ref,
) {
  const [size, setSize] = useState({ width: 360, height: 330 });
  const [zoom, setZoom] = useState(1);
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const shellRef = useRef<View>(null);
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
            farm.playerPosition.x * FARM_TILE_SIZE - nextSize.width / nextZoom / 2,
            farm.playerPosition.y * FARM_TILE_SIZE - nextSize.height / nextZoom / 2,
            nextZoom,
          ),
        );
      }
    }
  };

  const findObject = useCallback((x: number, y: number): FarmObjectRef | null => {
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
  }, [farm]);

  const handlePress = useCallback((locationX: number, locationY: number) => {
    const currentCamera = cameraRef.current;
    const currentZoom = zoomRef.current;
    const worldX = currentCamera.x + locationX / currentZoom;
    const worldY = currentCamera.y + locationY / currentZoom;
    const x = Math.floor(worldX / FARM_TILE_SIZE);
    const y = Math.floor(worldY / FARM_TILE_SIZE);
    if (x < 0 || x >= FARM_MAP_COLUMNS || y < 0 || y >= FARM_MAP_ROWS) return;
    onTilePress({ x, y }, findObject(x, y));
  }, [findObject, onTilePress]);

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
    () => Gesture.Race(pinchGesture, panGesture, tapGesture),
    [panGesture, pinchGesture, tapGesture],
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
          {farm.plots.map((plot) => <Field key={`plot-${plot.id}`} plot={plot} now={now} />)}
          {farm.trees.map((tree) => <FruitTree key={tree.id} tree={tree} now={now} />)}
          {farm.decorations.map((item) => <Decoration key={`decor-${item.id}`} decoration={item} />)}
          {farm.houseBuilt && farm.housePosition ? (
            <G transform={`translate(${farm.housePosition.x * FARM_TILE_SIZE} ${farm.housePosition.y * FARM_TILE_SIZE})`}>
              <FarmHouse level={farm.houseLevel} />
            </G>
          ) : null}
          <Player position={farm.playerPosition} />
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
