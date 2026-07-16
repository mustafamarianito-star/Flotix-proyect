import { Component, computed, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FuelService } from '../fuel.service';
import { VehicleService } from '../../vehicles/vehicle.service';

@Component({
  selector: 'app-fuel-form',
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
  templateUrl: './fuel-form.component.html',
  styleUrl: './fuel-form.component.scss',
})
export class FuelFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly fuelService = inject(FuelService);
  private readonly vehicleService = inject(VehicleService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly vehicles = this.vehicleService.activeOnly;

  private readonly movementId = this.route.snapshot.paramMap.get('id');
  readonly isEditMode = computed(() => !!this.movementId);

  readonly form = this.fb.nonNullable.group({
    date: [new Date(), Validators.required],
    movementKind: ['carga' as 'carga' | 'consumo', Validators.required],
    type: ['diesel' as 'nafta' | 'diesel', Validators.required],
    liters: [0, [Validators.required, Validators.min(0.1)]],
    pricePerLiter: [0, [Validators.required, Validators.min(0)]],
    vehicle: [''],
    notes: [''],
  });

  constructor() {
    if (this.movementId) {
      const movement = this.fuelService.getById(this.movementId);
      if (movement) {
        this.form.patchValue({
          ...movement,
          date: new Date(movement.date),
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
    const payload = {
      ...value,
      date: this.toLocalIsoDate(value.date),
    };

    if (this.movementId) {
      this.fuelService.update(this.movementId, payload);
    } else {
      this.fuelService.create(payload);
    }
    this.router.navigateByUrl('/combustible');
  }

  cancel(): void {
    this.router.navigateByUrl('/combustible');
  }

  /**
   * Convierte un Date a "yyyy-mm-dd" usando los componentes LOCALES de la
   * fecha (no UTC). `Date#toISOString()` convierte a UTC primero, lo que
   * puede correr la fecha un día para adelante o atrás según la hora del
   * día y el huso horario del usuario — por eso no lo usamos acá.
   */
  private toLocalIsoDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
