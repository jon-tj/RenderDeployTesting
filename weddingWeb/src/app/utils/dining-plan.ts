import { EventDetail, LanguageCode } from '../models';
import { localizedOption, localizedTitle, t } from './i18n';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// Opens a printable window summarising RSVP meal/drink demand for the event.
// Uses largest-remainder allocation to apportion guests with no preference
// across the available options so the per-option "to order" column always
// sums to acceptedCount.
export function printDiningPlan(
  ev: EventDetail,
  lang: LanguageCode,
  mealOptions: string[],
  drinkOptions: string[],
): void {
  const tr = (key: Parameters<typeof t>[0], ...args: string[]) => t(key, lang, ...args);
  const accepted = ev.invites.filter(i => i.status === 'Accepted');
  const acceptedCount = accepted.length;

  const section = (kind: 'meal' | 'drink', options: string[]): string => {
    if (!options.length) return '';
    const counts = new Map<string, number>(options.map(o => [o, 0]));
    let unspecified = 0;
    for (const inv of accepted) {
      const raw = (kind === 'meal' ? inv.mealChoice : inv.drinkChoice)?.trim() ?? '';
      if (raw && counts.has(raw)) counts.set(raw, counts.get(raw)! + 1);
      else unspecified += 1;
    }
    const specifiedTotal = options.reduce((s, o) => s + counts.get(o)!, 0);
    const toOrder = new Map<string, number>();
    const remainders: { opt: string; rem: number }[] = [];
    let assigned = 0;
    for (const o of options) {
      const requested = counts.get(o)!;
      const share = specifiedTotal > 0
        ? unspecified * (requested / specifiedTotal)
        : unspecified / options.length;
      const raw = requested + share;
      const floor = Math.floor(raw);
      toOrder.set(o, floor);
      remainders.push({ opt: o, rem: raw - floor });
      assigned += floor;
    }
    let leftover = Math.max(0, acceptedCount - assigned);
    remainders.sort((a, b) => b.rem - a.rem);
    for (const r of remainders) { if (leftover-- <= 0) break; toOrder.set(r.opt, toOrder.get(r.opt)! + 1); }

    const rows = options.map(o =>
      `<tr><td>${escapeHtml(localizedOption(ev, lang, kind, o))}</td><td class="num">${counts.get(o)}</td><td class="num">${toOrder.get(o)}</td></tr>`,
    ).join('');
    const totalOrdered = options.reduce((s, o) => s + toOrder.get(o)!, 0);
    return `<section><h2>${escapeHtml(tr(kind))}</h2><table>
      <thead><tr><th>${escapeHtml(tr('option'))}</th><th class="num">${escapeHtml(tr('requested'))}</th><th class="num">${escapeHtml(tr('toOrder'))}</th></tr></thead>
      <tbody>${rows}
        <tr class="unspec"><td>${escapeHtml(tr('unspecified'))}</td><td class="num">${unspecified}</td><td class="num">0</td></tr>
        <tr class="total"><td>${escapeHtml(tr('total'))}</td><td class="num">${specifiedTotal + unspecified}</td><td class="num">${totalOrdered}</td></tr>
      </tbody></table></section>`;
  };

  const evTitle = escapeHtml(localizedTitle(ev, lang));
  const heading = escapeHtml(tr('diningPlan'));
  const sub = acceptedCount === 0 ? escapeHtml(tr('noAcceptedInvitees')) : escapeHtml(tr('basedOnAccepted', String(acceptedCount)));
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${heading} — ${evTitle}</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color:#222; padding:2rem; max-width:720px; margin:0 auto; }
      h1 { margin:0 0 .25rem; font-size:1.5rem; }
      h2 { margin:1.5rem 0 .5rem; font-size:1.1rem; }
      .sub { color:#666; margin:0 0 1rem; font-size:.9rem; }
      table { width:100%; border-collapse:collapse; }
      th, td { padding:.45rem .6rem; border-bottom:1px solid #ddd; text-align:left; }
      th.num, td.num { text-align:right; font-variant-numeric:tabular-nums; }
      tr.unspec td { color:#666; font-style:italic; }
      tr.total td { font-weight:600; border-top:2px solid #222; border-bottom:none; }
      .toolbar { display:flex; justify-content:flex-end; margin-bottom:1rem; }
      .toolbar button { font:inherit; padding:.5rem 1rem; border:1px solid #222; background:#222; color:#fff; border-radius:.4rem; cursor:pointer; }
      @media print { body { padding:0; } .toolbar { display:none; } }
    </style></head><body>
    <div class="toolbar"><button type="button" onclick="window.print()">${heading}</button></div>
    <h1>${heading}</h1><p class="sub">${evTitle} · ${sub}</p>
    ${section('meal', mealOptions)}${section('drink', drinkOptions)}
    </body></html>`;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.open(); w.document.write(html); w.document.close();
}
