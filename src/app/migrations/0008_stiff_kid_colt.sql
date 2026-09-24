CREATE TABLE "eu4_achievement_bests" (
	"achieve_id" integer NOT NULL,
	"playthrough_id" text NOT NULL,
	"save_id" text NOT NULL,
	"score_days" integer NOT NULL,
	"created_on" timestamp (6) with time zone NOT NULL,
	CONSTRAINT "eu4_achievement_bests_achieve_id_playthrough_id_pk" PRIMARY KEY("achieve_id","playthrough_id")
);
--> statement-breakpoint
DROP INDEX "idx_eu4_save_achieve_ids";--> statement-breakpoint
ALTER TABLE "eu4_achievement_bests" ADD CONSTRAINT "eu4_achievement_bests_save_id_eu4_saves_id_fk" FOREIGN KEY ("save_id") REFERENCES "public"."eu4_saves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_eu4_achievement_bests_rank" ON "eu4_achievement_bests" USING btree ("achieve_id","score_days","created_on");--> statement-breakpoint
-- Recompute the best save of each (achievement, playthrough) pair given.
-- A pair that no longer has a qualified save loses its row.
CREATE OR REPLACE FUNCTION eu4_rebuild_achievement_bests(boards integer[], playthroughs text[])
RETURNS void LANGUAGE sql AS $$
  DELETE FROM eu4_achievement_bests b
  USING unnest(boards, playthroughs) AS t(achieve_id, playthrough_id)
  WHERE b.achieve_id = t.achieve_id AND b.playthrough_id = t.playthrough_id;

  INSERT INTO eu4_achievement_bests AS b (achieve_id, playthrough_id, save_id, score_days, created_on)
  SELECT DISTINCT ON (t.achieve_id, t.playthrough_id)
    t.achieve_id, t.playthrough_id, s.id, s.score_days, s.created_on
  FROM (SELECT DISTINCT * FROM unnest(boards, playthroughs) AS t(achieve_id, playthrough_id)) t
  JOIN eu4_saves s ON s.playthrough_id = t.playthrough_id
  WHERE s.achieve_ids @> ARRAY[t.achieve_id]
    AND s.score_days IS NOT NULL
    AND s.leaderboard_qualified
  ORDER BY t.achieve_id, t.playthrough_id, s.score_days, s.created_on, s.id
  ON CONFLICT (achieve_id, playthrough_id) DO UPDATE
    SET save_id = EXCLUDED.save_id,
        score_days = EXCLUDED.score_days,
        created_on = EXCLUDED.created_on
    WHERE (EXCLUDED.score_days, EXCLUDED.created_on, EXCLUDED.save_id)
        < (b.score_days, b.created_on, b.save_id);
$$;
--> statement-breakpoint
-- Rebuild the whole table. A bulk rewrite of eu4_saves, such as the patch
-- rebalance, is faster this way than pair by pair.
CREATE OR REPLACE FUNCTION eu4_rebuild_all_achievement_bests()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM eu4_achievement_bests;
  INSERT INTO eu4_achievement_bests AS b (achieve_id, playthrough_id, save_id, score_days, created_on)
  SELECT DISTINCT ON (a, s.playthrough_id) a, s.playthrough_id, s.id, s.score_days, s.created_on
  FROM eu4_saves s, unnest(s.achieve_ids) AS a
  WHERE s.score_days IS NOT NULL AND s.leaderboard_qualified
  ORDER BY a, s.playthrough_id, s.score_days, s.created_on, s.id
  ON CONFLICT (achieve_id, playthrough_id) DO UPDATE
    SET save_id = EXCLUDED.save_id,
        score_days = EXCLUDED.score_days,
        created_on = EXCLUDED.created_on
    WHERE (EXCLUDED.score_days, EXCLUDED.created_on, EXCLUDED.save_id)
        < (b.score_days, b.created_on, b.save_id);
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION eu4_achievement_bests_on_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO eu4_achievement_bests AS b (achieve_id, playthrough_id, save_id, score_days, created_on)
  SELECT DISTINCT ON (a, r.playthrough_id)
    a, r.playthrough_id, r.id, r.score_days, r.created_on
  FROM new_rows r, unnest(r.achieve_ids) AS a
  WHERE r.score_days IS NOT NULL AND r.leaderboard_qualified
  ORDER BY a, r.playthrough_id, r.score_days, r.created_on, r.id
  ON CONFLICT (achieve_id, playthrough_id) DO UPDATE
    SET save_id = EXCLUDED.save_id,
        score_days = EXCLUDED.score_days,
        created_on = EXCLUDED.created_on
    WHERE (EXCLUDED.score_days, EXCLUDED.created_on, EXCLUDED.save_id)
        < (b.score_days, b.created_on, b.save_id);
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION eu4_achievement_bests_on_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM eu4_rebuild_achievement_bests(array_agg(a), array_agg(r.playthrough_id))
  FROM old_rows r, unnest(r.achieve_ids) AS a;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION eu4_achievement_bests_on_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM new_rows) > 1000 THEN
    PERFORM eu4_rebuild_all_achievement_bests();
  ELSE
    PERFORM eu4_rebuild_achievement_bests(array_agg(a), array_agg(r.playthrough_id))
    FROM (
      SELECT achieve_ids, playthrough_id FROM old_rows
      UNION ALL
      SELECT achieve_ids, playthrough_id FROM new_rows
    ) r, unnest(r.achieve_ids) AS a;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS eu4_achievement_bests_insert ON eu4_saves;
CREATE TRIGGER eu4_achievement_bests_insert AFTER INSERT ON eu4_saves
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION eu4_achievement_bests_on_insert();
--> statement-breakpoint
DROP TRIGGER IF EXISTS eu4_achievement_bests_delete ON eu4_saves;
CREATE TRIGGER eu4_achievement_bests_delete AFTER DELETE ON eu4_saves
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION eu4_achievement_bests_on_delete();
--> statement-breakpoint
DROP TRIGGER IF EXISTS eu4_achievement_bests_update ON eu4_saves;
CREATE TRIGGER eu4_achievement_bests_update AFTER UPDATE ON eu4_saves
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION eu4_achievement_bests_on_update();
--> statement-breakpoint
SELECT eu4_rebuild_all_achievement_bests();
