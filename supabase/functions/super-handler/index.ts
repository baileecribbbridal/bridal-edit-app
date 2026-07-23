import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  console.log("SUPER HANDLER START");

  try {
    const body = await req.json().catch(() => ({}));
    const userId = body.user_id;
    const email = body.email;
    const requestType = body.type || body.action || "bride_premium_checkout";
    const accountType = body.account_type || "bride";
    const returnUrl = body.return_url || "https://baileecribbbridal.com";

    // Hard guardrail: this handler is for bride flows ONLY.
    if (accountType !== "bride") {
      console.error("SUPER HANDLER refused: non-bride account_type", { accountType, requestType });
      return new Response(
        JSON.stringify({ error: "super-handler only services bride accounts." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
        }
      );
    }

    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    if (!STRIPE_SECRET_KEY) {
      console.error("STRIPE_SECRET_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "Bride checkout is not configured." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
        }
      );
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const isBillingPortal = requestType === "bride_billing_portal" || requestType === "billing_portal";
    console.log("request action/type:", requestType, "billing_portal:", isBillingPortal);

    if (isBillingPortal) {
      console.log("BRIDE BILLING PORTAL STARTED");
      // Look up the customer by email — bride checkout uses customer_email,
      // so Stripe creates a customer keyed to that email on first checkout.
      if (!email) {
        return new Response(
          JSON.stringify({ error: "Email is required to open the billing portal." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
          }
        );
      }

      const customers = await stripe.customers.list({ email, limit: 1 });
      const customer = customers.data[0];
      if (!customer) {
        console.error("No Stripe customer found for bride email", { email, userId });
        return new Response(
          JSON.stringify({ error: "No Stripe customer found for this account." }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
          }
        );
      }

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customer.id,
        return_url: returnUrl,
      });

      console.log("BRIDE BILLING PORTAL SESSION CREATED", portalSession.id);
      return new Response(
        JSON.stringify({ url: portalSession.url, id: portalSession.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } }
      );
    }

    console.log("BRIDE CHECKOUT STARTED");
    const PRICE_ID = "price_1TW2RAJS0won4bfC9ifilxMS";
    const allowPromotionCodes = true;
    const successUrl = "https://baileecribbbridal.com/success";
    const cancelUrl = "https://baileecribbbridal.com";

    console.log("price ID used:", PRICE_ID);
    console.log("BRIDE CHECKOUT PRICE ID", PRICE_ID);
    console.log("allow_promotion_codes value:", allowPromotionCodes);

    const checkoutMetadata = {
      account_type: "bride",
      user_id: userId,
      type: requestType,
    };

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price: PRICE_ID,
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: email,
      metadata: checkoutMetadata,
      subscription_data: {
        metadata: checkoutMetadata,
      },
    });

    console.log("Stripe session create success");
    console.log("Stripe response:", JSON.stringify(session));
    console.log("session.allow_promotion_codes:", session.allow_promotion_codes);
    if (session.url) {
      console.log("BRIDE PREMIUM CHECKOUT SESSION CREATED");
      console.log("BRIDE PRICE ID USED:", PRICE_ID);
      console.log("ALLOW_PROMO_CODES:", allowPromotionCodes);
      console.log("mode: subscription");
      console.log("CHECKOUT SESSION ID:", session.id);
    }

    return new Response(JSON.stringify({ url: session.url, id: session.id, allow_promotion_codes: session.allow_promotion_codes }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Stripe session create error", error);

    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Bride Premium checkout failed.",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
});
