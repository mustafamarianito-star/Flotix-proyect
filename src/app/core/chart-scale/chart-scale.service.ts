import { Injectable, effect, signal } from '@angular/core';

const STORAGE_KEY = 'flotix-chart-scale';
export const CHART_SCALE_MIN = 0.8;
export const CHART_SCALE_MAX = 1.6;
const STEP = 0.1;

@Injectable({ providedIn: 'root' })
export class ChartScaleService {
  readonly scale = signal<number>(this.initialScale());

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, String(this.scale()));
      } catch {
        /* localStorage no disponible: seguimos igual */
      }
    });
  }

  increase(): void {
    this.scale.update((s) => this.clamp(s + STEP));
  }

  decrease(): void {
    this.scale.update((s) => this.clamp(s - STEP));
  }

  reset(): void {
    this.scale.set(1);
  }

  private clamp(value: number): number {
    const rounded = Math.round(value * 100) / 100;
    return Math.min(CHART_SCALE_MAX, Math.max(CHART_SCALE_MIN, rounded));
  }

  private initialScale(): number {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY));
      if (saved >= CHART_SCALE_MIN && saved <= CHART_SCALE_MAX) return saved;
    } catch {
      /* ignorar */
    }
    return 1;
  }
}
