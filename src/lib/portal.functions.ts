import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { normalisePhone, phoneVariants, PORTAL_KEYWORD } from "@/lib/portal-phone";

const SHOP_WHATSAPP = "2349028101389";

export type PortalStart = {
  status: "sent" | "needs_message";
  phone: string;
  whatsappLink?: string;
};

export type PortalOrder = {
  id: string;
  number: string;
  garment: string;
  status: string;
  price: number;
  paid: number;
  balance: number;
  deliveryDate: string | null;
  storeName: string;
};

export type PortalMeasureRequest = {
  id: string;
  eventLabel: string;
  status: string;
  measurementChoice: string | null;
  submitted: boolean;
  storeName: string;
  token: string;
};

export type PortalShop = {
  id: string;
  name: string;
  handle: string | null;
  city: string | null;
  area: string | null;
  phone: string | null;
};

export type PortalData = {
  phone: string;
  name: string | null;
  orders: PortalOrder[];
  measureRequests: PortalMeasureRequest[];
  shops: PortalShop[];
};

/** Step 1 — ask for a sign-in code on WhatsApp. */
export const startPortalLogin = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string }) => z.object({ phone: z.string().min(6) }).parse(input))
  .handler(async ({ data }): Promise<PortalStart> => {
    const phone = normalisePhone(data.phone);
    if (!phone) throw new Error("Please enter a valid phone number");

    const { hasOpenWindow, issueLoginCode } = await import("@/lib/portal-login.server");

    const waLink = `https://wa.me/${SHOP_WHATSAPP}?text=${encodeURIComponent(PORTAL_KEYWORD)}`;

    if (!(await hasOpenWindow(phone))) {
      return { status: "needs_message", phone, whatsappLink: waLink };
    }

    const sent = await issueLoginCode(phone);
    if (!sent.ok) {
      return { status: "needs_message", phone, whatsappLink: waLink };
    }
    return { status: "sent", phone };
  });

/** Step 2 — check the code and open a portal session. */
export const verifyPortalCode = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string; code: string }) =>
    z.object({ phone: z.string().min(6), code: z.string().min(4).max(8) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ token: string }> => {
    const phone = normalisePhone(data.phone);
    if (!phone) throw new Error("Please enter a valid phone number");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashCode } = await import("@/lib/portal-login.server");

    const { data: row } = await supabaseAdmin
      .from("portal_login_codes")
      .select("id, code_hash, expires_at, attempts, consumed_at")
      .eq("phone", phone)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row) throw new Error("Ask for a new code — this one is no longer valid");
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new Error("That code has expired. Ask for a new one.");
    }
    if (row.attempts >= 5) throw new Error("Too many wrong tries. Ask for a new code.");

    const expected = await hashCode(phone, data.code.trim());
    if (expected !== row.code_hash) {
      await supabaseAdmin
        .from("portal_login_codes")
        .update({ attempts: row.attempts + 1 })
        .eq("id", row.id);
      throw new Error("That code is not correct");
    }

    await supabaseAdmin
      .from("portal_login_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", row.id);

    const { data: session, error } = await supabaseAdmin
      .from("portal_sessions")
      .insert({ phone })
      .select("token")
      .single();
    if (error || !session) throw new Error("Could not sign you in. Please try again.");
    return { token: session.token };
  });

async function resolveSession(token: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("portal_sessions")
    .select("token, phone, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!data || new Date(data.expires_at).getTime() < Date.now()) {
    throw new Error("Your session has expired. Please sign in again.");
  }
  await supabaseAdmin
    .from("portal_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("token", token);
  return data.phone;
}

/** Everything the signed-in customer can see. */
export const getPortalData = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => z.object({ token: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<PortalData> => {
    const phone = await resolveSession(data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const variants = phoneVariants(phone);

    const { data: clients } = await supabaseAdmin
      .from("clients")
      .select("id, full_name, store_id")
      .or(variants.map((v) => `phone.eq.${v},whatsapp_phone.eq.${v}`).join(","));

    const clientIds = (clients ?? []).map((c) => c.id);
    const storeIds = new Set((clients ?? []).map((c) => c.store_id));

    const { data: participants } = await supabaseAdmin
      .from("event_participants")
      .select(
        "id, token, status, measurement_choice, self_measurements_submitted_at, store_id, events(name)",
      )
      .in("phone", variants);
    for (const participant of participants ?? []) storeIds.add(participant.store_id);

    const { data: stores } = storeIds.size
      ? await supabaseAdmin
          .from("stores")
          .select("id, name, slug, city, area, whatsapp_phone")
          .in("id", [...storeIds])
      : { data: [] };

    const storeName = new Map((stores ?? []).map((s) => [s.id, s.name]));

    let orders: PortalOrder[] = [];
    if (clientIds.length) {
      const { data: orderRows } = await supabaseAdmin
        .from("orders")
        .select("id, number, garment_type, status, price, delivery_date, store_id")
        .in("client_id", clientIds)
        .order("created_at", { ascending: false })
        .limit(50);

      const orderIds = (orderRows ?? []).map((o) => o.id);
      const { data: payments } = orderIds.length
        ? await supabaseAdmin
            .from("payments")
            .select("order_id, amount, voided")
            .in("order_id", orderIds)
        : { data: [] };

      const paidByOrder = new Map<string, number>();
      for (const payment of payments ?? []) {
        if (payment.voided) continue;
        paidByOrder.set(
          payment.order_id,
          (paidByOrder.get(payment.order_id) ?? 0) + Number(payment.amount ?? 0),
        );
      }

      orders = (orderRows ?? []).map((order) => {
        const paid = paidByOrder.get(order.id) ?? 0;
        return {
          id: order.id,
          number: order.number,
          garment: order.garment_type,
          status: order.status,
          price: Number(order.price ?? 0),
          paid,
          balance: Math.max(0, Number(order.price ?? 0) - paid),
          deliveryDate: order.delivery_date,
          storeName: storeName.get(order.store_id) ?? "Your tailor",
        };
      });
    }

    const measureRequests: PortalMeasureRequest[] = (participants ?? []).map((participant) => ({
      id: participant.id,
      eventLabel:
        (participant.events as { name?: string } | null)?.name ?? "Measurement request",
      status: participant.status,
      measurementChoice: participant.measurement_choice,
      submitted: Boolean(participant.self_measurements_submitted_at),
      storeName: storeName.get(participant.store_id) ?? "Your tailor",
      token: participant.token,
    }));

    return {
      phone,
      name: clients?.[0]?.full_name ?? null,
      orders,
      measureRequests,
      shops: (stores ?? []).map((store) => ({
        id: store.id,
        name: store.name,
        handle: store.slug,
        city: store.city,
        area: store.area,
        phone: store.whatsapp_phone ?? null,
      })),
    };
  });

/** Sign out of the portal. */
export const endPortalSession = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => z.object({ token: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Only a live session can sign itself out; unknown or expired tokens are a no-op.
    const { data: session } = await supabaseAdmin
      .from("portal_sessions")
      .select("token, expires_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!session || new Date(session.expires_at).getTime() < Date.now()) return { ok: true };
    await supabaseAdmin.from("portal_sessions").delete().eq("token", session.token);
    return { ok: true };
  });
