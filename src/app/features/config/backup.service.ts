import { Injectable, inject } from '@angular/core';
import { Driver, DriverService } from '../drivers/driver.service';
import { FuelMovement } from '../fuel/fuel.model';
import { FuelService } from '../fuel/fuel.service';
import { Rendicion } from '../rendiciones/rendicion.model';
import { RendicionService } from '../rendiciones/rendicion.service';
import { Vehicle } from '../vehicles/vehicle.model';
import { VehicleService } from '../vehicles/vehicle.service';

export interface BackupFile {
  createdAt: string;
  version: 2;
  data: {
    vehicles: Vehicle[];
    drivers: Driver[];
    fuel_movements: FuelMovement[];
    rendiciones: Rendicion[];
  };
}

@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly vehicleService = inject(VehicleService);
  private readonly driverService = inject(DriverService);
  private readonly fuelService = inject(FuelService);
  private readonly rendicionService = inject(RendicionService);

  /** Arma un backup con todos los datos actuales (leídos desde Supabase) y dispara la descarga como archivo .json */
  async exportBackup(): Promise<void> {
    await Promise.all([
      this.vehicleService.ready,
      this.driverService.ready,
      this.fuelService.ready,
      this.rendicionService.ready,
    ]);

    const backup: BackupFile = {
      createdAt: new Date().toISOString(),
      version: 2,
      data: {
        vehicles: this.vehicleService.all(),
        drivers: this.driverService.all(),
        fuel_movements: this.fuelService.all(),
        rendiciones: this.rendicionService.all(),
      },
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `flotix-backup-${backup.createdAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Restaura un backup previamente exportado, reinsertando cada registro vía
   * los métodos create() de los servicios (que ahora hablan con Supabase, no
   * con localStorage). Los choferes se recrean con ids nuevos, así que las
   * rendiciones importadas remapean su driverId al id recién creado.
   */
  async importBackup(file: File): Promise<boolean> {
    const text = await file.text();
    let parsed: BackupFile;
    try {
      parsed = JSON.parse(text);
    } catch {
      return false;
    }

    if (!parsed || typeof parsed !== 'object' || !parsed.data) {
      return false;
    }

    const {
      vehicles = [],
      drivers = [],
      fuel_movements: fuelMovements = [],
      rendiciones = [],
    } = parsed.data;

    for (const { id: _id, ...rest } of vehicles) {
      await this.vehicleService.create(rest);
    }

    const driverIdMap = new Map<string, string>();
    for (const { id: oldId, ...rest } of drivers) {
      const created = await this.driverService.create(rest);
      driverIdMap.set(oldId, created.id);
    }

    for (const { id: _id, ...rest } of fuelMovements) {
      await this.fuelService.create(rest);
    }

    for (const { id: _id, driverId, ...rest } of rendiciones) {
      await this.rendicionService.create({
        ...rest,
        driverId: driverIdMap.get(driverId) ?? driverId,
      });
    }

    return true;
  }
}
