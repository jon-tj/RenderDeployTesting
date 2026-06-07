import { HttpErrorResponse } from '@angular/common/http';

export function extractHttpError(e: unknown): string | null {
  if (!(e instanceof HttpErrorResponse)) return null;
  const body = e.error;
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object') {
    if ((body as any).errors && typeof (body as any).errors === 'object') {
      return Object.values((body as any).errors).flat().join('\n');
    }
    if (typeof (body as any).detail === 'string') return (body as any).detail;
    if (typeof (body as any).title === 'string') return (body as any).title;
    if (typeof (body as any).message === 'string') return (body as any).message;
  }
  return e.message || null;
}
