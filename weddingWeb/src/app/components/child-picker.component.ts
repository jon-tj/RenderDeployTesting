import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HubApi } from '../services/hub-api.service';
import { EventSummary, EventType } from '../models';

@Component({
  selector: 'app-child-picker',
  imports: [FormsModule],
  template: `
    <div class="picker">
      <input
        type="search"
        placeholder="Search your other events by title…"
        [(ngModel)]="query"
        name="q"
        (input)="onQueryChanged()"
      />
      @if (results().length) {
        <ul class="results">
          @for (e of results(); track e.id) {
            <li>
              <button type="button" class="pick" (click)="attach(e)" [disabled]="busy()">
                <strong>{{ e.title }}</strong>
                <span class="muted"> · {{ formatDate(e.startUtc) }}</span>
              </button>
            </li>
          }
        </ul>
      } @else if (searched()) {
        <p class="muted">No matching events.</p>
      }

      <div class="create">
        <p class="muted">Or create a new child event:</p>
        <div class="row">
          <input
            placeholder="Title"
            [(ngModel)]="newTitle"
            name="title"
          />
          <button type="button" (click)="createChild()" [disabled]="busy() || !newTitle.trim()">
            {{ busy() ? 'Working…' : 'Create' }}
          </button>
        </div>
        @if (error()) { <p class="error">{{ error() }}</p> }
      </div>
    </div>
  `,
  styles: [`
    .picker { display:flex; flex-direction:column; gap:.5rem; }
    ul.results { list-style:none; margin:0; padding:.25rem; display:flex; flex-direction:column; gap:.15rem; background:var(--bg); border-radius:var(--r); }
    button.pick { display:block; width:100%; text-align:left; padding:.4rem .55rem; background:transparent; border:0; border-radius:.3rem; cursor:pointer; font:inherit; }
    button.pick:hover { background:var(--accent-soft); }
    button.pick:disabled { opacity:.6; cursor:wait; }
    .create { background:var(--bg); padding:.6rem .75rem; border-radius:var(--r); display:flex; flex-direction:column; gap:.5rem; }
    .row { display:grid; grid-template-columns:1fr auto; gap:.5rem; }
    .row button { padding:.5rem .8rem; background:var(--accent); color:var(--accent-ink); border:0; border-radius:var(--r); cursor:pointer; font:inherit; }
    .row button[disabled] { opacity:.6; cursor:wait; }
  `],
})
export class ChildPickerComponent {
  private readonly api = inject(HubApi);

  readonly parentId = input.required<number>();
  readonly parentType = input<EventType | null>(null);
  readonly added = output<EventSummary>();

  protected query = '';
  protected newTitle = '';
  protected readonly results = signal<EventSummary[]>([]);
  protected readonly searched = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  private debounce: ReturnType<typeof setTimeout> | null = null;

  onQueryChanged(): void {
    if (this.debounce) clearTimeout(this.debounce);
    const q = this.query.trim();
    if (q.length < 1) {
      this.results.set([]);
      this.searched.set(false);
      return;
    }
    this.debounce = setTimeout(async () => {
      try {
        const r = await this.api.searchChildCandidates(this.parentId(), q);
        this.results.set(r);
        this.searched.set(true);
      } catch {
        this.results.set([]);
      }
    }, 250);
  }

  async attach(e: EventSummary): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    try {
      await this.api.updateEvent(e.id, { parentEventId: this.parentId() });
      this.added.emit(e);
      this.reset();
    } catch (err: any) {
      this.error.set(err?.error ?? 'Could not attach event.');
    } finally {
      this.busy.set(false);
    }
  }

  async createChild(): Promise<void> {
    this.error.set('');
    const title = this.newTitle.trim();
    if (!title) return;
    this.busy.set(true);
    try {
      const created = await this.api.createEvent({ title, parentEventId: this.parentId(), type: this.parentType() ?? undefined });
      const summary: EventSummary = {
        id: created.id,
        type: created.type,
        title: created.title,
        startUtc: created.startUtc,
        endUtc: created.endUtc,
        location: created.location,
        isOwner: created.isOwner,
        iconImageId: created.images.find(i => i.role === 'Icon')?.id ?? null,
      };
      this.added.emit(summary);
      this.reset();
    } catch (err: any) {
      this.error.set(err?.error ?? 'Could not create child event.');
    } finally {
      this.busy.set(false);
    }
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  private reset(): void {
    this.query = '';
    this.newTitle = '';
    this.results.set([]);
    this.searched.set(false);
  }
}
