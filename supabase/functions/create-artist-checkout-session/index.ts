import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const artistPriceId = "price_1TXSH3JS0won4bfC1Hq1eMrL";

const customerIdKeys = [
  "stripe_customer_id",
  "stripeCustomerId",
  "stripe_customer",
  "customer_id",
];

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

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

async function stripePost(path: string, body: URLSearchParams, stripeSecretKey: string) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `Stripe ${path} request failed.`);
  }
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey || !artistPriceId) {
      throw new Error("Artist checkout is not configured. Missing Supabase, Stripe, or artist price environment variables.");
    }

    console.log("ARTIST CHECKOUT STARTED");
    console.log("ARTIST CHECKOUT FUNCTION NAME", "create-artist-checkout-session");
    console.log("ARTIST CHECKOUT PRICE ID", artistPriceId);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated." }, 401);

    const userJwt = authHeader.replace(/^Bearer\s+/i, "");
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: `Bearer ${userJwt}` } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser(userJwt);
    if (userError || !userData.user) return json({ error: "Not authenticated." }, 401);

    const body = await req.json().catch(() => ({}));
    const user = userData.user;
    const email = cleanEmail(body.email) || cleanEmail(user.email);
    if (!email) return json({ error: "Artist email is required." }, 400);

    const [{ data: byUser }, { data: byEmail }, { data: artistApplication }, { data: appProfile }] = await Promise.all([
      supabase.from("artist_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("artist_profiles").select("*").ilike("email", email).maybeSingle(),
      supabase.from("artist_applications").select("*").or(`user_id.eq.${user.id},email.ilike.${email}`).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    ]);

    let artistProfile = byUser || byEmail;
    const existingCustomerId = findStripeCustomerId(artistProfile, artistApplication, appProfile, user.user_metadata);
    const customer = existingCustomerId
      ? { id: existingCustomerId }
      : await stripePost("customers", new URLSearchParams({
        email,
        "metadata[user_id]": user.id,
        "metadata[account_type]": "artist",
      }), stripeSecretKey);

    console.log("ARTIST STRIPE CUSTOMER ID", customer.id);

    const updatePayload = {
      stripe_customer_id: customer.id,
      email,
    };

    if (artistProfile?.id) {
      const { data } = await supabase
        .from("artist_profiles")
        .update(updatePayload)
        .eq("id", artistProfile.id)
        .select("*")
        .maybeSingle();
      artistProfile = data || artistProfile;
    } else {
      const { data } = await supabase
        .from("artist_profiles")
        .upsert({
          user_id: user.id,
          ...updatePayload,
        }, { onConflict: "user_id" })
        .select("*")
        .maybeSingle();
      artistProfile = data || artistProfile;
    }

    const origin = req.headers.get("Origin") || supabaseUrl;
    const successUrl = typeof body.success_url === "string" && body.success_url.trim()
      ? body.success_url.trim()
      : origin;
    const cancelUrl = typeof body.cancel_url === "string" && body.cancel_url.trim()
      ? body.cancel_url.trim()
      : origin;

    const session = await stripePost("checkout/sessions", new URLSearchParams({
      mode: "subscription",
      customer: customer.id,
      "line_items[0][price]": artistPriceId,
      "line_items[0][quantity]": "1",
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: "true",
      "metadata[user_id]": user.id,
      "metadata[artist_profile_id]": artistProfile?.id || "",
      "metadata[email]": email,
      "metadata[account_type]": "artist",
      "subscription_data[metadata][user_id]": user.id,
      "subscription_data[metadata][artist_profile_id]": artistProfile?.id || "",
      "subscription_data[metadata][email]": email,
      "subscription_data[metadata][account_type]": "artist",
    }), stripeSecretKey);

    return json({ url: session.url });
  } catch (error) {
    console.error("create-artist-checkout-session error", error);
    return json({ error: error instanceof Error ? error.message : "Artist checkout failed." }, 500);
  }
});
