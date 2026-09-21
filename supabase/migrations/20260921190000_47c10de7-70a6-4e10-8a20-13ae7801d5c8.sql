-- Security fix L8 (Low), leads half only: leads had no rate-limit trigger
-- at all, unlike sew_requests and consultation_requests (both of which
-- already have one). leads has no store_id to bucket by and phone/email
-- are both optional, so this can't be as precise as the store-scoped
-- triggers on those other tables — it rate-limits by whatever identifying
-- value was actually submitted (phone, else email, else name), which stops
-- naive flooding without pretending to be unbeatable by a determined
-- attacker varying every field. Given the Low severity (junk rows, not a
-- data exposure), that's a reasonable bar here.
--
-- The analytics_events half of L8 (forgeable visitor_id/signup_completed)
-- is not changed: per the audit's own recommendation, those figures are
-- treated as indicative rather than authoritative — moving signup_completed
-- to a server-side write would mean hooking auth.users, which is out of
-- proportion for a Low-severity, internal-metrics-only issue.

CREATE OR REPLACE FUNCTION public.enforce_lead_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := COALESCE(NEW.phone, NEW.email, NEW.name);
BEGIN
  IF v_key IS NOT NULL AND NOT COALESCE(
    (SELECT public.check_rate_limit('leads', v_key, 5, 60)), true
  ) THEN
    RAISE EXCEPTION 'Too many submissions. Please try again later.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_rate_limit ON public.leads;
CREATE TRIGGER leads_rate_limit
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_lead_rate_limit();
