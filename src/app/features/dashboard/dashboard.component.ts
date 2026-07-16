import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { FuelService } from '../fuel/fuel.service';
import { DriverService } from '../drivers/driver.service';
import { RendicionService } from '../rendiciones/rendicion.service';
import { ChartPoint, MiniChartComponent } from '../../shared/mini-chart/mini-chart.component';
import { ExpiryService } from '../../shared/expiry/expiry.service';
import {
  CHART_SCALE_MAX,
  CHART_SCALE_MIN,
  ChartScaleService,
} from '../../core/chart-scale/chart-scale.service';

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DecimalPipe, MatCardModule, MatIconModule, MatTooltipModule, RouterLink, MiniChartComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly fuelService = inject(FuelService);
  private readonly rendicionService = inject(RendicionService);
  private readonly driverService = inject(DriverService);
  private readonly expiryService = inject(ExpiryService);
  private readonly chartScaleService = inject(ChartScaleService);

  readonly chartScale = this.chartScaleService.scale;
  readonly canDecreaseChartScale = computed(() => this.chartScale() > CHART_SCALE_MIN + 0.001);
  readonly canIncreaseChartScale = computed(() => this.chartScale() < CHART_SCALE_MAX - 0.001);

  decreaseChartScale(): void {
    this.chartScaleService.decrease();
  }

  increaseChartScale(): void {
    this.chartScaleService.increase();
  }

  resetChartScale(): void {
    this.chartScaleService.reset();
  }

  private readonly currentMonth = monthKey(new Date());

  /** Mes seleccionado en el historial (yyyy-mm). */
  readonly selectedMonth = signal(this.currentMonth);

  readonly balance = this.fuelService.balance;
  readonly upcomingExpiries = this.expiryService.upcoming;
  readonly recent = computed(() => this.fuelService.all().slice(0, 5));

  /** Rendiciones cuyo período (por su inicio) cae en el mes seleccionado. */
  private readonly monthRendiciones = computed(() => {
    const key = this.selectedMonth();
    return this.rendicionService.all().filter((r) => r.periodStart.slice(0, 7) === key);
  });

  /** Movimientos de combustible del mes seleccionado. */
  private readonly monthFuel = computed(() => {
    const key = this.selectedMonth();
    return this.fuelService.all().filter((m) => m.date.slice(0, 7) === key);
  });

  readonly monthIncome = computed(() =>
    this.monthRendiciones().reduce((sum, r) => sum + (r.income ?? 0), 0)
  );

  private readonly monthExtras = computed(() =>
    this.monthRendiciones().reduce(
      (sum, r) => sum + r.extraExpenses.reduce((s, e) => s + (e.amount ?? 0), 0),
      0
    )
  );

  private readonly monthFuelSpent = computed(() =>
    this.monthFuel()
      .filter((m) => m.movementKind === 'carga')
      .reduce((sum, m) => sum + m.liters * m.pricePerLiter, 0)
  );

  readonly monthLitersLoaded = computed(() =>
    this.monthFuel()
      .filter((m) => m.movementKind === 'carga')
      .reduce((sum, m) => sum + m.liters, 0)
  );

  readonly monthExpenses = computed(() => this.monthFuelSpent() + this.monthExtras());
  readonly monthResult = computed(() => this.monthIncome() - this.monthExpenses());
  readonly monthTrips = computed(() => this.monthRendiciones().length);

  /** Etiqueta legible del mes seleccionado, ej. "Julio 2026". */
  readonly selectedMonthLabel = computed(() => this.formatMonth(this.selectedMonth()));

  readonly canGoNext = computed(() => this.selectedMonth() < this.currentMonth);

  /** Ingresos de los últimos 6 meses terminando en el mes seleccionado. */
  readonly incomeByMonth = computed<ChartPoint[]>(() => {
    const months = this.lastMonths(this.selectedMonth(), 6);
    const rendiciones = this.rendicionService.all();
    return months.map((key) => ({
      label: this.formatMonthShort(key),
      value: rendiciones
        .filter((r) => r.periodStart.slice(0, 7) === key)
        .reduce((sum, r) => sum + (r.income ?? 0), 0),
    }));
  });

  /** Viajes por camión en el mes seleccionado. */
  readonly tripsPerVehicle = computed<ChartPoint[]>(() => {
    const counts = new Map<string, number>();
    for (const r of this.monthRendiciones()) {
      counts.set(r.vehicleLabel, (counts.get(r.vehicleLabel) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value }));
  });

  /** Viajes por chofer en el mes seleccionado. */
  readonly tripsPerDriver = computed<ChartPoint[]>(() => {
    const counts = new Map<string, number>();
    for (const r of this.monthRendiciones()) {
      const driver = this.driverService.getById(r.driverId);
      const name = driver ? driver.name.split(' ')[0] : 'Sin chofer';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value }));
  });

  prevMonth(): void {
    this.selectedMonth.update((key) => this.shiftMonth(key, -1));
  }

  nextMonth(): void {
    if (this.canGoNext()) {
      this.selectedMonth.update((key) => this.shiftMonth(key, 1));
    }
  }

  private shiftMonth(key: string, delta: number): string {
    const [year, month] = key.split('-').map(Number);
    const date = new Date(year, month - 1 + delta, 1);
    return monthKey(date);
  }

  private lastMonths(endKey: string, count: number): string[] {
    const result: string[] = [];
    for (let i = count - 1; i >= 0; i--) {
      result.push(this.shiftMonth(endKey, -i));
    }
    return result;
  }

  private formatMonth(key: string): string {
    const [year, month] = key.split('-').map(Number);
    const label = new Date(year, month - 1, 1).toLocaleDateString('es-AR', {
      month: 'long',
      year: 'numeric',
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  private formatMonthShort(key: string): string {
    const [year, month] = key.split('-').map(Number);
    return new Date(year, month - 1, 1)
      .toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
      .replace('.', '');
  }
}
