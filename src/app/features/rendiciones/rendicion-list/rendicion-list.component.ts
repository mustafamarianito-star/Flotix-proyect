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

  // URL del dashboard de Looker Studio con las métricas de rendiciones.
  // Reemplazá con la URL de tu dashboard: https://lookerstudio.google.com/reporting/{REPORT_ID}
  // Ver documentation/Integracion-Looker-Studio.md para crear el dashboard.
  readonly lookerUrl = 'https://lookerstudio.google.com/reporting/REEMPLAZA-CON-TU-REPORT-ID';

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
}
