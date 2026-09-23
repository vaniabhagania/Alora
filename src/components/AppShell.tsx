import { useState, type ReactNode } from 'react';
import { NAV_ITEMS } from '@/lib/nav';
import { useAuth } from '@/lib/auth';
import { useWorlds } from '@/lib/worlds';
import { LogOut, Sparkles, Globe } from 'lucide-react';

interface AppShellProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  children: ReactNode;
}

export function AppShell({ currentPage, onNavigate, children }: AppShellProps) {
  const { profile, signOut } = useAuth();
  const { activeWorld } = useWorlds();
  const [collapsed, setCollapsed] = useState(false);

  const displayName = profile?.display_name || 'there';

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Ambient background */}
      <div className="ambient-bg">
        <div className="ambient-blob" />
        <div className="ambient-blob" />
        <div className="ambient-blob" />
      </div>

      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col shrink-0 border-r border-white/5 bg-[var(--bg-secondary)]/60 backdrop-blur-xl transition-all duration-300 ${
          collapsed ? 'w-[72px]' : 'w-[240px]'
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-6">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))' }}
          >
            <Sparkles size={20} className="text-white" />
          </div>
          {!collapsed && (
            <div className="animate-fade-in">
              <h1 className="font-display text-lg font-bold tracking-tight text-[var(--text-primary)]">ALORA</h1>
              <p className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">Personal OS</p>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`group mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                  active
                    ? 'bg-[var(--accent)]/15 text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]'
                }`}
                title={item.label}
              >
                <Icon
                  size={18}
                  className={`shrink-0 ${active ? 'text-[var(--accent-secondary)]' : 'group-hover:text-[var(--text-primary)]'}`}
                />
                {!collapsed && <span className="font-medium">{item.label}</span>}
                {active && !collapsed && (
                  <div className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--accent-secondary)] animate-pulse" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/5 px-3 py-3">
          {!collapsed && activeWorld && (
            <button
              onClick={() => onNavigate('worlds')}
              className="mb-2 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 transition-colors hover:bg-white/5"
            >
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                style={{ background: `linear-gradient(135deg, ${activeWorld.theme_settings.colors.accent}, ${activeWorld.theme_settings.colors.accentSecondary})` }}
              >
                <Globe size={14} className="text-white" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Current World</p>
                <p className="truncate text-xs font-medium text-[var(--text-primary)]">{activeWorld.name}</p>
              </div>
            </button>
          )}
          {!collapsed && (
            <div className="mb-2 flex items-center gap-3 rounded-xl px-3 py-2">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold uppercase"
                style={{ background: 'var(--accent)' }}
              >
                {displayName.charAt(0) || 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">{displayName}</p>
                <p className="truncate text-xs text-[var(--text-secondary)]">{profile?.current_phase || 'Student'}</p>
              </div>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden w-full items-center justify-center rounded-xl px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]"
          >
            {collapsed ? '→' : '← Collapse'}
          </button>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-rose-500/10 hover:text-rose-400"
            title="Sign out"
          >
            <LogOut size={18} className="shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <div key={currentPage} className="page-enter h-full">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-white/10 bg-[var(--bg-secondary)]/90 backdrop-blur-xl md:hidden">
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center gap-1 px-2 py-3 transition-colors ${
                active ? 'text-[var(--accent-secondary)]' : 'text-[var(--text-secondary)]'
              }`}
            >
              <Icon size={20} />
              <span className="text-[10px] font-medium">{item.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </nav>

      {/* Mobile "more" nav — accessible via a second row */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-white/5 bg-[var(--bg-secondary)]/95 backdrop-blur-xl md:hidden" style={{ bottom: '56px', display: currentPage === 'more' ? 'flex' : 'none' }}>
        {NAV_ITEMS.slice(5).map((item) => {
          const Icon = item.icon;
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center gap-1 px-2 py-3 transition-colors ${
                active ? 'text-[var(--accent-secondary)]' : 'text-[var(--text-secondary)]'
              }`}
            >
              <Icon size={20} />
              <span className="text-[10px] font-medium">{item.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
