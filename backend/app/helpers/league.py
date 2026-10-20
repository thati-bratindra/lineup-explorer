"""Helpers for the league metadata API: the teams, players, games and periods to filter by."""
from __future__ import annotations

from collections import defaultdict
from typing import Any

from app.dbmodels.models import Game, Player, Possession, Team


def get_league_metadata() -> dict[str, Any]:
    """Return teams (with the players who logged a possession), games and periods."""
    team_ids_by_game = defaultdict(set)
    player_ids_on_court = set()
    periods = set()
    possessions = Possession.objects.values_list(
        'game_id', 'offensive_team_id', 'defensive_team_id', 'offensive_player_ids', 'defensive_player_ids', 'period',
    )
    for game_id, offensive_team_id, defensive_team_id, offensive_player_ids, defensive_player_ids, period in possessions:
        team_ids_by_game[game_id].update((str(offensive_team_id), str(defensive_team_id)))
        player_ids_on_court.update(offensive_player_ids, defensive_player_ids)
        periods.add(period)

    players_by_team = defaultdict(list)
    for player in Player.objects.filter(id__in=player_ids_on_court).order_by('name'):
        players_by_team[player.team_id].append({'player_id': str(player.id), 'name': player.name})

    return {
        'teams': [
            {'team_id': str(team.id), 'name': team.name, 'players': players_by_team[team.id]}
            for team in Team.objects.order_by('name')
        ],
        'games': [
            {'game_id': str(game.id), 'date': game.date, 'team_ids': sorted(team_ids_by_game[game.id])}
            for game in Game.objects.order_by('date')
            if game.id in team_ids_by_game
        ],
        'periods': sorted(periods),
    }
