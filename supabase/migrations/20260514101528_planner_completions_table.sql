CREATE TABLE planner_completions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, task_id)
);

CREATE INDEX planner_completions_user_idx ON planner_completions (user_id);

ALTER TABLE planner_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY planner_completions_self_select ON planner_completions FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY planner_completions_self_insert ON planner_completions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY planner_completions_self_delete ON planner_completions FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE planner_completions IS '입시 플래너 task 완료 토글 — 본인 row 만 CRUD.';
