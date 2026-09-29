export interface Agency {
  id: string;
  name: string;
  name_en: string | null;
  description: string | null;
  color: string;
  icon: string;
  created_at: string;
}

export interface Policy {
  id: string;
  title: string;
  description: string | null;
  status: 'draft' | 'published';
  created_at: string;
  published_at: string | null;
  effective_date: string | null;
  notes: string | null;
}

export interface PolicyClause {
  id: string;
  policy_id: string;
  clause_number: string | null;
  old_text: string | null;
  new_text: string | null;
  summary: string | null;
  created_at: string;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  agency_id: string | null;
  policy_id: string | null;
  requirements: string[] | null;
  link: string | null;
  keywords: string[] | null;
  created_at: string;
}

export interface Task {
  id: string;
  policy_id: string;
  clause_id: string | null;
  service_id: string | null;
  from_agency_id: string;
  to_agency_id: string;
  title: string;
  description: string | null;
  reason: string | null;
  status: 'new' | 'in_progress' | 'evidence_sent' | 'needs_completion' | 'completed';
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface Evidence {
  id: string;
  task_id: string;
  agency_id: string;
  summary: string;
  file_url: string | null;
  file_name: string | null;
  file_type: 'pdf' | 'image' | 'link' | null;
  status: 'submitted' | 'approved' | 'rejected';
  reviewer_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

export interface Notification {
  id: string;
  agency_id: string;
  task_id: string | null;
  title: string;
  body: string | null;
  type: 'task' | 'update' | 'review';
  read: boolean;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ChatSession {
  id: string;
  created_at: string;
}

export type TaskStatus = 'new' | 'in_progress' | 'evidence_sent' | 'needs_completion' | 'completed';

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  new: 'جديدة',
  in_progress: 'قيد التنفيذ',
  evidence_sent: 'أدلة مرسلة',
  needs_completion: 'تحتاج استكمالًا',
  completed: 'مكتملة',
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  new: 'bg-teal-100 text-teal-800 border-teal-300',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-300',
  evidence_sent: 'bg-purple-100 text-purple-800 border-purple-300',
  needs_completion: 'bg-orange-100 text-orange-800 border-orange-300',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};
