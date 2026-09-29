import { useState } from 'react';
import { ArrowLeft, Lock, User, KeyRound, Building2 } from 'lucide-react';
import type { Agency } from '@/lib/types';
import { AgencyIcon } from '@/components/ui';

interface AgencyLoginProps {
  agencies: Agency[];
  onSelect: (agency: Agency) => void;
  onBack: () => void;
}

export function AgencyLogin({ agencies, onSelect, onBack }: AgencyLoginProps) {
  const [selectedAgency, setSelectedAgency] = useState<Agency | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgency) return;
    if (!username.trim() || !password.trim()) {
      setError('أدخل اسم المستخدم وكلمة المرور للمتابعة');
      return;
    }
    onSelect(selectedAgency);
  };

  if (!selectedAgency) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex flex-col">
        <div className="bg-emerald-900 text-white py-12 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="w-16 h-16 rounded-2xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-teal-300" />
            </div>
            <h1 className="text-3xl font-bold mb-2">بوابة الجهات الحكومية</h1>
            <p className="text-emerald-100/70">اختر جهتك للدخول إلى لوحة التحكم</p>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="max-w-4xl w-full">
            <div className="grid sm:grid-cols-2 gap-4">
              {agencies.map((agency, idx) => (
                <button
                  key={agency.id}
                  onClick={() => setSelectedAgency(agency)}
                  onMouseEnter={() => {}}
                  className="group card p-6 text-right card-hover animate-slide-up"
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <div className="flex items-center gap-4">
                    <AgencyIcon icon={agency.icon} color={agency.color} size="lg" />
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-gray-800 mb-1">{agency.name}</h3>
                      <p className="text-sm text-gray-500 leading-relaxed">{agency.description}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-emerald-700 text-sm font-medium group-hover:gap-3 transition-all">
                    دخول اللوحة
                    <ArrowLeft className="w-4 h-4" />
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-8 text-center">
              <button onClick={onBack} className="btn-ghost flex items-center gap-1.5 mx-auto">
                <ArrowLeft className="w-4 h-4" />
                العودة للرئيسية
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex flex-col">
      <div className="bg-emerald-900 text-white py-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="w-16 h-16 rounded-2xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-teal-300" />
          </div>
          <h1 className="text-3xl font-bold mb-2">بوابة الجهات الحكومية</h1>
          <p className="text-emerald-100/70">تسجيل الدخول إلى لوحة تحكم {selectedAgency.name}</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full">
          <div className="card p-8 animate-slide-up">
            <div className="flex items-center gap-3 mb-6">
              <AgencyIcon icon={selectedAgency.icon} color={selectedAgency.color} size="lg" />
              <div>
                <h2 className="font-bold text-lg text-gray-800">{selectedAgency.name}</h2>
                <p className="text-sm text-gray-500">{selectedAgency.description}</p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  اسم المستخدم
                </label>
                <div className="relative">
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setError(''); }}
                    placeholder="أدخل اسم المستخدم"
                    className="input-field pr-11"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  كلمة المرور
                </label>
                <div className="relative">
                  <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(''); }}
                    placeholder="أدخل كلمة المرور"
                    className="input-field pr-11"
                    autoComplete="off"
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 animate-fade-in">
                  {error}
                </p>
              )}

              <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2">
                <Lock className="w-5 h-5" />
                دخول
              </button>
            </form>

            <button
              onClick={() => { setSelectedAgency(null); setUsername(''); setPassword(''); setError(''); }}
              className="mt-5 w-full text-sm text-gray-500 hover:text-gray-700 transition-colors flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              اختيار جهة أخرى
            </button>
          </div>

          <div className="mt-6 text-center">
            <button onClick={onBack} className="btn-ghost flex items-center gap-1.5 mx-auto">
              <ArrowLeft className="w-4 h-4" />
              العودة للرئيسية
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
