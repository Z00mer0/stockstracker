import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useT } from '../../context/LanguageContext';

// Bez sieci portfel pochodzi z ostatniej udanej odpowiedzi zapisanej przez
// service worker (sw.js, cache „api-last-known") — pasek mówi o tym wprost,
// żeby nikt nie wziął wczorajszych wartości za bieżące.
export default function OfflineBanner() {
  const t = useT();
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 border-b border-line bg-warn-soft px-4 py-1.5 text-small text-warn">
      <WifiOff size={14} aria-hidden />
      <span>{t('offline_banner')}</span>
    </div>
  );
}
