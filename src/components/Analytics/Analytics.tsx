import { useState } from 'react';
import { SegmentedTabs } from '@/components/ui/tabs';
import { DayView } from './DayView';
import { WeekView } from './WeekView';
import { MonthView } from './MonthView';
import { useApp } from '@/components/AppContext';

type View = 'day' | 'week' | 'month';

export function Analytics() {
  const { selectedDate } = useApp();
  const [view, setView] = useState<View>('week');
  const [date, setDate] = useState(selectedDate);

  return (
    <div className="space-y-3">
      <h1 className="pt-1 text-lg font-bold text-slate-50">Analyses</h1>
      <SegmentedTabs
        value={view}
        onChange={setView}
        options={[
          { value: 'day', label: 'Jour' },
          { value: 'week', label: 'Semaine' },
          { value: 'month', label: 'Mois' },
        ]}
      />
      {view === 'day' && <DayView date={date} setDate={setDate} />}
      {view === 'week' && <WeekView anchor={date} setAnchor={setDate} />}
      {view === 'month' && (
        <MonthView
          anchor={date}
          setAnchor={setDate}
          onPickDay={(d) => {
            setDate(d);
            setView('day');
          }}
        />
      )}
    </div>
  );
}
