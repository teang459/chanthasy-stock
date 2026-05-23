-- ====================================================
-- Fixes for admin create/delete user
--
-- 1. log_plant_event: skip movement log during cascade delete
--    from auth.users (FK to deleted user would fail).
-- 2. handle_new_user: remove insert into non-existent
--    public.subscriptions table that was blocking user creation.
-- ====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $handle$
BEGIN
  INSERT INTO public.profiles (id, name, role, initials)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'staff',
    upper(left(split_part(NEW.email, '@', 1), 2))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$handle$;


CREATE OR REPLACE FUNCTION public.log_plant_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO movements (plant_id, type, qty, note, created_by, owner_id)
    VALUES (NEW.id, 'new', NEW.stock, NEW.name, auth.uid(), NEW.owner_id);
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.owner_id) THEN
      INSERT INTO movements (plant_id, type, qty, note, created_by, owner_id)
      VALUES (NULL, 'delete', OLD.stock, OLD.name, auth.uid(), OLD.owner_id);
    END IF;
    RETURN OLD;

  ELSIF TG_OP = 'UPDATE' AND OLD.name IS DISTINCT FROM NEW.name THEN
    INSERT INTO movements (plant_id, type, qty, note, created_by, owner_id)
    VALUES (NEW.id, 'rename', 0, OLD.name || ' > ' || NEW.name, auth.uid(), NEW.owner_id);
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;
