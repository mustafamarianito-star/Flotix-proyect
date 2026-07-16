import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'combustible',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/fuel/fuel-list/fuel-list.component').then((m) => m.FuelListComponent),
  },
  {
    path: 'combustible/nuevo',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/fuel/fuel-form/fuel-form.component').then((m) => m.FuelFormComponent),
  },
  {
    path: 'combustible/:id/editar',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/fuel/fuel-form/fuel-form.component').then((m) => m.FuelFormComponent),
  },
  {
    path: 'vehiculos',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/vehicles/vehicle-list/vehicle-list.component').then(
        (m) => m.VehicleListComponent
      ),
  },
  {
    path: 'vehiculos/nuevo',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/vehicles/vehicle-form/vehicle-form.component').then(
        (m) => m.VehicleFormComponent
      ),
  },
  {
    path: 'vehiculos/:id/editar',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/vehicles/vehicle-form/vehicle-form.component').then(
        (m) => m.VehicleFormComponent
      ),
  },
  {
    path: 'choferes',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/drivers/driver-list.component').then((m) => m.DriverListComponent),
  },
  {
    path: 'rendiciones',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/rendiciones/rendicion-list/rendicion-list.component').then(
        (m) => m.RendicionListComponent
      ),
  },
  {
    path: 'rendiciones/nueva',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/rendiciones/rendicion-form/rendicion-form.component').then(
        (m) => m.RendicionFormComponent
      ),
  },
  {
    path: 'rendiciones/:id/editar',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/rendiciones/rendicion-form/rendicion-form.component').then(
        (m) => m.RendicionFormComponent
      ),
  },
  {
    path: 'configuracion',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/config/config.component').then((m) => m.ConfigComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
];
