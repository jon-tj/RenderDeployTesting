import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  // Don't touch the auth endpoints themselves: register/login/refresh must
  // never carry a stale bearer (the server treats it as authenticated).
  if (req.url.includes('/api/auth/')) {
    return next(req);
  }

  return from(auth.getValidAccessToken()).pipe(
    switchMap(token => next(attach(req, token))),
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        // Last-ditch: token may have been rotated/revoked between the check
        // above and the server processing it. Try one refresh + replay.
        return from(auth.tryRefresh()).pipe(
          switchMap(ok => {
            if (!ok) {
              auth.clearStored();
              return throwError(() => err);
            }
            return next(attach(req, auth.getAccessToken()));
          })
        );
      }
      return throwError(() => err);
    })
  );
};

function attach(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  if (!token) return req;
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}
