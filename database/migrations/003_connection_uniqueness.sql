-- Confirmed relationships: symmetric types share an unordered pair;
-- all other types preserve the A -> B orientation. Do not rewrite/delete records.
-- Existing conflicting confirmed relationships cause a safe migration failure for review.
CREATE UNIQUE INDEX insight_connections_equivalent_confirmed
ON insight_connections (
  user_id,
  relationship_type,
  (CASE WHEN relationship_type IN ('Contradicts', 'Related to') THEN LEAST(insight_a, insight_b) ELSE insight_a END),
  (CASE WHEN relationship_type IN ('Contradicts', 'Related to') THEN GREATEST(insight_a, insight_b) ELSE insight_b END)
)
WHERE user_confirmed = true;
