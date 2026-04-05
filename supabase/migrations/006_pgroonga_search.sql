CREATE EXTENSION IF NOT EXISTS pgroonga;

CREATE INDEX idx_chunks_content_pgroonga ON document_chunks USING pgroonga(content);
