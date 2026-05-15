import React from 'react';
import { useAuth } from '../App';
import { LayoutDashboard, Vote, Users, Trophy, LogOut } from 'lucide-react';
import { logout } from '../lib/firebase';
import { cn } from '../lib/utils';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function Layout({ children, activeTab, onTabChange }: LayoutProps) {
  const { profile } = useAuth();
  
  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'leagues', label: 'Leagues', icon: Users },
    { id: 'races', label: 'Predictions', icon: Vote },
    { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-brand-dark text-slate-100 grid-paper">
      {/* Top Header */}
      <header className="bg-brand-dark text-white px-6 py-4 flex items-center justify-between border-b-4 border-brand-red z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-brand-red flex items-center justify-center font-black italic transform -skew-x-12 border-2 border-white shadow-[2px_2px_0px_0px_white]">P</div>
          <div className="leading-none">
            <h1 className="font-black italic tracking-tighter text-2xl">POLITIPICK</h1>
            <p className="text-[8px] font-mono uppercase tracking-[0.3em] opacity-50">Division II-A / 2026</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="text-right hidden sm:block border-r border-slate-800 pr-6">
            <p className="text-[10px] uppercase font-mono text-slate-500">Current Standing</p>
            <p className="font-black text-brand-red text-lg italic tracking-tighter -mt-1">{profile?.totalPoints ?? 0} <span className="text-[10px] not-italic text-slate-400 font-mono ml-1">RANK #12</span></p>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-slate-700 overflow-hidden bg-slate-900">
               {profile?.photoURL ? <img src={profile.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-500">{profile?.displayName?.[0]}</div>}
            </div>
            <button 
              onClick={() => logout()}
              className="p-2 hover:bg-brand-red/20 text-slate-400 hover:text-brand-red transition-colors border border-slate-800"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col sm:flex-row w-full max-w-[1600px] mx-auto min-h-0">
        {/* Desktop Sidebar */}
        <nav className="hidden sm:flex flex-col w-64 border-r border-slate-800 p-8 space-y-3 bg-brand-dark/80 backdrop-blur-xl">
          <p className="text-[10px] uppercase font-mono mb-6 text-slate-600 tracking-widest border-b border-slate-800 pb-2">Main Terminal</p>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "flex items-center gap-4 p-4 font-black uppercase tracking-tighter text-xs transition-all border group",
                activeTab === item.id 
                  ? "bg-brand-red text-white border-brand-red shadow-[4px_4px_0px_0px_#000,4px_4px_0px_2px_#fff]" 
                  : "bg-transparent border-transparent text-slate-500 hover:text-white hover:bg-slate-900"
              )}
            >
              <item.icon size={18} className={cn(activeTab === item.id ? "text-white" : "group-hover:text-brand-red")} />
              {item.label}
            </button>
          ))}
          
          <div className="mt-auto pt-8 border-t border-slate-800">
             <div className="bg-slate-900 border border-slate-800 p-4 rounded">
                <p className="text-[9px] font-mono text-slate-500 uppercase mb-2">Live Status</p>
                <div className="flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                   <span className="text-[10px] font-bold text-emerald-500 uppercase">System Ready</span>
                </div>
             </div>
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scroll-hide">
          <div className="p-4 sm:p-10 max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="sm:hidden flex items-center justify-around bg-brand-dark border-t border-slate-800 p-3 pb-8">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={cn(
              "flex flex-col items-center gap-1 p-2 transition-colors",
              activeTab === item.id ? "text-brand-red" : "text-slate-500"
            )}
          >
            <item.icon size={22} />
            <span className="text-[9px] font-black uppercase tracking-tighter">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
