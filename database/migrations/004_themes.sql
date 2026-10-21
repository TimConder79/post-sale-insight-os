-- Durable user-authored subjects. Legacy insight_themes text labels remain untouched.
CREATE TABLE themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200 AND name ~ '[^[:space:]]'),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  creation_method text NOT NULL DEFAULT 'user' CHECK (creation_method = 'user'),
  UNIQUE (user_id, id)
);
CREATE UNIQUE INDEX themes_owner_name ON themes (user_id, lower(btrim(name)));
CREATE TABLE theme_memberships (
  user_id uuid NOT NULL REFERENCES users(id),
  theme_id uuid NOT NULL,
  insight_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (theme_id, insight_id),
  FOREIGN KEY (user_id, theme_id) REFERENCES themes(user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id, insight_id) REFERENCES insights(user_id, id) ON DELETE RESTRICT
);
CREATE INDEX theme_memberships_owner_insight ON theme_memberships(user_id, insight_id);
