import { useState, useMemo } from 'react';
import {
  ArrowRight, Building2, FileText, Play, Send, CheckCircle2, XCircle, Link2, Upload, Paperclip, Clock, AlertCircle,
} from 'lucide-react';
import type { Agency, Task, Policy, Evidence, PolicyClause, Service } from '@/lib/types';
import { TASK_STATUS_LABELS } from '@/lib/types';
import { StatusBadge, Timeline, EmptyState, AgencyIcon } from '@/components/ui';
import { supabase } from '@/lib/supabase';

interface TaskDetailProps {
  taskId: string;
  currentAgency: Agency;
  agencies: Agency[];
  policies: Policy[];
  clauses: PolicyClause[];
  services: Service[];
  tasks: Task[];
  evidence: Evidence[];
  onBack: () => void;
  onRefresh: () => Promise<void>;
}

export function TaskDetail({
  taskId,
  currentAgency,
  agencies,
  policies,
  clauses,
  services,
  tasks,
  evidence,
  onBack,
  onRefresh,
}: TaskDetailProps) {
  const task = tasks.find((t) => t.id === taskId);
  const [summary, setSummary] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [fileType, setFileType] = useState<'pdf' | 'image' | 'link'>('link');
  const [submitting, setSubmitting] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taskEvidence = useMemo(
    () => evidence.filter((e) => e.task_id === taskId).sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()),
    [evidence, taskId],
  );

  if (!task) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <EmptyState title="المهمة غير موجودة" />
      </div>
    );
  }

  const fromAgency = agencies.find((a) => a.id === task.from_agency_id);
  const toAgency = agencies.find((a) => a.id === task.to_agency_id);
  const policy = policies.find((p) => p.id === task.policy_id);
  const taskClauses = clauses.filter((c) => c.policy_id === task.policy_id);
  const service = services.find((s) => s.id === task.service_id);

  const isRecipient = task.to_agency_id === currentAgency.id;
  const isSender = task.from_agency_id === currentAgency.id;
  const canSubmitEvidence = isRecipient && (task.status === 'in_progress' || task.status === 'needs_completion');
  const canReview = isSender && task.status === 'evidence_sent';

  const handleStartTask = async () => {
    setError(null);
    const { error: err } = await supabase
      .from('tasks')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', task.id);
    if (err) { setError(err.message); return; }
    await onRefresh();
  };

  const handleSubmitEvidence = async () => {
    if (!summary.trim()) { setError('اكتب ملخصًا لما أنجزته'); return; }
    setError(null);
    setSubmitting(true);
    const { error: err } = await supabase.from('evidence').insert({
      task_id: task.id,
      agency_id: currentAgency.id,
      summary: summary.trim(),
      file_url: fileUrl.trim() || null,
      file_name: fileUrl.trim() ? null : null,
      file_type: fileUrl.trim() ? fileType : null,
      status: 'submitted',
    });
    if (err) { setError(err.message); setSubmitting(false); return; }

    const { error: taskErr } = await supabase
      .from('tasks')
      .update({ status: 'evidence_sent' })
      .eq('id', task.id);
    if (taskErr) { setError(taskErr.message); setSubmitting(false); return; }

    await supabase.from('notifications').insert({
      agency_id: task.from_agency_id,
      task_id: task.id,
      title: `دليل جديد على مهمة: ${task.title}`,
      body: `رفعت ${currentAgency.name} دليلًا للمراجعة`,
      type: 'review',
      read: false,
    });

    setSummary('');
    setFileUrl('');
    setSubmitting(false);
    await onRefresh();
  };

  const handleApproveEvidence = async (evidenceId: string) => {
    setError(null);
    setReviewing(true);
    const { error: evErr } = await supabase.from('evidence')
      .update({ status: 'approved', reviewer_note: reviewNote.trim() || null, reviewed_at: new Date().toISOString() })
      .eq('id', evidenceId);
    if (evErr) { setError(evErr.message); setReviewing(false); return; }

    const { error: taskErr } = await supabase.from('tasks')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', task.id);
    if (taskErr) { setError(taskErr.message); setReviewing(false); return; }

    await supabase.from('notifications').insert({
      agency_id: task.to_agency_id,
      task_id: task.id,
      title: `تم اعتماد دليل المهمة: ${task.title}`,
      body: `اعتمدت ${currentAgency.name} الدليل المرفوع`,
      type: 'update',
      read: false,
    });

    setReviewNote('');
    setReviewing(false);
    await onRefresh();
  };

  const handleRejectEvidence = async (evidenceId: string) => {
    if (!reviewNote.trim()) { setError('اكتب ملاحظة الاستكمال المطلوبة'); return; }
    setError(null);
    setReviewing(true);
    const { error: evErr } = await supabase.from('evidence')
      .update({ status: 'rejected', reviewer_note: reviewNote.trim(), reviewed_at: new Date().toISOString() })
      .eq('id', evidenceId);
    if (evErr) { setError(evErr.message); setReviewing(false); return; }

    const { error: taskErr } = await supabase.from('tasks')
      .update({ status: 'needs_completion' })
      .eq('id', task.id);
    if (taskErr) { setError(taskErr.message); setReviewing(false); return; }

    await supabase.from('notifications').insert({
      agency_id: task.to_agency_id,
      task_id: task.id,
      title: `الدليل يحتاج استكمال: ${task.title}`,
      body: reviewNote.trim(),
      type: 'review',
      read: false,
    });

    setReviewNote('');
    setReviewing(false);
    await onRefresh();
  };

  const timelineItems = [
    { title: 'إنشاء المهمة', date: task.created_at, done: true, description: `من ${fromAgency?.name}` },
    { title: 'بدء التنفيذ', date: task.started_at, done: !!task.started_at },
    { title: 'رفع الأدلة', date: taskEvidence.length > 0 ? taskEvidence[0].submitted_at : null, done: taskEvidence.length > 0 },
    { title: 'الاعتماد', date: task.completed_at, done: task.status === 'completed' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-l from-emerald-900 to-emerald-800 text-white py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <button onClick={onBack} className="flex items-center gap-2 text-emerald-100/70 hover:text-white transition-colors mb-3 text-sm">
            <ArrowRight className="w-4 h-4" />
            العودة للوحة التحكم
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{task.title}</h1>
            <StatusBadge status={task.status} />
          </div>
          {task.reason && (
            <p className="text-emerald-100/70 text-sm mt-2 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" />
              سبب الإرسال: {task.reason}
            </p>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2 animate-fade-in">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Task description */}
            <div className="card p-6">
              <h3 className="font-bold text-gray-800 mb-3">تفاصيل المهمة</h3>
              <p className="text-gray-600 leading-relaxed mb-4">{task.description}</p>

              <div className="grid sm:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                <div>
                  <p className="text-xs text-gray-400 mb-1">الجهة المرسلة</p>
                  <div className="flex items-center gap-2">
                    {fromAgency && <AgencyIcon icon={fromAgency.icon} color={fromAgency.color} size="sm" />}
                    <span className="font-medium text-gray-700 text-sm">{fromAgency?.name}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">الجهة المستقبلة</p>
                  <div className="flex items-center gap-2">
                    {toAgency && <AgencyIcon icon={toAgency.icon} color={toAgency.color} size="sm" />}
                    <span className="font-medium text-gray-700 text-sm">{toAgency?.name}</span>
                  </div>
                </div>
                {service && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">الخدمة المرتبطة</p>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-600" />
                      <span className="font-medium text-gray-700 text-sm">{service.name}</span>
                    </div>
                  </div>
                )}
                {policy && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">السياسة</p>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-600" />
                      <span className="font-medium text-gray-700 text-sm">{policy.title}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Changed clauses */}
            {taskClauses.length > 0 && (
              <div className="card p-6">
                <h3 className="font-bold text-gray-800 mb-4">بنود السياسة المتأثرة</h3>
                <div className="space-y-3">
                  {taskClauses.map((clause) => (
                    <div key={clause.id} className="rounded-xl border border-gray-200 overflow-hidden">
                      <div className="bg-gray-50 px-4 py-2 text-sm font-medium text-gray-600">
                        البند {clause.clause_number}
                      </div>
                      <div className="p-4 space-y-2">
                        {clause.old_text && (
                          <p className="text-sm text-red-600 line-through opacity-70">{clause.old_text}</p>
                        )}
                        <p className="text-sm text-emerald-700 font-medium">{clause.new_text}</p>
                        {clause.summary && (
                          <div className="text-xs text-gray-500 bg-teal-50 rounded-lg px-3 py-2 mt-2">
                            {clause.summary}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Evidence list */}
            <div className="card p-6">
              <h3 className="font-bold text-gray-800 mb-4">الأدلة المرفوعة</h3>
              {taskEvidence.length === 0 ? (
                <EmptyState icon={Paperclip} title="لم يتم رفع أي دليل بعد" />
              ) : (
                <div className="space-y-3">
                  {taskEvidence.map((ev) => (
                    <div key={ev.id} className={`rounded-xl border p-4 ${
                      ev.status === 'approved' ? 'border-emerald-200 bg-emerald-50/30'
                      : ev.status === 'rejected' ? 'border-red-200 bg-red-50/30'
                      : 'border-gray-200 bg-gray-50/30'
                    }`}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1">
                          <p className="font-medium text-gray-800 text-sm">{ev.summary}</p>
                          {ev.file_url && (
                            <a href={ev.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-600 hover:underline flex items-center gap-1 mt-1">
                              <Link2 className="w-3 h-3" />
                              {ev.file_url}
                            </a>
                          )}
                        </div>
                        <span className={`badge text-xs shrink-0 ${
                          ev.status === 'approved' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                          : ev.status === 'rejected' ? 'bg-red-100 text-red-700 border-red-200'
                          : 'bg-teal-100 text-teal-700 border-teal-200'
                        }`}>
                          {ev.status === 'approved' ? 'معتمد' : ev.status === 'rejected' ? 'مرفوض' : 'بانتظار المراجعة'}
                        </span>
                      </div>
                      {ev.reviewer_note && (
                        <div className="text-xs text-gray-500 bg-white rounded-lg px-3 py-2 mt-2 border border-gray-100">
                          ملاحظة المراجع: {ev.reviewer_note}
                        </div>
                      )}
                      <p className="text-xs text-gray-400 mt-2">
                        {new Date(ev.submitted_at).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>

                      {/* Review buttons for sender */}
                      {canReview && ev.status === 'submitted' && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <input
                            type="text"
                            value={reviewNote}
                            onChange={(e) => setReviewNote(e.target.value)}
                            placeholder="ملاحظة للمراجعة..."
                            className="input-field text-sm mb-2"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleApproveEvidence(ev.id)}
                              disabled={reviewing}
                              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 transition-colors disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              اعتماد
                            </button>
                            <button
                              onClick={() => handleRejectEvidence(ev.id)}
                              disabled={reviewing || !reviewNote.trim()}
                              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-red-100 text-red-700 text-sm font-medium hover:bg-red-200 transition-colors disabled:opacity-50 border border-red-200"
                            >
                              <XCircle className="w-4 h-4" />
                              طلب استكمال
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submit evidence form */}
            {canSubmitEvidence && (
              <div className="card p-6 border-r-4 border-r-emerald-500">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-emerald-600" />
                  رفع دليل الإنجاز
                </h3>
                <div className="space-y-3">
                  <textarea
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="اكتب ما أنجزته في هذه المهمة..."
                    rows={3}
                    className="input-field resize-none"
                  />
                  <div>
                    <div className="flex gap-2 mb-2">
                      {(['link', 'pdf', 'image'] as const).map((ft) => (
                        <button
                          key={ft}
                          onClick={() => setFileType(ft)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                            fileType === ft
                              ? 'bg-emerald-700 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {ft === 'link' ? 'رابط' : ft === 'pdf' ? 'ملف PDF' : 'صورة'}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={fileUrl}
                      onChange={(e) => setFileUrl(e.target.value)}
                      placeholder={fileType === 'link' ? 'رابط الدليل (URL)' : 'رابط الملف المرفوع'}
                      className="input-field text-sm"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      في النسخة التجريبية، يُحفظ رابط الدليل كنص. لرفع الملفات فعليًا يحتاج تفعيل تخزين الملفات.
                    </p>
                  </div>
                  <button
                    onClick={handleSubmitEvidence}
                    disabled={submitting || !summary.trim()}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        إرسال الأدلة للمراجعة
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Start task button */}
            {isRecipient && task.status === 'new' && (
              <div className="card p-6 text-center bg-teal-50/30 border-teal-200">
                <Clock className="w-10 h-10 text-teal-500 mx-auto mb-3" />
                <p className="text-gray-600 font-medium mb-4">هذه المهمة بانتظار البدء</p>
                <button
                  onClick={handleStartTask}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <Play className="w-5 h-5" />
                  بدء التنفيذ
                </button>
              </div>
            )}

            {/* Waiting for review */}
            {isRecipient && task.status === 'evidence_sent' && (
              <div className="card p-6 text-center bg-blue-50/30 border-blue-200">
                <Clock className="w-10 h-10 text-blue-500 mx-auto mb-3" />
                <p className="text-gray-600 font-medium">تم إرسال الأدلة وهي بانتظار مراجعة الجهة الناشرة</p>
              </div>
            )}

            {/* Needs completion */}
            {isRecipient && task.status === 'needs_completion' && (
              <div className="card p-6 bg-orange-50/30 border-orange-200 border-r-4 border-r-orange-500">
                <AlertCircle className="w-6 h-6 text-orange-600 mb-2" />
                <p className="text-orange-700 font-medium mb-1">المراجع طلب استكمال الدليل</p>
                {taskEvidence.find((e) => e.status === 'rejected')?.reviewer_note && (
                  <p className="text-sm text-gray-600 bg-white rounded-lg px-3 py-2 mt-2">
                    {taskEvidence.find((e) => e.status === 'rejected')?.reviewer_note}
                  </p>
                )}
                <p className="text-sm text-gray-500 mt-2">يمكنك رفع دليل جديد بعد استكمال المطلوب</p>
              </div>
            )}
          </div>

          {/* Sidebar - timeline */}
          <div className="space-y-6">
            <div className="card p-6">
              <h3 className="font-bold text-gray-800 mb-4">الخط الزمني</h3>
              <Timeline items={timelineItems} />
            </div>

            <div className="card p-6">
              <h3 className="font-bold text-gray-800 mb-3">معلومات سريعة</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">الحالة</span>
                  <StatusBadge status={task.status} />
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">أُنشأت</span>
                  <span className="text-gray-600">{new Date(task.created_at).toLocaleDateString('ar-SA')}</span>
                </div>
                {task.started_at && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">بدأت</span>
                    <span className="text-gray-600">{new Date(task.started_at).toLocaleDateString('ar-SA')}</span>
                  </div>
                )}
                {task.completed_at && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">اكتملت</span>
                    <span className="text-gray-600">{new Date(task.completed_at).toLocaleDateString('ar-SA')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
