import { Plus, X } from 'lucide-react';
import { IconButton, NumberInput } from '@/components/ui';

export interface NumberListProps {
  /** NaN marks an empty entry (validation reports it). */
  values: number[];
  onChange: (values: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  maxItems?: number;
  minItems?: number;
  suffix?: string;
  /** Accessible name of each entry: `${label} 1`, `${label} 2`, ... */
  label: string;
  /** Value appended by "Add". */
  nextValue?: (values: number[]) => number;
  invalid?: boolean;
}

/** Editable list of numbers (quick-buy amounts, quick-sell percents). */
export function NumberList({ values, onChange, min, max, step = 0.01, maxItems = 8, minItems = 1, suffix, label, nextValue, invalid }: NumberListProps) {
  const update = (i: number, v: number | null) => onChange(values.map((x, j) => (j === i ? (v ?? NaN) : x)));
  const add = () => {
    const finite = values.filter(Number.isFinite);
    const next = nextValue ? nextValue(values) : finite.length ? Math.max(...finite) * 2 : 1;
    onChange([...values, max !== undefined ? Math.min(max, next) : next]);
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {values.map((v, i) => (
        <div key={i} className="flex items-center">
          <NumberInput
            value={Number.isFinite(v) ? v : null}
            onChange={(n) => update(i, n)}
            min={min}
            max={max}
            step={step}
            suffix={suffix}
            size="sm"
            aria-label={`${label} ${i + 1}`}
            invalid={invalid && !(Number.isFinite(v) && v > 0)}
            wrapperClassName="!w-[96px] rounded-r-none"
          />
          <IconButton
            size="sm"
            variant="outline"
            label={`Remove ${label.toLowerCase()} ${i + 1}`}
            icon={<X size={12} />}
            disabled={values.length <= minItems}
            onClick={() => onChange(values.filter((_, j) => j !== i))}
            className="-ml-px rounded-l-none"
          />
        </div>
      ))}
      {values.length < maxItems && (
        <IconButton size="sm" variant="outline" label={`Add ${label.toLowerCase()}`} icon={<Plus size={13} />} onClick={add} />
      )}
    </div>
  );
}
