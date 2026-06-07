import { Component, computed, effect, input, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { inject } from '@angular/core';
import { DEFAULT_LANGUAGE, LanguageCode } from '../models';
import { t } from '../utils/i18n';

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
      <div class="map-skeleton">{{ t('findingSpot', lang()) }}</div>
    } @else if (embedUrl(); as src) {
      <div class="map-wrap">
        <iframe
          [src]="src"
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          title="Map of {{ location() }}"></iframe>
        <span class="footer-cover" aria-hidden="true">{{ location() }}</span>
        <a class="open" [href]="externalUrl()" target="_blank" rel="noopener">{{ t('openInMaps', lang()) }}</a>
      </div>
    } @else {
      <p class="muted small">{{ t('couldNotPlace', lang(), location()) }}</p>
    }
  `,
  styles: [`
    :host { display:block; }
    .map-skeleton { height:220px; display:flex; align-items:center; justify-content:center; background:#f6efe0; color:#8b8273; border-radius:.6rem; font-style:italic; }
    .map-wrap { position:relative; display:block; border-radius:.6rem; overflow:hidden; box-shadow:0 1px 0 rgba(0,0,0,.04); }
    iframe { width:100%; height:260px; border:0; display:block; background:#f6efe0; }
    .footer-cover { position:absolute; left:0; right:0; bottom:0; height:22px; background:#f6efe0; pointer-events:none; display:flex; align-items:center; padding:0 .6rem; font-size:.72rem; color:#5a5347; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .open { position:absolute; bottom:.5rem; right:.5rem; background:rgba(255,255,255,.92); color:#2d2a24; padding:.25rem .6rem; border-radius:999px; font-size:.7rem; letter-spacing:.05em; text-decoration:none; box-shadow:0 1px 2px rgba(0,0,0,.15); }
    .open:hover { background:#fff; }
    .muted { color:#8b8273; }
    .small { font-size:.8rem; }
  `],
})
export class MapViewComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly location = input.required<string>();
  readonly lang = input<LanguageCode>(DEFAULT_LANGUAGE);

  protected readonly t = t;

  protected readonly loading = signal(false);
  protected readonly result = signal<GeocodeResult | null>(null);

  protected readonly embedUrl = computed<SafeResourceUrl | null>(() => {
    const r = this.result();
    if (!r) return null;
    // Widen the bounding box so the embedded map shows surroundings instead
    // of a tight crop on the pin. Use a fixed ~0.04 deg pad (~4 km) and
    // expand any tiny boxes that Nominatim returns for points of interest.
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    const pad = 0.04;
    const south = lat - pad;
    const north = lat + pad;
    const west = lon - pad;
    const east = lon + pad;
    const bbox = `${west},${south},${east},${north}`;
    const url = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${r.lat},${r.lon}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  protected readonly externalUrl = computed(() => {
    const q = (this.location() || '').trim();
    if (!q) return '';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
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
