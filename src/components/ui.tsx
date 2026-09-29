import { useEffect, useState } from 'react';
import { ArrowRight, Building2, FileText, CheckCircle2, Bell, ChevronLeft, Landmark } from 'lucide-react';
import type { Agency } from '@/lib/types';
import { TASK_STATUS_LABELS, TASK_STATUS_COLORS } from '@/lib/types';
import type { TaskStatus } from '@/lib/types';

interface AppHeaderProps {
  view: string;
  selectedAgency: Agency | null;
  onBackHome: () => void;
  onAgencySelect?: (agency: Agency) => void;
  agencies: Agency[];
}

export function BrandLogo({ className = '' }: { className?: string }) {
  return (
    <img
      src="/mawsoul-logo-transparent.png"
      alt="موصول — من التشريعات إلى كل الخدمات الحكومية"
      className={`brand-logo ${className}`}
    />
  );
}

export function AppHeader({ view, selectedAgency, onBackHome, onAgencySelect, agencies }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <button onClick={onBackHome} className="flex items-center gap-3 group min-w-0">
            <BrandLogo className="w-28 sm:w-36 h-14 object-contain" />
          </button>

          <div className="flex items-center gap-3">
            {view.startsWith('agency') && agencies.length > 0 && (
              <select
                value={selectedAgency?.id || ''}
                onChange={(e) => {
                  const ag = agencies.find((a) => a.id === e.target.value);
                  if (ag && onAgencySelect) onAgencySelect(ag);
                }}
                className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-600 cursor-pointer"
              >
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}
            <button onClick={onBackHome} className="btn-ghost flex items-center gap-1.5 text-sm">
              <ChevronLeft className="w-4 h-4" />
              الرئيسية
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`badge ${TASK_STATUS_COLORS[status]}`}>
      {TASK_STATUS_LABELS[status]}
    </span>
  );
}

export function AgencyIcon({ icon, color, size = 'md' }: { icon: string; color: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'w-14 h-14' : size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';
  const iconClass = size === 'lg' ? 'w-7 h-7' : size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';

  const iconMap: Record<string, typeof Building2> = {
    Building2,
    ShieldCheck: Building2,
    Landmark: Landmark,
    TrendingUp: Building2,
  };
  const Icon = iconMap[icon] || Building2;

  return (
    <div className={`${sizeClass} rounded-xl flex items-center justify-center shrink-0`} style={{ backgroundColor: color + '20', color }}>
      <Icon className={iconClass} />
    </div>
  );
}

export function LoadingSpinner({ text = 'جاري التحميل...' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="w-10 h-10 border-3 border-emerald-200 border-t-emerald-700 rounded-full animate-spin"></div>
      <p className="text-gray-500 text-sm">{text}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
        <Bell className="w-7 h-7 text-red-600" />
      </div>
      <p className="text-red-700 font-medium text-center max-w-md">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-outline">إعادة المحاولة</button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon = FileText, title, subtitle }: { icon?: typeof FileText; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
        <Icon className="w-7 h-7 text-gray-400" />
      </div>
      <p className="text-gray-600 font-medium">{title}</p>
      {subtitle && <p className="text-gray-400 text-sm max-w-sm">{subtitle}</p>}
    </div>
  );
}

export function Timeline({ items }: { items: { title: string; date: string | null; done: boolean; description?: string }[] }) {
  return (
    <div className="relative pr-6">
      <div className="absolute right-2.5 top-0 bottom-0 w-0.5 bg-gray-200"></div>
      {items.map((item, idx) => (
        <div key={idx} className="relative mb-6 last:mb-0 animate-slide-up" style={{ animationDelay: `${idx * 100}ms` }}>
          <div className={`absolute right-0 top-1 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
            item.done ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-gray-300'
          }`}>
            {item.done && <CheckCircle2 className="w-3 h-3 text-white" />}
          </div>
          <div className="pr-8">
            <p className={`font-medium ${item.done ? 'text-emerald-800' : 'text-gray-500'}`}>{item.title}</p>
            {item.description && <p className="text-sm text-gray-500 mt-0.5">{item.description}</p>}
            {item.date && (
              <p className="text-xs text-gray-400 mt-1">
                {new Date(item.date).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const ToastEl = toast ? (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-xl shadow-lg animate-slide-up font-medium text-sm ${
        toast.type === 'success' ? 'bg-emerald-700 text-white'
        : toast.type === 'error' ? 'bg-red-600 text-white'
        : 'bg-gray-800 text-white'
      }`}
    >
      {toast.message}
    </div>
  ) : null;

  return { showToast, ToastEl };
}

export { ArrowRight, ChevronLeft };
