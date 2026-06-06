import { ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-venue-map',
  standalone: true,
  template: `
    <a
      class="venue-map-link"
      [href]="openMapUrl"
      target="_blank"
      rel="noopener"
      [attr.aria-label]="'Open ' + (venueName || place || 'venue') + ' in Google Maps'"
    >
      <iframe
        class="venue-map"
        [src]="safeEmbedUrl"
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
        title="Wedding venue map"
        tabindex="-1"
      ></iframe>
      <span class="venue-map-hint">Open in Google Maps</span>
    </a>
  `,
  styles: [
    `
      .venue-map-link {
        position: relative;
        display: block;
        margin: 0.5rem 0 0;
        border-radius: 6px;
        overflow: hidden;
        cursor: pointer;
        border: 1px solid #d8cfb8;
      }

      .venue-map {
        width: 100%;
        height: 320px;
        border: none;
        background: #ece6d4;
        display: block;
        pointer-events: none;
      }

      .venue-map-hint {
        position: absolute;
        bottom: 0.75rem;
        right: 0.75rem;
        padding: 0.45rem 0.9rem;
        border-radius: 999px;
        background: #2d2a24cc;
        color: #faf5ea;
        font-family: "Montserrat", sans-serif;
        font-size: 0.7rem;
        font-weight: 500;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        opacity: 0;
        transition: opacity 150ms ease;
        pointer-events: none;
      }

      .venue-map-link:hover .venue-map-hint,
      .venue-map-link:focus-visible .venue-map-hint {
        opacity: 1;
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VenueMapComponent implements OnChanges {
  @Input() mapQuery = '';
  @Input() venueName = '';
  @Input() place = '';

  protected safeEmbedUrl: SafeResourceUrl;
  protected openMapUrl = '#';

  public constructor(private readonly sanitizer: DomSanitizer) {
    this.safeEmbedUrl = this.sanitizer.bypassSecurityTrustResourceUrl('about:blank');
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['mapQuery'] || changes['venueName'] || changes['place']) {
      this.updateUrls();
    }
  }

  private updateUrls(): void {
    const query = (this.mapQuery || this.venueName || this.place).trim();
    if (!query) {
      this.openMapUrl = '#';
      this.safeEmbedUrl = this.sanitizer.bypassSecurityTrustResourceUrl('about:blank');
      return;
    }

    const encodedQuery = encodeURIComponent(query);
    this.openMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`;
    this.safeEmbedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.google.com/maps?q=${encodedQuery}&output=embed`
    );
  }
}
