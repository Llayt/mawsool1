import { useState, useMemo } from 'react';
import { Plus, FileText, Inbox, CheckCircle2, Clock, Bell, Building2, ArrowRight, ListChecks } from 'lucide-react';
import type { Agency, Task, Policy, Notification, Evidence } from '@/lib/types';
import { TASK_STATUS_LABELS } from '@/lib/types';
import { StatusBadge, EmptyState, AgencyIcon } from '@/components/ui';

interface AgencyDashboardProps {
  agency: Agency;
  agencies: Agency[];
  policies: Policy[];
  tasks: Task[];
  notifications: Notification[];
  evidence: Evidence[];
  onCreateUpdate: () => void;
  onOpenTask: (taskId: string) => void;
  onOpenPolicy: (policyId: string) => void;
}

export function AgencyDashboard({
  agency,
  agencies,
  policies,
  tasks,
  notifications,
  evidence,
  onCreateUpdate,
  onOpenTask,
  onOpenPolicy,
}: AgencyDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'published' | 'incoming' | 'notifications'>('overview');

  const agencyTasks = useMemo(() => tasks.filter((t) => t.to_agency_id === agency.id), [tasks, agency.id]);
  const agencyPublishedPolicies = useMemo(
    () => policies.filter((p) => {
      const policyTasks = tasks.filter((t) => t.policy_id === p.id && t.from_agency_id === agency.id);
      return policyTasks.length > 0;
    }),
    [policies, tasks, agency.id],
  );
  const agencyIncomingTasks = useMemo(
    () => tasks.filter((t) => t.to_agency_id === agency.id),
    [tasks, agency.id],
  );
  const agencyNotifications = useMemo(
    () => notifications.filter((n) => n.agency_id === agency.id),
    [notifications, agency.id],
  );

  const tasksByStatus = {
    new: agencyTasks.filter((t) => t.status === 'new'),
    in_progress: agencyTasks.filter((t) => t.status === 'in_progress'),
    evidence_sent: agencyTasks.filter((t) => t.status === 'evidence_sent'),
    needs_completion: agencyTasks.filter((t) => t.status === 'needs_completion'),
    completed: agencyTasks.filter((t) => t.status === 'completed'),
  };

  const unreadCount = agencyNotifications.filter((n) => !n.read).length;

  const getAgencyName = (id: string) => agencies.find((a) => a.id === id)?.name || 'جهة غير محددة';
  const getPolicyTitle = (id: string) => policies.find((p) => p.id === id)?.title || 'سياسة غير محددة';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Agency header */}
      <div className="bg-gradient-to-l from-emerald-900 to-emerald-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <AgencyIcon icon={agency.icon} color="#ffffff" size="lg" />
              <div>
                <h1 className="text-2xl font-bold">{agency.name}</h1>
                <p className="text-emerald-100/70 text-sm">{agency.description}</p>
              </div>
            </div>
            <button onClick={onCreateUpdate} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 text-white font-medium hover:bg-teal-700 transition-all hover:shadow-lg active:scale-95">
              <Plus className="w-5 h-5" />
              إنشاء تحديث جديد
            </button>
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'مهام جديدة', count: tasksByStatus.new.length, icon: Bell, color: 'teal' },
            { label: 'قيد التنفيذ', count: tasksByStatus.in_progress.length, icon: Clock, color: 'blue' },
            { label: 'أدلة مرسلة', count: tasksByStatus.evidence_sent.length, icon: FileText, color: 'purple' },
            { label: 'مكتملة', count: tasksByStatus.completed.length, icon: CheckCircle2, color: 'emerald' },
            { label: 'إشعارات', count: unreadCount, icon: Bell, color: 'red' },
          ].map((stat, idx) => {
            const colorMap: Record<string, string> = {
              teal: 'bg-teal-50 text-teal-700 border-teal-200',
              blue: 'bg-blue-50 text-blue-700 border-blue-200',
              purple: 'bg-purple-50 text-purple-700 border-purple-200',
              emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
              red: 'bg-red-50 text-red-700 border-red-200',
            };
            return (
              <div key={idx} className={`card p-4 border ${colorMap[stat.color]} animate-slide-up`} style={{ animationDelay: `${idx * 50}ms` }}>
                <div className="flex items-center justify-between mb-1">
                  <stat.icon className="w-5 h-5 opacity-70" />
                  <span className="text-2xl font-bold">{stat.count}</span>
                </div>
                <p className="text-sm font-medium opacity-80">{stat.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
          {[
            { id: 'overview', label: 'نظرة عامة', icon: ListChecks },
            { id: 'published', label: 'التحديثات المنشورة', icon: FileText },
            { id: 'incoming', label: 'المهام الواردة', icon: Inbox },
            { id: 'notifications', label: 'الإشعارات', icon: Bell },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.id === 'notifications' && unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-xs">{unreadCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'overview' && (
          <div className="space-y-6 pb-12">
            {/* Task status columns */}
            <div>
              <h3 className="font-bold text-gray-800 mb-3">المهام حسب الحالة</h3>
              <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-3">
                {(['new', 'in_progress', 'evidence_sent', 'needs_completion', 'completed'] as const).map((status) => (
                  <div key={status} className="card p-3">
                    <div className="flex items-center justify-between mb-3">
                      <StatusBadge status={status} />
                      <span className="text-sm font-bold text-gray-400">{tasksByStatus[status].length}</span>
                    </div>
                    <div className="space-y-2">
                      {tasksByStatus[status].length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-4">لا توجد مهام</p>
                      ) : (
                        tasksByStatus[status].slice(0, 3).map((task) => (
                          <button
                            key={task.id}
                            onClick={() => onOpenTask(task.id)}
                            className="w-full text-right p-2.5 rounded-lg bg-gray-50 hover:bg-emerald-50 transition-colors group"
                          >
                            <p className="text-sm font-medium text-gray-700 group-hover:text-emerald-700 line-clamp-1">{task.title}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{getAgencyName(task.from_agency_id)}</p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'published' && (
          <div className="pb-12">
            {agencyPublishedPolicies.length === 0 ? (
              <EmptyState icon={FileText} title="لا توجد تحديثات منشورة" subtitle="ابدأ بإنشاء تحديث سياسة جديد" />
            ) : (
              <div className="space-y-3">
                {agencyPublishedPolicies.map((policy) => {
                  const policyTasks = tasks.filter((t) => t.policy_id === policy.id && t.from_agency_id === agency.id);
                  return (
                    <button
                      key={policy.id}
                      onClick={() => onOpenPolicy(policy.id)}
                      className="w-full text-right card p-5 card-hover"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-gray-800">{policy.title}</h4>
                            <span className="badge bg-emerald-100 text-emerald-700 border-emerald-200">
                              {policy.status === 'published' ? 'منشور' : 'مسودة'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500">{policy.description}</p>
                          {policy.effective_date && (
                            <p className="text-xs text-gray-400 mt-1">
                              تاريخ السريان: {new Date(policy.effective_date).toLocaleDateString('ar-SA')}
                            </p>
                          )}
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-medium text-emerald-700">{policyTasks.length} مهام</p>
                          <p className="text-xs text-gray-400">للجهات الأخرى</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'incoming' && (
          <div className="pb-12">
            {agencyIncomingTasks.length === 0 ? (
              <EmptyState icon={Inbox} title="لا توجد مهام واردة" />
            ) : (
              <div className="space-y-3">
                {agencyIncomingTasks.map((task) => {
                  const policy = policies.find((p) => p.id === task.policy_id);
                  const taskEvidence = evidence.filter((e) => e.task_id === task.id);
                  return (
                    <button
                      key={task.id}
                      onClick={() => onOpenTask(task.id)}
                      className="w-full text-right card p-5 card-hover"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-gray-800">{task.title}</h4>
                            <StatusBadge status={task.status} />
                          </div>
                          <p className="text-sm text-gray-500 line-clamp-2">{task.description}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                            <span className="flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5" />
                              من: {getAgencyName(task.from_agency_id)}
                            </span>
                            {policy && <span>السياسة: {policy.title}</span>}
                            {taskEvidence.length > 0 && <span>{taskEvidence.length} دليل</span>}
                          </div>
                        </div>
                        <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-emerald-600" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="pb-12">
            {agencyNotifications.length === 0 ? (
              <EmptyState icon={Bell} title="لا توجد إشعارات" />
            ) : (
              <div className="space-y-2">
                {agencyNotifications.map((notif) => (
                  <button
                    key={notif.id}
                    onClick={() => notif.task_id && onOpenTask(notif.task_id)}
                    className={`w-full text-right card p-4 flex items-start gap-3 hover:shadow-md transition-all ${
                      !notif.read ? 'border-r-4 border-r-emerald-500 bg-emerald-50/30' : ''
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      notif.type === 'task' ? 'bg-teal-100' : notif.type === 'review' ? 'bg-purple-100' : 'bg-blue-100'
                    }`}>
                      <Bell className={`w-5 h-5 ${
                        notif.type === 'task' ? 'text-teal-700' : notif.type === 'review' ? 'text-purple-700' : 'text-blue-700'
                      }`} />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-800">{notif.title}</p>
                      {notif.body && <p className="text-sm text-gray-500 mt-0.5">{notif.body}</p>}
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(notif.created_at).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    </div>
                    {!notif.read && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 mt-2"></span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
