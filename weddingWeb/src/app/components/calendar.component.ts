import { Component, computed, input, output, signal } from '@angular/core';
import { EventSummary } from '../models';
import { EventImageComponent } from './event-image.component';

interface DayCell {
  date: Date;
  inMonth: boolean;
  events: EventSummary[];
}

@Component({
  selector: 'app-calendar',
  imports: [EventImageComponent],
  template: `
    <div class="cal">
      <header>
        <button type="button" (click)="shift(-1)">‹</button>
        <h2>{{ monthLabel() }}</h2>
        <button type="button" (click)="shift(1)">›</button>
      </header>

      <div class="grid head">
        @for (d of weekdayLabels; track d) {
          <div class="dow">{{ d }}</div>
        }
      </div>

      <div class="grid body">
        @for (cell of cells(); track cell.date.getTime()) {
          <button
            type="button"
            class="day"
            [class.muted]="!cell.inMonth"
            [class.today]="isToday(cell.date)"
            (click)="onDayClick(cell.date)"
          >
            <span class="num">{{ cell.date.getDate() }}</span>
            @for (e of cell.events; track e.id) {
              <span
                class="evt"
                [class.wedding]="e.type === 'Wedding'"
                (click)="onEventClick($event, e)"
              >
                @if (e.iconImageId !== null) {
                  <app-event-image class="evt-icon" [eventId]="e.id" [imageId]="e.iconImageId" [alt]="''" />
                }
                <span class="evt-title">{{ e.title }}</span>
              </span>
            }
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    .cal { background:#fff; border:1px solid #e6e1d4; border-radius:.6rem; padding:1rem; }
    header { display:flex; align-items:center; gap:1rem; margin-bottom:.75rem; }
    header h2 { flex:1; text-align:center; margin:0; }
    header button { background:#fff; border:1px solid #d8cfb8; width:2rem; height:2rem; border-radius:.4rem; cursor:pointer; }
    .grid { display:grid; grid-template-columns:repeat(7,1fr); gap:2px; }
    .head .dow { text-align:center; font-size:.8rem; color:#8b8273; padding:.25rem; }
    .day { display:flex; flex-direction:column; gap:.15rem; min-height:96px; padding:.3rem; background:#faf7f0; border:1px solid transparent; border-radius:.35rem; text-align:left; cursor:pointer; font:inherit; }
    .day:hover { border-color:#c9b88a; }
    .day.muted { opacity:.45; }
    .day.today .num { background:#6f7a5b; color:#faf5ea; border-radius:50%; padding:.1rem .35rem; }
    .num { font-size:.85rem; color:#5a5347; align-self:flex-start; }
    .evt { display:flex; align-items:center; gap:.25rem; background:#dfe6cf; color:#2d2a24; font-size:.75rem; padding:.1rem .35rem; border-radius:.25rem; white-space:nowrap; overflow:hidden; }
    .evt.wedding { background:#f1e0c2; }
    .evt:hover { filter:brightness(.95); }
    .evt-title { overflow:hidden; text-overflow:ellipsis; }
    .evt-icon { width:14px; height:14px; flex:0 0 14px; border-radius:2px; overflow:hidden; background:rgba(255,255,255,.5); }
    .evt-icon ::ng-deep img { width:100%; height:100%; object-fit:cover; }
  `],
})
export class CalendarComponent {
  readonly events = input<EventSummary[]>([]);
  readonly dayClick = output<Date>();
  readonly eventClick = output<EventSummary>();

  protected readonly weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  protected readonly cursor = signal<Date>(startOfMonth(new Date()));

  protected readonly monthLabel = computed(() =>
    this.cursor().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  );

  // 6 rows × 7 cols grid covering the visible month, padded with surrounding days.
  protected readonly cells = computed<DayCell[]>(() => {
    const month = this.cursor();
    const first = startOfMonth(month);
    const offset = (first.getDay() + 6) % 7; // shift so Monday = 0
    const start = new Date(first);
    start.setDate(first.getDate() - offset);

    const byDay = bucketByDay(this.events());

    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return {
        date,
        inMonth: date.getMonth() === month.getMonth(),
        events: byDay.get(keyOf(date)) ?? [],
      };
    });
  });

  shift(delta: number): void {
    const c = new Date(this.cursor());
    c.setMonth(c.getMonth() + delta);
    this.cursor.set(startOfMonth(c));
  }

  protected isToday(d: Date): boolean {
    const t = new Date();
    return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
  }

  protected onDayClick(d: Date): void {
    this.dayClick.emit(d);
  }

  protected onEventClick(ev: MouseEvent, e: EventSummary): void {
    ev.stopPropagation();
    this.eventClick.emit(e);
  }
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function bucketByDay(events: EventSummary[]): Map<string, EventSummary[]> {
  const out = new Map<string, EventSummary[]>();
  for (const e of events) {
    const d = new Date(e.startUtc);
    const k = keyOf(d);
    const list = out.get(k) ?? [];
    list.push(e);
    out.set(k, list);
  }
  return out;
}
