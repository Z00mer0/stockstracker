// src/components/AdvancedPriceChart.jsx
import { useState } from 'react';
import { Download, TriangleAlert, X } from 'lucide-react';
import CandlestickChart from './CandlestickChart';
import IndicatorPanel from './IndicatorPanel';
import { usePriceHistory } from '../hooks/usePriceHistory';
import { useTechnicalIndicators } from '../hooks/useTechnicalIndicators';
import { useT } from '../context/LanguageContext';
import { Button, Callout, IconButton, Modal, SegmentedControl, Skeleton } from './ui';
import { cx } from './ui/cx.js';

const PERIODS = ['1D', '1W', '1M', '3M', '6M', '1Y', 'ALL'];

const DEFAULT_IND = {
  showMA20: true,
  showMA50: false,
  showEMA:  false,
  showBB:   false,
  showRSI:  false,
  showMACD: false,
};

export default function AdvancedPriceChart({ symbol, onClose }) {
  const t = useT();
  const [period, setPeriod]         = useState('3M');
  const [indicators, setIndicators] = useState(DEFAULT_IND);
  const [selectedCandle, setSelectedCandle] = useState(null);

  const { candles, start, loading, error } = usePriceHistory(symbol, period);
  const technicalData = useTechnicalIndicators(candles);

  // CSV tylko z wybranego okresu (bez świec rozbiegu wskaźników).
  function downloadCSV() {
    const header = [t('col_date'), t('ac_open'), t('ac_high'), t('ac_low'), t('ac_close'), t('ac_volume')].join(',');
    const rows   = candles.slice(start).map(c => `${c.date}${c.time ? ` ${c.time}` : ''},${c.open},${c.high},${c.low},${c.close},${c.volume}`);
    const blob   = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url    = URL.createObjectURL(blob);
    const a      = document.createElement('a');
    a.href = url; a.download = `${symbol}_${period}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const sc = selectedCandle;
  return (
    <Modal
      size="xl"
      title={symbol}
      description={t('ac_hint')}
      onClose={onClose}
      footer={
        <>
          <Button icon={Download} disabled={!candles.length} onClick={downloadCSV}>{t('ac_csv')}</Button>
          <Button variant="primary" onClick={onClose}>{t('close_btn')}</Button>
        </>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            aria-label={t('sd_period')}
            options={PERIODS.map(p => ({ value: p, label: p }))}
            value={period}
            onChange={p => { setPeriod(p); setSelectedCandle(null); }}
          />
          <IndicatorPanel label={t('ac_indicators')} indicators={indicators} onChange={setIndicators} />
        </div>

        {loading && <Skeleton className="h-[300px] w-full" />}
        {error && <Callout tone="down" icon={TriangleAlert} title={t('ac_error')}>{error}</Callout>}
        {!loading && !error && candles.length > 0 && (
          <CandlestickChart
            candles={candles}
            start={start}
            indicators={indicators}
            technicalData={technicalData}
            onCandleClick={setSelectedCandle}
          />
        )}
        {!loading && !error && candles.length === 0 && (
          <p className="py-12 text-center text-small text-faint">{t('ac_no_data').replace('{symbol}', symbol)}</p>
        )}

        {sc && (
          <div className="rounded-card-sm border border-line bg-panel-2 px-3 py-2.5">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[12px] font-semibold text-dim">{t('ac_day_details')} {sc.date}{sc.time ? ` ${sc.time}` : ''}</p>
              <IconButton icon={X} size="sm" label={t('close_btn')} onClick={() => setSelectedCandle(null)} />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-small tabular-nums">
              {[
                [t('ac_open'), sc.open, ''],
                [t('ac_high'), sc.high ?? sc.close, ''],
                [t('ac_low'), sc.low ?? sc.close, ''],
                [t('ac_close'), sc.close, sc.close >= sc.open ? 'text-up' : 'text-down'],
              ].map(([lbl, val, cls]) => (
                <span key={lbl}><span className="text-faint">{lbl} </span><span className={cx('font-semibold', cls || 'text-fg')}>{val?.toFixed(2)}</span></span>
              ))}
              {sc.volume != null && (
                <span><span className="text-faint">{t('ac_volume')} </span><span className="font-semibold text-fg">{(sc.volume / 1_000_000).toFixed(2)}M</span></span>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
