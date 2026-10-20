import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { LineupRecord, LineupStats } from '../../_models/lineups.models';
import {
  METRICS,
  MetricDefinition,
  formatMetric,
  lineupKey,
  lineupNames,
  lineupShortNames,
  metricValue,
} from '../lineup-metrics';

export type ScatterPresetId = 'efficiency' | 'shooting' | 'rebounding' | 'turnovers';

export interface ScatterPreset {
  id: ScatterPresetId;
  label: string;
  x: MetricDefinition;
  y: MetricDefinition;
}

export const SCATTER_PRESETS: ScatterPreset[] = [
  { id: 'efficiency', label: 'Offense vs defense', x: METRICS.offensive_rating, y: METRICS.defensive_rating },
  { id: 'shooting', label: 'Shooting', x: METRICS.offensive_efg_pct, y: METRICS.defensive_efg_pct },
  { id: 'rebounding', label: 'Rebounding', x: METRICS.offensive_rebound_pct, y: METRICS.defensive_rebound_pct },
  { id: 'turnovers', label: 'Turnovers', x: METRICS.offensive_tov_pct, y: METRICS.defensive_tov_pct },
];

interface ScatterPoint {
  key: string;
  lineup: LineupRecord;
  x: number;
  y: number;
  cx: number;
  cy: number;
  r: number;
  color: string;
}

interface Tick {
  value: number;
  position: number;
  label: string;
}

const HEIGHT = 440;
const MARGIN = { top: 20, right: 24, bottom: 52, left: 64 };
const MIN_RADIUS = 4;
const MAX_RADIUS = 14;
const LABEL_COUNT = 3;

/** Round tick values at a 1/2/5 step, like d3's ticks. */
function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min;
  if (span <= 0) {
    return [min];
  }
  let step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const error = (count / span) * step;
  if (error <= 0.15) {
    step *= 10;
  } else if (error <= 0.35) {
    step *= 5;
  } else if (error <= 0.75) {
    step *= 2;
  }
  const ticks = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step * 1e-9; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }
  return ticks;
}

function paddedExtent(values: number[]): [number, number] {
  if (!values.length) {
    return [0, 1];
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min || Math.abs(max) || 1) * 0.06;
  return [min - padding, max + padding];
}

@Component({
  selector: 'lineup-scatter',
  templateUrl: './lineup-scatter.component.html',
  styleUrl: './lineup-scatter.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LineupScatterComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly lineups = input.required<LineupRecord[]>();
  readonly league = input<LineupStats | null>(null);
  readonly preset = input.required<ScatterPreset>();
  readonly selectedKeys = input<string[]>([]);
  readonly teamColors = input<Record<string, string>>({});
  readonly toggleLineup = output<string>();

  readonly height = HEIGHT;
  readonly margin = MARGIN;
  readonly width = signal(800);
  readonly hoveredKey = signal<string | null>(null);

  readonly plotWidth = computed(() => Math.max(this.width() - MARGIN.left - MARGIN.right, 100));
  readonly plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  private readonly plottable = computed(() => {
    const { x, y } = this.preset();
    return this.lineups().filter(
      (lineup) => metricValue(lineup, x.key) !== null && metricValue(lineup, y.key) !== null,
    );
  });

  readonly hasPoints = computed(() => this.plottable().length > 0);

  private readonly scales = computed(() => {
    const { x, y } = this.preset();
    const league = this.league();
    const xValues = this.plottable().map((lineup) => metricValue(lineup, x.key)!);
    const yValues = this.plottable().map((lineup) => metricValue(lineup, y.key)!);
    const leagueX = metricValue(league, x.key);
    const leagueY = metricValue(league, y.key);
    const xDomain = paddedExtent(leagueX === null ? xValues : [...xValues, leagueX]);
    const yDomain = paddedExtent(leagueY === null ? yValues : [...yValues, leagueY]);

    // Orient both axes so "better" is always to the right and up.
    const xRange: [number, number] = x.direction < 0 ? [this.plotWidth(), 0] : [0, this.plotWidth()];
    const yRange: [number, number] = y.direction < 0 ? [0, this.plotHeight] : [this.plotHeight, 0];
    const scale = (domain: [number, number], range: [number, number]) => (value: number) =>
      range[0] + ((value - domain[0]) / (domain[1] - domain[0])) * (range[1] - range[0]);

    return {
      x: scale(xDomain, xRange),
      y: scale(yDomain, yRange),
      xDomain,
      yDomain,
      leagueX,
      leagueY,
    };
  });

  readonly points = computed<ScatterPoint[]>(() => {
    const { x, y } = this.preset();
    const scales = this.scales();
    const selected = new Set(this.selectedKeys());
    const maxPossessions = Math.max(...this.plottable().map((lineup) => lineup.total_possessions), 1);
    const points = this.plottable().map((lineup) => {
      const xValue = metricValue(lineup, x.key)!;
      const yValue = metricValue(lineup, y.key)!;
      return {
        key: lineupKey(lineup),
        lineup,
        x: xValue,
        y: yValue,
        cx: scales.x(xValue),
        cy: scales.y(yValue),
        r: MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.sqrt(lineup.total_possessions / maxPossessions),
        color: this.teamColors()[lineup.team_id] ?? '#898781',
      };
    });
    // Large bubbles first so small ones stay on top; selected lineups are drawn last.
    return points.sort((a, b) => Number(selected.has(a.key)) - Number(selected.has(b.key)) || b.r - a.r);
  });

  /** Selected lineups get direct labels; with none selected, label the most-used lineups. */
  readonly labels = computed(() => {
    const selected = new Set(this.selectedKeys());
    const labelled = selected.size
      ? this.points().filter((point) => selected.has(point.key))
      : [...this.points()].sort((a, b) => b.lineup.total_possessions - a.lineup.total_possessions).slice(0, LABEL_COUNT);
    return labelled.map((point) => {
      const alignEnd = point.cx > this.plotWidth() - 180;
      return {
        key: point.key,
        text: lineupShortNames(point.lineup),
        x: alignEnd ? point.cx - point.r - 6 : point.cx + point.r + 6,
        y: point.cy + 4,
        anchor: alignEnd ? 'end' : 'start',
      };
    });
  });

  readonly xTicks = computed<Tick[]>(() => {
    const { x } = this.preset();
    const scales = this.scales();
    return niceTicks(scales.xDomain[0], scales.xDomain[1], Math.max(3, Math.floor(this.plotWidth() / 110))).map(
      (value) => ({ value, position: scales.x(value), label: this.tickLabel(value, x) }),
    );
  });

  readonly yTicks = computed<Tick[]>(() => {
    const { y } = this.preset();
    const scales = this.scales();
    return niceTicks(scales.yDomain[0], scales.yDomain[1], 6).map((value) => ({
      value,
      position: scales.y(value),
      label: this.tickLabel(value, y),
    }));
  });

  readonly leagueLines = computed(() => {
    const scales = this.scales();
    return {
      x: scales.leagueX === null ? null : scales.x(scales.leagueX),
      y: scales.leagueY === null ? null : scales.y(scales.leagueY),
    };
  });

  readonly hovered = computed(() => this.points().find((point) => point.key === this.hoveredKey()) ?? null);

  readonly tooltipStyle = computed(() => {
    const point = this.hovered();
    if (!point) {
      return null;
    }
    const left = MARGIN.left + point.cx;
    const flip = left > this.width() - 300;
    return {
      top: `${MARGIN.top + point.cy}px`,
      left: `${flip ? left - point.r - 12 : left + point.r + 12}px`,
      transform: flip ? 'translate(-100%, -50%)' : 'translate(0, -50%)',
    };
  });

  readonly selectedSet = computed(() => new Set(this.selectedKeys()));

  readonly formatMetric = formatMetric;
  readonly lineupNames = lineupNames;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const observer = new ResizeObserver(([entry]) => this.width.set(Math.floor(entry.contentRect.width)));
      observer.observe(this.host.nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  hitRadius(point: ScatterPoint): number {
    return Math.max(12, point.r + 4);
  }

  pointLabel(point: ScatterPoint): string {
    const { x, y } = this.preset();
    return `${lineupNames(point.lineup)}, ${point.lineup.team_name}. ${x.label} ${formatMetric(point.x, x.format)}, `
      + `${y.label} ${formatMetric(point.y, y.format)}, ${point.lineup.total_possessions} possessions.`;
  }

  private tickLabel(value: number, metric: MetricDefinition): string {
    return metric.format === 'pct' ? `${Math.round(value * 100)}%` : String(Math.round(value * 10) / 10);
  }
}
