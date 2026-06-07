import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './services/auth.guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./components/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'onboarding/:userId',
    loadComponent: () => import('./components/onboarding.component').then(m => m.OnboardingComponent),
  },
  {
    path: 'event/:eventId/edit',
    canActivate: [authGuard],
    loadComponent: () => import('./components/event-edit.component').then(m => m.EventEditComponent),
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () => import('./components/settings.component').then(m => m.SettingsComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./components/home.component').then(m => m.HomeComponent),
  },
  { path: '**', redirectTo: '' },
];
