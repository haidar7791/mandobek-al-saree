/* eslint-disable react/no-unknown-property */
import React, { useMemo, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Canvas, useFrame, useThree } from "@react-three/fiber/native";
import { CROPS, getPlotGrowthState, type CropId, type FarmPlot } from "../../lib/farm-game";

export interface FarmSceneProps {
  plots: FarmPlot[];
  selectedCrop: CropId;
  toolMode: "plant" | "water";
  expansionCost: number;
  houseBuilt: boolean;
  now: number;
  onPlotPress: (plot: FarmPlot) => void;
}

type FarmSceneViewProps = FarmSceneProps;

const FIELD_X = 1.43;
const FIELD_Z = 1.3;
const PLOT_WIDTH = 1.31;
const PLOT_DEPTH = 1.17;

function cropPosition(id: number): [number, number, number] {
  const column = id % 6;
  const row = Math.floor(id / 6);
  return [(column - 2.5) * FIELD_X, 0.12, (row - 1.5) * FIELD_Z];
}

function plotLabel(plot: FarmPlot, selectedCrop: CropId, expansionCost: number, now: number): string {
  if (!plot.unlocked) return `أرض مقفلة رقم ${plot.id + 1}. تكلفة التوسعة ${expansionCost} عملة.`;
  if (!plot.cropId) return `أرض فارغة رقم ${plot.id + 1}. بذور ${CROPS[selectedCrop].name}.`;
  const timing = getPlotGrowthState(plot, now);
  return timing.ready
    ? `${CROPS[plot.cropId].name}، جاهز للحصاد.`
    : `${CROPS[plot.cropId].name}، ${timing.watered ? "ينمو بعد الري" : "بحاجة إلى الري"}.`;
}

function CropPlants({ cropId, stage }: { cropId: CropId; stage: number }) {
  const crop = CROPS[cropId];
  const plantCount = stage >= 3 ? 4 : stage >= 2 ? 3 : 2;
  const height = stage === 0 ? 0.08 : stage === 1 ? 0.2 : stage === 2 ? 0.36 : 0.52;
  const foliage = cropId === "wheat" ? "#78934A" : cropId === "corn" ? "#347E48" : "#538D4B";

  return (
    <group position={[0, 0.13, 0]}>
      {Array.from({ length: plantCount }, (_, index) => {
        const x = ((index % 2) - 0.5) * 0.36 + (index > 1 ? 0.04 : 0);
        const z = (Math.floor(index / 2) - 0.5) * 0.34;
        const stalkHeight = height * (index % 2 === 0 ? 1 : 0.82);
        return (
          <group key={`${cropId}-${stage}-${index}`} position={[x, 0, z]}>
            <mesh position={[0, stalkHeight / 2, 0]}>
              <cylinderGeometry args={[0.022, 0.034, stalkHeight, 5]} />
              <meshStandardMaterial color={cropId === "wheat" ? "#9B9848" : foliage} roughness={0.88} />
            </mesh>
            {stage > 0 && (
              <>
                <mesh position={[-0.08, stalkHeight * 0.55, 0]} rotation={[0, 0, 0.55]}>
                  <sphereGeometry args={[0.105 * Math.min(1, stage / 2), 7, 5]} />
                  <meshStandardMaterial color={foliage} roughness={0.92} />
                </mesh>
                <mesh position={[0.08, stalkHeight * 0.7, 0]} rotation={[0, 0, -0.5]}>
                  <sphereGeometry args={[0.09 * Math.min(1, stage / 2), 7, 5]} />
                  <meshStandardMaterial color={cropId === "corn" ? "#43894A" : foliage} roughness={0.92} />
                </mesh>
              </>
            )}
            {cropId === "wheat" && stage >= 2 && (
              <mesh position={[0, stalkHeight + 0.075, 0]}>
                <sphereGeometry args={[0.075, 7, 6]} />
                <meshStandardMaterial color={crop.color} roughness={0.75} />
              </mesh>
            )}
            {cropId === "carrot" && stage >= 2 && (
              <mesh position={[0, 0.065, 0]} rotation={[Math.PI, 0, 0]}>
                <coneGeometry args={[0.085, 0.22, 6]} />
                <meshStandardMaterial color={crop.color} roughness={0.82} />
              </mesh>
            )}
            {cropId === "corn" && stage >= 3 && (
              <mesh position={[0.075, stalkHeight * 0.62, 0]} rotation={[0, 0, -0.18]}>
                <sphereGeometry args={[0.105, 8, 6]} />
                <meshStandardMaterial color={crop.color} roughness={0.75} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

function FarmPlotTile({
  plot,
  position,
  selected,
  selectedCrop,
  toolMode,
  now,
  onPress,
}: {
  plot: FarmPlot;
  position: [number, number, number];
  selected: boolean;
  selectedCrop: CropId;
  toolMode: "plant" | "water";
  now: number;
  onPress: () => void;
}) {
  const growth = getPlotGrowthState(plot, now);
  const stage = growth.ready ? 3 : growth.progress >= 0.66 ? 2 : growth.progress > 0.08 ? 1 : 0;
  const soil = plot.unlocked ? "#9B6841" : "#9A9B78";
  const furrow = plot.unlocked ? "#765036" : "#898A70";
  const crop = plot.cropId ? CROPS[plot.cropId] : null;

  return (
    <group position={position}>
      <mesh position={[0, -0.035, 0]} receiveShadow>
        <boxGeometry args={[PLOT_WIDTH + 0.08, 0.15, PLOT_DEPTH + 0.08]} />
        <meshStandardMaterial color={plot.unlocked ? "#B8895D" : "#85866F"} roughness={1} />
      </mesh>
      <mesh position={[0, 0.06, 0]} receiveShadow>
        <boxGeometry args={[PLOT_WIDTH, 0.12, PLOT_DEPTH]} />
        <meshStandardMaterial color={soil} roughness={0.98} />
      </mesh>
      {plot.unlocked && (
        <>
          {[-0.29, 0, 0.29].map((z) => (
            <mesh key={z} position={[0, 0.126, z]}>
              <boxGeometry args={[1.08, 0.012, 0.025]} />
              <meshStandardMaterial color={furrow} roughness={1} />
            </mesh>
          ))}
          {crop ? (
            <CropPlants cropId={plot.cropId!} stage={stage} />
          ) : (
            <mesh position={[0, 0.19, 0]}>
              <sphereGeometry args={[0.075, 7, 5]} />
              <meshStandardMaterial color={CROPS[selectedCrop].color} roughness={0.8} />
            </mesh>
          )}
          {toolMode === "water" && crop && !growth.watered && !growth.ready && (
            <mesh position={[0.46, 0.22, 0.36]}>
              <sphereGeometry args={[0.09, 8, 6]} />
              <meshStandardMaterial color="#76C5D1" roughness={0.35} />
            </mesh>
          )}
        </>
      )}
      {!plot.unlocked && (
        <group position={[0, 0.2, 0]}>
          <mesh position={[0, 0.13, 0]}>
            <boxGeometry args={[0.17, 0.2, 0.11]} />
            <meshStandardMaterial color="#D3C294" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.29, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.075, 0.025, 5, 12, Math.PI]} />
            <meshStandardMaterial color="#D3C294" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.13, 0.07]}>
            <sphereGeometry args={[0.025, 5, 4]} />
            <meshStandardMaterial color="#88764F" roughness={0.7} />
          </mesh>
        </group>
      )}
      {selected && (
        <mesh position={[0, 0.155, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.68, 0.038, 6, 28]} />
          <meshStandardMaterial
            color={plot.unlocked ? "#F2CA68" : "#E1D8B4"}
            roughness={0.45}
            emissive={plot.unlocked ? "#9D762D" : "#665E45"}
            emissiveIntensity={0.14}
          />
        </mesh>
      )}
      <mesh
        position={[0, 0.68, 0]}
        onClick={(event) => {
          event.stopPropagation();
          onPress();
        }}
      >
        <boxGeometry args={[PLOT_WIDTH + 0.04, 1.25, PLOT_DEPTH + 0.04]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  );
}

function FenceLine({ horizontal, sign }: { horizontal: boolean; sign: number }) {
  const count = horizontal ? 13 : 8;
  return (
    <group>
      {Array.from({ length: count }, (_, index) => {
        const t = index / (count - 1);
        const x = horizontal ? -6 + t * 12 : sign * 6;
        const z = horizontal ? sign * 3.55 : -3.55 + t * 7.1;
        return (
          <mesh key={index} position={[x, 0.42, z]}>
            <cylinderGeometry args={[0.075, 0.09, 0.78, 6]} />
            <meshStandardMaterial color="#9C7048" roughness={0.93} />
          </mesh>
        );
      })}
      {[0.34, 0.67].map((height) => (
        <mesh
          key={height}
          position={[0, height, horizontal ? sign * 3.55 : sign * 6]}
          rotation={horizontal ? [0, 0, 0] : [0, Math.PI / 2, 0]}
        >
          <boxGeometry args={[horizontal ? 12 : 7.1, 0.085, 0.11]} />
          <meshStandardMaterial color="#C39A69" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Farmhouse({ built }: { built: boolean }) {
  return (
    <group position={[-5.1, 0, -0.45]}>
      <mesh position={[0, 0.62, 0]} castShadow>
        <boxGeometry args={[1.58, 1.18, 1.48]} />
        <meshStandardMaterial color={built ? "#EED9B2" : "#D8C9A5"} roughness={0.93} />
      </mesh>
      <mesh position={[0, 1.27, 0.01]}>
        <boxGeometry args={[0.32, 1.15, 0.085]} />
        <meshStandardMaterial color="#7B5338" roughness={0.9} />
      </mesh>
      {[-0.46, 0.46].map((x) => (
        <group key={x} position={[x, 0.78, 0.755]}>
          <mesh>
            <boxGeometry args={[0.34, 0.33, 0.045]} />
            <meshStandardMaterial color="#B8D9D3" roughness={0.45} />
          </mesh>
          <mesh position={[0, 0, 0.027]}>
            <boxGeometry args={[0.045, 0.36, 0.025]} />
            <meshStandardMaterial color="#8D6546" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0, 0.027]}>
            <boxGeometry args={[0.36, 0.045, 0.025]} />
            <meshStandardMaterial color="#8D6546" roughness={0.9} />
          </mesh>
        </group>
      ))}
      <mesh position={[-0.35, 1.43, 0]} rotation={[0, 0, -0.48]}>
        <boxGeometry args={[1.05, 0.13, 1.72]} />
        <meshStandardMaterial color={built ? "#B85E45" : "#AE8E68"} roughness={0.9} />
      </mesh>
      <mesh position={[0.35, 1.43, 0]} rotation={[0, 0, 0.48]}>
        <boxGeometry args={[1.05, 0.13, 1.72]} />
        <meshStandardMaterial color={built ? "#C87550" : "#AE8E68"} roughness={0.9} />
      </mesh>
      {built && (
        <mesh position={[0.52, 1.73, -0.42]}>
          <boxGeometry args={[0.2, 0.47, 0.22]} />
          <meshStandardMaterial color="#9D5944" roughness={0.95} />
        </mesh>
      )}
      <mesh position={[0, 0.43, 0.77]}>
        <boxGeometry args={[0.42, 0.78, 0.08]} />
        <meshStandardMaterial color="#805A3C" roughness={0.92} />
      </mesh>
      <mesh position={[0.13, 0.42, 0.82]}>
        <sphereGeometry args={[0.025, 6, 5]} />
        <meshStandardMaterial color="#E7C778" roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.02, 0.88]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.14, 0.25, 4]} />
        <meshStandardMaterial color="#D2A855" roughness={0.85} />
      </mesh>
    </group>
  );
}

function GardenDetails() {
  const decorations = useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => {
        const angle = i * 2.399;
        const radius = 5.15 + (i % 4) * 0.28;
        return {
          x: Math.cos(angle) * radius,
          z: Math.sin(angle) * radius * 0.67,
          flower: i % 3 === 0,
          color: ["#E8C566", "#D8866C", "#E8E0B7"][i % 3],
        };
      }),
    [],
  );

  return (
    <group>
      {decorations.map((decoration, index) => (
        <group key={index} position={[decoration.x, 0.03, decoration.z]}>
          <mesh position={[0, 0.09, 0]}>
            <sphereGeometry args={[decoration.flower ? 0.1 : 0.16, 6, 5]} />
            <meshStandardMaterial
              color={decoration.flower ? decoration.color : "#6E9A5C"}
              roughness={0.9}
            />
          </mesh>
          {decoration.flower && (
            <mesh position={[0, 0.18, 0]}>
              <sphereGeometry args={[0.045, 6, 5]} />
              <meshStandardMaterial color="#F3E2A4" roughness={0.75} />
            </mesh>
          )}
        </group>
      ))}
      <mesh position={[-5.1, 0.04, 1.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.54, 0.54, 0.03, 10]} />
        <meshStandardMaterial color="#D5B782" roughness={1} />
      </mesh>
      <mesh position={[-5.1, 0.07, 1.2]}>
        <cylinderGeometry args={[0.08, 0.08, 0.09, 8]} />
        <meshStandardMaterial color="#6F945E" roughness={0.9} />
      </mesh>
    </group>
  );
}

function SceneContents({
  plots,
  selectedCrop,
  toolMode,
  now,
  houseBuilt,
  selectedId,
  setSelectedId,
  onPlotPress,
  pan,
  zoom,
}: FarmSceneViewProps & {
  selectedId: number | null;
  setSelectedId: (id: number) => void;
  pan: { x: number; y: number };
  zoom: number;
}) {
  const { camera } = useThree();
  const target = useRef<[number, number, number]>([pan.x, 0, pan.y]);
  const radius = useRef(15);

  useFrame(() => {
    const wantedRadius = 15 / zoom;
    radius.current += (wantedRadius - radius.current) * 0.14;
    target.current[0] += (pan.x - target.current[0]) * 0.2;
    target.current[2] += (pan.y - target.current[2]) * 0.2;
    const r = radius.current;
    camera.position.set(target.current[0] + r * 0.66, r * 0.82, target.current[2] + r * 0.78);
    camera.lookAt(target.current[0], 0, target.current[2]);
  });

  return (
    <>
      <color attach="background" args={["#D6E7DA"]} />
      <ambientLight intensity={1.18} />
      <directionalLight position={[-7, 11, 6]} intensity={1.7} color="#FFF1D3" />
      <directionalLight position={[5, 5, -7]} intensity={0.5} color="#B7D9C1" />

      <mesh position={[0, -0.54, 0]} receiveShadow>
        <cylinderGeometry args={[7.65, 7.42, 0.58, 40]} />
        <meshStandardMaterial color="#A97851" roughness={0.98} />
      </mesh>
      <mesh position={[0, -0.2, 0]} receiveShadow>
        <cylinderGeometry args={[7.52, 7.65, 0.22, 40]} />
        <meshStandardMaterial color="#70955C" roughness={1} />
      </mesh>
      <mesh position={[0, -0.075, 0]} receiveShadow>
        <cylinderGeometry args={[7.28, 7.45, 0.12, 40]} />
        <meshStandardMaterial color="#91AD70" roughness={1} />
      </mesh>

      <FenceLine horizontal sign={-1} />
      <FenceLine horizontal sign={1} />
      <FenceLine horizontal={false} sign={-1} />
      <FenceLine horizontal={false} sign={1} />
      <Farmhouse built={houseBuilt} />
      <GardenDetails />

      {plots.map((plot) => (
        <FarmPlotTile
          key={plot.id}
          plot={plot}
          position={cropPosition(plot.id)}
          selected={selectedId === plot.id}
          selectedCrop={selectedCrop}
          toolMode={toolMode}
          now={now}
          onPress={() => {
            setSelectedId(plot.id);
            onPlotPress(plot);
          }}
        />
      ))}
    </>
  );
}

type TouchPoint = { pageX: number; pageY: number };

export default function FarmScene(props: FarmSceneProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const gesture = useRef<{
    x: number;
    y: number;
    startPanX: number;
    startPanY: number;
    pinchDistance: number;
  } | null>(null);
  const isPinching = useRef(false);
  const pinchZoom = useRef(1);

  const readTouches = (event: any): TouchPoint[] => {
    const source = event?.nativeEvent?.touches;
    if (!source) return [];
    return Array.from(source as ArrayLike<TouchPoint>);
  };
  const distance = (first: TouchPoint, second: TouchPoint) =>
    Math.hypot(first.pageX - second.pageX, first.pageY - second.pageY);
  const clampZoom = (value: number) => Math.max(0.78, Math.min(1.55, value));

  return (
    <View
      style={styles.container}
      onTouchStart={(event) => {
        const touches = readTouches(event);
        if (touches.length >= 2) {
          const centerX = (touches[0].pageX + touches[1].pageX) / 2;
          const centerY = (touches[0].pageY + touches[1].pageY) / 2;
          const pinchDistance = distance(touches[0], touches[1]);
          gesture.current = { x: centerX, y: centerY, startPanX: pan.x, startPanY: pan.y, pinchDistance };
          pinchZoom.current = zoom;
          isPinching.current = true;
        } else if (touches[0]) {
          gesture.current = {
            x: touches[0].pageX,
            y: touches[0].pageY,
            startPanX: pan.x,
            startPanY: pan.y,
            pinchDistance: 0,
          };
        }
      }}
      onTouchMove={(event) => {
        const touches = readTouches(event);
        const active = gesture.current;
        if (!active) return;
        if (touches.length >= 2) {
          isPinching.current = true;
          const pinchDistance = distance(touches[0], touches[1]);
          if (active.pinchDistance > 0) {
            setZoom(clampZoom(pinchZoom.current * (pinchDistance / active.pinchDistance)));
          }
          const centerX = (touches[0].pageX + touches[1].pageX) / 2;
          const centerY = (touches[0].pageY + touches[1].pageY) / 2;
          setPan({
            x: active.startPanX - (centerX - active.x) * 0.018,
            y: active.startPanY + (centerY - active.y) * 0.018,
          });
          return;
        }
        if (touches[0] && !isPinching.current) {
          const dx = touches[0].pageX - active.x;
          const dy = touches[0].pageY - active.y;
          if (Math.abs(dx) + Math.abs(dy) > 5) {
            setPan({ x: active.startPanX - dx * 0.018, y: active.startPanY + dy * 0.018 });
          }
        }
      }}
      onTouchEnd={(event) => {
        const touches = readTouches(event);
        if (touches.length < 2) {
          isPinching.current = false;
          gesture.current = null;
        }
      }}
      onTouchCancel={() => {
        gesture.current = null;
        isPinching.current = false;
      }}
    >
      <Canvas
        style={styles.canvas}
        camera={{ position: [10, 12, 12], fov: 34, near: 0.1, far: 80 }}
        gl={{ antialias: true, alpha: false, powerPreference: "low-power" }}
        accessibilityLabel="مزرعة ثلاثية الأبعاد. اسحب لتحريك المشهد، واستخدم إصبعين للتقريب."
      >
        <SceneContents
          {...props}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          pan={pan}
          zoom={zoom}
        />
      </Canvas>
      <View pointerEvents="box-none" style={styles.accessibilityLayer}>
        <Text accessible accessibilityLiveRegion="polite" style={styles.srOnly}>
          {selectedId === null
            ? "اختر قطعة أرض"
            : props.plots.find((plot) => plot.id === selectedId)
              ? plotLabel(
                  props.plots.find((plot) => plot.id === selectedId)!,
                  props.selectedCrop,
                  props.expansionCost,
                  props.now,
                )
              : ""}
        </Text>
        {props.plots.map((plot) => (
          <Pressable
            key={plot.id}
            accessibilityRole="button"
            accessibilityLabel={plotLabel(plot, props.selectedCrop, props.expansionCost, props.now)}
            accessibilityHint="اضغط لتحديد قطعة الأرض وتنفيذ أداة المزرعة الحالية."
            onPress={() => {
              setSelectedId(plot.id);
              props.onPlotPress(plot);
            }}
            style={styles.srOnly}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: "100%",
    minHeight: 320,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#D6E7DA",
  },
  canvas: {
    flex: 1,
  },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    overflow: "hidden",
  },
  accessibilityLayer: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 1,
    height: 1,
  },
});
