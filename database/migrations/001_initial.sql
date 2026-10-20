CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  role text,
  company text,
  linkedin_url text,
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);

CREATE TABLE source_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  source_type text NOT NULL,
  original_text text NOT NULL,
  relevant_comments text,
  source_url text,
  source_date timestamptz,
  author_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  FOREIGN KEY (author_id, user_id) REFERENCES people(id, user_id)
);
COMMENT ON COLUMN source_conversations.original_text IS 'User-supplied source, kept separate from all derived records. Never rewritten by AI.';

CREATE TABLE interaction_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  person_id uuid NOT NULL,
  conversation_id uuid,
  event_type text NOT NULL,
  event_date timestamptz NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (person_id, user_id) REFERENCES people(id, user_id),
  FOREIGN KEY (conversation_id, user_id) REFERENCES source_conversations(id, user_id)
);

CREATE TABLE insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  summary text NOT NULL,
  takeaways text[] NOT NULL DEFAULT '{}',
  notes text,
  favorite boolean NOT NULL DEFAULT false,
  creation_method text NOT NULL CHECK (creation_method IN ('user', 'ai_suggested', 'ai_then_edited')),
  user_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);

CREATE TABLE insight_sources (
  user_id uuid NOT NULL REFERENCES users(id),
  insight_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  PRIMARY KEY (insight_id, conversation_id),
  FOREIGN KEY (insight_id, user_id) REFERENCES insights(id, user_id),
  FOREIGN KEY (conversation_id, user_id) REFERENCES source_conversations(id, user_id)
);

-- Synthesis is an Insight; these edges point from the result to its source insights.
-- No copying or cascading deletion of evidence.
CREATE TABLE insight_lineage (
  user_id uuid NOT NULL REFERENCES users(id),
  insight_id uuid NOT NULL,
  source_insight_id uuid NOT NULL,
  PRIMARY KEY (insight_id, source_insight_id),
  CHECK (insight_id <> source_insight_id),
  FOREIGN KEY (insight_id, user_id) REFERENCES insights(id, user_id),
  FOREIGN KEY (source_insight_id, user_id) REFERENCES insights(id, user_id)
);

CREATE TABLE insight_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  insight_a uuid NOT NULL,
  insight_b uuid NOT NULL,
  relationship_type text NOT NULL CHECK (relationship_type IN ('Supports', 'Extends', 'Contradicts', 'Example of', 'Leads to', 'Related to')),
  direction text,
  creation_method text NOT NULL CHECK (creation_method IN ('user', 'ai_suggested', 'ai_then_edited')),
  user_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (insight_a <> insight_b),
  FOREIGN KEY (insight_a, user_id) REFERENCES insights(id, user_id),
  FOREIGN KEY (insight_b, user_id) REFERENCES insights(id, user_id)
);

CREATE TABLE insight_seeds (
  user_id uuid NOT NULL REFERENCES users(id),
  insight_id uuid NOT NULL,
  seed text NOT NULL CHECK (seed IN ('Visibility', 'Progression', 'Predictability', 'Execution', 'Economics')),
  PRIMARY KEY (insight_id, seed),
  FOREIGN KEY (insight_id, user_id) REFERENCES insights(id, user_id)
);

CREATE TABLE insight_themes (
  user_id uuid NOT NULL REFERENCES users(id),
  insight_id uuid NOT NULL,
  theme text NOT NULL,
  PRIMARY KEY (insight_id, theme),
  FOREIGN KEY (insight_id, user_id) REFERENCES insights(id, user_id)
);

-- Workflow vocabularies remain open text until the respective implementation phase.
CREATE TABLE next_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  action_type text NOT NULL,
  status text NOT NULL,
  person_id uuid,
  insight_id uuid,
  conversation_id uuid,
  due_date date,
  note text,
  creation_method text NOT NULL CHECK (creation_method IN ('user', 'ai_suggested', 'ai_then_edited')),
  user_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (person_id, user_id) REFERENCES people(id, user_id),
  FOREIGN KEY (insight_id, user_id) REFERENCES insights(id, user_id),
  FOREIGN KEY (conversation_id, user_id) REFERENCES source_conversations(id, user_id)
);

CREATE TABLE content_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  content_type text NOT NULL,
  status text NOT NULL,
  seeds text[] NOT NULL DEFAULT '{}',
  angle text,
  draft text,
  creation_method text NOT NULL CHECK (creation_method IN ('user', 'ai_suggested', 'ai_then_edited')),
  user_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  CHECK (seeds <@ ARRAY['Visibility', 'Progression', 'Predictability', 'Execution', 'Economics']::text[])
);

CREATE TABLE content_idea_insights (
  user_id uuid NOT NULL REFERENCES users(id),
  content_idea_id uuid NOT NULL,
  insight_id uuid NOT NULL,
  PRIMARY KEY (content_idea_id, insight_id),
  FOREIGN KEY (content_idea_id, user_id) REFERENCES content_ideas(id, user_id),
  FOREIGN KEY (insight_id, user_id) REFERENCES insights(id, user_id)
);

CREATE TABLE saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  seed text NOT NULL CHECK (seed IN ('Visibility', 'Progression', 'Predictability', 'Execution', 'Economics')),
  query text NOT NULL,
  audience text,
  last_used timestamptz
);

CREATE TABLE weekly_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  week_start date NOT NULL,
  week_end date NOT NULL,
  learning text,
  patterns text,
  content_recommendations text,
  relationship_recommendations text,
  next_week_focus text,
  technical_health text,
  creation_method text NOT NULL CHECK (creation_method IN ('user', 'ai_suggested', 'ai_then_edited')),
  user_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (week_end >= week_start)
);
