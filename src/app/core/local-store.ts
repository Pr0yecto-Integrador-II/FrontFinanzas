import { Injectable, inject } from '@angular/core';
import { Table } from 'dexie';
import { Clock } from './clock';
import { Db } from './db';
import { AnyRecord, toPushData } from './mappers';
import { EntityName, OutboxItem } from './models';

export type WriteOp =
  | { kind: 'upsert'; entity: EntityName; record: AnyRecord }
  | { kind: 'delete'; entity: EntityName; record: AnyRecord; data?: Record<string, unknown> };

/**
 * Único punto de escritura de los datos sincronizables.
 * Cada escritura guarda el registro en Dexie y encola el cambio en el `outbox`
 * dentro de la misma transacción; la interfaz nunca espera al servidor.
 */
@Injectable({ providedIn: 'root' })
export class LocalStore {
  private readonly db = inject(Db);
  private readonly clock = inject(Clock);

  table(entity: EntityName): Table<AnyRecord, string> {
    switch (entity) {
      case 'category':
        return this.db.categories as unknown as Table<AnyRecord, string>;
      case 'transaction':
        return this.db.transactions as unknown as Table<AnyRecord, string>;
      case 'recurring_rule':
        return this.db.recurringRules as unknown as Table<AnyRecord, string>;
      case 'budget':
        return this.db.budgets as unknown as Table<AnyRecord, string>;
    }
  }

  upsert(entity: EntityName, record: AnyRecord): Promise<void> {
    return this.write([{ kind: 'upsert', entity, record }]);
  }

  /** Borrado lógico: nunca se elimina físicamente un dato sincronizable. */
  remove(entity: EntityName, record: AnyRecord): Promise<void> {
    return this.write([{ kind: 'delete', entity, record }]);
  }

  /** Deshacer (HU07): si el borrado aún está en el outbox se cancela; si no, se reenvía el registro. */
  restore(entity: EntityName, snapshot: AnyRecord): Promise<void> {
    return this.upsert(entity, { ...snapshot, deletedAt: null });
  }

  async write(ops: readonly WriteOp[]): Promise<void> {
    if (!ops.length) return;
    const stamp = this.clock.now().toISOString();
    await this.db.transaction(
      'rw',
      [
        this.db.categories,
        this.db.transactions,
        this.db.recurringRules,
        this.db.budgets,
        this.db.outbox,
      ],
      async () => {
        for (const op of ops) await this.apply(op, stamp);
      },
    );
  }

  /**
   * Eliminar una categoría (HU08 regla 5): si tiene usos, todo pasa a `reassignTo`
   * en una sola transacción. El servidor repite la reasignación al recibir el borrado.
   */
  async deleteCategory(id: string, reassignTo: string | null): Promise<void> {
    const stamp = this.clock.now().toISOString();
    await this.db.transaction(
      'rw',
      [
        this.db.categories,
        this.db.transactions,
        this.db.recurringRules,
        this.db.budgets,
        this.db.outbox,
      ],
      async () => {
        const cat = await this.db.categories.get(id);
        if (!cat) return;
        if (reassignTo) {
          await this.db.transactions.where('categoryId').equals(id).modify({ categoryId: reassignTo });
          await this.db.recurringRules.where('categoryId').equals(id).modify({ categoryId: reassignTo });
          const targetHasBudget = (await this.db.budgets.where('categoryId').equals(reassignTo).toArray()).some(
            (b) => !b.deletedAt,
          );
          const mine = this.db.budgets.where('categoryId').equals(id);
          if (targetHasBudget) await mine.modify({ deletedAt: stamp });
          else await mine.modify({ categoryId: reassignTo });
        }
        await this.apply(
          {
            kind: 'delete',
            entity: 'category',
            record: cat,
            data: reassignTo ? { reassign_to: reassignTo } : undefined,
          },
          stamp,
        );
      },
    );
  }

  private async apply(op: WriteOp, stamp: string): Promise<void> {
    const table = this.table(op.entity);
    const id = op.record.id;
    // El último cambio de un mismo registro reemplaza a los pendientes (gana el último, 6.4)
    await this.db.outbox.where('entityId').equals(id).delete();

    if (op.kind === 'upsert') {
      const record = { ...op.record, syncState: 'pending' as const, rejection: undefined };
      await table.put(record);
      await this.db.outbox.add(this.item(op.entity, 'upsert', id, toPushData(op.entity, record), stamp));
    } else {
      const record = { ...op.record, deletedAt: stamp, syncState: 'pending' as const, rejection: undefined };
      await table.put(record);
      await this.db.outbox.add(this.item(op.entity, 'delete', id, op.data ?? null, stamp));
    }
  }

  private item(
    entity: EntityName,
    op: OutboxItem['op'],
    entityId: string,
    payload: Record<string, unknown> | null,
    createdAt: string,
  ): OutboxItem {
    return { entity, op, entityId, payload, createdAt, attempts: 0 };
  }
}
