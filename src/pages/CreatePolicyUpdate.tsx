import { useState } from 'react';
import { Sparkles, ArrowRight, FileText, Building2, AlertCircle, CheckCircle2, Plus, Trash2, Edit3, ShieldCheck, Link2, AlertTriangle, ExternalLink, Info } from 'lucide-react';
import type { Agency, Policy, Service, PolicyClause } from '@/lib/types';
import { proposeTasks } from '@/lib/analysis';
import type { ImpactAnalysisResult, ProposedTask } from '@/lib/analysis';
import { AgencyIcon } from '@/components/ui';

interface CreatePolicyUpdateProps {
  agency: Agency;
  agencies: Agency[];
  policies: Policy[];
  services: Service[];
  clauses: PolicyClause[];
  onPublish: (data: PublishData) => Promise<void>;
  onBack: () => void;
}

export interface PublishData {
  title: string;
  description: string;
  oldText: string;
  newText: string;
  effectiveDate: string;
  notes: string;
  analysis: ImpactAnalysisResult;
  tasks: ProposedTask[];
}

export function CreatePolicyUpdate({
  agency,
  agencies,
  policies,
  services,
  clauses,
  onPublish,
  onBack,
}: CreatePolicyUpdateProps) {
  const [title, setTitle] = useState('');
  const [oldText, setOldText] = useState('');
  const [newText, setNewText] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [notes, setNotes] = useState('');
  const [analysis, setAnalysis] = useState<ImpactAnalysisResult | null>(null);
  const [proposedTasks, setProposedTasks] = useState<ProposedTask[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>('');

  const handleAnalyze = async () => {
    if (!title.trim() || !oldText.trim() || !newText.trim()) {
      setError('يرجى تعبئة العنوان والنص القديم والنص الجديد قبل التحليل.');
      return;
    }
    setError(null);
    setAnalyzing(true);
    setAnalysis(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/policy-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({
          oldText,
          newText,
          title: title.trim(),
          policyId: selectedPolicyId || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'تعذر إجراء التحليل.');
      }

      const result: ImpactAnalysisResult = {
        overallSummary: data.overallSummary || 'تم تحليل التحديث.',
        changedItems: data.changedItems || [],
        affectedServices: data.affectedServices || [],
        affectedAgencies: data.affectedAgencies || [],
        approvedMatch: data.approvedMatch || false,
        caseTitle: data.caseTitle,
        affectedSystems: data.affectedSystems || [],
        sources: data.sources || [],
        conflicts: data.conflicts || [],
        retrievedRules: data.retrievedRules || [],
      };

      const tasks = proposeTasks(result, agency.id, selectedPolicyId || null, clauses);
      setAnalysis(result);
      setProposedTasks(tasks);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذر إجراء التحليل.';
      setError(msg);
    } finally {
      setAnalyzing(false);
    }
  };

  const handlePublish = async () => {
    if (!analysis) return;
    setPublishing(true);
    setError(null);
    try {
      await onPublish({
        title: title.trim(),
        description: notes.trim() || '',
        oldText,
        newText,
        effectiveDate,
        notes,
        analysis,
        tasks: proposedTasks,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء النشر';
      setError(msg);
      setPublishing(false);
    }
  };

  const removeTask = (idx: number) => {
    setProposedTasks((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateTaskTitle = (idx: number, val: string) => {
    setProposedTasks((prev) => prev.map((t, i) => (i === idx ? { ...t, title: val } : t)));
  };

  const updateTaskDesc = (idx: number, val: string) => {
    setProposedTasks((prev) => prev.map((t, i) => (i === idx ? { ...t, description: val } : t)));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-l from-emerald-900 to-emerald-800 text-white py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <button onClick={onBack} className="flex items-center gap-2 text-emerald-100/70 hover:text-white transition-colors mb-3 text-sm">
            <ArrowRight className="w-4 h-4" />
            العودة للوحة التحكم
          </button>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Plus className="w-7 h-7 text-teal-300" />
            إنشاء تحديث سياسة جديد
          </h1>
          <p className="text-emerald-100/70 text-sm mt-1">
            الجهة الناشرة: {agency.name}
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2 animate-fade-in">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        {/* Form */}
        <div className="card p-6 mb-6">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-700" />
            تفاصيل التحديث
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">عنوان السياسة</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: اشتراطات ترخيص المطاعم"
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">
                السياسة المرتبطة (اختياري — لربط التحديث بسياسة موجودة)
              </label>
              <select
                value={selectedPolicyId}
                onChange={(e) => setSelectedPolicyId(e.target.value)}
                className="input-field"
              >
                <option value="">— سياسة جديدة —</option>
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">النص القديم</label>
                <textarea
                  value={oldText}
                  onChange={(e) => setOldText(e.target.value)}
                  placeholder="الصق النص الحالي للسياسة أو الاشتراط..."
                  rows={6}
                  className="input-field resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">النص الجديد</label>
                <textarea
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="اكتب النص المحدّث للسياسة..."
                  rows={6}
                  className="input-field resize-none"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">تاريخ السريان</label>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">ملاحظات</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظات إضافية..."
                  className="input-field"
                />
              </div>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={analyzing || !title.trim() || !oldText.trim() || !newText.trim()}
              className="btn-gold flex items-center gap-2 w-full justify-center"
            >
              {analyzing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  جاري التحليل...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  تحليل الأثر
                </>
              )}
            </button>
          </div>
        </div>

        {/* Analysis results */}
        {analysis && (
          <div className="space-y-6 animate-slide-up">
            {/* Approved match badge */}
            {analysis.approvedMatch && (
              <div className="card p-4 bg-emerald-50 border-emerald-300 flex items-center gap-3">
                <ShieldCheck className="w-6 h-6 text-emerald-700 shrink-0" />
                <div>
                  <p className="font-bold text-emerald-800 text-sm">مطابقة مع حالة معتمدة في قاعدة المعرفة</p>
                  <p className="text-xs text-emerald-600">
                    {analysis.caseTitle ? `الحالة: ${analysis.caseTitle}` : 'تم استخدام الإجابة المعتمدة المخزنة'}
                  </p>
                </div>
              </div>
            )}

            {/* Overall summary */}
            <div className="card p-6 border-r-4 border-r-teal-500">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-teal-700" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 mb-1">ملخص التحليل</h3>
                  <p className="text-gray-600 leading-relaxed">{analysis.overallSummary}</p>
                </div>
              </div>
            </div>

            {/* Affected agencies */}
            {analysis.affectedAgencies.length > 0 && (
              <div className="card p-6">
                <h3 className="font-bold text-gray-800 mb-4">الجهات المتأثرة</h3>
                <div className="space-y-2">
                  {analysis.affectedAgencies.map((ag) => {
                    const agencyData = agencies.find((a) => a.id === ag.id);
                    return (
                      <div key={ag.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50/50">
                        {agencyData && <AgencyIcon icon={agencyData.icon} color={agencyData.color} size="sm" />}
                        <div className="flex-1">
                          <p className="font-medium text-gray-800 text-sm">{ag.name}</p>
                          <p className="text-xs text-gray-500">{ag.reason}</p>
                        </div>
                        <span className="text-xs text-gray-400">{ag.serviceCount} خدمة</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Affected services */}
            {analysis.affectedServices.length > 0 && (
              <div className="card p-6">
                <h3 className="font-bold text-gray-800 mb-4">الخدمات المرتبطة</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  {analysis.affectedServices.map((svc) => (
                    <div key={svc.id} className="rounded-xl border border-gray-200 p-3 bg-gray-50/50">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="w-4 h-4 text-emerald-600" />
                        <span className="font-medium text-gray-800 text-sm">{svc.name}</span>
                        {svc.relationType && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            svc.relationType === 'direct'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-teal-100 text-teal-700'
                          }`}>
                            {svc.relationType === 'direct' ? 'مباشرة' : 'محتملة'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{svc.agencyName}</p>
                      <p className="text-xs text-emerald-600 mt-1">{svc.reason}</p>
                      {svc.statusNote && (
                        <p className="text-xs text-gray-400 mt-1 italic">{svc.statusNote}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Affected systems (from approved case) */}
            {analysis.affectedSystems && analysis.affectedSystems.length > 0 && (
              <div className="card p-6">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Info className="w-5 h-5 text-teal-600" />
                  الأنظمة والإجراءات التي تستحق المراجعة
                </h3>
                <div className="space-y-2">
                  {analysis.affectedSystems.map((sys, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-3 rounded-xl border border-gray-200 bg-gray-50/50">
                      <AlertCircle className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                      <p className="text-sm text-gray-700">{sys}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Retrieved rules */}
            {analysis.retrievedRules && analysis.retrievedRules.length > 0 && !analysis.approvedMatch && (
              <div className="card p-6">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Info className="w-5 h-5 text-teal-600" />
                  القواعد المسترجعة من قاعدة المعرفة
                </h3>
                <div className="space-y-2">
                  {analysis.retrievedRules.map((rule, idx) => (
                    <div key={idx} className="p-3 rounded-xl border border-gray-200 bg-gray-50/50">
                      <p className="text-sm text-gray-700">{rule}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Proposed tasks - editable */}
            {proposedTasks.length > 0 && (
              <div className="card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-800">المهام المقترحة للجهات</h3>
                  <span className="text-sm text-gray-400 flex items-center gap-1">
                    <Edit3 className="w-4 h-4" />
                    قابل للتعديل
                  </span>
                </div>
                <div className="space-y-3">
                  {proposedTasks.map((task, idx) => {
                    const targetAgency = agencies.find((a) => a.id === task.to_agency_id);
                    return (
                      <div key={idx} className="rounded-xl border border-gray-200 p-4 bg-teal-50/30">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {targetAgency && <AgencyIcon icon={targetAgency.icon} color={targetAgency.color} size="sm" />}
                            <span className="font-medium text-gray-800 text-sm">{targetAgency?.name}</span>
                          </div>
                          <button
                            onClick={() => removeTask(idx)}
                            className="text-red-400 hover:text-red-600 transition-colors p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={task.title}
                          onChange={(e) => updateTaskTitle(idx, e.target.value)}
                          className="input-field mb-2 text-sm"
                          placeholder="عنوان المهمة"
                        />
                        <textarea
                          value={task.description}
                          onChange={(e) => updateTaskDesc(idx, e.target.value)}
                          rows={2}
                          className="input-field text-sm resize-none"
                          placeholder="وصف المهمة"
                        />
                        <p className="text-xs text-emerald-600 mt-2">{task.reason}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {proposedTasks.length === 0 && analysis.affectedAgencies.length <= 1 && (
              <div className="card p-6 text-center">
                <AlertCircle className="w-10 h-10 text-teal-500 mx-auto mb-2" />
                <p className="text-gray-600 font-medium">لم يتم العثور على جهات أخرى متأثرة</p>
                <p className="text-sm text-gray-400 mt-1">يمكنك نشر التحديث دون مهام للجهات الأخرى</p>
              </div>
            )}

            {/* Publish button */}
            <div className="card p-6 bg-emerald-50/50 border-emerald-200">
              <div className="flex items-start gap-3 mb-4">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-sm text-gray-600 leading-relaxed">
                  بعد المراجعة، اضغط «اعتماد ونشر التحديث» لإرسال المهام إلى الجهات المعنية وإنشاء الإشعارات.
                  لا يمكن التراجع بعد النشر.
                </p>
              </div>
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {publishing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    جاري النشر...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    اعتماد ونشر التحديث
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
