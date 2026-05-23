// src/components/shared/SegmentedControl.jsx
export default function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map(opt => {
        const key = typeof opt === 'string' ? opt : opt.value;
        const label = typeof opt === 'string' ? opt : opt.label;
        return (
          <button
            key={key}
            className={value === key ? 'active' : ''}
            onClick={() => onChange(key)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
