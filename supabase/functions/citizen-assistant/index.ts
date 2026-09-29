// citizen-assistant edge function — Semantic search + approved answers + LLM generation
// Pipeline:
// 1. Normalize query + conversation context
// 2. Semantic search against knowledge base (pgvector)
// 3. Check scope (is question in knowledge base?)
// 4. Match approved cases (anchors_citizen)
// 5. If approved match → return stored approved answer + sources
// 6. If in scope but no approved match → retrieve rules, generate answer from retrieved context only
// 7. If out of scope → ask clarifying question or say we don't have info
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ---- Inline semantic search (same as _shared/semantic.ts, inlined to avoid cross-function imports) ----
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

const RETRIEVAL_TOP_K = 4;
const SIMILARITY_THRESHOLD = 0.15;
const APPROVED_MATCH_THRESHOLD = 0.35;

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
  mode: "citizen" | "gov",
): Promise<{ matched: boolean; caseId: string | null; score: number; anchor: string }> {
  const anchorType = mode === "gov" ? "anchor_gov" : "anchor_citizen";
  const queryEmbed = trigramEmbed(text);
  const { data, error } = await supabase.rpc("kb_search_anchors", {
    query_embedding: queryEmbed,
    anchor_type: anchorType,
    top_k: 1,
  });
  if (error || !data || data.length === 0) {
    return { matched: false, caseId: null, score: 0, anchor: "" };
  }
  const best = data[0] as { source_id: string; content: string; score: number; case_id: string };
  const threshold = mode === "gov" ? 0.40 : APPROVED_MATCH_THRESHOLD;
  return {
    matched: best.score >= threshold,
    caseId: best.case_id || null,
    score: best.score,
    anchor: best.content,
  };
}

// ---- Groq LLM helper ----
const GROQ_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

interface ChatTurn {
  role: string;
  content: string;
}

interface RequestBody {
  message: string;
  history: ChatTurn[];
}

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
            "مفتاح Groq API غير مُعد بعد. لإضافة المفتاح:\n" +
            "1. افتح Supabase Dashboard ← Edge Functions ← Secrets\n" +
            "2. أضف secret باسم GROQ_API_KEY وضع قيمته مفتاحك من Groq Console\n" +
            "3. أعد تحميل هذه الصفحة\n\n" +
            "احصل على مفتاح مجاني من: https://console.groq.com/keys",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body: RequestBody = await req.json();
    const userMessage = body.message?.trim();
    const history = body.history || [];

    if (!userMessage) {
      return new Response(
        JSON.stringify({ error: "EMPTY_MESSAGE", message: "الرسالة فارغة" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Build conversation context from recent history
    const recentHistory = history.slice(-4);
    const contextText = recentHistory.map((h) => h.content).join(" ");
    const fullQuery = contextText ? `${contextText} ${userMessage}` : userMessage;

    // Step 1: Semantic search against knowledge base
    const hits = await semanticSearch(supabase, fullQuery, RETRIEVAL_TOP_K);
    const bestScore = hits.length > 0 ? hits[0].score : 0;
    const inScope = bestScore >= SIMILARITY_THRESHOLD;

    // Step 2: Match approved cases (citizen anchors)
    const approvedMatch = await matchApprovedAnchors(supabase, userMessage, "citizen");

    if (approvedMatch.matched && approvedMatch.caseId) {
      // Return the stored approved answer — not a generated one
      const { data: caseData } = await supabase
        .from("kb_cases")
        .select("*")
        .eq("id", approvedMatch.caseId)
        .maybeSingle();

      if (caseData) {
        // Get services for this case to build step cards
        const { data: caseServices } = await supabase
          .from("kb_services")
          .select("id, agency_name, service_name, relation, relation_type, status_note")
          .eq("case_id", approvedMatch.caseId)
          .order("created_at");

        // Parse the approved citizen answer into structured steps
        const steps = (caseServices || []).map((s: {
          id: string; agency_name: string; service_name: string;
          relation: string | null; relation_type: string; status_note: string | null;
        }) => ({
          serviceId: s.id,
          serviceName: s.service_name,
          agencyName: s.agency_name,
          reason: s.relation || s.status_note || "مرتبطة بطلبك",
          requirements: [] as string[],
          link: null as string | null,
          policyTitle: caseData.title || "",
          policyVersion: caseData.effective_from
            ? `النسخة السارية (${caseData.effective_from})`
            : "النسخة الحالية",
          relationType: s.relation_type,
        }));

        const sources = (caseData.sources && Array.isArray(caseData.sources)) ? caseData.sources : [];

        return new Response(
          JSON.stringify({
            type: "approved",
            reply: caseData.approved_citizen_answer || caseData.approved_change_summary || "",
            steps,
            sources,
            caseTitle: caseData.title,
            matchScore: approvedMatch.score,
            matchedAnchor: approvedMatch.anchor,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Step 3: If out of scope, return a no-match response
    if (!inScope && hits.length === 0) {
      return new Response(
        JSON.stringify({
          type: "no_match",
          reply: "لم أتمكن من العثور على معلومات متعلقة بطلبك في قاعدة المعرفة المتاحة. حاول إعادة صياغة طلبك، أو تواصل مع الجهة المعنية مباشرة.",
          steps: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 4: In scope but no approved match — retrieve rules and generate answer
    const retrievedRules = hits
      .filter((h) => h.source_type === "rule")
      .map((h) => h.content);
    const retrievedServices = hits
      .filter((h) => h.source_type === "service")
      .map((h) => h.content);

    // Also fetch services from the database for structured display
    const { data: allServices } = await supabase
      .from("services")
      .select("id, name, description, agency_id, requirements, link, keywords, policy_id");

    const { data: allAgencies } = await supabase
      .from("agencies")
      .select("id, name");

    const { data: allPolicies } = await supabase
      .from("policies")
      .select("id, title, effective_date, status")
      .eq("status", "published");

    const contextRules = retrievedRules.length > 0
      ? retrievedRules.map((r, i) => `[قاعدة ${i + 1}] ${r}`).join("\n")
      : "لا توجد قواعد مسترجعة محددة.";

    const contextServices = retrievedServices.length > 0
      ? retrievedServices.map((s, i) => `[خدمة ${i + 1}] ${s}`).join("\n")
      : "";

    // Build catalog of services for the LLM to choose from
    const catalogText = (allServices || [])
      .map((s: { id: string; name: string; description: string | null; agency_id: string | null; requirements: string[] | null; link: string | null; keywords: string[] | null; policy_id: string | null }) => {
        const agency = (allAgencies || []).find((a: { id: string; name: string }) => a.id === s.agency_id);
        const policy = (allPolicies || []).find((p: { id: string; title: string; effective_date: string | null }) => p.id === s.policy_id);
        return `[${s.id}] ${s.name}\n   جهة: ${agency?.name || "غير محدد"}\n   وصف: ${s.description || ""}\n   متطلبات: ${(s.requirements || []).join("، ") || "لا توجد"}\n   رابط: ${s.link || "غير متوفر"}\n   سياسة: ${policy?.title || ""}`;
      })
      .join("\n\n");

    const systemPrompt = `أنت مساعد ذكي في منصة حكومية سعودية اسمها «أثر». مهمتك مساعدة المواطنين في معرفة الخدمات والخطوات اللازمة لإنجاز معاملاتهم.

قواعد صارمة:
1. استخدم ONLY المعلومات المسترجعة من قاعدة المعرفة أدناه. لا تخترع أي خدمة أو جهة أو رابط أو شرط غير موجود فيها.
2. إذا كان طلب المواطن واضحًا ويحتوي على معلومات كافية، اختر الخدمات المناسبة من الكتالوج واشرح سبب اختيار كل خدمة.
3. إذا كانت معلومات المواطن ناقصة، اطرح سؤالًا توضيحيًا قصيرًا بدل تخمين الإجابة.
4. إذا لم توجد أي خدمة مطابقة، أخبر المواطن بلطف أن طلبه لا يطابق خدمة في النظام.
5. اكتب بالعربية الفصحى المبسطة (يمكن استخدام لهجة خفيفة مفهومة).
6. لا تختلق روابط. إذا لم يتوفر رابط خدمة موثّق، اذكر أن الرابط يحتاج تحقق.
7. راعِ سياق الأسئلة السابقة في المحادثة. إذا قال المستخدم "طيب كيف أسويه؟" فافهم أنه يشير لما سبق.

الرد يجب أن يكون بصيغة JSON فقط:

إذا كان لديك خدمات مقترحة:
{
  "type": "services",
  "reply": "نص مقدمة قصير",
  "services": [
    { "id": "معرف الخدمة من الكتالوج", "reason": "سبب اقتراح هذه الخدمة" }
  ]
}

إذا كنت تحتاج توضيحًا:
{ "type": "clarify", "reply": "سؤال توضيحي" }

إذا لم توجد خدمات مطابقة:
{ "type": "no_match", "reply": "رسالة لطيفة" }

قواعد المعرفة المسترجعة (أجب منها فقط):
${contextRules}

${contextServices ? `خدمات معرفية مسترجعة:\n${contextServices}` : ""}

كتالوج الخدمات المتاحة:
${catalogText}`;

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    for (const turn of recentHistory) {
      messages.push({
        role: turn.role === "assistant" ? "assistant" : "user",
        content: turn.content,
      });
    }
    messages.push({ role: "user", content: userMessage });

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
          temperature: 0.7,
          max_tokens: 1024,
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
      // Fallback: return retrieved rules as a conservative answer instead of failing
      if (retrievedRules.length > 0) {
        return new Response(
          JSON.stringify({
            type: "services",
            reply: "تعذر الاتصال بالمساعد الذكي حاليًا، لكن وجدت معلومات ذات صلة بطلبك من قاعدة المعرفة:",
            steps: [],
            retrievedRules,
            fallback: true,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          error: "GROQ_API_ERROR",
          message: "تعذر الاتصال بالمساعد الذكي حاليًا. حاول مرة أخرى.",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const groqData = await groqRes.json();
    const rawText = groqData?.choices?.[0]?.message?.content;

    if (!rawText) {
      return new Response(
        JSON.stringify({
          type: "no_match",
          reply: "لم يُرجع المساعد أي رد. حاول مرة أخرى.",
          steps: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Parse structured response
    let parsed: { type: string; reply: string; services?: Array<{ id: string; reason: string }> };
    let parseFailed = false;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          parseFailed = true;
        }
      } else {
        parseFailed = true;
      }
    }

    if (parseFailed || !parsed || !parsed.type || !parsed.reply) {
      return new Response(
        JSON.stringify({
          type: "no_match",
          reply: "تعذر تحليل رد المساعد الذكي. حاول إعادة صياغة طلبك.",
          steps: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build full service step details
    if (parsed.type === "services" && parsed.services && parsed.services.length > 0) {
      const serviceSteps = parsed.services
        .map((s) => {
          const svc = (allServices || []).find((sv: { id: string }) => sv.id === s.id);
          if (!svc) return null;
          const agency = (allAgencies || []).find((a: { id: string; name: string }) => a.id === svc.agency_id);
          const policy = (allPolicies || []).find((p: { id: string; title: string; effective_date: string | null }) => p.id === svc.policy_id);
          return {
            serviceId: svc.id,
            serviceName: svc.name,
            agencyName: agency?.name || "جهة غير محددة",
            reason: s.reason || "مرتبطة بطلبك",
            requirements: svc.requirements || [],
            link: svc.link,
            policyTitle: policy?.title || "",
            policyVersion: policy?.effective_date
              ? `النسخة السارية (${new Date(policy.effective_date).toLocaleDateString("ar-SA")})`
              : "النسخة الحالية",
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);

      return new Response(
        JSON.stringify({
          type: "services",
          reply: parsed.reply,
          steps: serviceSteps,
          retrievedRules,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        type: parsed.type,
        reply: parsed.reply,
        steps: [],
        retrievedRules,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : "حدث خطأ غير متوقع. حاول مرة أخرى.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
