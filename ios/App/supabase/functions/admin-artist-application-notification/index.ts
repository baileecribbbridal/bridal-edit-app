import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const adminEmail = "baileecribbhair@gmail.com";
const subject = "New artist application submitted";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ArtistApplicationNotification = {
  business_name?: string | null;
  businessName?: string | null;
  name?: string | null;
  owner_name?: string | null;
  ownerName?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  province_state?: string | null;
  country?: string | null;
  services?: string | string[] | null;
  instagram?: string | null;
  website?: string | null;
  created_at?: string | null;
  timestamp?: string | null;
};

function text(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ");
  }

  return typeof value === "string" && value.trim() ? value.trim() : "Not provided";
}

function buildNotificationPayload(application: ArtistApplicationNotification) {
  const timestamp = text(application.timestamp || application.created_at || new Date().toISOString());
  const state = application.state || application.province_state;

  return {
    to: adminEmail,
    subject,
    businessName: text(application.business_name || application.businessName),
    ownerName: text(application.owner_name || application.ownerName || application.name),
    email: text(application.email),
    location: [application.city, state, application.country]
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean)
      .join(", ") || "Not provided",
    services: text(application.services),
    instagram: text(application.instagram),
    website: text(application.website),
    timestamp,
  };
}

function buildEmailHtml(payload: ReturnType<typeof buildNotificationPayload>) {
  const rows = [
    ["Business name", payload.businessName],
    ["Owner name", payload.ownerName],
    ["Email", payload.email],
    ["Location", payload.location],
    ["Services", payload.services],
    ["Instagram", payload.instagram],
    ["Website", payload.website],
    ["Timestamp", payload.timestamp],
  ];

  return `
    <h2>New artist application submitted</h2>
    <table cellpadding="6" cellspacing="0" style="border-collapse: collapse;">
      ${rows.map(([label, value]) => `
        <tr>
          <td style="font-weight: 700;">${label}</td>
          <td>${value}</td>
        </tr>
      `).join("")}
    </table>
  `;
}

function buildEmailText(payload: ReturnType<typeof buildNotificationPayload>) {
  return [
    subject,
    "",
    `Business name: ${payload.businessName}`,
    `Owner name: ${payload.ownerName}`,
    `Email: ${payload.email}`,
    `Location: ${payload.location}`,
    `Services: ${payload.services}`,
    `Instagram: ${payload.instagram}`,
    `Website: ${payload.website}`,
    `Timestamp: ${payload.timestamp}`,
  ].join("\n");
}

export async function sendAdminArtistApplicationNotification(
  application: ArtistApplicationNotification,
) {
  const payload = buildNotificationPayload(application);
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("ADMIN_NOTIFICATION_FROM_EMAIL") ||
    Deno.env.get("RESEND_FROM_EMAIL");

  if (!resendApiKey || !fromEmail) {
    console.log("ADMIN ARTIST APPLICATION NOTIFICATION PAYLOAD:", payload);
    return { sent: false, logged: true, payload };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [adminEmail],
      subject,
      html: buildEmailHtml(payload),
      text: buildEmailText(payload),
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("ADMIN ARTIST APPLICATION NOTIFICATION EMAIL ERROR:", result);
    return { sent: false, logged: false, payload, error: result };
  }

  console.log("ADMIN ARTIST APPLICATION NOTIFICATION SENT:", result);
  return { sent: true, logged: false, payload, result };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const application = await req.json().catch(() => ({}));
    const result = await sendAdminArtistApplicationNotification(application);

    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ADMIN ARTIST APPLICATION NOTIFICATION ERROR:", error);

    return new Response(JSON.stringify({ ok: true, sent: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
