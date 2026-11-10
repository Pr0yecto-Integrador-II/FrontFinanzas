/**
 * Intérprete del asistente de voz (HU20). Dominio puro: recibe la frase ya transcrita y
 * devuelve una intención. Sin Angular, Dexie ni SDK; la fecha de hoy llega por parámetro.
 *
 * Es determinista, pero tolerante: la transcripción de voz casi nunca es exacta
 * («léeme» llega como «leeme», «lee me», «me lees», «leame»; «gastos» como «gastoz»…).
 * Por eso la frase se normaliza antes de interpretarla:
 *   1. minúsculas, sin tildes ni signos;
 *   2. sinónimos y variantes → una forma canónica («léeme/dime/muéstrame» → `leeme`);
 *   3. errores de ortografía → la palabra conocida más cercana (distancia de edición ≤ 1–2);
 *   4. relleno de cortesía fuera («por favor», «oye», «quiero que»…).
 * Y solo entonces se decide la intención. Lo que no se entiende es `unknown` y el asistente
 * lo pregunta de nuevo (ver `AssistantService`); `intents.spec.ts` es la lista de lo que
 * debe entender: cualquier frase real que falle se agrega allí.
 */
import { Category, TxType } from '../../../core/models';
import {
  ADD_WORDS,
  EXPENSE_WORDS,
  INCOME_WORDS,
  VoiceDraft,
  findCategoryInText,
  parseSpokenAmount,
  parseSpokenInteger,
  parseVoiceTransactionDraft,
  speechKey,
} from '../../movimientos/domain/voice';

export type Period =
  | 'today'
  | 'yesterday'
  | 'week'
  | 'last_week'
  | 'month'
  | 'last_month'
  | 'last_7'
  | 'last_30'
  | 'year'
  | 'all';
export type TypeFilter = TxType | 'all';
export type TotalsMetric = 'expense' | 'income' | 'balance';

export type Intent =
  | {
      kind: 'read_recent';
      type: TypeFilter;
      count: number;
      period: Period | null;
      categoryId: string | null;
      categoryName: string | null;
    }
  | { kind: 'add_transaction'; draft: VoiceDraft }
  | {
      kind: 'query_totals';
      metric: TotalsMetric;
      period: Period;
      categoryId: string | null;
      categoryName: string | null;
    }
  | { kind: 'query_top'; period: Period }
  | { kind: 'query_extreme'; type: TxType; period: Period }
  | { kind: 'query_count'; type: TypeFilter; period: Period }
  | { kind: 'compare'; metric: TotalsMetric; period: 'month' | 'week' }
  | { kind: 'query_budget'; categoryId: string | null; categoryName: string | null }
  | { kind: 'navigate'; route: string; label: string }
  | { kind: 'delete_last'; type: TypeFilter }
  /** Pidió eliminar algo que no es «el último»: por ahora solo se puede eliminar el último. */
  | { kind: 'delete_help' }
  | { kind: 'greeting' }
  | { kind: 'thanks' }
  | { kind: 'repeat' }
  | { kind: 'stop' }
  | { kind: 'help' }
  | { kind: 'unknown' };

export interface CommandContext {
  categories: readonly Category[];
  /** Hoy como `YYYY-MM-DD`, del `Clock`. */
  today: string;
  lastUsedByType?: Partial<Record<TxType, string | null>>;
}

/** Máximo de movimientos que se leen de una vez (más sería una lectura interminable). */
export const MAX_READ = 20;
export const DEFAULT_READ = 5;

// ======================================================================================
// 1–4. Normalización
// ======================================================================================

/** Variantes habladas/transcritas → forma canónica. */
const ALIASES: Record<string, string> = {};
function alias(canonical: string, ...variants: string[]): void {
  for (const v of variants) ALIASES[v] = canonical;
}

// «Léeme»: cualquier forma de pedir que se lea, se diga o se muestre algo
alias(
  'leeme',
  'leme',
  'lemelo',
  'lee',
  'lees',
  'leas',
  'lea',
  'leer',
  'leerme',
  'leame',
  'leemelo',
  'leelo',
  'leelos',
  'leelas',
  'leyeme',
  'dime',
  'dimelo',
  'dimelos',
  'dimelas',
  'decime',
  'cuentame',
  'muestrame',
  'muestra',
  'mostrame',
  'mostrar',
  'ensename',
  'ensenar',
  'repiteme',
  'informame',
  'informar',
  'escuchar',
  'escucho',
  'escuchame',
  'oir',
  'ver',
  'consultar',
  'consulta',
  'revisar',
  'revisa',
  'dame',
);
alias('ultimo', 'ultima', 'reciente', 'ultimito');
alias('ultimos', 'ultimas', 'recientes');
alias('movimientos', 'transacciones', 'registros', 'operaciones');
alias('movimiento', 'transaccion', 'registro', 'operacion');
alias('ingresos', 'ganancias', 'entradas', 'abonos', 'consignaciones');
alias('ingreso', 'ganancia', 'entrada', 'abono', 'consignacion');
alias('gastos', 'compras', 'pagos', 'salidas', 'egresos', 'cobros', 'facturas', 'deudas');
alias('gasto', 'compra', 'pago', 'salida', 'egreso', 'cobro', 'factura', 'deuda');
alias('cuanto', 'cuanta', 'cuantisimo');
alias('cuantos', 'cuantas');
alias(
  'gastado',
  'gastada',
  'gastados',
  'gastadas',
  'gastando',
  'gastas',
  'gasta',
  'gastaste',
  'gastamos',
  'gastar',
);
alias('gano', 'ganas', 'ganaste', 'ganamos', 'ganado', 'ganada');
alias('recibi', 'recibes', 'recibiste', 'recibimos');
alias('recibido', 'recibida', 'cobrado', 'cobrada');
alias('graficos', 'graficas', 'grafica', 'grafico', 'estadisticas', 'estadistica', 'diagramas');
alias('ajustes', 'configuracion', 'configuraciones', 'opciones', 'preferencias');
alias('mayor', 'mayores', 'maximo', 'maxima', 'principal', 'principales');
alias('ahorro', 'ahorrado', 'ahorrando', 'ahorros', 'ahorrar');
alias('compara', 'comparar', 'comparame', 'comparado', 'comparacion', 'comparativo', 'respecto');
alias('hoy', 'hoyito');
alias('pasado', 'pasada', 'anterior');
alias('repite', 'repetir', 'repitelo', 'repitela');
alias(
  'elimina',
  'eliminar',
  'eliminalo',
  'borra',
  'borrar',
  'borralo',
  'quita',
  'quitar',
  'quitalo',
  'remueve',
  'suprime',
);

/** Palabras que no aportan a la intención (cortesía, muletillas, el «dinero»). */
const NOISE = new Set([
  'quiero',
  'favor',
  'porfa',
  'porfavor',
  'oye',
  'eh',
  'em',
  'mm',
  'ah',
  'pues',
  'bueno',
  'entonces',
  'asistente',
  'plata',
  'dinero',
  'platica',
  'lucas',
  'pesos',
  'peso',
  'cop',
]);

/** Palabras que el intérprete conoce: sirven de destino para corregir errores de transcripción. */
const VOCAB = [
  'leeme',
  'ultimo',
  'ultimos',
  'gasto',
  'gastos',
  'ingreso',
  'ingresos',
  'movimiento',
  'movimientos',
  'presupuesto',
  'presupuestos',
  'balance',
  'saldo',
  'resumen',
  'cuanto',
  'cuantos',
  'total',
  'totales',
  'agrega',
  'registra',
  'anota',
  'elimina',
  'repite',
  'semana',
  'pasado',
  'graficos',
  'categorias',
  'recurrentes',
  'ajustes',
  'ayuda',
  'mayor',
  'compara',
  'gaste',
  'gastado',
  'gane',
  'recibi',
  'ayer',
  'anteayer',
  'inicio',
  'proximos',
  'programados',
  'ahorro',
  'promedio',
  'historial',
  'cancela',
  'detente',
  'gracias',
  'funciona',
  'puedo',
  'puedes',
  'comandos',
  'ejemplos',
];
const VOCAB_SET = new Set(VOCAB);

/** Distancia de edición, cortada en `max + 1` (no nos importa cuán lejos, solo si está cerca). */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function canonicalToken(token: string): string {
  if (/\d/.test(token)) return token;
  const known = ALIASES[token];
  if (known) return known;
  if (token.length < 5 || VOCAB_SET.has(token)) return token;
  const limit = token.length >= 8 ? 2 : 1;
  let best: string | null = null;
  let bestDistance = limit + 1;
  for (const word of VOCAB) {
    const d = editDistance(token, word, limit);
    if (d < bestDistance) {
      bestDistance = d;
      best = word;
    }
  }
  return best ? (ALIASES[best] ?? best) : token;
}

/** Frase → palabras canónicas, sin relleno. */
function canonicalWords(rawKey: string): string[] {
  const words = rawKey
    .replace(/\blee me\b/g, 'leeme')
    .replace(/\bpor favor\b/g, ' ')
    .replace(/\b(podrias|podria|quieres|quisiera|necesito|me gustaria)\b/g, ' ')
    .split(' ')
    .filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    const c = canonicalToken(w);
    if (NOISE.has(c)) continue;
    // "leeme" repetido ("lee me" → 'leeme','me'): una sola vez basta
    if (c === 'leeme' && out[out.length - 1] === 'leeme') continue;
    out.push(c);
  }
  return out;
}

// ======================================================================================
// Utilidades de búsqueda sobre la frase canónica
// ======================================================================================

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `phrase` aparece como palabra(s) completas en `text`. */
function has(text: string, phrase: string): boolean {
  return new RegExp(`(^|\\s)${escapeRegex(phrase)}(\\s|$)`).test(text);
}

function hasAny(text: string, phrases: readonly string[]): boolean {
  return phrases.some((p) => has(text, p));
}

const NOUNS = ['gasto', 'gastos', 'ingreso', 'ingresos', 'movimiento', 'movimientos'];
const NOUN_SET = new Set(NOUNS);
const NAVIGATE_VERBS = [
  've',
  'vete',
  'ir',
  'abre',
  'abrir',
  'llevame',
  'lleva',
  'navega',
  'vamos',
  'pantalla',
  'pagina',
  'seccion',
];
const TOTALS_WORDS = [
  'cuanto',
  'total',
  'totales',
  'suma',
  'balance',
  'saldo',
  'resumen',
  'ahorro',
  'neto',
];
const HOW_AM_I = [
  'como voy',
  'como vamos',
  'como estoy',
  'como estamos',
  'como van',
  'como me va',
  'como me fue',
  'como ando',
];

interface Destination {
  keys: readonly string[];
  route: string;
  label: string;
  /** Solo navega si lo piden con un verbo ("ve a…"): sin él, la palabra es de otra consulta. */
  needsVerb?: boolean;
  /** Navega aunque la frase tenga un sustantivo de movimientos («próximos pagos» → «gastos»). */
  anyNoun?: boolean;
}
const DESTINATIONS: readonly Destination[] = [
  {
    keys: ['proximos', 'programados'],
    route: '/recurrentes/proximos',
    label: 'próximos pagos',
    anyNoun: true,
  },
  {
    keys: ['presupuesto', 'presupuestos'],
    route: '/presupuestos',
    label: 'presupuestos',
    needsVerb: true,
  },
  { keys: ['graficos'], route: '/graficos', label: 'gráficos' },
  {
    keys: ['recurrentes', 'recurrente', 'automaticos', 'automatico'],
    route: '/recurrentes',
    label: 'recurrentes',
  },
  { keys: ['categorias', 'categoria'], route: '/categorias', label: 'categorías' },
  { keys: ['ajustes'], route: '/ajustes', label: 'ajustes' },
  { keys: ['ayuda', 'manual'], route: '/ayuda', label: 'ayuda' },
  {
    keys: ['movimientos', 'historial'],
    route: '/movimientos',
    label: 'movimientos',
    needsVerb: true,
  },
  { keys: ['inicio', 'principal', 'home'], route: '/', label: 'inicio' },
];

function detectPeriod(t: string): Period | null {
  if (has(t, 'semana pasado')) return 'last_week';
  if (has(t, 'mes pasado')) return 'last_month';
  if (/\bultimo semana\b|\bultimos (7|siete) dias\b/.test(t)) return 'last_7';
  if (/\bultimo mes\b|\bultimos (\d+|\w+) dias\b/.test(t)) return 'last_30';
  if (has(t, 'ayer') || has(t, 'anteayer')) return 'yesterday';
  if (has(t, 'hoy')) return 'today';
  if (has(t, 'semana')) return 'week';
  if (has(t, 'mes')) return 'month';
  if (has(t, 'ano')) return 'year';
  if (
    hasAny(t, ['en total', 'siempre', 'historico', 'acumulado', 'desde siempre', 'todo el tiempo'])
  ) {
    return 'all';
  }
  return null;
}

function detectType(t: string): TypeFilter {
  const expense = hasAny(t, ['gasto', 'gastos', 'gaste', 'gastado']);
  const income = hasAny(t, [
    'ingreso',
    'ingresos',
    'gane',
    'gano',
    'recibi',
    'recibido',
    'pagaron',
    'depositaron',
    'consignaron',
    'transfirieron',
  ]);
  if (expense && !income) return 'expense';
  if (income && !expense) return 'income';
  return 'all';
}

/** "los últimos cinco gastos", "3 ingresos", "el último gasto", "todos mis gastos". */
function detectCount(words: readonly string[]): number | null {
  if (words.includes('todos') || words.includes('todas')) return MAX_READ;
  const lastIdx = words.findIndex((w) => w === 'ultimo' || w === 'ultimos');
  const nounIdx = words.findIndex((w) => NOUN_SET.has(w));
  const candidates: (string | undefined)[] = [];
  if (lastIdx >= 0) candidates.push(words[lastIdx + 1], words[lastIdx - 1], words[lastIdx + 2]);
  if (nounIdx > 0) candidates.push(words[nounIdx - 1], words[nounIdx - 2]);
  for (const c of candidates) {
    if (!c) continue;
    const n = parseSpokenInteger(c);
    if (n !== null && n > 0) return Math.min(n, MAX_READ);
  }
  if (lastIdx >= 0 && words[lastIdx] === 'ultimo') return 1; // singular
  return null;
}

function categoryOf(
  rawKey: string,
  type: TypeFilter,
  categories: readonly Category[],
): { id: string | null; name: string | null } {
  const order: TxType[] = type === 'all' ? ['expense', 'income'] : [type];
  for (const t of order) {
    const found = findCategoryInText(rawKey, t, categories);
    const category = found?.id ? categories.find((c) => c.id === found.id) : undefined;
    if (category) return { id: category.id, name: category.name };
  }
  return { id: null, name: null };
}

// ======================================================================================
// Interpretación
// ======================================================================================

const STOP_PHRASES = new Set([
  'para',
  'detente',
  'detener',
  'basta',
  'silencio',
  'callate',
  'calla',
  'cancela',
  'cancelar',
  'olvidalo',
  'olvida',
  'no importa',
  'dejalo',
  'deja',
  'ya',
  'alto',
  'nada',
  'ninguno',
  'salir',
  'cancela todo',
  'para ya',
  'cancela cancela',
]);
const GREETINGS = [
  'hola',
  'buenas',
  'buenos dias',
  'buenas tardes',
  'buenas noches',
  'hey',
  'saludos',
  'buen dia',
];
const THANKS = [
  'gracias',
  'muchas gracias',
  'chao',
  'adios',
  'hasta luego',
  'eso es todo',
  'nada mas',
  'listo gracias',
  'perfecto gracias',
];
const HELP_PHRASES = [
  'que puedo decir',
  'que puedes hacer',
  'que sabes hacer',
  'que se puede',
  'que comandos',
  'que hago',
  'como funciona',
  'como te uso',
  'como se usa',
  'no se que decir',
  'ayuda',
  'ayudame',
  'comandos',
  'ejemplos',
  'instrucciones',
];

/** Interpreta una frase. Nunca lanza: lo que no entiende es `unknown`. */
export function parseCommand(transcript: string, ctx: CommandContext): Intent {
  const rawKey = speechKey(transcript.replace(/[,]/g, ' '));
  if (!rawKey) return { kind: 'unknown' };
  const words = canonicalWords(rawKey);
  const t = words.join(' ');
  if (!t) return { kind: 'unknown' };

  // --- Conversación y control (solo si es la frase entera: «para» no es «para hoy») ---
  if (words.length <= 3 && STOP_PHRASES.has(t)) return { kind: 'stop' };
  if (words.length <= 4 && THANKS.some((p) => t === p || t.startsWith(`${p} `))) {
    return { kind: 'thanks' };
  }
  if (words.length <= 3 && GREETINGS.some((p) => t === p)) return { kind: 'greeting' };
  const navVerb = hasAny(t, NAVIGATE_VERBS);
  if (!navVerb && hasAny(t, HELP_PHRASES)) return { kind: 'help' };
  if (
    words.length <= 3 &&
    (has(t, 'repite') || t === 'otra vez' || t === 'de nuevo' || has(t, 'que dijiste'))
  ) {
    return { kind: 'repeat' };
  }

  const nounAny = words.some((w) => NOUN_SET.has(w));
  const asksLast = hasAny(t, ['ultimo', 'ultimos']);
  const readVerb = has(t, 'leeme');
  const type = detectType(t);
  const period = detectPeriod(t);
  const amount = parseSpokenAmount(transcript);
  // Verbos de orden explícitos ("agrega", "registra"…) y de gasto/ingreso en primera persona
  const explicitAdd =
    hasAny(
      rawKey,
      ADD_WORDS.filter((w) => w !== 'nuevo' && w !== 'nueva'),
    ) || hasAny(t, ['agrega', 'registra', 'anota']);
  const addVerbs = [
    ...EXPENSE_WORDS.filter((w) => w !== 'gasto'),
    ...INCOME_WORDS.filter((w) => w !== 'ingreso'),
  ];
  const startsAsQuestion =
    ['que', 'cuales', 'cual'].includes(words[0]) || (words[0] === 'en' && words[1] === 'que');

  // --- Eliminar ---
  if (has(t, 'elimina')) {
    return asksLast ? { kind: 'delete_last', type } : { kind: 'delete_help' };
  }

  // --- Navegar ---
  const dest = DESTINATIONS.find((d) => hasAny(t, d.keys));
  if (dest) {
    const justThat = words.length <= 2;
    if (navVerb || (!dest.needsVerb && (dest.anyNoun || !nounAny) && (readVerb || justThat))) {
      return { kind: 'navigate', route: dest.route, label: dest.label };
    }
  }
  if (t === 'nuevo movimiento' || t === 'abre nuevo movimiento') {
    return { kind: 'navigate', route: '/movimientos/nuevo', label: 'nuevo movimiento' };
  }

  // --- Presupuesto ---
  if (hasAny(t, ['presupuesto', 'presupuestos'])) {
    const c = categoryOf(rawKey, 'expense', ctx.categories);
    return { kind: 'query_budget', categoryId: c.id, categoryName: c.name };
  }

  // --- Comparar con el periodo anterior (antes que «gasté más»: «gasté más que el mes pasado») ---
  if (
    has(t, 'compara') ||
    (hasAny(t, ['mas que', 'menos que', 'mejor que', 'peor que', 'igual que']) &&
      hasAny(t, ['mes', 'semana']))
  ) {
    return {
      kind: 'compare',
      metric: type === 'all' ? 'balance' : type,
      period: has(t, 'semana') ? 'week' : 'month',
    };
  }

  // --- El gasto/ingreso más grande ("mi mayor gasto", "el gasto más alto") ---
  // Antes que «en qué gasté más»: «gasto más alto» no es el verbo «gasto» + «más».
  const singularNoun = words.some((w) => w === 'gasto' || w === 'ingreso' || w === 'movimiento');
  const pluralNoun = words.some((w) => w === 'gastos' || w === 'ingresos' || w === 'movimientos');
  if (
    nounAny &&
    (hasAny(t, ['mas grande', 'mas alto', 'mas caro', 'mas costoso', 'mas fuerte']) ||
      (has(t, 'mayor') && singularNoun && !pluralNoun))
  ) {
    return {
      kind: 'query_extreme',
      type: type === 'income' ? 'income' : 'expense',
      period: period ?? 'month',
    };
  }

  // --- En qué categoría se gastó más ---
  if (
    hasAny(t, ['gaste mas', 'mas gaste', 'gasto mas', 'gastado mas', 'gastando mas']) ||
    (has(t, 'en que') && hasAny(t, ['mas', 'mayor']) && type !== 'income') ||
    (hasAny(t, ['categoria', 'categorias']) && hasAny(t, ['mas', 'mayor'])) ||
    (has(t, 'mayor') && pluralNoun && !asksLast)
  ) {
    return { kind: 'query_top', period: period ?? 'month' };
  }

  // --- Cuántos movimientos ---
  if (has(t, 'cuantos') && (nounAny || has(t, 'tengo') || has(t, 'he'))) {
    return { kind: 'query_count', type, period: period ?? 'month' };
  }

  // --- Leer lo último ("léeme el último gasto", "cuál fue mi último ingreso") ---
  const totalsOnly = hasAny(t, ['total', 'totales', 'suma', 'balance', 'saldo']);
  if (nounAny && (asksLast || readVerb) && !(totalsOnly && !asksLast)) {
    const c = categoryOf(rawKey, type, ctx.categories);
    const count = detectCount(words);
    return {
      kind: 'read_recent',
      type,
      count: count ?? (period ? MAX_READ : DEFAULT_READ),
      period,
      categoryId: c.id,
      categoryName: c.name,
    };
  }
  if (!nounAny && asksLast && readVerb && !hasAny(t, TOTALS_WORDS)) {
    return {
      kind: 'read_recent',
      type: 'all',
      count: detectCount(words) ?? 1,
      period,
      categoryId: null,
      categoryName: null,
    };
  }

  // --- "¿Qué gasté ayer?", "¿cuáles fueron mis ingresos de hoy?" ---
  if (
    startsAsQuestion &&
    type !== 'all' &&
    amount === null &&
    !explicitAdd &&
    !hasAny(t, TOTALS_WORDS)
  ) {
    const c = categoryOf(rawKey, type, ctx.categories);
    return {
      kind: 'read_recent',
      type,
      count: detectCount(words) ?? (period ? MAX_READ : DEFAULT_READ),
      period,
      categoryId: c.id,
      categoryName: c.name,
    };
  }

  // --- Totales y balance ---
  if (hasAny(t, TOTALS_WORDS) || hasAny(t, HOW_AM_I)) {
    const c = categoryOf(rawKey, type, ctx.categories);
    const metric: TotalsMetric = type === 'all' ? 'balance' : type;
    return {
      kind: 'query_totals',
      metric,
      period: period ?? 'month',
      categoryId: metric === 'balance' ? null : c.id,
      categoryName: metric === 'balance' ? null : c.name,
    };
  }

  // --- Agregar un movimiento ---
  const wantsAdd =
    explicitAdd ||
    hasAny(rawKey, addVerbs) ||
    (nounAny && amount !== null) ||
    (hasAny(rawKey, ['nuevo', 'nueva']) && nounAny);
  if (wantsAdd) {
    return {
      kind: 'add_transaction',
      draft: parseVoiceTransactionDraft(
        transcript,
        ctx.categories,
        ctx.today,
        ctx.lastUsedByType ?? {},
      ),
    };
  }

  // --- Solo un sustantivo: "mis gastos", "ingresos de hoy", "gastos de transporte" ---
  if (nounAny) {
    const c = categoryOf(rawKey, type, ctx.categories);
    return {
      kind: 'read_recent',
      type,
      count: detectCount(words) ?? (period ? MAX_READ : DEFAULT_READ),
      period,
      categoryId: c.id,
      categoryName: c.name,
    };
  }

  // --- Un monto suelto con una pista de categoría: "20 mil en taxi" ---
  if (amount !== null && categoryOf(rawKey, 'expense', ctx.categories).id) {
    return {
      kind: 'add_transaction',
      draft: parseVoiceTransactionDraft(
        transcript,
        ctx.categories,
        ctx.today,
        ctx.lastUsedByType ?? {},
      ),
    };
  }

  return { kind: 'unknown' };
}

// ======================================================================================
// Sí / no
// ======================================================================================

const YES = new Set([
  'si',
  'sii',
  'siii',
  'sip',
  'sipi',
  'claro',
  'correcto',
  'afirmativo',
  'dale',
  'listo',
  'ok',
  'okay',
  'vale',
  'confirmo',
  'confirma',
  'confirmar',
  'confirmado',
  'guarda',
  'guardalo',
  'perfecto',
  'exacto',
  'adelante',
  'yes',
  'aja',
  'hagale',
  'obvio',
  'seguro',
  'bien',
]);
const NO = new Set([
  'no',
  'nop',
  'nel',
  'negativo',
  'cancela',
  'cancelar',
  'cancelalo',
  'incorrecto',
  'descarta',
  'descartalo',
  'mal',
  'nada',
  'nunca',
  'jamas',
  'tampoco',
  'equivocado',
  'error',
]);

/** "Sí"/"no" de una respuesta corta. `null` si no es ninguna de las dos (o es demasiado larga). */
export function parseConfirmation(transcript: string): 'yes' | 'no' | null {
  const words = speechKey(transcript.replace(/[,]/g, ' ')).split(' ').filter(Boolean);
  if (!words.length || words.length > 6) return null;
  const joined = words.join(' ');
  if (NO.has(words[0]) || joined.includes('no esta bien') || joined.includes('no es correcto')) {
    return 'no';
  }
  if (
    words.some((w) => YES.has(w)) ||
    joined.includes('esta bien') ||
    joined.includes('asi es') ||
    joined.includes('de una')
  ) {
    return 'yes';
  }
  if (words.some((w) => NO.has(w))) return 'no';
  return null;
}
