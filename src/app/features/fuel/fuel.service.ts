import { Injectable, computed, signal } from '@angular/core';
import { supabase } from '../../core/supabase/supabase.client';
import { FuelBalance, FuelMovement, FuelType, MovementKind } from './fuel.model';

interface FuelMovementRow {
  id: string;
  date: string;
  liters: number;
  type: string;
  price_per_liter: number;
  movement_kind: string;
  vehicle: string | null;
  notes: string | null;
}

function fromRow(row: FuelMovementRow): FuelMovement {
  return {
    id: row.id,
    date: row.date,
    liters: row.liters,
    type: row.type as FuelType,
    pricePerLiter: row.price_per_liter,
    movementKind: row.movement_kind as MovementKind,
    vehicle: row.vehicle ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function toRow(data: Omit<FuelMovement, 'id'>) {
  return {
    date: data.date,
    liters: data.liters,
    type: data.type,
    price_per_liter: data.pricePerLiter,
    movement_kind: data.movementKind,
    vehicle: data.vehicle ?? null,
    notes: data.notes ?? null,
  };
}

@Injectable({ providedIn: 'root' })
export class FuelService {
  private readonly movements = signal<FuelMovement[]>([]);

  /** Se resuelve cuando terminó la primera carga desde Supabase. */
  readonly ready: Promise<void>;

  /** Lista completa, ordenada de más reciente a más antigua */
  readonly all = computed(() =>
    [...this.movements()].sort((a, b) => (a.date < b.date ? 1 : -1))
  );

  /** Balance total de litros y gasto acumulado */
  readonly balance = computed<FuelBalance>(() => {
    let totalLiters = 0;
    let naftaLiters = 0;
    let dieselLiters = 0;
    let totalSpent = 0;

    for (const m of this.movements()) {
      const sign = m.movementKind === 'carga' ? 1 : -1;
      totalLiters += sign * m.liters;
      if (m.type === 'nafta') naftaLiters += sign * m.liters;
      else dieselLiters += sign * m.liters;

      if (m.movementKind === 'carga') {
        totalSpent += m.liters * m.pricePerLiter;
      }
    }

    return { totalLiters, naftaLiters, dieselLiters, totalSpent };
  });

  /** Litros de diésel cargados desde el lunes de esta semana hasta hoy */
  readonly dieselLoadedThisWeek = computed(() => {
    const start = this.startOfWeek(new Date());
    return this.movements()
      .filter(
        (m) =>
          m.movementKind === 'carga' &&
          m.type === 'diesel' &&
          new Date(m.date + 'T00:00:00') >= start
      )
      .reduce((sum, m) => sum + m.liters, 0);
  });

  /** Dinero gastado y litros cargados durante el mes en curso */
  readonly monthlyStats = computed(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let spent = 0;
    let liters = 0;
    for (const m of this.movements()) {
      if (m.movementKind === 'carga' && m.date.startsWith(monthKey)) {
        spent += m.liters * m.pricePerLiter;
        liters += m.liters;
      }
    }
    return { spent, liters };
  });

  private startOfWeek(reference: Date): Date {
    const date = new Date(reference);
    const day = date.getDay(); // 0 = domingo … 6 = sábado
    const diffToMonday = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diffToMonday);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  constructor() {
    this.ready = this.refresh();
  }

  async refresh(): Promise<void> {
    const { data, error } = await supabase
      .from('fuel_movements')
      .select('*')
      .order('date', { ascending: false });
    if (error) throw error;
    this.movements.set((data as FuelMovementRow[]).map(fromRow));
  }

  getById(id: string): FuelMovement | undefined {
    return this.movements().find((m) => m.id === id);
  }

  /** Alta de un movimiento (carga o consumo) */
  async create(data: Omit<FuelMovement, 'id'>): Promise<FuelMovement> {
    const { data: row, error } = await supabase
      .from('fuel_movements')
      .insert(toRow(data))
      .select()
      .single();
    if (error) throw error;
    const movement = fromRow(row as FuelMovementRow);
    this.movements.update((list) => [movement, ...list]);
    return movement;
  }

  /** Modificación de un movimiento existente */
  async update(id: string, changes: Omit<FuelMovement, 'id'>): Promise<void> {
    const { error } = await supabase.from('fuel_movements').update(toRow(changes)).eq('id', id);
    if (error) throw error;
    this.movements.update((list) => list.map((m) => (m.id === id ? { ...changes, id } : m)));
  }

  /** Baja (eliminación) de un movimiento */
  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('fuel_movements').delete().eq('id', id);
    if (error) throw error;
    this.movements.update((list) => list.filter((m) => m.id !== id));
  }
}
