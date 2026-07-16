import { Injectable, computed, inject } from '@angular/core';
import { DriverService } from '../../features/drivers/driver.service';
import { VehicleService } from '../../features/vehicles/vehicle.service';

export type ExpiryStatus = 'vencido' | 'proximo' | 'ok';

export interface ExpiryItem {
  label: string; // ej. "Seguro — Camión 01 (ABC-123)"
  date: string; // yyyy-mm-dd
  daysLeft: number;
  status: ExpiryStatus;
}

const WARNING_WINDOW_DAYS = 30;

@Injectable({ providedIn: 'root' })
export class ExpiryService {
  private readonly vehicleService = inject(VehicleService);
  private readonly driverService = inject(DriverService);

  /** Vencimientos vencidos o dentro de los próximos 30 días, ordenados por urgencia. */
  readonly upcoming = computed<ExpiryItem[]>(() => {
    const items: ExpiryItem[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const v of this.vehicleService.all()) {
      if (v.insuranceExpiry) {
        items.push(this.buildItem(`Seguro — ${v.label}`, v.insuranceExpiry, today));
      }
      if (v.vtvExpiry) {
        items.push(this.buildItem(`VTV — ${v.label}`, v.vtvExpiry, today));
      }
    }

    for (const d of this.driverService.all()) {
      if (d.licenseExpiry) {
        items.push(this.buildItem(`Licencia — ${d.name}`, d.licenseExpiry, today));
      }
    }

    return items
      .filter((i) => i.status !== 'ok')
      .sort((a, b) => a.daysLeft - b.daysLeft);
  });

  private buildItem(label: string, date: string, today: Date): ExpiryItem {
    const target = new Date(date + 'T00:00:00');
    const daysLeft = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const status: ExpiryStatus =
      daysLeft < 0 ? 'vencido' : daysLeft <= WARNING_WINDOW_DAYS ? 'proximo' : 'ok';
    return { label, date, daysLeft, status };
  }
}
