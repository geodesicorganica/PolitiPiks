import React from 'react';
import { CalendarDays, MapPin } from 'lucide-react';
import { upcomingHearings } from '../../lib/fixtures/calendar';

export function LegislativeCalendar() {

  return (
    <div className="h-64 flex flex-col bg-white/60 backdrop-blur-md rounded-2xl border border-brand-blue/10 shadow-xl shadow-brand-blue/5 overflow-hidden shrink-0">
      <div className="px-6 py-3 border-b border-black/5 flex justify-between items-center bg-white/40">
        <h3 className="font-bold text-xs uppercase tracking-widest text-brand-blue flex items-center gap-2">
          <CalendarDays size={14} />
          Procedural Horizon
        </h3>
      </div>
      
      <div className="flex-1 overflow-x-auto p-4 flex gap-4 items-center">
        {upcomingHearings.map((hearing) => (
          <div key={hearing.id} className="min-w-64 h-full bg-white rounded-xl border border-black/5 p-4 flex flex-col justify-between hover:border-brand-blue/30 transition-colors group cursor-pointer">
            <div>
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-red">{hearing.billId}</span>
                <span className={`text-[9px] px-2 py-0.5 rounded uppercase font-bold tracking-wider ${hearing.status === 'Scheduled' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                  {hearing.status}
                </span>
              </div>
              <p className="text-sm font-bold text-black leading-tight line-clamp-2">{hearing.committee}</p>
            </div>
            
            <div className="mt-4 pt-3 border-t border-black/5 flex flex-col gap-1">
              <span className="text-xs text-black/60 font-medium">{hearing.date}</span>
              <span className="text-[10px] text-black/40 flex items-center gap-1">
                <MapPin size={10} />
                {hearing.room}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
