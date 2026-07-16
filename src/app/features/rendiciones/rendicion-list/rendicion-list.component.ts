import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { DriverService } from '../../drivers/driver.service';
import { RendicionService } from '../rendicion.service';
import { RendicionExcelService } from '../rendicion-excel.service';
import { RendicionStatus } from '../rendicion.model';

@Component({
  selector: 'app-rendicion-list',
  standalone: true,
  imports: [
    DecimalPipe,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTableModule,
    MatTooltipModule,
    RouterLink,
  ],
  templateUrl: './rendicion-list.component.html',
  styleUrl: './rendicion-list.component.scss',
})
export class RendicionListComponent {
  private readonly rendicionService = inject(RendicionService);
  private readonly driverService = inject(DriverService);
  private readonly rendicionExcelService = inject(RendicionExcelService);

  readonly exportingId = signal<string | null>(null);
  readonly exportingAll = signal(false);

  readonly displayedColumns = [
    'period',
    'vehicle',
    'driver',
    'fuel',
    'efficiency',
    'extras',
    'incidents',
    'status',
    'actions',
  ];

  readonly statusFilter = signal<RendicionStatus | null>(null);

  private readonly allRows = computed(() =>
    this.rendicionService.all().map((r) => {
      const fuel = this.rendicionService.fuelSpentFor(r.vehicleLabel, r.periodStart, r.periodEnd);
      const extrasTotal = r.extraExpenses.reduce((sum, e) => sum + e.amount, 0);
      const km =
        r.odometerStart != null && r.odometerEnd != null && r.odometerEnd > r.odometerStart
          ? r.odometerEnd - r.odometerStart
          : 0;
      const litersPer100km = km > 0 ? (fuel.liters / km) * 100 : null;
      return {
        rendicion: r,
        driverName: this.driverService.getById(r.driverId)?.name ?? '—',
        fuelSpent: fuel.spent,
        fuelLiters: fuel.liters,
        extrasTotal,
        total: fuel.spent + extrasTotal,
        km,
        litersPer100km,
      };
    })
  );

  readonly rows = computed(() => {
    const filter = this.statusFilter();
    return this.allRows().filter((row) => !filter || row.rendicion.status === filter);
  });

  setStatusFilter(status: RendicionStatus | null): void {
    this.statusFilter.set(status);
  }

  setStatus(id: string, status: RendicionStatus): void {
    this.rendicionService.updateStatus(id, status);
  }

  remove(id: string): void {
    const confirmed = confirm('¿Eliminar esta rendición? Esta acción no se puede deshacer.');
    if (confirmed) {
      this.rendicionService.delete(id);
    }
  }

  async exportExcel(id: string): Promise<void> {
    const rendicion = this.rendicionService.getById(id);
    if (!rendicion) return;

    this.exportingId.set(id);
    try {
      await this.rendicionExcelService.export(rendicion);
    } catch (err) {
      console.error(err);
      alert('No se pudo generar el Excel. Revisá la consola para más detalle.');
    } finally {
      this.exportingId.set(null);
    }
  }

  async exportAllExcel(): Promise<void> {
    this.exportingAll.set(true);
    try {
      await this.rendicionExcelService.exportAll(this.rows().map((r) => r.rendicion));
    } catch (err) {
      console.error(err);
      alert('No se pudo generar el Excel. Revisá la consola para más detalle.');
    } finally {
      this.exportingAll.set(false);
    }
  }

  exportCsv(): void {
    const header = ['Desde', 'Hasta', 'Vehículo', 'Chofer', 'Litros', 'Combustible ($)', 'Gastos extra ($)', 'Total ($)', 'Km recorridos', 'Rendimiento (L/100km)', 'Siniestros', 'Estado'];
    const lines = this.rows().map((row) => [
      row.rendicion.periodStart,
      row.rendicion.periodEnd,
      row.rendicion.vehicleLabel,
      row.driverName,
      row.fuelLiters.toFixed(1),
      row.fuelSpent.toFixed(2),
      row.extrasTotal.toFixed(2),
      row.total.toFixed(2),
      row.km ? row.km.toFixed(0) : '',
      row.litersPer100km != null ? row.litersPer100km.toFixed(1) : '',
      String(row.rendicion.incidents.length),
      row.rendicion.status,
    ]);

    const csv = [header, ...lines]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rendiciones-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
