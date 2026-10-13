import {
  Budget,
  Category,
  EntityName,
  Frequency,
  RecurringRule,
  RuleMode,
  Transaction,
  TxStatus,
  TxType,
} from './models';
import { nameKey } from '../features/categorias/domain/rules';

type Json = Record<string, unknown>;
export type AnyRecord = Category | Transaction | RecurringRule | Budget;

/** Registro local -> `data` del push. Nunca incluye `user_id`, `version` ni campos solo del navegador. */
export function toPushData(entity: EntityName, r: AnyRecord): Json {
  switch (entity) {
    case 'category': {
      const c = r as Category;
      return {
        name: c.name,
        type: c.type,
        icon: c.icon,
        color: c.color,
        created_at: c.createdAt,
      };
    }
    case 'transaction': {
      const t = r as Transaction;
      return {
        type: t.type,
        amount_minor: t.amountMinor,
        category_id: t.categoryId,
        occurred_on: t.occurredOn,
        created_at: t.createdAt,
        description: t.description,
        note: t.note,
        tags: t.tags,
        status: t.status,
        recurring_rule_id: t.recurringRuleId,
      };
    }
    case 'recurring_rule': {
      const u = r as RecurringRule;
      return {
        type: u.type,
        amount_minor: u.amountMinor,
        category_id: u.categoryId,
        description: u.description,
        frequency: u.frequency,
        start_on: u.startOn,
        end_on: u.endOn,
        max_occurrences: u.maxOccurrences,
        mode: u.mode,
        generate_from: u.generateFrom,
        paused_at: u.pausedAt,
        created_at: u.createdAt,
      };
    }
    case 'budget': {
      const b = r as Budget;
      return {
        category_id: b.categoryId,
        amount_minor: b.amountMinor,
        effective_from: b.effectiveFrom,
        created_at: b.createdAt,
      };
    }
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** `data` del pull -> registro local ya sincronizado. */
export function fromPull(
  entity: EntityName,
  id: string,
  d: Json,
  deletedAt: string | null,
): AnyRecord {
  const base = { id, syncState: 'synced' as const, deletedAt };
  switch (entity) {
    case 'category':
      return {
        ...base,
        name: str(d['name']),
        nameKey: nameKey(str(d['name'])),
        type: str(d['type']) as TxType,
        icon: str(d['icon']),
        color: str(d['color']),
        isDefault: d['is_default'] === true,
        createdAt: str(d['created_at']),
      };
    case 'transaction':
      return {
        ...base,
        type: str(d['type']) as TxType,
        amountMinor: num(d['amount_minor']),
        categoryId: str(d['category_id']),
        occurredOn: str(d['occurred_on']),
        description: strOrNull(d['description']),
        note: strOrNull(d['note']),
        tags: Array.isArray(d['tags']) ? (d['tags'] as string[]) : [],
        status: (str(d['status']) || 'confirmed') as TxStatus,
        recurringRuleId: strOrNull(d['recurring_rule_id']),
        createdAt: str(d['created_at']),
      };
    case 'recurring_rule':
      return {
        ...base,
        type: str(d['type']) as TxType,
        amountMinor: num(d['amount_minor']),
        categoryId: str(d['category_id']),
        description: strOrNull(d['description']),
        frequency: str(d['frequency']) as Frequency,
        startOn: str(d['start_on']),
        endOn: strOrNull(d['end_on']),
        maxOccurrences: numOrNull(d['max_occurrences']),
        mode: str(d['mode']) as RuleMode,
        generateFrom: str(d['generate_from']),
        pausedAt: strOrNull(d['paused_at']),
        createdAt: str(d['created_at']),
      };
    case 'budget':
      return {
        ...base,
        categoryId: str(d['category_id']),
        amountMinor: num(d['amount_minor']),
        effectiveFrom: str(d['effective_from']),
        createdAt: str(d['created_at']),
      };
  }
}
