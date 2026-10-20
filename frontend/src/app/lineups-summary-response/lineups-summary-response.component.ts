import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { LineupsService } from '../_services/lineups.service';

interface LineupSizeOption {
  value: number;
  label: string;
}

interface EndpointOption {
  path: string;
  label: string;
  example: string;
}

@Component({
  selector: 'lineups-summary-response-component',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './lineups-summary-response.component.html',
  styleUrl: './lineups-summary-response.component.scss',
})
export class LineupsSummaryResponseComponent implements OnInit {
  private readonly lineupsService = inject(LineupsService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly lineupSizes: LineupSizeOption[] = [
    { value: 5, label: '5 players' },
    { value: 4, label: '4 players' },
    { value: 3, label: '3 players' },
    { value: 2, label: '2 players' },
    { value: 1, label: '1 player' },
  ];

  readonly endpoints: EndpointOption[] = [
    { path: 'lineups', label: '/lineups', example: 'min_possessions=20&sort_by=net_rating&limit=10' },
    { path: 'lineups/baselines', label: '/lineups/baselines', example: 'periods=4' },
    { path: 'league', label: '/league', example: '' },
  ];

  endpointPath = 'lineups';
  leagueLineupSize = 5;
  extraQueryParams = '';
  leagueEndpoint = '';
  leagueApiResponse = '';

  get endpoint(): EndpointOption {
    return this.endpoints.find((endpoint) => endpoint.path === this.endpointPath) ?? this.endpoints[0];
  }

  ngOnInit(): void {
    this.fetchLeagueApiResponse();
  }

  changeLeagueLineupSize(): void {
    this.fetchLeagueApiResponse();
  }

  changeEndpoint(): void {
    this.extraQueryParams = '';
    this.fetchLeagueApiResponse();
  }

  fetchLeagueApiResponse(): void {
    const queryParams: Record<string, string | number> = Object.fromEntries(
      new URLSearchParams(this.extraQueryParams.replace(/^\?/, '')),
    );
    const request = this.endpointPath === 'lineups'
      ? this.lineupsService.getLineupsLeagueSummary(this.leagueLineupSize, queryParams)
      : this.lineupsService.getEndpointResponse(this.endpointPath, queryParams);

    request.subscribe({
      next: (data) => {
        this.leagueEndpoint = data.endpoint;
        this.leagueApiResponse = JSON.stringify(data.apiResponse, null, 2);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.leagueEndpoint = 'error';
        this.leagueApiResponse = JSON.stringify(err, null, 2);
        this.cdr.detectChanges();
      },
    });
  }
}
