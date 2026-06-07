import { Component, OnDestroy, OnInit, computed, effect, inject, input, signal } from '@angular/core';
import { HubApi } from '../services/hub-api.service';
import { EventDetail, EventImage } from '../models';

@Component({
  selector: 'app-event-tile-background',
  template: `
    @if (url(); as src) {
      <div class="tile left" aria-hidden="true"
           [style.background-image]="'url(' + src + ')'"
           [style.background-position]="bgPosition()"
           [style.right]="innerOffset()"></div>
      <div class="tile right" aria-hidden="true"
           [style.background-image]="'url(' + src + ')'"
           [style.background-position]="bgPosition()"
           [style.left]="innerOffset()"></div>
    }
  `,
  styles: [`
    .tile { position:fixed; top:0; bottom:0; background-repeat:repeat; pointer-events:none; z-index:0; will-change:background-position; }
    .tile.left { left:0; }
    .tile.right { right:0; }
    @media (max-width: 820px) { .tile { display:none; } }
  `],
})
export class EventTileBackgroundComponent implements OnInit, OnDestroy {
  private readonly api = inject(HubApi);

  readonly event = input.required<EventDetail>();
  readonly contentWidth = input<number>(780);
  // Parallax factor: 0 = no movement, 1 = scrolls with content. 0.5 means
  // the background drifts at half speed for a subtle depth effect.
  readonly parallax = input<number>(0.5);

  protected readonly url = signal<string | null>(null);
  protected readonly scrollY = signal(0);

  protected readonly tileImage = computed<EventImage | null>(() =>
    this.event().images.find(i => i.role === 'Tile') ?? null);

  protected readonly innerOffset = computed(() => `calc(50% + ${this.contentWidth() / 2}px)`);

  protected readonly bgPosition = computed(() => `0px ${-this.scrollY() * this.parallax()}px`);

  private rafId = 0;
  private readonly onScroll = () => {
    if (this.rafId) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      this.scrollY.set(window.scrollY);
    });
  };

  constructor() {
    effect(async () => {
      const ev = this.event();
      const img = this.tileImage();
      if (!img) { this.url.set(null); return; }
      try {
        const u = await this.api.imageObjectUrl(ev.id, img.id);
        this.url.set(u);
      } catch {
        this.url.set(null);
      }
    });
  }

  ngOnInit(): void {
    this.scrollY.set(window.scrollY);
    window.addEventListener('scroll', this.onScroll, { passive: true });
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.onScroll);
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }
}

