import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './services/auth.guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./components/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./components/register.component').then(m => m.RegisterComponent),
  },
  {
    path: 'event/:eventId/edit',
    canActivate: [authGuard],
    loadComponent: () => import('./components/event-edit.component').then(m => m.EventEditComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./components/home.component').then(m => m.HomeComponent),
  },
  { path: '**', redirectTo: '' },
];
