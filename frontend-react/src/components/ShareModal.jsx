import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Link2, Share2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useLanguage, useT } from '../context/LanguageContext';
import useShareLink from '../hooks/useShareLink';
import { drawShareImage } from '../utils/shareImage.js';
import { Button, Field, Modal, Select } from './ui';

// „Pokaż znajomym”: publiczny link (same procenty) i obrazek z wynikami
// do wysłania — rysowany z tych samych danych co publiczny widok.
export default function ShareModal({ onClose }) {
  const t = useT();
  const { locale } = useLanguage();
  const { portfolios, activePortfolioId } = useApp();
  const [pid, setPid] = useState(activePortfolioId !== 'all' ? activePortfolioId : portfolios[0]?.id ?? '');
  const { token, url, busy, generate, revoke } = useShareLink(pid);
  const [copied, setCopied] = useState(false);
  const [data, setData] = useState(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!token) { setData(null); return; }
    let cancelled = false;
    fetch(`/api/shared?token=${encodeURIComponent(token)}`).then(r => (r.ok ? r.json() : null)).then(d => { if (!cancelled) setData(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    drawShareImage(canvasRef.current, data, {
      title: t('share_img_title'), locale,
      labels: { result: t('shared_result'), irr: t('shared_irr'), positions: t('shared_positions'), top: t('share_img_top'), best: t('shared_best'), worst: t('shared_worst'), footer: t('share_img_footer') },
    });
  }, [data, locale]); // eslint-disable-line react-hooks/exhaustive-deps

  const blob = () => new Promise(res => canvasRef.current.toBlob(res, 'image/png'));
  async function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await blob());
    a.download = `myfund-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function share() {
    const file = new File([await blob()], 'myfund.png', { type: 'image/png' });
    const payload = { title: 'myfund', text: t('share_img_text'), url, files: [file] };
    try {
      if (navigator.canShare?.(payload)) await navigator.share(payload);
      else if (navigator.share) await navigator.share({ title: 'myfund', url });
      else await copy();
    } catch { /* anulowane */ }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* brak schowka */ }
  }

  return (
    <Modal size="md" title={t('share_modal_title')} description={t('share_desc')} onClose={onClose}
      footer={<Button variant="ghost" onClick={onClose}>{t('close_btn')}</Button>}>
      <div className="grid gap-3">
        {portfolios.length > 1 && (
          <Field label={t('share_title')}>
            <Select value={pid} onChange={e => setPid(e.target.value)}>
              {portfolios.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
        )}
        {!token ? (
          <Button variant="primary" icon={Link2} loading={busy} disabled={!pid} onClick={generate}>{t('share_generate')}</Button>
        ) : (
          <>
            <canvas ref={canvasRef} className="mx-auto w-full max-w-[320px] rounded-card-sm border border-line" role="img" aria-label={t('share_img_title')} />
            {!data && <p className="text-center text-small text-faint">{t('loading')}</p>}
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" icon={Share2} disabled={!data} onClick={share}>{t('share_send')}</Button>
              <Button icon={Download} disabled={!data} onClick={download}>{t('share_download')}</Button>
              <Button icon={copied ? Check : Copy} onClick={copy}>{copied ? t('rc_copied') : t('share_copy_link')}</Button>
            </div>
            <p className="break-all text-center font-mono text-[11px] text-faint">{url}</p>
            <Button size="sm" variant="ghost" className="justify-self-center text-down" disabled={busy} onClick={revoke}>{t('share_revoke')}</Button>
          </>
        )}
      </div>
    </Modal>
  );
}
