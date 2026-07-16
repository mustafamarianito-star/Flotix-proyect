import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { DriverService } from './driver.service';

@Component({
  selector: 'app-driver-list',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTableModule,
    MatTooltipModule,
    RouterLink,
  ],
  templateUrl: './driver-list.component.html',
  styleUrl: './driver-list.component.scss',
})
export class DriverListComponent {
  private readonly driverService = inject(DriverService);

  readonly drivers = this.driverService.all;
  readonly displayedColumns = ['name', 'license', 'phone', 'licenseExpiry', 'actions'];

  readonly newName = signal('');
  readonly newLicense = signal('');
  readonly newPhone = signal('');
  readonly newLicenseExpiry = signal('');

  add(): void {
    const name = this.newName().trim();
    if (!name) return;

    this.driverService.create({
      name,
      license: this.newLicense().trim() || undefined,
      phone: this.newPhone().trim() || undefined,
      licenseExpiry: this.newLicenseExpiry() || undefined,
    });

    this.newName.set('');
    this.newLicense.set('');
    this.newPhone.set('');
    this.newLicenseExpiry.set('');
  }

  remove(id: string, name: string): void {
    const confirmed = confirm(`¿Dar de baja a ${name}?`);
    if (confirmed) {
      this.driverService.delete(id);
    }
  }
}
