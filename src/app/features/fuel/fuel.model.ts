export type FuelType = 'nafta' | 'diesel';
export type MovementKind = 'carga' | 'consumo';

export interface FuelMovement {
  id: string;
  date: string; // ISO yyyy-mm-dd
  liters: number;
  type: FuelType;
  pricePerLiter: number;
  movementKind: MovementKind; // carga = ingreso de litros, consumo = salida
  vehicle?: string;
  notes?: string;
}

export interface FuelBalance {
  totalLiters: number;
  naftaLiters: number;
  dieselLiters: number;
  totalSpent: number;
}
