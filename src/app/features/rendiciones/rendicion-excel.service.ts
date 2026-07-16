import { Injectable, inject } from '@angular/core';
import { DriverService } from '../drivers/driver.service';
import { Rendicion } from './rendicion.model';
import { RendicionService } from './rendicion.service';
import { drawBarChartPng, drawPieChartPng } from './chart-png.util';

const BRAND_NAVY = 'FF0B1C33';
const BRAND_BLUE = 'FF0EA5E9';
const WHITE = 'FFFFFFFF';

function headerFill(): any {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_NAVY } };
}

function headerFont(): any {
  return { bold: true, color: { argb: WHITE } };
}

@Injectable({ providedIn: 'root' })
export class RendicionExcelService {
  private readonly rendicionService = inject(RendicionService);
  private readonly driverService = inject(DriverService);

  /** Exporta un resumen con gráficos y métricas de TODAS las rendiciones dadas (ej. las filtradas en el listado). */
  async exportAll(rendiciones: Rendicion[]): Promise<void> {
    const ExcelJS = await import('exceljs');

    const rows = rendiciones.map((r) => {
      const fuel = this.rendicionService.fuelSpentFor(r.vehicleLabel, r.periodStart, r.periodEnd);
      const extrasTotal = r.extraExpenses.reduce((sum, e) => sum + e.amount, 0);
      const km =
        r.odometerStart != null && r.odometerEnd != null && r.odometerEnd > r.odometerStart
          ? r.odometerEnd - r.odometerStart
          : 0;
      return {
        rendicion: r,
        driverName: this.driverService.getById(r.driverId)?.name ?? '—',
        fuel,
        extrasTotal,
        total: fuel.spent + extrasTotal,
        km,
      };
    });

    const totals = rows.reduce(
      (acc, row) => ({
        liters: acc.liters + row.fuel.liters,
        fuelSpent: acc.fuelSpent + row.fuel.spent,
        extras: acc.extras + row.extrasTotal,
        total: acc.total + row.total,
        km: acc.km + row.km,
        incidents: acc.incidents + row.rendicion.incidents.length,
      }),
      { liters: 0, fuelSpent: 0, extras: 0, total: 0, km: 0, incidents: 0 }
    );
    const avgLitersPer100km = totals.km > 0 ? (totals.liters / totals.km) * 100 : null;

    const byStatus = { pendiente: 0, aprobada: 0, pagada: 0 } as Record<string, number>;
    for (const row of rows) byStatus[row.rendicion.status] = (byStatus[row.rendicion.status] ?? 0) + 1;

    const byVehicle = new Map<string, number>();
    for (const row of rows) {
      byVehicle.set(row.rendicion.vehicleLabel, (byVehicle.get(row.rendicion.vehicleLabel) ?? 0) + row.total);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Flotix — Gestión de Flota';
    workbook.created = new Date();

    this.buildResumenGeneralSheet(workbook, totals, avgLitersPer100km, byStatus, byVehicle, rows.length);
    this.buildDetalleSheet(workbook, rows);

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rendiciones-resumen-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private buildResumenGeneralSheet(
    workbook: import('exceljs').Workbook,
    totals: { liters: number; fuelSpent: number; extras: number; total: number; km: number; incidents: number },
    avgLitersPer100km: number | null,
    byStatus: Record<string, number>,
    byVehicle: Map<string, number>,
    count: number
  ): void {
    const sheet = workbook.addWorksheet('Resumen general');
    sheet.columns = [{ width: 26 }, { width: 20 }, { width: 4 }, { width: 22 }, { width: 22 }];

    sheet.mergeCells('A1:E1');
    const title = sheet.getCell('A1');
    title.value = `Resumen de rendiciones (${count})`;
    title.font = { bold: true, size: 16, color: { argb: BRAND_NAVY } };
    sheet.getCell('A2').value = `Generado el ${new Date().toLocaleDateString('es-AR')}`;
    sheet.getCell('A2').font = { italic: true, color: { argb: 'FF5C6773' } };

    let r = 4;
    sheet.getCell(`A${r}`).value = 'Métricas totales';
    sheet.getCell(`A${r}`).font = headerFont();
    sheet.getCell(`A${r}`).fill = headerFill();
    sheet.mergeCells(`A${r}:B${r}`);
    r++;

    const metricRows: [string, string][] = [
      ['Litros cargados (total)', `${totals.liters.toFixed(1)} L`],
      ['Gasto en combustible', `$ ${totals.fuelSpent.toFixed(2)}`],
      ['Gastos extra', `$ ${totals.extras.toFixed(2)}`],
      ['Total general', `$ ${totals.total.toFixed(2)}`],
      ['Km recorridos (total)', totals.km > 0 ? `${totals.km.toFixed(0)} km` : 'Sin datos de odómetro'],
      [
        'Rendimiento promedio',
        avgLitersPer100km != null ? `${avgLitersPer100km.toFixed(1)} L/100km` : '—',
      ],
      ['Siniestros notificados', String(totals.incidents)],
      ['Pendientes / Aprobadas / Pagadas', `${byStatus['pendiente'] ?? 0} / ${byStatus['aprobada'] ?? 0} / ${byStatus['pagada'] ?? 0}`],
    ];
    const metricsStartRow = r;
    for (const [label, value] of metricRows) {
      sheet.getCell(`A${r}`).value = label;
      sheet.getCell(`A${r}`).font = { bold: true };
      sheet.getCell(`B${r}`).value = value;
      r++;
    }
    const metricsEndRow = r;

    // --- Gráfico de torta: combustible vs gastos extra (agregado) ---
    if (totals.total > 0) {
      const pieBase64 = drawPieChartPng([
        { label: 'Combustible', value: totals.fuelSpent, color: '#0ea5e9' },
        { label: 'Gastos extra', value: totals.extras, color: '#c8720e' },
      ]);
      const imageId = workbook.addImage({ base64: pieBase64, extension: 'png' });
      sheet.addImage(imageId, {
        tl: { col: 3, row: metricsStartRow - 1 },
        ext: { width: 320, height: 380 },
      });
    }

    // --- Gráfico de barras: total gastado por vehículo ---
    if (byVehicle.size >= 1) {
      const barBase64 = drawBarChartPng(
        [...byVehicle.entries()].map(([label, value]) => ({ label, value }))
      );
      const imageId = workbook.addImage({ base64: barBase64, extension: 'png' });
      sheet.addImage(imageId, {
        tl: { col: 3, row: metricsEndRow + 2 },
        ext: { width: 480, height: 260 },
      });
    }
  }

  private buildDetalleSheet(
    workbook: import('exceljs').Workbook,
    rows: {
      rendicion: Rendicion;
      driverName: string;
      fuel: { liters: number; spent: number };
      extrasTotal: number;
      total: number;
      km: number;
    }[]
  ): void {
    const sheet = workbook.addWorksheet('Detalle');
    sheet.columns = [
      { header: 'Desde', key: 'from', width: 12 },
      { header: 'Hasta', key: 'to', width: 12 },
      { header: 'Vehículo', key: 'vehicle', width: 24 },
      { header: 'Chofer', key: 'driver', width: 20 },
      { header: 'Litros', key: 'liters', width: 12 },
      { header: 'Combustible ($)', key: 'fuel', width: 16 },
      { header: 'Gastos extra ($)', key: 'extras', width: 16 },
      { header: 'Total ($)', key: 'total', width: 14 },
      { header: 'Km', key: 'km', width: 10 },
      { header: 'Rendimiento (L/100km)', key: 'efficiency', width: 20 },
      { header: 'Siniestros', key: 'incidents', width: 12 },
      { header: 'Estado', key: 'status', width: 14 },
    ];
    sheet.getRow(1).font = headerFont();
    sheet.getRow(1).eachCell((cell) => (cell.fill = headerFill()));

    for (const row of rows) {
      sheet.addRow({
        from: row.rendicion.periodStart,
        to: row.rendicion.periodEnd,
        vehicle: row.rendicion.vehicleLabel,
        driver: row.driverName,
        liters: Number(row.fuel.liters.toFixed(1)),
        fuel: Number(row.fuel.spent.toFixed(2)),
        extras: Number(row.extrasTotal.toFixed(2)),
        total: Number(row.total.toFixed(2)),
        km: row.km || '',
        efficiency: row.km > 0 ? Number(((row.fuel.liters / row.km) * 100).toFixed(1)) : '',
        incidents: row.rendicion.incidents.length,
        status: row.rendicion.status,
      });
    }
    sheet.getColumn('fuel').numFmt = '"$"#,##0.00';
    sheet.getColumn('extras').numFmt = '"$"#,##0.00';
    sheet.getColumn('total').numFmt = '"$"#,##0.00';
  }

  async export(rendicion: Rendicion): Promise<void> {
    const ExcelJS = await import('exceljs');

    const fuel = this.rendicionService.fuelSpentFor(
      rendicion.vehicleLabel,
      rendicion.periodStart,
      rendicion.periodEnd
    );
    const driverName = this.driverService.getById(rendicion.driverId)?.name ?? '—';
    const extrasTotal = rendicion.extraExpenses.reduce((sum, e) => sum + e.amount, 0);
    const total = fuel.spent + extrasTotal;

    const km =
      rendicion.odometerStart != null &&
      rendicion.odometerEnd != null &&
      rendicion.odometerEnd > rendicion.odometerStart
        ? rendicion.odometerEnd - rendicion.odometerStart
        : 0;
    const litersPer100km = km > 0 ? (fuel.liters / km) * 100 : null;
    const costPerKm = km > 0 ? total / km : null;
    const days = Math.max(1, this.daysBetween(rendicion.periodStart, rendicion.periodEnd));
    const avgDailySpend = total / days;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Flotix — Gestión de Flota';
    workbook.created = new Date();

    this.buildResumenSheet(workbook, {
      rendicion,
      driverName,
      fuel,
      extrasTotal,
      total,
      km,
      litersPer100km,
      costPerKm,
      days,
      avgDailySpend,
    });
    this.buildGastosSheet(workbook, rendicion);
    this.buildSiniestrosSheet(workbook, rendicion);
    await this.buildFacturasSheet(workbook, rendicion);

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rendicion-${rendicion.vehicleLabel.replace(/[^\w]+/g, '_')}-${rendicion.periodStart}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private buildResumenSheet(
    workbook: import('exceljs').Workbook,
    ctx: {
      rendicion: Rendicion;
      driverName: string;
      fuel: { liters: number; spent: number; movementCount: number };
      extrasTotal: number;
      total: number;
      km: number;
      litersPer100km: number | null;
      costPerKm: number | null;
      days: number;
      avgDailySpend: number;
    }
  ): void {
    const sheet = workbook.addWorksheet('Resumen');
    sheet.columns = [{ width: 26 }, { width: 22 }, { width: 4 }, { width: 22 }, { width: 22 }];

    sheet.mergeCells('A1:E1');
    const title = sheet.getCell('A1');
    title.value = `Rendición — ${ctx.rendicion.vehicleLabel}`;
    title.font = { bold: true, size: 16, color: { argb: BRAND_NAVY } };

    sheet.getCell('A2').value = `Período: ${ctx.rendicion.periodStart} → ${ctx.rendicion.periodEnd}`;
    sheet.getCell('A2').font = { italic: true, color: { argb: 'FF5C6773' } };

    // --- Datos generales ---
    const rows: [string, string | number][] = [
      ['Chofer', ctx.driverName],
      ['Estado', ctx.rendicion.status],
      ['Días del período', ctx.days],
    ];

    let r = 4;
    sheet.getCell(`A${r}`).value = 'Datos generales';
    sheet.getCell(`A${r}`).font = headerFont();
    sheet.getCell(`A${r}`).fill = headerFill();
    sheet.mergeCells(`A${r}:B${r}`);
    r++;
    for (const [label, value] of rows) {
      sheet.getCell(`A${r}`).value = label;
      sheet.getCell(`A${r}`).font = { bold: true };
      sheet.getCell(`B${r}`).value = value;
      r++;
    }

    // --- Métricas clave ---
    r++;
    const metricsStartRow = r;
    sheet.getCell(`A${r}`).value = 'Métricas';
    sheet.getCell(`A${r}`).font = headerFont();
    sheet.getCell(`A${r}`).fill = headerFill();
    sheet.mergeCells(`A${r}:B${r}`);
    r++;

    const metricRows: [string, string][] = [
      ['Litros cargados', `${ctx.fuel.liters.toFixed(1)} L`],
      ['Gasto en combustible', `$ ${ctx.fuel.spent.toFixed(2)}`],
      ['Gastos extra', `$ ${ctx.extrasTotal.toFixed(2)}`],
      ['Total rendición', `$ ${ctx.total.toFixed(2)}`],
      ['Km recorridos', ctx.km > 0 ? `${ctx.km.toFixed(0)} km` : 'Sin datos de odómetro'],
      [
        'Rendimiento estimado',
        ctx.litersPer100km != null ? `${ctx.litersPer100km.toFixed(1)} L/100km` : '—',
      ],
      ['Costo por km', ctx.costPerKm != null ? `$ ${ctx.costPerKm.toFixed(2)}` : '—'],
      ['Gasto promedio diario', `$ ${ctx.avgDailySpend.toFixed(2)}`],
      ['Siniestros notificados', String(ctx.rendicion.incidents.length)],
    ];
    for (const [label, value] of metricRows) {
      sheet.getCell(`A${r}`).value = label;
      sheet.getCell(`A${r}`).font = { bold: true };
      sheet.getCell(`B${r}`).value = value;
      r++;
    }
    const metricsEndRow = r;

    // --- Gráfico de torta: combustible vs gastos extra ---
    if (ctx.total > 0) {
      const pieBase64 = drawPieChartPng([
        { label: 'Combustible', value: ctx.fuel.spent, color: '#0ea5e9' },
        { label: 'Gastos extra', value: ctx.extrasTotal, color: '#c8720e' },
      ]);
      const imageId = workbook.addImage({ base64: pieBase64, extension: 'png' });
      sheet.addImage(imageId, {
        tl: { col: 3, row: metricsStartRow - 1 },
        ext: { width: 320, height: 380 },
      });
    }

    // --- Gráfico de barras: gastos extra por concepto (si hay 2+) ---
    if (ctx.rendicion.extraExpenses.length >= 2) {
      const barBase64 = drawBarChartPng(
        ctx.rendicion.extraExpenses.map((e) => ({ label: e.description, value: e.amount }))
      );
      const imageId = workbook.addImage({ base64: barBase64, extension: 'png' });
      sheet.addImage(imageId, {
        tl: { col: 3, row: metricsEndRow + 2 },
        ext: { width: 480, height: 260 },
      });
    }
  }

  private buildGastosSheet(workbook: import('exceljs').Workbook, rendicion: Rendicion): void {
    const sheet = workbook.addWorksheet('Gastos extra');
    sheet.columns = [
      { header: 'Fecha', key: 'date', width: 14 },
      { header: 'Descripción', key: 'description', width: 34 },
      { header: 'Monto', key: 'amount', width: 16 },
    ];
    sheet.getRow(1).font = headerFont();
    sheet.getRow(1).eachCell((cell) => (cell.fill = headerFill()));

    for (const e of rendicion.extraExpenses) {
      sheet.addRow({ date: e.date, description: e.description, amount: e.amount });
    }
    if (rendicion.extraExpenses.length > 0) {
      const totalRow = sheet.addRow({
        date: '',
        description: 'Total',
        amount: rendicion.extraExpenses.reduce((sum, e) => sum + e.amount, 0),
      });
      totalRow.font = { bold: true };
    }
    sheet.getColumn('amount').numFmt = '"$"#,##0.00';
  }

  private buildSiniestrosSheet(workbook: import('exceljs').Workbook, rendicion: Rendicion): void {
    const sheet = workbook.addWorksheet('Siniestros');
    sheet.columns = [
      { header: 'Fecha', key: 'date', width: 14 },
      { header: 'Descripción', key: 'description', width: 40 },
      { header: 'Gravedad', key: 'severity', width: 14 },
    ];
    sheet.getRow(1).font = headerFont();
    sheet.getRow(1).eachCell((cell) => (cell.fill = headerFill()));

    if (rendicion.incidents.length === 0) {
      sheet.addRow({ date: '', description: 'Sin siniestros notificados en este período.', severity: '' });
    }
    for (const i of rendicion.incidents) {
      sheet.addRow({ date: i.date, description: i.description, severity: i.severity });
    }
  }

  private async buildFacturasSheet(
    workbook: import('exceljs').Workbook,
    rendicion: Rendicion
  ): Promise<void> {
    const sheet = workbook.addWorksheet('Facturas');
    sheet.columns = [{ width: 4 }, { width: 40 }];

    if (rendicion.attachments.length === 0) {
      sheet.getCell('A1').value = 'Sin facturas adjuntas en esta rendición.';
      return;
    }

    let row = 1;
    for (const attachment of rendicion.attachments) {
      const ext = this.excelImageExtension(attachment.dataUrl);

      sheet.getCell(`B${row}`).value = `${attachment.fileName} (${attachment.sizeKb} KB)`;
      sheet.getCell(`B${row}`).font = { bold: true };
      row += 1;

      if (ext) {
        try {
          const base64 = attachment.dataUrl.split(',')[1];
          const { width, height } = await this.imageSize(attachment.dataUrl, 320);
          const imageId = workbook.addImage({ base64, extension: ext });
          sheet.addImage(imageId, {
            tl: { col: 1, row: row - 1 },
            ext: { width, height },
          });
          row += Math.ceil(height / 20) + 2;
        } catch {
          sheet.getCell(`B${row}`).value = '(No se pudo incrustar la imagen)';
          row += 2;
        }
      } else {
        sheet.getCell(`B${row}`).value =
          'Archivo PDF — Excel no puede incrustar PDFs como imagen. Abrí el archivo original desde la app.';
        sheet.getCell(`B${row}`).font = { italic: true, color: { argb: 'FF5C6773' } };
        row += 2;
      }
    }
  }

  private excelImageExtension(dataUrl: string): 'png' | 'jpeg' | null {
    if (dataUrl.startsWith('data:image/png')) return 'png';
    if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'jpeg';
    return null;
  }

  private imageSize(dataUrl: string, maxWidth: number): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { naturalWidth: width, naturalHeight: height } = img;
        if (width > maxWidth) {
          height = height * (maxWidth / width);
          width = maxWidth;
        }
        resolve({ width, height });
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  private daysBetween(startIso: string, endIso: string): number {
    const start = new Date(startIso + 'T00:00:00');
    const end = new Date(endIso + 'T00:00:00');
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }
}
