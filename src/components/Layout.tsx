import React from 'react';
import { useAuth } from '../App';
import { LayoutDashboard, Vote, Users, LogOut, Shield, Landmark } from 'lucide-react';
import { logout } from '../lib/firebase';
import { cn } from '../lib/utils';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function Layout({ children, activeTab, onTabChange }: LayoutProps) {
  const { profile, isAdmin } = useAuth();

  const navItems = [
    { id: 'leagues', label: 'Leagues', icon: Users },
    { id: 'state', label: 'State', icon: Landmark },
    { id: 'races', label: 'Browse', icon: Vote },
    { id: 'dashboard', label: 'Activity', icon: LayoutDashboard },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin', icon: Shield }] : []),
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-20 border-b border-brand-blue/15 bg-brand-blue text-white backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-red font-black italic shadow-md shadow-brand-red/40">P</div>
            <div>
              <h1 className="font-black italic tracking-tight text-lg sm:text-xl">POLITIPICK</h1>
              <p className="text-[10px] font-mono uppercase tracking-widest text-white/55">Private league sandbox</p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-right hidden sm:block">
              <p className="text-[10px] uppercase font-mono tracking-wider text-white/60">Account Score</p>
              <p className="font-black text-brand-red leading-tight">{profile?.totalPoints ?? 0} PTS</p>
            </div>
            <img
              src={profile?.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${profile?.displayName || 'Player'}`}
              alt={profile?.displayName || 'Player avatar'}
              className="hidden sm:block h-9 w-9 rounded-full border border-white/25 bg-white/20 object-cover"
            />
            <button
              onClick={() => logout()}
              className="rounded-lg border border-white/20 p-2 text-white/90 transition hover:bg-white/10 hover:text-white"
              aria-label="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col sm:flex-row">
        {/* Desktop Sidebar */}
        <nav className="hidden sm:flex w-72 shrink-0 flex-col border-r border-brand-blue/10 bg-white/60 p-6 backdrop-blur">
          <p className="mb-4 text-[10px] font-mono uppercase tracking-widest text-black/45">Navigation</p>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "group flex items-center gap-3 rounded-xl p-3 text-sm font-bold uppercase tracking-tight transition-all border",
                activeTab === item.id
                  ? "border-brand-blue bg-brand-blue text-white shadow-lg shadow-brand-blue/20"
                  : "border-transparent text-black/65 hover:border-brand-blue/20 hover:bg-brand-blue/5"
              )}
            >
              <item.icon size={18} className={cn("transition-transform", activeTab === item.id ? "scale-105" : "group-hover:scale-105")} />
              {item.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="sm:hidden sticky bottom-0 z-20 flex items-center justify-around border-t border-brand-blue/15 bg-white/90 p-2 pb-6 backdrop-blur">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={cn(
              "flex min-w-16 flex-col items-center gap-1 rounded-lg p-2 transition-colors",
              activeTab === item.id ? "bg-brand-blue/10 text-brand-blue" : "text-black/45"
            )}
          >
            <item.icon size={20} />
            <span className="text-[10px] font-bold uppercase">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
