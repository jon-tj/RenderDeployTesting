import { Component, computed, input, signal } from '@angular/core';
import { EventImage } from '../models';
import { EventImageComponent } from './event-image.component';

// Reusable carousel that flips through a list of EventImages. The currently
// shown image stays underneath while the outgoing one fades + drifts left on
// top — once the new image has decoded it pops to full opacity. Self-contained
// state (index, in-flight animation) so consumers only need to pass the list.
@Component({
  selector: 'app-image-carousel',
  imports: [EventImageComponent],
  template: `
    @if (images().length) {
      <div class="carousel">
        <button type="button" class="nav prev" (click)="shift(-1)"
          [disabled]="images().length < 2 || isAnimating()">‹</button>
        <div class="slide">
          <div class="image-stack">
            @if (outgoing(); as out) {
              <div class="slide-image outgoing">
                <app-event-image [eventId]="eventId()" [imageId]="out.id" [alt]="alt(out)" />
              </div>
            }
            @for (cur of currentSlide(); track cur.id) {
              <div class="slide-image" [class.incoming]="isAnimating()" [class.ready]="incomingReady()">
                <app-event-image
                  [eventId]="eventId()"
                  [imageId]="cur.id"
                  [alt]="alt(cur)"
                  (loaded)="onIncomingLoaded()" />
              </div>
            }
          </div>
          @if (current(); as cur) {
            @if (cur.description) { <p class="caption">{{ cur.description }}</p> }
            <p class="caption muted small">{{ index() + 1 }} / {{ images().length }}</p>
          }
        </div>
        <button type="button" class="nav next" (click)="shift(1)"
          [disabled]="images().length < 2 || isAnimating()">›</button>
      </div>
    }
  `,
  styles: [`
    .carousel { display:flex; align-items:stretch; gap:.5rem; }
    .carousel .nav { background:#fff; border:1px solid #d8cfb8; width:2.25rem; border-radius:.4rem; cursor:pointer; font-size:1.25rem; }
    .carousel .nav:disabled { opacity:.4; cursor:default; }
    .carousel .slide { flex:1; display:flex; flex-direction:column; align-items:center; gap:.35rem; }
    .carousel .image-stack { position:relative; width:100%; height:360px; }
    .carousel .slide-image { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; }
    .carousel .slide-image ::ng-deep app-event-image { width:100%; height:100%; display:flex; align-items:center; justify-content:center; }
    .carousel .slide-image ::ng-deep img { max-height:100%; max-width:100%; width:auto; height:auto; border-radius:.4rem; object-fit:contain; }
    /* Stacking: outgoing fades + drifts left on top; incoming sits below it,
       hidden until decoded so the swap reveals the new image as the old one
       slides away. */
    .carousel .slide-image.incoming { opacity:0; z-index:1; }
    .carousel .slide-image.incoming.ready { opacity:1; }
    .carousel .slide-image.outgoing { z-index:2; animation: fade-out-left .3s ease-out both; }
    @keyframes fade-out-left { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(-24px); } }
    @media (prefers-reduced-motion: reduce) {
      .carousel .slide-image.incoming { opacity:1; }
      .carousel .slide-image.outgoing { animation: none; }
    }
    .caption { margin:0; text-align:center; }
    .muted { color:#8b8273; }
    .small { font-size:.8rem; }
  `],
})
export class ImageCarouselComponent {
  readonly eventId = input.required<number>();
  readonly images = input.required<EventImage[]>();

  protected readonly index = signal(0);
  protected readonly outgoing = signal<EventImage | null>(null);
  protected readonly incomingReady = signal(false);
  protected readonly isAnimating = signal(false);
  private outgoingTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly current = computed<EventImage | null>(() => {
    const list = this.images();
    if (!list.length) return null;
    return list[this.index() % list.length] ?? null;
  });

  protected readonly currentSlide = computed<EventImage[]>(() => {
    const cur = this.current();
    return cur ? [cur] : [];
  });

  protected shift(delta: number): void {
    const list = this.images();
    if (list.length < 2 || this.isAnimating()) return;
    const current = this.current();
    if (current) this.outgoing.set(current);
    this.incomingReady.set(false);
    this.isAnimating.set(true);
    const next = (this.index() + delta + list.length) % list.length;
    this.index.set(next);

    // Safety net for cached images whose load event already fired or for
    // network errors — guarantees the buttons re-enable.
    if (this.outgoingTimer) clearTimeout(this.outgoingTimer);
    this.outgoingTimer = setTimeout(() => this.finish(), 800);
  }

  protected onIncomingLoaded(): void {
    if (!this.isAnimating()) return;
    this.incomingReady.set(true);
    if (this.outgoingTimer) clearTimeout(this.outgoingTimer);
    this.outgoingTimer = setTimeout(() => this.finish(), 300);
  }

  // Public so the parent can jump to a newly-added image without animating.
  jumpTo(targetIndex: number): void {
    const list = this.images();
    if (!list.length) return;
    const safe = ((targetIndex % list.length) + list.length) % list.length;
    this.finish();
    this.index.set(safe);
  }

  protected alt(img: EventImage): string {
    return img.description || img.fileName;
  }

  private finish(): void {
    this.outgoing.set(null);
    this.incomingReady.set(false);
    this.isAnimating.set(false);
    if (this.outgoingTimer) {
      clearTimeout(this.outgoingTimer);
      this.outgoingTimer = null;
    }
  }
}
