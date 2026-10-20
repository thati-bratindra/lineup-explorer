export interface LineupPlayer {
  player_id: string;
  name: string;
}

/**
 * Totals and metrics shared by lineups and baselines. Stats are prefixed by the side the
 * lineup was on: `offensive_points` were scored, `defensive_points` were allowed.
 * Rate metrics are null when their denominator is 0.
 */
export interface LineupStats {
  offensive_possessions: number;
  offensive_points: number;
  offensive_fg2_made: number;
  offensive_fg2_attempted: number;
  offensive_fg3_made: number;
  offensive_fg3_attempted: number;
  offensive_fg_made: number;
  offensive_fg_attempted: number;
  offensive_ft_made: number;
  offensive_ft_attempted: number;
  offensive_rebounds_offense: number;
  offensive_rebound_opportunities: number;
  offensive_assists: number;
  offensive_turnovers: number;
  defensive_possessions: number;
  defensive_points: number;
  defensive_fg2_made: number;
  defensive_fg2_attempted: number;
  defensive_fg3_made: number;
  defensive_fg3_attempted: number;
  defensive_fg_made: number;
  defensive_fg_attempted: number;
  defensive_ft_made: number;
  defensive_ft_attempted: number;
  defensive_rebounds_defense: number;
  defensive_rebound_opportunities: number;
  defensive_steals: number;
  defensive_blocks: number;
  defensive_turnovers: number;
  total_possessions: number;
  offensive_fg_pct: number;
  offensive_fg2_pct: number;
  offensive_fg3_pct: number;
  defensive_fg_pct: number;
  defensive_fg2_pct: number;
  defensive_fg3_pct: number;
  games_played: number;
  minutes: number;
  pace: number | null;
  plus_minus: number;
  net_rating: number | null;
  offensive_rating: number | null;
  defensive_rating: number | null;
  offensive_ft_pct: number | null;
  defensive_ft_pct: number | null;
  offensive_efg_pct: number | null;
  defensive_efg_pct: number | null;
  offensive_ts_pct: number | null;
  defensive_ts_pct: number | null;
  offensive_tov_pct: number | null;
  defensive_tov_pct: number | null;
  offensive_ft_rate: number | null;
  defensive_ft_rate: number | null;
  offensive_fg3_rate: number | null;
  defensive_fg3_rate: number | null;
  offensive_ast_pct: number | null;
  defensive_ast_pct: number | null;
  offensive_steal_pct: number | null;
  defensive_steal_pct: number | null;
  offensive_block_pct: number | null;
  defensive_block_pct: number | null;
  offensive_rebound_pct: number | null;
  defensive_rebound_pct: number | null;
  total_rebound_pct: number | null;
}

export interface LineupRecord extends LineupStats {
  team_id: string;
  team_name: string;
  player_ids: string[];
  players: LineupPlayer[];
  off_court_possessions: number;
  off_court_offensive_rating: number | null;
  off_court_defensive_rating: number | null;
  off_court_net_rating: number | null;
  on_off_net_rating: number | null;
}

export interface TeamBaseline extends LineupStats {
  team_id: string;
  team_name: string;
}

export interface LineupBaselines {
  league: LineupStats | null;
  teams: TeamBaseline[];
}

export interface LeagueTeam {
  team_id: string;
  name: string;
  players: LineupPlayer[];
}

export interface LeagueGame {
  game_id: string;
  date: string;
  team_ids: string[];
}

export interface LeagueMetadata {
  teams: LeagueTeam[];
  games: LeagueGame[];
  periods: number[];
}

/** Filters that restrict which possessions count, shared by lineups and baselines. */
export interface PossessionFilters {
  opponentTeamId: string | null;
  withoutPlayerIds: string[];
  gameIds: string[];
  periods: number[];
}

export interface LineupQuery extends PossessionFilters {
  lineupSize: number;
  teamId: string | null;
  playerIds: string[];
  minPossessions: number;
}
