import { Component, computed, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { VEHICLE_TYPES } from '../vehicle.model';
import { VehicleService } from '../vehicle.service';

@Component({
  selector: 'app-vehicle-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './vehicle-form.component.html',
  styleUrl: './vehicle-form.component.scss',
})
export class VehicleFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly vehicleService = inject(VehicleService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly vehicleTypes = VEHICLE_TYPES;
  private readonly vehicleId = this.route.snapshot.paramMap.get('id');
  readonly isEditMode = computed(() => !!this.vehicleId);

  readonly form = this.fb.nonNullable.group({
    plate: ['', Validators.required],
    brand: ['', Validators.required],
    model: ['', Validators.required],
    year: [new Date().getFullYear()],
    type: ['Camión' as (typeof VEHICLE_TYPES)[number], Validators.required],
    status: ['activo' as 'activo' | 'inactivo', Validators.required],
    insuranceExpiry: [null as Date | null],
    vtvExpiry: [null as Date | null],
  });

  constructor() {
    if (this.vehicleId) {
      const vehicle = this.vehicleService.getById(this.vehicleId);
      if (vehicle) {
        this.form.patchValue({
          ...vehicle,
          insuranceExpiry: vehicle.insuranceExpiry ? new Date(vehicle.insuranceExpiry) : null,
          vtvExpiry: vehicle.vtvExpiry ? new Date(vehicle.vtvExpiry) : null,
        });
      }
    }
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const label = `${value.type} (${value.plate})`;
    const payload = {
      ...value,
      label,
      insuranceExpiry: value.insuranceExpiry ? this.toLocalIsoDate(value.insuranceExpiry) : undefined,
      vtvExpiry: value.vtvExpiry ? this.toLocalIsoDate(value.vtvExpiry) : undefined,
    };

    if (this.vehicleId) {
      this.vehicleService.update(this.vehicleId, payload);
    } else {
      this.vehicleService.create(payload);
    }
    this.router.navigateByUrl('/vehiculos');
  }

  cancel(): void {
    this.router.navigateByUrl('/vehiculos');
  }

  private toLocalIsoDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
