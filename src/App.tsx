import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppData } from '@/lib/useAppData';
import type { Agency } from '@/lib/types';
import { AppHeader, LoadingSpinner, ErrorState, useToast } from '@/components/ui';
import { HomePage } from '@/pages/HomePage';
import { CitizenChat } from '@/pages/CitizenChat';
import { AgencyLogin } from '@/pages/AgencyLogin';
import { AgencyDashboard } from '@/pages/AgencyDashboard';
import { CreatePolicyUpdate } from '@/pages/CreatePolicyUpdate';
import type { PublishData } from '@/pages/CreatePolicyUpdate';
import { TaskDetail } from '@/pages/TaskDetail';
import { PolicyReview } from '@/pages/PolicyReview';

type View =
  | { name: 'home' }
  | { name: 'citizen' }
  | { name: 'agency-login' }
  | { name: 'agency-dashboard' }
  | { name: 'create-update' }
  | { name: 'task-detail'; taskId: string }
  | { name: 'policy-review'; policyId: string };

function App() {
  const { agencies, policies, clauses, services, tasks, evidence, notifications, loading, error, refresh } = useAppData();
  const [view, setView] = useState<View>({ name: 'home' });
  const [selectedAgency, setSelectedAgency] = useState<Agency | null>(null);
  const { showToast, ToastEl } = useToast();

  const goHome = useCallback(() => {
    setView({ name: 'home' });
    setSelectedAgency(null);
  }, []);

  const handleSelectAgency = useCallback((agency: Agency) => {
    setSelectedAgency(agency);
    setView({ name: 'agency-dashboard' });
  }, []);

  const handlePublish = useCallback(async (data: PublishData) => {
    if (!selectedAgency) throw new Error('لم يتم اختيار جهة');

    // 1. Create or update policy
    let policyId = '';
    const existingPolicy = policies.find((p) => p.title === data.title);

    if (existingPolicy) {
      // Update existing policy
      const { data: updated, error: upErr } = await supabase
        .from('policies')
        .update({
          notes: data.notes,
          effective_date: data.effectiveDate || null,
          published_at: new Date().toISOString(),
          status: 'published',
        })
        .eq('id', existingPolicy.id)
        .select()
        .single();
      if (upErr) throw new Error(upErr.message);
      policyId = updated.id;

      // Delete old clauses and insert new ones
      await supabase.from('policy_clauses').delete().eq('policy_id', policyId);
    } else {
      const { data: newPolicy, error: polErr } = await supabase
        .from('policies')
        .insert({
          title: data.title,
          description: data.description,
          status: 'published',
          effective_date: data.effectiveDate || null,
          notes: data.notes,
          published_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (polErr) throw new Error(polErr.message);
      policyId = newPolicy.id;
    }

    // 2. Insert clauses
    if (data.analysis.changedItems.length > 0) {
      const clauseInserts = data.analysis.changedItems.map((item) => ({
        policy_id: policyId,
        clause_number: item.clauseNumber,
        old_text: item.oldText || null,
        new_text: item.newText || null,
        summary: item.summary,
      }));
      const { error: clauseErr } = await supabase.from('policy_clauses').insert(clauseInserts);
      if (clauseErr) throw new Error(clauseErr.message);
    }

    // 3. Insert tasks for affected agencies
    if (data.tasks.length > 0) {
      const taskInserts = data.tasks.map((task) => ({
        policy_id: policyId,
        clause_id: task.clause_id,
        service_id: task.service_id,
        from_agency_id: selectedAgency.id,
        to_agency_id: task.to_agency_id,
        title: task.title,
        description: task.description,
        reason: task.reason,
        status: 'new' as const,
      }));
      const { data: insertedTasks, error: taskErr } = await supabase.from('tasks').insert(taskInserts).select();
      if (taskErr) throw new Error(taskErr.message);

      // 4. Create notifications for each receiving agency
      if (insertedTasks && insertedTasks.length > 0) {
        const notifInserts = insertedTasks.map((task: { id: string; to_agency_id: string; title: string }) => ({
          agency_id: task.to_agency_id,
          task_id: task.id,
          title: `مهمة جديدة: ${task.title}`,
          body: `صدر تحديث سياسة من ${selectedAgency.name} يتطلب إجراءً من جانبكم`,
          type: 'task' as const,
          read: false,
        }));
        await supabase.from('notifications').insert(notifInserts);
      }
    }

    await refresh();
    showToast('تم نشر التحديث وإرسال المهام للجهات المعنية');
    setView({ name: 'policy-review', policyId });
  }, [selectedAgency, policies, refresh, showToast]);

  if (loading) return <LoadingSpinner text="جاري تحميل منصة موصول..." />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  // Citizen chat is full-screen, no header
  if (view.name === 'citizen') {
    return (
      <>
        <CitizenChat onBack={goHome} />
        {ToastEl}
      </>
    );
  }

  return (
    <div className="min-h-screen">
      {view.name !== 'home' && (
        <AppHeader
          view={view.name}
          selectedAgency={selectedAgency}
          onBackHome={goHome}
          onAgencySelect={handleSelectAgency}
          agencies={agencies}
        />
      )}

      {view.name === 'home' && (
        <HomePage
          onSelectCitizen={() => setView({ name: 'citizen' })}
          onSelectAgency={() => setView({ name: 'agency-login' })}
        />
      )}

      {view.name === 'agency-login' && (
        <AgencyLogin
          agencies={agencies}
          onSelect={handleSelectAgency}
          onBack={goHome}
        />
      )}

      {view.name === 'agency-dashboard' && selectedAgency && (
        <AgencyDashboard
          agency={selectedAgency}
          agencies={agencies}
          policies={policies}
          tasks={tasks}
          notifications={notifications}
          evidence={evidence}
          onCreateUpdate={() => setView({ name: 'create-update' })}
          onOpenTask={(taskId) => setView({ name: 'task-detail', taskId })}
          onOpenPolicy={(policyId) => setView({ name: 'policy-review', policyId })}
        />
      )}

      {view.name === 'create-update' && selectedAgency && (
        <CreatePolicyUpdate
          agency={selectedAgency}
          agencies={agencies}
          policies={policies}
          services={services}
          clauses={clauses}
          onPublish={handlePublish}
          onBack={() => setView({ name: 'agency-dashboard' })}
        />
      )}

      {view.name === 'task-detail' && selectedAgency && (
        <TaskDetail
          taskId={view.taskId}
          currentAgency={selectedAgency}
          agencies={agencies}
          policies={policies}
          clauses={clauses}
          services={services}
          tasks={tasks}
          evidence={evidence}
          onBack={() => setView({ name: 'agency-dashboard' })}
          onRefresh={refresh}
        />
      )}

      {view.name === 'policy-review' && selectedAgency && (
        <PolicyReview
          policyId={view.policyId}
          currentAgency={selectedAgency}
          agencies={agencies}
          policies={policies}
          clauses={clauses}
          tasks={tasks}
          evidence={evidence}
          onBack={() => setView({ name: 'agency-dashboard' })}
          onOpenTask={(taskId) => setView({ name: 'task-detail', taskId })}
        />
      )}

      {ToastEl}
    </div>
  );
}

export default App;
