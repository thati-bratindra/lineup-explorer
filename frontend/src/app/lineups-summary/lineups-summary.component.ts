import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { catchError, debounceTime, forkJoin, of, switchMap, tap } from 'rxjs';

import {
  LeagueGame,
  LeagueMetadata,
  LineupBaselines,
  LineupQuery,
  LineupRecord,
} from '../_models/lineups.models';
import { HttpErrorResponse } from '../_services/base.service';
import { LineupsService } from '../_services/lineups.service';
import { COMPARE_LETTERS, LineupCompareComponent } from './lineup-compare/lineup-compare.component';
import {
  COLUMN_PRESETS,
  ColumnPresetId,
  METRICS,
  MetricDefinition,
  MetricKey,
  TEAM_COLORS,
  formatMetric,
  lineupKey,
  lineupShortNames,
  lineupSizeNoun,
  metricPolarity,
  metricValue,
  polarityTint,
} from './lineup-metrics';
import { LineupScatterComponent, SCATTER_PRESETS, ScatterPresetId } from './lineup-scatter/lineup-scatter.component';

type ViewMode = 'table' | 'chart';
type SortDirection = 'asc' | 'desc';

interface SortState {
  key: MetricKey;
  direction: SortDirection;
}

const DEFAULT_LINEUP_SIZE = 5;
const DEFAULT_MIN_POSSESSIONS = 20;
const DEFAULT_SORT: SortState = { key: 'total_possessions', direction: 'desc' };
const MAX_SELECTED = COMPARE_LETTERS.length;

const LINEUP_SIZES = [
  { value: 5, label: '5-man' },
  { value: 4, label: '4-man' },
  { value: 3, label: '3-man' },
  { value: 2, label: '2-man' },
  { value: 1, label: 'Players' },
];

function parseList(params: Params, key: string): string[] {
  const value = params[key];
  return typeof value === 'string' && value ? value.split(',') : [];
}

function parseInteger(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function gameDate(game: LeagueGame): Date {
  const [year, month, day] = game.date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function csvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

@Component({
  selector: 'lineups-summary-component',
  imports: [
    LineupCompareComponent,
    LineupScatterComponent,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  templateUrl: './lineups-summary.component.html',
  styleUrl: './lineups-summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LineupsSummaryComponent {
  private readonly lineupsService = inject(LineupsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly lineupSizes = LINEUP_SIZES;
  readonly columnPresets = COLUMN_PRESETS;
  readonly scatterPresets = SCATTER_PRESETS;
  readonly letters = COMPARE_LETTERS;

  // Filters, sent to the API.
  readonly lineupSize = signal(DEFAULT_LINEUP_SIZE);
  readonly teamId = signal<string | null>(null);
  readonly opponentTeamId = signal<string | null>(null);
  readonly playerIds = signal<string[]>([]);
  readonly withoutPlayerIds = signal<string[]>([]);
  readonly gameIds = signal<string[]>([]);
  readonly periods = signal<number[]>([]);
  readonly minPossessions = signal(DEFAULT_MIN_POSSESSIONS);

  // Presentation state, handled in the browser.
  readonly view = signal<ViewMode>('table');
  readonly columnPresetId = signal<ColumnPresetId>('overview');
  readonly scatterPresetId = signal<ScatterPresetId>('efficiency');
  readonly sort = signal<SortState>(DEFAULT_SORT);
  readonly selectedKeys = signal<string[]>([]);

  readonly league = signal<LeagueMetadata | null>(null);
  readonly lineups = signal<LineupRecord[]>([]);
  readonly baselines = signal<LineupBaselines | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  private readonly reloadCount = signal(0);

  readonly query = computed<LineupQuery>(() => ({
    lineupSize: this.lineupSize(),
    teamId: this.teamId(),
    opponentTeamId: this.opponentTeamId(),
    playerIds: this.playerIds(),
    withoutPlayerIds: this.withoutPlayerIds(),
    gameIds: this.gameIds(),
    periods: this.periods(),
    minPossessions: this.minPossessions(),
  }));

  readonly activeFilterCount = computed(() => {
    const query = this.query();
    return [
      query.teamId,
      query.opponentTeamId,
      query.playerIds.length,
      query.withoutPlayerIds.length,
      query.gameIds.length,
      query.periods.length,
      query.minPossessions !== DEFAULT_MIN_POSSESSIONS,
    ].filter(Boolean).length;
  });

  readonly noun = computed(() => lineupSizeNoun(this.lineupSize()));
  readonly nounSingular = computed(() => lineupSizeNoun(this.lineupSize(), false));
  readonly leagueStats = computed(() => this.baselines()?.league ?? null);
  readonly columnPreset = computed(
    () => COLUMN_PRESETS.find((preset) => preset.id === this.columnPresetId()) ?? COLUMN_PRESETS[0],
  );
  readonly scatterPreset = computed(
    () => SCATTER_PRESETS.find((preset) => preset.id === this.scatterPresetId()) ?? SCATTER_PRESETS[0],
  );

  /** Teams keep the same categorical color regardless of filters. */
  readonly teamColors = computed<Record<string, string>>(() =>
    Object.fromEntries(
      (this.league()?.teams ?? []).map((team, index) => [team.team_id, TEAM_COLORS[index % TEAM_COLORS.length]]),
    ),
  );
  readonly teamNames = computed<Record<string, string>>(() =>
    Object.fromEntries((this.league()?.teams ?? []).map((team) => [team.team_id, team.name])),
  );

  /** Only the selected team's players can appear together in one of its lineups. */
  readonly withPlayerOptions = computed(() => {
    const teams = this.league()?.teams ?? [];
    return this.teamId() ? teams.filter((team) => team.team_id === this.teamId()) : teams;
  });

  readonly gameOptions = computed(() =>
    (this.league()?.games ?? []).map((game) => ({
      id: game.game_id,
      label: `${gameDate(game).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · `
        + game.team_ids.map((teamId) => this.teamNames()[teamId] ?? 'Unknown').join(' vs '),
    })),
  );

  readonly sortedLineups = computed(() => {
    const { key, direction } = this.sort();
    const factor = direction === 'asc' ? 1 : -1;
    return [...this.lineups()].sort((a, b) => {
      const aValue = metricValue(a, key);
      const bValue = metricValue(b, key);
      if (aValue === null || bValue === null) {
        return Number(aValue === null) - Number(bValue === null);
      }
      return factor * (aValue - bValue);
    });
  });

  readonly selectedLineups = computed(() => {
    const byKey = new Map(this.lineups().map((lineup) => [lineupKey(lineup), lineup]));
    return this.selectedKeys().flatMap((key) => byKey.get(key) ?? []);
  });

  readonly tableRows = computed(() => {
    const metrics = this.columnPreset().metrics;
    const league = this.leagueStats();
    const selectedKeys = this.selectedKeys();
    const maxPossessions = Math.max(1, ...this.lineups().map((lineup) => lineup.total_possessions));
    return this.sortedLineups().map((lineup) => {
      const key = lineupKey(lineup);
      const selectedIndex = selectedKeys.indexOf(key);
      return {
        key,
        lineup,
        letter: selectedIndex >= 0 ? COMPARE_LETTERS[selectedIndex] : null,
        teamColor: this.teamColors()[lineup.team_id],
        cells: metrics.map((metric) => {
          const value = metricValue(lineup, metric.key);
          return {
            key: metric.key,
            text: formatMetric(value, metric.format),
            tint: polarityTint(metricPolarity(metric, value, metricValue(league, metric.key))),
            bar: metric.key === 'total_possessions' ? `${(100 * lineup.total_possessions) / maxPossessions}%` : null,
          };
        }),
      };
    });
  });

  /** Headline lineups for the current filters. */
  readonly insights = computed(() => {
    const lineups = this.lineups();
    const best = (metric: MetricDefinition, lowerIsBetter = false) =>
      lineups.reduce<LineupRecord | null>((bestLineup, lineup) => {
        const value = metricValue(lineup, metric.key);
        const bestValue = metricValue(bestLineup, metric.key);
        if (value === null) {
          return bestLineup;
        }
        if (bestValue === null || (lowerIsBetter ? value < bestValue : value > bestValue)) {
          return lineup;
        }
        return bestLineup;
      }, null);

    return [
      { label: 'Most used', metric: METRICS.total_possessions, suffix: 'possessions', lineup: best(METRICS.total_possessions) },
      { label: 'Best net rating', metric: METRICS.net_rating, suffix: 'per 100', lineup: best(METRICS.net_rating) },
      { label: 'Best offense', metric: METRICS.offensive_rating, suffix: 'ORtg', lineup: best(METRICS.offensive_rating) },
      { label: 'Best defense', metric: METRICS.defensive_rating, suffix: 'DRtg', lineup: best(METRICS.defensive_rating, true) },
    ].flatMap(({ lineup, ...insight }) =>
      lineup
        ? [{
          ...insight,
          key: lineupKey(lineup),
          value: formatMetric(metricValue(lineup, insight.metric.key), insight.metric.format),
          names: lineupShortNames(lineup),
          teamName: lineup.team_name,
          teamColor: this.teamColors()[lineup.team_id],
        }]
        : [],
    );
  });

  readonly formatMetric = formatMetric;

  constructor() {
    this.readStateFromUrl();

    this.lineupsService
      .getLeague()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (league) => this.league.set(league),
        error: (error: HttpErrorResponse) => this.error.set(this.errorMessage(error)),
      });

    toObservable(computed(() => ({ query: this.query(), reload: this.reloadCount() })))
      .pipe(
        debounceTime(200),
        tap(() => {
          this.loading.set(true);
          this.error.set(null);
        }),
        switchMap(({ query }) =>
          forkJoin({
            lineups: this.lineupsService.getLineups(query),
            baselines: this.lineupsService.getBaselines(query),
          }).pipe(
            catchError((error: HttpErrorResponse) => {
              this.error.set(this.errorMessage(error));
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        this.loading.set(false);
        if (!result) {
          return;
        }
        this.lineups.set(result.lineups);
        this.baselines.set(result.baselines);
        const available = new Set(result.lineups.map(lineupKey));
        this.selectedKeys.update((keys) => keys.filter((key) => available.has(key)));
      });

    effect(() => this.writeStateToUrl());
  }

  setLineupSize(lineupSize: number): void {
    this.lineupSize.set(lineupSize);
    this.selectedKeys.set([]);
  }

  setTeam(teamId: string | null): void {
    this.teamId.set(teamId);
    if (teamId && teamId === this.opponentTeamId()) {
      this.opponentTeamId.set(null);
    }
    const teamPlayers = new Set(this.withPlayerOptions().flatMap((team) => team.players.map((player) => player.player_id)));
    this.playerIds.update((playerIds) => playerIds.filter((playerId) => teamPlayers.has(playerId)));
  }

  setMinPossessions(value: string): void {
    this.minPossessions.set(Math.max(0, parseInteger(value, 0)));
  }

  resetFilters(): void {
    this.teamId.set(null);
    this.opponentTeamId.set(null);
    this.playerIds.set([]);
    this.withoutPlayerIds.set([]);
    this.gameIds.set([]);
    this.periods.set([]);
    this.minPossessions.set(DEFAULT_MIN_POSSESSIONS);
  }

  retry(): void {
    this.reloadCount.update((count) => count + 1);
  }

  sortBy(metric: MetricDefinition): void {
    this.sort.update((sort) =>
      sort.key === metric.key
        ? { key: sort.key, direction: sort.direction === 'desc' ? 'asc' : 'desc' }
        : { key: metric.key, direction: metric.direction < 0 ? 'asc' : 'desc' },
    );
  }

  ariaSort(metric: MetricDefinition): 'ascending' | 'descending' | null {
    const sort = this.sort();
    if (sort.key !== metric.key) {
      return null;
    }
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  /** Add a lineup to the comparison (dropping the oldest past the limit), or remove it. */
  toggleLineup(key: string): void {
    this.selectedKeys.update((keys) => {
      if (keys.includes(key)) {
        return keys.filter((selectedKey) => selectedKey !== key);
      }
      return [...keys, key].slice(-MAX_SELECTED);
    });
  }

  removeLineup(key: string): void {
    this.selectedKeys.update((keys) => keys.filter((selectedKey) => selectedKey !== key));
  }

  exportCsv(): void {
    const metrics = Object.values(METRICS);
    const header = ['Team', 'Players', ...metrics.map((metric) => metric.label), 'Player IDs'];
    const rows = this.sortedLineups().map((lineup) => [
      lineup.team_name,
      lineup.players.map((player) => player.name).join(' / '),
      ...metrics.map((metric) => metricValue(lineup, metric.key)),
      lineup.player_ids.join(' '),
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.lineupSize()}-man-lineups.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private errorMessage(error: HttpErrorResponse): string {
    return error?.errorMessages?.join(' ') || 'Something went wrong loading lineup data.';
  }

  private readStateFromUrl(): void {
    const params = this.route.snapshot.queryParams;
    this.lineupSize.set(Math.min(5, Math.max(1, parseInteger(params['size'], DEFAULT_LINEUP_SIZE))));
    this.teamId.set(params['team'] || null);
    this.opponentTeamId.set(params['opp'] || null);
    this.playerIds.set(parseList(params, 'with'));
    this.withoutPlayerIds.set(parseList(params, 'without'));
    this.gameIds.set(parseList(params, 'games'));
    this.periods.set(parseList(params, 'periods').map(Number).filter(Number.isFinite));
    this.minPossessions.set(Math.max(0, parseInteger(params['min'], DEFAULT_MIN_POSSESSIONS)));
    if (params['view'] === 'chart') {
      this.view.set('chart');
    }
    if (COLUMN_PRESETS.some((preset) => preset.id === params['cols'])) {
      this.columnPresetId.set(params['cols']);
    }
    if (SCATTER_PRESETS.some((preset) => preset.id === params['plot'])) {
      this.scatterPresetId.set(params['plot']);
    }
    if (Object.values(METRICS).some((metric) => metric.key === params['sort'])) {
      this.sort.set({ key: params['sort'], direction: params['dir'] === 'asc' ? 'asc' : 'desc' });
    }
  }

  /** Mirror the view in the URL (omitting defaults) so it can be bookmarked and shared. */
  private writeStateToUrl(): void {
    const sort = this.sort();
    const isDefaultSort = sort.key === DEFAULT_SORT.key && sort.direction === DEFAULT_SORT.direction;
    const queryParams: Params = {
      size: this.lineupSize() === DEFAULT_LINEUP_SIZE ? null : this.lineupSize(),
      team: this.teamId(),
      opp: this.opponentTeamId(),
      with: this.playerIds().join(',') || null,
      without: this.withoutPlayerIds().join(',') || null,
      games: this.gameIds().join(',') || null,
      periods: this.periods().join(',') || null,
      min: this.minPossessions() === DEFAULT_MIN_POSSESSIONS ? null : this.minPossessions(),
      view: this.view() === 'table' ? null : this.view(),
      cols: this.columnPresetId() === 'overview' ? null : this.columnPresetId(),
      plot: this.scatterPresetId() === 'efficiency' ? null : this.scatterPresetId(),
      sort: isDefaultSort ? null : sort.key,
      dir: isDefaultSort ? null : sort.direction,
    };
    this.router.navigate([], { relativeTo: this.route, queryParams, replaceUrl: true });
  }
}
