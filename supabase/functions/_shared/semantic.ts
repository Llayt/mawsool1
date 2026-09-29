// Shared semantic search utilities for edge functions.
// Implements the equivalent of retrieval.py's functions:
// - build_corpus (from kb_embeddings table)
// - embed (trigram-hash embedding)
// - search (cosine similarity via pgvector)
// - check_scope (is query in knowledge base scope?)
// - retrieved_rules (extract rule texts from search hits)
// - match_approved (match against anchor sentences)

import { createClient } from "npm:@supabase/supabase-js@2";

const EMBEDDING_DIM = 384;

// Arabic text normalization — same as in seed-embeddings
export function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u0652]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Trigram-hash embedding — same algorithm as seed-embeddings
export function trigramEmbed(text: string, dim: number = EMBEDDING_DIM): number[] {
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

// Configuration — mirrors retrieval.py
export const RETRIEVAL_TOP_K = 4;
export const SIMILARITY_THRESHOLD = 0.80;
export const SIMILARITY_THRESHOLD_GOV = 0.80;
export const APPROVED_MATCH_THRESHOLD = 0.90;
export const APPROVED_MATCH_THRESHOLD_GOV = 0.80;

export interface SearchHit {
  source_type: string;
  source_id: string;
  content: string;
  score: number;
}

// Search the knowledge base using pgvector cosine similarity
export async function search(
  supabase: ReturnType<typeof createClient>,
  query: string,
  topK: number = RETRIEVAL_TOP_K,
): Promise<SearchHit[]> {
  const queryEmbed = trigramEmbed(query);
  const { data, error } = await supabase.rpc("kb_search", {
    query_embedding: queryEmbed,
    top_k: topK,
  });

  if (error || !data) return [];
  return data as SearchHit[];
}

// Check if query is within knowledge base scope
export interface ScopeResult {
  inScope: boolean;
  bestScore: number;
  hits: SearchHit[];
  threshold: number;
}

export async function checkScope(
  supabase: ReturnType<typeof createClient>,
  query: string,
  mode: "citizen" | "gov" = "citizen",
): Promise<ScopeResult> {
  const threshold = mode === "gov" ? SIMILARITY_THRESHOLD_GOV : SIMILARITY_THRESHOLD;
  const hits = await search(supabase, query, RETRIEVAL_TOP_K);
  const bestScore = hits.length > 0 ? hits[0].score : 0;
  return { inScope: bestScore >= threshold, bestScore, hits, threshold };
}

// Extract rule texts from search hits
export function retrievedRules(hits: SearchHit[]): string[] {
  return hits.filter((h) => h.source_type === "rule").map((h) => h.content);
}

// Match against approved case anchors
export interface ApprovedMatchResult {
  matched: boolean;
  caseId: string | null;
  caseData: Record<string, unknown> | null;
  score: number;
  anchor: string;
  threshold: number;
}

export async function matchApproved(
  supabase: ReturnType<typeof createClient>,
  text: string,
  mode: "citizen" | "gov" = "gov",
): Promise<ApprovedMatchResult> {
  const threshold = mode === "gov" ? APPROVED_MATCH_THRESHOLD_GOV : APPROVED_MATCH_THRESHOLD;
  const anchorType = mode === "gov" ? "anchor_gov" : "anchor_citizen";
  const queryEmbed = trigramEmbed(text);

  const { data, error } = await supabase.rpc("kb_search_anchors", {
    query_embedding: queryEmbed,
    anchor_type: anchorType,
  top_k: 1,
  });

  if (error || !data || data.length === 0) {
    return { matched: false, caseId: null, caseData: null, score: 0, anchor: "", threshold };
  }

  const best = data[0] as { source_id: string; content: string; score: number; case_id: string };
  const matched = best.score >= threshold;

  let caseData: Record<string, unknown> | null = null;
  if (matched && best.case_id) {
    const { data: caseRow } = await supabase
      .from("kb_cases")
      .select("*")
      .eq("id", best.case_id)
      .maybeSingle();
    caseData = caseRow;
  }

  return {
    matched,
    caseId: best.case_id || null,
    caseData,
    score: best.score,
    anchor: best.content,
    threshold,
  };
}

// Get all rules for a case
export async function getCaseRules(
  supabase: ReturnType<typeof createClient>,
  caseId: string,
): Promise<Array<{ id: string; text: string; source_label: string | null; source_url: string | null }>> {
  const { data, error } = await supabase
    .from("kb_rules")
    .select("id, text, source_label, source_url")
    .eq("case_id", caseId)
    .order("created_at");
  if (error || !data) return [];
  return data;
}

// Get all services for a case
export async function getCaseServices(
  supabase: ReturnType<typeof createClient>,
  caseId: string,
): Promise<Array<{
  id: string;
  agency_name: string;
  service_name: string;
  relation: string | null;
  relation_type: string;
  status_note: string | null;
}>> {
  const { data, error } = await supabase
    .from("kb_services")
    .select("id, agency_name, service_name, relation, relation_type, status_note")
    .eq("case_id", caseId)
    .order("created_at");
  if (error || !data) return [];
  return data;
}

// Get case sources
export interface CaseSource {
  label: string;
  url: string;
}

export function getCaseSources(caseData: Record<string, unknown> | null): CaseSource[] {
  if (!caseData) return [];
  const sources = caseData.sources as unknown;
  if (!Array.isArray(sources)) return [];
  return sources as CaseSource[];
}
