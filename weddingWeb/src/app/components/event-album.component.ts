import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HubApi } from '../services/hub-api.service';
import { EventDetail, EventImage } from '../models';
import { EventImageComponent } from './event-image.component';

// Full-screen album viewer. Shows one Album image at a time with a sidebar
// of thumbnails on desktop. Route is /event/:eventId/album/:imageId — keeping
// the image id in the URL means refresh and back/forward keep state and the
// image is shareable.
@Component({
  selector: 'app-event-album',
  imports: [RouterLink, EventImageComponent],
  template: `
    <main class="shell">
      <header class="bar">
        <a class="ghost" [routerLink]="['/event', eventId()]">← Back</a>
        @if (event(); as ev) {
          <h1>{{ ev.title }}</h1>
        }
        <div class="actions">
          @if (current(); as cur) {
            <button type="button" class="ghost" (click)="download()" title="Download">⬇ Download</button>
          }
        </div>
      </header>

      @if (loading()) {
        <p class="muted center">Loading…</p>
      } @else if (notFound()) {
        <p class="muted center">Album not available.</p>
      } @else {
        @if (!images().length) {
          <p class="muted center">No photos yet.</p>
        } @else {
        <div class="layout">
          <aside class="sidebar">
            @for (img of images(); track img.id) {
              <button type="button" class="thumb" [class.active]="img.id === imageId()"
                (click)="select(img.id)" [title]="img.description || img.fileName">
                <app-event-image [eventId]="eventId()" [imageId]="img.id" [alt]="img.description || img.fileName" />
              </button>
            }
          </aside>

          <section class="stage">
            <button type="button" class="nav prev" (click)="step(-1)" [disabled]="images().length < 2">‹</button>
            <div class="frame">
              @if (current(); as cur) {
                <app-event-image [eventId]="eventId()" [imageId]="cur.id" [alt]="cur.description || cur.fileName" />
                @if (cur.description) { <p class="caption">{{ cur.description }}</p> }
                <p class="caption muted small">{{ currentIndex() + 1 }} / {{ images().length }}</p>
              }
            </div>
            <button type="button" class="nav next" (click)="step(1)" [disabled]="images().length < 2">›</button>
          </section>
        </div>
        }
      }
    </main>
  `,
  styles: [`
    :host { display:block; min-height:100vh; background:#000; color:#f1ece1; }
    .shell { display:flex; flex-direction:column; min-height:100vh; }
    .bar { display:flex; align-items:center; gap:.75rem; padding:.75rem 1rem; border-bottom:1px solid #1c1c1c; }
    .bar h1 { flex:1; margin:0; font-size:1.05rem; font-weight:500; color:#f1ece1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .bar .actions { display:flex; gap:.5rem; }
    .ghost { background:transparent; border:1px solid #3a352a; color:#f1ece1; padding:.4rem .8rem; border-radius:.4rem; cursor:pointer; font:inherit; text-decoration:none; }
    .ghost:hover { background:#1a1813; }
    .center { text-align:center; padding:2rem; }
    .muted { color:#8b8273; margin:0; }
    .small { font-size:.8rem; }

    .layout { flex:1; display:flex; min-height:0; }
    .sidebar { width:160px; flex:0 0 160px; padding:.5rem; display:flex; flex-direction:column; gap:.5rem; overflow-y:auto; border-right:1px solid #1c1c1c; }
    .thumb { background:transparent; border:2px solid transparent; padding:0; border-radius:.4rem; cursor:pointer; overflow:hidden; height:90px; display:block; }
    .thumb.active { border-color:#c9b88a; }
    .thumb ::ng-deep app-event-image { display:block; width:100%; height:100%; }
    .thumb ::ng-deep img { width:100%; height:100%; object-fit:cover; display:block; }

    .stage { flex:1; display:flex; align-items:center; gap:.5rem; padding:.5rem; min-width:0; }
    .stage .nav { background:rgba(255,255,255,.08); border:0; color:#f1ece1; width:2.5rem; height:3rem; border-radius:.4rem; cursor:pointer; font-size:1.5rem; }
    .stage .nav:hover:not(:disabled) { background:rgba(255,255,255,.16); }
    .stage .nav:disabled { opacity:.3; cursor:default; }
    .frame { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.5rem; min-width:0; min-height:0; }
    .frame ::ng-deep app-event-image { display:flex; align-items:center; justify-content:center; max-width:100%; max-height:calc(100vh - 180px); }
    .frame ::ng-deep img { max-width:100%; max-height:calc(100vh - 180px); width:auto; height:auto; object-fit:contain; }
    .caption { margin:0; text-align:center; }

    /* Hide the sidebar on mobile — full-screen image with prev/next only. */
    @media (max-width: 760px) {
      .sidebar { display:none; }
    }
  `],
})
export class EventAlbumComponent implements OnInit {
  private readonly api = inject(HubApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly event = signal<EventDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly eventId = signal(0);
  protected readonly imageId = signal(0);

  protected readonly images = computed<EventImage[]>(() =>
    this.event()?.images.filter(i => i.role === 'Album') ?? []);

  protected readonly current = computed<EventImage | null>(() =>
    this.images().find(i => i.id === this.imageId()) ?? this.images()[0] ?? null);

  protected readonly currentIndex = computed<number>(() => {
    const cur = this.current();
    if (!cur) return 0;
    return Math.max(0, this.images().findIndex(i => i.id === cur.id));
  });

  // Track keyboard arrows for navigation.
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') this.step(1);
    else if (e.key === 'ArrowLeft') this.step(-1);
    else if (e.key === 'Escape') this.router.navigate(['/event', this.eventId()]);
  };

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const evId = Number(params.get('eventId'));
      const imgId = Number(params.get('imageId'));
      this.eventId.set(evId || 0);
      this.imageId.set(imgId || 0);
      // Only re-fetch when the event changes; param changes within the same
      // event just update which image is shown.
      if (this.event()?.id !== evId) void this.load(evId);
    });
    window.addEventListener('keydown', this.onKey);
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.onKey);
  }

  private async load(id: number): Promise<void> {
    if (!id) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.notFound.set(false);
    try {
      const ev = await this.api.getEvent(id);
      this.event.set(ev);
      // If the requested image isn't in this album, fall back to the first.
      const list = ev.images.filter(i => i.role === 'Album');
      if (list.length && !list.some(i => i.id === this.imageId())) {
        this.router.navigate(['/event', id, 'album', list[0].id], { replaceUrl: true });
      }
    } catch (e: any) {
      if (e?.status === 404 || e?.status === 403) this.notFound.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected select(imageId: number): void {
    this.router.navigate(['/event', this.eventId(), 'album', imageId]);
  }

  protected step(delta: number): void {
    const list = this.images();
    if (list.length < 2) return;
    const idx = (this.currentIndex() + delta + list.length) % list.length;
    this.select(list[idx].id);
  }

  protected async download(): Promise<void> {
    const img = this.current();
    if (!img) return;
    const blob = await this.api.imageBlob(this.eventId(), img.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = img.fileName || `image-${img.id}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}
