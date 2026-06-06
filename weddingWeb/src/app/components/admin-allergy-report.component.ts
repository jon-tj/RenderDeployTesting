import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, signal } from '@angular/core';
import { EventInfo, WeddingApiService } from '../services/wedding-api.service';

interface AllergyGroup {
  meal: string;
  allergies: string[];
  count: number;
  guests: string[];
}

interface AllergyReport {
  place: string;
  totalAttending: number;
  groups: AllergyGroup[];
  drinkCounts: { option: string; count: number }[];
}

@Component({
  selector: 'app-admin-allergy-report',
  standalone: true,
  imports: [],
  template: `
    <article class="admin-tool">
      <h3 class="tool-title">Allergy Report</h3>
      <p class="tool-help">Aggregated dietary requirements for guests who RSVP'd yes or maybe.</p>

      <div class="actions-row">
        <select [value]="selectedPlace()" (change)="onPlaceChange($any($event.target).value)">
          @for (event of events; track event.place) {
            <option [value]="event.place">{{ event.place }}</option>
          }
        </select>
        <button type="button" class="primary" (click)="loadReport()" [disabled]="isWorking() || !selectedPlace()">
          Generate
        </button>
      </div>

      @if (report(); as r) {
        <div class="report-table-wrap">
          <table class="report-table">
            <thead>
              <tr>
                <th>Meal</th>
                <th>Restrictions</th>
                <th class="count-col">Count</th>
              </tr>
            </thead>
            <tbody>
              @for (group of r.groups; track $index) {
                <tr>
                  <td>
                    @if (group.meal) {
                      {{ group.meal }}
                    } @else {
                      <em class="muted">Not specified</em>
                    }
                  </td>
                  <td>
                    @if (group.allergies.length === 0) {
                      <em class="muted">None</em>
                    } @else {
                      <span class="chip-list">
                        @for (a of group.allergies; track a) {
                          <span class="chip">{{ a }}</span>
                        }
                      </span>
                    }
                  </td>
                  <td class="count-col">{{ group.count }}</td>
                </tr>
              }
              @if (r.groups.length === 0) {
                <tr>
                  <td colspan="3" class="muted">No attending guests yet.</td>
                </tr>
              }
              <tr class="total-row">
                <td colspan="2"><strong>Total attending</strong></td>
                <td class="count-col"><strong>{{ r.totalAttending }}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="report-table-wrap">
          <table class="report-table">
            <thead>
              <tr>
                <th>Drinks</th>
                <th class="count-col">Count</th>
              </tr>
            </thead>
            <tbody>
              @for (row of r.drinkCounts; track row.option) {
                <tr>
                  <td>{{ row.option }}</td>
                  <td class="count-col">{{ row.count }}</td>
                </tr>
              }
              <tr class="total-row">
                <td><strong>Total attending</strong></td>
                <td class="count-col"><strong>{{ r.totalAttending }}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      }
    </article>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .actions-row {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1rem;
        flex-wrap: wrap;
      }

      .actions-row select {
        flex: 1 1 200px;
        min-width: 0;
      }

      .report-table-wrap {
        overflow-x: auto;
      }

      .report-table-wrap + .report-table-wrap {
        margin-top: 1rem;
      }

      .report-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9rem;
      }

      .report-table th,
      .report-table td {
        text-align: left;
        padding: 0.6rem 0.75rem;
        border-bottom: 1px solid #e0d8c2;
        vertical-align: top;
      }

      .report-table th {
        font-family: "Montserrat", sans-serif;
        font-size: 0.72rem;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        color: #5a5347;
        background: #f3ecd6;
      }

      .total-row td {
        font-weight: 700;
        color: #2d2a24;
        border-top: 2px solid #c9b88a;
      }

      .total-row td strong {
        font-weight: 800;
      }

      .count-col {
        text-align: right;
        width: 5rem;
        font-variant-numeric: tabular-nums;
      }

      .chip-list {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 0.3rem;
      }

      .chip {
        display: inline-block;
        padding: 0.15rem 0.55rem;
        border-radius: 999px;
        background: #e5dcc1;
        color: #2d2a24;
        font-size: 0.78rem;
      }

      .muted {
        color: #8b8273;
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminAllergyReportComponent implements OnChanges {
  @Input() adminFullName = '';
  @Input() events: EventInfo[] = [];

  @Output() statusMessage = new EventEmitter<string>();

  protected readonly selectedPlace = signal<string>('');
  protected readonly isWorking = signal(false);
  protected readonly report = signal<AllergyReport | null>(null);

  constructor(private readonly api: WeddingApiService) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['events'] && !this.selectedPlace() && this.events.length > 0) {
      this.selectedPlace.set(this.events[0].place);
    }
  }

  protected onPlaceChange(place: string) {
    this.selectedPlace.set(place);
    this.report.set(null);
  }

  protected async loadReport() {
    const place = this.selectedPlace();
    if (!place || !this.adminFullName) {
      return;
    }

    this.isWorking.set(true);
    try {
      const result = await this.api.getEventAllergyReport({
        adminFullName: this.adminFullName,
        eventPlace: place
      });
      if (result === null) {
        this.statusMessage.emit('Could not load allergy report.');
        return;
      }
      this.report.set(result);
    } catch {
      this.statusMessage.emit('Unable to reach the backend API.');
    } finally {
      this.isWorking.set(false);
    }
  }
}
