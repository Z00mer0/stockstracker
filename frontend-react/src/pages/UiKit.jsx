// Przegląd zestawu komponentów — tylko w trybie deweloperskim (/dev/ui).
// Jedno miejsce, w którym widać każdy element w obu motywach; do oceny
// wyglądu i do zrzutów przed/po. Do buildu produkcyjnego nie trafia.
import { useState } from 'react';
import { Plus, Trash2, Download, Search, Wallet, TrendingUp, Coins, Inbox, Pencil, Info } from 'lucide-react';
import {
  Badge, Button, Card, EmptyState, Field, IconButton, Input, Modal, PageHeader, Select,
  Skeleton, Spinner, Stat, Table, Tabs, TabPanel, Tooltip, SegmentedControl, useToast,
} from '../components/ui';
import ConfirmModal from '../components/ConfirmModal';

const ROWS = [
  { symbol: 'PKO.WA', name: 'PKO Bank Polski', qty: 100, price: 58.2, value: 5820, pl: 12.4 },
  { symbol: 'CDR.WA', name: 'CD Projekt', qty: 30, price: 164.5, value: 4935, pl: -3.1 },
  { symbol: 'AAPL', name: 'Apple Inc.', qty: 6, price: null, value: null, pl: null },
  { symbol: 'ALE.WA', name: 'Allegro', qty: 120, price: 33.4, value: 4008, pl: 0.8 },
];

const fmt = v => v == null ? '—' : v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = v => v == null ? '—' : <Badge tone={v >= 0 ? 'up' : 'down'}>{v >= 0 ? '+' : ''}{fmt(v)}%</Badge>;

const COLUMNS = [
  { key: 'symbol', header: 'Spółka', sortable: true, mobile: 'title',
    render: r => <div><div className="font-semibold">{r.symbol}</div><div className="text-small font-normal text-faint">{r.name}</div></div> },
  { key: 'qty', header: 'Ilość', align: 'right', sortable: true, firstDir: 'desc' },
  { key: 'price', header: 'Kurs', align: 'right', sortable: true, firstDir: 'desc', render: r => fmt(r.price) },
  { key: 'value', header: 'Wartość', align: 'right', sortable: true, firstDir: 'desc', mobile: 'aside', render: r => r.value == null ? '—' : `${fmt(r.value)} zł` },
  { key: 'pl', header: 'Wynik', align: 'right', sortable: true, firstDir: 'desc', render: r => pct(r.pl) },
];

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-label font-semibold uppercase text-faint">{title}</h2>
      {children}
    </section>
  );
}

export default function UiKit() {
  const { showToast } = useToast();
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [tab, setTab] = useState('risk');
  const [seg, setSeg] = useState('1M');
  const [amount, setAmount] = useState('');

  return (
    <div>
      <PageHeader
        title="Komponenty"
        subtitle="Zestaw z fazy 1 — każdy element w jednym miejscu"
        actions={<><Button icon={Download}>Eksport</Button><Button variant="primary" icon={Plus}>Dodaj transakcję</Button></>}
      />

      <Section title="Przyciski">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" icon={Plus}>Primary</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger" icon={Trash2}>Usuń</Button>
          <Button variant="primary" loading>Zapisywanie</Button>
          <Button disabled>Wyłączony</Button>
          <Button size="sm">Mały</Button>
          <Button size="lg" variant="primary">Duży</Button>
          <IconButton icon={Pencil} label="Edytuj" />
          <IconButton icon={Trash2} label="Usuń" active />
          <Tooltip content="Beta mierzy wrażliwość portfela na ruchy rynku.">
            <IconButton icon={Info} label="Co to jest beta?" size="sm" />
          </Tooltip>
        </div>
      </Section>

      <Section title="Odznaki i ładowanie">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Neutralna</Badge><Badge tone="up">+2,08%</Badge><Badge tone="down">−3,10%</Badge>
          <Badge tone="warn">Brak kursu</Badge><Badge tone="info">Dywidenda</Badge>
          <Spinner size="sm" /><Spinner /><Spinner size="lg" label="Ładowanie" />
        </div>
      </Section>

      <Section title="Kafelki (Stat)">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Wartość portfela" value="25 351 zł" delta="+1,24%" deltaTone="up" hint="dziś" icon={Wallet} onClick={() => {}} />
          <Stat label="Obecny zysk" value="+460 zł" tone="up" delta="+2,08%" deltaTone="up" icon={TrendingUp} />
          <Stat label="Dywidendy YTD" value="264 zł" hint="ostatnie 12 mies." icon={Coins} />
          <div className="flex flex-col gap-3 rounded-card border border-line bg-panel p-4 shadow-card">
            <Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-32" /><Skeleton className="h-3 w-20" />
          </div>
        </div>
      </Section>

      <Section title="Tabela (sortowanie, puste wartości na końcu, karty na telefonie)">
        <Card title="Pozycje">
          <Table columns={COLUMNS} rows={ROWS} rowKey={r => r.symbol} defaultSort={{ key: 'value', dir: 'desc' }} onRowClick={r => showToast(r.name)} />
        </Card>
      </Section>

      <Section title="Pusty stan">
        <Card title="Transakcje">
          <Table columns={COLUMNS} rows={[]} rowKey={r => r.symbol}
            empty={<EmptyState icon={Inbox} title="Nie masz jeszcze transakcji" description="Dodaj pierwszy zakup albo zaimportuj historię z pliku CSV od brokera." action={<Button variant="primary" icon={Plus}>Dodaj transakcję</Button>} />} />
        </Card>
      </Section>

      <Section title="Zakładki i przełącznik">
        <Card>
          <div className="px-4 pt-3">
            <Tabs id="kit" value={tab} onChange={setTab} tabs={[
              { value: 'risk', label: 'Ryzyko' }, { value: 'alloc', label: 'Alokacja', count: 5 }, { value: 'tax', label: 'Podatki' }, { value: 'fire', label: 'FIRE' },
            ]} />
          </div>
          <TabPanel tabsId="kit" value={tab} className="flex items-center justify-between gap-3 p-4 text-dim">
            Treść zakładki „{tab}" <SegmentedControl options={['1T', '1M', '3M', '1R', 'MAX']} value={seg} onChange={setSeg} />
          </TabPanel>
        </Card>
      </Section>

      <Section title="Formularz">
        <Card>
          <div className="grid gap-4 p-4 md:grid-cols-3">
            <Field label="Spółka" hint="Ticker z giełdy, np. PKO.WA"><Input icon={Search} placeholder="Szukaj spółki…" /></Field>
            <Field label="Kwota" required error={amount === '0' ? 'Kwota musi być większa od zera' : null}>
              <Input suffix="zł" inputMode="decimal" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} />
            </Field>
            <Field label="Konto"><Select defaultValue="ike"><option value="std">Zwykłe</option><option value="ike">IKE</option><option value="ikze">IKZE</option></Select></Field>
          </div>
        </Card>
      </Section>

      <Section title="Okna i powiadomienia">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setModal(true)}>Otwórz okno</Button>
          <Button variant="danger" onClick={() => setConfirm(true)}>Potwierdzenie</Button>
          <Button onClick={() => showToast('Zapisano transakcję', { type: 'success' })}>Toast: sukces</Button>
          <Button onClick={() => showToast('Nie udało się pobrać kursów', { type: 'error' })}>Toast: błąd</Button>
          <Button onClick={() => showToast('Usunięto PKO.WA', { action: { label: 'Cofnij', onClick: () => {} }, duration: 8000 })}>Toast: cofnij</Button>
        </div>
      </Section>

      {modal && (
        <Modal
          title="Sprzedaj akcje"
          description="PKO.WA · 100 szt. w portfelu"
          onClose={() => setModal(false)}
          footer={<><Button variant="ghost" onClick={() => setModal(false)}>Anuluj</Button><Button variant="primary" onClick={() => setModal(false)}>Sprzedaj</Button></>}
        >
          <div className="grid gap-4">
            <Field label="Ilość"><Input inputMode="numeric" defaultValue="100" /></Field>
            <Field label="Cena" hint="Ostatni kurs: 58,20 zł"><Input suffix="zł" inputMode="decimal" defaultValue="58,20" /></Field>
          </div>
        </Modal>
      )}
      {confirm && (
        <ConfirmModal message={'Usunąć portfel „Demo”?'} detail="Tej operacji nie da się cofnąć." onConfirm={() => setConfirm(false)} onCancel={() => setConfirm(false)} />
      )}
    </div>
  );
}
