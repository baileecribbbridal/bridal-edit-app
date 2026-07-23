import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Sends an email to the admin when a new artist application is submitted.
// Invoked by the public.on_artist_application_inserted() trigger via pg_net.
// Body shape (all optional but normally present):
//   { application_id, name, business_name, email, city, country,
//     province_state, services, instagram, submitted_at }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "baileecribbhair@gmail.com";
const FROM_EMAIL = Deno.env.get("ADMIN_NOTIFICATION_FROM") ?? "The Bridal Edit <notifications@baileecribbbridal.com>";
const ADMIN_REVIEW_URL = Deno.env.get("ADMIN_REVIEW_URL") ?? "https://baileecribbbridal.com/?admin=artist";

function esc(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatServices(value: unknown): string {
  if (Array.isArray(value)) return esc(value.filter(Boolean).join(", "));
  return esc(value);
}

function formatLocation(city: unknown, region: unknown, country: unknown): string {
  return [city, region, country]
    .map((v) => (v == null ? "" : String(v).trim()))
    .filter(Boolean)
    .join(", ") || "—";
}

function formatInstagram(handle: unknown): string {
  const raw = (handle == null ? "" : String(handle)).trim();
  if (!raw) return "—";
  const clean = raw.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/$/, "");
  if (!clean) return esc(raw);
  return `<a href="https://instagram.com/${esc(clean)}">@${esc(clean)}</a>`;
}

function formatSubmittedAt(value: unknown): string {
  if (!value) return new Date().toUTCString();
  try {
    return new Date(String(value)).toUTCString();
  } catch {
    return esc(value);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  console.log("NOTIFY ADMIN ARTIST APPLICATION START");

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "Email is not configured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      application_id,
      name,
      business_name,
      email,
      city,
      country,
      province_state,
      services,
      instagram,
      submitted_at,
    } = body ?? {};

    const applicantLabel = (typeof business_name === "string" && business_name.trim())
      || (typeof name === "string" && name.trim())
      || "An artist";

    const reviewUrl = application_id
      ? `${ADMIN_REVIEW_URL}${ADMIN_REVIEW_URL.includes("?") ? "&" : "?"}application_id=${encodeURIComponent(String(application_id))}`
      : ADMIN_REVIEW_URL;

    const subject = `New artist application — ${applicantLabel}`;

    const html = `
      <div style="font-family:Georgia,serif;color:#1F1F1F;max-width:560px;margin:0 auto;padding:24px;">
        <p style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#797979;margin:0 0 8px;">The Bridal Edit · Admin</p>
        <h1 style="font-family:Georgia,serif;font-size:22px;font-weight:400;letter-spacing:0.06em;margin:0 0 12px;">New artist application</h1>
        <p style="font-size:14px;line-height:1.6;margin:0 0 20px;"><strong>${esc(applicantLabel)}</strong> just applied to be listed on The Bridal Edit.</p>

        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;">
          <tbody>
            <tr><td style="padding:6px 8px;color:#797979;width:140px;">Name</td><td style="padding:6px 8px;">${esc(name)}</td></tr>
            <tr><td style="padding:6px 8px;color:#797979;">Business name</td><td style="padding:6px 8px;">${esc(business_name)}</td></tr>
            <tr><td style="padding:6px 8px;color:#797979;">Email</td><td style="padding:6px 8px;"><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
            <tr><td style="padding:6px 8px;color:#797979;">Location</td><td style="padding:6px 8px;">${esc(formatLocation(city, province_state, country))}</td></tr>
            <tr><td style="padding:6px 8px;color:#797979;">Services</td><td style="padding:6px 8px;">${formatServices(services)}</td></tr>
            <tr><td style="padding:6px 8px;color:#797979;">Instagram</td><td style="padding:6px 8px;">${formatInstagram(instagram)}</td></tr>
            <tr><td style="padding:6px 8px;color:#797979;">Submitted</td><td style="padding:6px 8px;">${esc(formatSubmittedAt(submitted_at))}</td></tr>
          </tbody>
        </table>

        <p style="margin:0 0 24px;">
          <a href="${esc(reviewUrl)}" style="display:inline-block;background:#1F1F1F;color:#ffffff;text-decoration:none;padding:12px 20px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;">Review application</a>
        </p>

        <p style="font-size:11px;color:#797979;font-style:italic;margin:0;">You are receiving this because you are listed as the admin of The Bridal Edit.</p>
      </div>
    `;

    const text = [
      `New artist application — ${applicantLabel}`,
      "",
      `Name: ${name ?? "—"}`,
      `Business: ${business_name ?? "—"}`,
      `Email: ${email ?? "—"}`,
      `Location: ${formatLocation(city, province_state, country)}`,
      `Services: ${Array.isArray(services) ? services.join(", ") : (services ?? "—")}`,
      `Instagram: ${instagram ?? "—"}`,
      `Submitted: ${formatSubmittedAt(submitted_at)}`,
      "",
      `Review: ${reviewUrl}`,
    ].join("\n");

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [ADMIN_EMAIL],
        subject,
        html,
        text,
        reply_to: typeof email === "string" && email ? email : undefined,
      }),
    });

    const resendBody = await resendRes.text();
    if (!resendRes.ok) {
      console.error("Resend send failed", resendRes.status, resendBody);
      return new Response(
        JSON.stringify({ error: "Email send failed.", status: resendRes.status, detail: resendBody }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("NOTIFY ADMIN ARTIST APPLICATION OK", resendBody);
    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("notify-admin-artist-application error", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Admin notification failed." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
