import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { FuelService } from '../fuel.service';
import { FuelType, MovementKind } from '../fuel.model';

@Component({
  selector: 'app-fuel-list',
  standalone: true,
  imports: [DecimalPipe, MatButtonModule, MatIconModule, MatTableModule, MatTooltipModule, RouterLink],
  templateUrl: './fuel-list.component.html',
  styleUrl: './fuel-list.component.scss',
})
export class FuelListComponent {
  private readonly fuelService = inject(FuelService);

  readonly displayedColumns = ['date', 'movementKind', 'type', 'liters', 'pricePerLiter', 'vehicle', 'actions'];

  readonly typeFilter = signal<FuelType | null>(null);
  readonly kindFilter = signal<MovementKind | null>(null);

  readonly filtered = computed(() =>
    this.fuelService.all().filter((m) => {
      const matchesType = !this.typeFilter() || m.type === this.typeFilter();
      const matchesKind = !this.kindFilter() || m.movementKind === this.kindFilter();
      return matchesType && matchesKind;
    })
  );

  setTypeFilter(type: FuelType | null): void {
    this.typeFilter.set(type);
  }

  setKindFilter(kind: MovementKind | null): void {
    this.kindFilter.set(kind);
  }

  remove(id: string, description: string): void {
    const confirmed = confirm(`¿Eliminar el movimiento "${description}"? Esta acción no se puede deshacer.`);
    if (confirmed) {
      this.fuelService.delete(id);
    }
  }
}
