import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Step {
  title: string;
  text: string;
}

interface Section {
  id: string;
  icon: string;
  title: string;
  intro: string;
  steps?: Step[];
  tips?: string[];
  link?: { path: string; label: string };
}

interface Faq {
  q: string;
  a: string;
}

/** Manual de usuario: guía corta, por temas, para quien usa la app por primera vez. */
@Component({
  selector: 'app-help-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './help.page.html',
  styleUrl: './help.page.scss',
})
export class HelpPage {
  protected readonly quick = [
    { icon: 'add_circle', title: 'Registra', text: 'Anota un gasto o ingreso con el botón «+». Toma menos de 10 segundos.' },
    { icon: 'donut_small', title: 'Ponte un límite', text: 'Crea un presupuesto por categoría y la app te avisa antes de pasarte.' },
    { icon: 'insights', title: 'Revisa', text: 'En Inicio y Gráficos ves cuánto entra, cuánto sale y en qué se va.' },
  ];

  protected readonly sections: Section[] = [
    {
      id: 'registrar',
      icon: 'add_circle',
      title: 'Registrar un gasto o ingreso',
      intro: 'Es lo que más vas a hacer, por eso es lo más rápido de toda la app.',
      steps: [
        { title: 'Pulsa «+»', text: 'En el móvil es el botón verde del centro de la barra inferior; en el computador, «Nuevo movimiento» en la barra lateral.' },
        { title: 'Elige Gasto o Ingreso', text: 'Arriba del formulario hay dos opciones. Por defecto aparece Gasto.' },
        { title: 'Escribe el monto', text: 'Solo el número, por ejemplo 12500. La app se encarga del formato.' },
        { title: 'Elige la categoría', text: 'En un ingreso se llama «Fuente» (sueldo, regalo…).' },
        { title: 'Indica la fecha', text: 'Usa «Hoy» o «Ayer», o elige otro día. No se pueden registrar fechas futuras.' },
        { title: 'Guarda', text: 'Listo. Aparece al instante en tu historial.' },
      ],
      tips: [
        'La descripción es opcional y admite hasta 100 caracteres; la nota, hasta 500.',
        'Las etiquetas (máximo 5 por movimiento) sirven para agrupar cosas que cruzan categorías, como «viaje» o «cumpleaños». La app te sugiere las que ya usaste.',
      ],
      link: { path: '/movimientos/nuevo', label: 'Registrar un movimiento' },
    },
    {
      id: 'historial',
      icon: 'receipt_long',
      title: 'Historial, búsqueda y filtros',
      intro: 'En Movimientos ves todo lo que has registrado, agrupado por día y con el total de cada uno.',
      steps: [
        { title: 'Busca por texto', text: 'La barra de búsqueda mira la descripción y la nota.' },
        { title: 'Filtra', text: 'Abre el panel de filtros para acotar por periodo (este mes, mes pasado, últimos 30 días, este año, personalizado), tipo, categoría, rango de monto y etiqueta.' },
        { title: 'Combina', text: 'Puedes usar varios filtros a la vez para encontrar justo lo que buscas.' },
      ],
      link: { path: '/movimientos', label: 'Ir a Movimientos' },
    },
    {
      id: 'editar',
      icon: 'edit',
      title: 'Editar y eliminar',
      intro: 'Te equivocaste de monto o de categoría: se arregla en un momento.',
      steps: [
        { title: 'Editar', text: 'Toca el movimiento en el historial, cambia lo que necesites y guarda.' },
        { title: 'Eliminar', text: 'Dentro del movimiento pulsa el icono de papelera.' },
        { title: 'Deshacer', text: 'Después de eliminar aparece el aviso «Movimiento eliminado · Deshacer» durante 5 segundos. Si fue sin querer, tócalo y vuelve a su lugar.' },
      ],
    },
    {
      id: 'categorias',
      icon: 'category',
      title: 'Categorías',
      intro: 'Las categorías te dicen en qué gastas. La app trae las más comunes y puedes crear las tuyas.',
      steps: [
        { title: 'Crea una', text: 'En Categorías pulsa para añadir una nueva, ponle un nombre y elige su icono y su color.' },
        { title: 'Nombres únicos', text: 'No puede haber dos con el mismo nombre; no importan mayúsculas ni tildes («Cafe» y «Café» cuentan como la misma).' },
        { title: 'Al eliminar', text: 'Si la categoría ya tiene movimientos, la app te pide elegir a cuál categoría pasarlos. Así no pierdes ningún registro.' },
      ],
      link: { path: '/categorias', label: 'Ir a Categorías' },
    },
    {
      id: 'presupuestos',
      icon: 'donut_small',
      title: 'Presupuestos',
      intro: 'Un presupuesto es el máximo que quieres gastar en una categoría durante el mes.',
      steps: [
        { title: 'Crea el límite', text: 'En Presupuestos elige la categoría y el monto mensual.' },
        { title: 'Sigue la barra', text: 'Cada presupuesto muestra cuánto llevas gastado de ese límite.' },
        { title: 'Entiende los colores', text: 'Verde: vas bien (menos del 80 %). Amarillo: te acercas (del 80 % al 99 %). Rojo: llegaste o pasaste el límite (100 % o más).' },
      ],
      tips: ['La app te avisa cuando cruzas el 80 % y el 100 %, para que puedas frenar a tiempo.'],
      link: { path: '/presupuestos', label: 'Ir a Presupuestos' },
    },
    {
      id: 'recurrentes',
      icon: 'event_repeat',
      title: 'Pagos e ingresos recurrentes',
      intro: 'Para lo que se repite: arriendo, suscripciones, sueldo… Lo configuras una vez y la app lo registra por ti.',
      steps: [
        { title: 'Crea la regla', text: 'En Recurrentes añade una nueva: monto, categoría y fecha de inicio. Si quieres, también una fecha de fin.' },
        { title: 'Elige la frecuencia', text: 'Cada día, cada semana, quincenal, cada mes o cada año.' },
        { title: 'Elige cómo se registra', text: 'Automático: en su fecha se registra solo. Con confirmación: la app te pide confirmar el monto, ideal para facturas que cambian cada mes.' },
        { title: 'Mira lo que viene', text: 'La pantalla «Próximos» muestra lo que se generará en los siguientes 30 días.' },
      ],
      tips: ['Si eliminas una regla, deja de generar movimientos. Los que ya se registraron se conservan.'],
      link: { path: '/recurrentes', label: 'Ir a Recurrentes' },
    },
    {
      id: 'resumen',
      icon: 'insights',
      title: 'Resumen y gráficos',
      intro: 'Para entender tu mes de un vistazo.',
      steps: [
        { title: 'Inicio', text: 'Muestra el balance del mes (ingresos menos gastos), cuánto entró, cuánto salió, la comparación con el mes anterior y en qué categoría gastas más.' },
        { title: 'Cambia de mes', text: 'Usa las flechas del selector de mes para ver meses anteriores.' },
        { title: 'Gráficos', text: 'Una dona con el reparto de gastos por categoría y barras con los últimos 6 meses. Cada gráfico tiene su tabla equivalente con los mismos datos.' },
      ],
      link: { path: '/graficos', label: 'Ir a Gráficos' },
    },
    {
      id: 'conexion',
      icon: 'cloud_sync',
      title: 'Sin internet y sincronización',
      intro: 'La app funciona aunque no tengas conexión. No necesitas hacer nada especial.',
      steps: [
        { title: 'Guarda en tu dispositivo', text: 'Todo lo que registras se guarda primero en tu dispositivo.' },
        { title: 'Se envía solo', text: 'Cuando vuelve internet, los cambios se sincronizan automáticamente.' },
        { title: 'Mira el estado', text: '«Todo al día» significa que está sincronizado. «Sincronizando…» o «por sincronizar» significa que hay cambios en camino. «Sin conexión» te avisa que estás offline.' },
      ],
      tips: ['Si algún cambio es rechazado, aparece en Ajustes → «Cambios rechazados», donde puedes reintentarlo o descartarlo.'],
    },
    {
      id: 'ajustes',
      icon: 'settings',
      title: 'Ajustes y tu cuenta',
      intro: 'Personaliza la app y cuida tu sesión.',
      steps: [
        { title: 'Apariencia', text: 'Elige tema claro, oscuro o automático (sigue el de tu dispositivo).' },
        { title: 'Sincronizar ahora', text: 'Fuerza el envío de cambios si no quieres esperar.' },
        { title: 'Cerrar sesión', text: 'Cierra la sesión en este dispositivo, o en todos los dispositivos si crees que alguien más pudo entrar. Al salir se borran los datos guardados en este dispositivo.' },
      ],
      link: { path: '/ajustes', label: 'Ir a Ajustes' },
    },
  ];

  protected readonly faqs: Faq[] = [
    { q: '¿Olvidé mi contraseña, qué hago?', a: 'En la pantalla de ingreso pulsa «Olvidé mi contraseña». Te enviaremos un correo con un enlace para crear una nueva.' },
    { q: '¿Puedo usar la app en el celular y en el computador?', a: 'Sí. Ingresa con la misma cuenta en ambos y tus datos se sincronizan. Además puedes instalarla desde el navegador como una app.' },
    { q: 'Registré algo sin internet, ¿se perdió?', a: 'No. Queda guardado en tu dispositivo y se envía cuando vuelva la conexión. No cierres sesión antes de que diga «Todo al día».' },
    { q: 'Me equivoqué al eliminar un movimiento.', a: 'Pulsa «Deshacer» en el aviso que aparece durante 5 segundos después de eliminar.' },
    { q: 'No me deja guardar un movimiento.', a: 'Revisa que el monto sea mayor que cero, que hayas elegido una categoría y que la fecha no sea futura. Los campos con problema se marcan en rojo con un mensaje.' },
  ];

  protected go(id: string): void {
    document.getElementById(id)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  }
}
