import { Injectable, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';

// In dev (ng serve) the backend lives on a different origin; in prod it's
// served from the same host. Honour an explicit override if provided.
const PROD_ORIGIN = '';
const DEV_ORIGIN = 'http://localhost:5022';

@Injectable({ providedIn: 'root' })
export class ApiConfig {
  private readonly platformId = inject(PLATFORM_ID);

  readonly baseUrl: string = (() => {
    if (!isPlatformBrowser(this.platformId)) return '';
    const host = window.location.hostname;
    const isDev = host === 'localhost' || host === '127.0.0.1';
    if (isDev && window.location.port === '4200') return DEV_ORIGIN;
    return PROD_ORIGIN;
  })();

  url(path: string): string {
    return `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`;
  }
}
