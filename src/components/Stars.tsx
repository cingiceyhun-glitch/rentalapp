export function Stars({ value, onChange, size = 'md' }: { value: number; onChange?: (v: number) => void; size?: 'sm' | 'md' }) {
  return (
    <span className={`stars stars-${size}`} role={onChange ? 'radiogroup' : undefined} aria-label={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className={n <= value ? 'on' : ''}
            onClick={() => onChange(value === n ? 0 : n)}
          >
            ★
          </button>
        ) : (
          <span key={n} className={n <= value ? 'on' : ''} aria-hidden>
            ★
          </span>
        ),
      )}
    </span>
  );
}
