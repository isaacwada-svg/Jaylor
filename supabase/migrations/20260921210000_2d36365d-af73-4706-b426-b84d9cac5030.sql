-- Remote measurement/style intake (task #40): a client sent a "measure
-- link" (guest event page, /e/$token) can now submit a fabric photo and
-- their own measurements, in addition to the style/size/session choices
-- that page already supported. The store owner sees every submission on
-- the event's participant list.

ALTER TABLE public.event_participants
  ADD COLUMN IF NOT EXISTS fabric_photo_path text,
  ADD COLUMN IF NOT EXISTS self_measurements jsonb,
  ADD COLUMN IF NOT EXISTS self_measurements_unit text,
  ADD COLUMN IF NOT EXISTS self_measurements_submitted_at timestamptz;

-- Guest sets/replaces their fabric photo path. The path itself is only
-- ever produced by the uploadFabricPhoto server function, which enforces
-- the storeId-prefixed path — this RPC just trusts an already-validated
-- path the same way set_participant_style trusts an already-validated key.
CREATE OR REPLACE FUNCTION public.set_participant_fabric_photo(p_token uuid, p_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.event_participants
  SET fabric_photo_path = p_path
  WHERE token = p_token;
END;
$$;

REVOKE ALL ON FUNCTION public.set_participant_fabric_photo(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_participant_fabric_photo(uuid, text) TO anon, authenticated;

-- Guest submits their own measurements. Stored directly on the participant
-- row (not measurement_sets) since a group-order participant may not have
-- a clients row at all, and measurement_sets' template/version semantics
-- don't cleanly fit a one-off guest submission — the store owner reviews
-- these from the event page and can copy them into a formal measurement
-- set for the client themselves if they want to keep it.
CREATE OR REPLACE FUNCTION public.set_participant_measurements(p_token uuid, p_values jsonb, p_unit text DEFAULT 'in')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.event_participants
  SET self_measurements = p_values,
      self_measurements_unit = p_unit,
      self_measurements_submitted_at = now()
  WHERE token = p_token;
END;
$$;

REVOKE ALL ON FUNCTION public.set_participant_measurements(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_participant_measurements(uuid, jsonb, text) TO anon, authenticated;
