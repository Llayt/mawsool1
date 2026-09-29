import { Sparkles, Users, Building2, ArrowLeft, FileText, Bell, CheckCircle2 } from 'lucide-react';
import { BrandLogo } from '@/components/ui';

interface HomePageProps {
  onSelectCitizen: () => void;
  onSelectAgency: () => void;
}

export function HomePage({ onSelectCitizen, onSelectAgency }: HomePageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-teal-50/30 to-white">
      {/* Hero */}
      <section className="relative overflow-hidden bg-white">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-teal-50"></div>
        <div className="absolute inset-0 opacity-40" style={{
          backgroundImage: 'radial-gradient(circle at 20% 30%, #9de4d0 0%, transparent 34%), radial-gradient(circle at 80% 70%, #bcefe2 0%, transparent 34%)',
        }}></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-100 border border-teal-200 text-teal-800 text-sm font-medium mb-6 animate-fade-in">
              <Sparkles className="w-4 h-4" />
              منصة خدمات حكومية ذكية
            </div>
            <BrandLogo className="w-72 sm:w-96 h-auto max-h-48 object-contain mx-auto mb-4 animate-slide-up" />
            <p className="text-xl sm:text-2xl text-teal-800 font-medium mb-2 animate-slide-up" style={{ animationDelay: '100ms' }}>
              من التشريعات إلى كل الخدمات الحكومية
            </p>
            <p className="text-emerald-900/70 max-w-2xl mx-auto text-lg leading-relaxed animate-slide-up" style={{ animationDelay: '200ms' }}>
              منصة تربط المواطن بالخدمات الحكومية، وتنسق بين الجهات عند تحديث السياسات حتى يصل الأثر للمستفيد
            </p>
          </div>

          {/* Two big choices */}
          <div className="mt-14 grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <button
              onClick={onSelectCitizen}
              className="group relative bg-white rounded-3xl p-8 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 text-right animate-slide-up"
              style={{ animationDelay: '300ms' }}
            >
              <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-l from-emerald-600 to-emerald-400 rounded-t-3xl"></div>
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Users className="w-8 h-8 text-emerald-700" />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">أنا مواطن</h3>
              <p className="text-gray-500 leading-relaxed mb-4">
                اسأل المساعد الذكي عن أي خدمة تريد إنجازها، وسيرشدك إلى الخطوات والجهات المسؤولة
              </p>
              <div className="flex items-center gap-2 text-emerald-700 font-medium text-sm group-hover:gap-3 transition-all">
                ابدأ المحادثة
                <ArrowLeft className="w-4 h-4" />
              </div>
            </button>

            <button
              onClick={onSelectAgency}
              className="group relative bg-white rounded-3xl p-8 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 text-right animate-slide-up"
              style={{ animationDelay: '400ms' }}
            >
              <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-l from-teal-700 to-teal-400 rounded-t-3xl"></div>
              <div className="w-16 h-16 rounded-2xl bg-teal-100 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Building2 className="w-8 h-8 text-teal-700" />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">أنا جهة</h3>
              <p className="text-gray-500 leading-relaxed mb-4">
                حدّث السياسات، حلّل الأثر، انسق مع الجهات الأخرى، وتابع التنفيذ حتى الاعتماد
              </p>
              <div className="flex items-center gap-2 text-teal-700 font-medium text-sm group-hover:gap-3 transition-all">
                دخول اللوحة
                <ArrowLeft className="w-4 h-4" />
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* Visual flow explanation */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-emerald-900 mb-3">كيف يربط موصول الجهات بالمواطن؟</h2>
            <p className="text-gray-500 text-lg">من التشريع إلى الخدمة الحكومية التي يحتاجها المواطن</p>
          </div>

          <div className="grid md:grid-cols-5 gap-4 items-start">
            {[
              { icon: FileText, title: 'تحديث السياسة', desc: 'الجهة تعدّل النص وتحلل الأثر', color: 'emerald' },
              { icon: Building2, title: 'تحديد الجهات', desc: 'النظام يحدد الجهات والخدمات المرتبطة', color: 'teal' },
              { icon: CheckCircle2, title: 'الاعتماد والنشر', desc: 'الموظف يراجع ويعتمد التحديث', color: 'emerald' },
              { icon: Bell, title: 'وصول المهام', desc: 'الجهات المستقبلة ترى الإشعار والمطلوب', color: 'teal' },
              { icon: Users, title: 'وصول الأثر', desc: 'المواطن يحصل على المعلومات المحدثة', color: 'emerald' },
            ].map((step, idx) => {
              const colorClasses: Record<string, string> = {
                emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                teal: 'bg-teal-100 text-teal-700 border-teal-200',
              };
              return (
                <div key={idx} className="relative">
                  <div className="card p-5 text-center card-hover animate-slide-up" style={{ animationDelay: `${idx * 150}ms` }}>
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 border ${colorClasses[step.color]}`}>
                      <step.icon className="w-7 h-7" />
                    </div>
                    <div className="absolute -top-2 -left-2 w-7 h-7 rounded-full bg-emerald-800 text-white text-sm font-bold flex items-center justify-center shadow-md">
                      {idx + 1}
                    </div>
                    <h4 className="font-bold text-gray-800 mb-1">{step.title}</h4>
                    <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
                  </div>
                  {idx < 4 && (
                    <div className="hidden md:block absolute top-1/2 -left-3 -translate-y-1/2 z-10">
                      <div className="w-6 h-6 rounded-full bg-teal-600 flex items-center justify-center shadow-md">
                        <ArrowLeft className="w-3.5 h-3.5 text-white" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="py-8 text-center text-gray-400 text-sm border-t border-gray-100">
        موصول — منصة تجريبية لربط السياسات الحكومية بالخدمات والمواطنين
      </footer>
    </div>
  );
}
