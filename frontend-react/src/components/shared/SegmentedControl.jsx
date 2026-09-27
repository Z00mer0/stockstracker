// src/components/shared/SegmentedControl.jsx
// block — na całą szerokość, równe segmenty i zwykły krój (w oknach, gdzie
// etykiety to słowa, a nie „1T/1M").
export default function SegmentedControl({ options, value, onChange, block = false, 'aria-label': ariaLabel }) {
  return (
    <div className={block ? 'seg seg-block' : 'seg'} role="group" aria-label={ariaLabel}>
      {options.map(opt => {
        const key = typeof opt === 'string' ? opt : opt.value;
        const label = typeof opt === 'string' ? opt : opt.label;
        return (
          <button
            key={key}
            // type="button": w formularzu przycisk bez typu wysyłałby formularz.
            type="button"
            aria-pressed={value === key}
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
