export type TxType = 'expense' | 'income';
export type TxStatus = 'confirmed' | 'pending';
export type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
export type RuleMode = 'auto' | 'confirm';
export type SyncState = 'synced' | 'pending' | 'rejected';
export type EntityName = 'category' | 'recurring_rule' | 'transaction' | 'budget';

export interface Rejection {
  code: string;
  message: string;
}

/** Campos que solo existen en el navegador (Blueprint 6.3.4). */
export interface SyncMeta {
  syncState: SyncState;
  rejection?: Rejection;
}

export interface Category extends SyncMeta {
  id: string;
  name: string;
  nameKey: string;
  type: TxType;
  icon: string;
  color: string;
  isDefault: boolean;
  createdAt: string;
  deletedAt: string | null;
}

export interface Transaction extends SyncMeta {
  id: string;
  type: TxType;
  amountMinor: number;
  categoryId: string;
  occurredOn: string;
  description: string | null;
  note: string | null;
  tags: string[];
  status: TxStatus;
  recurringRuleId: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface RecurringRule extends SyncMeta {
  id: string;
  type: TxType;
  amountMinor: number;
  categoryId: string;
  description: string | null;
  frequency: Frequency;
  startOn: string;
  endOn: string | null;
  maxOccurrences: number | null;
  mode: RuleMode;
  generateFrom: string;
  pausedAt: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface Budget extends SyncMeta {
  id: string;
  categoryId: string;
  amountMinor: number;
  effectiveFrom: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface OutboxItem {
  seq?: number;
  entity: EntityName;
  op: 'upsert' | 'delete';
  entityId: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
  attempts: number;
}

export interface BudgetAlert {
  categoryId: string;
  month: string;
  threshold: 80 | 100;
}

export interface Account {
  id: string;
  email: string;
  currency: string;
}
