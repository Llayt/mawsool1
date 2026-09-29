/*
# أثر - منصة تحديث السياسات الحكومية

## نظرة عامة
منصة تربط بين المواطن والجهات الحكومية. المواطن يسأل مساعدًا ذكيًا عن الخدمات،
والجهات تحدّث السياسات وتنسق التنفيذ بينها.

## الجداول الجديدة
1. agencies - الجهات الحكومية
2. policies - السياسات والاشتراطات
3. policy_clauses - بنود/شروط السياسة
4. services - الخدمات الحكومية
5. tasks - المهام المرسلة للجهات
6. evidence - الأدلة المرفوعة
7. notifications - الإشعارات
8. chat_sessions - جلسات المحادثة
9. chat_messages - رسائل المحادثة

## الأمان
- RLS مفعّل على جميع الجداول
- الوصول anon + authenticated (لا يوجد تسجيل دخول في النسخة الحالية)
- البيانات مشتركة بين مستخدمي المنصة
*/

-- =================== الجهات ===================
CREATE TABLE IF NOT EXISTS agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_en text,
  description text,
  color text DEFAULT '#1a5d3a',
  icon text DEFAULT 'Building2',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_crud_agencies" ON agencies;
CREATE POLICY "anon_crud_agencies" ON agencies FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

-- =================== السياسات ===================
CREATE TABLE IF NOT EXISTS policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  status text DEFAULT 'draft', -- draft, published
  created_at timestamptz DEFAULT now(),
  published_at timestamptz,
  effective_date date,
  notes text
);
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_crud_policies" ON policies;
CREATE POLICY "anon_crud_policies" ON policies FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

-- =================== بنود السياسة ===================
CREATE TABLE IF NOT EXISTS policy_clauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid REFERENCES policies(id) ON DELETE CASCADE,
  clause_number text,
  old_text text,
  new_text text,
  summary text, -- ملخص التغيّر
  created_at timestamptz DEFAULT now()
);
ALTER TABLE policy_clauses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_crud_policy_clauses" ON policy_clauses;
CREATE POLICY "anon_crud_policy_clauses" ON policy_clauses FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

-- =================== الخدمات ===================
CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  agency_id uuid REFERENCES agencies(id) ON DELETE SET NULL,
  policy_id uuid REFERENCES policies(id) ON DELETE SET NULL,
  requirements text[], -- المتطلبات
  link text, -- رابط رسمي إن وجد
  keywords text[], -- كلمات مفتاحية للبحث
  created_at timestamptz DEFAULT now()
);
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_crud_services" ON services;
CREATE POLICY "anon_crud_services" ON services FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

-- =================== المهام ===================
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid REFERENCES policies(id) ON DELETE CASCADE,
  clause_id uuid REFERENCES policy_clauses(id) ON DELETE SET NULL,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  from_agency_id uuid REFERENCES agencies(id) ON DELETE CASCADE,
  to_agency_id uuid REFERENCES agencies(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  reason text, -- سبب ارتباط الجهة
  status text DEFAULT 'new', -- new, in_progress, evidence_sent, needs_completion, completed
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_crud_tasks" ON tasks;
CREATE POLICY "anon_crud_tasks" ON tasks FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

-- =================== الأدلة ===================
CREATE TABLE IF NOT EXISTS evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  agency_id uuid REFERENCES agencies(id) ON DELETE CASCADE,
  summary text NOT NULL,
  file_url text, -- رابط مرفوع أو رابط خارجي
  file_name text,
  file_type text, -- pdf, image, link
  status text DEFAULT 'submitted', -- submitted, approved, rejected
  reviewer_note text,
  submitted_at timestamptz DEFAULT now(),
  reviewed_at timestamptz
);
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_crud_evidence" ON evidence;
CREATE POLICY "anon_crud_evidence" ON evidence FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

-- =================== الإشعارات ===================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid REFERENCES agencies(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  type text DEFAULT 'task', -- task, update, review
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_crud_notifications" ON notifications;
CREATE POLICY "anon_crud_notifications" ON notifications FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

-- =================== جلسات المحادثة ===================
CREATE TABLE IF NOT EXISTS chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_crud_chat_sessions" ON chat_sessions;
CREATE POLICY "anon_crud_chat_sessions" ON chat_sessions FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

-- =================== رسائل المحادثة ===================
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL, -- user, assistant
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_crud_chat_messages" ON chat_messages;
CREATE POLICY "anon_crud_chat_messages" ON chat_messages FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

-- =================== الفهارس ===================
CREATE INDEX IF NOT EXISTS idx_policy_clauses_policy ON policy_clauses(policy_id);
CREATE INDEX IF NOT EXISTS idx_services_agency ON services(agency_id);
CREATE INDEX IF NOT EXISTS idx_services_policy ON services(policy_id);
CREATE INDEX IF NOT EXISTS idx_tasks_policy ON tasks(policy_id);
CREATE INDEX IF NOT EXISTS idx_tasks_to_agency ON tasks(to_agency_id);
CREATE INDEX IF NOT EXISTS idx_tasks_from_agency ON tasks(from_agency_id);
CREATE INDEX IF NOT EXISTS idx_evidence_task ON evidence(task_id);
CREATE INDEX IF NOT EXISTS idx_notifications_agency ON notifications(agency_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
