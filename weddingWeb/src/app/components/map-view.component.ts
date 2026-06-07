import { Component, computed, effect, input, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { inject } from '@angular/core';

interface GeocodeResult {
  lat: string;
  lon: string;
  display_name: string;
  boundingbox: [string, string, string, string];
}

// Tiny in-memory cache so we don't hit Nominatim repeatedly for the same
// location string while the user navigates around the wedding page.
const cache = new Map<string, GeocodeResult | null>();

@Component({
  selector: 'app-map-view',
  template: `
    @if (loading()) {
      <div class="map-skeleton">Finding the spot…</div>
    } @else if (embedUrl(); as src) {
      <div class="map-wrap">
        <iframe
          [src]="src"
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          title="Map of {{ location() }}"></iframe>
        <a class="open" [href]="externalUrl()" target="_blank" rel="noopener">Open in maps ↗</a>
      </div>
    } @else {
      <p class="muted small">Could not place &laquo;{{ location() }}&raquo; on the map.</p>
    }
  `,
  styles: [`
    :host { display:block; }
    .map-skeleton { height:220px; display:flex; align-items:center; justify-content:center; background:#f6efe0; color:#8b8273; border-radius:.6rem; font-style:italic; }
    .map-wrap { position:relative; border-radius:.6rem; overflow:hidden; box-shadow:0 1px 0 rgba(0,0,0,.04); }
    iframe { width:100%; height:260px; border:0; display:block; background:#f6efe0; }
    .open { position:absolute; bottom:.5rem; right:.5rem; background:rgba(255,255,255,.92); color:#2d2a24; padding:.2rem .55rem; border-radius:999px; font-size:.7rem; text-decoration:none; letter-spacing:.05em; }
    .open:hover { background:#fff; }
    .muted { color:#8b8273; }
    .small { font-size:.8rem; }
  `],
})
export class MapViewComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly location = input.required<string>();

  protected readonly loading = signal(false);
  protected readonly result = signal<GeocodeResult | null>(null);

  protected readonly embedUrl = computed<SafeResourceUrl | null>(() => {
    const r = this.result();
    if (!r) return null;
    const [south, north, west, east] = r.boundingbox;
    const bbox = `${west},${south},${east},${north}`;
    const url = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${r.lat},${r.lon}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  protected readonly externalUrl = computed(() => {
    const r = this.result();
    if (!r) return '';
    return `https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lon}#map=17/${r.lat}/${r.lon}`;
  });

  constructor() {
    effect(async () => {
      const q = (this.location() || '').trim();
      this.result.set(null);
      if (!q) return;
      if (cache.has(q)) {
        this.result.set(cache.get(q)!);
        return;
      }
      this.loading.set(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error('geocode');
        const arr = (await res.json()) as GeocodeResult[];
        const hit = arr[0] ?? null;
        cache.set(q, hit);
        this.result.set(hit);
      } catch {
        cache.set(q, null);
        this.result.set(null);
      } finally {
        this.loading.set(false);
      }
    });
  }
}
