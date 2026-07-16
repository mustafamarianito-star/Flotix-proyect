export type VehicleType = 'Camión' | 'Camioneta' | 'Acoplado' | 'Otro';
export type VehicleStatus = 'activo' | 'inactivo';

export interface Vehicle {
  id: string;
  /** Nombre corto usado en toda la app, ej. "Camión 01 (ABC-123)" */
  label: string;
  plate: string;
  brand: string;
  model: string;
  year?: number;
  type: VehicleType;
  status: VehicleStatus;
  /** Vencimientos, formato yyyy-mm-dd */
  insuranceExpiry?: string;
  vtvExpiry?: string;
}

export const VEHICLE_TYPES: VehicleType[] = ['Camión', 'Camioneta', 'Acoplado', 'Otro'];
