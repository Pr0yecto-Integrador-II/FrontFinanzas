import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../../../core/api';
import { AuthService } from '../../../core/auth.service';
import { Clock } from '../../../core/clock';
import { Category, Transaction } from '../../../core/models';
import {
  PlaybackHandle,
  RecognitionHandle,
  SpeechCredentials,
  SpeechEngine,
} from '../../../core/speech/speech-engine';
import { SPEECH_TEXT, SpeechError } from '../../../core/speech/speech-errors';
import { SyncService } from '../../../core/sync.service';
import { Toast } from '../../../shared/toast.service';
import { CategoryRepo } from '../../categorias/data/category.repo';
import { TransactionRepo } from '../../movimientos/data/transaction.repo';
import { BudgetRepo } from '../../presupuestos/data/budget.repo';
import { AssistantService } from './assistant.service';

class FakeClock extends Clock {
  now(): Date {
    return new Date(2026, 9, 12, 10, 0, 0); // 12-oct-2026, hora local
  }
}

interface FakePlayback extends PlaybackHandle {
  text: string;
  finish(): void;
}

/** Motor de voz falso: nada de SDK, micrófono ni red. */
class FakeEngine extends SpeechEngine {
  recognitions: { resolve: (t: string | null) => void }[] = [];
  playbacks: FakePlayback[] = [];
  /** Cuántas veces se adelantó la conexión (mientras el asistente hablaba). */
  prepared = 0;
  /** Si es `true`, el micrófono tarda en abrirse: `markReady()` lo abre. */
  holdReady = false;
  markReady: () => void = () => undefined;

  async requestMicrophone(): Promise<boolean> {
    return true;
  }

  override prepare(): void {
    this.prepared++;
  }

  recognize(): RecognitionHandle {
    let reject: (e: unknown) => void = () => undefined;
    const result = new Promise<string | null>((res, rej) => {
      this.recognitions.push({ resolve: res });
      reject = rej;
    });
    let ready: Promise<void> | undefined;
    if (this.holdReady) ready = new Promise<void>((res) => (this.markReady = res));
    return {
      result,
      ready,
      cancel: () => {
        this.markReady();
        reject(new SpeechError('cancelled'));
      },
    };
  }

  speak(_c: SpeechCredentials, text: string): PlaybackHandle {
    let resolve: () => void = () => undefined;
    const done = new Promise<void>((res) => (resolve = res));
    const p: FakePlayback = {
      text,
      done,
      finish: () => resolve(),
      pause: () => undefined,
      resume: () => undefined,
      cancel: () => resolve(),
    };
    this.playbacks.push(p);
    return p;
  }
}

const flush = async (times = 8) => {
  for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
};

const cat = (id: string, name: string, type: 'expense' | 'income'): Category => ({
  id,
  name,
  nameKey: name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase(),
  type,
  icon: 'x',
  color: '#000000',
  isDefault: true,
  createdAt: '2026-10-01T00:00:00Z',
  deletedAt: null,
  syncState: 'synced',
});

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 't',
  type: 'expense',
  amountMinor: 2_500_000,
  categoryId: 'ali',
  occurredOn: '2026-10-12',
  description: 'Almuerzo',
  note: null,
  tags: [],
  status: 'confirmed',
  recurringRuleId: null,
  createdAt: '2026-10-12T12:00:00Z',
  deletedAt: null,
  syncState: 'synced',
  ...over,
});

describe('AssistantService (HU20)', () => {
  let engine: FakeEngine;
  let online: ReturnType<typeof signal<boolean>>;
  let repo: {
    visible: ReturnType<typeof signal<Transaction[]>>;
    save: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
    lastUsedCategory: () => null;
  };
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };
  let toast: {
    show: ReturnType<typeof vi.fn>;
    undo: ReturnType<typeof vi.fn>;
    alert: ReturnType<typeof vi.fn>;
  };
  let syncNow: ReturnType<typeof vi.fn>;
  let assistant: AssistantService;
  let currencyCode = 'COP';

  beforeEach(() => {
    currencyCode = 'COP';
    engine = new FakeEngine();
    online = signal(true);
    syncNow = vi.fn();
    repo = {
      visible: signal<Transaction[]>([
        tx({ id: 'a', amountMinor: 5_000_000, description: 'Crepes' }),
        tx({ id: 'b', amountMinor: 1_000_000, occurredOn: '2026-10-11', description: null }),
        tx({ id: 'c', type: 'income', categoryId: 'sal', amountMinor: 100_000_000 }),
      ]),
      save: vi.fn(async (input) => tx({ id: 'nuevo', ...input })),
      remove: vi.fn(async () => undefined),
      restore: vi.fn(async () => undefined),
      lastUsedCategory: () => null,
    };
    router = { navigateByUrl: vi.fn(async () => true) };
    toast = { show: vi.fn(), undo: vi.fn(), alert: vi.fn() };
    const categories = [
      cat('ali', 'Alimentación', 'expense'),
      cat('otg', 'Otros gastos', 'expense'),
      cat('sal', 'Salario', 'income'),
    ];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Api,
          useValue: {
            speechToken: async () => ({ token: 't', region: 'r', expires_in_seconds: 600 }),
          },
        },
        { provide: SyncService, useValue: { online, offline: () => !online(), sync: syncNow } },
        { provide: Clock, useClass: FakeClock },
        { provide: SpeechEngine, useValue: engine },
        {
          provide: AuthService,
          useValue: { account: signal({ id: 'u1' }), currency: () => currencyCode },
        },
        { provide: TransactionRepo, useValue: repo },
        {
          provide: CategoryRepo,
          useValue: {
            active: () => categories,
            byId: () => new Map(categories.map((c) => [c.id, c])),
          },
        },
        { provide: BudgetRepo, useValue: { active: () => [], alertsAfterSave: async () => [] } },
        { provide: Router, useValue: router },
        { provide: Toast, useValue: toast },
      ],
    });
    assistant = TestBed.inject(AssistantService);
  });

  const lastSpoken = () => engine.playbacks[engine.playbacks.length - 1];

  /** El usuario dice algo (la n-ésima escucha). */
  async function userSays(n: number, text: string | null) {
    await flush();
    engine.recognitions[n].resolve(text);
    await flush();
  }

  /** El asistente termina de hablar la frase actual. */
  async function finishSpeaking() {
    lastSpoken().finish();
    await flush();
  }

  it('lee los últimos gastos y no modifica nada', async () => {
    const p = assistant.activate();
    await userSays(0, 'Léeme los últimos 2 gastos');
    expect(assistant.transcript()).toBe('Léeme los últimos 2 gastos');
    expect(lastSpoken().text).toBe(
      'Tus últimos 2 gastos. ' +
        'Gasto de 50.000 pesos colombianos en la categoría Alimentación, registrado hoy, concepto: Crepes. ' +
        'Gasto de 10.000 pesos colombianos en la categoría Alimentación, registrado ayer',
    );
    await finishSpeaking();
    await p;
    expect(assistant.phase()).toBe('idle');
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('agregar gasto: lee el borrador y guarda SOLO al decir «sí»', async () => {
    const p = assistant.activate();
    await userSays(0, 'Agrega un nuevo gasto de 50000 porque comí en Crepes and Waffles hoy');
    expect(lastSpoken().text).toBe(
      'Gasto de 50.000 pesos colombianos en la categoría Alimentación, registrado hoy, concepto: Crepes and Waffles. ¿Es correcto?',
    );
    expect(repo.save).not.toHaveBeenCalled(); // todavía es un borrador

    await finishSpeaking();
    expect(assistant.phase()).toBe('confirming');
    await userSays(1, 'Sí');

    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith({
      type: 'expense',
      amountMinor: 5_000_000, // centavos
      categoryId: 'ali',
      occurredOn: '2026-10-12',
      description: 'Crepes and Waffles',
      note: '',
      tags: [],
    });
    expect(syncNow).toHaveBeenCalled();
    expect(lastSpoken().text).toBe('Listo, gasto guardado');
    await finishSpeaking();
    await p;
    expect(assistant.phase()).toBe('idle');
  });

  it('adelanta la conexión mientras dice la pregunta, para no perder un «sí» inmediato', async () => {
    const p = assistant.activate();
    await userSays(0, 'agrega un gasto de 20 mil en almuerzo');
    expect(engine.prepared).toBeGreaterThan(0); // antes de terminar de hablar
    await finishSpeaking();
    await userSays(1, 'sí');
    await finishSpeaking();
    await p;
  });

  it('mientras el micrófono se abre no dice «escuchando» (lo que se hable se perdería)', async () => {
    engine.holdReady = true;
    const p = assistant.activate();
    await flush();
    expect(assistant.status()).toBe('Preparando el micrófono…');
    engine.markReady();
    await flush();
    expect(assistant.status()).toBe('Escuchando…');
    engine.recognitions[0].resolve('para');
    await p;
  });

  it('muestra lo que oyó en la confirmación y, si no es sí/no, lo dice', async () => {
    const p = assistant.activate();
    await userSays(0, 'agrega un gasto de 20 mil en almuerzo');
    await finishSpeaking();
    await userSays(1, 'eh dame un segundo');
    expect(assistant.transcript()).toBe('eh dame un segundo');
    expect(lastSpoken().text).toBe(
      'No te entendí. Escuché: eh dame un segundo. Di sí para confirmar o no para cancelar',
    );
    await finishSpeaking();
    await userSays(2, 'sí');
    expect(repo.save).toHaveBeenCalledTimes(1);
    await finishSpeaking();
    await p;
  });

  it('los botones de la tarjeta confirman igual que decir «sí»', async () => {
    const p = assistant.activate();
    await userSays(0, 'agrega un gasto de 20 mil en almuerzo');
    expect(assistant.awaitingAnswer()).toBe(true);
    assistant.answer(true); // sin hablar, incluso mientras todavía está leyendo la pregunta
    await flush();
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(lastSpoken().text).toBe('Listo, gasto guardado');
    await finishSpeaking();
    await p;
    expect(assistant.awaitingAnswer()).toBe(false);
  });

  it('el botón «No» descarta el borrador y no guarda', async () => {
    const p = assistant.activate();
    await userSays(0, 'agrega un gasto de 20 mil en almuerzo');
    await finishSpeaking();
    await flush(); // ya está escuchando la respuesta
    assistant.answer(false);
    await flush();
    expect(repo.save).not.toHaveBeenCalled();
    expect(lastSpoken().text).toBe('Cancelado, no guardé nada');
    await finishSpeaking();
    await p;
  });

  it('los botones no hacen nada si no hay pregunta pendiente', async () => {
    assistant.answer(true);
    expect(assistant.awaitingAnswer()).toBe(false);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('decir «no» descarta el borrador y no guarda nada', async () => {
    const p = assistant.activate();
    await userSays(0, 'agrega un gasto de 20 mil en almuerzo');
    await finishSpeaking();
    await userSays(1, 'no');
    expect(repo.save).not.toHaveBeenCalled();
    expect(lastSpoken().text).toBe('Cancelado, no guardé nada');
    await finishSpeaking();
    await p;
  });

  it('si no entiende el «sí/no» reintenta una vez y luego cancela sin guardar', async () => {
    const p = assistant.activate();
    await userSays(0, 'agrega un gasto de 20 mil en almuerzo');
    await finishSpeaking();
    await userSays(1, 'eh quizás');
    expect(lastSpoken().text).toContain('Di sí para confirmar o no para cancelar');
    await finishSpeaking();
    await userSays(2, null); // silencio
    expect(lastSpoken().text).toBe('No recibí respuesta. Lo cancelé');
    await finishSpeaking();
    await p;
    expect(repo.save).not.toHaveBeenCalled();
    expect(engine.recognitions).toHaveLength(3);
  });

  it('sin monto lo pregunta, y lo usa en el borrador', async () => {
    const p = assistant.activate();
    await userSays(0, 'agrega un gasto en almuerzo');
    expect(lastSpoken().text).toBe('¿De cuánto fue el gasto?');
    await finishSpeaking();
    await userSays(1, 'cuarenta mil');
    expect(lastSpoken().text).toContain('Gasto de 40.000 pesos colombianos');
    await finishSpeaking();
    await userSays(2, 'sí');
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 4_000_000 }));
    await finishSpeaking();
    await p;
  });

  it('si el monto sigue sin entenderse, abre el formulario y no guarda', async () => {
    const p = assistant.activate();
    await userSays(0, 'agrega un gasto en almuerzo');
    await finishSpeaking();
    await userSays(1, 'no sé cuánto fue');
    expect(lastSpoken().text).toContain('Abro el formulario');
    await finishSpeaking();
    await p;
    expect(router.navigateByUrl).toHaveBeenCalledWith('/movimientos/nuevo');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rechaza una fecha futura con el mismo texto del formulario', async () => {
    const p = assistant.activate();
    await userSays(0, 'agrega un gasto de 10000 mañana');
    expect(lastSpoken().text).toBe('La fecha no puede ser futura');
    await finishSpeaking();
    await p;
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('eliminar el último: confirma, elimina y ofrece Deshacer', async () => {
    const p = assistant.activate();
    await userSays(0, 'elimina el último gasto');
    expect(lastSpoken().text).toContain('Vas a eliminar: Gasto de 50.000 pesos colombianos');
    await finishSpeaking();
    await userSays(1, 'sí');
    expect(repo.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    expect(toast.undo).toHaveBeenCalledWith('Movimiento eliminado', expect.any(Function));
    await finishSpeaking();
    await p;
  });

  it('eliminar el último y decir «no» no borra nada', async () => {
    const p = assistant.activate();
    await userSays(0, 'borra el último gasto');
    await finishSpeaking();
    await userSays(1, 'no');
    expect(repo.remove).not.toHaveBeenCalled();
    await finishSpeaking();
    await p;
  });

  it('navega a otra pantalla', async () => {
    const p = assistant.activate();
    await userSays(0, 've a presupuestos');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/presupuestos');
    expect(lastSpoken().text).toBe('Abriendo presupuestos');
    await finishSpeaking();
    await p;
  });

  it('si no entiende, dice qué escuchó y vuelve a escuchar SOLO, sin tocar el botón', async () => {
    const p = assistant.activate();
    await userSays(0, 'qué buen día');
    expect(lastSpoken().text).toBe(
      'No te entendí. Escuché: qué buen día. ¿Puedes decirlo de otra forma?',
    );
    await finishSpeaking();
    // segunda escucha automática: ahora sí se entiende
    await userSays(1, 'léeme el último gasto');
    expect(assistant.transcript()).toBe('léeme el último gasto');
    expect(lastSpoken().text).toMatch(/^Tu último gasto\. /);
    await finishSpeaking();
    await p;
    expect(engine.recognitions).toHaveLength(2);
  });

  it('tras dos intentos fallidos da ejemplos y no insiste más', async () => {
    const p = assistant.activate();
    await userSays(0, 'qué buen día');
    await finishSpeaking();
    await userSays(1, 'el perro corre');
    expect(lastSpoken().text).toContain('léeme los últimos 5 gastos');
    await finishSpeaking();
    await p;
    expect(engine.recognitions).toHaveLength(2);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('las frases torcidas por la transcripción también se entienden', async () => {
    const p = assistant.activate();
    await userSays(0, 'leme los ultimos 2 gastoz');
    expect(lastSpoken().text).toMatch(/^Tus últimos 2 gastos\. /);
    await finishSpeaking();
    await p;
    expect(engine.recognitions).toHaveLength(1); // a la primera
  });

  it('filtra por categoría y avisa cuántos más hay', async () => {
    const p = assistant.activate();
    await userSays(0, 'léeme el último gasto de alimentación');
    expect(lastSpoken().text).toMatch(/^Tu último gasto en Alimentación\. .*Tienes 1 más/);
    await finishSpeaking();
    await p;
  });

  it('dice los montos con la moneda de la cuenta (pesos), no como dólares', async () => {
    const p = assistant.activate();
    await userSays(0, 'agrega un gasto de 50000 en almuerzo');
    expect(lastSpoken().text).toContain('50.000 pesos colombianos');
    expect(lastSpoken().text).not.toContain('$');
    expect(lastSpoken().text).not.toMatch(/d[óo]lar/i);
    await finishSpeaking();
    await userSays(1, 'no');
    await finishSpeaking();
    await p;
  });

  it('si la cuenta es en dólares, entonces sí dice dólares', async () => {
    currencyCode = 'USD';
    const p = assistant.activate();
    await userSays(0, 'léeme el último gasto');
    expect(lastSpoken().text).toContain('50.000 dólares estadounidenses');
    await finishSpeaking();
    await p;
  });

  it('responde cuántos y el mayor gasto', async () => {
    const first = assistant.activate();
    await userSays(0, '¿cuántos gastos tengo este mes?');
    expect(lastSpoken().text).toBe('Este mes tienes 2 gastos registrados');
    await finishSpeaking();
    await first;

    const second = assistant.activate();
    await userSays(1, 'cuál es mi mayor gasto');
    expect(lastSpoken().text).toContain(
      'Tu mayor gasto este mes fue: Gasto de 50.000 pesos colombianos',
    );
    await finishSpeaking();
    await second;
  });

  it('saluda y agradece en vez de decir que no entendió', async () => {
    const p = assistant.activate();
    await userSays(0, 'hola');
    expect(lastSpoken().text).toContain('Dime qué necesitas');
    await finishSpeaking();
    await p;
    expect(engine.recognitions).toHaveLength(1);
  });

  it('eliminar algo que no es «el último» lo explica y no borra', async () => {
    const p = assistant.activate();
    await userSays(0, 'elimina el gasto de rappi');
    expect(lastSpoken().text).toContain('solo puedo eliminar el último movimiento');
    await finishSpeaking();
    await p;
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('tocar el botón mientras habla lo detiene todo y no guarda', async () => {
    const p = assistant.activate();
    await userSays(0, 'agrega un gasto de 20 mil en almuerzo');
    expect(assistant.busy()).toBe(true);
    void assistant.activate(); // segundo toque = detener
    await flush();
    await p;
    expect(assistant.phase()).toBe('idle');
    expect(repo.save).not.toHaveBeenCalled();
    expect(engine.recognitions).toHaveLength(1); // no volvió a escuchar
  });

  it('sin conexión muestra el aviso y no usa el micrófono', async () => {
    online.set(false);
    await assistant.activate();
    expect(assistant.error()).toBe(SPEECH_TEXT.offlineDictation);
    expect(engine.recognitions).toHaveLength(0);
    expect(assistant.phase()).toBe('idle');
  });

  it('silencio: pide repetir, escucha otra vez y, si sigue el silencio, da ejemplos', async () => {
    const p = assistant.activate();
    await userSays(0, null);
    expect(lastSpoken().text).toBe('No te escuché bien. ¿Puedes repetirlo?');
    await finishSpeaking();
    await userSays(1, null);
    expect(lastSpoken().text).toContain('léeme los últimos 5 gastos');
    await finishSpeaking();
    await p;
    expect(repo.save).not.toHaveBeenCalled();
    expect(engine.recognitions).toHaveLength(2);
  });

  it('el silencio en la primera escucha no impide que la segunda funcione', async () => {
    const p = assistant.activate();
    await userSays(0, null);
    await finishSpeaking();
    await userSays(1, 'léeme el último ingreso');
    expect(lastSpoken().text).toMatch(/^Tu último ingreso\. /);
    await finishSpeaking();
    await p;
  });

  it('«repite» vuelve a decir lo último', async () => {
    const first = assistant.activate();
    await userSays(0, 'cuánto he gastado este mes');
    const said = lastSpoken().text;
    await finishSpeaking();
    await first;
    const second = assistant.activate();
    await userSays(1, 'repite');
    expect(lastSpoken().text).toBe(said);
    await finishSpeaking();
    await second;
  });
});
