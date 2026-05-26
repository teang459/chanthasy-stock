-- ====================================================
-- Fix: handle_new_user trigger inserts role='staff' but the post-Phase-C
-- profiles_role_check only allows ('super_admin','member'). Every new
-- auth.users insert blows up with "Database error creating new user",
-- which surfaces from auth.admin.createUser via the admin-manage-users
-- Edge Function. Realign with the role enum.
-- ====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $handle$
BEGIN
  INSERT INTO public.profiles (id, name, role, initials)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'member',
    upper(left(split_part(NEW.email, '@', 1), 2))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$handle$;

-- ====================================================
-- Fix: audit triggers crash store deletes with FK 23503
--
-- audit_stores_trigger fires AFTER DELETE on stores. At that point the
-- store row is already gone, so its INSERT into audit_logs (store_id =
-- OLD.id) hits foreign_key_violation against audit_logs.store_id →
-- stores(id). Same problem on audit_store_members_trigger when a store
-- delete cascades through store_members.
--
-- Fix: when the referenced store no longer exists at trigger time, log
-- with store_id = NULL. entity_id still holds the original id, and the
-- metadata snapshot has the full row, so no audit information is lost.
-- ====================================================

CREATE OR REPLACE FUNCTION public.audit_stores_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE
  v_action TEXT;
  v_meta   JSONB;
  v_id     UUID;
  v_store  UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'store.create';
    v_meta   := jsonb_build_object('after', to_jsonb(NEW));
    v_id     := NEW.id;
    v_store  := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'store.update';
    v_meta   := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
    v_id     := NEW.id;
    v_store  := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'store.delete';
    v_meta   := jsonb_build_object('before', to_jsonb(OLD));
    v_id     := OLD.id;
    v_store  := NULL;  -- store row is gone by the time AFTER DELETE fires
  END IF;
  PERFORM log_audit(v_action, 'store', v_id, v_store, v_meta);
  RETURN COALESCE(NEW, OLD);
END $func$;

CREATE OR REPLACE FUNCTION public.audit_store_members_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE
  v_action TEXT;
  v_meta   JSONB;
  v_id     UUID;
  v_store  UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'member.add';
    v_meta   := jsonb_build_object('after',  to_jsonb(NEW));
    v_id     := NEW.id;
    v_store  := NEW.store_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'member.update';
    v_meta   := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
    v_id     := NEW.id;
    v_store  := NEW.store_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'member.remove';
    v_meta   := jsonb_build_object('before', to_jsonb(OLD));
    v_id     := OLD.id;
    -- When a store is cascade-deleted the parent row is already gone,
    -- so referencing it would violate the FK. Direct member removal
    -- (store still exists) keeps the store_id.
    IF EXISTS (SELECT 1 FROM stores WHERE id = OLD.store_id) THEN
      v_store := OLD.store_id;
    ELSE
      v_store := NULL;
    END IF;
  END IF;
  PERFORM log_audit(v_action, 'store_member', v_id, v_store, v_meta);
  RETURN COALESCE(NEW, OLD);
END $func$;
