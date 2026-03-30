import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { API_BASE } from '../config/chains';

const CHAIN_TYPES = [
  { id: 'EVM', label: 'EVM', desc: 'Ethereum / Base / BSC / Arbitrum 等多链' },
  { id: 'BTC', label: 'BTC', desc: 'Bitcoin 原生地址' },
  { id: 'SOL', label: 'SOL', desc: 'Solana 地址' },
];

const EVM_CHAINS = ['ethereum', 'arbitrum', 'optimism', 'base', 'polygon', 'bsc', 'avalanche'];

function getAddressUrl(address: string, chains: string[]): string | null {
  if (chains.includes('bitcoin')) return `https://mempool.space/address/${address}`;
  if (chains.includes('solana')) return `https://jup.ag/portfolio/${address}`;
  if (address.startsWith('0x') && address.length === 42) return `https://debank.com/profile/${address}`;
  return null;
}

function resolveChains(chainType: string): string[] {
  if (chainType === 'EVM') return EVM_CHAINS;
  if (chainType === 'BTC') return ['bitcoin'];
  if (chainType === 'SOL') return ['solana'];
  return [chainType.toLowerCase()];
}

function InlineAmountEdit({ amount, token, onSave, readonly }: { amount: number; token: string; onSave: (v: number) => Promise<void>; readonly?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(amount));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const start = () => { setDraft(String(amount)); setEditing(true); setTimeout(() => inputRef.current?.select(), 0); };
  const cancel = () => { setEditing(false); };
  const save = async () => {
    const val = parseFloat(draft);
    if (isNaN(val) || val === amount) { cancel(); return; }
    setSaving(true);
    await onSave(val);
    setEditing(false);
    setSaving(false);
  };

  const displayToken = token === 'STABLE' ? 'USD' : token;

  if (readonly) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="font-mono-data font-semibold text-on-surface text-sm">{Number(amount).toLocaleString()}</span>
        <span className="text-on-surface-variant text-xs">{displayToken}</span>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="number"
          className="bg-surface-container border-none rounded-xl py-1.5 px-3 text-sm font-mono-data font-semibold text-on-surface outline-none focus:ring-2 focus:ring-primary/40 w-32"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
          disabled={saving}
        />
        <button onClick={save} disabled={saving} className="p-1.5 hover:bg-primary-fixed rounded-lg transition-colors text-primary">
          <span className="material-symbols-outlined text-sm">check</span>
        </button>
        <button onClick={cancel} className="p-1.5 hover:bg-surface-container rounded-lg transition-colors text-on-surface-variant">
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 group/amount cursor-pointer" onClick={start}>
      <span className="font-mono-data font-semibold text-on-surface text-sm">
        {Number(amount).toLocaleString()}
      </span>
      <span className="text-on-surface-variant text-xs">{displayToken}</span>
      <span className="material-symbols-outlined text-[14px] text-on-surface-variant opacity-0 group-hover/amount:opacity-100 transition-opacity">edit</span>
    </div>
  );
}

function InlineEdit({ value, onSave, readonly }: { value: string; onSave: (v: string) => Promise<void>; readonly?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const start = () => { setDraft(value); setEditing(true); setTimeout(() => inputRef.current?.select(), 0); };
  const cancel = () => { setEditing(false); setDraft(value); };
  const save = async () => {
    if (!draft.trim() || draft === value) { cancel(); return; }
    setSaving(true);
    await onSave(draft.trim());
    setEditing(false);
    setSaving(false);
  };

  if (readonly) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-primary-container shrink-0" />
        <span className="font-semibold text-on-surface font-headline">{value}</span>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          className="bg-surface-container border-none rounded-xl py-1.5 px-3 text-sm font-semibold text-on-surface font-headline outline-none focus:ring-2 focus:ring-primary/40 w-36"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
          disabled={saving}
        />
        <button onClick={save} disabled={saving} className="p-1.5 hover:bg-primary-fixed rounded-lg transition-colors text-primary">
          <span className="material-symbols-outlined text-sm">check</span>
        </button>
        <button onClick={cancel} className="p-1.5 hover:bg-surface-container rounded-lg transition-colors text-on-surface-variant">
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group/label cursor-pointer" onClick={start}>
      <div className="w-2 h-2 rounded-full bg-primary-container shrink-0" />
      <span className="font-semibold text-on-surface font-headline">{value}</span>
      <span className="material-symbols-outlined text-[14px] text-on-surface-variant opacity-0 group-hover/label:opacity-100 transition-opacity">edit</span>
    </div>
  );
}

export default function WalletManagement() {
  const { wallets, manualAssets, fetchWallets, fetchManualAssets, authMode } = useStore();
  const isAdmin = authMode === 'admin';
  const [walletForm, setWalletForm] = useState({ label: '', address: '', chainType: 'EVM' });
  const [manualForm, setManualForm] = useState({ label: '', baseToken: 'STABLE', amount: '', platform: '' });
  const [savingWallet, setSavingWallet] = useState(false);
  const [savingManual, setSavingManual] = useState(false);

  useEffect(() => {
    fetchWallets();
    fetchManualAssets();
  }, []);

  const addWallet = async () => {
    if (!walletForm.label || !walletForm.address) return;
    setSavingWallet(true);
    try {
      await fetch(`${API_BASE}/api/wallets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: walletForm.label, address: walletForm.address, chains: resolveChains(walletForm.chainType) }),
      });
      setWalletForm({ label: '', address: '', chainType: 'EVM' });
      fetchWallets();
    } finally { setSavingWallet(false); }
  };

  const deleteWallet = async (id: string) => {
    await fetch(`${API_BASE}/api/wallets/${id}`, { method: 'DELETE' });
    fetchWallets();
  };

  const updateWalletLabel = async (id: string, label: string) => {
    await fetch(`${API_BASE}/api/wallets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    });
    fetchWallets();
  };

  const addManualAsset = async () => {
    if (!manualForm.label || !manualForm.amount) return;
    setSavingManual(true);
    try {
      await fetch(`${API_BASE}/api/positions/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: manualForm.label, baseToken: manualForm.baseToken, amount: parseFloat(manualForm.amount), platform: manualForm.platform }),
      });
      setManualForm({ label: '', baseToken: 'STABLE', amount: '', platform: '' });
      fetchManualAssets();
    } finally { setSavingManual(false); }
  };

  const deleteManualAsset = async (id: string) => {
    await fetch(`${API_BASE}/api/positions/manual/${id}`, { method: 'DELETE' });
    fetchManualAssets();
  };

  const updateManualLabel = async (id: string, label: string) => {
    const asset = manualAssets.find((a) => a.id === id);
    if (!asset) return;
    await fetch(`${API_BASE}/api/positions/manual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, label, baseToken: asset.baseToken, amount: asset.amount, platform: asset.platform }),
    });
    fetchManualAssets();
  };

  const updateManualAmount = async (id: string, amount: number) => {
    const asset = manualAssets.find((a) => a.id === id);
    if (!asset) return;
    await fetch(`${API_BASE}/api/positions/manual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, label: asset.label, baseToken: asset.baseToken, amount, platform: asset.platform }),
    });
    fetchManualAssets();
  };

  const totalEntries = wallets.length + manualAssets.length;

  return (
    <div className="max-w-6xl space-y-16">
      {/* Unified Account & Wallet List */}
      <section>
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-xl font-headline font-bold text-primary flex items-center gap-2">
            <span className="material-symbols-outlined">list_alt</span>
            账户和钱包列表
          </h3>
          <span className="px-4 py-2 bg-primary-fixed text-on-primary-fixed-variant rounded-full text-xs font-bold tracking-wider">
            ENTRIES: {String(totalEntries).padStart(2, '0')}
          </span>
        </div>

        <div className="bg-surface-container-lowest rounded-[2rem] overflow-hidden shadow-[0px_12px_32px_rgba(25,28,29,0.04)]">
          {totalEntries === 0 ? (
            <div className="px-8 py-12 text-center text-on-surface-variant">
              暂无记录，请在下方添加钱包或手动资产
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface-container-low">
                    <th className="px-8 py-5 text-xs font-bold text-on-surface-variant uppercase tracking-widest whitespace-nowrap w-[20%]">标签</th>
                    <th className="px-8 py-5 text-xs font-bold text-on-surface-variant uppercase tracking-widest whitespace-nowrap w-[18%]">资金</th>
                    <th className="px-8 py-5 text-xs font-bold text-on-surface-variant uppercase tracking-widest whitespace-nowrap">地址 / 交易所</th>
                    <th className="px-8 py-5 text-xs font-bold text-on-surface-variant uppercase tracking-widest text-center whitespace-nowrap w-[14%]">类型</th>
                    <th className="px-8 py-5 text-xs font-bold text-on-surface-variant uppercase tracking-widest text-right whitespace-nowrap w-[10%]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Wallet rows */}
                  {wallets.map((w) => (
                    <tr key={w.id} className="hover:bg-surface-container-low transition-colors group border-t border-outline-variant/10">
                      <td className="px-8 py-5">
                        <InlineEdit value={w.label} onSave={(label) => updateWalletLabel(w.id, label)} readonly={!isAdmin} />
                      </td>
                      <td className="px-8 py-5">
                        <span className="text-sm text-on-surface-variant/40">—</span>
                      </td>
                      <td className="px-8 py-5">
                        {(() => {
                          const url = getAddressUrl(w.address, w.chains || []);
                          const label = `${w.address.slice(0, 6)}...${w.address.slice(-4)}`;
                          return url ? (
                            <a href={url} target="_blank" rel="noopener noreferrer"
                              className="text-sm font-mono text-primary bg-surface-container px-3 py-1 rounded-lg hover:bg-primary/10 transition-colors">
                              {label}
                            </a>
                          ) : (
                            <code className="text-sm font-mono text-outline bg-surface-container px-3 py-1 rounded-lg">
                              {label}
                            </code>
                          );
                        })()}
                      </td>
                      <td className="px-8 py-5 text-center">
                        <span className="px-4 py-1.5 bg-secondary-container text-on-secondary-container rounded-full text-[10px] font-bold tracking-widest whitespace-nowrap">
                          {w.chains?.includes('bitcoin') ? 'BTC' : w.chains?.includes('solana') ? 'SOL' : 'EVM'}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => navigator.clipboard.writeText(w.address)}
                            className="p-2 hover:bg-surface-container rounded-xl transition-colors text-on-surface-variant"
                            title="复制地址"
                          >
                            <span className="material-symbols-outlined text-sm">content_copy</span>
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => deleteWallet(w.id)}
                              className="p-2 hover:bg-tertiary-fixed rounded-xl transition-colors text-tertiary"
                              title="删除"
                            >
                              <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {/* Manual asset rows */}
                  {manualAssets.map((a) => (
                    <tr key={a.id} className="hover:bg-surface-container-low transition-colors group border-t border-outline-variant/10">
                      <td className="px-8 py-5">
                        <InlineEdit value={a.label} onSave={(label) => updateManualLabel(a.id, label)} readonly={!isAdmin} />
                      </td>
                      <td className="px-8 py-5">
                        <InlineAmountEdit amount={a.amount} token={a.baseToken} onSave={(amount) => updateManualAmount(a.id, amount)} readonly={!isAdmin} />
                      </td>
                      <td className="px-8 py-5">
                        <span className="text-sm text-on-surface-variant">{a.platform || '—'}</span>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <span className="px-4 py-1.5 bg-tertiary-container text-on-tertiary-container rounded-full text-[10px] font-bold tracking-widest whitespace-nowrap">
                          手动录入
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        {isAdmin && (
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => deleteManualAsset(a.id)}
                              className="p-2 hover:bg-tertiary-fixed rounded-xl transition-colors text-tertiary"
                              title="删除"
                            >
                              <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Forms — admin only */}
      {isAdmin && <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">
        {/* Add Wallet Form */}
        <div className="lg:col-span-3">
          <h3 className="text-xl font-headline font-bold text-primary mb-8">添加新钱包</h3>
          <div className="bg-surface-container-lowest p-10 rounded-[2.5rem] shadow-[0px_12px_32px_rgba(25,28,29,0.04)] relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-outline uppercase tracking-widest px-1">标签</label>
                  <input
                    className="w-full bg-surface-container-low border-none rounded-2xl py-4 px-6 focus:ring-2 focus:ring-primary/40 transition-all text-on-surface outline-none"
                    placeholder="例如：主钱包"
                    value={walletForm.label}
                    onChange={(e) => setWalletForm({ ...walletForm, label: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-outline uppercase tracking-widest px-1">链类型</label>
                  <div className="flex gap-2">
                    {CHAIN_TYPES.map((ct) => (
                      <button
                        key={ct.id}
                        type="button"
                        onClick={() => setWalletForm({ ...walletForm, chainType: ct.id })}
                        className={`flex-1 py-4 rounded-2xl font-bold font-headline text-sm transition-all ${
                          walletForm.chainType === ct.id
                            ? 'bg-primary text-on-primary shadow-lg shadow-primary/20'
                            : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                        }`}
                      >
                        {ct.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-on-surface-variant px-1">
                    {CHAIN_TYPES.find((ct) => ct.id === walletForm.chainType)?.desc}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-bold text-outline uppercase tracking-widest px-1">钱包地址</label>
                <input
                  className="w-full bg-surface-container-low border-none rounded-2xl py-4 px-6 focus:ring-2 focus:ring-primary/40 transition-all text-on-surface font-mono-data outline-none"
                  placeholder="0x..."
                  value={walletForm.address}
                  onChange={(e) => setWalletForm({ ...walletForm, address: e.target.value })}
                />
              </div>
              <button
                onClick={addWallet}
                disabled={savingWallet || !walletForm.label || !walletForm.address}
                className="w-full md:w-auto px-10 py-4 bg-gradient-to-br from-primary to-primary-container text-on-primary rounded-full font-bold font-headline tracking-wide hover:opacity-95 active:scale-95 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-3 disabled:opacity-50"
              >
                <span className="material-symbols-outlined">add_circle</span>
                {savingWallet ? '添加中...' : '确认添加钱包'}
              </button>
            </div>
          </div>
        </div>

        {/* Add Manual Asset */}
        <div className="lg:col-span-2">
          <h3 className="text-xl font-headline font-bold text-on-surface-variant mb-8">添加手动资产</h3>
          <div className="bg-surface-container-low p-8 rounded-[2rem]">
            <p className="text-sm text-outline mb-8 leading-relaxed">
              手动追踪非链上资产（如 CEX 持仓、离线金库等）。
            </p>
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-outline-variant uppercase tracking-widest px-1">资产标签</label>
                <input
                  className="w-full bg-surface-container-lowest border-none rounded-xl py-3 px-5 focus:ring-2 focus:ring-primary/20 transition-all text-on-surface outline-none"
                  placeholder="例如：Binance 现货"
                  value={manualForm.label}
                  onChange={(e) => setManualForm({ ...manualForm, label: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-bold text-outline-variant uppercase tracking-widest px-1">基础代币</label>
                <select
                  className="w-full bg-surface-container-lowest border-none rounded-xl py-3 px-5 focus:ring-2 focus:ring-primary/20 transition-all text-on-surface appearance-none outline-none"
                  value={manualForm.baseToken}
                  onChange={(e) => setManualForm({ ...manualForm, baseToken: e.target.value })}
                >
                  <option value="STABLE">稳定币 (USDT/USDC)</option>
                  <option value="ETH">ETH</option>
                  <option value="BTC">BTC</option>
                  <option value="BNB">BNB</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-bold text-outline-variant uppercase tracking-widest px-1">交易所 / 平台</label>
                <input
                  className="w-full bg-surface-container-lowest border-none rounded-xl py-3 px-5 focus:ring-2 focus:ring-primary/20 transition-all text-on-surface outline-none"
                  placeholder="例如：Binance、OKX（可留空）"
                  value={manualForm.platform}
                  onChange={(e) => setManualForm({ ...manualForm, platform: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-bold text-outline-variant uppercase tracking-widest px-1">持有数量</label>
                <input
                  className="w-full bg-surface-container-lowest border-none rounded-xl py-3 px-5 focus:ring-2 focus:ring-primary/20 transition-all text-on-surface outline-none font-mono-data"
                  placeholder="0.00"
                  type="number"
                  value={manualForm.amount}
                  onChange={(e) => setManualForm({ ...manualForm, amount: e.target.value })}
                />
              </div>
              <button
                onClick={addManualAsset}
                disabled={savingManual || !manualForm.label || !manualForm.amount}
                className="w-full py-4 bg-surface-container-lowest text-on-surface font-bold font-headline hover:bg-primary-fixed hover:text-on-primary-fixed transition-colors rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-primary">cloud_upload</span>
                {savingManual ? '登记中...' : '登记手动资产'}
              </button>
            </div>
          </div>
        </div>
      </div>}
    </div>
  );
}
