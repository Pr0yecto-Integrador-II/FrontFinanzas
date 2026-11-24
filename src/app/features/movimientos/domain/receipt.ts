/**
 * Dominio puro del análisis de fotos (MVP 3, HU21 y HU25).
 * Sin Angular, Dexie ni red: recibe lo que leyó el servicio de visión y devuelve un
 * BORRADOR. Nunca guarda: el usuario siempre confirma con "Guardar" (D3-06).
 * La interpretación es determinista, no un modelo de lenguaje (D3-05).
 */
import { daysInMonth, fmtIso } from '../../../core/dates';
import { MAX_AMOUNT_MINOR, parseMoney } from '../../../core/money';
import { Category } from '../../../core/models';
import { ImageAnalysis } from '../../../core/vision/image-analysis';
import { nameKey } from '../../categorias/domain/rules';
import { MAX_DESCRIPTION } from './rules';
import { VoiceDraft, spokenMoney } from './voice';

// ---------------------------------------------------------------------------
// HU21 — etiquetas → categoría sugerida
// ---------------------------------------------------------------------------

/** Etiquetas con menos confianza no cuentan como evidencia. */
export const MIN_TAG_CONFIDENCE = 0.5;
/** Peso de cada palabra de la descripción (la descripción es menos fiable que una etiqueta). */
export const CAPTION_WORD_WEIGHT = 0.4;

/**
 * Etiqueta del servicio (en inglés) → nombre de una categoría predeterminada de gasto
 * (backend: categories/domain/catalog.py). Es un dato: se prueba y se amplía sin tocar la lógica.
 */
export const TAG_TO_CATEGORY: Readonly<Record<string, string>> = {
  food: 'Alimentación',
  meal: 'Alimentación',
  lunch: 'Alimentación',
  dinner: 'Alimentación',
  breakfast: 'Alimentación',
  pizza: 'Alimentación',
  burger: 'Alimentación',
  sandwich: 'Alimentación',
  fruit: 'Alimentación',
  vegetable: 'Alimentación',
  dish: 'Alimentación',
  cuisine: 'Alimentación',
  snack: 'Alimentación',
  dessert: 'Alimentación',
  bread: 'Alimentación',
  coffee: 'Alimentación',
  restaurant: 'Alimentación',
  groceries: 'Alimentación',
  car: 'Transporte',
  fuel: 'Transporte',
  gasoline: 'Transporte',
  'fuel pump': 'Transporte',
  'gas station': 'Transporte',
  bus: 'Transporte',
  taxi: 'Transporte',
  train: 'Transporte',
  motorcycle: 'Transporte',
  parking: 'Transporte',
  medicine: 'Salud',
  medication: 'Salud',
  pill: 'Salud',
  drug: 'Salud',
  pharmacy: 'Salud',
  hospital: 'Salud',
  clothing: 'Compras',
  shoe: 'Compras',
  footwear: 'Compras',
  shopping: 'Compras',
  electronics: 'Compras',
  movie: 'Ocio',
  cinema: 'Ocio',
  concert: 'Ocio',
  'video game': 'Ocio',
};

export interface CategorySuggestion {
  categoryId: string;
  /** Etiqueta (o palabra de la descripción) que más pesó en la sugerencia. */
  matchedTag: string;
}

/**
 * Elige la categoría de gasto del usuario que mejor encaja con lo que se ve en la foto.
 * Resuelve por `nameKey` contra las categorías del usuario: si no tiene esa categoría
 * (la renombró o la borró), no sugiere nada y NUNCA crea una (HU08).
 */
export function suggestCategory(
  analysis: Pick<ImageAnalysis, 'tags' | 'caption'>,
  categories: readonly Category[],
): CategorySuggestion | null {
  const evidence: { word: string; weight: number }[] = analysis.tags
    .filter((t) => t.confidence >= MIN_TAG_CONFIDENCE)
    .map((t) => ({ word: nameKey(t.name), weight: t.confidence }));
  for (const w of nameKey(analysis.caption ?? '').split(/[^a-z0-9]+/)) {
    if (w) evidence.push({ word: w, weight: CAPTION_WORD_WEIGHT });
  }

  const byName = new Map<string, { score: number; word: string; top: number }>();
  for (const { word, weight } of evidence) {
    const name = TAG_TO_CATEGORY[word];
    if (!name) continue;
    const entry = byName.get(name) ?? { score: 0, word, top: 0 };
    entry.score += weight;
    if (weight > entry.top) {
      entry.top = weight;
      entry.word = word;
    }
    byName.set(name, entry);
  }

  const ranked = [...byName.entries()].sort((a, b) => b[1].score - a[1].score);
  for (const [name, { word }] of ranked) {
    const key = nameKey(name);
    const category = categories.find(
      (c) => !c.deletedAt && c.type === 'expense' && c.nameKey === key,
    );
    if (category) return { categoryId: category.id, matchedTag: word };
  }
  return null;
}

// ---------------------------------------------------------------------------
// HU21 — líneas leídas (OCR) → comercio, total y fecha
// ---------------------------------------------------------------------------

export interface ReceiptText {
  merchant: string | null;
  /** Centavos; `null` si no hay un total claro (nunca se adivina). */
  totalMinor: number | null;
  /** Fecha ISO válida leída del recibo, o `null`. */
  occurredOn: string | null;
}

const AMOUNT_RE = /\d[\d.,]*\d|\d/g;
const NOT_A_TOTAL = new Set([
  'subtotal',
  'items',
  'articulos',
  'unidades',
  'cantidad',
  'iva',
  'propina',
]);
const NOT_A_MERCHANT = new Set([
  'nit',
  'factura',
  'recibo',
  'tel',
  'www',
  'fecha',
  'caja',
  'total',
]);

/** Palabras sueltas de una línea, sin tildes ni mayúsculas. */
function wordsOf(line: string): string[] {
  return nameKey(line)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function amountsIn(line: string): number[] {
  const found: number[] = [];
  for (const raw of line.match(AMOUNT_RE) ?? []) {
    const minor = parseMoney(raw);
    if (minor !== null && minor > 0 && minor <= MAX_AMOUNT_MINOR) found.push(minor);
  }
  return found;
}

/**
 * Total: líneas con la palabra "total" (no subtotal, IVA ni número de artículos). Si el
 * monto está en la línea siguiente, la toma. Prefiere "total a pagar"; si no, el mayor.
 */
export function findTotal(lines: readonly string[]): number | null {
  const preferred: number[] = [];
  const others: number[] = [];
  lines.forEach((line, i) => {
    const key = nameKey(line);
    const words = wordsOf(line);
    if (!words.includes('total') || key.includes('sub total')) return;
    if (words.some((w) => NOT_A_TOTAL.has(w))) return;
    let amounts = amountsIn(line);
    if (amounts.length === 0 && i + 1 < lines.length) amounts = amountsIn(lines[i + 1]);
    (words.includes('pagar') ? preferred : others).push(...amounts);
  });
  const pool = preferred.length > 0 ? preferred : others;
  return pool.length > 0 ? Math.max(...pool) : null;
}

function validDate(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return fmtIso(y, m, d);
}

/** Acepta dd/mm/aaaa (formato colombiano, día primero) y aaaa-mm-dd. */
export function findDate(lines: readonly string[]): string | null {
  for (const line of lines) {
    const dmy = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b/.exec(line);
    const fromDmy = dmy ? validDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1])) : null;
    if (fromDmy) return fromDmy;
    const ymd = /\b(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})\b/.exec(line);
    const fromYmd = ymd ? validDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3])) : null;
    if (fromYmd) return fromYmd;
  }
  return null;
}

function titleCaseIfShouting(text: string): string {
  if (text !== text.toLocaleUpperCase('es')) return text;
  return text
    .toLocaleLowerCase('es')
    .replace(/(^|\s)(\p{L})/gu, (_, sp: string, ch: string) => sp + ch.toLocaleUpperCase('es'));
}

/** Comercio: primera de las primeras líneas que parezca un nombre (no NIT, teléfono, etc.). */
export function findMerchant(lines: readonly string[]): string | null {
  for (const raw of lines.slice(0, 4)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    const letters = (line.match(/\p{L}/gu) ?? []).length;
    if (line.length < 3 || line.length > 40 || letters < 3 || letters / line.length < 0.6) continue;
    if (wordsOf(line).some((w) => NOT_A_MERCHANT.has(w) || w.startsWith('http'))) continue;
    return titleCaseIfShouting(line);
  }
  return null;
}

export function parseReceiptText(lines: readonly string[]): ReceiptText {
  return {
    merchant: findMerchant(lines),
    totalMinor: findTotal(lines),
    occurredOn: findDate(lines),
  };
}

// ---------------------------------------------------------------------------
// HU21 — borrador completo
// ---------------------------------------------------------------------------

/** Borrador compatible con el del dictado: el formulario lo aplica con el mismo código. */
export interface ReceiptDraft extends VoiceDraft {
  merchant: string | null;
  /** Etiqueta que motivó la categoría sugerida; `null` si no hubo sugerencia. */
  suggestedTag: string | null;
  /** La foto no aportó nada utilizable (ni monto, ni comercio, ni categoría). */
  empty: boolean;
}

/** Una foto siempre produce un gasto: un recibo o una compra no son un ingreso. */
export function buildReceiptDraft(
  analysis: ImageAnalysis,
  categories: readonly Category[],
  today: string,
  lastUsedExpenseCategory: string | null = null,
): ReceiptDraft {
  const text = parseReceiptText(analysis.ocrLines);
  const suggestion = suggestCategory(analysis, categories);
  const occurredOn = text.occurredOn ?? today;
  return {
    type: 'expense',
    amountMinor: text.totalMinor,
    categoryId: suggestion?.categoryId ?? lastUsedExpenseCategory,
    occurredOn,
    description: (text.merchant ?? '').slice(0, MAX_DESCRIPTION),
    // Una fecha futura (p. ej. mal leída) nunca se guarda: el formulario muestra el error.
    futureDate: occurredOn > today,
    merchant: text.merchant,
    suggestedTag: suggestion?.matchedTag ?? null,
    empty: text.totalMinor === null && text.merchant === null && suggestion === null,
  };
}

// ---------------------------------------------------------------------------
// HU25 — borrador → texto para leer en voz alta
// ---------------------------------------------------------------------------

/**
 * "Recibo de Éxito, total $45.900, categoría sugerida Alimentación".
 * Usa `spokenMoney` (como HU18): la voz es-CO lee "$45.900" como una cantidad en pesos.
 */
export function describeReceipt(
  draft: Pick<ReceiptDraft, 'merchant' | 'amountMinor'>,
  categoryName: string | undefined,
  currency: string,
): string {
  const parts = [draft.merchant ? `Recibo de ${draft.merchant}` : 'Compra detectada en la foto'];
  parts.push(
    draft.amountMinor !== null
      ? `total ${spokenMoney(draft.amountMinor, currency)}`
      : 'no se detectó el monto',
  );
  if (categoryName) parts.push(`categoría sugerida ${categoryName}`);
  return parts.join(', ');
}
