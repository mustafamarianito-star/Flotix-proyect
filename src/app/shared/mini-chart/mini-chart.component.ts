import { Component, Input, computed, signal } from '@angular/core';

export interface ChartPoint {
  label: string;
  value: number;
}

interface LabelRow {
  text: string;
  y: number;
}

interface Bar {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  valueY: number;
  display: string;
  title: string;
  labelRows: LabelRow[];
}

interface LinePoint {
  cx: number;
  cy: number;
  title: string;
  labelRows: LabelRow[];
}

/** Ancho aproximado (px) de un carácter con 'Roboto Mono' a 11px de fuente. */
const AVG_CHAR_WIDTH = 6.5;
const LABEL_LINE_HEIGHT = 12;

@Component({
  selector: 'app-mini-chart',
  standalone: true,
  templateUrl: './mini-chart.component.html',
  styleUrl: './mini-chart.component.scss',
})
export class MiniChartComponent {
  private readonly _data = signal<ChartPoint[]>([]);

  @Input() set data(value: ChartPoint[]) {
    this._data.set(value ?? []);
  }
  get data(): ChartPoint[] {
    return this._data();
  }

  @Input() type: 'bar' | 'line' = 'bar';
  @Input() color = 'var(--accent)';
  @Input() showValues = false;
  @Input() valuePrefix = '';
  @Input() valueSuffix = '';

  /**
   * Ancho del sistema de coordenadas interno (no es un tamaño en px: es la
   * relación con `viewHeight` la que define la proporción del gráfico). Un
   * valor más alto lo hace más "panorámico" — útil para gráficos que ocupan
   * todo el ancho de la página, para que no queden desproporcionadamente altos.
   */
  @Input() viewWidth = 480;
  readonly viewHeight = 220;
  private readonly padTop = 28;
  /** Deja lugar para hasta 2 líneas de etiqueta debajo del eje. */
  private readonly padBottom = 42;

  readonly maxValue = computed(() => Math.max(1, ...this._data().map((d) => d.value)));

  private chartHeight(): number {
    return this.viewHeight - this.padTop - this.padBottom;
  }

  get baselineY(): number {
    return this.viewHeight - this.padBottom;
  }

  private get lastLineY(): number {
    return this.viewHeight - 10;
  }

  private labelRowsFor(label: string, maxWidthPx: number): LabelRow[] {
    const lines = this.wrapLabel(label, maxWidthPx);
    if (lines.length === 1) {
      return [{ text: lines[0], y: this.lastLineY }];
    }
    return [
      { text: lines[0], y: this.lastLineY - LABEL_LINE_HEIGHT },
      { text: lines[1], y: this.lastLineY },
    ];
  }

  readonly bars = computed<Bar[]>(() => {
    const data = this._data();
    const n = data.length || 1;
    const slot = this.viewWidth / n;
    const bw = Math.min(slot * 0.56, 54);
    const chartH = this.chartHeight();
    const max = this.maxValue();
    const maxLabelWidth = slot * 0.94;

    return data.map((d, i) => {
      const h = Math.max(2, (d.value / max) * chartH);
      const x = i * slot + (slot - bw) / 2;
      const y = this.padTop + (chartH - h);
      return {
        x,
        y,
        w: bw,
        h,
        cx: x + bw / 2,
        valueY: y - 8,
        display: this.format(d.value),
        title: `${d.label}: ${this.format(d.value)}`,
        labelRows: this.labelRowsFor(d.label, maxLabelWidth),
      };
    });
  });

  readonly linePoints = computed<LinePoint[]>(() => {
    const data = this._data();
    const n = data.length;
    if (n === 0) return [];
    const chartH = this.chartHeight();
    const max = this.maxValue();
    const step = n === 1 ? this.viewWidth : this.viewWidth / (n - 1);
    const maxLabelWidth = Math.min(step * 0.9, 100);

    return data.map((d, i) => {
      const cx = n === 1 ? this.viewWidth / 2 : i * step;
      const cy = this.padTop + (chartH - (d.value / max) * chartH);
      return {
        cx,
        cy,
        title: `${d.label}: ${this.format(d.value)}`,
        labelRows: this.labelRowsFor(d.label, maxLabelWidth),
      };
    });
  });

  readonly linePath = computed(() =>
    this.linePoints()
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx} ${p.cy}`)
      .join(' ')
  );

  /**
   * Envuelve una etiqueta en hasta 2 líneas cortando por palabra completa,
   * en vez de truncar el texto a una cantidad fija de caracteres (lo que
   * suele cortar palabras a la mitad y se ve mal).
   */
  private wrapLabel(label: string, maxWidthPx: number): string[] {
    const maxChars = Math.max(4, Math.floor(maxWidthPx / AVG_CHAR_WIDTH));
    if (label.length <= maxChars) return [label];

    const words = label.split(' ').filter(Boolean);
    const line1Words: string[] = [];
    let i = 0;

    while (i < words.length) {
      const candidate = [...line1Words, words[i]].join(' ');
      if (candidate.length > maxChars && line1Words.length > 0) break;
      line1Words.push(words[i]);
      i++;
      if (candidate.length > maxChars) break; // una sola palabra ya llena la línea
    }

    const line1 = line1Words.join(' ');
    const rest = words.slice(i).join(' ');

    if (!rest) {
      return [line1.length > maxChars ? this.truncate(line1, maxChars) : line1];
    }

    return [
      line1.length > maxChars ? this.truncate(line1, maxChars) : line1,
      this.truncate(rest, maxChars),
    ];
  }

  private truncate(text: string, maxChars: number): string {
    return text.length <= maxChars ? text : text.slice(0, Math.max(1, maxChars - 1)) + '…';
  }

  private format(value: number): string {
    return `${this.valuePrefix}${Math.round(value).toLocaleString('es-AR')}${this.valueSuffix}`;
  }
}
