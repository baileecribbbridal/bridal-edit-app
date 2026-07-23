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

async function findStripeCustomerIdByEmail(email: string, stripeSecretKey: string) {
  if (!email) return null;

  const searchResponse = await fetch(
    `https://api.stripe.com/v1/customers/search?${new URLSearchParams({ query: `email:'${email.replace(/'/g, "\\'")}'`, limit: "1" })}`,
    {
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
      },
    },
  );
  const searchJson = await searchResponse.json();
  const searchCustomerId = searchJson?.data?.[0]?.id;
  if (typeof searchCustomerId === "string" && searchCustomerId.trim()) {
    return searchCustomerId.trim();
  }

  const listResponse = await fetch(
    `https://api.stripe.com/v1/customers?${new URLSearchParams({ email, limit: "1" })}`,
    {
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
      },
    },
  );
  const listJson = await listResponse.json();
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

    if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey) {
      throw new Error("Billing portal is not configured. Missing Supabase or Stripe environment variables.");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userJwt = authHeader.replace(/^Bearer\s+/i, "");

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: `Bearer ${userJwt}` } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser(userJwt);

    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Not authenticated." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const user = userData.user;
    const email = cleanEmail(body.email) || cleanEmail(user.email);
    const [{ data: artistProfileByUser }, { data: artistProfileByEmail }, { data: artistApplication }, { data: appProfile }] = await Promise.all([
      supabase.from("artist_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      email
        ? supabase.from("artist_profiles").select("*").ilike("email", email).maybeSingle()
        : Promise.resolve({ data: null }),
      email
        ? supabase.from("artist_applications").select("*").or(`user_id.eq.${user.id},email.ilike.${email}`).order("created_at", { ascending: false }).limit(1).maybeSingle()
        : supabase.from("artist_applications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    ]);

    const artistProfile = artistProfileByUser || artistProfileByEmail;
    const customerId = findStripeCustomerId(artistProfile, artistApplication, appProfile, user.user_metadata)
      || await findStripeCustomerIdByEmail(email, stripeSecretKey);

    if (!customerId) {
      return new Response(JSON.stringify({ error: "No Stripe customer ID exists for this artist." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("ARTIST STRIPE CUSTOMER ID", customerId);

    if (artistProfile?.id && artistProfile.stripe_customer_id !== customerId) {
      await supabase.from("artist_profiles").update({ stripe_customer_id: customerId }).eq("id", artistProfile.id);
    }

    const origin = req.headers.get("Origin") || supabaseUrl;
    const returnUrl = typeof body.return_url === "string" && body.return_url.trim()
      ? body.return_url.trim()
      : origin;

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

    if (!stripeResponse.ok) {
      const message = stripeJson?.error?.message || "Could not create Stripe billing portal session.";
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: stripeJson.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("create-artist-billing-portal-session error", error);

    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Billing portal failed." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
