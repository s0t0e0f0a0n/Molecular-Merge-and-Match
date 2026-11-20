export type RadarAxis = { label: string; value: number; description?: string };

const WIDTH = 440;
const HEIGHT = 250;
const CENTER = WIDTH / 2;
const CENTER_Y = 130;
const RADIUS = 100;
const RINGS = [0.25, 0.5, 0.75, 1];

function point(index: number, count: number, fraction: number, start: number): [number, number] {
  const angle = start + (index * 2 * Math.PI) / count;
  return [CENTER + Math.cos(angle) * RADIUS * fraction, CENTER_Y + Math.sin(angle) * RADIUS * fraction];
}

function polygon(count: number, fractions: number[], start: number): string {
  return fractions.map((fraction, index) => point(index, count, fraction, start).join(',')).join(' ');
}

export function RadarChart({ axes, ariaLabel, startAngle = -Math.PI / 2, floor = 0 }: { axes: RadarAxis[]; ariaLabel: string; startAngle?: number; floor?: number }) {
  const count = axes.length;
  const scaled = (value: number) => floor + (1 - floor) * Math.max(0, Math.min(1, value));
  return (
    <svg className="statistics-radar" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={ariaLabel}>
      {RINGS.map((ring) => (
        <polygon key={ring} className="statistics-radar-ring" points={polygon(count, axes.map(() => ring), startAngle)} />
      ))}
      {axes.map((axis, index) => {
        const [x, y] = point(index, count, 1, startAngle);
        const [labelX, labelY] = point(index, count, 1.22, startAngle);
        const anchor = Math.abs(labelX - CENTER) < 4 ? 'middle' : labelX > CENTER ? 'start' : 'end';
        return (
          <g key={axis.label}>
            <line className="statistics-radar-spoke" x1={CENTER} y1={CENTER_Y} x2={x} y2={y} />
            <text className="statistics-radar-label" x={labelX} y={labelY} textAnchor={anchor} dominantBaseline="middle">
              {axis.description ? <title>{axis.description}</title> : null}
              {axis.label}
            </text>
          </g>
        );
      })}
      <polygon className="statistics-radar-shape" points={polygon(count, axes.map((axis) => scaled(axis.value)), startAngle)} />
      {axes.map((axis, index) => {
        const [x, y] = point(index, count, scaled(axis.value), startAngle);
        return (
          <circle key={axis.label} className="statistics-radar-dot" cx={x} cy={y} r={7}>
            <title>{`${axis.label}: ${Math.round(axis.value * 100)}%`}</title>
          </circle>
        );
      })}
    </svg>
  );
}
