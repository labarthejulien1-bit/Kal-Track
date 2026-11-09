import { useState } from 'react';
import { SegmentedTabs } from '@/components/ui/tabs';
import { DayView } from './DayView';
import { WeekView } from './WeekView';
import { MonthView } from './MonthView';
import { useApp } from '@/components/AppContext';
import { SwipeArea } from '@/components/SwipeArea';
import { addDays, addMonths, startOfMonth, startOfWeek, todayISO } from '@/lib/utils';
import { t } from '@/i18n';

type View = 'day' | 'week' | 'month';

export function Analytics() {
  const { selectedDate } = useApp();
  const [view, setView] = useState<View>('week');
  const [date, setDate] = useState(selectedDate);
  const today = todayISO();

  // Navigation par balayage : jour ±1, semaine ±7 jours, mois ±1.
  const step = (dirn: 1 | -1) => {
    if (view === 'day') return addDays(date, dirn);
    if (view === 'week') return addDays(startOfWeek(date), 7 * dirn);
    return addMonths(startOfMonth(date), dirn);
  };
  const next = step(1);
  const canNext = next <= today;

  return (
    <div className="space-y-3">
      <h1 className="pt-1 text-lg font-bold text-slate-50">{t('Analyses')}</h1>
      <SegmentedTabs
        value={view}
        onChange={setView}
        options={[
          { value: 'day', label: t('Jour') },
          { value: 'week', label: t('Semaine') },
          { value: 'month', label: t('Mois') },
        ]}
      />
      <SwipeArea animKey={`${view}-${date}`} canNext={canNext} onNext={() => canNext && setDate(next)} onPrev={() => setDate(step(-1))}>
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
      </SwipeArea>
    </div>
  );
}
