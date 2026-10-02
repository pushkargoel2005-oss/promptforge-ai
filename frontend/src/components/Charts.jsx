// Dependency-free SVG charts for the dashboard.
//
// Data: [{ day: "2026-10-01", value: 3 }]. Axes always render; every point
// gets a real dot/bar with a native tooltip. All-zero data renders the
// frame plus an honest "no activity" note — never fake points.

export function shortDay(iso) {
  try {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
}

const W = 640;

export default function SeriesChart({ data = [], variant = "line", height = 200, ariaLabel = "Activity chart" }) {
  const H = height;
  const PAD = { l: 34, r: 12, t: 12, b: 26 };
  const vals = data.map((d) => Math.max(0, Number(d.value) || 0));
  const n = vals.length;
  const max = Math.max(1, ...vals);
  const total = vals.reduce((a, b) => a + b, 0);

  const x = (i) =>
    n <= 1 ? PAD.l + (W - PAD.l - PAD.r) / 2 : PAD.l + ((W - PAD.l - PAD.r) * i) / (n - 1);
  const y = (v) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / max);

  const tickSet = new Set([0]);
  if (max <= 6) {
    for (let v = 1; v <= max; v++) tickSet.add(v);
  } else {
    tickSet.add(Math.round(max / 2));
    tickSet.add(max);
  }
  const ticks = [...tickSet].sort((a, b) => a - b);

  const step = Math.max(1, Math.ceil(n / 5));
  const labelIdx = new Set(data.map((_, i) => i).filter((i) => i % step === 0 || i === n - 1));

  const linePath =
    variant === "line" && n > 0
      ? vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
      : "";
  const areaPath =
    variant === "line" && n > 0
      ? `${linePath} L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`
      : "";
  const slot = n > 0 ? (W - PAD.l - PAD.r) / n : 0;
  const barW = Math.min(34, Math.max(8, slot * 0.55));

  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${ariaLabel}: ${total} total over ${n} days`}
        preserveAspectRatio="xMidYMid meet"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="ts-grid" />
            <text x={PAD.l - 7} y={y(t) + 3.5} textAnchor="end" className="ts-tick">{t}</text>
          </g>
        ))}
        {variant === "line" && areaPath && <path d={areaPath} className="ts-area" />}
        {variant === "line" && linePath && <path d={linePath} className="ts-line" />}
        {variant === "bars" &&
          vals.map((v, i) => (
            <rect
              key={i}
              x={x(i) - barW / 2}
              y={y(v)}
              width={barW}
              height={Math.max(0, y(0) - y(v))}
              className="ts-bar"
            >
              <title>{`${shortDay(data[i].day)}: ${v} saved`}</title>
            </rect>
          ))}
        {variant === "line" &&
          vals.map((v, i) => (
            <circle
              key={i}
              cx={x(i)}
              cy={y(v)}
              r={4}
              className="ts-dot"
              tabIndex={0}
              aria-label={`${shortDay(data[i].day)}: ${v}`}
            >
              <title>{`${shortDay(data[i].day)}: ${v} generations`}</title>
            </circle>
          ))}
        {data.map((d, i) =>
          labelIdx.has(i) ? (
            <text key={d.day} x={x(i)} y={H - 8} textAnchor="middle" className="ts-tick">
              {shortDay(d.day)}
            </text>
          ) : null
        )}
        {total === 0 && (
          <text x={(W + PAD.l) / 2} y={PAD.t + (H - PAD.t - PAD.b) / 2} textAnchor="middle" className="ts-tick" fontSize={13}>
            No activity in this period yet
          </text>
        )}
      </svg>
    </div>
  );
}
