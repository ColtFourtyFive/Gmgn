import { useId, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

export interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  /** Error message for an invalid entry (it is then kept in the field, not added). */
  validate?: (tag: string) => string | null;
  /** Canonical form of an entry before validation and de-duplication. */
  normalize?: (raw: string) => string;
  placeholder?: string;
  /** Maximum number of entries. */
  max?: number;
  /** Max characters per entry. */
  maxLength?: number;
  /** Monospace chips (addresses). */
  mono?: boolean;
  /** Custom chip content (defaults to the entry). */
  renderTag?: (tag: string) => ReactNode;
  invalid?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

/**
 * Multi-value text field: Enter, comma or Tab-out commits an entry, pasting a
 * list (comma/space/newline separated) adds all valid entries, Backspace on an
 * empty field removes the last chip. Duplicates are ignored.
 */
export function TagInput({
  value,
  onChange,
  validate,
  normalize = (s) => s.trim(),
  placeholder,
  max,
  maxLength,
  mono,
  renderTag,
  invalid,
  id,
  'aria-label': ariaLabel,
  'aria-describedby': describedBy,
}: TagInputProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const errId = useId();
  const full = max !== undefined && value.length >= max;

  /** Try to add entries; returns the ones that could not be added. */
  const add = (raws: string[]): string[] => {
    const next = [...value];
    const rejected: string[] = [];
    let message: string | null = null;
    for (const raw of raws) {
      const tag = normalize(raw);
      if (!tag) continue;
      if (next.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
      if (max !== undefined && next.length >= max) {
        message = `Up to ${max} entries`;
        rejected.push(raw);
        continue;
      }
      const err = validate?.(tag) ?? null;
      if (err) {
        message = err;
        rejected.push(raw);
        continue;
      }
      next.push(tag);
    }
    if (next.length !== value.length) onChange(next);
    setError(message);
    return rejected;
  };

  const commit = () => {
    if (!text.trim()) return;
    const rejected = add([text]);
    setText(rejected[0] ?? '');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && text === '' && value.length > 0) {
      e.preventDefault();
      onChange(value.slice(0, -1));
      setError(null);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    const parts = pasted.split(/[\s,;]+/).filter(Boolean);
    if (parts.length < 2) return;
    e.preventDefault();
    const rejected = add(parts);
    setText(rejected.join(' '));
  };

  const remove = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
    setError(null);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-1">
      <div
        className={clsx(
          'flex min-h-8 w-full flex-wrap items-center gap-1 rounded border bg-panel-2 px-1.5 py-1 text-sm transition-colors focus-within:border-accent',
          invalid || error ? 'border-down' : 'border-line',
        )}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        {value.map((tag) => (
          <span key={tag} className={clsx('chip max-w-full bg-panel-3 !py-0.5 text-fg', mono && 'font-mono')} title={tag}>
            <span className="truncate">{renderTag ? renderTag(tag) : tag}</span>
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              onClick={() => remove(tag)}
              className="-mr-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-faint hover:bg-line-strong/60 hover:text-fg"
            >
              <X size={10} strokeWidth={2.5} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          value={text}
          disabled={full}
          maxLength={maxLength}
          placeholder={full ? `Limit of ${max} reached` : value.length ? undefined : placeholder}
          aria-label={ariaLabel}
          aria-invalid={invalid || !!error || undefined}
          aria-describedby={clsx(describedBy, error && errId) || undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={commit}
          className={clsx('input-bare h-6 min-w-[8ch] flex-1 px-0.5 text-sm disabled:cursor-not-allowed', mono && 'font-mono text-xs')}
        />
      </div>
      {error && (
        <p id={errId} className="text-xs text-down" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
