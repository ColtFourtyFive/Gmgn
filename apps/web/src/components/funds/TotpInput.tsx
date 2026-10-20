import { forwardRef } from 'react';
import { Input, type InputProps } from '@/components/ui';

export interface TotpInputProps extends Omit<InputProps, 'value' | 'onChange' | 'type'> {
  value: string;
  onChange: (value: string) => void;
  /** Also accept a recovery code (letters, digits, dashes) besides the 6-digit TOTP code. */
  allowRecovery?: boolean;
}

/** One-time code field: digits only (6), numeric keypad, OTP autofill. */
export const TotpInput = forwardRef<HTMLInputElement, TotpInputProps>(function TotpInput({ value, onChange, allowRecovery, className, ...rest }, ref) {
  return (
    <Input
      ref={ref}
      type="text"
      value={value}
      onChange={(e) => onChange(allowRecovery ? e.target.value.replace(/[^A-Za-z0-9-]/g, '').slice(0, 64) : e.target.value.replace(/\D/g, '').slice(0, 6))}
      inputMode={allowRecovery ? 'text' : 'numeric'}
      autoComplete="one-time-code"
      autoCapitalize="off"
      spellCheck={false}
      maxLength={allowRecovery ? 64 : 6}
      placeholder={allowRecovery ? '123456' : '6-digit code'}
      className={className ?? 'font-mono tracking-[0.2em]'}
      {...rest}
    />
  );
});
