// src/components/layout/navItems.jsx
import { Activity, ArrowLeftRight, Bell, Briefcase, Calculator, CalendarDays, ChartPie, Coins, Eye, FlaskConical, LayoutGrid, Newspaper, Settings, Sparkles, SquareCheckBig } from 'lucide-react';

// Jeden rozmiar i grubość dla całej nawigacji (docs/REDESIGN-PLAN.md).
const ICON = { size: 18, strokeWidth: 2, 'aria-hidden': true };

export function getNavItems(t) {
  return [
    { to: '/',             icon: <LayoutGrid {...ICON} />, group: 'portfolio', label: t('nav_dashboard') },
    { to: '/portfolio',    icon: <Briefcase {...ICON} />, group: 'portfolio', label: t('nav_portfolio') },
    { to: '/history',      icon: <Activity {...ICON} />, group: 'portfolio', label: t('nav_history') },
    { to: '/transactions', icon: <ArrowLeftRight {...ICON} />, group: 'portfolio', label: t('nav_transactions') },
    { to: '/closed',       icon: <SquareCheckBig {...ICON} />, group: 'portfolio', label: t('nav_closed') },
    { to: '/dividends',    icon: <Coins {...ICON} />, group: 'portfolio', label: t('nav_dividends') },
    { to: '/calendar',     icon: <CalendarDays {...ICON} />, group: 'market', label: t('nav_calendar') },
    { to: '/watchlist',    icon: <Eye {...ICON} />, group: 'market', label: t('nav_watchlist') },
    { to: '/alerts',       icon: <Bell {...ICON} />, group: 'market', label: t('nav_alerts') },
    { to: '/news',         icon: <Newspaper {...ICON} />, group: 'market', label: t('nav_news') },
    { to: '/scenario',     icon: <FlaskConical {...ICON} />, group: 'tools', label: t('nav_scenario') },
    { to: '/oki',          icon: <Calculator {...ICON} />, group: 'tools', label: t('nav_oki') },
    { to: '/analysis',     icon: <ChartPie {...ICON} />, group: 'tools', label: t('nav_analysis') },
    { to: '/ai',           icon: <Sparkles {...ICON} />, group: 'tools', label: t('nav_ai') },
  ];
}

export function getNavBottom(t) {
  return [
    { to: '/settings', icon: <Settings {...ICON} />, label: t('nav_settings') },
  ];
}

// Backward-compat static exports (identity function returns key as label — usable as fallback)
export const NAV_ITEMS = getNavItems(k => k);
export const NAV_BOTTOM = getNavBottom(k => k);
