import { Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (this.auth.currentUser()) {
        this.router.navigateByUrl('/dashboard');
      }
    });
  }

  async loginWithGoogle(): Promise<void> {
    this.errorMessage.set(null);
    this.loading.set(true);
    try {
      await this.auth.loginWithGoogle();
    } catch {
      this.errorMessage.set('No se pudo iniciar sesión con Google. Probá de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }
}
