import { Injectable, computed, inject, signal } from '@angular/core';
import { supabase } from '../../core/supabase/supabase.client';
import { FuelService } from '../fuel/fuel.service';
import { Attachment, ExtraExpense, Incident, Rendicion, RendicionStatus } from './rendicion.model';

interface RendicionRow {
  id: string;
  vehicle_label: string;
  driver_id: string | null;
  period_start: string;
  period_end: string;
  status: string;
  income: number | null;
  odometer_start: number | null;
  odometer_end: number | null;
  extra_expenses: ExtraExpense[];
  incidents: Incident[];
  attachments: Attachment[];
  notes: string | null;
}

function fromRow(row: RendicionRow): Rendicion {
  return {
    id: row.id,
    vehicleLabel: row.vehicle_label,
    driverId: row.driver_id ?? '',
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status as RendicionStatus,
    income: row.income ?? undefined,
    odometerStart: row.odometer_start ?? undefined,
    odometerEnd: row.odometer_end ?? undefined,
    extraExpenses: row.extra_expenses ?? [],
    incidents: row.incidents ?? [],
    attachments: row.attachments ?? [],
    notes: row.notes ?? undefined,
  };
}

function toRow(data: Omit<Rendicion, 'id'>) {
  return {
    vehicle_label: data.vehicleLabel,
    driver_id: data.driverId || null,
    period_start: data.periodStart,
    period_end: data.periodEnd,
    status: data.status,
    income: data.income ?? null,
    odometer_start: data.odometerStart ?? null,
    odometer_end: data.odometerEnd ?? null,
    extra_expenses: data.extraExpenses,
    incidents: data.incidents,
    attachments: data.attachments,
    notes: data.notes ?? null,
  };
}

@Injectable({ providedIn: 'root' })
export class RendicionService {
  private readonly fuelService = inject(FuelService);
  private readonly rendiciones = signal<Rendicion[]>([]);

  /** Se resuelve cuando terminó la primera carga desde Supabase. */
  readonly ready: Promise<void>;

  readonly all = computed(() =>
    [...this.rendiciones()].sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1))
  );

  constructor() {
    this.ready = this.refresh();
  }

  async refresh(): Promise<void> {
    const { data, error } = await supabase
      .from('rendiciones')
      .select('*')
      .order('period_start', { ascending: false });
    if (error) throw error;
    this.rendiciones.set((data as RendicionRow[]).map(fromRow));
  }

  getById(id: string): Rendicion | undefined {
    return this.rendiciones().find((r) => r.id === id);
  }

  async create(data: Omit<Rendicion, 'id'>): Promise<Rendicion> {
    const { data: row, error } = await supabase
      .from('rendiciones')
      .insert(toRow(data))
      .select()
      .single();
    if (error) throw error;
    const rendicion = fromRow(row as RendicionRow);
    this.rendiciones.update((list) => [...list, rendicion]);
    return rendicion;
  }

  async update(id: string, changes: Omit<Rendicion, 'id'>): Promise<void> {
    const { error } = await supabase.from('rendiciones').update(toRow(changes)).eq('id', id);
    if (error) throw error;
    this.rendiciones.update((list) => list.map((r) => (r.id === id ? { ...changes, id } : r)));
  }

  async updateStatus(id: string, status: Rendicion['status']): Promise<void> {
    const { error } = await supabase.from('rendiciones').update({ status }).eq('id', id);
    if (error) throw error;
    this.rendiciones.update((list) => list.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('rendiciones').delete().eq('id', id);
    if (error) throw error;
    this.rendiciones.update((list) => list.filter((r) => r.id !== id));
  }

  /** Litros y $ gastados en cargas de combustible de ese vehículo durante el período. */
  fuelSpentFor(vehicleLabel: string, periodStart: string, periodEnd: string) {
    const movements = this.fuelService
      .all()
      .filter(
        (m) =>
          m.movementKind === 'carga' &&
          m.vehicle === vehicleLabel &&
          m.date >= periodStart &&
          m.date <= periodEnd
      );

    const liters = movements.reduce((sum, m) => sum + m.liters, 0);
    const spent = movements.reduce((sum, m) => sum + m.liters * m.pricePerLiter, 0);
    return { liters, spent, movementCount: movements.length };
  }
}
