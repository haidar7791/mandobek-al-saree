import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import {
  CROPS,
  getPlotGrowthState,
  type CropId,
  type FarmPlot,
} from "@/lib/farm-game";

export interface FarmSceneProps {
  plots: FarmPlot[];
  selectedCrop: CropId;
  toolMode: "plant" | "water";
  expansionCost: number;
  houseBuilt: boolean;
  houseLevel: number;
  now: number;
  onPlotPress: (plot: FarmPlot) => void;
}

const VIEW_WIDTH = 430;
const VIEW_HEIGHT = 360;
const PLOT_WIDTH = 27;
const PLOT_HEIGHT = 14;

function getPlotPosition(id: number) {
  const column = id % 6;
  const row = Math.floor(id / 6);
  return {
    x: 210 + (column - row - 1) * PLOT_WIDTH,
    y: 168 + (column + row - 4) * PLOT_HEIGHT,
  };
}

function plotPoints(x: number, y: number) {
  return `${x},${y - PLOT_HEIGHT} ${x + PLOT_WIDTH},${y} ${x},${y + PLOT_HEIGHT} ${x - PLOT_WIDTH},${y}`;
}

function formatCoins(value: number) {
  return new Intl.NumberFormat("ar-IQ", { maximumFractionDigits: 0 }).format(value);
}

function getPlotLabel(plot: FarmPlot, selectedCrop: CropId, expansionCost: number, now: number) {
  if (!plot.unlocked) {
    return `قطعة أرض مقفلة رقم ${plot.id + 1}. فتحها مقابل ${formatCoins(expansionCost)} عملة.`;
  }
  if (!plot.cropId) return `حقل فارغ رقم ${plot.id + 1}. زراعة ${CROPS[selectedCrop].name}.`;

  const growth = getPlotGrowthState(plot, now);
  if (growth.ready) return `${CROPS[plot.cropId].name} جاهز للحصاد.`;
  if (!growth.watered) return `${CROPS[plot.cropId].name} يحتاج إلى الري.`;
  return `${CROPS[plot.cropId].name} ينمو. تبقى ${Math.ceil(growth.remaining / 1000)} ثانية.`;
}

function CropPlant({
  cropId,
  x,
  y,
  progress,
}: {
  cropId: CropId;
  x: number;
  y: number;
  progress: number;
}) {
  const stage = progress >= 1 ? 3 : progress >= 0.66 ? 2 : progress > 0.08 ? 1 : 0;
  const foliage = cropId === "corn" ? "#347C43" : "#4F8B4A";
  const height = stage === 0 ? 0 : stage === 1 ? 7 : stage === 2 ? 12 : 17;
  const cropColor = CROPS[cropId].color;

  if (stage === 0) {
    return <Ellipse cx={x} cy={y - 1} rx={2.5} ry={1.5} fill={cropColor} />;
  }

  return (
    <G>
      <Ellipse cx={x} cy={y + 3} rx={8} ry={2.6} fill="#694A31" opacity={0.24} />
      <Line
        x1={x}
        y1={y + 2}
        x2={x}
        y2={y - height}
        stroke={cropId === "wheat" ? "#8D8C45" : "#538248"}
        strokeWidth={stage === 3 ? 2.6 : 2}
        strokeLinecap="round"
      />
      <Path
        d={`M ${x} ${y - height + 5} Q ${x - 8} ${y - height - 1} ${x - 9} ${y - height + 2} Q ${x - 7} ${y - height + 7} ${x} ${y - height + 7} Z`}
        fill={foliage}
      />
      {stage >= 2 && (
        <Path
          d={`M ${x} ${y - height + 2} Q ${x + 8} ${y - height - 5} ${x + 9} ${y - height - 1} Q ${x + 7} ${y - height + 4} ${x} ${y - height + 5} Z`}
          fill="#68A255"
        />
      )}
      {cropId === "wheat" && stage >= 2 ? (
        <G>
          <Line x1={x} y1={y - height} x2={x} y2={y - height - 5} stroke="#9B9848" strokeWidth={1.5} />
          <Ellipse cx={x - 2.5} cy={y - height - 3} rx={2.4} ry={4} fill="#E3BD50" />
          <Ellipse cx={x + 2} cy={y - height - 5} rx={2.2} ry={3.8} fill="#EBCB67" />
        </G>
      ) : null}
      {cropId === "carrot" && stage >= 2 ? (
        <Path d={`M ${x - 3} ${y + 1} Q ${x} ${y + 3} ${x + 3} ${y + 1} L ${x} ${y + 8} Z`} fill="#E98043" />
      ) : null}
      {cropId === "corn" && stage >= 3 ? (
        <G>
          <Ellipse cx={x + 5} cy={y - height + 5} rx={2.8} ry={5} fill="#E8C04C" />
          <Path d={`M ${x + 4} ${y - height + 4} Q ${x + 10} ${y - height + 1} ${x + 7} ${y - height + 8}`} fill="none" stroke="#5B914A" strokeWidth={1.6} />
        </G>
      ) : null}
    </G>
  );
}

function Tree({ x, y, color = "#5E9255" }: { x: number; y: number; color?: string }) {
  return (
    <G>
      <Ellipse cx={x} cy={y + 8} rx={10} ry={3} fill="#567C4B" opacity={0.2} />
      <Line x1={x} y1={y + 5} x2={x} y2={y - 6} stroke="#855A3B" strokeWidth={3} />
      <Circle cx={x} cy={y - 11} r={7} fill={color} />
      <Circle cx={x - 5} cy={y - 7} r={5} fill="#75A965" />
      <Circle cx={x + 5} cy={y - 7} r={5} fill="#4D854B" />
    </G>
  );
}

function Farmhouse({ built, level }: { built: boolean; level: number }) {
  const wall = built ? "#F2E1BF" : "#D5C9AD";
  const sideWall = built ? "#D1B58A" : "#BDAF91";
  const roof = level >= 2 ? "#B95743" : built ? "#C47750" : "#A98D6A";

  return (
    <G transform="translate(44 60)">
      <Ellipse cx={39} cy={80} rx={43} ry={8} fill="#526F45" opacity={0.2} />
      <Polygon points="8,37 39,19 72,38 40,57" fill={built ? "#F7E9D0" : "#DBD0B6"} stroke="#A88A64" strokeWidth={1} />
      <Polygon points="8,37 40,57 40,87 8,67" fill={wall} stroke="#AD9470" strokeWidth={1} />
      <Polygon points="40,57 72,38 72,68 40,87" fill={sideWall} stroke="#9D805F" strokeWidth={1} />
      <Polygon points="3,37 38,14 78,37 42,60" fill={roof} stroke="#8B5945" strokeWidth={1.5} />
      <Polygon points="42,60 78,37 78,45 42,68" fill={level >= 2 ? "#974639" : "#89614B"} />
      <Path d="M 18 45 L 18 66 L 31 74 L 31 53 Z" fill="#B5D8D1" stroke="#8B6849" strokeWidth={2} />
      <Line x1={24.5} y1={49} x2={24.5} y2={70} stroke="#8B6849" strokeWidth={1.5} />
      <Polygon points="43,66 54,59 54,80 43,87" fill="#80563B" />
      <Circle cx={51} cy={73} r={1.5} fill="#E6C36D" />
      {built ? <Rect x={46} y={40} width={11} height={10} rx={1} fill="#A9D4D0" stroke="#875D43" strokeWidth={1.4} /> : null}
      {level >= 2 ? <Rect x={58} y={19} width={6} height={15} fill="#9B5D45" /> : null}
      {level >= 3 ? (
        <G>
          <Circle cx={65} cy={13} r={3} fill="#F4EBDD" opacity={0.85} />
          <Circle cx={68} cy={8} r={2} fill="#F4EBDD" opacity={0.65} />
        </G>
      ) : null}
    </G>
  );
}

function Plot({
  plot,
  position,
  selectedCrop,
  toolMode,
  expansionCost,
  now,
}: {
  plot: FarmPlot;
  position: { x: number; y: number };
  selectedCrop: CropId;
  toolMode: "plant" | "water";
  expansionCost: number;
  now: number;
}) {
  const { x, y } = position;
  const growth = plot.cropId ? getPlotGrowthState(plot, now) : null;
  const ready = growth?.ready ?? false;
  const soilColor = !plot.unlocked
    ? "#A6A78F"
    : ready
      ? "#A87840"
      : growth?.watered
        ? "#82583A"
        : plot.cropId
          ? "#956544"
          : "#A87950";
  const soilStroke = ready ? "#E8C363" : plot.unlocked ? "#704B32" : "#85866E";

  return (
    <G>
      <Polygon
        points={plotPoints(x, y + 2)}
        fill="#4E7247"
        opacity={0.2}
      />
      <Polygon
        points={plotPoints(x, y)}
        fill={soilColor}
        stroke={soilStroke}
        strokeWidth={plot.unlocked ? 1.4 : 1}
      />
      {plot.unlocked ? (
        <G>
          <Line x1={x - 15} y1={y} x2={x} y2={y + 7.8} stroke="#66462F" strokeWidth={1.1} opacity={0.55} />
          <Line x1={x} y1={y + 7.8} x2={x + 15} y2={y} stroke="#A77A50" strokeWidth={1.1} opacity={0.55} />
          {plot.cropId ? (
            <CropPlant cropId={plot.cropId} x={x} y={y - 1} progress={growth?.progress ?? 0} />
          ) : (
            <G>
              <Ellipse cx={x} cy={y - 1} rx={4.5} ry={2.8} fill="#704B34" opacity={0.65} />
              <Circle cx={x} cy={y - 2} r={2.2} fill={CROPS[selectedCrop].color} stroke="#F8E7B5" strokeWidth={0.8} />
            </G>
          )}
          {plot.cropId && toolMode === "water" && !ready && !growth?.watered ? (
            <G>
              <Path
                d={`M ${x + 15} ${y - 7} C ${x + 10} ${y - 1} ${x + 11} ${y + 2} ${x + 15} ${y + 2} C ${x + 19} ${y + 2} ${x + 20} ${y - 1} ${x + 15} ${y - 7} Z`}
                fill="#79CFDF"
                stroke="#E6F9FC"
                strokeWidth={0.8}
              />
            </G>
          ) : null}
          {plot.cropId && !ready ? (
            <G>
              <Line x1={x - 8} y1={y + 9} x2={x + 8} y2={y + 9} stroke="#5F4B36" strokeWidth={1.6} strokeLinecap="round" />
              <Line
                x1={x - 8}
                y1={y + 9}
                x2={x - 8 + 16 * (growth?.progress ?? 0)}
                y2={y + 9}
                stroke={growth?.watered ? "#72B863" : "#D5AC5A"}
                strokeWidth={1.8}
                strokeLinecap="round"
              />
            </G>
          ) : null}
          {ready ? (
            <G>
              <Path
                d={`M ${x + 16} ${y - 11} L ${x + 17.5} ${y - 7.5} L ${x + 21} ${y - 7} L ${x + 18.5} ${y - 4.5} L ${x + 19} ${y - 1} L ${x + 16} ${y - 3} L ${x + 13} ${y - 1} L ${x + 13.5} ${y - 4.5} L ${x + 11} ${y - 7} L ${x + 14.5} ${y - 7.5} Z`}
                fill="#F4D16B"
                stroke="#FFF1BE"
                strokeWidth={0.7}
              />
            </G>
          ) : null}
        </G>
      ) : (
        <G>
          <Rect x={x - 3} y={y - 1} width={6} height={5} rx={1.2} fill="#E7D3A7" />
          <Path d={`M ${x - 2} ${y - 1} V ${y - 3} A 2 2 0 0 1 ${x + 2} ${y - 3} V ${y - 1}`} fill="none" stroke="#E7D3A7" strokeWidth={1.5} />
          <SvgText x={x} y={y + 9} fontSize={7} fontWeight="700" fill="#F4E6C6" textAnchor="middle">
            {formatCoins(expansionCost)}
          </SvgText>
        </G>
      )}
      <Polygon
        points={plotPoints(x, y)}
        fill="transparent"
        stroke={plot.unlocked ? (ready ? "#FFE285" : "rgba(235,202,147,0.7)") : "rgba(235,232,208,0.5)"}
        strokeWidth={1}
        strokeDasharray={plot.unlocked ? undefined : "3 2"}
      />
    </G>
  );
}

export default function FarmScene({
  plots,
  selectedCrop,
  toolMode,
  expansionCost,
  houseBuilt,
  houseLevel,
  now,
  onPlotPress,
}: FarmSceneProps) {
  const [viewportSize, setViewportSize] = useState({ width: VIEW_WIDTH, height: VIEW_HEIGHT });
  const handleLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    if (layout.width > 0 && layout.height > 0) {
      setViewportSize({ width: layout.width, height: layout.height });
    }
  };
  const handleScenePress = (event: GestureResponderEvent) => {
    const scale = Math.min(viewportSize.width / VIEW_WIDTH, viewportSize.height / VIEW_HEIGHT);
    if (!Number.isFinite(scale) || scale <= 0) return;

    const offsetX = (viewportSize.width - VIEW_WIDTH * scale) / 2;
    const offsetY = (viewportSize.height - VIEW_HEIGHT * scale) / 2;
    const mapX = (event.nativeEvent.locationX - offsetX) / scale;
    const mapY = (event.nativeEvent.locationY - offsetY) / scale;
    let nearestPlot: FarmPlot | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const plot of plots) {
      const position = getPlotPosition(plot.id);
      const distance =
        Math.abs(mapX - position.x) / PLOT_WIDTH +
        Math.abs(mapY - position.y) / PLOT_HEIGHT;
      if (distance <= 1.08 && distance < nearestDistance) {
        nearestPlot = plot;
        nearestDistance = distance;
      }
    }

    if (nearestPlot) onPlotPress(nearestPlot);
  };

  const accessibilityActions = plots.map((plot) => ({
    name: `field-${plot.id}`,
    label: getPlotLabel(plot, selectedCrop, expansionCost, now),
  }));

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        pointerEvents="none"
      >
        <Defs>
          <SvgLinearGradient id="farm-sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#D9EAD5" />
            <Stop offset="1" stopColor="#BFD99D" />
          </SvgLinearGradient>
          <SvgLinearGradient id="farm-grass" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#A9C77D" />
            <Stop offset="1" stopColor="#7FA763" />
          </SvgLinearGradient>
        </Defs>

        <Rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="url(#farm-sky)" />
        <Circle cx={354} cy={47} r={21} fill="#F8E8A9" opacity={0.82} />
        <Ellipse cx={54} cy={72} rx={54} ry={17} fill="#F5F5DF" opacity={0.48} />
        <Ellipse cx={388} cy={89} rx={52} ry={14} fill="#F5F5DF" opacity={0.42} />

        <Polygon points="210,54 390,154 210,300 30,154" fill="#684B34" opacity={0.18} />
        <Polygon points="30,148 210,252 210,302 30,198" fill="#80543A" />
        <Polygon points="210,252 390,148 390,198 210,302" fill="#704A34" />
        <Polygon points="210,40 390,144 210,252 30,144" fill="url(#farm-grass)" stroke="#668C53" strokeWidth={2} />
        <Path d="M 48 147 L 210 241 L 372 147" fill="none" stroke="#B9CE86" strokeWidth={2} opacity={0.7} />

        <Path d="M 49 144 L 100 174 L 151 204 L 202 234" fill="none" stroke="#845B3D" strokeWidth={4} />
        <Path d="M 228 71 L 281 102 L 334 133 L 377 158" fill="none" stroke="#845B3D" strokeWidth={4} />
        {[0, 1, 2, 3, 4].map((index) => (
          <G key={`fence-left-${index}`}>
            <Line x1={49 + index * 38} y1={139 + index * 22} x2={49 + index * 38} y2={151 + index * 22} stroke="#9E704A" strokeWidth={3.5} />
            <Line x1={49 + index * 38} y1={142 + index * 22} x2={49 + index * 38} y2={147 + index * 22} stroke="#D0A274" strokeWidth={1.3} />
          </G>
        ))}
        {[0, 1, 2, 3, 4].map((index) => (
          <G key={`fence-right-${index}`}>
            <Line x1={228 + index * 37} y1={66 + index * 22} x2={228 + index * 37} y2={78 + index * 22} stroke="#9E704A" strokeWidth={3.5} />
            <Line x1={228 + index * 37} y1={69 + index * 22} x2={228 + index * 37} y2={74 + index * 22} stroke="#D0A274" strokeWidth={1.3} />
          </G>
        ))}

        <Farmhouse built={houseBuilt} level={houseLevel} />
        <Path d="M 83 152 Q 98 160 113 170" fill="none" stroke="#D8C291" strokeWidth={7} strokeLinecap="round" />
        <Path d="M 83 152 Q 98 160 113 170" fill="none" stroke="#F0DDAF" strokeWidth={2} strokeLinecap="round" />

        <Tree x={57} y={196} color="#56844B" />
        <Tree x={366} y={206} color="#638F4F" />
        <Tree x={333} y={77} color="#709C58" />
        <Circle cx={77} cy={216} r={3} fill="#E8C66D" />
        <Circle cx={350} cy={224} r={3.2} fill="#D78668" />
        <Circle cx={320} cy={83} r={2.8} fill="#F0D486" />

        {plots.map((plot) => (
          <Plot
            key={plot.id}
            plot={plot}
            position={getPlotPosition(plot.id)}
            selectedCrop={selectedCrop}
            toolMode={toolMode}
            expansionCost={expansionCost}
            now={now}
          />
        ))}
      </Svg>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={handleScenePress}
        accessibilityRole="button"
        accessibilityLabel={`مزرعة تفاعلية. ${plots.length} حقلاً. اختر أحد الحقول لتنفيذ الإجراء الحالي.`}
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={({ nativeEvent }) => {
          const id = Number(nativeEvent.actionName.replace("field-", ""));
          const plot = plots.find((item) => item.id === id);
          if (plot) onPlotPress(plot);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: "100%",
    minHeight: 320,
    overflow: "hidden",
    borderRadius: 20,
    backgroundColor: "#BFD99D",
  },
});
