import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { BackupService } from './backup.service';
import { ThemeMode, ThemeService } from '../../core/theme/theme.service';

@Component({
  selector: 'app-config',
  standalone: true,
  imports: [MatButtonModule, MatCardModule, MatIconModule, RouterLink],
  templateUrl: './config.component.html',
  styleUrl: './config.component.scss',
})
export class ConfigComponent {
  private readonly backupService = inject(BackupService);
  private readonly themeService = inject(ThemeService);

  readonly theme = this.themeService.theme;
  readonly importResult = signal<'ok' | 'error' | null>(null);
  readonly importing = signal(false);

  setTheme(mode: ThemeMode): void {
    this.themeService.set(mode);
  }

  async downloadBackup(): Promise<void> {
    try {
      await this.backupService.exportBackup();
    } catch (err) {
      console.error(err);
      alert('No se pudo generar el backup. Probá de nuevo.');
    }
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.importing.set(true);
    this.importResult.set(null);
    try {
      const ok = await this.backupService.importBackup(file);
      this.importResult.set(ok ? 'ok' : 'error');
      if (ok) {
        // Recargamos para que todos los servicios vuelvan a leer desde Supabase.
        setTimeout(() => window.location.reload(), 1200);
      }
    } finally {
      this.importing.set(false);
      input.value = '';
    }
  }
}
