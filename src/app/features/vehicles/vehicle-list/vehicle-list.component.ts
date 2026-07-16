import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { VehicleService } from '../vehicle.service';

@Component({
  selector: 'app-vehicle-list',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTableModule, MatTooltipModule, RouterLink],
  templateUrl: './vehicle-list.component.html',
  styleUrl: './vehicle-list.component.scss',
})
export class VehicleListComponent {
  private readonly vehicleService = inject(VehicleService);

  readonly displayedColumns = ['label', 'brand', 'type', 'year', 'status', 'actions'];
  readonly vehicles = this.vehicleService.all;

  remove(id: string, label: string): void {
    const confirmed = confirm(`¿Dar de baja el vehículo "${label}"? Esta acción no se puede deshacer.`);
    if (confirmed) {
      this.vehicleService.delete(id);
    }
  }
}
