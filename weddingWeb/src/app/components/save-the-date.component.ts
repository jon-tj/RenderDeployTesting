import { Component, computed, input } from '@angular/core';
import { DEFAULT_LANGUAGE, LanguageCode } from '../models';
import { t } from '../utils/i18n';

function toCalDate(iso: string): string {
  // Compact UTC form: 20260612T140000Z
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

function toIsoLocal(iso: string): string {
  return new Date(iso).toISOString();
}

@Component({
  selector: 'app-save-the-date',
  template: `
    <div class="std" [class.compact]="compact()">
      <span class="label">{{ t('saveTheDate', lang()) }}</span>
      <div class="row">
        <a class="btn google" [href]="googleUrl()" target="_blank" rel="noopener">Google</a>
        <a class="btn outlook" [href]="outlookUrl()" target="_blank" rel="noopener">Outlook</a>
      </div>
    </div>
  `,
  styles: [`
    :host { display:block; }
    .std { display:flex; flex-direction:column; gap:.4rem; align-items:center; }
    .std.compact { flex-direction:row; gap:.5rem; flex-wrap:nowrap; align-items:center; justify-content:flex-start; }
    .label { font-family:'Georgia', serif; color:#8a7a55; letter-spacing:.08em; font-size:.8rem; }
    .std.compact .label { white-space:nowrap; }
    .row { display:flex; gap:.3rem; flex-wrap:wrap; justify-content:center; }
    .std.compact .row { flex-wrap:nowrap; }
    .btn { font:inherit; font-size:.78rem; padding:.4rem .8rem; border-radius:999px; border:1px solid #d8cfb8; background:#fff; color:#4a3f2a; cursor:pointer; text-decoration:none; letter-spacing:.04em; transition:background .15s; }
    .std.compact .btn { font-size:.7rem; padding:.2rem .55rem; letter-spacing:.02em; }
    .btn:hover { background:#faf2dd; }
  `],
})
export class SaveTheDateComponent {
  readonly title = input.required<string>();
  readonly startUtc = input.required<string>();
  readonly endUtc = input.required<string>();
  readonly location = input<string>('');
  readonly description = input<string>('');
  readonly compact = input<boolean>(false);
  readonly lang = input<LanguageCode>(DEFAULT_LANGUAGE);

  protected readonly t = t;

  protected readonly googleUrl = computed(() => {
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: this.title(),
      dates: `${toCalDate(this.startUtc())}/${toCalDate(this.endUtc())}`,
      details: this.description() || '',
      location: this.location() || '',
    });
    return `https://www.google.com/calendar/render?${params.toString()}`;
  });

  protected readonly outlookUrl = computed(() => {
    const params = new URLSearchParams({
      path: '/calendar/action/compose',
      rru: 'addevent',
      subject: this.title(),
      startdt: toIsoLocal(this.startUtc()),
      enddt: toIsoLocal(this.endUtc()),
      body: this.description() || '',
      location: this.location() || '',
    });
    return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
  });
}
