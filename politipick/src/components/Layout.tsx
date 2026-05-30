import React from 'react';
import { useAuth } from '../App';
import { LayoutDashboard, Vote, Users, Trophy, LogOut, Shield } from 'lucide-react';
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
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'races', label: 'Races', icon: Vote },
    { id: 'leagues', label: 'Leagues', icon: Users },
    { id: 'leaderboard', label: 'Global', icon: Trophy },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin', icon: Shield }] : []),
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#E4E3E0]">
      {/* Top Header */}
      <header className="bg-brand-blue text-white p-4 flex items-center justify-between border-b border-brand-red/30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-red flex items-center justify-center font-black italic transform -skew-x-12">P</div>
          <h1 className="font-black italic tracking-tighter text-xl">POLITIPICK 2026</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] uppercase font-mono opacity-60">Your Score</p>
            <p className="font-black text-brand-red -mt-1">{profile?.totalPoints ?? 0} PTS</p>
          </div>
          <button 
            onClick={() => logout()}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col sm:flex-row max-w-7xl mx-auto w-full">
        {/* Desktop Sidebar */}
        <nav className="hidden sm:flex flex-col w-64 border-r border-black/10 p-6 space-y-2 bg-white/50">
          <p className="text-[10px] uppercase font-mono mb-4 text-black/40">Navigation</p>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "flex items-center gap-3 p-3 font-bold uppercase tracking-tighter text-sm transition-all border border-transparent",
                activeTab === item.id 
                  ? "bg-brand-blue text-white border-brand-blue" 
                  : "hover:bg-black/5 text-black/60"
              )}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="sm:hidden flex items-center justify-around bg-white border-t border-black/10 p-2 pb-6">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={cn(
              "flex flex-col items-center gap-1 p-2 rounded-lg transition-colors",
              activeTab === item.id ? "text-brand-blue" : "text-black/40"
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
