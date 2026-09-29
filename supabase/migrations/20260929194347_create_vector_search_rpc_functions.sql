/*
# Vector Search RPC Functions for Knowledge Base

## Overview
Creates two PostgreSQL functions that power semantic search over the kb_embeddings table:
1. kb_search — searches all embeddings by cosine similarity
2. kb_search_anchors — searches only anchor-type embeddings, returns case_id

## Functions
- kb_search(query_embedding vector(384), top_k int): returns source_type, source_id, content, score
  Uses pgvector's cosine distance operator (<=>) to find the closest embeddings.
- kb_search_anchors(query_embedding vector(384), anchor_type text, top_k int): returns source_id, content, score, case_id
  Joins with kb_anchors to get the case_id for each anchor.

## Security
- Functions are SECURITY DEFINER so they can access the kb_embeddings table
- They are read-only (SELECT only) and safe to expose
*/

-- General search function
CREATE OR REPLACE FUNCTION kb_search(query_embedding vector(384), top_k int DEFAULT 4)
RETURNS TABLE (
  source_type text,
  source_id text,
  content text,
  score float
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    e.source_type,
    e.source_id,
    e.content,
    1.0 - (e.embedding <=> query_embedding) AS score
  FROM kb_embeddings e
  WHERE e.embedding IS NOT NULL
  ORDER BY e.embedding <=> query_embedding
  LIMIT top_k;
$$;

-- Anchor-specific search (returns case_id)
CREATE OR REPLACE FUNCTION kb_search_anchors(
  query_embedding vector(384),
  anchor_type text,
  top_k int DEFAULT 1
)
RETURNS TABLE (
  source_id text,
  content text,
  score float,
  case_id text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    e.source_id::text,
    e.content,
    1.0 - (e.embedding <=> query_embedding) AS score,
    a.case_id
  FROM kb_embeddings e
  JOIN kb_anchors a ON a.id::text = e.source_id
  WHERE e.embedding IS NOT NULL
    AND e.source_type = anchor_type
  ORDER BY e.embedding <=> query_embedding
  LIMIT top_k;
$$;