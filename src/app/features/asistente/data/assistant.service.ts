import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth.service';
import { Clock } from '../../../core/clock';
import { monthOf } from '../../../core/dates';
import { SpeechError, speechMessage } from '../../../core/speech/speech-errors';
import { SpeechRecognitionService } from '../../../core/speech/speech-recognition.service';
import { SpeechSynthesisService } from '../../../core/speech/speech-synthesis.service';
import { SyncService } from '../../../core/sync.service';
import { Toast } from '../../../shared/toast.service';
import { CategoryRepo } from '../../categorias/data/category.repo';
import { TransactionRepo } from '../../movimientos/data/transaction.repo';
import { hasErrors, validateTx } from '../../movimientos/domain/rules';
import {
  VoiceDraft,
  formatTransactionForSpeech,
  parseSpokenAmount,
} from '../../movimientos/domain/voice';
import { BudgetRepo } from '../../presupuestos/data/budget.repo';
import {
  budgetAnswer,
  compareAnswer,
  countAnswer,
  extremeAnswer,
  recentAnswer,
  selectTransactions,
  topAnswer,
  totalsAnswer,
} from '../domain/answers';
import { ASSISTANT_TEXT, AssistantPhase, PHASE_LABEL } from '../domain/conversation';
import {
  CommandContext,
  Intent,
  TypeFilter,
  parseCommand,
  parseConfirmation,
} from '../domain/intents';

/**
 * Asistente de voz global (HU20): escucha una orden, la interpreta, la ejecuta o prepara y
 * lo cuenta en voz alta. Nada se guarda ni se elimina sin un «sí» hablado.
 *
 * Todas las escrituras pasan por los repositorios de siempre (Dexie + outbox en una
 * transacción), así que las reglas de HU04–HU07 valen igual que en el formulario.
 */
@Injectable({ providedIn: 'root' })
export class AssistantService {
  private readonly recognition = inject(SpeechRecognitionService);
  private readonly synthesis = inject(SpeechSynthesisService);
  private readonly txs = inject(TransactionRepo);
  private readonly cats = inject(CategoryRepo);
  private readonly budgets = inject(BudgetRepo);
  private readonly auth = inject(AuthService);
  private readonly clock = inject(Clock);
  private readonly router = inject(Router);
  private readonly toast = inject(Toast);
  private readonly sync = inject(SyncService);

  private readonly _phase = signal<AssistantPhase>('idle');
  private readonly _transcript = signal('');
  private readonly _reply = signal('');
  private readonly _error = signal<string | null>(null);

  readonly phase = this._phase.asReadonly();
  /** Lo que se entendió de la última orden. */
  readonly transcript = this._transcript.asReadonly();
  /** Lo que el asistente dijo (respaldo visual de la voz). */
  readonly reply = this._reply.asReadonly();
  readonly error = this._error.asReadonly();
  readonly busy = computed(() => this._phase() !== 'idle');
  /** Hay una pregunta de sí/no sin responder: la tarjeta ofrece botones además de la voz. */
  private readonly _awaitingAnswer = signal(false);
  readonly awaitingAnswer = this._awaitingAnswer.asReadonly();
  /**
   * Qué mostrar en el estado. Mientras el micrófono todavía se abre NO dice «escuchando»:
   * lo que se hable en ese momento se pierde (por eso existe el pitido de «ya puedes hablar»).
   */
  readonly status = computed(() => {
    const phase = this._phase();
    const wantsMic = phase === 'listening' || phase === 'confirming';
    if (wantsMic && this.recognition.state() !== 'listening') return 'Preparando el micrófono…';
    return PHASE_LABEL[phase];
  });

  /** Invalida la conversación en curso: cualquier `await` pendiente la abandona. */
  private run = 0;
  private lastReply = '';
  /** Responde la pregunta de sí/no pendiente sin hablar (botones de la tarjeta). */
  private manual: ((yes: boolean) => void) | null = null;

  /** Toca el botón: empieza a escuchar; si ya estaba activo, lo detiene todo. */
  async activate(): Promise<void> {
    if (this._phase() !== 'idle') {
      this.stop();
      return;
    }
    const run = ++this.run;
    this._error.set(null);
    this._transcript.set('');
    this._reply.set('');
    try {
      await this.turn(run);
    } catch (e) {
      if (run === this.run) await this.fail(e);
    } finally {
      if (run === this.run) this._phase.set('idle');
    }
  }

  /** Corta la escucha y la voz, y abandona lo que estaba pendiente. */
  stop(): void {
    this.run++;
    this.recognition.cancel();
    this.synthesis.stop();
    this._phase.set('idle');
    this._awaitingAnswer.set(false);
  }

  /** Responde «sí» o «no» a la pregunta pendiente tocando un botón, sin hablar. */
  answer(yes: boolean): void {
    this.manual?.(yes);
  }

  /** Oculta la tarjeta con lo último que se dijo. */
  dismiss(): void {
    if (this._phase() !== 'idle') return;
    this._transcript.set('');
    this._reply.set('');
    this._error.set(null);
  }

  // ---------------------------------------------------------------------------

  /**
   * Escucha una orden. Si no se entiende, en vez de rendirse pide repetirla y vuelve a
   * escuchar sola una vez (sin que el usuario tenga que tocar el botón otra vez); solo
   * tras el segundo intento fallido da ejemplos.
   */
  private async turn(run: number): Promise<void> {
    let heard = await this.listenCommand(run);
    if (heard === null) return;
    this._transcript.set(heard);
    let intent: Intent = heard ? parseCommand(heard, this.context()) : { kind: 'unknown' };

    if (intent.kind === 'unknown') {
      const retry = heard ? ASSISTANT_TEXT.notUnderstood(heard) : ASSISTANT_TEXT.silence;
      if (!(await this.say(run, retry))) return;
      heard = await this.listenCommand(run);
      if (heard === null) return;
      this._transcript.set(heard);
      intent = heard ? parseCommand(heard, this.context()) : { kind: 'unknown' };
    }

    this._phase.set('thinking');
    await this.handle(run, intent);
  }

  /** Escucha una orden: `''` si no se entendió nada, `null` si se abandonó. */
  private async listenCommand(run: number): Promise<string | null> {
    try {
      return await this.listen(run, 'listening', this.commandHints());
    } catch (e) {
      if (e instanceof SpeechError && e.kind === 'no_match') return '';
      throw e;
    }
  }

  private async handle(run: number, intent: Intent): Promise<void> {
    const today = this.clock.today();
    const currency = this.auth.currency();
    const name = (id: string) => this.cats.byId().get(id)?.name;
    switch (intent.kind) {
      case 'read_recent': {
        const all = selectTransactions(
          this.txs.visible(),
          { type: intent.type, period: intent.period, categoryId: intent.categoryId },
          today,
        );
        await this.say(
          run,
          recentAnswer(
            all.slice(0, intent.count),
            {
              type: intent.type,
              period: intent.period,
              categoryName: intent.categoryName,
              total: all.length,
            },
            name,
            currency,
            today,
          ),
        );
        return;
      }
      case 'query_totals':
        await this.say(
          run,
          totalsAnswer(
            this.txs.visible(),
            intent.metric,
            intent.period,
            { id: intent.categoryId, name: intent.categoryName },
            currency,
            today,
          ),
        );
        return;
      case 'query_extreme':
        await this.say(
          run,
          extremeAnswer(this.txs.visible(), intent.type, intent.period, name, currency, today),
        );
        return;
      case 'query_count':
        await this.say(run, countAnswer(this.txs.visible(), intent.type, intent.period, today));
        return;
      case 'compare':
        await this.say(
          run,
          compareAnswer(this.txs.visible(), intent.metric, intent.period, currency, today),
        );
        return;
      case 'greeting':
        await this.say(run, ASSISTANT_TEXT.greeting);
        return;
      case 'thanks':
        await this.say(run, ASSISTANT_TEXT.thanks);
        return;
      case 'delete_help':
        await this.say(run, ASSISTANT_TEXT.deleteHelp);
        return;
      case 'query_top':
        await this.say(run, topAnswer(this.txs.visible(), intent.period, name, currency, today));
        return;
      case 'query_budget':
        await this.say(
          run,
          budgetAnswer(
            this.budgets.active(),
            this.txs.visible(),
            this.cats.active(),
            intent.categoryId,
            monthOf(today),
            currency,
          ),
        );
        return;
      case 'navigate':
        await this.router.navigateByUrl(intent.route);
        await this.say(run, `Abriendo ${intent.label}`);
        return;
      case 'add_transaction':
        await this.addTransaction(run, intent.draft);
        return;
      case 'delete_last':
        await this.deleteLast(run, intent.type);
        return;
      case 'repeat':
        await this.say(run, this.lastReply || ASSISTANT_TEXT.nothingToRepeat);
        return;
      case 'help':
        await this.say(run, ASSISTANT_TEXT.help);
        return;
      case 'stop':
        return;
      case 'unknown':
        await this.say(run, ASSISTANT_TEXT.unknown);
        return;
    }
  }

  // --- Alta por voz (borrador → «sí» → guardar) ---------------------------------

  private async addTransaction(run: number, draft: VoiceDraft): Promise<void> {
    const today = this.clock.today();
    const currency = this.auth.currency();
    let amount = draft.amountMinor;

    if (amount === null) {
      const ask =
        draft.type === 'income' ? ASSISTANT_TEXT.askAmountIncome : ASSISTANT_TEXT.askAmountExpense;
      this.recognition.prepare(AMOUNT_HINTS);
      if (!(await this.say(run, ask))) return;
      const heard = await this.listenSafe(run, AMOUNT_HINTS);
      if (run !== this.run || heard === null) return;
      amount = parseSpokenAmount(heard);
      if (amount === null) {
        await this.say(run, ASSISTANT_TEXT.noAmount);
        if (run === this.run) await this.router.navigateByUrl('/movimientos/nuevo');
        return;
      }
    }

    // Las mismas validaciones del formulario (HU04/HU05); el texto es el mismo.
    const errors = validateTx(
      {
        amountMinor: amount,
        occurredOn: draft.occurredOn,
        description: draft.description,
        note: '',
      },
      draft.categoryId,
      today,
    );
    if (hasErrors(errors)) {
      await this.say(run, Object.values(errors)[0] as string);
      return;
    }

    const categoryName = this.cats.byId().get(draft.categoryId as string)?.name;
    const summary = formatTransactionForSpeech(
      {
        type: draft.type,
        amountMinor: amount,
        occurredOn: draft.occurredOn,
        description: draft.description,
      },
      categoryName,
      currency,
      today,
    );
    const answer = await this.confirm(run, `${summary}. ${ASSISTANT_TEXT.confirmSuffix}`);
    if (answer === null) return;
    if (!answer) {
      await this.say(run, ASSISTANT_TEXT.cancelled);
      return;
    }

    const saved = await this.txs.save({
      type: draft.type,
      amountMinor: amount,
      categoryId: draft.categoryId as string,
      occurredOn: draft.occurredOn,
      description: draft.description,
      note: '',
      tags: [],
    });
    const alerts = await this.budgets.alertsAfterSave(
      saved,
      0,
      currency,
      categoryName ?? 'esta categoría',
    );
    this.toast.show(saved.type === 'income' ? 'Ingreso guardado' : 'Gasto guardado');
    for (const a of alerts) this.toast.alert(a);
    void this.sync.sync();
    const done = saved.type === 'income' ? ASSISTANT_TEXT.savedIncome : ASSISTANT_TEXT.savedExpense;
    await this.say(run, [done, ...alerts].join('. '));
  }

  // --- Eliminar el último (confirmación + Deshacer de HU07) -----------------------

  private async deleteLast(run: number, type: TypeFilter): Promise<void> {
    const target = this.txs
      .visible()
      .find((t) => t.status === 'confirmed' && (type === 'all' || t.type === type));
    if (!target) {
      await this.say(run, ASSISTANT_TEXT.nothingToDelete);
      return;
    }
    const summary = formatTransactionForSpeech(
      target,
      this.cats.byId().get(target.categoryId)?.name,
      this.auth.currency(),
      this.clock.today(),
    );
    const answer = await this.confirm(
      run,
      `Vas a eliminar: ${summary}. ${ASSISTANT_TEXT.confirmSuffix}`,
    );
    if (answer === null) return;
    if (!answer) {
      await this.say(run, ASSISTANT_TEXT.cancelled);
      return;
    }
    await this.txs.remove(target);
    this.toast.undo('Movimiento eliminado', () => void this.txs.restore(target));
    void this.sync.sync();
    await this.say(run, ASSISTANT_TEXT.deleted);
  }

  // --- Piezas de la conversación ----------------------------------------------------

  /**
   * Pregunta y escucha «sí» o «no». Reintenta una vez si no se entiende.
   * `true`/`false` = respuesta; `null` = se abandonó o no hubo respuesta (ya se avisó).
   */
  private async confirm(run: number, question: string): Promise<boolean | null> {
    // Los botones de la tarjeta responden igual que la voz y cortan lo que esté pasando
    const manual: { answer: boolean | null } = { answer: null };
    this.manual = (yes) => {
      manual.answer = yes;
      this.recognition.cancel();
      this.synthesis.stop();
    };
    this._awaitingAnswer.set(true);
    try {
      // La conexión se abre mientras se dice la pregunta: así, un «sí» inmediato no se pierde
      this.recognition.prepare(CONFIRM_HINTS);
      const spoke = await this.say(run, question);
      if (manual.answer !== null) return manual.answer;
      if (!spoke) return null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const heard = await this.listenSafe(run);
        if (manual.answer !== null) return manual.answer;
        if (run !== this.run || heard === null) return null;
        // Se muestra lo que se oyó: si «sí» no se entiende, al menos se ve por qué
        if (heard) this._transcript.set(heard);
        const answer = parseConfirmation(heard);
        if (answer) return answer === 'yes';
        if (attempt === 0) {
          this.recognition.prepare(CONFIRM_HINTS);
          const retry = heard
            ? ASSISTANT_TEXT.confirmNotUnderstood(heard)
            : ASSISTANT_TEXT.retryConfirm;
          const spokeRetry = await this.say(run, retry);
          if (manual.answer !== null) return manual.answer;
          if (!spokeRetry) return null;
        }
      }
      await this.say(run, ASSISTANT_TEXT.noAnswer);
      return manual.answer;
    } finally {
      this.manual = null;
      this._awaitingAnswer.set(false);
    }
  }

  /** Escucha una frase. `null` si se canceló o la conversación ya no es la vigente. */
  private async listen(
    run: number,
    phase: AssistantPhase,
    hints: readonly string[],
  ): Promise<string | null> {
    this._phase.set(phase);
    const text = await this.recognition.listen(hints);
    return run === this.run ? text : null;
  }

  /** Como `listen` para las respuestas cortas: si no entendió nada, devuelve vacío. */
  private async listenSafe(
    run: number,
    hints: readonly string[] = CONFIRM_HINTS,
  ): Promise<string | null> {
    try {
      return await this.listen(run, 'confirming', hints);
    } catch (e) {
      if (e instanceof SpeechError && e.kind === 'no_match') return '';
      throw e;
    }
  }

  /**
   * Vocabulario que se espera oír: sesga el reconocimiento de Azure hacia estas palabras
   * (y hacia los nombres de las categorías del usuario), con lo que «léeme», «gastos» o
   * «Alimentación» dejan de confundirse con palabras parecidas.
   */
  private commandHints(): string[] {
    return [...COMMAND_HINTS, ...this.cats.active().map((c) => c.name)];
  }

  /** Dice el texto. `false` si la conversación se abandonó mientras hablaba. */
  private async say(run: number, text: string): Promise<boolean> {
    if (run !== this.run) return false;
    this.lastReply = text;
    this._reply.set(text);
    this._phase.set('speaking');
    await this.synthesis.announce(text);
    return run === this.run;
  }

  private context(): CommandContext {
    return {
      categories: this.cats.active(),
      today: this.clock.today(),
      lastUsedByType: {
        expense: this.txs.lastUsedCategory('expense'),
        income: this.txs.lastUsedCategory('income'),
      },
    };
  }

  private fail(e: unknown): void {
    this._error.set(speechMessage(e, 'dictation'));
  }
}

const CONFIRM_HINTS = ['sí', 'no', 'correcto', 'cancela', 'dale', 'confirmo', 'claro'];
const AMOUNT_HINTS = ['mil', 'millones', 'pesos', 'cien mil', 'cincuenta mil', 'veinte mil'];

const COMMAND_HINTS = [
  'léeme',
  'léeme los últimos gastos',
  'léeme los últimos ingresos',
  'el último gasto',
  'el último ingreso',
  'últimos',
  'gastos',
  'ingresos',
  'movimientos',
  'agrega un gasto de',
  'agrega un ingreso de',
  'registra un gasto',
  'registra un ingreso',
  'cuánto he gastado',
  'cuánto he ganado',
  'balance',
  'presupuesto',
  'este mes',
  'mes pasado',
  'esta semana',
  'semana pasada',
  'hoy',
  'ayer',
  'elimina el último',
  've a presupuestos',
  'gráficos',
  'recurrentes',
  'categorías',
  'ajustes',
  'repite',
  'ayuda',
  'pesos',
  'mil',
  'millones',
];
