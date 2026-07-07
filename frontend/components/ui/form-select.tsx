import { cn } from '@/lib/utils';

export interface FormSelectOption {
  value: string;
  label: string;
}

interface FormSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: FormSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function FormSelect({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
  id,
}: FormSelectProps) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onValueChange(e.target.value)}
      className={cn(
        'flex h-9 w-full min-w-[200px] rounded-lg border border-input bg-transparent px-3 py-1 text-base transition-colors outline-none',
        'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}