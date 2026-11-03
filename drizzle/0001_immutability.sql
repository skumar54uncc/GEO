-- Raw answers, provider payloads, frozen prompt sets and the audit log are immutable.
-- These triggers enforce it in the database, independent of application code.

CREATE OR REPLACE FUNCTION geo_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'immutable_violation: % on % is not allowed', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER draws_immutable BEFORE UPDATE OR DELETE ON draws
  FOR EACH ROW EXECUTE FUNCTION geo_reject_mutation();--> statement-breakpoint
CREATE TRIGGER raw_payloads_immutable BEFORE UPDATE OR DELETE ON raw_payloads
  FOR EACH ROW EXECUTE FUNCTION geo_reject_mutation();--> statement-breakpoint
CREATE TRIGGER prompt_set_items_immutable BEFORE UPDATE OR DELETE ON prompt_set_items
  FOR EACH ROW EXECUTE FUNCTION geo_reject_mutation();--> statement-breakpoint
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION geo_reject_mutation();--> statement-breakpoint

-- A prompt set may change only until it is frozen.
CREATE OR REPLACE FUNCTION geo_reject_frozen_prompt_set() RETURNS trigger AS $$
BEGIN
  IF OLD.frozen_at IS NOT NULL THEN
    RAISE EXCEPTION 'immutable_violation: prompt set % is frozen', OLD.id
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER prompt_sets_frozen BEFORE UPDATE OR DELETE ON prompt_sets
  FOR EACH ROW EXECUTE FUNCTION geo_reject_frozen_prompt_set();--> statement-breakpoint

-- No items may be added to a frozen set.
CREATE OR REPLACE FUNCTION geo_reject_item_on_frozen_set() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM prompt_sets WHERE id = NEW.prompt_set_id AND frozen_at IS NOT NULL) THEN
    RAISE EXCEPTION 'immutable_violation: prompt set % is frozen', NEW.prompt_set_id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER prompt_set_items_frozen_insert BEFORE INSERT ON prompt_set_items
  FOR EACH ROW EXECUTE FUNCTION geo_reject_item_on_frozen_set();
