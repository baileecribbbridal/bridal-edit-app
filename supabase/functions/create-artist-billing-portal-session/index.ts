import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const customerIdKeys = [
  "stripe_customer_id",
  "stripeCustomerId",
  "stripe_customer",
  "customer_id",
];

function findStripeCustomerId(...records: Array<Record<string, unknown> | null | undefined>) {
  for (const record of records) {
    if (!record) continue;
    for (const key of customerIdKeys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }

  return null;
}

function cleanEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function findStripeCustomerIdByEmail(email: string, stripeSecretKey: string) {
  if (!email) {
    console.log("[portal] email fallback skipped — no email");
    return null;
  }

  console.log("[portal] email fallback: customers/search for", email);
  const searchResponse = await fetch(
    `https://api.stripe.com/v1/customers/search?${new URLSearchParams({ query: `email:'${email.replace(/'/g, "\\'")}'`, limit: "1" })}`,
    {
      headers: { Authorization: `Bearer ${stripeSecretKey}` },
    },
  );
  const searchJson = await searchResponse.json();
  console.log("[portal] customers/search status", searchResponse.status, "hits", searchJson?.data?.length ?? 0);
  const searchCustomerId = searchJson?.data?.[0]?.id;
  if (typeof searchCustomerId === "string" && searchCustomerId.trim()) {
    return searchCustomerId.trim();
  }

  console.log("[portal] email fallback: customers/list for", email);
  const listResponse = await fetch(
    `https://api.stripe.com/v1/customers?${new URLSearchParams({ email, limit: "1" })}`,
    {
      headers: { Authorization: `Bearer ${stripeSecretKey}` },
    },
  );
  const listJson = await listResponse.json();
  console.log("[portal] customers/list status", listResponse.status, "hits", listJson?.data?.length ?? 0);
  const listCustomerId = listJson?.data?.[0]?.id;
  return typeof listCustomerId === "string" && listCustomerId.trim() ? listCustomerId.trim() : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    console.log("[portal] env present", {
      SUPABASE_URL: !!supabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: !!serviceRoleKey,
      STRIPE_SECRET_KEY: !!stripeSecretKey,
    });

    if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey) {
      return jsonResponse(500, {
        code: "MISSING_ENV",
        error: "Billing portal is not configured. Missing Supabase or Stripe environment variables.",
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.log("[portal] missing Authorization header");
      return jsonResponse(401, { code: "NO_AUTH_HEADER", error: "Not authenticated." });
    }

    const userJwt = authHeader.replace(/^Bearer\s+/i, "");

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: `Bearer ${userJwt}` } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser(userJwt);

    if (userError || !userData.user) {
      console.log("[portal] getUser failed", userError?.message);
      return jsonResponse(401, {
        code: "INVALID_JWT",
        error: "Not authenticated.",
        detail: userError?.message ?? null,
      });
    }

    const body = await req.json().catch(() => ({}));
    const user = userData.user;
    const email = cleanEmail(body.email) || cleanEmail(user.email);

    console.log("[portal] authenticated user", { id: user.id, email });
    console.log("[portal] request body keys", Object.keys(body || {}));

    const [
      { data: artistProfileByUser, error: artistByUserError },
      { data: artistProfileByEmail, error: artistByEmailError },
      { data: artistApplication, error: artistAppError },
      { data: appProfile, error: appProfileError },
    ] = await Promise.all([
      supabase.from("artist_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      email
        ? supabase.from("artist_profiles").select("*").ilike("email", email).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      email
        ? supabase.from("artist_applications").select("*").or(`user_id.eq.${user.id},email.ilike.${email}`).order("created_at", { ascending: false }).limit(1).maybeSingle()
        : supabase.from("artist_applications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    ]);

    if (artistByUserError) console.log("[portal] artist_profiles(by user_id) error", artistByUserError.message);
    if (artistByEmailError) console.log("[portal] artist_profiles(by email) error", artistByEmailError.message);
    if (artistAppError) console.log("[portal] artist_applications error", artistAppError.message);
    if (appProfileError) console.log("[portal] profiles error", appProfileError.message);

    const artistProfile = artistProfileByUser || artistProfileByEmail;

    console.log("[portal] artist_profiles found", {
      byUserId: !!artistProfileByUser,
      byEmail: !!artistProfileByEmail,
      id: artistProfile?.id ?? null,
      tier: artistProfile?.tier ?? null,
      artist_subscription_status: artistProfile?.artist_subscription_status ?? null,
      stripe_customer_id: artistProfile?.stripe_customer_id ?? null,
      stripe_subscription_id: artistProfile?.stripe_subscription_id ?? null,
    });
    console.log("[portal] artist_applications found", {
      present: !!artistApplication,
      stripe_customer_id: artistApplication?.stripe_customer_id ?? null,
    });
    console.log("[portal] profiles found", {
      present: !!appProfile,
      stripe_customer_id: appProfile?.stripe_customer_id ?? null,
    });

    const customerIdFromRecords = findStripeCustomerId(
      artistProfile,
      artistApplication,
      appProfile,
      user.user_metadata,
    );
    console.log("[portal] customer id from records", customerIdFromRecords);

    let customerIdSource: "records" | "stripe_email_fallback" | null = customerIdFromRecords ? "records" : null;
    let customerId = customerIdFromRecords;
    if (!customerId) {
      customerId = await findStripeCustomerIdByEmail(email, stripeSecretKey);
      if (customerId) customerIdSource = "stripe_email_fallback";
    }

    console.log("[portal] resolved customer id", { customerId, source: customerIdSource });

    if (!customerId) {
      return jsonResponse(400, {
        code: "NO_CUSTOMER_ID",
        error: "No Stripe customer ID exists for this artist.",
        user_id: user.id,
        email: email || null,
        artist_profile_found: !!artistProfile,
        artist_tier: artistProfile?.tier ?? null,
      });
    }

    if (artistProfile?.id && artistProfile.stripe_customer_id !== customerId) {
      console.log("[portal] backfilling artist_profiles.stripe_customer_id", {
        artist_profile_id: artistProfile.id,
        old: artistProfile.stripe_customer_id ?? null,
        new: customerId,
      });
      const { error: updateError } = await supabase
        .from("artist_profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", artistProfile.id);
      if (updateError) console.log("[portal] backfill error", updateError.message);
    }

    const origin = req.headers.get("Origin") || supabaseUrl;
    const returnUrl = typeof body.return_url === "string" && body.return_url.trim()
      ? body.return_url.trim()
      : origin;
    console.log("[portal] creating Stripe billing portal session", { customerId, returnUrl });

    const stripeResponse = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        customer: customerId,
        return_url: returnUrl,
      }),
    });

    const stripeJson = await stripeResponse.json();
    console.log("[portal] Stripe billing_portal response", {
      status: stripeResponse.status,
      ok: stripeResponse.ok,
      stripe_error_type: stripeJson?.error?.type ?? null,
      stripe_error_code: stripeJson?.error?.code ?? null,
    });

    if (!stripeResponse.ok) {
      const message = stripeJson?.error?.message || "Could not create Stripe billing portal session.";
      return jsonResponse(400, {
        code: "STRIPE_API_ERROR",
        error: message,
        stripe_status: stripeResponse.status,
        stripe_error_type: stripeJson?.error?.type ?? null,
        stripe_error_code: stripeJson?.error?.code ?? null,
        customer_id: customerId,
      });
    }

    return jsonResponse(200, { url: stripeJson.url });
  } catch (error) {
    console.error("[portal] uncaught error", error);
    return jsonResponse(500, {
      code: "INTERNAL_ERROR",
      error: error instanceof Error ? error.message : "Billing portal failed.",
    });
  }
});
