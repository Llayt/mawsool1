/*
# Knowledge Base Tables with Semantic Search Support

## Overview
Creates a structured knowledge base that powers both the citizen assistant and the
agency policy-impact analysis. The knowledge base stores verified rules, services,
approved cases with anchor sentences, and their text embeddings (via pgvector)
for semantic search. This replaces the previous approach of sending the entire
service catalog to the LLM and hoping it picks the right one.

## New Tables

1. **kb_cases** — Reference cases (e.g. "نظام السجل التجاري")
   - id (text, PK, stable slug like 'commercial_register')
   - title, description, sources (JSONB array of {label, url})
   - approved_change_summary, approved_citizen_answer (text)
   - approved_affected_services, approved_affected_systems (text[])
   - knowledge_version, verified_at, effective_from
   - created_at, updated_at

2. **kb_rules** — Verified key rules linked to a case
   - id (uuid PK)
   - case_id (text FK to kb_cases)
   - text (the rule text)
   - source_label, source_url
   - verified_at, effective_from
   - created_at

3. **kb_services** — Services linked to cases with relation metadata
   - id (uuid PK)
   - case_id (text FK to kb_cases)
   - agency_name (text)
   - service_name (text)
   - relation (text — describes the relationship)
   - relation_type (text — 'direct' or 'potential')
   - status_note (text — e.g. "صلة مباشرة بالنظام" or "ارتباط محتمل")
   - source_label, source_url
   - created_at

4. **kb_anchors** — Anchor sentences for matching approved cases
   - id (uuid PK)
   - case_id (text FK to kb_cases)
   - mode (text — 'citizen' or 'gov')
   - text (the anchor sentence)
   - created_at

5. **kb_embeddings** — Text embeddings for semantic search (pgvector)
   - id (uuid PK)
   - source_type (text — 'rule', 'service', 'anchor_citizen', 'anchor_gov', 'case')
   - source_id (text — FK reference to source table's id)
   - content (text — the text that was embedded)
   - embedding (vector(384) — the embedding vector)
   - model_name (text — which model produced this embedding)
   - created_at, updated_at

## Security
- RLS enabled on all tables
- TO anon, authenticated (no sign-in in this app, data is shared)
- CRUD allowed for anon + authenticated

## Notes
- pgvector extension is enabled (vector(384) for multilingual-e5-small compatible embeddings)
- Embeddings are stored and reused; they are regenerated only when source content changes
- The seed data comes from knowledge.py and is inserted once (idempotent via ON CONFLICT)
- Verified_at is NULL for seeded data — it is not automatically verified
*/

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- =================== kb_cases ===================
CREATE TABLE IF NOT EXISTS kb_cases (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  sources jsonb DEFAULT '[]'::jsonb,
  approved_change_summary text,
  approved_citizen_answer text,
  approved_affected_services text[] DEFAULT '{}',
  approved_affected_systems text[] DEFAULT '{}',
  knowledge_version text DEFAULT '1.0',
  verified_at timestamptz,
  effective_from date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE kb_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_crud_kb_cases" ON kb_cases;
CREATE POLICY "anon_crud_kb_cases" ON kb_cases FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

-- =================== kb_rules ===================
CREATE TABLE IF NOT EXISTS kb_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id text REFERENCES kb_cases(id) ON DELETE CASCADE,
  text text NOT NULL,
  source_label text,
  source_url text,
  verified_at timestamptz,
  effective_from date,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE kb_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_crud_kb_rules" ON kb_rules;
CREATE POLICY "anon_crud_kb_rules" ON kb_rules FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

-- =================== kb_services ===================
CREATE TABLE IF NOT EXISTS kb_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id text REFERENCES kb_cases(id) ON DELETE CASCADE,
  agency_name text NOT NULL,
  service_name text NOT NULL,
  relation text,
  relation_type text DEFAULT 'potential',
  status_note text,
  source_label text,
  source_url text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE kb_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_crud_kb_services" ON kb_services;
CREATE POLICY "anon_crud_kb_services" ON kb_services FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

-- =================== kb_anchors ===================
CREATE TABLE IF NOT EXISTS kb_anchors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id text REFERENCES kb_cases(id) ON DELETE CASCADE,
  mode text NOT NULL,
  text text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE kb_anchors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_crud_kb_anchors" ON kb_anchors;
CREATE POLICY "anon_crud_kb_anchors" ON kb_anchors FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

-- =================== kb_embeddings ===================
CREATE TABLE IF NOT EXISTS kb_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  source_id text NOT NULL,
  content text NOT NULL,
  embedding vector(384),
  model_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE kb_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_crud_kb_embeddings" ON kb_embeddings;
CREATE POLICY "anon_crud_kb_embeddings" ON kb_embeddings FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

-- =================== Indexes ===================
CREATE INDEX IF NOT EXISTS idx_kb_rules_case ON kb_rules(case_id);
CREATE INDEX IF NOT EXISTS idx_kb_services_case ON kb_services(case_id);
CREATE INDEX IF NOT EXISTS idx_kb_anchors_case ON kb_anchors(case_id);
CREATE INDEX IF NOT EXISTS idx_kb_anchors_mode ON kb_anchors(mode);
CREATE INDEX IF NOT EXISTS idx_kb_embeddings_source ON kb_embeddings(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_kb_embeddings_vec ON kb_embeddings USING hnsw (embedding vector_cosine_ops);

-- =================== Seed Data from knowledge.py ===================
-- Insert the case (idempotent)
INSERT INTO kb_cases (id, title, description, sources, approved_change_summary, approved_citizen_answer, approved_affected_services, approved_affected_systems, knowledge_version, verified_at, effective_from)
VALUES (
  'commercial_register',
  'تحديثات السجل التجاري',
  'حالة مرجعية مبنية على نظام السجل التجاري الجديد في السعودية، وتشمل الانتقال إلى سجل تجاري واحد للمنشأة على مستوى المملكة، وإلغاء السجلات الفرعية، واستبدال انتهاء السجل بالتأكيد السنوي للبيانات. تستخدم هذه المعلومات لتوجيه اقتراحات الخدمات ذات صلة، ولا تعني أن كل خدمة أو نظام داخلي قد تغير فعليًا.',
  '[
    {"label": "وزارة التجارة: نظام السجل التجاري الجديد", "url": "https://mc.gov.sa/ar/mediacenter/News/Pages/17-09-24-02.aspx"},
    {"label": "وزارة التجارة: خدمات السجل التجاري", "url": "https://mc.gov.sa/en/ESERVICES/pages/ServiceDetails.aspx?sID=38"},
    {"label": "البنك المركزي السعودي: تعميم تطبيق أحكام نظام السجل التجاري", "url": "https://rulebook.sama.gov.sa/en/emphasizing-implementation-provisions-commercial-register-law-and-law-tradenames"}
  ]'::jsonb,
  'ألغى نظام السجل التجاري السجلات الفرعية واكتفى بسجل تجاري واحد للمنشأة على مستوى المملكة، وحلّ التأكيد السنوي لبيانات السجل محل تجديده، مع مهلة لتصحيح أوضاع السجلات الفرعية القائمة قبل 2 أبريل 2030م.',
  '### الإجراءات المطلوبة
1. تحديث بيانات المنشأة: تقديم طلب إلكتروني عبر منصة المركز السعودي للأعمال لتعديل بيانات السجل التجاري الموحد — الجهة: وزارة التجارة (إلزامي)
2. تأكيد البيانات السنوي: إكمال التأكيد السنوي للبيانات خلال تسعين يومًا من تاريخ استحقاقه — الجهة: وزارة التجارة (إلزامي)
3. تصحيح أو شطب السجلات الفرعية: اختيار تحويل أو شطب أو نقل السجلات الفرعية القائمة قبل 2 أبريل 2030م — الجهة: وزارة التجارة (إلزامي)',
  ARRAY[
    'وزارة التجارة: إصدار السجل التجاري وتحديث بياناته والتأكيد السنوي',
    'المركز السعودي للأعمال: خدمات إصدار السجل التجاري وتعديل بيانات المنشأة',
    'هيئة الزكاة والضريبة والجمارك: التسجيل وإدارة بيانات المنشأة الضريبية',
    'المؤسسة العامة للتأمينات الاجتماعية: تسجيل المنشأة وإدارة بيانات الاشتراك',
    'البنوك: التحقق من بيانات السجل التجاري للمنشآت'
  ],
  ARRAY[
    'أنظمة التحقق من صلاحية السجل: تعتمد على تاريخ انتهاء السجل الذي ألغاه النظام',
    'الربط برقم السجل الفرعي: السجلات الفرعية تُشطب بانتهاء مهلة التصحيح في 2 أبريل 2030م',
    'تنبيهات تجديد السجل: حلّ التأكيد السنوي للبيانات محل التجديد',
    'إجراءات حالة السجل المعلّق: يُعلّق القيد إذا لم يُقدَّم التأكيد السنوي خلال تسعين يومًا من تاريخ استحقاقه'
  ],
  '1.0',
  NULL,
  '2025-04-03'
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  sources = EXCLUDED.sources,
  approved_change_summary = EXCLUDED.approved_change_summary,
  approved_citizen_answer = EXCLUDED.approved_citizen_answer,
  approved_affected_services = EXCLUDED.approved_affected_services,
  approved_affected_systems = EXCLUDED.approved_affected_systems,
  knowledge_version = EXCLUDED.knowledge_version,
  effective_from = EXCLUDED.effective_from,
  updated_at = now();

-- Insert key rules (delete existing for this case first, then re-insert)
DELETE FROM kb_rules WHERE case_id = 'commercial_register';

INSERT INTO kb_rules (case_id, text, source_label, source_url, effective_from) VALUES
  ('commercial_register', 'بدأ العمل بنظام السجل التجاري ونظام الأسماء التجارية (المرسوم الملكي رقم م/83 وتاريخ 19/3/1446هـ) في 3 أبريل 2025م.', 'نظام السجل التجاري', NULL, '2025-04-03'),
  ('commercial_register', 'للمنشأة سجل تجاري واحد على مستوى المملكة يشمل جميع أنشطتها وفروعها، ولا تُصدر سجلات فرعية جديدة.', 'نظام السجل التجاري', NULL, '2025-04-03'),
  ('commercial_register', 'يجب تصحيح أوضاع السجلات الفرعية القائمة خلال خمس سنوات من نفاذ النظام، أي قبل 2 أبريل 2030م، وتُشطب جميع السجلات الفرعية بانتهاء هذه المهلة.', 'نظام السجل التجاري', NULL, '2025-04-03'),
  ('commercial_register', 'خيارات تصحيح السجل الفرعي وفق آلية وزارة التجارة: تحويله بتأسيس شركة جديدة، أو نقله إلى شخص آخر غير مقيد في السجل التجاري (للمؤسسة الفردية)، أو شطبه.', 'نظام السجل التجاري', NULL, '2025-04-03'),
  ('commercial_register', 'عند شطب السجل الفرعي ترتبط تراخيصه وموافقاته وأنشطته بالسجل الرئيسي، وعند نقله إلى شخص آخر ترتبط بمن انتقل إليه.', 'نظام السجل التجاري', NULL, '2025-04-03'),
  ('commercial_register', 'أُلغي تاريخ انتهاء السجل التجاري وتجديده، وحلّ محله التأكيد السنوي الإلكتروني لبيانات السجل.', 'نظام السجل التجاري', NULL, '2025-04-03'),
  ('commercial_register', 'يُعلّق قيد التاجر إذا لم يقدم التأكيد السنوي خلال تسعين يومًا من تاريخ استحقاقه.', 'نظام السجل التجاري', NULL, '2025-04-03'),
  ('commercial_register', 'خلال مهلة التصحيح يجب تأكيد بيانات السجلات الفرعية القائمة عند حلول موعد تأكيدها السنوي، إلى حين تصحيح وضعها.', 'نظام السجل التجاري', NULL, '2025-04-03'),
  ('commercial_register', 'تُقدَّم خدمات السجل التجاري (التحديث، والتأكيد السنوي، وتصحيح السجلات الفرعية) إلكترونيًا عبر منصة المركز السعودي للأعمال.', 'نظام السجل التجاري', NULL, '2025-04-03');

-- Insert services (delete existing for this case first, then re-insert)
DELETE FROM kb_services WHERE case_id = 'commercial_register';

INSERT INTO kb_services (case_id, agency_name, service_name, relation, relation_type, status_note) VALUES
  ('commercial_register', 'وزارة التجارة', 'إصدار السجل التجاري وتحديث بياناته والتأكيد السنوي', 'الجهة الأساسية المعنية بالسجل التجاري الموحد والتأكيد السنوي للبيانات.', 'direct', 'صلة مباشرة بالنظام.'),
  ('commercial_register', 'المركز السعودي للأعمال', 'خدمات إصدار السجل التجاري وتعديل بيانات المنشأة', 'قناة رقمية لتقديم عدد من خدمات الأعمال المرتبطة بالسجل التجاري.', 'direct', 'خدمات مرتبطة بمسار السجل؛ تفاصيل الأثر التشغيلي تحتاج إلى تحقق من الجهة.'),
  ('commercial_register', 'هيئة الزكاة والضريبة والجمارك', 'التسجيل وإدارة بيانات المنشأة الضريبية', 'قد تكون بيانات المنشأة التجارية ذات صلة بإجراءات التسجيل والتحقق من بيانات المكلف.', 'potential', 'ارتباط محتمل بالبيانات؛ لا يعني أن شروط التسجيل الضريبي تغيرت بسبب النظام وحده.'),
  ('commercial_register', 'المؤسسة العامة للتأمينات الاجتماعية', 'تسجيل المنشأة وإدارة بيانات الاشتراك', 'قد ترتبط بيانات السجل وهوية المنشأة بإجراءات التسجيل والتحقق.', 'potential', 'ارتباط محتمل؛ يتطلب التحقق من إجراءات الربط الحالية.'),
  ('commercial_register', 'سبل – البريد السعودي', 'العنوان الوطني للمنشأة', 'العنوان الوطني يحدد موقع المنشأة، ويجب التمييز بينه وبين بيانات السجل التجاري.', 'potential', 'خدمة مرتبطة ببيانات المنشأة، وليس بالضرورة أنها تغيرت مباشرة.'),
  ('commercial_register', 'البنوك', 'التحقق من بيانات السجل التجاري للمنشآت', 'قد تتطلب إجراءات فتح الحسابات وتحديث بيانات العملاء التحقق من بيانات السجل وفق التعليمات ذات الصلة.', 'potential', 'جهات مستفيدة من بيانات السجل؛ يراجع كل بنك إجراءات التطبيق الخاصة به.');

-- Insert anchors (delete existing for this case first, then re-insert)
DELETE FROM kb_anchors WHERE case_id = 'commercial_register';

-- Gov anchors
INSERT INTO kb_anchors (case_id, mode, text) VALUES
  ('commercial_register', 'gov', 'إلغاء السجلات التجارية الفرعية والاكتفاء بسجل تجاري واحد للمنشأة على مستوى المملكة'),
  ('commercial_register', 'gov', 'اعتماد الرقم الوطني الموحد للمنشأة في السجل التجاري'),
  ('commercial_register', 'gov', 'إلغاء مدة السجل التجاري وتجديده واستبدالهما بالتأكيد السنوي لبيانات السجل'),
  ('commercial_register', 'gov', 'تعليق قيد السجل التجاري عند عدم تقديم التأكيد السنوي في موعده'),
  ('commercial_register', 'gov', 'مهلة لتصحيح أوضاع السجلات الفرعية القائمة بالتحويل إلى شركة أو النقل أو الشطب');

-- Citizen anchors
INSERT INTO kb_anchors (case_id, mode, text) VALUES
  ('commercial_register', 'citizen', 'لدي سجلات تجارية فرعية وأريد معرفة ما يجب علي فعله بعد تطبيق النظام الجديد'),
  ('commercial_register', 'citizen', 'كيف أحدّث بيانات منشأتي في السجل التجاري بعد النظام الجديد'),
  ('commercial_register', 'citizen', 'ماذا أفعل بالسجلات الفرعية لفروع مؤسستي أو شركتي');

-- =================== Add policy analysis cache table ===================
CREATE TABLE IF NOT EXISTS policy_analysis_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  old_text text NOT NULL,
  new_text text NOT NULL,
  title text NOT NULL,
  knowledge_version text,
  analysis_result jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE policy_analysis_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_crud_policy_analysis_cache" ON policy_analysis_cache;
CREATE POLICY "anon_crud_policy_analysis_cache" ON policy_analysis_cache FOR ALL
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_policy_analysis_cache_hash ON policy_analysis_cache(md5(old_text || new_text || title));