// App Store Guideline 5.1.1(v): in-app account deletion. This Edge Function
// is the final, service-role step in the account deletion flow.
//
// Flow:
//   1. Client performs a best-effort cleanup of its own rows + storage files
//      using the user's session (RLS-scoped).
//   2. Client calls this function with the user's bearer token.
//   3. This function verifies the token, repeats the cleanup using the
//      service role (to catch anything client RLS would have hidden), then
//      finally deletes the auth.users row via the admin API.
//
// We never trust a user_id from the request body — the user id is always
// taken from the verified JWT to prevent one signed-in user from deleting
// another user's account.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ARTIST_STORAGE_BUCKET = "artist-portfolio";
const BRIDE_CURRENT_BUCKET = "bride-current-photos";
const BRIDE_INSPO_BUCKET = "bride-inspo";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function emptyBucketFolder(admin: ReturnType<typeof createClient>, bucket: string, folder: string) {
  try {
    const { data: files, error } = await admin.storage.from(bucket).list(folder, { limit: 1000 });
    if (error) {
      console.warn(`storage list failed for ${bucket}/${folder}:`, error.message);
      return;
    }
    if (!Array.isArray(files) || files.length === 0) return;
    const paths = files
      .filter((f) => f && typeof f.name === "string" && f.name.length > 0)
      .map((f) => `${folder}/${f.name}`);
    if (paths.length === 0) return;
    const { error: removeError } = await admin.storage.from(bucket).remove(paths);
    if (removeError) {
      console.warn(`storage remove failed for ${bucket}/${folder}:`, removeError.message);
    }
  } catch (err) {
    console.warn(`storage cleanup unexpected error for ${bucket}/${folder}:`, err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error("delete-account misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return jsonResponse({ error: "Account deletion is temporarily unavailable. Please try again later." }, 500);
    }

    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return jsonResponse({ error: "Please sign in again to delete your account." }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify identity directly off the token, never trust the request body.
    const { data: userResult, error: userError } = await admin.auth.getUser(token);
    if (userError || !userResult?.user?.id) {
      console.warn("delete-account could not verify user:", userError?.message);
      return jsonResponse({ error: "We couldn't verify your account. Please sign in again." }, 401);
    }
    const userId = userResult.user.id;
    const userEmail = (userResult.user.email || "").trim().toLowerCase();

    console.log("delete-account start for user", userId);

    // Look up artist profile id(s) so we can clean portfolio rows + portfolio
    // storage folder, which are keyed by artist_profiles.id (not auth uid).
    const { data: artistProfileRows } = await admin
      .from("artist_profiles")
      .select("id")
      .eq("user_id", userId);
    const artistProfileIds = Array.isArray(artistProfileRows)
      ? artistProfileRows.map((row) => row.id).filter(Boolean)
      : [];

    // Defense-in-depth row cleanup. Errors are logged but never block the
    // auth-user deletion, otherwise a single broken table could trap the user
    // forever.
    const deleteOps: Array<{ label: string; promise: Promise<unknown> }> = [
      { label: "bride_current_photos", promise: admin.from("bride_current_photos").delete().eq("bride_id", userId) },
      { label: "bride_inspo_photos", promise: admin.from("bride_inspo_photos").delete().eq("bride_id", userId) },
      { label: "saved_artists", promise: admin.from("saved_artists").delete().eq("bride_id", userId) },
      { label: "messages", promise: admin.from("messages").delete().eq("bride_user_id", userId) },
      { label: "quiz_results", promise: admin.from("quiz_results").delete().eq("user_id", userId) },
      { label: "bride_profiles", promise: admin.from("bride_profiles").delete().eq("id", userId) },
      { label: "artist_applications", promise: admin.from("artist_applications").delete().eq("user_id", userId) },
    ];

    if (artistProfileIds.length > 0) {
      deleteOps.push({
        label: "artist_portfolio_photos",
        promise: admin.from("artist_portfolio_photos").delete().in("artist_id", artistProfileIds),
      });
      deleteOps.push({
        label: "artist_profiles",
        promise: admin.from("artist_profiles").delete().eq("user_id", userId),
      });
    }

    const results = await Promise.allSettled(deleteOps.map((op) => op.promise));
    results.forEach((res, idx) => {
      const label = deleteOps[idx].label;
      if (res.status === "rejected") {
        console.warn(`delete-account: ${label} rejected:`, res.reason);
      } else {
        const value = res.value as { error?: { message?: string } } | null;
        if (value && value.error) {
          console.warn(`delete-account: ${label} error:`, value.error.message);
        }
      }
    });

    // Storage cleanup — best-effort. Try every folder the app might write to.
    const storageFolders: Array<{ bucket: string; folder: string }> = [
      { bucket: BRIDE_CURRENT_BUCKET, folder: userId },
      { bucket: BRIDE_INSPO_BUCKET, folder: userId },
      { bucket: ARTIST_STORAGE_BUCKET, folder: userId },
    ];
    for (const artistProfileId of artistProfileIds) {
      storageFolders.push({ bucket: ARTIST_STORAGE_BUCKET, folder: String(artistProfileId) });
    }
    await Promise.all(storageFolders.map(({ bucket, folder }) => emptyBucketFolder(admin, bucket, folder)));

    // Admin notifications carrying this user's email/application data. The
    // table is admin-only via RLS; service role bypasses RLS so we can
    // scrub here.
    if (userEmail) {
      try {
        await admin
          .from("admin_notifications")
          .delete()
          .filter("data->>email", "eq", userEmail);
      } catch (err) {
        console.warn("delete-account: admin_notifications cleanup skipped:", err);
      }
    }

    // Profiles row last so any other table with a FK to profiles fails
    // gracefully if the migration adds one in the future.
    try {
      const { error: profilesError } = await admin.from("profiles").delete().eq("id", userId);
      if (profilesError) {
        console.warn("delete-account: profiles delete error:", profilesError.message);
      }
    } catch (err) {
      console.warn("delete-account: profiles delete threw:", err);
    }

    // Finally, delete the auth user. This is the only step that REQUIRES
    // service-role access and the only step whose failure should surface
    // back to the client as an error.
    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(userId);
    if (deleteAuthError) {
      console.error("delete-account: auth.admin.deleteUser failed:", deleteAuthError.message);
      return jsonResponse({ error: "We couldn't fully delete your account. Please try again in a moment." }, 500);
    }

    console.log("delete-account done for user", userId);
    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("delete-account unexpected error:", err);
    return jsonResponse({ error: "Unexpected error deleting your account. Please try again." }, 500);
  }
});
