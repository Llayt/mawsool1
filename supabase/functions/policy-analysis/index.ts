// policy-analysis edge function — Semantic matching + change detection + approved case matching
// Pipeline:
// 1. Detect changes between old and new text
// 2. Semantic search against knowledge base
// 3. Match approved cases (anchors_gov)
// 4. If approved match → use stored summary, services, systems
// 5. If no approved match → retrieve rules, generate analysis from retrieved context only
// 6. Detect conflicts between input text and stored knowledge
// 7. Return structured analysis with relation types (direct/potential)
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ---- Inline semantic search ----
const EMBEDDING_DIM = 384;

function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u0652]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function trigramEmbed(text: string, dim: number = EMBEDDING_DIM): number[] {
  const normalized = normalizeArabic(text);
  const vec = new Float32Array(dim);
  const padded = ` ${normalized} `;
  for (let i = 0; i < padded.length - 2; i++) {
    const trigram = padded.slice(i, i + 3);
    let hash = 0;
    for (let j = 0; j < trigram.length; j++) {
      hash = ((hash << 5) - hash + trigram.charCodeAt(j)) | 0;
    }
    const idx = Math.abs(hash) % dim;
    vec[idx] += 1;
  }
  const words = normalized.split(/\s+/).filter((w) => w.length > 1);
  for (const word of words) {
    let hash = 0;
    for (let j = 0; j < word.length; j++) {
      hash = ((hash << 5) - hash + word.charCodeAt(j)) | 0;
    }
    const idx = Math.abs(hash) % dim;
    vec[idx] += 2;
  }
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = words[i] + " " + words[i + 1];
    let hash = 0;
    for (let j = 0; j < bigram.length; j++) {
      hash = ((hash << 5) - hash + bigram.charCodeAt(j)) | 0;
    }
    const idx = Math.abs(hash) % dim;
    vec[idx] += 1.5;
  }
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) vec[i] /= norm;
  }
  return Array.from(vec);
}

const SIMILARITY_THRESHOLD_GOV = 0.15;
const APPROVED_MATCH_THRESHOLD_GOV = 0.40;

interface SearchHit {
  source_type: string;
  source_id: string;
  content: string;
  score: number;
}

async function semanticSearch(supabase: ReturnType<typeof createClient>, query: string, topK: number): Promise<SearchHit[]> {
  const queryEmbed = trigramEmbed(query);
  const { data, error } = await supabase.rpc("kb_search", {
    query_embedding: queryEmbed,
    top_k: topK,
  });
  if (error || !data) return [];
  return data as SearchHit[];
}

async function matchApprovedAnchors(
  supabase: ReturnType<typeof createClient>,
  text: string,
): Promise<{ matched: boolean; caseId: string | null; score: number; anchor: string }> {
  const queryEmbed = trigramEmbed(text);
  const { data, error } = await supabase.rpc("kb_search_anchors", {
    query_embedding: queryEmbed,
    anchor_type: "anchor_gov",
    top_k: 1,
  });
  if (error || !data || data.length === 0) {
    return { matched: false, caseId: null, score: 0, anchor: "" };
  }
  const best = data[0] as { source_id: string; content: string; score: number; case_id: string };
  return {
    matched: best.score >= APPROVED_MATCH_THRESHOLD_GOV,
    caseId: best.case_id || null,
    score: best.score,
    anchor: best.content,
  };
}

// ---- Change detection ----
function tokenize(text: string): string[] {
  return normalizeArabic(text).split(/\s+/).filter((w) => w.length > 2);
}

function findChangedSentences(oldText: string, newText: string): Array<{
  clauseNumber: string;
  oldText: string;
  newText: string;
  summary: string;
  changeType: "modified" | "added" | "removed";
}> {
  const oldSentences = oldText.split(/[.،؛\n]+/).map((s) => s.trim()).filter(Boolean);
  const newSentences = newText.split(/[.،؛\n]+/).map((s) => s.trim()).filter(Boolean);
  const items: Array<{
    clauseNumber: string; oldText: string; newText: string;
    summary: string; changeType: "modified" | "added" | "removed";
  }> = [];

  const maxLen = Math.max(oldSentences.length, newSentences.length);
  for (let i = 0; i < maxLen; i++) {
    const old = oldSentences[i] || "";
    const news = newSentences[i] || "";
    if (old === news) continue;

    let changeType: "modified" | "added" | "removed" = "modified";
    if (!old) changeType = "added";
    else if (!news) changeType = "removed";

    const oldTokens = new Set(tokenize(old));
    const newTokens = new Set(tokenize(news));
    const added = [...newTokens].filter((t) => !oldTokens.has(t));
    const removed = [...oldTokens].filter((t) => !newTokens.has(t));

    const parts: string[] = [];
    if (removed.length > 0) parts.push(`إلغاء: ${removed.slice(0, 5).join("، ")}`);
    if (added.length > 0) parts.push(`إضافة: ${added.slice(0, 5).join("، ")}`);
    const summary = parts.length > 0 ? parts.join(" | ") : "تعديل في الصياغة";

    items.push({
      clauseNumber: String(i + 1),
      oldText: old,
      newText: news,
      summary,
      changeType,
    });
  }
  return items;
}

// ---- Conflict detection ----
function detectConflicts(
  newText: string,
  rules: string[],
): Array<{ rule: string; conflict: string }> {
  const conflicts: Array<{ rule: string; conflict: string }> = [];
  const newTextNorm = normalizeArabic(newText);

  for (const rule of rules) {
    const ruleNorm = normalizeArabic(rule);
    // Check if the new text contradicts a known rule
    // Simple heuristic: if the new text contains negation of a key rule concept
    const ruleKeywords = tokenize(rule).slice(0, 5);
    const hasContradiction = ruleKeywords.some((kw) => {
      // Check for negation patterns near the keyword
      const idx = newTextNorm.indexOf(kw);
      if (idx < 0) return false;
      const context = newTextNorm.slice(Math.max(0, idx - 20), idx + kw.length + 20);
      return /لا|بدون|إلغاء|يستثنى|عدا/.test(context) && !/لا تُصدر|لا تُقدَّم|لا يُعلّق/.test(ruleNorm);
    });
    if (hasContradiction) {
      conflicts.push({ rule, conflict: "النص الجديد قد يتعارض مع هذا الحكم المؤكد" });
    }
  }
  return conflicts;
}

// ---- Request body ----
interface RequestBody {
  oldText: string;
  newText: string;
  title: string;
  policyId: string | null;
}

const GROQ_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GROQ_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "GROQ_API_KEY_NOT_CONFIGURED",
          message:
            "مفتاح Groq API غير مُعد. أضف GROQ_API_KEY في Supabase Dashboard ← Edge Functions ← Secrets.",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body: RequestBody = await req.json();
    const { oldText, newText, title, policyId } = body;

    if (!oldText?.trim() || !newText?.trim() || !title?.trim()) {
      return new Response(
        JSON.stringify({ error: "MISSING_FIELDS", message: "البيانات غير مكتملة" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Step 1: Detect changes
    const changedItems = findChangedSentences(oldText, newText);

    // Step 2: Semantic search against knowledge base
    const combinedText = `${title} ${newText}`;
    const hits = await semanticSearch(supabase, combinedText, 6);
    const retrievedRules = hits.filter((h) => h.source_type === "rule").map((h) => h.content);

    // Step 3: Match approved cases (gov anchors)
    const approvedMatch = await matchApprovedAnchors(supabase, combinedText);

    // Step 4: If approved match, use stored data
    if (approvedMatch.matched && approvedMatch.caseId) {
      const { data: caseData } = await supabase
        .from("kb_cases")
        .select("*")
        .eq("id", approvedMatch.caseId)
        .maybeSingle();

      if (caseData) {
        const { data: caseServices } = await supabase
          .from("kb_services")
          .select("id, agency_name, service_name, relation, relation_type, status_note")
          .eq("case_id", approvedMatch.caseId)
          .order("created_at");

        // Detect conflicts
        const conflicts = detectConflicts(newText, retrievedRules.length > 0 ? retrievedRules : []);

        // Build affected services from stored approved data
        const affectedServices = (caseServices || []).map((s: {
          id: string; agency_name: string; service_name: string;
          relation: string | null; relation_type: string; status_note: string | null;
        }) => ({
          id: s.id,
          name: s.service_name,
          agencyId: "",
          agencyName: s.agency_name,
          reason: s.relation || s.status_note || "",
          relationType: s.relation_type,
          statusNote: s.status_note,
        }));

        // Build affected agencies from services
        const agencyMap = new Map<string, { id: string; name: string; reason: string; serviceCount: number }>();
        for (const svc of affectedServices) {
          const existing = agencyMap.get(svc.agencyName);
          if (existing) {
            existing.serviceCount++;
          } else {
            agencyMap.set(svc.agencyName, {
              id: svc.agencyId || svc.agencyName,
              name: svc.agencyName,
              reason: svc.reason,
              serviceCount: 1,
            });
          }
        }

        return new Response(
          JSON.stringify({
            overallSummary: caseData.approved_change_summary || "تم تحليل التحديث.",
            changedItems,
            affectedServices,
            affectedAgencies: Array.from(agencyMap.values()),
            approvedMatch: true,
            caseTitle: caseData.title,
            affectedSystems: caseData.approved_affected_systems || [],
            sources: (caseData.sources && Array.isArray(caseData.sources)) ? caseData.sources : [],
            conflicts,
            retrievedRules,
            matchScore: approvedMatch.score,
            matchedAnchor: approvedMatch.anchor,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Step 5: No approved match — use LLM with retrieved context
    const [agenciesRes, servicesRes] = await Promise.all([
      supabase.from("agencies").select("id, name"),
      supabase.from("services").select("id, name, description, agency_id, requirements, link, keywords, policy_id"),
    ]);

    const agencies = agenciesRes.data || [];
    const services = servicesRes.data || [];

    const servicesText = services
      .map((s: { id: string; name: string; description: string | null; agency_id: string | null; keywords: string[] | null }) => {
        const agency = agencies.find((a: { id: string; name: string }) => a.id === s.agency_id);
        return `[${s.id}] ${s.name}\n   جهة: ${agency?.name || "غير محدد"}\n   وصف: ${s.description || ""}\n   كلمات مفتاحية: ${(s.keywords || []).join("، ")}`;
      })
      .join("\n\n");

    const agenciesText = agencies
      .map((a: { id: string; name: string }) => `id="${a.id}" name="${a.name}"`)
      .join("\n");

    const contextRules = retrievedRules.length > 0
      ? retrievedRules.map((r, i) => `[قاعدة ${i + 1}] ${r}`).join("\n")
      : "لا توجد قواعد مسترجعة محددة.";

    const systemPrompt = `أنت محلل سياسات حكومية في منصة سعودية اسمها «أثر». مهمتك تحليل الفرق بين نص سياسة قديم ونص جديد، وتحديد الخدمات والجهات المتأثرة.

قواعد صارمة:
1. استخدم ONLY الخدمات والجهات المذكورة في الكتالوج أدناه. لا تخترع أي خدمة أو جهة غير موجودة.
2. استخدم قواعد المعرفة المسترجعة كمرجع فقط. لا تختلق أحكامًا غير موجودة فيها.
3. قارن النص القديم بالنص الجديد وحدد البنود التي تغيرت (إضافة/حذف/تعديل).
4. حدد الخدمات المتأثرة بناءً على تطابق الموضوع والكلمات المفتاحية.
5. لكل خدمة متأثرة، حدد ما إذا كانت العلاقة مباشرة (direct) أو محتملة (potential).
6. إذا كان النص الجديد يتعارض مع قاعدة معرفية مسترجعة، أشر إلى التعارض.
7. اكتب الملخص والتعليلات بالعربية الفصحى المبسطة.

الرد يجب أن يكون JSON فقط:
{
  "overallSummary": "ملخص",
  "changedItems": [
    { "clauseNumber": "1", "oldText": "...", "newText": "...", "summary": "...", "changeType": "modified" }
  ],
  "affectedServices": [
    { "id": "معرف الخدمة", "name": "اسم الخدمة", "agencyId": "معرف الجهة", "agencyName": "اسم الجهة", "reason": "سبب", "relationType": "direct|potential" }
  ],
  "affectedAgencies": [
    { "id": "معرف الجهة", "name": "اسم الجهة", "reason": "سبب", "serviceCount": 1 }
  ],
  "conflicts": [
    { "rule": "نص القاعدة", "conflict": "وصف التعارض" }
  ]
}

قواعد المعرفة المسترجعة:
${contextRules}

الجهات المتاحة:
${agenciesText}

الخدمات المتاحة:
${servicesText}

عنوان السياسة: ${title}

النص القديم:
${oldText}

النص الجديد:
${newText}`;

    const messages = [{ role: "user", content: systemPrompt }];

    // Call Groq
    const modelsRes = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });

    let availableModels: string[] = [];
    if (modelsRes.ok) {
      const modelsData = await modelsRes.json();
      availableModels = (modelsData?.data || [])
        .filter((m: { id: string }) => m.id)
        .map((m: { id: string }) => m.id)
        .filter((id: string) => !id.includes("whisper") && !id.includes("guard"));
    }

    const modelsToTry = availableModels.length > 0 ? availableModels : GROQ_MODELS;

    let groqRes: Response | null = null;
    const allErrors: Array<{ model: string; status: number; body: string }> = [];

    for (const model of modelsToTry) {
      groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
          max_tokens: 2048,
          response_format: { type: "json_object" },
        }),
      });
      if (groqRes.ok) break;
      let errBody = "";
      try { errBody = await groqRes.clone().text(); } catch { /* ignore */ }
      allErrors.push({ model, status: groqRes.status, body: errBody.slice(0, 300) });
      if (groqRes.status === 429) break;
    }

    if (!groqRes || !groqRes.ok) {
      const lastErr = allErrors[allErrors.length - 1];
      const status = lastErr?.status || 502;
      if (status === 429) {
        return new Response(
          JSON.stringify({
            error: "QUOTA_EXCEEDED",
            message: "وصلنا إلى حد الاستخدام في Groq API مؤقتًا. يمكن إعادة المحاولة بعد قليل.",
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // Fallback: return detected changes + retrieved rules without LLM
      return new Response(
        JSON.stringify({
          overallSummary: "تم تحليل التحديث. تعذر الاتصال بالمساعد الذكي لتحليل الأثر الكامل، لكن تم اكتشاف التغييرات التالية.",
          changedItems,
          affectedServices: [],
          affectedAgencies: [],
          approvedMatch: false,
          retrievedRules,
          fallback: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const groqData = await groqRes.json();
    const rawText = groqData?.choices?.[0]?.message?.content;

    if (!rawText) {
      return new Response(
        JSON.stringify({
          overallSummary: "تم تحليل التحديث.",
          changedItems,
          affectedServices: [],
          affectedAgencies: [],
          approvedMatch: false,
          retrievedRules,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let parsed: {
      overallSummary: string;
      changedItems: Array<{
        clauseNumber: string; oldText: string; newText: string;
        summary: string; changeType: "modified" | "added" | "removed";
      }>;
      affectedServices: Array<{
        id: string; name: string; agencyId: string; agencyName: string;
        reason: string; relationType?: string;
      }>;
      affectedAgencies: Array<{
        id: string; name: string; reason: string; serviceCount: number;
      }>;
      conflicts?: Array<{ rule: string; conflict: string }>;
    };

    try {
      parsed = JSON.parse(rawText);
    } catch {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          return new Response(
            JSON.stringify({
              overallSummary: "تم تحليل التحديث.",
              changedItems,
              affectedServices: [],
              affectedAgencies: [],
              approvedMatch: false,
              retrievedRules,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } else {
        return new Response(
          JSON.stringify({
            overallSummary: "تم تحليل التحديث.",
            changedItems,
            affectedServices: [],
            affectedAgencies: [],
            approvedMatch: false,
            retrievedRules,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Validate and clean
    const result = {
      overallSummary: parsed.overallSummary || "تم تحليل التحديث.",
      changedItems: Array.isArray(parsed.changedItems) ? parsed.changedItems : changedItems,
      affectedServices: Array.isArray(parsed.affectedServices)
        ? parsed.affectedServices.filter((s) => services.some((svc: { id: string }) => svc.id === s.id))
        : [],
      affectedAgencies: Array.isArray(parsed.affectedAgencies)
        ? parsed.affectedAgencies.filter((a) => agencies.some((ag: { id: string }) => ag.id === a.id))
        : [],
      approvedMatch: false,
      conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
      retrievedRules,
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : "حدث خطأ غير متوقع أثناء التحليل.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
