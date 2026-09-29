import { useMemo } from 'react';
import { ArrowRight, FileText, Building2, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import type { Agency, Task, Policy, PolicyClause, Evidence } from '@/lib/types';
import { StatusBadge, Timeline, AgencyIcon, EmptyState } from '@/components/ui';
import { TASK_STATUS_LABELS } from '@/lib/types';

interface PolicyReviewProps {
  policyId: string;
  currentAgency: Agency;
  agencies: Agency[];
  policies: Policy[];
  clauses: PolicyClause[];
  tasks: Task[];
  evidence: Evidence[];
  onBack: () => void;
  onOpenTask: (taskId: string) => void;
}

export function PolicyReview({
  policyId,
  currentAgency,
  agencies,
  policies,
  clauses,
  tasks,
  evidence,
  onBack,
  onOpenTask,
}: PolicyReviewProps) {
  const policy = policies.find((p) => p.id === policyId);
  const policyClauses = useMemo(() => clauses.filter((c) => c.policy_id === policyId), [clauses, policyId]);
  const policyTasks = useMemo(() => tasks.filter((t) => t.policy_id === policyId), [tasks, policyId]);

  if (!policy) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <EmptyState title="السياسة غير موجودة" />
      </div>
    );
  }

  const getAgencyName = (id: string) => agencies.find((a) => a.id === id)?.name || 'جهة غير محددة';

  const timelineItems = [
    { title: 'إنشاء السياسة', date: policy.created_at, done: true },
    { title: 'تحليل الأثر', date: policy.created_at, done: true },
    { title: 'الاعتماد والنشر', date: policy.published_at, done: !!policy.published_at },
    ...policyTasks.map((t) => ({
      title: `${getAgencyName(t.to_agency_id)}: ${TASK_STATUS_LABELS[t.status]}`,
      date: t.completed_at || t.started_at || t.created_at,
      done: t.status === 'completed',
    })),
  ];

  const completedCount = policyTasks.filter((t) => t.status === 'completed').length;
  const totalCount = policyTasks.length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-l from-emerald-900 to-emerald-800 text-white py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <button onClick={onBack} className="flex items-center gap-2 text-emerald-100/70 hover:text-white transition-colors mb-3 text-sm">
            <ArrowRight className="w-4 h-4" />
            العودة للوحة التحكم
          </button>
          <h1 className="text-2xl font-bold mb-1">{policy.title}</h1>
          <p className="text-emerald-100/70 text-sm">{policy.description}</p>
          <div className="flex items-center gap-4 mt-3 text-sm">
            {policy.effective_date && (
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                السريان: {new Date(policy.effective_date).toLocaleDateString('ar-SA')}
              </span>
            )}
            {policy.published_at && (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                النشر: {new Date(policy.published_at).toLocaleDateString('ar-SA')}
              </span>
            )}
            <span className="badge bg-emerald-500/20 text-emerald-200 border-emerald-400/30">
              {policy.status === 'published' ? 'منشور' : 'مسودة'}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Progress overview */}
            <div className="card p-6">
              <h3 className="font-bold text-gray-800 mb-4">تقدم المهام لدى الجهات</h3>
              {policyTasks.length === 0 ? (
                <EmptyState title="لا توجد مهام" />
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                        style={{ width: `${(completedCount / totalCount) * 100}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-bold text-gray-700">
                      {completedCount} / {totalCount}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {policyTasks.map((task) => {
                      const toAgency = agencies.find((a) => a.id === task.to_agency_id);
                      const taskEvidence = evidence.filter((e) => e.task_id === task.id);
                      return (
                        <button
                          key={task.id}
                          onClick={() => onOpenTask(task.id)}
                          className="w-full text-right p-4 rounded-xl border border-gray-200 hover:border-emerald-300 hover:shadow-md transition-all group"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 flex-1">
                              {toAgency && <AgencyIcon icon={toAgency.icon} color={toAgency.color} size="sm" />}
                              <div className="text-right">
                                <p className="font-medium text-gray-800 text-sm group-hover:text-emerald-700">{task.title}</p>
                                <p className="text-xs text-gray-400">{toAgency?.name}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {taskEvidence.length > 0 && (
                                <span className="text-xs text-gray-400">{taskEvidence.length} دليل</span>
                              )}
                              <StatusBadge status={task.status} />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Changed clauses */}
            {policyClauses.length > 0 && (
              <div className="card p-6">
                <h3 className="font-bold text-gray-800 mb-4">بنود السياسة</h3>
                <div className="space-y-3">
                  {policyClauses.map((clause) => (
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
          </div>

          {/* Sidebar - timeline */}
          <div className="space-y-6">
            <div className="card p-6 sticky top-20">
              <h3 className="font-bold text-gray-800 mb-4">الخط الزمني</h3>
              <Timeline items={timelineItems} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

