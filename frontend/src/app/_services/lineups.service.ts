import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import {
  LeagueMetadata,
  LineupBaselines,
  LineupQuery,
  LineupRecord,
  PossessionFilters,
} from '../_models/lineups.models';
import { BaseService } from './base.service';

type QueryParams = Record<string, string | number>;

@Injectable({ providedIn: 'root' })
export class LineupsService extends BaseService {
  constructor(protected override http: HttpClient) {
    super(http);
  }

  private buildQueryParams(queryParams: QueryParams): HttpParams {
    return Object.entries(queryParams).reduce(
      (params, [key, value]) => params.set(key, String(value)),
      new HttpParams(),
    );
  }

  private buildDisplayedEndpointWithParams(endpoint: string, queryParams: QueryParams): string {
    const queryString = new URLSearchParams(
      Object.entries(queryParams).map(([key, value]) => [key, String(value)]),
    ).toString();
    return queryString ? `${endpoint}?${queryString}` : endpoint;
  }

  /** Drop empty filters so the API only sees the ones that are set. */
  private possessionFilterParams(filters: PossessionFilters): QueryParams {
    const params: QueryParams = {};
    if (filters.opponentTeamId) {
      params['opponent_team_id'] = filters.opponentTeamId;
    }
    if (filters.withoutPlayerIds.length) {
      params['without_player_ids'] = filters.withoutPlayerIds.join(',');
    }
    if (filters.gameIds.length) {
      params['game_ids'] = filters.gameIds.join(',');
    }
    if (filters.periods.length) {
      params['periods'] = filters.periods.join(',');
    }
    return params;
  }

  getLineupsLeagueSummary(
    lineupSize: number = 5,
    extraQueryParams: QueryParams = {},
  ): Observable<{
    endpoint: string;
    apiResponse: unknown;
  }> {
    return this.getEndpointResponse('lineups', { lineup_size: lineupSize, ...extraQueryParams });
  }

  /** Fetch any API endpoint along with the URL it was called with, for the response inspector. */
  getEndpointResponse(
    path: string,
    queryParams: QueryParams = {},
  ): Observable<{
    endpoint: string;
    apiResponse: unknown;
  }> {
    const endpoint = `${this.baseUrl}/${path}`;
    const params = this.buildQueryParams(queryParams);
    const displayedEndpointWithParams = this.buildDisplayedEndpointWithParams(endpoint, queryParams);

    return this.get(endpoint, params).pipe(
      map((data) => ({
        endpoint: displayedEndpointWithParams,
        apiResponse: data,
      })),
    );
  }

  getLineups(query: LineupQuery): Observable<LineupRecord[]> {
    const queryParams: QueryParams = {
      lineup_size: query.lineupSize,
      min_possessions: query.minPossessions,
      ...this.possessionFilterParams(query),
    };
    if (query.teamId) {
      queryParams['team_id'] = query.teamId;
    }
    if (query.playerIds.length) {
      queryParams['player_ids'] = query.playerIds.join(',');
    }
    return this.get(`${this.baseUrl}/lineups`, this.buildQueryParams(queryParams)) as Observable<LineupRecord[]>;
  }

  getBaselines(filters: PossessionFilters): Observable<LineupBaselines> {
    const params = this.buildQueryParams(this.possessionFilterParams(filters));
    return this.get(`${this.baseUrl}/lineups/baselines`, params) as Observable<LineupBaselines>;
  }

  getLeague(): Observable<LeagueMetadata> {
    return this.get(`${this.baseUrl}/league`) as Observable<LeagueMetadata>;
  }
}
