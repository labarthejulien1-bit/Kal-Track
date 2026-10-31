import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppContext, type AddRequest, type Tab } from '@/components/AppContext';
import { Layout } from '@/components/Layout';
import { Dashboard } from '@/components/Dashboard/Dashboard';
import { Analytics } from '@/components/Analytics/Analytics';
import { WeightTab } from '@/components/Weight/WeightTab';
import { Settings } from '@/components/Settings/Settings';
import { CameraModal } from '@/components/Scan/CameraModal';
import { Onboarding } from '@/components/Onboarding';
import { ToastProvider } from '@/components/ui/toast';
import { useProfile } from '@/hooks/useProfile';
import { todayISO } from '@/lib/utils';

const TABS: Tab[] = ['journal', 'analytics', 'weight', 'settings'];

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const initialTab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'journal') as Tab;
  const [tab, setTab] = useState<Tab>(initialTab);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [addRequest, setAddRequest] = useState<AddRequest | null>(params.get('action') === 'scan' ? { mode: 'choose' } : null);
  const [onboarded, setOnboarded] = useState(false);
  const { loading, hasProfile } = useProfile();

  const openAdd = useCallback((req: AddRequest = {}) => setAddRequest({ ...req }), []);

  // Repasse automatiquement sur « aujourd'hui » quand l'appli est rouverte un autre jour.
  useEffect(() => {
    let last = todayISO();
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const now = todayISO();
      if (now !== last) {
        setSelectedDate(now);
        last = now;
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const ctx = useMemo(() => ({ tab, setTab, selectedDate, setSelectedDate, openAdd }), [tab, selectedDate, openAdd]);

  return (
    <ToastProvider>
      <AppContext.Provider value={ctx}>
        <Layout>
          {tab === 'journal' && <Dashboard />}
          {tab === 'analytics' && <Analytics />}
          {tab === 'weight' && <WeightTab />}
          {tab === 'settings' && <Settings />}
        </Layout>
        <CameraModal request={addRequest} onClose={() => setAddRequest(null)} />
        <Onboarding open={!loading && !hasProfile && !onboarded} onDone={() => setOnboarded(true)} />
      </AppContext.Provider>
    </ToastProvider>
  );
}
