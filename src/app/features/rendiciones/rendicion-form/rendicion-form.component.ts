import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DriverService } from '../../drivers/driver.service';
import { VehicleService } from '../../vehicles/vehicle.service';
import { fileToDataUrl } from '../../../shared/util/file-to-data-url';
import { Attachment, IncidentSeverity, Rendicion } from '../rendicion.model';
import { RendicionService } from '../rendicion.service';

function startOfMonth(reference: Date): Date {
  return new Date(reference.getFullYear(), reference.getMonth(), 1);
}

@Component({
  selector: 'app-rendicion-form',
  standalone: true,
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  templateUrl: './rendicion-form.component.html',
  styleUrl: './rendicion-form.component.scss',
})
export class RendicionFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly rendicionService = inject(RendicionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly vehicleService = inject(VehicleService);
  private readonly driverService = inject(DriverService);

  readonly vehicles = this.vehicleService.activeOnly;
  readonly drivers = this.driverService.all;
  readonly severities: IncidentSeverity[] = ['leve', 'moderado', 'grave'];

  private readonly rendicionId = this.route.snapshot.paramMap.get('id');
  readonly isEditMode = computed(() => !!this.rendicionId);

  readonly attachments = signal<Attachment[]>([]);
  readonly uploading = signal(false);

  readonly form = this.fb.nonNullable.group({
    vehicleLabel: ['', Validators.required],
    driverId: ['', Validators.required],
    periodStart: [startOfMonth(new Date()), Validators.required],
    periodEnd: [new Date(), Validators.required],
    status: ['pendiente' as Rendicion['status'], Validators.required],
    income: [null as number | null],
    odometerStart: [null as number | null],
    odometerEnd: [null as number | null],
    notes: [''],
    extraExpenses: this.fb.array<ReturnType<typeof this.buildExpenseGroup>>([]),
    incidents: this.fb.array<ReturnType<typeof this.buildIncidentGroup>>([]),
  });

  get extraExpenses(): FormArray {
    return this.form.controls.extraExpenses;
  }

  get incidents(): FormArray {
    return this.form.controls.incidents;
  }

  constructor() {
    if (this.rendicionId) {
      this.rendicionService.ready.then(() => {
        const rendicion = this.rendicionService.getById(this.rendicionId!);
        if (rendicion) {
          this.form.patchValue({
            vehicleLabel: rendicion.vehicleLabel,
            driverId: rendicion.driverId,
            periodStart: new Date(rendicion.periodStart),
            periodEnd: new Date(rendicion.periodEnd),
            status: rendicion.status,
            income: rendicion.income ?? null,
            odometerStart: rendicion.odometerStart ?? null,
            odometerEnd: rendicion.odometerEnd ?? null,
            notes: rendicion.notes ?? '',
          });
          for (const expense of rendicion.extraExpenses) {
            this.extraExpenses.push(this.buildExpenseGroup(expense));
          }
          for (const incident of rendicion.incidents) {
            this.incidents.push(this.buildIncidentGroup(incident));
          }
          this.attachments.set(rendicion.attachments);
        }
      });
    }
  }

  private buildExpenseGroup(data?: { description: string; amount: number; date: string }) {
    return this.fb.nonNullable.group({
      description: [data?.description ?? '', Validators.required],
      amount: [data?.amount ?? 0, [Validators.required, Validators.min(0.01)]],
      date: [data?.date ? new Date(data.date) : new Date(), Validators.required],
    });
  }

  private buildIncidentGroup(data?: { description: string; date: string; severity: IncidentSeverity }) {
    return this.fb.nonNullable.group({
      description: [data?.description ?? '', Validators.required],
      date: [data?.date ? new Date(data.date) : new Date(), Validators.required],
      severity: [data?.severity ?? ('leve' as IncidentSeverity), Validators.required],
    });
  }

  addExpense(): void {
    this.extraExpenses.push(this.buildExpenseGroup());
  }

  removeExpense(index: number): void {
    this.extraExpenses.removeAt(index);
  }

  addIncident(): void {
    this.incidents.push(this.buildIncidentGroup());
  }

  removeIncident(index: number): void {
    this.incidents.removeAt(index);
  }

  readonly extrasTotal = computed(() => {
    // Se recalcula en cada render del template a partir del valor actual del FormArray.
    return this.extraExpenses.controls.reduce(
      (sum, ctrl) => sum + (Number(ctrl.get('amount')?.value) || 0),
      0
    );
  });

  fuelPreview() {
    const { vehicleLabel, periodStart, periodEnd } = this.form.getRawValue();
    if (!vehicleLabel) return { liters: 0, spent: 0, movementCount: 0 };
    return this.rendicionService.fuelSpentFor(
      vehicleLabel,
      this.toLocalIsoDate(periodStart),
      this.toLocalIsoDate(periodEnd)
    );
  }

  /**
   * Kilómetros recorridos y rendimiento estimado (L/100km).
   * Es una estimación: compara los litros CARGADOS en el período contra los
   * km recorridos, asumiendo que la carga se usa dentro del mismo período.
   */
  efficiencyPreview() {
    const { odometerStart, odometerEnd } = this.form.getRawValue();
    const fuel = this.fuelPreview();

    if (odometerStart == null || odometerEnd == null || odometerEnd <= odometerStart) {
      return { km: 0, litersPer100km: null as number | null };
    }

    const km = odometerEnd - odometerStart;
    const litersPer100km = fuel.liters > 0 ? (fuel.liters / km) * 100 : 0;
    return { km, litersPer100km };
  }

  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    this.uploading.set(true);
    try {
      const newAttachments: Attachment[] = [];
      for (const file of Array.from(files)) {
        const dataUrl = await fileToDataUrl(file);
        newAttachments.push({
          id: crypto.randomUUID(),
          fileName: file.name,
          dataUrl,
          sizeKb: Math.round(file.size / 1024),
          uploadedAt: new Date().toISOString(),
        });
      }
      this.attachments.update((list) => [...list, ...newAttachments]);
    } finally {
      this.uploading.set(false);
      input.value = '';
    }
  }

  removeAttachment(id: string): void {
    this.attachments.update((list) => list.filter((a) => a.id !== id));
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const payload = {
      vehicleLabel: value.vehicleLabel,
      driverId: value.driverId,
      periodStart: this.toLocalIsoDate(value.periodStart),
      periodEnd: this.toLocalIsoDate(value.periodEnd),
      status: value.status,
      income: value.income ?? undefined,
      odometerStart: value.odometerStart ?? undefined,
      odometerEnd: value.odometerEnd ?? undefined,
      notes: value.notes,
      extraExpenses: value.extraExpenses.map((e) => ({
        id: crypto.randomUUID(),
        description: e.description,
        amount: e.amount,
        date: this.toLocalIsoDate(e.date),
      })),
      incidents: value.incidents.map((i) => ({
        id: crypto.randomUUID(),
        description: i.description,
        date: this.toLocalIsoDate(i.date),
        severity: i.severity,
      })),
      attachments: this.attachments(),
    };

    try {
      if (this.rendicionId) {
        await this.rendicionService.update(this.rendicionId, payload);
      } else {
        await this.rendicionService.create(payload);
      }
      this.router.navigateByUrl('/rendiciones');
    } catch (err) {
      console.error(err);
      alert('No se pudo guardar la rendición. Probá de nuevo.');
    }
  }

  cancel(): void {
    this.router.navigateByUrl('/rendiciones');
  }

  private toLocalIsoDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
