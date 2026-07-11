import React, { useEffect, useState } from 'react';
import { CalendarDays, MapPin } from 'lucide-react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Hearing } from '../../types';

function formatHearingDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today, ${time}`;
  if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${time}`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

export function LegislativeCalendar() {
  const [hearings, setHearings] = useState<Hearing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 1);
    const q = query(
      collection(db, 'hearings'),
      where('date', '>=', cutoff.toISOString()),
      orderBy('date', 'asc'),
      limit(12),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as Hearing);
      setHearings(items);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching hearings:', error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="h-64 flex flex-col bg-white/60 backdrop-blur-md rounded-2xl border border-brand-blue/10 shadow-xl shadow-brand-blue/5 overflow-hidden shrink-0">
      <div className="px-6 py-3 border-b border-black/5 flex justify-between items-center bg-white/40">
        <h3 className="font-bold text-xs uppercase tracking-widest text-brand-blue flex items-center gap-2">
          <CalendarDays size={14} />
          Procedural Horizon
        </h3>
      </div>

      <div className="flex-1 overflow-x-auto p-4 flex gap-4 items-center">
        {hearings.length === 0 ? (
          <p className="w-full text-center text-xs italic text-black/40">
            {loading ? 'Loading hearings…' : 'No upcoming hearings ingested. Run the bill ingestion pipeline to populate the calendar.'}
          </p>
        ) : (
          hearings.map((hearing) => (
            <div key={hearing.id} className="min-w-64 h-full bg-white rounded-xl border border-black/5 p-4 flex flex-col justify-between hover:border-brand-blue/30 transition-colors group cursor-pointer">
              <div>
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-brand-red">{hearing.billId ?? hearing.state}</span>
                  <span className={`text-[9px] px-2 py-0.5 rounded uppercase font-bold tracking-wider ${hearing.status === 'Scheduled' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                    {hearing.status}
                  </span>
                </div>
                <p className="text-sm font-bold text-black leading-tight line-clamp-2">{hearing.committee}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-black/5 flex flex-col gap-1">
                <span className="text-xs text-black/60 font-medium">{formatHearingDate(hearing.date)}</span>
                {hearing.room && (
                  <span className="text-[10px] text-black/40 flex items-center gap-1">
                    <MapPin size={10} />
                    {hearing.room}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
