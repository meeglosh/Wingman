import React from 'react';
import {
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter,
  FunnelChart, Funnel, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import type { ChartData, ChartType } from '../types/presentation';

// ── Palettes ─────────────────────────────────────────────────────────────────
export const CHART_PALETTES: Record<string, string[]> = {
  Wingman:    ['#7C3AED', '#4F9EF8', '#34D399', '#F59E0B', '#EF4444', '#EC4899'],
  Ocean:      ['#0EA5E9', '#06B6D4', '#10B981', '#6366F1', '#8B5CF6', '#F59E0B'],
  Sunset:     ['#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#06B6D4', '#34D399'],
  Monochrome: ['#F8FAFC', '#CBD5E1', '#94A3B8', '#64748B', '#334155', '#0F172A'],
  Forest:     ['#10B981', '#34D399', '#6EE7B7', '#059669', '#065F46', '#A7F3D0'],
  Neon:       ['#22D3EE', '#F472B6', '#A3E635', '#FB923C', '#818CF8', '#34D399'],
};
export const PALETTE_NAMES = Object.keys(CHART_PALETTES);

// ── Shared style constants ───────────────────────────────────────────────────
const TT = { background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11, color: '#E2E8F0' };
const AX = { fontSize: 10, fill: '#94A3B8' };
const GRID = { strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.08)' };
const LEG = { wrapperStyle: { fontSize: 10, color: '#94A3B8' } };

// ── Data transformers ────────────────────────────────────────────────────────
function toRechart(cd: ChartData) {
  return cd.labels.map((name, i) => {
    const pt: Record<string, string | number> = { name };
    cd.series.forEach((s, si) => { pt[s.name] = cd.values[si]?.[i] ?? 0; });
    return pt;
  });
}
function toPie(cd: ChartData) {
  return cd.labels.map((name, i) => ({ name, value: cd.values[0]?.[i] ?? 0 }));
}
function toRadar(cd: ChartData) {
  return cd.labels.map((subject, i) => {
    const pt: Record<string, string | number> = { subject };
    cd.series.forEach((s, si) => { pt[s.name] = cd.values[si]?.[i] ?? 0; });
    return pt;
  });
}

function colors(cd: ChartData) {
  const pal = CHART_PALETTES[cd.palette ?? 'Wingman'] ?? CHART_PALETTES.Wingman;
  return cd.series.map((s, i) => s.color ?? pal[i % pal.length]);
}
function pal(cd: ChartData) {
  return CHART_PALETTES[cd.palette ?? 'Wingman'] ?? CHART_PALETTES.Wingman;
}

// ── Chart type metadata (for picker UI) ──────────────────────────────────────
export interface ChartTypeMeta { type: ChartType; label: string; group: string; icon: React.ReactNode }

export const CHART_TYPE_META: ChartTypeMeta[] = [
  { type: 'bar',          label: 'Bar',           group: 'Bar',
    icon: <svg viewBox="0 0 40 30"><rect x="4"  y="10" width="8" height="16" rx="1.5" fill="#7C3AED"/><rect x="16" y="4"  width="8" height="22" rx="1.5" fill="#4F9EF8"/><rect x="28" y="14" width="8" height="12" rx="1.5" fill="#34D399"/></svg> },
  { type: 'bar-grouped',  label: 'Grouped',       group: 'Bar',
    icon: <svg viewBox="0 0 40 30"><rect x="3"  y="8"  width="5" height="18" rx="1" fill="#7C3AED"/><rect x="9"  y="14" width="5" height="12" rx="1" fill="#4F9EF8"/><rect x="17" y="3"  width="5" height="23" rx="1" fill="#7C3AED"/><rect x="23" y="9"  width="5" height="17" rx="1" fill="#4F9EF8"/><rect x="31" y="11" width="5" height="15" rx="1" fill="#7C3AED"/><rect x="37" y="16" width="5" height="10" rx="1" fill="#4F9EF8"/></svg> },
  { type: 'bar-stacked',  label: 'Stacked',       group: 'Bar',
    icon: <svg viewBox="0 0 40 30"><rect x="4"  y="15" width="8" height="11" rx="1.5" fill="#7C3AED"/><rect x="4"  y="9"  width="8" height="6"  rx="0" fill="#4F9EF8"/><rect x="16" y="10" width="8" height="16" rx="1.5" fill="#7C3AED"/><rect x="16" y="4"  width="8" height="6"  rx="0" fill="#4F9EF8"/><rect x="28" y="17" width="8" height="9"  rx="1.5" fill="#7C3AED"/><rect x="28" y="11" width="8" height="6"  rx="0" fill="#4F9EF8"/></svg> },
  { type: 'bar-horizontal', label: 'Horizontal',  group: 'Bar',
    icon: <svg viewBox="0 0 40 30"><rect x="4" y="4"  width="22" height="6" rx="1.5" fill="#7C3AED"/><rect x="4" y="12" width="30" height="6" rx="1.5" fill="#4F9EF8"/><rect x="4" y="20" width="16" height="6" rx="1.5" fill="#34D399"/></svg> },
  { type: 'line',         label: 'Line',          group: 'Line',
    icon: <svg viewBox="0 0 40 30" fill="none"><polyline points="4,22 14,10 24,16 36,4" stroke="#7C3AED" strokeWidth="2.5" strokeLinejoin="round"/><circle cx="4" cy="22" r="2.5" fill="#7C3AED"/><circle cx="14" cy="10" r="2.5" fill="#7C3AED"/><circle cx="24" cy="16" r="2.5" fill="#7C3AED"/><circle cx="36" cy="4" r="2.5" fill="#7C3AED"/></svg> },
  { type: 'area',         label: 'Area',          group: 'Line',
    icon: <svg viewBox="0 0 40 30" fill="none"><path d="M4 22 L14 10 L24 16 L36 4 L36 28 L4 28Z" fill="#7C3AED" opacity=".3"/><polyline points="4,22 14,10 24,16 36,4" stroke="#7C3AED" strokeWidth="2.5" strokeLinejoin="round"/></svg> },
  { type: 'area-stacked', label: 'Stacked Area',  group: 'Line',
    icon: <svg viewBox="0 0 40 30" fill="none"><path d="M4 28 L14 20 L24 22 L36 16 L36 28Z" fill="#7C3AED" opacity=".5"/><path d="M4 20 L14 12 L24 14 L36 6 L36 16 L24 22 L14 20 L4 28Z" fill="#4F9EF8" opacity=".4"/></svg> },
  { type: 'pie',          label: 'Pie',           group: 'Circular',
    icon: <svg viewBox="0 0 40 30"><path d="M20 15 L20 3 A12 12 0 0 1 30.4 21Z" fill="#7C3AED"/><path d="M20 15 L30.4 21 A12 12 0 0 1 8 21Z" fill="#4F9EF8"/><path d="M20 15 L8 21 A12 12 0 0 1 20 3Z" fill="#34D399"/></svg> },
  { type: 'donut',        label: 'Donut',         group: 'Circular',
    icon: <svg viewBox="0 0 40 30"><path d="M20 15 L20 3 A12 12 0 0 1 30.4 21Z" fill="#7C3AED"/><path d="M20 15 L30.4 21 A12 12 0 0 1 8 21Z" fill="#4F9EF8"/><path d="M20 15 L8 21 A12 12 0 0 1 20 3Z" fill="#34D399"/><circle cx="20" cy="15" r="5" fill="#13141C"/></svg> },
  { type: 'scatter',      label: 'Scatter',       group: 'Other',
    icon: <svg viewBox="0 0 40 30"><circle cx="8"  cy="22" r="2.5" fill="#7C3AED"/><circle cx="14" cy="8"  r="2.5" fill="#7C3AED"/><circle cx="20" cy="18" r="2.5" fill="#4F9EF8"/><circle cx="28" cy="6"  r="2.5" fill="#4F9EF8"/><circle cx="34" cy="14" r="2.5" fill="#34D399"/><circle cx="22" cy="24" r="2.5" fill="#34D399"/></svg> },
  { type: 'radar',        label: 'Radar',         group: 'Other',
    icon: <svg viewBox="0 0 40 30" fill="none"><polygon points="20,3 34,12 29,26 11,26 6,12" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/><polygon points="20,10 27,14.5 24.5,21.5 15.5,21.5 13,14.5" fill="#7C3AED" fillOpacity=".4" stroke="#7C3AED" strokeWidth="1.5"/></svg> },
  { type: 'funnel',       label: 'Funnel',        group: 'Other',
    icon: <svg viewBox="0 0 40 30"><rect x="4"  y="4"  width="32" height="6" rx="1.5" fill="#7C3AED"/><rect x="8"  y="12" width="24" height="5" rx="1.5" fill="#4F9EF8"/><rect x="12" y="19" width="16" height="5" rx="1.5" fill="#34D399"/><rect x="15" y="26" width="10" height="3" rx="1"   fill="#F59E0B"/></svg> },
];

// ── Default chart data factory ────────────────────────────────────────────────
export function defaultChartData(type: ChartType): ChartData {
  const base: ChartData = {
    type, title: '',
    labels: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [{ name: 'Series 1' }, { name: 'Series 2' }],
    values: [[42, 65, 38, 75], [28, 45, 55, 60]],
    showLegend: true, showGrid: true, showAxes: true, palette: 'Wingman',
  };
  if (type === 'pie' || type === 'donut')
    return { ...base, labels: ['Segment A', 'Segment B', 'Segment C', 'Segment D'], series: [{ name: 'Value' }], values: [[35, 25, 22, 18]] };
  if (type === 'radar')
    return { ...base, labels: ['Speed', 'Strength', 'Agility', 'Accuracy', 'Endurance'], values: [[80, 65, 75, 90, 70], [60, 80, 50, 70, 85]] };
  if (type === 'funnel')
    return { ...base, labels: ['Visitors', 'Leads', 'Prospects', 'Customers'], series: [{ name: 'Conversions' }], values: [[1000, 650, 300, 120]] };
  if (type === 'scatter')
    return { ...base, labels: ['2', '5', '8', '12', '15', '20'], values: [[4, 12, 7, 18, 9, 22], [8, 6, 15, 3, 19, 11]] };
  return base;
}

// ── CSV parse ────────────────────────────────────────────────────────────────
export function parseChartCSV(csv: string): Pick<ChartData, 'labels' | 'series' | 'values'> | null {
  const rows = csv.trim().split('\n').map(r => r.split(',').map(c => c.trim()));
  if (rows.length < 2) return null;
  const header = rows[0];
  // First cell is the label column header (ignored); remaining cells are series names
  const seriesNames = header.slice(1);
  if (seriesNames.length === 0) return null;
  const dataRows = rows.slice(1);
  const labels = dataRows.map(r => r[0] ?? '');
  const values = seriesNames.map((_, si) =>
    dataRows.map(r => { const v = parseFloat(r[si + 1]); return isNaN(v) ? 0 : v; }),
  );
  return { labels, series: seriesNames.map(name => ({ name })), values };
}

// ── ChartElement renderer ────────────────────────────────────────────────────
interface ChartElementProps { chartData: ChartData; width: number; height: number }

export function ChartElement({ chartData: cd, width, height }: ChartElementProps) {
  const { showLegend = true, showGrid = true, showAxes = true } = cd;
  const clrs = colors(cd);
  const palette = pal(cd);

  const titleH = cd.title ? 30 : 0;
  const chartH = height - titleH;
  const m = { top: 6, right: 12, bottom: 6, left: 4 };

  const data = toRechart(cd);

  function inner() {
    switch (cd.type) {

      case 'bar':
      case 'bar-grouped':
        return (
          <BarChart width={width} height={chartH} data={data} margin={m}>
            {showGrid && <CartesianGrid {...GRID} />}
            {showAxes && <XAxis dataKey="name" tick={AX} />}
            {showAxes && <YAxis tick={AX} width={32} />}
            <Tooltip contentStyle={TT} />
            {showLegend && cd.series.length > 1 && <Legend {...LEG} />}
            {cd.series.map((s, i) => <Bar key={s.name} dataKey={s.name} fill={clrs[i]} radius={[3,3,0,0]} />)}
          </BarChart>
        );

      case 'bar-stacked':
        return (
          <BarChart width={width} height={chartH} data={data} margin={m}>
            {showGrid && <CartesianGrid {...GRID} />}
            {showAxes && <XAxis dataKey="name" tick={AX} />}
            {showAxes && <YAxis tick={AX} width={32} />}
            <Tooltip contentStyle={TT} />
            {showLegend && <Legend {...LEG} />}
            {cd.series.map((s, i) => <Bar key={s.name} dataKey={s.name} stackId="s" fill={clrs[i]} />)}
          </BarChart>
        );

      case 'bar-horizontal':
        return (
          <BarChart width={width} height={chartH} data={data} layout="vertical" margin={m}>
            {showGrid && <CartesianGrid {...GRID} />}
            {showAxes && <XAxis type="number" tick={AX} />}
            {showAxes && <YAxis type="category" dataKey="name" tick={AX} width={64} />}
            <Tooltip contentStyle={TT} />
            {showLegend && cd.series.length > 1 && <Legend {...LEG} />}
            {cd.series.map((s, i) => <Bar key={s.name} dataKey={s.name} fill={clrs[i]} radius={[0,3,3,0]} />)}
          </BarChart>
        );

      case 'line':
        return (
          <LineChart width={width} height={chartH} data={data} margin={m}>
            {showGrid && <CartesianGrid {...GRID} />}
            {showAxes && <XAxis dataKey="name" tick={AX} />}
            {showAxes && <YAxis tick={AX} width={32} />}
            <Tooltip contentStyle={TT} />
            {showLegend && cd.series.length > 1 && <Legend {...LEG} />}
            {cd.series.map((s, i) => (
              <Line key={s.name} type="monotone" dataKey={s.name} stroke={clrs[i]} strokeWidth={2}
                    dot={{ fill: clrs[i], r: 3 }} activeDot={{ r: 5 }} />
            ))}
          </LineChart>
        );

      case 'area':
        return (
          <AreaChart width={width} height={chartH} data={data} margin={m}>
            {showGrid && <CartesianGrid {...GRID} />}
            {showAxes && <XAxis dataKey="name" tick={AX} />}
            {showAxes && <YAxis tick={AX} width={32} />}
            <Tooltip contentStyle={TT} />
            {showLegend && cd.series.length > 1 && <Legend {...LEG} />}
            {cd.series.map((s, i) => (
              <Area key={s.name} type="monotone" dataKey={s.name} stroke={clrs[i]} fill={clrs[i] + '33'} strokeWidth={2} />
            ))}
          </AreaChart>
        );

      case 'area-stacked':
        return (
          <AreaChart width={width} height={chartH} data={data} margin={m}>
            {showGrid && <CartesianGrid {...GRID} />}
            {showAxes && <XAxis dataKey="name" tick={AX} />}
            {showAxes && <YAxis tick={AX} width={32} />}
            <Tooltip contentStyle={TT} />
            {showLegend && <Legend {...LEG} />}
            {cd.series.map((s, i) => (
              <Area key={s.name} type="monotone" dataKey={s.name} stackId="1" stroke={clrs[i]} fill={clrs[i] + '66'} strokeWidth={2} />
            ))}
          </AreaChart>
        );

      case 'pie':
      case 'donut': {
        const pieData = toPie(cd);
        const inner = cd.type === 'donut' ? '38%' : 0;
        return (
          <PieChart width={width} height={chartH}>
            <Pie data={pieData} cx="50%" cy="50%" innerRadius={inner} outerRadius="68%"
                 dataKey="value" label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                 labelLine={{ stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1 }}>
              {pieData.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
            </Pie>
            <Tooltip contentStyle={TT} />
            {showLegend && <Legend {...LEG} />}
          </PieChart>
        );
      }

      case 'scatter': {
        return (
          <ScatterChart width={width} height={chartH} margin={m}>
            {showGrid && <CartesianGrid {...GRID} />}
            {showAxes && <XAxis dataKey="x" type="number" tick={AX} name="X" />}
            {showAxes && <YAxis dataKey="y" type="number" tick={AX} name="Y" width={32} />}
            <Tooltip contentStyle={TT} cursor={{ strokeDasharray: '3 3' }} />
            {showLegend && cd.series.length > 1 && <Legend {...LEG} />}
            {cd.series.map((s, si) => (
              <Scatter key={s.name} name={s.name}
                data={cd.labels.map((lbl, i) => ({ x: parseFloat(lbl) || i + 1, y: cd.values[si]?.[i] ?? 0 }))}
                fill={clrs[si]} />
            ))}
          </ScatterChart>
        );
      }

      case 'radar': {
        return (
          <RadarChart width={width} height={chartH} data={toRadar(cd)} cx="50%" cy="50%" outerRadius="65%">
            <PolarGrid stroke="rgba(255,255,255,0.12)" />
            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#94A3B8' }} />
            <PolarRadiusAxis tick={{ fontSize: 8, fill: '#64748B' }} />
            <Tooltip contentStyle={TT} />
            {showLegend && cd.series.length > 1 && <Legend {...LEG} />}
            {cd.series.map((s, i) => (
              <Radar key={s.name} name={s.name} dataKey={s.name} stroke={clrs[i]} fill={clrs[i]} fillOpacity={0.18} />
            ))}
          </RadarChart>
        );
      }

      case 'funnel': {
        const fd = cd.labels.map((name, i) => ({
          name, value: cd.values[0]?.[i] ?? 0, fill: palette[i % palette.length],
        }));
        return (
          <FunnelChart width={width} height={chartH}>
            <Tooltip contentStyle={TT} />
            <Funnel dataKey="value" data={fd}>
              <LabelList position="center" fill="#fff" fontSize={11} dataKey="name" />
            </Funnel>
          </FunnelChart>
        );
      }

      default:
        return null;
    }
  }

  return (
    <div style={{ width, height, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {cd.title && (
        <div style={{ height: titleH, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 600, color: '#F1F5F9', flexShrink: 0 }}>
          {cd.title}
        </div>
      )}
      {inner()}
    </div>
  );
}
