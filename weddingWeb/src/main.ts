import { bootstrapApplication } from '@angular/platform-browser';
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Windows lacks built-in flag emoji glyphs; this loads a small Twemoji font
// (registered as "Twemoji Country Flags") only when needed.
polyfillCountryFlagEmojis();

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
