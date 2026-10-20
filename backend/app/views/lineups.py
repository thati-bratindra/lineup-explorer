# -*- coding: utf-8 -*-
import logging
import uuid

from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from app.helpers.lineups import (
    DEFAULT_SORT_FIELD,
    LINEUP_SORT_FIELDS,
    get_lineup_baselines,
    get_lineup_league_summary_stats,
)

LOGGER = logging.getLogger('django')


def _parse_int_query_param(request, key, default, minimum=None, maximum=None):
    """Parse an int query param with optional bounds."""
    raw_value = request.query_params.get(key, default)
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        value = default

    if minimum is not None and value is not None:
        value = max(minimum, value)
    if maximum is not None and value is not None:
        value = min(maximum, value)
    return value


def _parse_list_query_param(request, key):
    """Parse a list param given as comma-separated values and/or repeated keys."""
    return [
        value.strip()
        for raw_value in request.query_params.getlist(key)
        for value in raw_value.split(',')
        if value.strip()
    ]


def _parse_uuid_list_query_param(request, key):
    values = _parse_list_query_param(request, key)
    try:
        return tuple(str(uuid.UUID(value)) for value in values)
    except ValueError:
        raise ValidationError({key: 'Expected a comma-separated list of ids.'})


def _parse_uuid_query_param(request, key):
    values = _parse_uuid_list_query_param(request, key)
    if len(values) > 1:
        raise ValidationError({key: 'Expected a single id.'})
    return values[0] if values else None


def _parse_int_list_query_param(request, key):
    values = _parse_list_query_param(request, key)
    try:
        return tuple(int(value) for value in values)
    except ValueError:
        raise ValidationError({key: 'Expected a comma-separated list of integers.'})


def _parse_choice_query_param(request, key, choices, default):
    value = request.query_params.get(key, default)
    if value not in choices:
        raise ValidationError({key: f'Expected one of: {", ".join(choices)}.'})
    return value


def _get_possession_filter_options(request):
    """Filters that restrict which possessions are counted, shared by lineups and baselines."""
    return {
        'opponent_team_id': _parse_uuid_query_param(request, 'opponent_team_id'),
        'without_player_ids': _parse_uuid_list_query_param(request, 'without_player_ids'),
        'game_ids': _parse_uuid_list_query_param(request, 'game_ids'),
        'periods': _parse_int_list_query_param(request, 'periods'),
    }


def _get_lineup_query_options(request):
    return {
        'lineup_size': _parse_int_query_param(
            request,
            key='lineup_size',
            default=5,
            minimum=1,
            maximum=5,
        ),
        'team_id': _parse_uuid_query_param(request, 'team_id'),
        'player_ids': _parse_uuid_list_query_param(request, 'player_ids'),
        'min_possessions': _parse_int_query_param(request, key='min_possessions', default=0, minimum=0),
        'sort_by': _parse_choice_query_param(request, 'sort_by', LINEUP_SORT_FIELDS, DEFAULT_SORT_FIELD),
        'order': _parse_choice_query_param(request, 'order', ('asc', 'desc'), 'desc'),
        'limit': _parse_int_query_param(request, key='limit', default=None, minimum=1),
        **_get_possession_filter_options(request),
    }


class LineupsLeagueSummary(APIView):
    logger = LOGGER

    def get(self, request):
        """Return the league-wide lineup summary."""
        query_options = _get_lineup_query_options(request)
        return Response(get_lineup_league_summary_stats(**query_options))


class LineupsBaselines(APIView):
    logger = LOGGER

    def get(self, request):
        """Return league and team baselines for the same possession filters as the lineup summary."""
        query_options = _get_possession_filter_options(request)
        return Response(get_lineup_baselines(**query_options))
