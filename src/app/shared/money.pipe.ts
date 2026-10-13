import { Pipe, PipeTransform, inject } from '@angular/core';
import { AuthService } from '../core/auth.service';
import { formatMoney } from '../core/money';

/** `{{ minor | money }}` usa la moneda de la cuenta; `| money:'sign'` agrega el + a positivos. */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  private readonly currency = inject(AuthService).currency;

  transform(minor: number | null | undefined, mode?: 'sign'): string {
    return formatMoney(minor ?? 0, this.currency(), { sign: mode === 'sign' });
  }
}
