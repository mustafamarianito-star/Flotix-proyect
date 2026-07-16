export interface ChartSlice {
  label: string;
  value: number;
  color: string;
}

/** Dibuja un gráfico de torta simple y devuelve el PNG en base64 (sin el prefijo data:). */
export function drawPieChartPng(slices: ChartSlice[], size = 320): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size + 70; // espacio extra abajo para la leyenda
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const total = slices.reduce((sum, s) => sum + s.value, 0) || 1;
  const cx = size / 2;
  const cy = size / 2 - 10;
  const radius = size / 2 - 24;

  let start = -Math.PI / 2;
  for (const slice of slices) {
    const angle = (slice.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = slice.color;
    ctx.fill();
    start += angle;
  }

  // Leyenda
  ctx.font = '14px Arial';
  ctx.textBaseline = 'middle';
  let legendY = size + 10;
  for (const slice of slices) {
    ctx.fillStyle = slice.color;
    ctx.fillRect(16, legendY, 14, 14);
    ctx.fillStyle = '#1c2230';
    const pct = Math.round((slice.value / total) * 100);
    ctx.fillText(`${slice.label}: $ ${Math.round(slice.value).toLocaleString('es-AR')} (${pct}%)`, 38, legendY + 7);
    legendY += 22;
  }

  return canvas.toDataURL('image/png').split(',')[1];
}

/** Dibuja un gráfico de barras simple y devuelve el PNG en base64 (sin el prefijo data:). */
export function drawBarChartPng(
  points: { label: string; value: number }[],
  width = 480,
  height = 260,
  color = '#0ea5e9'
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const max = Math.max(1, ...points.map((p) => p.value));
  const chartHeight = height - 50;
  const slot = width / (points.length || 1);
  const barWidth = slot * 0.6;

  ctx.font = '11px Arial';
  ctx.fillStyle = '#1c2230';
  ctx.textAlign = 'center';

  points.forEach((p, i) => {
    const barHeight = (p.value / max) * (chartHeight - 20);
    const x = i * slot + slot * 0.2;
    const y = chartHeight - barHeight;

    ctx.fillStyle = color;
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = '#1c2230';
    ctx.fillText(
      `$ ${Math.round(p.value).toLocaleString('es-AR')}`,
      x + barWidth / 2,
      Math.max(y - 6, 10)
    );

    // Etiqueta (recortada si es muy larga)
    const label = p.label.length > 14 ? p.label.slice(0, 13) + '…' : p.label;
    ctx.fillText(label, x + barWidth / 2, chartHeight + 16);
  });

  return canvas.toDataURL('image/png').split(',')[1];
}
