import * as React from 'react';
import { cn } from '@/lib/utils';

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-2xl border border-slate-800 bg-slate-800/40 backdrop-blur-sm shadow-sm', className)} {...p} />
);
export const CardHeader = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center justify-between gap-2 px-4 pt-4', className)} {...p} />
);
export const CardTitle = ({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn('text-sm font-semibold tracking-tight text-slate-200', className)} {...p} />
);
export const CardContent = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('p-4', className)} {...p} />
);
