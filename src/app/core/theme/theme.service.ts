import { Injectable, effect, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'flotix-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<ThemeMode>(this.initialTheme());

  constructor() {
    // Aplica el tema al <html> y lo persiste cada vez que cambia.
    effect(() => {
      const mode = this.theme();
      document.documentElement.setAttribute('data-theme', mode);
      try {
        localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        /* localStorage no disponible: seguimos igual */
      }
    });
  }

  toggle(): void {
    this.theme.update((mode) => (mode === 'dark' ? 'light' : 'dark'));
  }

  set(mode: ThemeMode): void {
    this.theme.set(mode);
  }

  private initialTheme(): ThemeMode {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      /* ignorar */
    }
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }
}
