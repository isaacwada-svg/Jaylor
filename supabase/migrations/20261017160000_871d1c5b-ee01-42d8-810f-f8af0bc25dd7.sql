-- Order approval responses never produced a staff-facing signal: the order
-- detail page's "Awaiting approval" / "Approved" badge comes from a plain
-- useQuery with no realtime subscription and no notification, so a client
-- tapping Approve or Request changes on /a/$token never updated it unless
-- the staff member happened to reload the order page. This closes both
-- gaps the same way payment/order notifications already work
-- (see 20260923045513's notify_payment_received/notify_new_customer_order):
--   1. order_approvals joins the realtime publication, so an open order
--      detail page updates its badge the moment the client responds.
--   2. A notify_order_approval_response trigger drops a row into the
--      existing notifications table (bell icon, visible from any page),
--      so staff who have navigated away still see it.

ALTER PUBLICATION supabase_realtime ADD TABLE public.order_approvals;

CREATE OR REPLACE FUNCTION public.notify_order_approval_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  PERFORM public.create_notification(
    NEW.store_id,
    CASE WHEN NEW.status = 'approved' THEN 'order_approved' ELSE 'order_changes_requested' END,
    CASE
      WHEN NEW.status = 'approved' THEN format('%s order approved by client', v_order.garment_type)
      ELSE format('Client requested changes on %s order', v_order.garment_type)
    END,
    format('/orders/%s', NEW.order_id)
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_order_approval_response() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_order_approval_response_after_update ON public.order_approvals;
CREATE TRIGGER notify_order_approval_response_after_update
AFTER UPDATE ON public.order_approvals
FOR EACH ROW
WHEN (OLD.status = 'pending' AND NEW.status IN ('approved', 'changes_requested'))
EXECUTE FUNCTION public.notify_order_approval_response();

-- Verification -- one row, every object this script is responsible for.
SELECT
  (to_regprocedure('public.notify_order_approval_response()') IS NOT NULL)
    AS notify_order_approval_response_fn,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'notify_order_approval_response_after_update'
      AND tgrelid = 'public.order_approvals'::regclass
  ) AS notify_order_approval_response_trigger,
  EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'order_approvals'
  ) AS order_approvals_in_realtime_publication;
