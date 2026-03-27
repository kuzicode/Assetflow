import { useState } from 'react';

export default function AccountManagement() {
  const [form, setForm] = useState({ current: '', newPwd: '', confirm: '' });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.current !== 'Admin') {
      setMsg({ type: 'error', text: '当前密码不正确' });
      return;
    }
    if (form.newPwd !== form.confirm) {
      setMsg({ type: 'error', text: '两次输入的新密码不一致' });
      return;
    }
    if (form.newPwd.length < 4) {
      setMsg({ type: 'error', text: '密码长度至少 4 位' });
      return;
    }
    // Frontend-only: no actual persistence yet
    setMsg({ type: 'success', text: '密码已更新（重启前生效）' });
    setForm({ current: '', newPwd: '', confirm: '' });
  };

  return (
    <div className="max-w-5xl">
      <section className="mb-12">
        <h2 className="text-4xl font-bold font-headline text-on-surface tracking-tight mb-4">账户管理</h2>
        <p className="text-on-surface-variant text-lg leading-relaxed max-w-2xl">
          管理您的身份凭证和安全设置。
        </p>
      </section>

      <div className="grid grid-cols-12 gap-8">
        {/* Left: Security Profile + Password Form */}
        <div className="col-span-12 lg:col-span-7 space-y-8">
          {/* Current Identity */}
          <section className="bg-surface-container-lowest p-8 rounded-[1.5rem]">
            <div className="flex items-start justify-between mb-8">
              <div>
                <h3 className="font-headline text-xl font-bold text-on-surface">安全档案</h3>
                <p className="text-on-surface-variant text-sm mt-1">管理您的认证方式和凭证</p>
              </div>
              <span className="bg-primary-fixed text-on-primary-fixed px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase">
                Active
              </span>
            </div>
            <div className="flex items-center p-6 bg-surface-container-low rounded-xl gap-6">
              <div className="w-14 h-14 bg-primary-container rounded-full flex items-center justify-center text-on-primary shrink-0">
                <span className="material-symbols-outlined text-3xl">fingerprint</span>
              </div>
              <div>
                <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest mb-1">认证方式</p>
                <p className="text-lg font-headline font-bold text-on-surface">用户名 + 密码</p>
                <p className="text-sm text-primary font-medium mt-0.5">ADMIN（系统管理员）</p>
              </div>
            </div>
          </section>

          {/* Password Change Form */}
          <section className="bg-surface-container-lowest p-8 rounded-[1.5rem]">
            <h3 className="font-headline text-xl font-bold text-on-surface mb-6">修改密码</h3>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-on-surface-variant px-1">当前密码</label>
                  <div className="relative">
                    <input
                      className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-3 pr-10 focus:ring-2 focus:ring-primary/40 transition-all outline-none"
                      placeholder="••••••••"
                      type={showCurrent ? 'text' : 'password'}
                      value={form.current}
                      onChange={(e) => setForm({ ...form, current: e.target.value })}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors"
                      onClick={() => setShowCurrent(!showCurrent)}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {showCurrent ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>
                <div className="hidden md:block" />
                <div className="space-y-2">
                  <label className="text-sm font-bold text-on-surface-variant px-1">新密码</label>
                  <div className="relative">
                    <input
                      className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-3 pr-10 focus:ring-2 focus:ring-primary/40 transition-all outline-none"
                      placeholder="输入新密码"
                      type={showNew ? 'text' : 'password'}
                      value={form.newPwd}
                      onChange={(e) => setForm({ ...form, newPwd: e.target.value })}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors"
                      onClick={() => setShowNew(!showNew)}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {showNew ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-on-surface-variant px-1">确认新密码</label>
                  <input
                    className="w-full bg-surface-container-highest border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/40 transition-all outline-none"
                    placeholder="再次输入新密码"
                    type="password"
                    value={form.confirm}
                    onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                  />
                </div>
              </div>

              {msg && (
                <p className={`text-sm font-medium ${msg.type === 'success' ? 'text-primary' : 'text-error'}`}>
                  {msg.text}
                </p>
              )}

              <div className="pt-2 flex items-center justify-between">
                <p className="text-xs text-on-surface-variant max-w-xs">
                  注意：此功能目前仅为前端预览，密码变更在下次后端集成后生效。
                </p>
                <button
                  type="submit"
                  className="bg-primary text-on-primary px-8 py-3 rounded-xl font-bold hover:bg-primary-container transition-all shadow-sm active:scale-95"
                >
                  保存更改
                </button>
              </div>
            </form>
          </section>
        </div>

        {/* Right: Login Preview + Security Tips */}
        <div className="col-span-12 lg:col-span-5 space-y-8">
          {/* Login Preview */}
          <div className="relative overflow-hidden rounded-[2rem] p-1 shadow-2xl bg-gradient-to-br from-emerald-100 to-emerald-200">
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary-fixed rounded-full blur-3xl opacity-50 pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-emerald-300 rounded-full blur-3xl opacity-30 pointer-events-none" />
            <div
              className="relative rounded-[1.8rem] p-8 min-h-[380px] flex flex-col justify-center"
              style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(20px)' }}
            >
              <div className="mb-8 text-center">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-lg mx-auto flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-primary text-3xl">lock_open</span>
                </div>
                <h4 className="font-headline text-2xl font-bold text-emerald-900">Welcome Back</h4>
                <p className="text-emerald-700/60 text-sm">登录界面预览</p>
              </div>
              <div className="space-y-4">
                <div className="bg-white/80 rounded-xl p-3 border border-white/40">
                  <p className="text-[10px] font-bold text-emerald-800/50 uppercase tracking-tighter ml-1">Username</p>
                  <p className="font-medium text-emerald-900">ADMIN</p>
                </div>
                <div className="bg-white/80 rounded-xl p-3 border border-white/40 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-emerald-800/50 uppercase tracking-tighter ml-1">Password</p>
                    <p className="font-medium text-emerald-900">••••••••••••</p>
                  </div>
                  <span className="material-symbols-outlined text-emerald-400">visibility_off</span>
                </div>
                <div className="pt-2">
                  <div className="w-full bg-primary h-12 rounded-xl flex items-center justify-center text-on-primary font-bold text-sm shadow-md">
                    Sign In
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Security Tips */}
          <section className="bg-on-surface text-on-primary p-8 rounded-[1.5rem]">
            <div className="flex items-center gap-3 mb-6">
              <span className="material-symbols-outlined text-primary-fixed">verified_user</span>
              <h3 className="font-headline text-lg font-bold">安全建议</h3>
            </div>
            <ul className="space-y-4">
              {[
                '定期更换密码，建议每 90 天更新一次。',
                '不要在公共网络环境下访问本系统。',
                '部署在公网时建议通过反向代理添加额外鉴权层。',
              ].map((tip) => (
                <li key={tip} className="flex gap-3 items-start">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-fixed mt-2 shrink-0" />
                  <p className="text-sm text-surface-variant">{tip}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
