-- Tidy-up only, no behavior change: store_members.status's CHECK constraint
-- (added in 20260920000252) only ever allows 'active', 'invited', or
-- 'removed' -- 'pending' was never a legal value, so this trigger's WHEN
-- clause could never actually match it. Confirmed via that constraint
-- rather than guessed at.
DROP TRIGGER IF EXISTS notify_staff_joined_after_update ON public.store_members;

CREATE TRIGGER notify_staff_joined_after_update
AFTER UPDATE ON public.store_members
FOR EACH ROW
WHEN (OLD.status = 'invited' AND NEW.status = 'active')
EXECUTE FUNCTION public.notify_staff_joined();
