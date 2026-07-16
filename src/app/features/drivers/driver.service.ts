import { Injectable, computed, signal } from '@angular/core';
import { supabase } from '../../core/supabase/supabase.client';

export interface Driver {
  id: string;
  name: string;
  license?: string; // DNI o número de licencia, opcional
  phone?: string;
  /** Vencimiento de la licencia de conducir, formato yyyy-mm-dd */
  licenseExpiry?: string;
}

interface DriverRow {
  id: string;
  name: string;
  license: string | null;
  phone: string | null;
  license_expiry: string | null;
}

function fromRow(row: DriverRow): Driver {
  return {
    id: row.id,
    name: row.name,
    license: row.license ?? undefined,
    phone: row.phone ?? undefined,
    licenseExpiry: row.license_expiry ?? undefined,
  };
}

function toRow(data: Omit<Driver, 'id'>) {
  return {
    name: data.name,
    license: data.license ?? null,
    phone: data.phone ?? null,
    license_expiry: data.licenseExpiry ?? null,
  };
}

@Injectable({ providedIn: 'root' })
export class DriverService {
  private readonly drivers = signal<Driver[]>([]);

  /** Se resuelve cuando terminó la primera carga desde Supabase. */
  readonly ready: Promise<void>;

  readonly all = computed(() =>
    [...this.drivers()].sort((a, b) => a.name.localeCompare(b.name))
  );

  constructor() {
    this.ready = this.refresh();
  }

  async refresh(): Promise<void> {
    const { data, error } = await supabase.from('drivers').select('*').order('name');
    if (error) throw error;
    this.drivers.set((data as DriverRow[]).map(fromRow));
  }

  getById(id: string): Driver | undefined {
    return this.drivers().find((d) => d.id === id);
  }

  async create(data: Omit<Driver, 'id'>): Promise<Driver> {
    const { data: row, error } = await supabase
      .from('drivers')
      .insert(toRow(data))
      .select()
      .single();
    if (error) throw error;
    const driver = fromRow(row as DriverRow);
    this.drivers.update((list) => [...list, driver]);
    return driver;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('drivers').delete().eq('id', id);
    if (error) throw error;
    this.drivers.update((list) => list.filter((d) => d.id !== id));
  }
}
