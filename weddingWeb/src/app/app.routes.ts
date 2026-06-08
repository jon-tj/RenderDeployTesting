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
    path: 'event/:eventId/album/:imageId',
    canActivate: [authGuard],
    loadComponent: () => import('./components/event-album.component').then(m => m.EventAlbumComponent),
  },
  {
    path: 'event/:eventId',
    canActivate: [authGuard],
    loadComponent: () => import('./components/event-detail.component').then(m => m.EventDetailComponent),
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () => import('./components/settings.component').then(m => m.SettingsComponent),
  },
  {
    path: 'wishlist/:id',
    loadComponent: () => import('./components/wishlist.component').then(m => m.WishlistComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./components/home.component').then(m => m.HomeComponent),
  },
  { path: '**', redirectTo: '' },
];
