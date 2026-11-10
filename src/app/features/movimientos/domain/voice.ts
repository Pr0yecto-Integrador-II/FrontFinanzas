/**
 * Dominio puro de los servicios de voz del MVP 2 (HU17–HU19).
 * Sin Angular, Dexie ni SDK: recibe todo por parámetro (fechas ISO desde el Clock).
 */
import { addDays, longDate, parseIso } from '../../../core/dates';
import { MAX_AMOUNT_MINOR, parseMoney } from '../../../core/money';
import { Category, Transaction, TxType } from '../../../core/models';
import { nameKey } from '../../categorias/domain/rules';
import { MAX_DESCRIPTION } from './rules';

// ---------------------------------------------------------------------------
// HU17 — dictado → borrador de movimiento
// ---------------------------------------------------------------------------

export interface VoiceDraft {
  type: TxType;
  /** Centavos; `null` si no se reconoció un monto válido (> 0 y hasta 13 dígitos). */
  amountMinor: number | null;
  categoryId: string | null;
  occurredOn: string;
  description: string;
  /** El dictado mencionaba una fecha futura ("mañana"): el formulario mostrará el error. */
  futureDate: boolean;
}

export const OTHER_EXPENSE_NAME = 'Otros gastos';
export const OTHER_INCOME_NAME = 'Otros ingresos';

export const INCOME_WORDS = [
  'ingreso',
  'ingrese',
  'recibi',
  'me pagaron',
  'me depositaron',
  'me consignaron',
  'me transfirieron',
  'salario',
  'cobre',
  'gane',
];
export const EXPENSE_WORDS = [
  'gaste',
  'pague',
  'compre',
  'gasto',
  'comi',
  'almorce',
  'desayune',
  'cene',
  'recargue',
];
/** Verbos de orden: "agrega un gasto…", "registra…" (y "nuevo", que acompaña a gasto/ingreso). */
export const ADD_WORDS = [
  'agrega',
  'agregar',
  'agregame',
  'anade',
  'anadir',
  'anademe',
  'registra',
  'registrar',
  'registrame',
  'anota',
  'anotar',
  'crea',
  'crear',
  'apunta',
  'apuntar',
  'guarda',
  'guardar',
  'agregale',
  'anadele',
  'ingresa',
  'ingresar',
  'ponme',
  'pon',
  'nuevo',
  'nueva',
];
/** Conectores que introducen el motivo ("porque comí en…"): no son parte del concepto. */
const CAUSAL_WORDS = ['porque', 'ya que', 'debido a', 'por concepto de'];
const COMMAND_WORDS = [
  ...INCOME_WORDS,
  ...EXPENSE_WORDS,
  ...ADD_WORDS.filter((w) => w !== 'nuevo' && w !== 'nueva'),
  'nuevo gasto',
  'nuevo ingreso',
  'nueva compra',
  ...CAUSAL_WORDS,
];

/**
 * Palabras que delatan la categoría cuando no se nombra ("comí en…" → Alimentación).
 * Se indexan por `nameKey` de las categorías predeterminadas; si el usuario renombró una,
 * simplemente no aplica y se usa la última usada o «Otros».
 */
const CATEGORY_HINTS: Record<string, readonly string[]> = {
  alimentacion: [
    'comi',
    'comida',
    'almuerzo',
    'almorce',
    'desayuno',
    'desayune',
    'cena',
    'cene',
    'restaurante',
    'mercado',
    'supermercado',
    'domicilio',
    'cafe',
    'pizza',
    'hamburguesa',
    'panaderia',
  ],
  transporte: [
    'taxi',
    'uber',
    'bus',
    'buseta',
    'metro',
    'transmilenio',
    'gasolina',
    'peaje',
    'parqueadero',
    'pasaje',
    'moto',
  ],
  vivienda: ['arriendo', 'alquiler', 'hipoteca', 'administracion'],
  servicios: ['luz', 'agua', 'internet', 'energia', 'celular', 'telefono', 'recarga', 'recargue'],
  salud: ['medico', 'medicina', 'medicinas', 'droga', 'drogueria', 'farmacia', 'dentista', 'eps'],
  educacion: ['matricula', 'curso', 'universidad', 'colegio', 'libro', 'libros', 'semestre'],
  ocio: ['cine', 'netflix', 'spotify', 'fiesta', 'concierto', 'videojuego', 'trago', 'paseo'],
  compras: ['ropa', 'zapatos', 'camisa', 'regalo', 'amazon', 'tienda'],
  salario: ['sueldo', 'nomina', 'quincena'],
  'trabajo independiente': ['freelance', 'honorarios', 'cliente', 'proyecto'],
};
const CURRENCY_WORDS = ['$', 'pesos', 'peso', 'cop', 'dolares', 'dolar', 'usd', 'euros', 'euro'];
const DATE_WORDS = ['pasado manana', 'anteayer', 'manana', 'ayer', 'hoy'];
const FILLER = new Set([
  'en',
  'de',
  'del',
  'por',
  'para',
  'la',
  'el',
  'los',
  'las',
  'un',
  'una',
  'uno',
  'y',
  'con',
  'categoria',
  'fuente',
  'a',
  'al',
  'mi',
  'me',
  'lo',
  'que',
]);

const UNITS: Record<string, number> = {
  cero: 0,
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiun: 21,
  veintiuno: 21,
  veintiuna: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
  doscientos: 200,
  doscientas: 200,
  trescientos: 300,
  trescientas: 300,
  cuatrocientos: 400,
  cuatrocientas: 400,
  quinientos: 500,
  quinientas: 500,
  seiscientos: 600,
  seiscientas: 600,
  setecientos: 700,
  setecientas: 700,
  ochocientos: 800,
  ochocientas: 800,
  novecientos: 900,
  novecientas: 900,
};
const SCALE_WORDS = new Set(['mil', 'millon', 'millones']);
const ARTICLE_ONLY = new Set(['un', 'una', 'uno']);

/** Minúsculas, sin tildes ni signos (misma idea que `nameKey`), conservando dígitos y separadores. */
export function normalizeSpeech(text: string): string {
  return nameKey(text)
    .replace(/[¿?¡!;:"“”()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNumberWord(w: string): boolean {
  return w in UNITS || SCALE_WORDS.has(w);
}

/** "tres millones quinientos mil" → 3500000. `null` si la secuencia no es un número. */
export function wordsToNumber(words: readonly string[]): number | null {
  let total = 0;
  let current = 0;
  let seen = false;
  for (const w of words) {
    if (w === 'y') continue;
    if (w in UNITS) {
      current += UNITS[w];
      seen = true;
    } else if (w === 'mil') {
      current = (current || 1) * 1000;
      seen = true;
    } else if (w === 'millon' || w === 'millones') {
      total += (current || 1) * 1_000_000;
      current = 0;
      seen = true;
    } else {
      return null;
    }
  }
  return seen ? total + current : null;
}

interface Token {
  /** Palabra tal como se dictó (con tildes y mayúsculas), para la descripción. */
  raw: string;
  /** Palabra normalizada, para comparar. */
  norm: string;
}

function tokenize(transcript: string): Token[] {
  return transcript
    .split(/\s+/)
    .map((raw) => raw.replace(/^[¿¡"“(]+/, '').replace(/[?!.,;:"”)]+$/, ''))
    .filter(Boolean)
    .map((raw) => ({ raw, norm: normalizeSpeech(raw) }))
    .filter((t) => t.norm);
}

/** Monto y su posición [start, end) entre los tokens, para quitarlo de la descripción. */
interface AmountMatch {
  minor: number;
  start: number;
  end: number;
}

function findAmount(norms: readonly string[]): AmountMatch | null {
  // 1) Cifras: "25000", "25.000", "$25.000", "1250000,50"
  for (let i = 0; i < norms.length; i++) {
    if (!/\d/.test(norms[i])) continue;
    let token = norms[i];
    let end = i + 1;
    let scale: string | undefined;
    const glued = /^(\d+(?:[.,]\d+)?)(mil|millon|millones)$/.exec(norms[i]);
    if (glued) {
      // "50mil", "2millones": la voz a veces los transcribe pegados
      token = glued[1];
      scale = glued[2];
    } else {
      // "50 000", "1 250 000": grupos de tres cifras separados por espacio
      if (/^\d{1,3}$/.test(norms[i]) && /^\d{3}$/.test(norms[i + 1] ?? '')) {
        while (/^\d{3}$/.test(norms[end] ?? '')) token += norms[end++];
      }
      scale = norms[end];
    }
    const minor = parseMoney(token);
    if (minor === null) continue;
    // "50 mil", "2 millones": la cifra se multiplica por la escala que le sigue
    if (scale === 'mil' && minor * 1000 <= MAX_AMOUNT_MINOR) {
      return { minor: minor * 1000, start: i, end: glued ? end : end + 1 };
    }
    if ((scale === 'millon' || scale === 'millones') && minor * 1_000_000 <= MAX_AMOUNT_MINOR) {
      return { minor: minor * 1_000_000, start: i, end: glued ? end : end + 1 };
    }
    return { minor, start: i, end };
  }
  // 2) Monto hablado: la secuencia de palabras numéricas más larga
  let best = { start: 0, end: 0 };
  let start = -1;
  const flush = (end: number) => {
    if (start < 0) return;
    let e = end;
    while (e > start && norms[e - 1] === 'y') e--;
    // "un café" no es un monto: el artículo solo, sin "mil"/"millón", se ignora
    const meaningful = norms.slice(start, e).some((w) => !ARTICLE_ONLY.has(w) && w !== 'y');
    if (meaningful && e - start > best.end - best.start) best = { start, end: e };
    start = -1;
  };
  norms.forEach((w, i) => {
    const numeric = isNumberWord(w) || (w === 'y' && start >= 0);
    if (numeric && start < 0) start = i;
    else if (!numeric) flush(i);
  });
  flush(norms.length);
  if (best.end === best.start) return null;
  const value = wordsToNumber(norms.slice(best.start, best.end));
  return value === null ? null : { minor: value * 100, ...best };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsPhrase(text: string, phrase: string): boolean {
  return new RegExp(`(^|\\s)${escapeRegex(phrase)}(\\s|$)`).test(text);
}

function detectType(text: string): TxType {
  if (INCOME_WORDS.some((w) => containsPhrase(text, w))) return 'income';
  return 'expense'; // predeterminado de HU05 (también para "gasté", "pagué"…)
}

export interface CategoryMatch {
  id: string | null;
  /** `nameKey` mencionado en voz alta, para quitarlo del concepto. */
  matched: string | null;
}

/** Posición de la primera aparición de `phrase` como palabra(s) completas; -1 si no está. */
function phraseIndex(text: string, phrase: string): number {
  const m = new RegExp(`(^|\\s)${escapeRegex(phrase)}(\\s|$)`).exec(text);
  return m ? m.index + m[1].length : -1;
}

/**
 * Categoría nombrada en el texto (ya normalizado) o, si no se nombra, la que delatan
 * sus palabras clave. `null` si ninguna aplica.
 */
export function findCategoryInText(
  text: string,
  type: TxType,
  categories: readonly Category[],
): CategoryMatch | null {
  const ofType = categories.filter((c) => c.type === type && !c.deletedAt);
  const named = ofType
    .filter((c) => containsPhrase(text, c.nameKey))
    .sort((a, b) => b.nameKey.length - a.nameKey.length);
  if (named.length) return { id: named[0].id, matched: named[0].nameKey };
  let best: { id: string; at: number } | null = null;
  for (const c of ofType) {
    for (const hint of CATEGORY_HINTS[c.nameKey] ?? []) {
      const at = phraseIndex(text, hint);
      if (at >= 0 && (!best || at < best.at)) best = { id: c.id, at };
    }
  }
  return best ? { id: best.id, matched: null } : null;
}

function pickCategory(
  text: string,
  type: TxType,
  categories: readonly Category[],
  lastUsed: string | null,
): CategoryMatch {
  const found = findCategoryInText(text, type, categories);
  if (found) return found;
  const ofType = categories.filter((c) => c.type === type && !c.deletedAt);
  const fallbackName = type === 'expense' ? OTHER_EXPENSE_NAME : OTHER_INCOME_NAME;
  const fallback =
    ofType.find((c) => c.id === lastUsed) ??
    ofType.find((c) => c.name === fallbackName) ??
    ofType[0];
  return { id: fallback?.id ?? null, matched: null };
}

function detectDate(text: string, today: string): { occurredOn: string; future: boolean } {
  if (containsPhrase(text, 'pasado manana')) return { occurredOn: addDays(today, 2), future: true };
  if (containsPhrase(text, 'manana')) return { occurredOn: addDays(today, 1), future: true };
  if (containsPhrase(text, 'anteayer')) return { occurredOn: addDays(today, -2), future: false };
  if (containsPhrase(text, 'ayer')) return { occurredOn: addDays(today, -1), future: false };
  return { occurredOn: today, future: false };
}

/** Marca para descartar cada aparición de `phrase` (una o varias palabras normalizadas). */
function markPhrase(drop: boolean[], norms: readonly string[], phrase: string): void {
  const words = phrase.split(' ');
  for (let i = 0; i + words.length <= norms.length; i++) {
    if (words.every((w, j) => norms[i + j] === w)) {
      for (let j = 0; j < words.length; j++) drop[i + j] = true;
    }
  }
}

/** El concepto que queda al quitar comando, monto, moneda, fecha y categoría (HU17 regla 4). */
function buildDescription(
  tokens: readonly Token[],
  amount: AmountMatch | null,
  category: string | null,
): string {
  const norms = tokens.map((t) => t.norm);
  const drop = tokens.map(() => false);
  for (const p of [...COMMAND_WORDS, ...DATE_WORDS, ...CURRENCY_WORDS]) markPhrase(drop, norms, p);
  if (category) markPhrase(drop, norms, category);
  if (amount) for (let i = amount.start; i < amount.end; i++) drop[i] = true;
  const kept = tokens.filter((_, i) => !drop[i]);
  while (kept.length && FILLER.has(kept[0].norm)) kept.shift();
  while (kept.length && FILLER.has(kept[kept.length - 1].norm)) kept.pop();
  const phrase = kept
    .map((t) => t.raw)
    .join(' ')
    .slice(0, MAX_DESCRIPTION)
    .trim();
  return phrase ? phrase[0].toLocaleUpperCase('es') + phrase.slice(1) : '';
}

/**
 * Convierte la transcripción en un borrador para prellenar el formulario (HU17 regla 4).
 * Nunca guarda: el usuario siempre confirma con "Guardar".
 */
export function parseVoiceTransactionDraft(
  transcript: string,
  categories: readonly Category[],
  today: string,
  lastUsedByType: Partial<Record<TxType, string | null>> = {},
): VoiceDraft {
  const tokens = tokenize(transcript);
  const norms = tokens.map((t) => t.norm);
  const text = norms.join(' ');
  const type = detectType(text);
  const amount = findAmount(norms);
  const validAmount =
    amount && amount.minor > 0 && amount.minor <= MAX_AMOUNT_MINOR ? amount.minor : null;
  const category = pickCategory(text, type, categories, lastUsedByType[type] ?? null);
  const date = detectDate(text, today);
  return {
    type,
    amountMinor: validAmount,
    categoryId: category.id,
    occurredOn: date.occurredOn,
    description: buildDescription(tokens, amount, category.matched),
    futureDate: date.future,
  };
}

/** Monto dicho solo ("cincuenta mil", "50.000"); `null` si no se entiende o no es válido. */
export function parseSpokenAmount(transcript: string): number | null {
  const norms = tokenize(transcript).map((t) => t.norm);
  const amount = findAmount(norms);
  return amount && amount.minor > 0 && amount.minor <= MAX_AMOUNT_MINOR ? amount.minor : null;
}

/** Frase normalizada (minúsculas, sin tildes ni signos) lista para comparar palabras. */
export function speechKey(transcript: string): string {
  return tokenize(transcript)
    .map((t) => t.norm)
    .join(' ');
}

/** Número entero dicho con cifras o palabras ("5", "cinco", "veinte"); `null` si no lo es. */
export function parseSpokenInteger(word: string): number | null {
  const w = normalizeSpeech(word);
  if (/^\d+$/.test(w)) return Number(w);
  return wordsToNumber([w]);
}

// ---------------------------------------------------------------------------
// HU18 — movimiento → texto para leer en voz alta
// ---------------------------------------------------------------------------

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/**
 * Monto para decirlo en voz alta, con el NOMBRE de la moneda de la cuenta:
 * "25.000 pesos colombianos", "1 dólar estadounidense", "12 euros".
 *
 * No se usa el símbolo: la voz lee «$» como dólares sin importar la moneda elegida, así que
 * un monto en pesos se oía como dólares. Intl pone el plural y el nombre de cada moneda.
 */
export function spokenMoney(minor: number, currency: string): string {
  const abs = Math.abs(minor);
  const hasCents = abs % 100 !== 0;
  let text: string;
  try {
    text = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency,
      currencyDisplay: 'name',
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(abs / 100);
  } catch {
    // código de moneda que Intl no conoce: al menos se dice el código, nunca un símbolo
    text = `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(abs / 100)} ${currency}`;
  }
  return minor < 0 ? `menos ${text}` : text;
}

function spokenDate(occurredOn: string, today: string): string {
  if (occurredOn === today) return 'registrado hoy';
  if (occurredOn === addDays(today, -1)) return 'registrado ayer';
  const { y, m, d } = parseIso(occurredOn);
  return y === parseIso(today).y
    ? `registrado el ${d} de ${MONTHS[m - 1]}`
    : `registrado el ${longDate(occurredOn)}`;
}

/**
 * "Gasto de $25.000 en la categoría Alimentación, registrado hoy, concepto: Almuerzo".
 * Omite la descripción vacía y nunca menciona datos internos (sincronización, ids).
 */
export function formatTransactionForSpeech(
  tx: Pick<Transaction, 'type' | 'amountMinor' | 'occurredOn' | 'description'>,
  categoryName: string | undefined,
  currency: string,
  today: string,
): string {
  const income = tx.type === 'income';
  let head = `${income ? 'Ingreso' : 'Gasto'} de ${spokenMoney(tx.amountMinor, currency)}`;
  if (categoryName)
    head += income ? ` en la fuente ${categoryName}` : ` en la categoría ${categoryName}`;
  const parts = [head, spokenDate(tx.occurredOn, today)];
  const description = tx.description?.trim();
  if (description) parts.push(`concepto: ${description}`);
  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// HU19 — historial → cola de lectura por bloques
// ---------------------------------------------------------------------------

export const HISTORY_BLOCK = 10;

export interface SpeechItem {
  /** `id` del movimiento que se resalta mientras se lee; `null` para anuncios. */
  id: string | null;
  text: string;
}

export interface HistorySpeechQueue {
  items: SpeechItem[];
  /** Movimientos que quedan después de este bloque. */
  remaining: number;
  /** Desde dónde empieza el siguiente bloque. */
  nextOffset: number;
}

/**
 * Bloque de hasta 10 movimientos visibles, en el orden en que se muestran (HU19 reglas 1–2).
 * Omite los eliminados (`deletedAt`) aunque sigan en la lista por un instante.
 */
export function buildHistorySpeechQueue(
  transactions: readonly Transaction[],
  categoryName: (id: string) => string | undefined,
  currency: string,
  today: string,
  offset = 0,
  maxItems = HISTORY_BLOCK,
): HistorySpeechQueue {
  const live = transactions.filter((t) => !t.deletedAt);
  const block = live.slice(offset, offset + maxItems);
  if (!block.length) return { items: [], remaining: 0, nextOffset: offset };
  const remaining = live.length - offset - block.length;
  const read = offset + block.length;
  return {
    items: [
      {
        id: null,
        text: `Leyendo ${block.length} ${block.length === 1 ? 'movimiento' : 'movimientos'}`,
      },
      ...block.map((t) => ({
        id: t.id,
        text: formatTransactionForSpeech(t, categoryName(t.categoryId), currency, today),
      })),
      {
        id: null,
        text: remaining > 0 ? `Fin de los primeros ${read} movimientos` : 'Fin del historial',
      },
    ],
    remaining,
    nextOffset: read,
  };
}
