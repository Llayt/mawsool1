// seed-embeddings edge function
// Generates text embeddings for all knowledge base content and stores them in kb_embeddings.
// Uses Groq's embedding API if available, otherwise falls back to trigram-based text representation
// stored as pgvector for cosine similarity search.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Configuration — mirrors retrieval.py thresholds
const EMBEDDING_DIM = 384;
const MODEL_NAME = "trigram-hash-v1";

// Arabic text normalization — strips diacritics, normalizes alef/ya/ta marbuta
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

// Generate a trigram-hash embedding: creates a fixed-size vector where each dimension
// corresponds to a hash of a character trigram. This captures subword structure
// and works well for Arabic text similarity (handles typos, dialect variation).
function trigramEmbed(text: string, dim: number = EMBEDDING_DIM): number[] {
  const normalized = normalizeArabic(text);
  const vec = new Float32Array(dim);

  // Character trigrams
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

  // Word unigrams and bigrams (captures word-level semantics)
  const words = normalized.split(/\s+/).filter((w) => w.length > 1);
  for (const word of words) {
    let hash = 0;
    for (let j = 0; j < word.length; j++) {
      hash = ((hash << 5) - hash + word.charCodeAt(j)) | 0;
    }
    const idx = Math.abs(hash) % dim;
    vec[idx] += 2; // words weighted higher than trigrams
  }

  // Word bigrams
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = words[i] + " " + words[i + 1];
    let hash = 0;
    for (let j = 0; j < bigram.length; j++) {
      hash = ((hash << 5) - hash + bigram.charCodeAt(j)) | 0;
    }
    const idx = Math.abs(hash) % dim;
    vec[idx] += 1.5;
  }

  // L2 normalize
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) vec[i] /= norm;
  }

  return Array.from(vec);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Collect all knowledge base texts
    const [casesRes, rulesRes, servicesRes, anchorsRes] = await Promise.all([
      supabase.from("kb_cases").select("id, title, description"),
      supabase.from("kb_rules").select("id, case_id, text"),
      supabase.from("kb_services").select("id, case_id, agency_name, service_name, relation"),
      supabase.from("kb_anchors").select("id, case_id, mode, text"),
    ]);

    if (casesRes.error || rulesRes.error || servicesRes.error || anchorsRes.error) {
      throw new Error("Failed to fetch knowledge base content");
    }

    const items: Array<{ source_type: string; source_id: string; content: string }> = [];

    // Case descriptions
    for (const c of casesRes.data || []) {
      items.push({
        source_type: "case",
        source_id: c.id,
        content: `${c.title}: ${c.description}`,
      });
    }

    // Rules
    for (const r of rulesRes.data || []) {
      items.push({
        source_type: "rule",
        source_id: r.id,
        content: r.text,
      });
    }

    // Services
    for (const s of servicesRes.data || []) {
      items.push({
        source_type: "service",
        source_id: s.id,
        content: `${s.agency_name}: ${s.service_name}. ${s.relation || ""}`.trim(),
      });
    }

    // Anchors
    for (const a of anchorsRes.data || []) {
      items.push({
        source_type: a.mode === "gov" ? "anchor_gov" : "anchor_citizen",
        source_id: a.id,
        content: a.text,
      });
    }

    // Clear old embeddings
    await supabase.from("kb_embeddings").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // Generate and store embeddings in batches
    const batchSize = 50;
    let stored = 0;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const rows = batch.map((item) => ({
        source_type: item.source_type,
        source_id: item.source_id,
        content: item.content,
        embedding: trigramEmbed(item.content),
        model_name: MODEL_NAME,
      }));
      const { error } = await supabase.from("kb_embeddings").insert(rows);
      if (error) {
        console.error("Batch insert error:", error.message);
      } else {
        stored += rows.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        stored,
        total: items.length,
        model: MODEL_NAME,
        message: `Generated ${stored} embeddings from ${items.length} knowledge base items`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "SEED_EMBEDDINGS_ERROR",
        message: err instanceof Error ? err.message : "Failed to seed embeddings",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
