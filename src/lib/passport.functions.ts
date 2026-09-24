import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { templateFields } from "@/lib/measurements";
import type { Tables } from "@/integrations/supabase/types";

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MINUTES = 60;

async function withinRateLimit(bucket: string, token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.rpc("check_rate_limit", {
    p_bucket: bucket,
    p_key: token,
    p_max_count: RATE_LIMIT_MAX,
    p_window_minutes: RATE_LIMIT_WINDOW_MINUTES,
  });
  return data !== false;
}

type PassportRow = Tables<"measurement_passports">;

async function loadPassport(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: passport, error } = await supabaseAdmin
    .from("measurement_passports")
    .select(
      "id, client_id, issuing_store_id, revoked_at, clients(full_name, gender, birthday), stores(name, logo_url, whatsapp_phone)",
    )
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error("Could not load this measurement card");
  return passport as
    | (PassportRow & {
        clients: { full_name: string; gender: string | null; birthday: string | null } | null;
        stores: { name: string; logo_url: string | null; whatsapp_phone: string | null } | null;
      })
    | null;
}

export type PassportView = {
  status: "active" | "revoked";
  clientFirstName: string;
  storeName: string;
  storeLogoUrl: string | null;
  storeWhatsapp: string | null;
  unit: string;
  takenAt: string | null;
  notes: string | null;
  fields: { label: string; value: string }[];
};

const tokenSchema = z.object({ token: z.string().min(20).max(200) });

export const getPassportByToken = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }): Promise<PassportView | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!(await withinRateLimit("passport_view", data.token))) {
      throw new Error("Too many requests. Please try again later.");
    }

    const passport = await loadPassport(data.token);
    if (!passport) return null;

    if (passport.revoked_at) {
      return {
        status: "revoked",
        clientFirstName: passport.clients?.full_name.split(" ")[0] ?? "",
        storeName: passport.stores?.name ?? "",
        storeLogoUrl: passport.stores?.logo_url ?? null,
        storeWhatsapp: passport.stores?.whatsapp_phone ?? null,
        unit: "in",
        takenAt: null,
        notes: null,
        fields: [],
      };
    }

    const { data: latestSet } = await supabaseAdmin
      .from("measurement_sets")
      .select("values, extra_fields, unit, notes, taken_at, template_id")
      .eq("client_id", passport.client_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    let fields: { label: string; value: string }[] = [];
    if (latestSet) {
      const values = (latestSet.values ?? {}) as Record<string, number>;
      const extra = (latestSet.extra_fields ?? {}) as Record<string, number | string>;
      let labelByKey = new Map<string, string>();

      if (latestSet.template_id) {
        const { data: template } = await supabaseAdmin
          .from("measurement_templates")
          .select("*")
          .eq("id", latestSet.template_id)
          .maybeSingle();
        if (template) {
          labelByKey = new Map(templateFields(template).map((f) => [f.key, f.label]));
        }
      }

      fields = [
        ...Object.entries(values).map(([key, value]) => ({
          label: labelByKey.get(key) ?? key,
          value: `${value}${latestSet.unit}`,
        })),
        ...Object.entries(extra).map(([label, value]) => ({ label, value: String(value) })),
      ];
    }

    void supabaseAdmin
      .rpc("log_audit_event", {
        p_store_id: passport.issuing_store_id,
        p_action: "passport_viewed",
        p_entity: "client",
        p_entity_id: passport.client_id,
        p_metadata: {},
      })
      .then(() => {});

    return {
      status: "active",
      clientFirstName: passport.clients?.full_name.split(" ")[0] ?? "",
      storeName: passport.stores?.name ?? "",
      storeLogoUrl: passport.stores?.logo_url ?? null,
      storeWhatsapp: passport.stores?.whatsapp_phone ?? null,
      unit: latestSet?.unit ?? "in",
      takenAt: latestSet?.taken_at ?? null,
      notes: latestSet?.notes ?? null,
      fields,
    };
  });

export const requestPassportUpdate = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }): Promise<{ storeWhatsapp: string | null; storeName: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!(await withinRateLimit("passport_update_request", data.token))) {
      throw new Error("Too many requests. Please try again later.");
    }

    const passport = await loadPassport(data.token);
    if (!passport || passport.revoked_at) {
      throw new Error("This measurement card is no longer available");
    }

    await supabaseAdmin
      .from("measurement_passports")
      .update({ update_requested_at: new Date().toISOString() })
      .eq("id", passport.id);

    await supabaseAdmin.rpc("log_audit_event", {
      p_store_id: passport.issuing_store_id,
      p_action: "passport_update_requested",
      p_entity: "client",
      p_entity_id: passport.client_id,
      p_metadata: {},
    });

    return {
      storeWhatsapp: passport.stores?.whatsapp_phone ?? null,
      storeName: passport.stores?.name ?? "",
    };
  });

const revokeSchema = z.object({
  token: z.string().min(20).max(200),
  phoneLast4: z.string().regex(/^[0-9]{4}$/),
});

export const revokePassportByClient = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => revokeSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!(await withinRateLimit("passport_revoke", data.token))) {
      throw new Error("Too many requests. Please try again later.");
    }

    const passport = await loadPassport(data.token);
    if (!passport) throw new Error("This measurement card was not found");

    // Holding the link isn't enough: the card owner must confirm their phone number.
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("phone, whatsapp_phone")
      .eq("id", passport.client_id)
      .maybeSingle();
    const phones = [client?.phone, client?.whatsapp_phone]
      .filter((p): p is string => !!p)
      .map((p) => p.replace(/\D/g, ""));
    if (!phones.some((p) => p.length >= 4 && p.endsWith(data.phoneLast4))) {
      throw new Error("That phone number doesn't match this measurement card");
    }

    await supabaseAdmin
      .from("measurement_passports")
      .update({ revoked_at: new Date().toISOString(), revoked_by: "client" })
      .eq("id", passport.id);

    await supabaseAdmin.rpc("log_audit_event", {
      p_store_id: passport.issuing_store_id,
      p_action: "passport_revoked_by_client",
      p_entity: "client",
      p_entity_id: passport.client_id,
      p_metadata: {},
    });

    return { ok: true };
  });

const shareSchema = z.object({
  token: z.string().min(20).max(200),
  targetStoreSlug: z
    .string()
    .min(1)
    .max(80)
    .transform((s) => s.trim().toLowerCase()),
});

export const sharePassportWithStore = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => shareSchema.parse(data))
  .handler(
    async ({ data }): Promise<{ ok: true; storeName: string } | { ok: false; reason: string }> => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      if (!(await withinRateLimit("passport_share", data.token))) {
        return { ok: false, reason: "Too many requests. Please try again later." };
      }

      const passport = await loadPassport(data.token);
      if (!passport || passport.revoked_at) {
        return { ok: false, reason: "This measurement card is no longer available" };
      }

      const { data: targetStore } = await supabaseAdmin
        .from("stores_public")
        .select("id, name")
        .eq("slug", data.targetStoreSlug)
        .maybeSingle();
      if (!targetStore?.id || !targetStore.name) {
        return { ok: false, reason: "We couldn't find a Jaylor shop with that link" };
      }
      if (targetStore.id === passport.issuing_store_id) {
        return { ok: false, reason: "This is already your shop's own copy" };
      }

      const { data: existing } = await supabaseAdmin
        .from("measurement_passport_shares")
        .select("id, status")
        .eq("passport_id", passport.id)
        .eq("target_store_id", targetStore.id)
        .maybeSingle();
      if (existing) {
        return {
          ok: false,
          reason:
            existing.status === "pending"
              ? "You've already sent a request to this shop"
              : existing.status === "accepted"
                ? "This shop already has your measurements"
                : "That shop previously declined this request",
        };
      }

      const { data: client } = await supabaseAdmin
        .from("clients")
        .select("full_name, phone, whatsapp_phone")
        .eq("id", passport.client_id)
        .maybeSingle();
      if (!client) return { ok: false, reason: "Client record not found" };

      const { data: latestSet } = await supabaseAdmin
        .from("measurement_sets")
        .select("values, extra_fields, unit, notes, taken_at")
        .eq("client_id", passport.client_id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { error: insertError } = await supabaseAdmin
        .from("measurement_passport_shares")
        .insert({
          passport_id: passport.id,
          target_store_id: targetStore.id,
          full_name: client.full_name,
          phone: client.phone,
          whatsapp_phone: client.whatsapp_phone,
          measurements_snapshot: latestSet?.values ?? {},
          extra_fields_snapshot: latestSet?.extra_fields ?? {},
          unit_snapshot: latestSet?.unit ?? "in",
          notes_snapshot: latestSet?.notes ?? null,
          taken_at_snapshot: latestSet?.taken_at ?? null,
        });
      if (insertError) return { ok: false, reason: "Could not send this request" };

      await supabaseAdmin.rpc("log_audit_event", {
        p_store_id: passport.issuing_store_id,
        p_action: "passport_share_requested",
        p_entity: "client",
        p_entity_id: passport.client_id,
        p_metadata: { target_store_id: targetStore.id },
      });

      return { ok: true, storeName: targetStore.name };
    },
  );
