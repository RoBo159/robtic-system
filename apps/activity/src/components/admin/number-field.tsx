interface NumberFieldProps {
    label: string;
    hint?: string;
    value: number;
    min?: number;
    max?: number;
    /** Defaults to whole numbers — pass a fraction for the rate fields that accept one. */
    step?: number;
    onChange: (value: number) => void;
}

export function NumberField({ label, hint, value, min, max, step, onChange }: NumberFieldProps) {
    return (
        <label className="field">
            <span className="field__label">{label}</span>
            {hint && <span className="field__hint">{hint}</span>}
            <input
                className="field__input"
                type="number"
                value={Number.isFinite(value) ? value : 0}
                min={min}
                max={max}
                step={step}
                onChange={(e) => onChange(Number(e.target.value))}
            />
        </label>
    );
}
