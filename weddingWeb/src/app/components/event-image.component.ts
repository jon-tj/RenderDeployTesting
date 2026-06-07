import { Component, OnChanges, computed, inject, input, output, signal } from '@angular/core';
import { HubApi } from '../services/hub-api.service';

// Loads event image bytes via the auth-aware HttpClient and renders them
// through an object URL so the <img> tag picks up bearer-authenticated data.
// Re-fetches when the input ids change and releases the URL on destroy.
@Component({
  selector: 'app-event-image',
  imports: [],
  template: `
    @if (objectUrl(); as url) {
      <img [src]="url" [alt]="alt()" [title]="alt()" [class]="imgClass()" (load)="loaded.emit()" />
    } @else if (loading()) {
      <span class="placeholder">…</span>
    } @else if (error()) {
      <span class="placeholder error" [title]="error()">!</span>
    }
  `,
  styles: [`
    :host { display:inline-flex; align-items:center; justify-content:center; }
    img { display:block; max-width:100%; height:auto; }
    .placeholder { color:#8b8273; font-size:.75rem; }
    .placeholder.error { color:#a23; }
  `],
})
export class EventImageComponent implements OnChanges {
  private readonly api = inject(HubApi);

  readonly eventId = input.required<number>();
  readonly imageId = input.required<number>();
  readonly alt = input<string>('');
  readonly imgClass = input<string>('');
  readonly loaded = output<void>();

  protected readonly objectUrl = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string>('');

  private currentKey = '';

  ngOnChanges(): void {
    const key = `${this.eventId()}:${this.imageId()}`;
    if (key === this.currentKey) return;
    this.currentKey = key;
    this.objectUrl.set(null);
    void this.load();
  }

  private async load(): Promise<void> {
    const expected = this.currentKey;
    this.loading.set(true);
    this.error.set('');
    try {
      const url = await this.api.imageObjectUrl(this.eventId(), this.imageId());
      // Bail if a newer load started while we were waiting.
      if (expected !== this.currentKey) return;
      this.objectUrl.set(url);
    } catch (e: any) {
      this.error.set('Could not load image.');
    } finally {
      this.loading.set(false);
    }
  }
}
