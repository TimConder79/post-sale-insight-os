-- Latest explicitly saved user response; never part of immutable source text.
CREATE TABLE conversation_responses (
  conversation_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  response_text text NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (conversation_id, user_id) REFERENCES source_conversations(id, user_id)
);
