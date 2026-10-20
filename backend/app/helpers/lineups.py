"""Helpers for the lineup summary API.

Every possession is seen from two sides: the five players on offense and the five on
defense. Each side is credited to every n-man combination of its on-court players, so an
n-man lineup's totals are the sum of every possession that group shared the floor for.

Stats are prefixed by the side the lineup was on. `offensive_points` are points the lineup
scored and `defensive_points` are points it allowed. Likewise `offensive_steals` are
steals committed against the lineup and `defensive_steals` are steals it made.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from itertools import combinations
from typing import Any

import pandas as pd

from app.dbmodels.models import Player, Possession, Team

LineupRecord = dict[str, Any]

SIDES = ('offensive', 'defensive')

# Possession-level counting stats, in the order they appear in the sample response.
COUNTING_STAT_FIELDS = (
    'points',
    'shot_attempts',
    'fg2_made',
    'fg2_attempted',
    'fg3_made',
    'fg3_attempted',
    'fg_made',
    'fg_attempted',
    'ft_made',
    'ft_attempted',
    'rebounds_offense',
    'rebounds_defense',
    'rebound_opportunities',
    'assists',
    'steals',
    'turnovers',
    'blocks',
    'offensive_fouls',
    'defensive_fouls',
    'shooting_fouls',
    'shot_attempt_points',
    'ft_potential_points',
    'transition_take_fouls',
)
SAMPLE_SUMMED_FIELDS = ('possessions', *COUNTING_STAT_FIELDS)
SUMMED_FIELDS = (*SAMPLE_SUMMED_FIELDS, 'seconds')

POSSESSION_VALUE_FIELDS = (
    'game_id',
    'period',
    'offensive_team_id',
    'defensive_team_id',
    'offensive_player_ids',
    'defensive_player_ids',
    'seconds',
    *COUNTING_STAT_FIELDS,
)

# Shooting splits from the sample response. These report 0 (not null) with no attempts.
SAMPLE_PCT_FIELDS = tuple(
    f'{side}_{shot}_pct' for side in SIDES for shot in ('fg', 'fg2', 'fg3')
)

# Metrics added on top of the sample response. Rates are null when their denominator is 0.
PER_SIDE_METRICS = (
    'rating',
    'ft_pct',
    'efg_pct',
    'ts_pct',
    'tov_pct',
    'ft_rate',
    'fg3_rate',
    'ast_pct',
    'steal_pct',
    'block_pct',
)
DERIVED_METRIC_FIELDS = (
    'minutes',
    'pace',
    'plus_minus',
    'net_rating',
    *(f'{side}_{metric}' for side in SIDES for metric in PER_SIDE_METRICS),
    'offensive_rebound_pct',
    'defensive_rebound_pct',
    'total_rebound_pct',
    *(f'{side}_seconds' for side in SIDES),
)
ON_OFF_FIELDS = (
    'off_court_possessions',
    'off_court_offensive_rating',
    'off_court_defensive_rating',
    'off_court_net_rating',
    'on_off_net_rating',
)

SUMMED_OUTPUT_FIELDS = tuple(f'{side}_{field}' for side in SIDES for field in SAMPLE_SUMMED_FIELDS)
LINEUP_SORT_FIELDS = (
    *SUMMED_OUTPUT_FIELDS,
    'total_possessions',
    *SAMPLE_PCT_FIELDS,
    'games_played',
    *DERIVED_METRIC_FIELDS,
    *ON_OFF_FIELDS,
)
DEFAULT_SORT_FIELD = 'total_possessions'

SECONDS_PER_GAME = 48 * 60


def _normalize_lineup_size(lineup_size: Any) -> int:
    try:
        normalized_lineup_size = int(lineup_size)
    except (TypeError, ValueError):
        return 5

    return max(1, min(5, normalized_lineup_size))


def _rate(numerator: pd.Series, denominator: pd.Series, scale: float = 1.0) -> pd.Series:
    """Return scale * numerator / denominator, or NaN wherever the denominator is 0."""
    return (scale * numerator / denominator.where(denominator > 0)).astype(float)


def _split_by_side(possessions: Iterable[Mapping[str, Any]]) -> pd.DataFrame:
    """Return one row per (possession, side) with that side's team, opponent and players."""
    frame = pd.DataFrame.from_records(list(possessions), columns=POSSESSION_VALUE_FIELDS)
    frame['possessions'] = 1

    side_frames = []
    for side, opponent in zip(SIDES, reversed(SIDES)):
        side_frames.append(
            frame.assign(
                side=side,
                team_id=frame[f'{side}_team_id'],
                opponent_team_id=frame[f'{opponent}_team_id'],
                on_court=frame[f'{side}_player_ids'].map(lambda ids: tuple(sorted(ids))),
            )
        )
    return pd.concat(side_frames, ignore_index=True)


def _filter_sides(
    sides: pd.DataFrame,
    team_id: str | None = None,
    opponent_team_id: str | None = None,
    without_player_ids: Sequence[str] = (),
) -> pd.DataFrame:
    mask = pd.Series(True, index=sides.index)
    if team_id:
        mask &= sides['team_id'] == team_id
    if opponent_team_id:
        mask &= sides['opponent_team_id'] == opponent_team_id
    if without_player_ids:
        excluded = set(without_player_ids)
        for side in SIDES:
            mask &= sides[f'{side}_player_ids'].map(excluded.isdisjoint)
    return sides[mask]


def _aggregate(sides: pd.DataFrame, keys: list[str]) -> pd.DataFrame:
    """Sum possession stats by `keys`, with one `offensive_`/`defensive_` column per stat."""
    totals = sides.groupby([*keys, 'side'])[list(SUMMED_FIELDS)].sum().unstack('side', fill_value=0)
    totals.columns = [f'{side}_{field}' for field, side in totals.columns]
    for side in SIDES:
        for field in SUMMED_FIELDS:
            if f'{side}_{field}' not in totals:
                totals[f'{side}_{field}'] = 0

    totals['total_possessions'] = totals['offensive_possessions'] + totals['defensive_possessions']
    totals['games_played'] = sides.groupby(keys)['game_id'].nunique()
    return _add_derived_metrics(totals)


def _add_derived_metrics(totals: pd.DataFrame) -> pd.DataFrame:
    def stat(side: str, field: str) -> pd.Series:
        return totals[f'{side}_{field}']

    metrics: dict[str, pd.Series] = {}
    for side in SIDES:
        for shot in ('fg', 'fg2', 'fg3'):
            metrics[f'{side}_{shot}_pct'] = _rate(stat(side, f'{shot}_made'), stat(side, f'{shot}_attempted')).fillna(0.0)

    total_seconds = totals['offensive_seconds'] + totals['defensive_seconds']
    metrics['minutes'] = total_seconds / 60
    metrics['pace'] = _rate(totals['total_possessions'] / 2, total_seconds, scale=SECONDS_PER_GAME)
    metrics['plus_minus'] = totals['offensive_points'] - totals['defensive_points']

    for side in SIDES:
        possessions = stat(side, 'possessions')
        fga = stat(side, 'fg_attempted')
        metrics[f'{side}_rating'] = _rate(stat(side, 'points'), possessions, scale=100)
        metrics[f'{side}_ft_pct'] = _rate(stat(side, 'ft_made'), stat(side, 'ft_attempted'))
        metrics[f'{side}_efg_pct'] = _rate(stat(side, 'fg_made') + 0.5 * stat(side, 'fg3_made'), fga)
        metrics[f'{side}_ts_pct'] = _rate(stat(side, 'points'), 2 * (fga + 0.44 * stat(side, 'ft_attempted')))
        metrics[f'{side}_tov_pct'] = _rate(stat(side, 'turnovers'), possessions)
        metrics[f'{side}_ft_rate'] = _rate(stat(side, 'ft_attempted'), fga)
        metrics[f'{side}_fg3_rate'] = _rate(stat(side, 'fg3_attempted'), fga)
        metrics[f'{side}_ast_pct'] = _rate(stat(side, 'assists'), stat(side, 'fg_made'))
        metrics[f'{side}_steal_pct'] = _rate(stat(side, 'steals'), possessions)
        metrics[f'{side}_block_pct'] = _rate(stat(side, 'blocks'), fga)

    metrics['net_rating'] = metrics['offensive_rating'] - metrics['defensive_rating']
    metrics['offensive_rebound_pct'] = _rate(
        totals['offensive_rebounds_offense'], totals['offensive_rebound_opportunities'],
    )
    metrics['defensive_rebound_pct'] = _rate(
        totals['defensive_rebounds_defense'], totals['defensive_rebound_opportunities'],
    )
    metrics['total_rebound_pct'] = _rate(
        totals['offensive_rebounds_offense'] + totals['defensive_rebounds_defense'],
        totals['offensive_rebound_opportunities'] + totals['defensive_rebound_opportunities'],
    )
    return totals.assign(**metrics)


def _add_on_off_metrics(lineups: pd.DataFrame, teams: pd.DataFrame) -> pd.DataFrame:
    """Compare each lineup against its own team's possessions without that lineup on the floor."""
    team_totals = teams.loc[lineups.index.get_level_values('team_id')].set_axis(lineups.index)

    def off_court(field: str) -> pd.Series:
        return team_totals[field] - lineups[field]

    off_court_offensive_rating = _rate(off_court('offensive_points'), off_court('offensive_possessions'), scale=100)
    off_court_defensive_rating = _rate(off_court('defensive_points'), off_court('defensive_possessions'), scale=100)
    off_court_net_rating = off_court_offensive_rating - off_court_defensive_rating
    return lineups.assign(
        off_court_possessions=off_court('total_possessions'),
        off_court_offensive_rating=off_court_offensive_rating,
        off_court_defensive_rating=off_court_defensive_rating,
        off_court_net_rating=off_court_net_rating,
        on_off_net_rating=lineups['net_rating'] - off_court_net_rating,
    )


def _to_records(frame: pd.DataFrame, columns: Sequence[str]) -> list[dict[str, Any]]:
    """Convert to JSON-safe records: native Python numbers, and None in place of NaN."""
    native = frame[list(columns)].astype(object)
    return native.where(native.notna(), None).to_dict('records')


def summarize_lineups(
    possessions: Iterable[Mapping[str, Any]],
    player_names: Mapping[str, str],
    team_names: Mapping[str, str],
    lineup_size: int = 5,
    team_id: str | None = None,
    opponent_team_id: str | None = None,
    player_ids: Sequence[str] = (),
    without_player_ids: Sequence[str] = (),
    min_possessions: int = 0,
    sort_by: str = DEFAULT_SORT_FIELD,
    order: str = 'desc',
    limit: int | None = None,
) -> list[LineupRecord]:
    """Aggregate possessions into n-man lineup summaries.

    Possession filters:
        team_id: only lineups from this team.
        opponent_team_id: only possessions played against this team.
        without_player_ids: only possessions where none of these players were on the floor (for either team).
    Lineup filters:
        player_ids: only lineups that include every one of these players.
        min_possessions: only lineups with at least this many total possessions.
    """
    if sort_by not in LINEUP_SORT_FIELDS:
        raise ValueError(f'Unknown sort field "{sort_by}"')

    lineup_size = _normalize_lineup_size(lineup_size)
    sides = _filter_sides(_split_by_side(possessions), team_id, opponent_team_id, without_player_ids)
    if sides.empty:
        return []

    # A lineup is keyed by its comma-joined, sorted player ids.
    lineup_sides = sides.assign(
        lineup_key=sides['on_court'].map(
            lambda on_court: [','.join(lineup) for lineup in combinations(on_court, lineup_size)],
        ),
    ).explode('lineup_key')
    if player_ids:
        required = set(player_ids)
        lineup_sides = lineup_sides[lineup_sides['lineup_key'].map(lambda key: required.issubset(key.split(',')))]
    if lineup_sides.empty:
        return []

    lineups = _add_on_off_metrics(
        _aggregate(lineup_sides, keys=['team_id', 'lineup_key']),
        _aggregate(sides, keys=['team_id']),
    ).reset_index()
    lineups = lineups[lineups['total_possessions'] >= min_possessions].copy()

    lineups['team_name'] = lineups['team_id'].map(team_names)
    lineups['player_ids'] = lineups['lineup_key'].str.split(',')
    lineups['players'] = lineups['player_ids'].map(
        lambda ids: [{'player_id': player_id, 'name': player_names.get(player_id)} for player_id in ids],
    )

    # Order by team and players first so ties in `sort_by` always come back in the same order.
    lineups = lineups.sort_values(['team_name', 'lineup_key']).sort_values(
        sort_by, ascending=order == 'asc', kind='stable', na_position='last',
    )
    if limit is not None:
        lineups = lineups.head(limit)

    columns = (
        *SUMMED_OUTPUT_FIELDS,
        'total_possessions',
        *SAMPLE_PCT_FIELDS,
        'team_id',
        'player_ids',
        'players',
        'team_name',
        'games_played',
        *DERIVED_METRIC_FIELDS,
        *ON_OFF_FIELDS,
    )
    return _to_records(lineups, columns)


def summarize_baselines(
    possessions: Iterable[Mapping[str, Any]],
    team_names: Mapping[str, str],
    opponent_team_id: str | None = None,
    without_player_ids: Sequence[str] = (),
) -> dict[str, Any]:
    """League-wide and per-team totals and metrics for the same possession filters as lineups."""
    sides = _filter_sides(_split_by_side(possessions), None, opponent_team_id, without_player_ids)
    if sides.empty:
        return {'league': None, 'teams': []}

    columns = (*SUMMED_OUTPUT_FIELDS, 'total_possessions', *SAMPLE_PCT_FIELDS, 'games_played', *DERIVED_METRIC_FIELDS)
    league = _aggregate(sides.assign(league='league'), keys=['league'])
    teams = _aggregate(sides, keys=['team_id']).reset_index()
    teams['team_name'] = teams['team_id'].map(team_names)
    teams = teams.sort_values('team_name')
    return {
        'league': _to_records(league, columns)[0],
        'teams': _to_records(teams, ('team_id', 'team_name', *columns)),
    }


def _fetch_possessions(
    game_ids: Sequence[str] = (),
    periods: Sequence[int] = (),
) -> list[dict[str, Any]]:
    queryset = Possession.objects.all()
    if game_ids:
        queryset = queryset.filter(game_id__in=game_ids)
    if periods:
        queryset = queryset.filter(period__in=periods)

    possessions = []
    for row in queryset.values(*POSSESSION_VALUE_FIELDS):
        for key in ('game_id', 'offensive_team_id', 'defensive_team_id'):
            row[key] = str(row[key])
        for key in ('offensive_player_ids', 'defensive_player_ids'):
            row[key] = [str(player_id) for player_id in row[key]]
        possessions.append(row)
    return possessions


def _get_player_names() -> dict[str, str]:
    return {str(player_id): name for player_id, name in Player.objects.values_list('id', 'name')}


def _get_team_names() -> dict[str, str]:
    return {str(team_id): name for team_id, name in Team.objects.values_list('id', 'name')}


def get_lineup_league_summary_stats(
    lineup_size: int = 5,
    team_id: str | None = None,
    opponent_team_id: str | None = None,
    player_ids: Sequence[str] = (),
    without_player_ids: Sequence[str] = (),
    game_ids: Sequence[str] = (),
    periods: Sequence[int] = (),
    min_possessions: int = 0,
    sort_by: str = DEFAULT_SORT_FIELD,
    order: str = 'desc',
    limit: int | None = None,
) -> list[LineupRecord]:
    """Return lineup summaries across the entire league."""
    return summarize_lineups(
        _fetch_possessions(game_ids, periods),
        player_names=_get_player_names(),
        team_names=_get_team_names(),
        lineup_size=lineup_size,
        team_id=team_id,
        opponent_team_id=opponent_team_id,
        player_ids=player_ids,
        without_player_ids=without_player_ids,
        min_possessions=min_possessions,
        sort_by=sort_by,
        order=order,
        limit=limit,
    )


def get_lineup_baselines(
    opponent_team_id: str | None = None,
    without_player_ids: Sequence[str] = (),
    game_ids: Sequence[str] = (),
    periods: Sequence[int] = (),
) -> dict[str, Any]:
    """Return league and team baselines to compare lineups against."""
    return summarize_baselines(
        _fetch_possessions(game_ids, periods),
        team_names=_get_team_names(),
        opponent_team_id=opponent_team_id,
        without_player_ids=without_player_ids,
    )
