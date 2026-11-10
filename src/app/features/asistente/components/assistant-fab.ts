import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { SyncService } from '../../../core/sync.service';
import { SPEECH_TEXT } from '../../../core/speech/speech-errors';
import { AssistantService } from '../data/assistant.service';

/**
 * Botón flotante del asistente de voz (HU20). Se monta una vez en el shell, así está en
 * cualquier pantalla con sesión. Tocarlo empieza a escuchar; tocarlo de nuevo lo detiene todo.
 */
@Component({
  selector: 'app-assistant-fab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './assistant-fab.html',
  styleUrl: './assistant-fab.scss',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class AssistantFab {
  protected readonly assistant = inject(AssistantService);
  protected readonly offline = inject(SyncService).offline;

  protected readonly hasCard = computed(
    () => !!(this.assistant.transcript() || this.assistant.reply() || this.assistant.error()),
  );
  protected readonly icon = computed(() => (this.assistant.busy() ? 'stop' : 'mic'));
  protected readonly label = computed(() => {
    if (this.offline()) return SPEECH_TEXT.offline;
    return this.assistant.busy() ? 'Detener el asistente de voz' : 'Hablar con el asistente de voz';
  });

  constructor() {
    // Salir de la sesión corta la escucha y la voz
    inject(DestroyRef).onDestroy(() => this.assistant.stop());
  }

  protected toggle(): void {
    if (this.offline() && !this.assistant.busy()) return;
    void this.assistant.activate();
  }

  /** Atajo de teclado: Alt + V. */
  protected onKey(e: KeyboardEvent): void {
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      this.toggle();
    }
  }
}
