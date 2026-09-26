import { useRef } from 'react';
import { useT } from '../context/LanguageContext';
import Modal from './ui/Modal.jsx';
import Button from './ui/Button.jsx';

// Zastępuje natywne window.confirm(). Tamto wyglądało obco na tle reszty
// aplikacji, nie dawało się przetłumaczyć i na części przeglądarek mobilnych
// potrafi zostać zablokowane przez ustawienia strony.
//
// Pierwsze okno przeniesione na wspólny Modal (faza 1 redesignu) — Esc,
// pułapkę fokusu i arkusz na telefonie dostaje stamtąd.
export default function ConfirmModal({ message, detail, confirmLabel, danger = true, onConfirm, onCancel }) {
  const t = useT();
  const confirmRef = useRef(null);

  return (
    <Modal
      role="alertdialog"
      size="sm"
      title={message}
      description={detail}
      onClose={onCancel}
      // Fokus startuje na potwierdzeniu — tak zachowywało się natywne okno.
      initialFocusRef={confirmRef}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>{t('cancel')}</Button>
          <Button ref={confirmRef} variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel ?? t('delete')}
          </Button>
        </>
      }
    />
  );
}
