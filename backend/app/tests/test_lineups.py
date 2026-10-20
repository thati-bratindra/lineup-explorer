import json
from collections import Counter, defaultdict
from itertools import combinations
from pathlib import Path

from django.test import SimpleTestCase, TestCase

from app.dbmodels.models import Game, Player, Possession, Team
from app.helpers.lineups import COUNTING_STAT_FIELDS, summarize_baselines, summarize_lineups

BACKEND_DIR = Path(__file__).resolve().parents[2]
SAMPLE_SUMMARY_DATA_PATH = BACKEND_DIR / 'app' / 'helpers' / 'sample_summary_data' / 'sample_summary_data.json'
RAW_DATA_DIR = BACKEND_DIR / 'raw_data'

HOME = '00000000-0000-0000-0000-00000000000a'
AWAY = '00000000-0000-0000-0000-00000000000b'
THIRD = '00000000-0000-0000-0000-00000000000c'
GAME_1 = '00000000-0000-0000-0000-000000000101'
GAME_2 = '00000000-0000-0000-0000-000000000102'


TEAM_NAMES = {HOME: 'Home', AWAY: 'Away', THIRD: 'Third'}


def _player_ids(team_id, numbers):
    return [f'00000000-0000-0000-000{team_id[-1]}-00000000000{number}' for number in numbers]


HOME_STARTERS = _player_ids(HOME, range(1, 6))
HOME_BENCH = _player_ids(HOME, range(2, 7))  # swaps player 1 for player 6
AWAY_STARTERS = _player_ids(AWAY, range(1, 6))
THIRD_STARTERS = _player_ids(THIRD, range(1, 6))

PLAYER_TEAMS = {
    player_id: team_id
    for team_id, player_ids in ((HOME, HOME_STARTERS + HOME_BENCH), (AWAY, AWAY_STARTERS), (THIRD, THIRD_STARTERS))
    for player_id in player_ids
}
PLAYER_NAMES = {
    player_id: f'{TEAM_NAMES[team_id]} {player_id[-1]}' for player_id, team_id in PLAYER_TEAMS.items()
}


def _possession(offense=HOME, defense=AWAY, offensive_players=HOME_STARTERS, defensive_players=AWAY_STARTERS,
                game_id=GAME_1, period=1, seconds=12.0, **stats):
    possession = {field: 0 for field in COUNTING_STAT_FIELDS}
    possession.update(
        game_id=game_id,
        period=period,
        seconds=seconds,
        offensive_team_id=offense,
        defensive_team_id=defense,
        offensive_player_ids=list(offensive_players),
        defensive_player_ids=list(defensive_players),
    )
    possession.update(stats)
    return possession


def _made_three(**kwargs):
    return _possession(points=3, shot_attempts=1, fg3_made=1, fg3_attempted=1, fg_made=1, fg_attempted=1,
                       shot_attempt_points=3, assists=1, **kwargs)


def _missed_two_offensive_rebound_then_and_one(**kwargs):
    return _possession(points=3, shot_attempts=2, fg2_made=1, fg2_attempted=2, fg_made=1, fg_attempted=2,
                       ft_made=1, ft_attempted=1, rebounds_offense=1, rebound_opportunities=1,
                       shooting_fouls=1, defensive_fouls=1, shot_attempt_points=3, ft_potential_points=1, **kwargs)


def _turnover(**kwargs):
    return _possession(turnovers=1, steals=1, **kwargs)


def _missed_three_defensive_rebound(**kwargs):
    return _possession(shot_attempts=1, fg3_attempted=1, fg_attempted=1, rebounds_defense=1,
                       rebound_opportunities=1, **kwargs)


def _away_possession(builder, **kwargs):
    return builder(offense=AWAY, defense=HOME, offensive_players=AWAY_STARTERS,
                   defensive_players=kwargs.pop('home_players', HOME_STARTERS), **kwargs)


def _summarize(possessions, **kwargs):
    return summarize_lineups(possessions, PLAYER_NAMES, TEAM_NAMES, **kwargs)


def _find(lineups, player_ids):
    return next(lineup for lineup in lineups if lineup['player_ids'] == sorted(player_ids))


class SummarizeLineupsTests(SimpleTestCase):
    def setUp(self):
        self.possessions = [
            _made_three(),
            _missed_two_offensive_rebound_then_and_one(),
            _away_possession(_turnover),
            _away_possession(_missed_three_defensive_rebound),
            _made_three(offensive_players=HOME_BENCH, seconds=6.0),
            _away_possession(_made_three, home_players=HOME_BENCH, seconds=18.0),
        ]

    def test_response_follows_sample_structure(self):
        with open(SAMPLE_SUMMARY_DATA_PATH) as sample_file:
            sample_keys = list(json.load(sample_file)[0])

        lineup = _summarize(self.possessions)[0]

        self.assertEqual(list(lineup)[:len(sample_keys)], sample_keys)
        self.assertEqual(lineup['players'][0], {'player_id': lineup['player_ids'][0], 'name': PLAYER_NAMES[lineup['player_ids'][0]]})

    def test_sums_offensive_and_defensive_possessions_for_each_side(self):
        starters = _find(_summarize(self.possessions), HOME_STARTERS)

        self.assertEqual(starters['team_id'], HOME)
        self.assertEqual(starters['team_name'], 'Home')
        self.assertEqual(starters['offensive_possessions'], 2)
        self.assertEqual(starters['offensive_points'], 6)
        self.assertEqual(starters['offensive_fg_made'], 2)
        self.assertEqual(starters['offensive_fg_attempted'], 3)
        self.assertEqual(starters['offensive_rebounds_offense'], 1)
        self.assertEqual(starters['offensive_defensive_fouls'], 1)
        self.assertEqual(starters['defensive_possessions'], 2)
        self.assertEqual(starters['defensive_points'], 0)
        self.assertEqual(starters['defensive_steals'], 1)
        self.assertEqual(starters['defensive_rebounds_defense'], 1)
        self.assertEqual(starters['total_possessions'], 4)
        self.assertEqual(starters['offensive_fg_pct'], 2 / 3)
        self.assertEqual(starters['offensive_fg3_pct'], 1.0)
        self.assertEqual(starters['defensive_fg_pct'], 0.0)

    def test_derived_metrics(self):
        starters = _find(_summarize(self.possessions), HOME_STARTERS)

        self.assertEqual(starters['offensive_rating'], 300.0)
        self.assertEqual(starters['defensive_rating'], 0.0)
        self.assertEqual(starters['net_rating'], 300.0)
        self.assertEqual(starters['plus_minus'], 6)
        self.assertEqual(starters['minutes'], 48 / 60)
        self.assertEqual(starters['pace'], 2880 * 2 / 48)
        self.assertEqual(starters['games_played'], 1)
        self.assertAlmostEqual(starters['offensive_efg_pct'], (2 + 0.5) / 3)
        self.assertAlmostEqual(starters['offensive_ts_pct'], 6 / (2 * (3 + 0.44)))
        self.assertEqual(starters['offensive_ft_rate'], 1 / 3)
        self.assertEqual(starters['offensive_rebound_pct'], 1.0)
        self.assertEqual(starters['defensive_rebound_pct'], 1.0)
        self.assertEqual(starters['defensive_tov_pct'], 0.5)
        self.assertEqual(starters['defensive_steal_pct'], 0.5)
        self.assertEqual(starters['offensive_ast_pct'], 0.5)

    def test_rates_without_a_denominator_are_null_but_sample_percentages_are_zero(self):
        lineup = _find(_summarize([_turnover()]), HOME_STARTERS)

        self.assertEqual(lineup['offensive_fg_pct'], 0)
        self.assertIsNone(lineup['offensive_efg_pct'])
        self.assertIsNone(lineup['offensive_rebound_pct'])
        self.assertIsNone(lineup['defensive_rating'])
        self.assertIsNone(lineup['net_rating'])

    def test_on_off_compares_against_the_rest_of_the_team(self):
        lineups = _summarize(self.possessions)
        starters = _find(lineups, HOME_STARTERS)
        bench = _find(lineups, HOME_BENCH)

        # With the starters off the floor, the bench scored 3 on 1 possession and allowed 3 on 1.
        self.assertEqual(starters['off_court_possessions'], 2)
        self.assertEqual(starters['off_court_offensive_rating'], 300.0)
        self.assertEqual(starters['off_court_defensive_rating'], 300.0)
        self.assertEqual(starters['off_court_net_rating'], 0.0)
        self.assertEqual(starters['on_off_net_rating'], 300.0)
        self.assertEqual(bench['on_off_net_rating'], 0.0 - 300.0)

    def test_smaller_lineups_include_every_combination_of_players_on_the_floor(self):
        pairs = _summarize(self.possessions, lineup_size=2, team_id=HOME)

        # 10 pairs among the starters plus 4 pairs of player 6 with starters 2-5.
        self.assertEqual(len(pairs), 14)
        shared_pair = _find(pairs, HOME_STARTERS[1:3])
        self.assertEqual(shared_pair['total_possessions'], 6)
        self.assertEqual(shared_pair['offensive_points'], 9)
        self.assertEqual(len(shared_pair['players']), 2)

    def test_single_players_have_on_off_splits(self):
        players = _summarize(self.possessions, lineup_size=1, team_id=HOME)

        player_one = _find(players, [HOME_STARTERS[0]])
        self.assertEqual(player_one['total_possessions'], 4)
        self.assertEqual(player_one['off_court_possessions'], 2)
        player_two = _find(players, [HOME_STARTERS[1]])
        self.assertEqual(player_two['off_court_possessions'], 0)
        self.assertIsNone(player_two['on_off_net_rating'])

    def test_filters_by_team_and_opponent(self):
        possessions = [*self.possessions, _made_three(defense=THIRD, defensive_players=THIRD_STARTERS)]

        self.assertEqual({lineup['team_id'] for lineup in _summarize(possessions, team_id=AWAY)}, {AWAY})
        versus_third = _summarize(possessions, opponent_team_id=THIRD)
        self.assertEqual(len(versus_third), 1)
        self.assertEqual(versus_third[0]['player_ids'], HOME_STARTERS)
        self.assertEqual(versus_third[0]['total_possessions'], 1)

    def test_filters_to_lineups_including_players(self):
        lineups = _summarize(self.possessions, lineup_size=3, player_ids=[HOME_STARTERS[0], HOME_STARTERS[1]])

        self.assertEqual(len(lineups), 3)
        for lineup in lineups:
            self.assertTrue({HOME_STARTERS[0], HOME_STARTERS[1]} <= set(lineup['player_ids']))

    def test_filters_out_possessions_with_players_on_the_floor(self):
        lineups = _summarize(self.possessions, lineup_size=2, without_player_ids=[HOME_STARTERS[0]])

        # Only the two bench possessions remain, for both the home and away lineups.
        self.assertEqual({lineup['team_id'] for lineup in lineups}, {HOME, AWAY})
        self.assertEqual({lineup['total_possessions'] for lineup in lineups}, {2})
        self.assertFalse(any(HOME_STARTERS[0] in lineup['player_ids'] for lineup in lineups))

    def test_min_possessions_sort_order_and_limit(self):
        lineups = _summarize(self.possessions, min_possessions=3)
        self.assertEqual([lineup['total_possessions'] for lineup in lineups], [6, 4])

        by_net_rating = _summarize(self.possessions, sort_by='net_rating', order='asc')
        net_ratings = [lineup['net_rating'] for lineup in by_net_rating]
        self.assertEqual(net_ratings, sorted(net_ratings))

        self.assertEqual(len(_summarize(self.possessions, limit=1)), 1)

    def test_ties_are_returned_in_a_consistent_order(self):
        first = _summarize(self.possessions, sort_by='games_played')
        second = _summarize(list(reversed(self.possessions)), sort_by='games_played')

        self.assertEqual([lineup['player_ids'] for lineup in first], [lineup['player_ids'] for lineup in second])

    def test_rejects_unknown_sort_field(self):
        with self.assertRaises(ValueError):
            _summarize(self.possessions, sort_by='team_id')

    def test_returns_empty_list_when_nothing_matches(self):
        self.assertEqual(_summarize([]), [])
        self.assertEqual(_summarize(self.possessions, team_id=THIRD), [])
        self.assertEqual(_summarize(self.possessions, lineup_size=1, player_ids=HOME_STARTERS[:2]), [])


class SummarizeBaselinesTests(SimpleTestCase):
    def test_league_and_team_baselines(self):
        possessions = [_made_three(), _away_possession(_turnover), _away_possession(_made_three, game_id=GAME_2)]

        baselines = summarize_baselines(possessions, TEAM_NAMES)

        league = baselines['league']
        self.assertEqual(league['offensive_possessions'], 3)
        self.assertEqual(league['offensive_rating'], league['defensive_rating'])
        self.assertEqual(league['games_played'], 2)
        self.assertEqual([team['team_name'] for team in baselines['teams']], ['Away', 'Home'])
        home = baselines['teams'][1]
        self.assertEqual(home['offensive_rating'], 300.0)
        self.assertEqual(home['defensive_rating'], 150.0)

    def test_empty_baselines(self):
        self.assertEqual(summarize_baselines([], TEAM_NAMES), {'league': None, 'teams': []})


class RawDataCrossCheckTests(SimpleTestCase):
    """Compare against a straightforward re-implementation over the full raw data set."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with open(RAW_DATA_DIR / 'possessions.json') as possessions_file:
            cls.possessions = json.load(possessions_file)

    def _brute_force_totals(self, lineup_size):
        totals = defaultdict(Counter)
        for possession in self.possessions:
            for side in ('offensive', 'defensive'):
                for lineup in combinations(sorted(possession[f'{side}_player_ids']), lineup_size):
                    totals[lineup][f'{side}_possessions'] += 1
                    for field in COUNTING_STAT_FIELDS:
                        totals[lineup][f'{side}_{field}'] += possession[field]
        return totals

    def test_matches_brute_force_totals(self):
        for lineup_size in (5, 2):
            with self.subTest(lineup_size=lineup_size):
                expected = self._brute_force_totals(lineup_size)
                lineups = summarize_lineups(self.possessions, {}, {}, lineup_size=lineup_size)

                self.assertEqual(len(lineups), len(expected))
                for lineup in lineups:
                    expected_totals = expected[tuple(lineup['player_ids'])]
                    for field, value in expected_totals.items():
                        self.assertEqual(lineup[field], value, field)


class LineupsApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        for team_id, name in TEAM_NAMES.items():
            Team.objects.create(id=team_id, name=name)
        for player_id, team_id in PLAYER_TEAMS.items():
            Player.objects.create(id=player_id, name=PLAYER_NAMES[player_id], team_id=team_id)
        Game.objects.create(id=GAME_1, date='2025-10-22')
        Game.objects.create(id=GAME_2, date='2025-10-23')
        Game.objects.create(id='00000000-0000-0000-0000-000000000103', date='2025-10-24')

        possessions = [
            _made_three(),
            _away_possession(_turnover),
            _made_three(game_id=GAME_2, period=4, offensive_players=HOME_BENCH),
            _away_possession(_made_three, game_id=GAME_2, period=4, home_players=HOME_BENCH),
        ]
        for number, possession in enumerate(possessions):
            Possession.objects.create(id=f'00000000-0000-0000-0000-00000000100{number}', **possession)

    def test_default_returns_five_man_lineups(self):
        response = self.client.get('/api/v1/lineups')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 3)
        self.assertEqual({len(lineup['player_ids']) for lineup in response.json()}, {5})

    def test_lineup_size_is_clamped(self):
        self.assertEqual({len(lineup['players']) for lineup in self.client.get('/api/v1/lineups?lineup_size=9').json()}, {5})
        self.assertEqual({len(lineup['players']) for lineup in self.client.get('/api/v1/lineups?lineup_size=0').json()}, {1})

    def test_filters_by_game_and_period(self):
        by_game = self.client.get(f'/api/v1/lineups?game_ids={GAME_2}').json()
        by_period = self.client.get('/api/v1/lineups?periods=4').json()

        self.assertEqual({tuple(lineup['player_ids']) for lineup in by_game}, {tuple(HOME_BENCH), tuple(AWAY_STARTERS)})
        self.assertEqual(by_game, by_period)

    def test_accepts_repeated_and_comma_separated_list_params(self):
        repeated = self.client.get(f'/api/v1/lineups?lineup_size=3&player_ids={HOME_STARTERS[1]}&player_ids={HOME_STARTERS[2]}')
        comma_separated = self.client.get(f'/api/v1/lineups?lineup_size=3&player_ids={HOME_STARTERS[1]},{HOME_STARTERS[2]}')

        self.assertEqual(repeated.json(), comma_separated.json())
        self.assertEqual(len(repeated.json()), 4)

    def test_sort_and_limit(self):
        lineups = self.client.get('/api/v1/lineups?sort_by=net_rating&order=asc&limit=2').json()

        self.assertEqual(len(lineups), 2)
        self.assertLessEqual(lineups[0]['net_rating'], lineups[1]['net_rating'])

    def test_invalid_params_return_400(self):
        for query in ('team_id=not-a-uuid', 'periods=fourth', 'sort_by=players', 'order=up', f'team_id={HOME},{AWAY}'):
            with self.subTest(query=query):
                self.assertEqual(self.client.get(f'/api/v1/lineups?{query}').status_code, 400)

    def test_baselines(self):
        response = self.client.get(f'/api/v1/lineups/baselines?opponent_team_id={AWAY}')

        # Only the home team's two offensive and two defensive possessions came against the away team.
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['league']['total_possessions'], 4)
        self.assertEqual([team['team_name'] for team in response.json()['teams']], ['Home'])

    def test_league_metadata(self):
        league = self.client.get('/api/v1/league').json()

        self.assertEqual([team['name'] for team in league['teams']], ['Away', 'Home', 'Third'])
        home = league['teams'][1]
        self.assertEqual(len(home['players']), 6)
        self.assertEqual(league['teams'][2]['players'], [])
        self.assertEqual([game['game_id'] for game in league['games']], [GAME_1, GAME_2])
        self.assertEqual(league['games'][0]['team_ids'], sorted([HOME, AWAY]))
        self.assertEqual(league['periods'], [1, 4])
