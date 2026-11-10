/** Estados y textos fijos del asistente de voz (HU20). Dominio puro. */

/** Lo que hace el asistente en cada momento; el botón flotante lo muestra. */
export type AssistantPhase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'confirming';

export const PHASE_LABEL: Record<AssistantPhase, string> = {
  idle: 'Toca para hablar',
  listening: 'Escuchando…',
  thinking: 'Pensando…',
  speaking: 'Hablando…',
  confirming: 'Esperando tu sí o no',
};

export const ASSISTANT_TEXT = {
  confirmSuffix: '¿Es correcto?',
  retryConfirm: 'No te entendí. Di sí para confirmar o no para cancelar',
  noAnswer: 'No recibí respuesta. Lo cancelé',
  cancelled: 'Cancelado, no guardé nada',
  askAmountExpense: '¿De cuánto fue el gasto?',
  askAmountIncome: '¿De cuánto fue el ingreso?',
  noAmount: 'No pude entender el monto. Abro el formulario para que lo completes',
  savedExpense: 'Listo, gasto guardado',
  savedIncome: 'Listo, ingreso guardado',
  deleted: 'Listo, eliminado. Puedes deshacerlo en pantalla durante 5 segundos',
  nothingToDelete: 'No encontré un movimiento para eliminar',
  unknown:
    'No te entendí. Puedes decir, por ejemplo: léeme los últimos 5 gastos, o agrega un gasto de 50 mil en almuerzo',
  help: 'Puedes decirme, por ejemplo: léeme los últimos 5 gastos. Léeme los últimos 3 ingresos. Agrega un gasto de 50 mil porque comí en un restaurante. Cuánto he gastado este mes. Cómo voy con el presupuesto de Alimentación. Ve a presupuestos. O elimina el último gasto.',
  nothingToRepeat: 'Todavía no he dicho nada que repetir',
  greeting:
    'Hola. Dime qué necesitas. Por ejemplo: léeme los últimos 5 gastos, o agrega un gasto de 50 mil',
  thanks: 'Con gusto',
  deleteHelp:
    'Por ahora solo puedo eliminar el último movimiento. Di, por ejemplo: elimina el último gasto',
  /** Se oyó algo, pero no era «sí» ni «no». */
  confirmNotUnderstood: (heard: string) =>
    `No te entendí. Escuché: ${heard}. Di sí para confirmar o no para cancelar`,
  /** Primera vez que no se entiende: se pide repetir y se vuelve a escuchar solo. */
  silence: 'No te escuché bien. ¿Puedes repetirlo?',
  /** `heard` es lo que sí se transcribió, para que el usuario vea qué entendió la app. */
  notUnderstood: (heard: string) =>
    `No te entendí. Escuché: ${heard}. ¿Puedes decirlo de otra forma?`,
} as const;
