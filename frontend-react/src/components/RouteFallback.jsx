import { useEffect, useState } from 'react';
import { useT } from '../context/LanguageContext';
import Skeleton from './ui/Skeleton.jsx';

// Widok na czas dociągania kodu strony (React.lazy): szkielet w kształcie
// typowej strony zamiast samotnej kropki, więc przejście nie wygląda jak
// pusty ekran. Pojawia się dopiero po 180 ms — przy szybkim przejściu nie
// ma czego pokazywać, a mignięcie szkieletu wyglądałoby gorzej niż nic.
export default function RouteFallback() {
  const t = useT();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShow(true), 180);
    return () => clearTimeout(id);
  }, []);

  return (
    <div role="status" aria-busy="true" aria-label={t('loading')}>
      {show && (
        <div aria-hidden>
          <Skeleton className="mb-2 h-7 w-48" />
          <Skeleton className="mb-6 h-4 w-72 max-w-full" />
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="flex flex-col gap-3 rounded-card border border-line bg-panel p-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-28" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
          <div className="rounded-card border border-line bg-panel p-4">
            <Skeleton className="mb-4 h-4 w-40" />
            <Skeleton className="h-56 w-full" rounded="rounded-card-sm" />
          </div>
        </div>
      )}
    </div>
  );
}
