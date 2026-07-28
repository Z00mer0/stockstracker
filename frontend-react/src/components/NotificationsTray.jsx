import React from 'react';
import NotificationCard from './NotificationCard';
import { useMarketNotifications } from '../hooks/useMarketNotifications';
import { useNotificationTone } from '../hooks/useNotificationTone';

export default function NotificationsTray() {
  const [tone] = useNotificationTone();
  const { notifications, dismiss } = useMarketNotifications();
  if (!notifications.length) return null;
  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 76,
        right: 16,
        zIndex: 900,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: 'min(480px, calc(100vw - 32px))',
        pointerEvents: 'none',
      }}
    >
      {notifications.map(n => (
        <div key={n.dedupeKey} style={{ pointerEvents: 'auto' }}>
          <NotificationCard
            ticker={n.symbol}
            changePct={n.changePct}
            changeAbs={n.changeAbs}
            tone={tone}
            onInterested={() => dismiss(n.dedupeKey, { mute: true })}
            onNotInterested={() => dismiss(n.dedupeKey, { mute: true })}
          />
        </div>
      ))}
    </div>
  );
}
