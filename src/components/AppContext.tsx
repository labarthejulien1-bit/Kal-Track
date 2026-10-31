import { createContext, useContext } from 'react';
import type { Meal, MealType } from '@/types';

export type Tab = 'journal' | 'analytics' | 'weight' | 'settings';
export type AddMode = 'choose' | 'photo' | 'barcode' | 'label' | 'text' | 'manual' | 'recent';

export interface AddRequest {
  date?: string;
  mealType?: MealType;
  edit?: Meal;
  mode?: AddMode;
}

export interface AppCtx {
  tab: Tab;
  setTab: (t: Tab) => void;
  selectedDate: string;
  setSelectedDate: (d: string) => void;
  openAdd: (req?: AddRequest) => void;
}

export const AppContext = createContext<AppCtx>(null as unknown as AppCtx);
export const useApp = () => useContext(AppContext);
