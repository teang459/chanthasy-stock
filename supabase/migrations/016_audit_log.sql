-- ====================================================
-- B14 — Audit log
--
-- Tamper-resistant trail of who did what when. Captures:
--   * stores         INSERT / UPDATE / DELETE
--   * store_members  INSERT / UPDATE / DELETE
--   * profiles.role  change only (other profile fields are too chatty)
--   * settlements    reopen (via reopen_settlement RPC, see below)
--   * users          create / delete via the admin-manage-users Edge
--                    Function (the function writes its own log entries)
--
-- The table has no direct INSERT/UPDATE/DELETE policies; entries are
-- only created by the SECURITY DEFINER trigger functions. SELECT is
-- scoped to super_admin globally or store_admin of the relevant store.
-- ====================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  store_id    UUID REFERENCES stores(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   UUID,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_actor_idx  ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_store_idx  ON audit_logs(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);

-- ============================================
-- RLS — read-only, scoped, append-only via triggers
-- ============================================
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_select ON audit_logs;
CREATE POLICY audit_select ON audit_logs FOR SELECT
  USING (
    is_super_admin()
    OR (store_id IS NOT NULL AND is_store_admin(store_id))
  );

-- No INSERT/UPDATE/DELETE policies — those are blocked for everyone
-- except SECURITY DEFINER functions which bypass RLS.

-- ============================================
-- log_audit helper (used by triggers and explicit RPCs)
-- ============================================
CREATE OR REPLACE FUNCTION public.log_audit(
  p_action       TEXT,
  p_entity_type  TEXT,
  p_entity_id    UUID,
  p_store_id     UUID,
  p_metadata     JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  v_email TEXT;
BEGIN
  SELECT email::text INTO v_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO audit_logs (actor_id, actor_email, store_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), v_email, p_store_id, p_action, p_entity_type, p_entity_id, p_metadata);
END $func$;

-- ============================================
-- Trigger functions
-- ============================================

-- stores: log every INSERT / UPDATE / DELETE
CREATE OR REPLACE FUNCTION public.audit_stores_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE
  v_action TEXT;
  v_meta   JSONB;
  v_id     UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'store.create'; v_meta := jsonb_build_object('after', to_jsonb(NEW)); v_id := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'store.update'; v_meta := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW)); v_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'store.delete'; v_meta := jsonb_build_object('before', to_jsonb(OLD)); v_id := OLD.id;
  END IF;
  PERFORM log_audit(v_action, 'store', v_id, v_id, v_meta);
  RETURN COALESCE(NEW, OLD);
END $func$;

DROP TRIGGER IF EXISTS stores_audit ON stores;
CREATE TRIGGER stores_audit
  AFTER INSERT OR UPDATE OR DELETE ON stores
  FOR EACH ROW EXECUTE FUNCTION audit_stores_trigger();

-- store_members: log every INSERT / UPDATE / DELETE
CREATE OR REPLACE FUNCTION public.audit_store_members_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE
  v_action TEXT;
  v_meta   JSONB;
  v_id     UUID;
  v_store  UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'member.add';    v_meta := jsonb_build_object('after',  to_jsonb(NEW));
    v_id := NEW.id; v_store := NEW.store_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'member.update'; v_meta := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
    v_id := NEW.id; v_store := NEW.store_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'member.remove'; v_meta := jsonb_build_object('before', to_jsonb(OLD));
    v_id := OLD.id; v_store := OLD.store_id;
  END IF;
  PERFORM log_audit(v_action, 'store_member', v_id, v_store, v_meta);
  RETURN COALESCE(NEW, OLD);
END $func$;

DROP TRIGGER IF EXISTS store_members_audit ON store_members;
CREATE TRIGGER store_members_audit
  AFTER INSERT OR UPDATE OR DELETE ON store_members
  FOR EACH ROW EXECUTE FUNCTION audit_store_members_trigger();

-- profiles: log only when role changes (super_admin ↔ member promotions)
CREATE OR REPLACE FUNCTION public.audit_profile_role_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    PERFORM log_audit(
      'profile.role_change',
      'profile',
      NEW.id,
      NULL,
      jsonb_build_object('before_role', OLD.role, 'after_role', NEW.role,
                          'name', NEW.name)
    );
  END IF;
  RETURN NEW;
END $func$;

DROP TRIGGER IF EXISTS profiles_role_audit ON profiles;
CREATE TRIGGER profiles_role_audit
  AFTER UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION audit_profile_role_trigger();

-- ============================================
-- Update reopen_settlement to also write an audit row
-- ============================================
CREATE OR REPLACE FUNCTION public.reopen_settlement(p_id UUID, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE
  v_store UUID;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden — super admin only' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(TRIM(p_reason), '') = '' THEN
    RAISE EXCEPTION 'reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT store_id INTO v_store FROM daily_settlements WHERE id = p_id;

  UPDATE daily_settlements
     SET status = 'reopened',
         note   = COALESCE(note, '')
                  || E'\n[reopen ' || to_char(NOW() AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI')
                  || ' by ' || COALESCE(auth.uid()::text, 'unknown') || '] ' || p_reason
   WHERE id = p_id;

  PERFORM log_audit(
    'settlement.reopen',
    'settlement',
    p_id,
    v_store,
    jsonb_build_object('reason', p_reason)
  );
END $func$;
GRANT EXECUTE ON FUNCTION public.reopen_settlement(UUID, TEXT) TO authenticated;
