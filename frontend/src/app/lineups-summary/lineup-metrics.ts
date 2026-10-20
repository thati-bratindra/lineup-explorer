import { LineupRecord, LineupStats } from '../_models/lineups.models';

export type MetricKey = keyof LineupStats | 'on_off_net_rating' | 'off_court_net_rating';
export type MetricFormat = 'int' | 'decimal' | 'signed' | 'signedInt' | 'pct';

export interface MetricDefinition {
  key: MetricKey;
  label: string;
  description: string;
  format: MetricFormat;
  /** 1 when higher is better, -1 when lower is better, 0 for volume or style stats. */
  direction: 1 | -1 | 0;
  /** Distance from the baseline that gets the strongest shading. */
  spread?: number;
  /** Shade relative to zero (differentials) instead of the league average. */
  zeroBaseline?: boolean;
}

const metric = (definition: MetricDefinition): MetricDefinition => definition;

export const METRICS = {
  total_possessions: metric({
    key: 'total_possessions', label: 'Poss', format: 'int', direction: 0,
    description: 'Possessions played (offense + defense).',
  }),
  minutes: metric({
    key: 'minutes', label: 'Min', format: 'decimal', direction: 0,
    description: 'Minutes on the floor together, from possession durations.',
  }),
  games_played: metric({
    key: 'games_played', label: 'GP', format: 'int', direction: 0,
    description: 'Games the lineup appeared in.',
  }),
  plus_minus: metric({
    key: 'plus_minus', label: '+/−', format: 'signedInt', direction: 1, spread: 12, zeroBaseline: true,
    description: 'Points scored minus points allowed.',
  }),
  offensive_rating: metric({
    key: 'offensive_rating', label: 'ORtg', format: 'decimal', direction: 1, spread: 20,
    description: 'Offensive rating: points scored per 100 offensive possessions.',
  }),
  defensive_rating: metric({
    key: 'defensive_rating', label: 'DRtg', format: 'decimal', direction: -1, spread: 20,
    description: 'Defensive rating: points allowed per 100 defensive possessions. Lower is better.',
  }),
  net_rating: metric({
    key: 'net_rating', label: 'Net', format: 'signed', direction: 1, spread: 25, zeroBaseline: true,
    description: 'Net rating: ORtg − DRtg, the point differential per 100 possessions.',
  }),
  on_off_net_rating: metric({
    key: 'on_off_net_rating', label: 'On/Off', format: 'signed', direction: 1, spread: 25, zeroBaseline: true,
    description: 'Net rating with this group on the floor minus the team’s net rating without it.',
  }),
  off_court_net_rating: metric({
    key: 'off_court_net_rating', label: 'Team Net w/o', format: 'signed', direction: 1, spread: 25, zeroBaseline: true,
    description: 'The team’s net rating on possessions without this group on the floor.',
  }),
  pace: metric({
    key: 'pace', label: 'Pace', format: 'decimal', direction: 0,
    description: 'Possessions per team per 48 minutes.',
  }),
  offensive_efg_pct: metric({
    key: 'offensive_efg_pct', label: 'eFG%', format: 'pct', direction: 1, spread: 0.08,
    description: 'Effective FG%: (FGM + 0.5 × 3PM) / FGA. Credits the extra point on threes.',
  }),
  offensive_ts_pct: metric({
    key: 'offensive_ts_pct', label: 'TS%', format: 'pct', direction: 1, spread: 0.08,
    description: 'True shooting: PTS / (2 × (FGA + 0.44 × FTA)). Scoring efficiency including free throws.',
  }),
  offensive_tov_pct: metric({
    key: 'offensive_tov_pct', label: 'TOV%', format: 'pct', direction: -1, spread: 0.05,
    description: 'Turnovers per offensive possession. Lower is better.',
  }),
  offensive_rebound_pct: metric({
    key: 'offensive_rebound_pct', label: 'OREB%', format: 'pct', direction: 1, spread: 0.12,
    description: 'Share of the lineup’s own missed shots it rebounded.',
  }),
  offensive_ft_rate: metric({
    key: 'offensive_ft_rate', label: 'FT Rate', format: 'pct', direction: 1, spread: 0.12,
    description: 'Free throw attempts per field goal attempt: how often the lineup gets to the line.',
  }),
  offensive_fg3_rate: metric({
    key: 'offensive_fg3_rate', label: '3PA Rate', format: 'pct', direction: 0,
    description: 'Share of field goal attempts taken from three.',
  }),
  offensive_ast_pct: metric({
    key: 'offensive_ast_pct', label: 'AST%', format: 'pct', direction: 0,
    description: 'Share of made field goals that were assisted.',
  }),
  defensive_efg_pct: metric({
    key: 'defensive_efg_pct', label: 'Opp eFG%', format: 'pct', direction: -1, spread: 0.08,
    description: 'Opponent effective FG% while this lineup defended. Lower is better.',
  }),
  defensive_tov_pct: metric({
    key: 'defensive_tov_pct', label: 'Forced TOV%', format: 'pct', direction: 1, spread: 0.05,
    description: 'Opponent turnovers per defensive possession.',
  }),
  defensive_rebound_pct: metric({
    key: 'defensive_rebound_pct', label: 'DREB%', format: 'pct', direction: 1, spread: 0.12,
    description: 'Share of opponent misses the lineup rebounded. 1 − DREB% is the opponent’s OREB%.',
  }),
  defensive_ft_rate: metric({
    key: 'defensive_ft_rate', label: 'Opp FT Rate', format: 'pct', direction: -1, spread: 0.12,
    description: 'Opponent free throw attempts per field goal attempt. Lower is better.',
  }),
  defensive_fg3_rate: metric({
    key: 'defensive_fg3_rate', label: 'Opp 3PA Rate', format: 'pct', direction: 0,
    description: 'Share of opponent field goal attempts taken from three.',
  }),
  defensive_steal_pct: metric({
    key: 'defensive_steal_pct', label: 'STL%', format: 'pct', direction: 1, spread: 0.04,
    description: 'Steals per defensive possession.',
  }),
  defensive_block_pct: metric({
    key: 'defensive_block_pct', label: 'BLK%', format: 'pct', direction: 1, spread: 0.06,
    description: 'Share of opponent field goal attempts blocked.',
  }),
  total_rebound_pct: metric({
    key: 'total_rebound_pct', label: 'TREB%', format: 'pct', direction: 1, spread: 0.1,
    description: 'Share of all available rebounds (both ends) the lineup grabbed.',
  }),
  offensive_rebounds_offense: metric({
    key: 'offensive_rebounds_offense', label: 'OREB', format: 'int', direction: 0,
    description: 'Offensive rebounds.',
  }),
  offensive_rebound_opportunities: metric({
    key: 'offensive_rebound_opportunities', label: 'OREB Chances', format: 'int', direction: 0,
    description: 'Missed shots by the lineup that were rebounded by either team.',
  }),
  defensive_rebounds_defense: metric({
    key: 'defensive_rebounds_defense', label: 'DREB', format: 'int', direction: 0,
    description: 'Defensive rebounds.',
  }),
  defensive_rebound_opportunities: metric({
    key: 'defensive_rebound_opportunities', label: 'DREB Chances', format: 'int', direction: 0,
    description: 'Missed shots by the opponent that were rebounded by either team.',
  }),
  offensive_fg_pct: metric({
    key: 'offensive_fg_pct', label: 'FG%', format: 'pct', direction: 1, spread: 0.08,
    description: 'Field goal percentage.',
  }),
  offensive_fg2_pct: metric({
    key: 'offensive_fg2_pct', label: '2P%', format: 'pct', direction: 1, spread: 0.08,
    description: 'Two-point field goal percentage.',
  }),
  offensive_fg3_pct: metric({
    key: 'offensive_fg3_pct', label: '3P%', format: 'pct', direction: 1, spread: 0.12,
    description: 'Three-point field goal percentage.',
  }),
  offensive_ft_pct: metric({
    key: 'offensive_ft_pct', label: 'FT%', format: 'pct', direction: 1, spread: 0.12,
    description: 'Free throw percentage.',
  }),
  defensive_fg_pct: metric({
    key: 'defensive_fg_pct', label: 'Opp FG%', format: 'pct', direction: -1, spread: 0.08,
    description: 'Opponent field goal percentage. Lower is better.',
  }),
  defensive_fg2_pct: metric({
    key: 'defensive_fg2_pct', label: 'Opp 2P%', format: 'pct', direction: -1, spread: 0.08,
    description: 'Opponent two-point percentage. Lower is better.',
  }),
  defensive_fg3_pct: metric({
    key: 'defensive_fg3_pct', label: 'Opp 3P%', format: 'pct', direction: -1, spread: 0.12,
    description: 'Opponent three-point percentage. Lower is better.',
  }),
  offensive_points: metric({
    key: 'offensive_points', label: 'PTS', format: 'int', direction: 0, description: 'Points scored.',
  }),
  defensive_points: metric({
    key: 'defensive_points', label: 'Opp PTS', format: 'int', direction: 0, description: 'Points allowed.',
  }),
  offensive_possessions: metric({
    key: 'offensive_possessions', label: 'Off Poss', format: 'int', direction: 0,
    description: 'Offensive possessions.',
  }),
  defensive_possessions: metric({
    key: 'defensive_possessions', label: 'Def Poss', format: 'int', direction: 0,
    description: 'Defensive possessions.',
  }),
  offensive_assists: metric({
    key: 'offensive_assists', label: 'AST', format: 'int', direction: 0, description: 'Assists.',
  }),
  offensive_turnovers: metric({
    key: 'offensive_turnovers', label: 'TOV', format: 'int', direction: 0, description: 'Turnovers committed.',
  }),
  defensive_steals: metric({
    key: 'defensive_steals', label: 'STL', format: 'int', direction: 0, description: 'Steals.',
  }),
  defensive_blocks: metric({
    key: 'defensive_blocks', label: 'BLK', format: 'int', direction: 0, description: 'Blocks.',
  }),
} satisfies Record<string, MetricDefinition>;

export type ColumnPresetId = 'overview' | 'fourFactors' | 'offense' | 'defense' | 'rebounding' | 'shooting' | 'totals';

export interface ColumnPreset {
  id: ColumnPresetId;
  label: string;
  metrics: MetricDefinition[];
}

export const COLUMN_PRESETS: ColumnPreset[] = [
  {
    id: 'overview',
    label: 'Overview',
    metrics: [
      METRICS.total_possessions, METRICS.minutes, METRICS.games_played, METRICS.plus_minus,
      METRICS.offensive_rating, METRICS.defensive_rating, METRICS.net_rating, METRICS.on_off_net_rating, METRICS.pace,
    ],
  },
  {
    id: 'fourFactors',
    label: 'Four Factors',
    metrics: [
      METRICS.total_possessions, METRICS.net_rating,
      METRICS.offensive_efg_pct, METRICS.offensive_tov_pct, METRICS.offensive_rebound_pct, METRICS.offensive_ft_rate,
      METRICS.defensive_efg_pct, METRICS.defensive_tov_pct, METRICS.defensive_rebound_pct, METRICS.defensive_ft_rate,
    ],
  },
  {
    id: 'offense',
    label: 'Offense',
    metrics: [
      METRICS.total_possessions, METRICS.offensive_rating, METRICS.offensive_efg_pct, METRICS.offensive_ts_pct,
      METRICS.offensive_tov_pct, METRICS.offensive_rebound_pct, METRICS.offensive_ft_rate, METRICS.offensive_fg3_rate,
      METRICS.offensive_ast_pct,
    ],
  },
  {
    id: 'defense',
    label: 'Defense',
    metrics: [
      METRICS.total_possessions, METRICS.defensive_rating, METRICS.defensive_efg_pct, METRICS.defensive_tov_pct,
      METRICS.defensive_rebound_pct, METRICS.defensive_ft_rate, METRICS.defensive_steal_pct, METRICS.defensive_block_pct,
      METRICS.defensive_fg3_rate,
    ],
  },
  {
    id: 'rebounding',
    label: 'Rebounding',
    metrics: [
      METRICS.total_possessions, METRICS.total_rebound_pct, METRICS.offensive_rebound_pct, METRICS.defensive_rebound_pct,
      METRICS.offensive_rebounds_offense, METRICS.offensive_rebound_opportunities,
      METRICS.defensive_rebounds_defense, METRICS.defensive_rebound_opportunities,
    ],
  },
  {
    id: 'shooting',
    label: 'Shooting',
    metrics: [
      METRICS.total_possessions, METRICS.offensive_fg_pct, METRICS.offensive_fg2_pct, METRICS.offensive_fg3_pct,
      METRICS.offensive_ft_pct, METRICS.defensive_fg_pct, METRICS.defensive_fg2_pct, METRICS.defensive_fg3_pct,
    ],
  },
  {
    id: 'totals',
    label: 'Totals',
    metrics: [
      METRICS.offensive_possessions, METRICS.defensive_possessions, METRICS.offensive_points, METRICS.defensive_points,
      METRICS.plus_minus, METRICS.offensive_assists, METRICS.offensive_turnovers, METRICS.defensive_steals,
      METRICS.defensive_blocks,
    ],
  },
];

/** Metrics shown when comparing lineups side by side, grouped under headings. */
export const COMPARE_SECTIONS: { title: string; metrics: MetricDefinition[] }[] = [
  {
    title: 'Impact',
    metrics: [
      METRICS.total_possessions, METRICS.minutes, METRICS.plus_minus, METRICS.net_rating,
      METRICS.offensive_rating, METRICS.defensive_rating, METRICS.on_off_net_rating,
    ],
  },
  {
    title: 'Offense',
    metrics: [
      METRICS.offensive_efg_pct, METRICS.offensive_tov_pct, METRICS.offensive_rebound_pct, METRICS.offensive_ft_rate,
      METRICS.offensive_fg3_pct, METRICS.offensive_ast_pct,
    ],
  },
  {
    title: 'Defense',
    metrics: [
      METRICS.defensive_efg_pct, METRICS.defensive_tov_pct, METRICS.defensive_rebound_pct, METRICS.defensive_ft_rate,
      METRICS.defensive_fg3_pct, METRICS.defensive_block_pct,
    ],
  },
];

/** Four factors drawn as dot plots against the league average, with a fixed axis range per factor. */
export const FOUR_FACTOR_TRACKS: { metric: MetricDefinition; min: number; max: number }[] = [
  { metric: METRICS.offensive_efg_pct, min: 0.3, max: 0.8 },
  { metric: METRICS.offensive_tov_pct, min: 0, max: 0.3 },
  { metric: METRICS.offensive_rebound_pct, min: 0, max: 0.6 },
  { metric: METRICS.offensive_ft_rate, min: 0, max: 0.6 },
  { metric: METRICS.defensive_efg_pct, min: 0.3, max: 0.8 },
  { metric: METRICS.defensive_tov_pct, min: 0, max: 0.3 },
  { metric: METRICS.defensive_rebound_pct, min: 0.4, max: 1 },
  { metric: METRICS.defensive_ft_rate, min: 0, max: 0.6 },
];

// Categorical slots in fixed order; teams take them alphabetically so a team keeps its color under any filter.
export const TEAM_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

const MINUS = '−';

export function metricValue(record: object | null | undefined, key: MetricKey): number | null {
  const value = (record as Record<string, unknown> | null | undefined)?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function formatMetric(value: number | null | undefined, format: MetricFormat): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  switch (format) {
    case 'int':
      return Math.round(value).toLocaleString();
    case 'decimal':
      return value.toFixed(1);
    case 'pct':
      return `${(value * 100).toFixed(1)}%`;
    case 'signed':
    case 'signedInt': {
      const digits = format === 'signed' ? 1 : 0;
      const rounded = Number(value.toFixed(digits));
      const sign = rounded > 0 ? '+' : rounded < 0 ? MINUS : '';
      return `${sign}${Math.abs(rounded).toFixed(digits)}`;
    }
  }
}

/**
 * How far a value sits from its baseline in the "better" direction, from -1 (much worse)
 * to 1 (much better). Null when the metric has no better direction or no value.
 */
export function metricPolarity(
  metric: MetricDefinition,
  value: number | null,
  leagueValue: number | null,
): number | null {
  const baseline = metric.zeroBaseline ? 0 : leagueValue;
  if (!metric.direction || !metric.spread || value === null || baseline === null) {
    return null;
  }
  const polarity = (metric.direction * (value - baseline)) / metric.spread;
  return Math.max(-1, Math.min(1, polarity));
}

/** Diverging tint for a cell: blue when better than the baseline, red when worse, clear at the baseline. */
export function polarityTint(polarity: number | null): string | null {
  if (polarity === null || Math.abs(polarity) < 0.05) {
    return null;
  }
  const strength = Math.round(Math.abs(polarity) * 38);
  const pole = polarity > 0 ? 'var(--viz-better)' : 'var(--viz-worse)';
  return `color-mix(in oklab, ${pole} ${strength}%, transparent)`;
}

export function lineupKey(lineup: Pick<LineupRecord, 'player_ids'>): string {
  return lineup.player_ids.join('|');
}

export function lineupNames(lineup: Pick<LineupRecord, 'players'>): string {
  return lineup.players.map((player) => player.name).join(' · ');
}

/** Compact label using each player's last name (full name when two share one), for chart labels and tiles. */
export function lineupShortNames(lineup: Pick<LineupRecord, 'players'>): string {
  const lastNames = lineup.players.map((player) => player.name.split(' ').at(-1) ?? player.name);
  return lineup.players
    .map((player, index) =>
      lastNames.indexOf(lastNames[index]) === lastNames.lastIndexOf(lastNames[index]) ? lastNames[index] : player.name,
    )
    .join(' / ');
}

export function lineupSizeNoun(lineupSize: number, plural = true): string {
  if (lineupSize === 1) {
    return plural ? 'players' : 'player';
  }
  return plural ? 'lineups' : 'lineup';
}
