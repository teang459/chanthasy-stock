-- ====================================================
-- Fix log_plant_event trigger to skip log during cascade
-- delete from auth.users (otherwise the INSERT into movements
-- violates FK because owner_id was already removed in the
-- same transaction).
-- ====================================================

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
