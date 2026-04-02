import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { apiFetch } from '../lib/api';


const DAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export default function Settings() {
  const { settings, fetchSettings, initializeApp } = useStore();

  useEffect(() => {
    initializeApp();
  }, []);

  const updateSetting = async (key: string, value: string) => {
    await apiFetch('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ [key]: value }),
    });
    fetchSettings();
  };

  return (
    <div className="max-w-5xl">
      <section className="mb-12">
        <h2 className="text-4xl font-bold font-headline text-on-surface tracking-tight mb-4">结算设置</h2>
        <p className="text-on-surface-variant text-lg leading-relaxed max-w-2xl">
          配置结算周期、自动快照及基础报告货币，以保持数据完整性。
        </p>
      </section>

      <div className="grid grid-cols-12 gap-8">
        {/* Settlement Day */}
        <div className="col-span-12 lg:col-span-7 bg-surface-container-lowest rounded-[2rem] p-10 transition-all hover:-translate-y-1">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-primary-fixed flex items-center justify-center">
              <span className="material-symbols-outlined text-primary">event_repeat</span>
            </div>
            <h3 className="text-2xl font-bold font-headline">结算日</h3>
          </div>
          <p className="text-on-surface-variant mb-10 text-sm">
            设置每周财务汇总计算的固定日期，影响周度盈亏的统计周期。
          </p>
          <div className="relative">
            <label className="block text-xs font-bold uppercase tracking-widest text-primary mb-3">
              选择结算日
            </label>
            <select
              className="w-full appearance-none bg-surface-container-low border-none rounded-2xl px-6 py-4 text-on-surface font-medium focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer outline-none"
              value={settings?.settlement_day || '4'}
              onChange={(e) => updateSetting('settlement_day', e.target.value)}
            >
              {DAY_LABELS.map((label, i) => (
                <option key={i} value={String(i)}>{label}</option>
              ))}
            </select>
            <span className="material-symbols-outlined absolute right-6 bottom-4 pointer-events-none text-on-surface-variant">
              expand_more
            </span>
          </div>
        </div>

        {/* Base Currency */}
        <div className="col-span-12 lg:col-span-5 bg-primary-container rounded-[2rem] p-10 text-on-primary-container relative overflow-hidden transition-all hover:-translate-y-1">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                <span className="material-symbols-outlined text-white">payments</span>
              </div>
              <h3 className="text-2xl font-bold font-headline">基础货币</h3>
            </div>
            <div className="mt-12">
              <span className="text-6xl font-bold font-headline block mb-2 tracking-tighter">USDT</span>
              <p className="text-on-primary-container/80 font-medium">系统默认（只读）</p>
            </div>
            <div className="mt-16 flex items-center gap-2 text-sm bg-white/10 w-fit px-4 py-2 rounded-full backdrop-blur-sm">
              <span className="material-symbols-outlined text-[18px]">lock</span>
              <span>不可更改的资产类型</span>
            </div>
          </div>
          <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-primary-fixed opacity-10 rounded-full blur-3xl pointer-events-none" />
        </div>

        {/* Auto Snapshot */}
        <div className="col-span-12 bg-surface-container-lowest rounded-[2rem] p-10 flex flex-col md:flex-row items-center justify-between gap-8 transition-all hover:-translate-y-1">
          <div className="flex items-start gap-6">
            <div className="w-14 h-14 rounded-2xl bg-secondary-fixed flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-secondary">auto_videocam</span>
            </div>
            <div>
              <h3 className="text-2xl font-bold font-headline mb-2">自动快照</h3>
              <p className="text-on-surface-variant max-w-xl">
                每日 UTC 00:00 自动记录所有仓位快照，为盈亏计算提供不可变的基准数据。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6 shrink-0">
            <span className={`text-sm font-bold uppercase tracking-widest ${settings?.auto_snapshot === 'true' ? 'text-primary' : 'text-on-surface-variant'}`}>
              {settings?.auto_snapshot === 'true' ? 'Active' : 'Inactive'}
            </span>
            <button
              onClick={() => updateSetting('auto_snapshot', settings?.auto_snapshot === 'true' ? 'false' : 'true')}
              className={`relative inline-flex h-10 w-20 items-center rounded-full transition-colors focus:outline-none ${
                settings?.auto_snapshot === 'true' ? 'bg-primary' : 'bg-surface-container-high'
              }`}
            >
              <span
                className={`inline-block h-8 w-8 transform rounded-full bg-white transition-transform shadow-lg ${
                  settings?.auto_snapshot === 'true' ? 'translate-x-11' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Info Cards */}
        <div className="col-span-12 lg:col-span-4 bg-surface-container-low rounded-[2rem] p-8">
          <div className="flex items-center gap-3 mb-4 text-on-surface-variant">
            <span className="material-symbols-outlined text-tertiary">verified_user</span>
            <span className="font-bold text-xs uppercase tracking-widest">安全等级</span>
          </div>
          <h4 className="font-headline font-bold text-xl mb-3">本地私有部署</h4>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            所有数据存储于本地 SQLite，无第三方数据上传，保障资产隐私安全。
          </p>
        </div>

        <div className="col-span-12 lg:col-span-8 bg-surface-container-low rounded-[2rem] p-8 flex items-center">
          <div className="flex flex-wrap items-center gap-12 w-full">
            <div>
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">下次结算日</p>
              <p className="font-headline font-bold text-2xl text-primary">
                {settings?.settlement_day !== undefined
                  ? DAY_LABELS[parseInt(settings.settlement_day)]
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">自动快照</p>
              <p className="font-headline font-bold text-2xl">
                {settings?.auto_snapshot === 'true' ? '已开启' : '已关闭'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
