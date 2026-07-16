export interface ExtraExpense {
  id: string;
  date: string; // yyyy-mm-dd
  description: string;
  amount: number;
}

export type IncidentSeverity = 'leve' | 'moderado' | 'grave';

export interface Incident {
  id: string;
  date: string; // yyyy-mm-dd
  description: string;
  severity: IncidentSeverity;
}

export interface Attachment {
  id: string;
  fileName: string;
  dataUrl: string;
  sizeKb: number;
  uploadedAt: string;
}

export type RendicionStatus = 'pendiente' | 'aprobada' | 'pagada';

export interface Rendicion {
  id: string;
  vehicleLabel: string;
  driverId: string;
  periodStart: string; // yyyy-mm-dd
  periodEnd: string; // yyyy-mm-dd
  status: RendicionStatus;
  /** Monto facturado / ingreso del viaje (lo que se le cobró al cliente). */
  income?: number;
  odometerStart?: number;
  odometerEnd?: number;
  extraExpenses: ExtraExpense[];
  incidents: Incident[];
  attachments: Attachment[];
  notes?: string;
}
