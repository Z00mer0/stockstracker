// src/pages/Settings.jsx
// Trzynaście kart jedna pod drugą → cztery grupy z nawigacją z boku
// (na telefonie pasek u góry). Sekcje w pages/settings/*.
import { useState } from 'react';
import { UserRound, Bell, Database, Landmark } from 'lucide-react';
import { useT } from '../context/LanguageContext';
import { cx } from '../components/ui/cx.js';
import { lsSet } from '../utils/safeStorage.js';
import AccountSection from './settings/AccountSection.jsx';
import NotificationsSection from './settings/NotificationsSection.jsx';
import DataSection from './settings/DataSection.jsx';
import MarketSection from './settings/MarketSection.jsx';

const KEY = 'myfund_settings_section';
const SECTIONS = [
  { id: 'account', icon: UserRound, label: 'account', Component: AccountSection },
  { id: 'notifications', icon: Bell, label: 'set_nav_notifications', Component: NotificationsSection },
  { id: 'data', icon: Database, label: 'set_nav_data', Component: DataSection },
  { id: 'market', icon: Landmark, label: 'set_nav_market', Component: MarketSection },
];

function load() {
  try {
    const v = localStorage.getItem(KEY);
    return SECTIONS.some(s => s.id === v) ? v : 'account';
  } catch { return 'account'; }
}

export default function Settings() {
  const t = useT();
  const [section, setSection] = useState(load);
  const Current = SECTIONS.find(s => s.id === section).Component;
  const pick = id => { setSection(id); lsSet(KEY, id); };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-6">
      <nav aria-label={t('nav_settings')} className="lg:sticky lg:top-4 lg:self-start">
        <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {SECTIONS.map(({ id, icon: Icon, label }) => {
            const active = id === section;
            return (
              <li key={id} className="shrink-0">
                <button
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => pick(id)}
                  className={cx(
                    'flex w-full items-center gap-2.5 whitespace-nowrap rounded-card-sm px-3 py-2 text-[13px] font-medium transition',
                    active ? 'bg-panel-hover text-fg' : 'text-dim hover:bg-panel hover:text-fg',
                  )}
                >
                  <Icon size={16} aria-hidden className={active ? 'text-accent-text' : undefined} />
                  {t(label)}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0 max-w-3xl">
        <Current />
        <p className="mt-6 text-[11px] text-faint">{t('settings_footer')}</p>
      </div>
    </div>
  );
}
