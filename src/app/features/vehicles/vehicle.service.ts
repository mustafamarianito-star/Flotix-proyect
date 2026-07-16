import { Injectable, computed, signal } from '@angular/core';
import { supabase } from '../../core/supabase/supabase.client';
import { Vehicle, VehicleStatus, VehicleType } from './vehicle.model';

interface VehicleRow {
  id: string;
  label: string;
  plate: string;
  brand: string;
  model: string;
  year: number | null;
  type: string;
  status: string;
  insurance_expiry: string | null;
  vtv_expiry: string | null;
}

function fromRow(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    label: row.label,
    plate: row.plate,
    brand: row.brand,
    model: row.model,
    year: row.year ?? undefined,
    type: row.type as VehicleType,
    status: row.status as VehicleStatus,
    insuranceExpiry: row.insurance_expiry ?? undefined,
    vtvExpiry: row.vtv_expiry ?? undefined,
  };
}

function toRow(data: Omit<Vehicle, 'id'>) {
  return {
    label: data.label,
    plate: data.plate,
    brand: data.brand,
    model: data.model,
    year: data.year ?? null,
    type: data.type,
    status: data.status,
    insurance_expiry: data.insuranceExpiry ?? null,
    vtv_expiry: data.vtvExpiry ?? null,
  };
}

@Injectable({ providedIn: 'root' })
export class VehicleService {
  private readonly vehicles = signal<Vehicle[]>([]);

  /** Se resuelve cuando terminó la primera carga desde Supabase. */
  readonly ready: Promise<void>;

  readonly all = computed(() =>
    [...this.vehicles()].sort((a, b) => a.label.localeCompare(b.label))
  );

  readonly activeOnly = computed(() => this.all().filter((v) => v.status === 'activo'));

  constructor() {
    this.ready = this.refresh();
  }

  async refresh(): Promise<void> {
    const { data, error } = await supabase.from('vehicles').select('*').order('label');
    if (error) throw error;
    this.vehicles.set((data as VehicleRow[]).map(fromRow));
  }

  getById(id: string): Vehicle | undefined {
    return this.vehicles().find((v) => v.id === id);
  }

  async create(data: Omit<Vehicle, 'id'>): Promise<Vehicle> {
    const { data: row, error } = await supabase
      .from('vehicles')
      .insert(toRow(data))
      .select()
      .single();
    if (error) throw error;
    const vehicle = fromRow(row as VehicleRow);
    this.vehicles.update((list) => [...list, vehicle]);
    return vehicle;
  }

  async update(id: string, changes: Omit<Vehicle, 'id'>): Promise<void> {
    const { error } = await supabase.from('vehicles').update(toRow(changes)).eq('id', id);
    if (error) throw error;
    this.vehicles.update((list) => list.map((v) => (v.id === id ? { ...changes, id } : v)));
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('vehicles').delete().eq('id', id);
    if (error) throw error;
    this.vehicles.update((list) => list.filter((v) => v.id !== id));
  }
}
