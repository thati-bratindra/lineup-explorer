# -*- coding: utf-8 -*-
import logging

from rest_framework.response import Response
from rest_framework.views import APIView

from app.helpers.league import get_league_metadata

LOGGER = logging.getLogger('django')


class LeagueMetadata(APIView):
    logger = LOGGER

    def get(self, request):
        """Return the teams, players, games and periods available to filter lineups by."""
        return Response(get_league_metadata())
