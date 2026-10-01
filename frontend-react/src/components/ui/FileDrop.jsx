import { useRef, useState } from 'react';
import { FileCheck2, FileUp } from 'lucide-react';
import { cx } from './cx.js';
import Button from './Button.jsx';
import Spinner from './Spinner.jsx';

// Pole „przeciągnij plik albo wybierz" dla okien importu. Przycisk jest
// prawdziwym <button> (klawiatura, czytnik ekranu) — samo klikalne pole
// z przerywaną ramką nie było dostępne bez myszy.
export default function FileDrop({ accept, multiple = false, onFiles, buttonLabel, hint, busy = false, busyLabel, fileName, compact = false }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const pick = files => { if (files?.length) onFiles(Array.from(files)); };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); if (!busy) pick(e.dataTransfer.files); }}
      className={cx(
        'flex flex-col items-center gap-2.5 rounded-card border border-dashed text-center transition-colors',
        compact ? 'px-4 py-4' : 'px-6 py-7',
        over ? 'border-accent bg-panel-2' : fileName ? 'border-accent' : 'border-line-strong',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={e => { pick(e.target.files); e.target.value = ''; }}
      />
      {busy ? (
        <span className="flex items-center gap-2 text-small text-dim"><Spinner size="sm" />{busyLabel}</span>
      ) : fileName ? (
        <span className="flex items-center gap-2 text-small font-semibold text-accent-text"><FileCheck2 size={16} aria-hidden />{fileName}</span>
      ) : (
        !compact && (
          <span className="grid h-11 w-11 place-items-center rounded-full border border-line bg-panel-2 text-dim">
            <FileUp size={20} aria-hidden />
          </span>
        )
      )}
      <Button size="sm" variant={fileName ? 'secondary' : 'primary'} disabled={busy} onClick={() => inputRef.current?.click()}>{buttonLabel}</Button>
      {hint && <p className="text-[11px] text-faint">{hint}</p>}
    </div>
  );
}
