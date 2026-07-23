import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@16.12.0";

const activeStatuses = new Set(["active", "trialing"]);

function cleanEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function response(status = 200) {
  return new Response(JSON.stringify({ received: status < 300 }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function hasArtistProfileForCustomer(
  supabase: ReturnType<typeof createClient>,
  customerId: string,
) {
  if (!customerId) return false;
  const { data, error } = await supabase
    .from("artist_profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) {
    console.error("artist profile lookup by customer failed", error);
    return false;
  }
  return !!data;
}

async function hasArtistProfileForEmail(
  supabase: ReturnType<typeof createClient>,
  email: string,
) {
  const cleaned = cleanEmail(email);
  if (!cleaned) return false;
  const { data, error } = await supabase
    .from("artist_profiles")
    .select("id")
    .ilike("email", cleaned)
    .maybeSingle();
  if (error) {
    console.error("artist profile lookup by email failed", error);
    return false;
  }
  return !!data;
}

async function getStripeCustomerEmail(stripe: Stripe, customerId: string) {
  if (!customerId) return "";
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return "";
  return cleanEmail(customer.email);
}

async function syncArtistSubscription(
  supabase: ReturnType<typeof createClient>,
  stripe: Stripe,
  input: {
    customerId: string;
    subscriptionId?: string | null;
    status?: string | null;
    userId?: string | null;
    artistProfileId?: string | null;
    email?: string | null;
  },
) {
  const email = cleanEmail(input.email);
  let status = input.status || null;
  let subscriptionId = input.subscriptionId || null;

  if ((!status || !subscriptionId) && input.customerId) {
    const subscriptions = await stripe.subscriptions.list({
      customer: input.customerId,
      status: "all",
      limit: 10,
    });
    const subscription = subscriptions.data.find((item) => activeStatuses.has(item.status))
      || subscriptions.data[0];
    status = status || subscription?.status || null;
    subscriptionId = subscriptionId || subscription?.id || null;
  }

  const isActive = status ? activeStatuses.has(status) : false;
  const payload = {
    stripe_customer_id: input.customerId,
    stripe_subscription_id: subscriptionId,
    artist_subscription_status: status,
    tier: isActive ? "premium" : "free",
  };

  if (input.artistProfileId) {
    const { data, error } = await supabase.from("artist_profiles").update(payload).eq("id", input.artistProfileId).select("id");
    if (!error && data && data.length > 0) return;
    console.error("artist profile sync by id failed", error);
  }

  if (input.userId) {
    const { data, error } = await supabase.from("artist_profiles").update(payload).eq("user_id", input.userId).select("id");
    if (!error && data && data.length > 0) return;
    console.error("artist profile sync by user_id failed", error);
  }

  if (email) {
    const { data, error } = await supabase.from("artist_profiles").update(payload).ilike("email", email).select("id");
    if (!error && data && data.length > 0) return;
    console.error("artist profile sync by email failed", error);
  }

  if (input.customerId) {
    const { data, error } = await supabase.from("artist_profiles").update(payload).eq("stripe_customer_id", input.customerId).select("id");
    if (!error && data && data.length > 0) return;
    console.error("artist profile sync by customer failed", error);
  }
}

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_ARTIST_WEBHOOK_SECRET")
      || Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey || !webhookSecret) {
      throw new Error("Artist webhook is not configured.");
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });
    const signature = req.headers.get("stripe-signature");
    if (!signature) return response(400);

    const rawBody = await req.text();
    const event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = String(session.customer || "");
      const email = cleanEmail(session.customer_details?.email) || session.metadata?.email || await getStripeCustomerEmail(stripe, customerId);
      const isArtistSession = session.metadata?.account_type === "artist"
        || await hasArtistProfileForCustomer(supabase, customerId)
        || await hasArtistProfileForEmail(supabase, email);
      if (session.mode === "subscription" && isArtistSession) {
        await syncArtistSubscription(supabase, stripe, {
          customerId,
          subscriptionId: String(session.subscription || ""),
          status: "active",
          userId: session.metadata?.user_id,
          artistProfileId: session.metadata?.artist_profile_id,
          email,
        });
      }
    }

    if (event.type === "customer.subscription.created"
      || event.type === "customer.subscription.updated"
      || event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = String(subscription.customer || "");
      const email = subscription.metadata?.email || await getStripeCustomerEmail(stripe, customerId);
      const isArtistSubscription = subscription.metadata?.account_type === "artist"
        || await hasArtistProfileForCustomer(supabase, customerId)
        || await hasArtistProfileForEmail(supabase, email);
      if (isArtistSubscription) {
        await syncArtistSubscription(supabase, stripe, {
          customerId,
          subscriptionId: subscription.id,
          status: subscription.status,
          userId: subscription.metadata?.user_id,
          artistProfileId: subscription.metadata?.artist_profile_id,
          email,
        });
      }
    }

    return response();
  } catch (error) {
    console.error("stripe-artist-webhook error", error);
    return response(400);
  }
});
