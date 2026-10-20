import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { LineupRecord, LineupStats } from '../../_models/lineups.models';
import {
  COMPARE_SECTIONS,
  FOUR_FACTOR_TRACKS,
  MetricDefinition,
  formatMetric,
  lineupKey,
  metricPolarity,
  metricValue,
  polarityTint,
} from '../lineup-metrics';

export const COMPARE_LETTERS = ['A', 'B', 'C'];

const DOT_COLLISION_PERCENT = 7;
const DOT_LANE_OFFSET = 8;

interface CompareCell {
  text: string;
  tint: string | null;
  best: boolean;
}

@Component({
  selector: 'lineup-compare',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './lineup-compare.component.html',
  styleUrl: './lineup-compare.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LineupCompareComponent {
  readonly lineups = input.required<LineupRecord[]>();
  readonly league = input<LineupStats | null>(null);
  readonly teamColors = input<Record<string, string>>({});
  readonly lineupSize = input(5);
  readonly remove = output<string>();
  readonly clear = output<void>();

  readonly letters = COMPARE_LETTERS;
  readonly lineupKey = lineupKey;

  readonly sections = computed(() =>
    COMPARE_SECTIONS.map((section) => ({
      title: section.title,
      rows: section.metrics.map((metric) => this.compareRow(metric)),
    })),
  );

  readonly tracks = computed(() =>
    FOUR_FACTOR_TRACKS.map(({ metric, min, max }) => {
      const percent = (value: number) => (100 * (Math.min(max, Math.max(min, value)) - min)) / (max - min);
      const leagueValue = metricValue(this.league(), metric.key);
      const dots = this.lineups()
        .flatMap((lineup, index) => {
          const value = metricValue(lineup, metric.key);
          if (value === null) {
            return [];
          }
          const polarity = metricPolarity(metric, value, leagueValue);
          return [{
            letter: COMPARE_LETTERS[index],
            percent: percent(value),
            text: formatMetric(value, metric.format),
            tone: polarity === null || Math.abs(polarity) < 0.05 ? 'even' : polarity > 0 ? 'better' : 'worse',
            offset: 0,
          }];
        })
        .sort((a, b) => a.percent - b.percent);
      // Nudge dots that would overlap onto alternating lanes above and below the track.
      dots.forEach((dot, index) => {
        const previous = dots[index - 1];
        if (previous && dot.percent - previous.percent < DOT_COLLISION_PERCENT) {
          dot.offset = previous.offset === 0 ? -DOT_LANE_OFFSET : previous.offset < 0 ? DOT_LANE_OFFSET : 0;
        }
      });
      return {
        metric,
        leagueText: formatMetric(leagueValue, metric.format),
        leaguePosition: leagueValue === null ? null : `${percent(leagueValue)}%`,
        dots,
      };
    }),
  );

  private compareRow(metric: MetricDefinition) {
    const leagueValue = metricValue(this.league(), metric.key);
    const values = this.lineups().map((lineup) => metricValue(lineup, metric.key));
    const ranked = values.filter((value): value is number => value !== null);
    const bestValue = metric.direction && ranked.length > 1
      ? (metric.direction > 0 ? Math.max(...ranked) : Math.min(...ranked))
      : null;
    const cells: CompareCell[] = values.map((value) => ({
      text: formatMetric(value, metric.format),
      tint: polarityTint(metricPolarity(metric, value, leagueValue)),
      best: bestValue !== null && value === bestValue,
    }));
    // Differentials (net, on/off, +/-) have no meaningful league average.
    const showLeague = !metric.zeroBaseline && metric.key !== 'total_possessions' && metric.key !== 'minutes';
    return { metric, cells, leagueText: showLeague ? formatMetric(leagueValue, metric.format) : '' };
  }
}
