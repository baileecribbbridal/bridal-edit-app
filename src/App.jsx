import { useState, useRef, useEffect, Fragment } from "react";
import { createClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { Share } from "@capacitor/share";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import html2canvas from "html2canvas";
import "./App.css";

// App Store Guideline 3.1.1: on native iOS we may not offer paid digital
// goods/subscriptions through Stripe or any external purchase flow. Use this
// helper to gate every Stripe checkout / billing portal / external upgrade
// surface so they are completely hidden and disabled on iOS only.
function isNativeIOSApp(){
  try {
    return Capacitor.getPlatform() === "ios" && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}
// ============================================================================
// RevenueCat (Apple In-App Purchase) configuration.
//
// PHASE 2 — paste the real values from the RevenueCat dashboard below.
// Until these three constants are filled in, the iOS premium screen displays
// a neutral loading/retry message. The app does NOT show any "coming soon"
// placeholder.
//
// Where to find each value:
//   REVENUECAT_APPLE_API_KEY   — RevenueCat dashboard → Project Settings →
//                                API Keys → "Apple" (public key, starts with
//                                "appl_"; safe to ship in the JS bundle).
//   REVENUECAT_ENTITLEMENT_ID  — RevenueCat dashboard → Entitlements (the
//                                identifier granted on purchase, e.g.
//                                "premium").
//   REVENUECAT_OFFERING_ID     — RevenueCat dashboard → Offerings (identifier
//                                of the offering shown on the premium screen).
//                                Leave as null to fall back to the "current"
//                                offering configured in the dashboard.
// ============================================================================
const REVENUECAT_APPLE_API_KEY = "appl_wbEycamKULblArUTehATmaJXVBH";
const REVENUECAT_ENTITLEMENT_ID = "premium";
const REVENUECAT_OFFERING_ID = "default";
const REVENUECAT_BRIDE_OFFERING_ID = "default";
const REVENUECAT_ARTIST_OFFERING_ID = "artist";
const REVENUECAT_BRIDE_PRODUCT_ID = "bride_premium_monthly";
const REVENUECAT_ARTIST_PRODUCT_ID = "artist_premium_monthly";
const PRIVACY_POLICY_URL = "https://baileecribbbridal.com/app-privacy-policy";
const TERMS_OF_USE_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

function openLegalURL(url){
  try{
    if(Browser?.open){
      Browser.open({url,presentationStyle:"fullscreen"});
      return;
    }
  }catch{}
  window.open(url,"_blank","noopener,noreferrer");
}

function LegalLinks({color=C.gray}){
  return (
    <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:8,flexWrap:"wrap",fontFamily:co,fontSize:12,fontStyle:"italic",color,lineHeight:1.4,textAlign:"center"}}>
      <button type="button" onClick={()=>openLegalURL(PRIVACY_POLICY_URL)} style={{background:"none",border:"none",padding:0,fontFamily:co,fontSize:12,fontStyle:"italic",color,textDecoration:"underline",cursor:"pointer"}}>Privacy Policy</button>
      <span aria-hidden="true">•</span>
      <button type="button" onClick={()=>openLegalURL(TERMS_OF_USE_URL)} style={{background:"none",border:"none",padding:0,fontFamily:co,fontSize:12,fontStyle:"italic",color,textDecoration:"underline",cursor:"pointer"}}>Terms of Use</button>
    </div>
  );
}

function revenueCatIsConfigured(){
  return Boolean(REVENUECAT_APPLE_API_KEY && REVENUECAT_ENTITLEMENT_ID);
}

// Lazy singleton wrapper so we never import the native plugin on the web.
const RevenueCatIOS = (() => {
  let configured = false;
  let cachedPlugin = null;
  async function loadPlugin(){
    if(cachedPlugin) return cachedPlugin;
    cachedPlugin = await import("@revenuecat/purchases-capacitor");
    return cachedPlugin;
  }
  async function ensureConfigured(appUserID){
    if(!isNativeIOSApp()) return false;
    if(!revenueCatIsConfigured()) return false;
    if(configured) return true;
    try{
      const { Purchases, LOG_LEVEL } = await loadPlugin();
      try { await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG }); } catch {}
      await Purchases.configure({
        apiKey: REVENUECAT_APPLE_API_KEY,
        appUserID: appUserID || null,
      });
      configured = true;
      console.log("[RevenueCat] configured", {
        appUserID: appUserID || "(anonymous)",
        offeringID: REVENUECAT_OFFERING_ID || "current",
        entitlementID: REVENUECAT_ENTITLEMENT_ID,
        expectedProductIDs: [REVENUECAT_BRIDE_PRODUCT_ID, REVENUECAT_ARTIST_PRODUCT_ID],
      });
      return true;
    }catch(err){
      console.error("[RevenueCat] configure failed:", err);
      return false;
    }
  }
  function packagesForOffering(offering){
    return Array.isArray(offering?.availablePackages) ? offering.availablePackages : [];
  }
  function productIDsForOffering(offering){
    return packagesForOffering(offering).map(p=>p?.product?.identifier).filter(Boolean);
  }
  function findOfferingContainingProduct(offerings, productID){
    const allOfferings = offerings?.all || {};
    return Object.values(allOfferings).find(offering => productIDsForOffering(offering).includes(productID)) || null;
  }
  async function loadOffering(appUserID, requestedOfferingID = REVENUECAT_BRIDE_OFFERING_ID, expectedProductID = REVENUECAT_BRIDE_PRODUCT_ID){
    if(!isNativeIOSApp() || !revenueCatIsConfigured()){
      return { offering: null, error: new Error("not_configured") };
    }
    const ok = await ensureConfigured(appUserID);
    if(!ok) return { offering: null, error: new Error("configure_failed") };
    try{
      const { Purchases } = await loadPlugin();
      console.log("[RevenueCat] offerings requested", {
        requestedOfferingIdentifier: requestedOfferingID || "current",
        expectedProductID,
        expectedProductIDs: [REVENUECAT_BRIDE_PRODUCT_ID, REVENUECAT_ARTIST_PRODUCT_ID],
      });
      const offerings = await Purchases.getOfferings();
      const allOfferingIdentifiers = offerings?.all ? Object.keys(offerings.all) : [];
      console.log("[RevenueCat] getOfferings diagnostic", {
        current_offering_id: offerings?.current?.identifier || null,
        current_identifier: offerings?.current?.identifier || null,
        current_availablePackages_length: Array.isArray(offerings?.current?.availablePackages) ? offerings.current.availablePackages.length : 0,
        package_identifiers: (offerings?.current?.availablePackages || []).map(p=>p?.identifier).filter(Boolean),
        store_product_identifiers: (offerings?.current?.availablePackages || []).map(p=>p?.product?.identifier).filter(Boolean),
      });
      console.log("[RevenueCat] current offerings available", {
        currentOfferingIdentifier: offerings?.current?.identifier || null,
        allOfferingIdentifiers,
      });
      Object.entries(offerings?.all || {}).forEach(([identifier, offering]) => {
        console.log("[RevenueCat] offering packages", {
          offeringIdentifier: identifier,
          packagesCount: packagesForOffering(offering).length,
          packageIdentifiers: packagesForOffering(offering).map(p=>p?.identifier).filter(Boolean),
          productIdentifiers: productIDsForOffering(offering),
        });
      });
      const requestedOffering = requestedOfferingID ? offerings?.all?.[requestedOfferingID] : offerings?.current;
      const productFallbackOffering = findOfferingContainingProduct(offerings, expectedProductID);
      const offering = requestedOffering || productFallbackOffering || offerings?.current || null;
      const availablePackages = packagesForOffering(offering);
      console.log(`[RevenueCat] current offering ${offerings?.current ? "found" : "missing"}`, {
        currentOfferingIdentifier: offerings?.current?.identifier || null,
      });
      console.log("[RevenueCat] offerings response", {
        currentOfferingIdentifier: offerings?.current?.identifier || null,
        requestedOfferingIdentifier: requestedOfferingID || "current",
        selectedOfferingIdentifier: offering?.identifier || null,
        selectedByProductFallback: Boolean(!requestedOffering && productFallbackOffering),
        expectedProductID,
        allOfferingIdentifiers,
        availablePackagesLength: availablePackages.length,
        packagesCount: availablePackages.length,
        packageIdentifiers: availablePackages.map(p=>p?.identifier).filter(Boolean),
        productIdentifiers: availablePackages.map(p=>p?.product?.identifier).filter(Boolean),
        hasBridePremiumMonthly: availablePackages.some(p=>p?.product?.identifier === REVENUECAT_BRIDE_PRODUCT_ID),
        hasArtistPremiumMonthly: availablePackages.some(p=>p?.product?.identifier === REVENUECAT_ARTIST_PRODUCT_ID),
        rawOfferings: offerings,
      });
      if(!offering || availablePackages.length === 0){
        console.warn("[RevenueCat] no packages in offering", {
          wanted: requestedOfferingID || "current",
          expectedProductID,
          selectedOffering: offering,
          rawOfferings: offerings,
        });
        return { offering: null, error: new Error("no_packages") };
      }
      if(!availablePackages.some(p=>p?.product?.identifier === expectedProductID)){
        console.warn("[RevenueCat] expected product missing from selected offering", {
          wanted: requestedOfferingID || "current",
          selectedOfferingIdentifier: offering?.identifier || null,
          expectedProductID,
          productIdentifiers: productIDsForOffering(offering),
          rawOfferings: offerings,
        });
        return { offering, error: null };
      }
      console.log("[RevenueCat] loaded offering:", offering.identifier, "packages:", availablePackages.map(p=>p.identifier));
      return { offering, error: null };
    }catch(err){
      console.error("[RevenueCat] getOfferings failed:", err);
      return { offering: null, error: err };
    }
  }
  async function purchasePackage(pkg, appUserID){
    const ok = await ensureConfigured(appUserID);
    if(!ok) throw new Error("RevenueCat is not configured.");
    const { Purchases } = await loadPlugin();
    return Purchases.purchasePackage({ aPackage: pkg });
  }
  async function restore(appUserID){
    const ok = await ensureConfigured(appUserID);
    if(!ok) throw new Error("RevenueCat is not configured.");
    const { Purchases } = await loadPlugin();
    return Purchases.restorePurchases();
  }
  function hasActiveEntitlement(customerInfo){
    if(!customerInfo || !REVENUECAT_ENTITLEMENT_ID) return false;
    return Boolean(customerInfo?.entitlements?.active?.[REVENUECAT_ENTITLEMENT_ID]);
  }
  function logEntitlementStatus(source, customerInfo){
    const allEntitlements = customerInfo?.entitlements?.all || {};
    const activeEntitlements = customerInfo?.entitlements?.active || {};
    console.log(`[RevenueCat] entitlement status after ${source}`, {
      expectedEntitlementID: REVENUECAT_ENTITLEMENT_ID,
      hasExpectedEntitlement: Boolean(activeEntitlements?.[REVENUECAT_ENTITLEMENT_ID]),
      activeEntitlementIdentifiers: Object.keys(activeEntitlements),
      allEntitlementIdentifiers: Object.keys(allEntitlements),
      activeSubscriptions: customerInfo?.activeSubscriptions || [],
      allPurchasedProductIdentifiers: customerInfo?.allPurchasedProductIdentifiers || [],
    });
  }
  return { ensureConfigured, loadOffering, purchasePackage, restore, hasActiveEntitlement, logEntitlementStatus };
})();

const C = { iceBlue:"#eff7ff", blush:"#fadfe5", nearBlack:"#1F1F1F", white:"#ffffff", black:"#000000", lavender:"#e9c6eb", gray:"#797979", border:"#e0e0e0", champagne:"#F5ECD7", teal:"#2D6E6E" };
const ag = "'Futura','Century Gothic',sans-serif";
const co = "'Garamond','Georgia',serif";
const ve = "'Trajan Pro','Times New Roman',serif";
const SUPABASE_URL = "https://wrkbkkbxkwawoabqfdeg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indya2Jra2J4a3dhd29hYnFmZGVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNzI0MjcsImV4cCI6MjA5Mzc0ODQyN30.h7s2e-OiwmQEnJgbS0rLAbWDmv_nEEy8qTmKfTFWRPI";
const AUTH_CALLBACK_URL = "thebridaledit://auth/callback";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
const PASSWORD_RECOVERY_STORAGE_KEY = "passwordRecoveryMode";
// Onboarding "results gate": new brides can take the quiz without an account.
// Their answers + computed archetype are stashed locally here and only written
// to Supabase once they authenticate. Persisting to localStorage (not just
// React state) keeps the data alive across an email-confirmation reload.
const ONBOARDING_STORAGE_KEY = "pendingOnboarding";
const SWIPE_PREFERENCE_STORAGE_KEY = "bridalSwipePreferenceSummary";
const readPendingOnboarding = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const readSwipePreferenceSummary = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SWIPE_PREFERENCE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const writePendingOnboarding = (data) => {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(data)); } catch {}
};
const clearPendingOnboarding = () => {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(ONBOARDING_STORAGE_KEY); } catch {}
};
// Screens an unauthenticated bride may reach. Everything else is protected and
// redirects to the auth gate until a session exists. The quiz is the complete
// public onboarding; results and all personalized features live behind the gate.
const PUBLIC_SCREENS = new Set(["home", "quiz", "authGate", "reset-password", "reset-expired"]);
const isPasswordRecoveryStored = () => {
  try {
    return localStorage.getItem(PASSWORD_RECOVERY_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};
const setPasswordRecoveryStored = () => {
  try {
    localStorage.setItem(PASSWORD_RECOVERY_STORAGE_KEY, "true");
  } catch {}
  try {
    sessionStorage.setItem(PASSWORD_RECOVERY_STORAGE_KEY, "true");
  } catch {}
};
const clearPasswordRecoveryStored = () => {
  try {
    localStorage.removeItem(PASSWORD_RECOVERY_STORAGE_KEY);
  } catch {}
  try {
    sessionStorage.removeItem(PASSWORD_RECOVERY_STORAGE_KEY);
  } catch {}
};

if (typeof window !== "undefined") {
  console.log("APP URL:", window.location.href);
}

supabase.auth.onAuthStateChange((event, session) => {
  console.log("AUTH EVENT:", event);
  console.log("SESSION:", session);

  if (event === "PASSWORD_RECOVERY") {
    console.log("PASSWORD RECOVERY DETECTED");
    return;
  }
});
const ARTIST_STORAGE_BUCKET = "artist-portfolio";
const BRIDE_CURRENT_BUCKET = "bride-current-photos";
const BRIDE_PROFILE_BUCKET = "bride-profile-photo";
const BRIDE_INSPO_BUCKET = "bride-inspo";
const BRIDE_INSPO_CATEGORIES = ["Hair","Makeup","Dress","Overall Vibe","Don’t Like This"];
const DISABLE_RECENT_STARTUP_FEATURES = false;
const DISABLE_BOOKED_BRIDE_LOOKUP = false;
const DISABLE_ARTIST_PHOTO_FEATURES = false;
const DISABLE_ARTIST_PROFILE_EDITING = false;
const PORTFOLIO_CATEGORY_OPTIONS = ["hair","makeup","full_look"];
const PORTFOLIO_HAIR_LOOK_OPTIONS = ["hollywood_waves","soft_waves","boho_waves","sleek_bun","textured_bun","high_bun","low_bun","ponytail","half_up","short_hair","natural_curls"];
const PORTFOLIO_MAKEUP_LOOK_OPTIONS = ["soft_glam","full_glam","natural_makeup","dewy_skin","matte_skin","bronzed_glam","clean_girl","smoky_eye","bold_lip","sculpted_skin"];
const PORTFOLIO_TAG_GROUPS = [
  ["Hair",["hollywood_waves","soft_waves","boho_waves","updo","sleek_bun","textured_bun","high_bun","low_bun","ponytail","half_up","short_hair","natural_curls","face_framing","volume","texture"]],
  ["Makeup",["soft_glam","full_glam","natural_makeup","dewy_skin","matte_skin","sculpted_skin","bronzed_glam","clean_girl","smoky_eye","bold_lip"]],
  ["Vibe",["editorial","romantic","classic","boho","modern","vintage","glamorous","minimal","ethereal","dramatic","timeless"]],
  ["Wedding Style",["beach","garden","black_tie","destination","courthouse","ballroom","outdoor","tropical","city"]],
  ["Technical",["fine_hair_friendly","textured_hair","oily_skin_friendly","mature_skin","humid_climate","long_wear","extension_friendly"]],
];

function getArtistStorageDisplayUrl(url) {
  try {
    const cleanUrl = typeof url === "string" ? url.trim() : "";
    if (!cleanUrl) return "";
    const displayUrl = cleanUrl.startsWith("http")
      ? cleanUrl
      : (cleanUrl.startsWith("portfolio/") || cleanUrl.startsWith("profile/"))
        ? (supabase.storage.from(ARTIST_STORAGE_BUCKET).getPublicUrl(cleanUrl)?.data?.publicUrl || "")
        : cleanUrl;
    console.log("displayUrl used in img src", displayUrl);
    return displayUrl;
  } catch (error) {
    console.error("DISPLAY URL RESOLVE ERROR:", error);
    return "";
  }
}

// ── PRODUCT RECS (affiliate links) ─────────────────────────────────────────
const PRODUCTS = {
  oily:    [{name:"Laura Mercier Translucent Powder",why:"Controls shine all-day without caking",link:"https://www.ulta.com/p/translucent-loose-setting-powder-xlsImpprod2210073",price:"$40",cat:"Makeup Prep"},{name:"Charlotte Tilbury Airbrush Flawless Primer",why:"Pore-minimizing, oil-controlling base",link:"https://www.charlottetilbury.com/us/product/airbrush-flawless-primer",price:"$46",cat:"Skin Prep"},{name:"NYX Matte Setting Spray",why:"Locks makeup through heat and humidity",link:"https://www.ulta.com/p/matte-finish-makeup-setting-spray-xlsImpprod15101085",price:"$10",cat:"Setting"}],
  dry:     [{name:"Tatcha The Dewy Skin Cream",why:"Deep hydration that reads luminous on camera",link:"https://www.tatcha.com/product/the-dewy-skin-cream",price:"$72",cat:"Skin Prep"},{name:"Charlotte Tilbury Hollywood Flawless Filter",why:"Glowing, glass-skin base for dry skin",link:"https://www.charlottetilbury.com/us/product/hollywood-flawless-filter",price:"$49",cat:"Base"},{name:"Urban Decay All Nighter Hydrating",why:"Sets without drying — lasts the timeline",link:"https://www.urbandecay.com/all-nighter-hydrating-makeup-setting-spray/ud404.html",price:"$34",cat:"Setting"}],
  fine:    [{name:"Olaplex No.4 Bond Maintenance Shampoo",why:"Strengthens and builds density over time",link:"https://www.ulta.com/p/no4-bond-maintenance-shampoo-xlsImpprod16971012",price:"$30",cat:"Hair Prep"},{name:"Bumble and bumble Thickening Spray",why:"Creates texture and grip for styling",link:"https://www.bumbleandbumble.com/thickening/thickening-spray/BBTHICKSPRAY.html",price:"$32",cat:"Styling"},{name:"Kenra Platinum Silkening Mist",why:"Adds weight and polish to fine hair",link:"https://www.kenra.com/products/platinum-silkening-mist",price:"$21",cat:"Finish"}],
  thick:   [{name:"Kenra Platinum Silkening Mist",why:"Controls thick hair without weight",link:"https://www.kenra.com/products/platinum-silkening-mist",price:"$21",cat:"Finish"},{name:"Moroccanoil Treatment",why:"Tames frizz and adds shine to dense hair",link:"https://www.ulta.com/p/moroccanoil-treatment-xlsImpprod15951051",price:"$15",cat:"Styling"},{name:"VERB Ghost Oil",why:"Lightweight, non-greasy frizz control",link:"https://www.ulta.com/p/ghost-oil-xlsImpprod16501028",price:"$18",cat:"Styling"}],
  curly:   [{name:"SheaMoisture Curl Enhancing Smoothie",why:"Defines curls without crunch",link:"https://www.ulta.com/p/curl-enhancing-smoothie-xlsImpprod1870003",price:"$13",cat:"Styling"},{name:"Denman D3 Brush",why:"Defines and detangles without disrupting curl pattern",link:"https://www.amazon.com/Denman-Classic-Styling-Brush-Rows/dp/B0000YWJ8E",price:"$14",cat:"Tools"},{name:"Kinky-Curly Knot Today Leave-In",why:"Prep for long-wear defined style",link:"https://www.ulta.com/p/knot-today-leave-in-detangler-moisture-xlsImpprod3130065",price:"$12",cat:"Hair Prep"}],
  sensitive:[{name:"La Roche-Posay Toleriane Double Repair",why:"Calms redness without fragrance",link:"https://www.ulta.com/p/toleriane-double-repair-face-moisturizer-xlsImpprod16341075",price:"$22",cat:"Skin Prep"},{name:"EltaMD UV Clear SPF 46",why:"Protects without irritating — day-of must",link:"https://www.ulta.com/p/uv-clear-broad-spectrum-spf-46-xlsImpprod15381043",price:"$41",cat:"Skin Prep"},{name:"Neutrogena Hydro Boost Water Gel",why:"Fragrance-free hydration that layers under makeup",link:"https://www.ulta.com/p/hydro-boost-water-gel-xlsImpprod14951083",price:"$27",cat:"Skin Prep"}],
  wave:    [{name:"Kenra Platinum Silkening Mist",why:"Polish and hold for structured waves",link:"https://www.kenra.com/products/platinum-silkening-mist",price:"$21",cat:"Styling"},{name:"Got2B Ultra Glued Hairspray",why:"Lock waves without stiffness",link:"https://www.ulta.com/p/got2b-ultra-glued-invincible-styling-hair-gel-xlsImpprod11120147",price:"$7",cat:"Hold"},{name:"Ouai Matte Pomade",why:"Controls flyaways on structured styles",link:"https://www.theouai.com/products/matte-pomade",price:"$28",cat:"Finish"}],
  glam:    [{name:"NARS Radiant Creamy Concealer",why:"Full coverage that doesn't crease under flash",link:"https://www.ulta.com/p/radiant-creamy-concealer-xlsImpprod15791087",price:"$30",cat:"Face"},{name:"Charlotte Tilbury Pillow Talk Lip",why:"The universal bridal lip — wearable and lasting",link:"https://www.charlottetilbury.com/us/product/matte-revolution-pillow-talk",price:"$38",cat:"Lip"},{name:"Too Faced Better Than Sex Mascara",why:"Volume without clumping in emotional moments",link:"https://www.toofaced.com/product/better-than-sex-mascara",price:"$29",cat:"Eyes"}],
};
const GENERIC_PRODUCT_RECS = [
  {name:"NYX Matte Setting Spray",why:"A practical long-wear setting spray for heat, dancing, and long photo timelines.",link:"https://www.ulta.com/p/matte-finish-makeup-setting-spray-xlsImpprod15101085",price:"$10",cat:"Setting"},
  {name:"La Roche-Posay Toleriane Double Repair",why:"A simple, fragrance-free moisturizer that layers well under bridal makeup.",link:"https://www.ulta.com/p/toleriane-double-repair-face-moisturizer-xlsImpprod16341075",price:"$22",cat:"Skin Prep"},
];

function getProductRecs(skinType, hairType, hairDensity, archetype) {
  const recs = [];
  if (skinType === "Oily" || skinType === "Combination") recs.push(...(PRODUCTS.oily||[]));
  if (skinType === "Dry") recs.push(...(PRODUCTS.dry||[]));
  if (skinType === "Sensitive") recs.push(...(PRODUCTS.sensitive||[]));
  if (hairDensity === "Fine / sparse") recs.push(...(PRODUCTS.fine||[]));
  if (hairDensity === "Thick / dense") recs.push(...(PRODUCTS.thick||[]));
  if (hairType === "Curly" || hairType === "Coily") recs.push(...(PRODUCTS.curly||[]));
  if (archetype && archetype.includes("wave")) recs.push(...(PRODUCTS.wave||[]));
  if (archetype && (archetype.includes("glam") || archetype.includes("full"))) recs.push(...(PRODUCTS.glam||[]));
  const seen = new Set();
  return recs.filter(p => { if(seen.has(p.name))return false; seen.add(p.name); return true; }).slice(0,6);
}

// ── ARCHETYPES ──────────────────────────────────────────────────────────────
const ARC = {
  structured_wave:{ name:"The Structured Wave Bride", sub:"Old-Hollywood power. Intentional glamour.", icon:"〰",
    why:"You want a look that reads expensive, polished, and deliberately beautiful. You want to feel transformed — not just touched up.",
    hair:"Classic Hollywood waves with internal structure and tension-engineered curl pattern. Built from the inside out, not styled on the surface.",
    makeup:"Airbrushed base, sculpted bone structure, defined eye, held lip. Armor-grade finish.",
    reality:"Wave shape requires density and curl-hold product. Fine hair needs extensions. Humidity-resistant prep is non-negotiable.",
    pinterest_truth:"Most inspo waves were heavily set, brushed out slowly, and shot before humidity. Indoor lighting hides collapse. Real structure is engineered, not styled.",
    fine_hair_note:"High likelihood of needing clip-in or tape extensions for this wave density.",
    score:{hair:90,climate:85,longevity:92,dress:88,photo:94}},
  sculpted_updo:{ name:"The Sculpted Updo Bride", sub:"Architecture. Control. Timeless authority.", icon:"◆",
    why:"You want to feel completely composed from every angle. A polished updo is control and intention — and you want it to stay exactly where it was placed.",
    hair:"Structured updo with internal pinning architecture. Every strand placed. Zero slipping, zero frizz.",
    makeup:"Flawless skin, contoured structure, sophisticated lip. The updo demands makeup that holds its weight.",
    reality:"Most collapses happen from lack of internal support, not product failure. Hair density determines whether padding or extensions are needed.",
    pinterest_truth:"Viral updos use hidden pins, padding, and light manipulation. The 'effortless' ones took 45 minutes of very effortful work.",
    fine_hair_note:"Padding or extensions likely needed for visual fullness and structural integrity.",
    score:{hair:88,climate:96,longevity:95,dress:90,photo:87}},
  soft_glam:{ name:"The Soft Glam Bride", sub:"Modern glow. Romantic but refined.", icon:"✦",
    why:"You want to look like yourself — the version that makes people stop. Not overdone, not underdone. Elevated. The 'I always look like this' lie told perfectly.",
    hair:"Romantic waves or soft half-up. Full of movement but intentional — there's a difference.",
    makeup:"Blurred skin, glossy lid, flushed cheek. Dewy without sliding.",
    reality:"Soft glam reads flat in bright outdoor light without dimensional makeup. Requires a skilled hand.",
    pinterest_truth:"Soft glam inspo is almost always shot in controlled golden-hour light with professional retouching. The 'dewiness' is often artificial highlight.",
    fine_hair_note:"Works well with fine hair — soft waves require less density than structured styles.",
    score:{hair:85,climate:80,longevity:82,dress:88,photo:86}},
  dewy_skin:{ name:"The Dewy Skin Bride", sub:"Glass skin. Light from within. Nothing extra.", icon:"◌",
    why:"You want your skin to be the look. You trust your features. You want people to say 'she looks incredible' and not be sure if you're wearing makeup.",
    hair:"Effortless — soft waves, low bun, or natural texture.",
    makeup:"Skin-prep obsessed. A lit-from-within finish with intention, not product.",
    reality:"Dewy skin requires months of prep. Oily skin needs careful product selection to avoid breakdown in heat.",
    pinterest_truth:"Glass skin inspo is shot under controlled lighting and often retouched. Achieving this in humid outdoor conditions requires specific primers and artist experience.",
    fine_hair_note:"Compatible — low-manipulation styles work beautifully with fine hair.",
    score:{hair:82,climate:70,longevity:75,dress:83,photo:80}},
  bold_editorial:{ name:"The Bold Editorial Bride", sub:"Fashion-forward. Memorable. Unapologetic.", icon:"★",
    why:"You know your photos will last forever and want them to look like a shoot. You're not afraid of a strong choice — you're afraid of looking forgettable.",
    hair:"Sculptural, graphic, or extreme texture. Not a style — a statement.",
    makeup:"Color, graphic liner, architectural skin.",
    reality:"Editorial looks require a highly skilled artist. Most bridal artists aren't trained for this — vet carefully.",
    pinterest_truth:"Editorial bridal shoots are styled for camera. Discuss the wearable version carefully — not everything translates to a 10-hour day.",
    fine_hair_note:"Fine hair can work — sculptural styles often lean on precision over volume.",
    score:{hair:80,climate:75,longevity:78,dress:72,photo:97}},
  coastal_boho:{ name:"The Coastal Boho Bride", sub:"Undone on purpose. Warm, earthy, free.", icon:"◯",
    why:"You want to feel like yourself — wind-kissed and relaxed. You want photos that look like a film, not a portrait.",
    hair:"Relaxed waves, braids, or soft texture. Natural movement is the point.",
    makeup:"Bronzed glow, earthy tones. Sun-kissed, never heavy.",
    reality:"'Undone' is one of the hardest looks to execute. Without technique, it reads messy, not intentional.",
    pinterest_truth:"Boho inspo is shot in golden hour on beaches. That hair 'movement' is often a fan — in a venue it won't exist.",
    fine_hair_note:"Works well — natural and boho styles don't require high density.",
    score:{hair:78,climate:82,longevity:72,dress:85,photo:83}},
  classic_timeless:{ name:"The Classic Timeless Bride", sub:"Chignon, refinement, forever elegant.", icon:"◇",
    why:"You want to look at your photos in 30 years and feel proud. Nothing trendy. Nothing that dates.",
    hair:"Chignon, French twist, or polished blowout.",
    makeup:"Even skin, defined brow, mascara, nude lip.",
    reality:"Classic looks require clean execution. Any imperfection is visible.",
    pinterest_truth:"Classic bridal photos look effortless because the lighting is controlled. This level of simplicity takes significant skill.",
    fine_hair_note:"Classic styles often suit fine hair beautifully — sleek and controlled.",
    score:{hair:90,climate:91,longevity:93,dress:89,photo:85}},
  vintage_glam:{ name:"The Vintage Glam Bride", sub:"Red lip. Cat liner. Old Hollywood precision.", icon:"✿",
    why:"You've always wanted a look with a story. A 1940s wave or 60s eye. You want to feel transported.",
    hair:"Finger waves, victory rolls, or marcelled curls.",
    makeup:"Matte skin, defined cat liner, red or berry lip.",
    reality:"Vintage looks require technical expertise most bridal artists don't have. Verify specific vintage technique.",
    pinterest_truth:"True vintage techniques take hours and require specific tools. Most 'vintage-inspired' is a softer version.",
    fine_hair_note:"Vintage styles can work with fine hair but may need added texture product.",
    score:{hair:85,climate:78,longevity:86,dress:80,photo:92}},
  natural_beauty:{ name:"The Natural Beauty Bride", sub:"You, radiant. Every feature celebrated.", icon:"❋",
    why:"You want people to see you — your features, your texture, your glow. The most beautiful version of you that exists.",
    hair:"Your texture, enhanced. Curls defined. Waves encouraged.",
    makeup:"Skin-matching, feature-enhancing.",
    reality:"Natural beauty requires the most skill — there's nowhere to hide.",
    pinterest_truth:"'No-makeup makeup' involves 12+ products applied with precision.",
    fine_hair_note:"Natural styles are ideal for fine hair — work with what you have.",
    score:{hair:80,climate:83,longevity:77,dress:82,photo:78}},
  dark_moody:{ name:"The Dark Moody Bride", sub:"Smoky, deep, powerfully sensual.", icon:"◈",
    why:"You want drama without apology. Deep tones, moody atmosphere, a look that commands in candlelight.",
    hair:"Sleek and controlled, or dramatically full — intentional structure.",
    makeup:"Smoky eye, deep berry or plum lip, flawless skin.",
    reality:"Dark makeup in outdoor or bright light can read harsh. Discuss your lighting with your artist.",
    pinterest_truth:"Dark bridal inspo is shot in controlled low light. In bright outdoor ceremonies the same look appears heavy.",
    fine_hair_note:"Sleek controlled styles work well with fine hair.",
    score:{hair:86,climate:74,longevity:88,dress:78,photo:91}},
  minimalist:{ name:"The Minimalist Bride", sub:"Quiet luxury. Nothing extra. Everything intentional.", icon:"—",
    why:"You believe less is more. Curated, not decorated.",
    hair:"Slicked back, clean low bun, or effortless straight.",
    makeup:"SPF, brow gel, mascara, sheer balm.",
    reality:"Minimalist looks can read 'underdone' in traditional wedding photography. Discuss lighting.",
    pinterest_truth:"Minimalist bridal inspo is almost entirely editorial photography — it reads differently in traditional wedding formats.",
    fine_hair_note:"Ideal for fine hair — clean minimal styles shine on finer textures.",
    score:{hair:88,climate:89,longevity:84,dress:83,photo:80}},
  full_glam:{ name:"The Full Glam Bride", sub:"All the way up. No ceiling. Main character.", icon:"✸",
    why:"You have one wedding day and you are not playing small.",
    hair:"Voluminous, bouncy, full. Big hair, big moment.",
    makeup:"Full coverage, contour, highlight, full lash, bold lip.",
    reality:"Full glam requires the most product and skill to avoid looking heavy.",
    pinterest_truth:"Full glam inspo is shot with ring lights and flash photography that enhances heavy makeup.",
    fine_hair_note:"Extensions strongly recommended for the volume this archetype requires.",
    score:{hair:82,climate:76,longevity:85,dress:80,photo:89}},
};

function scoreArchetype(ans) {
  const s={}; Object.keys(ARC).forEach(k=>s[k]=0);
  if(ans.venue==="Beach/waterfront"){["structured_wave","dewy_skin","coastal_boho","soft_glam"].forEach(k=>s[k]+=2);}
  if(ans.venue==="Ballroom"){["sculpted_updo","classic_timeless","dark_moody","full_glam","vintage_glam"].forEach(k=>s[k]+=2);}
  if(ans.venue==="Garden/outdoor"){["coastal_boho","natural_beauty","soft_glam","classic_timeless"].forEach(k=>s[k]+=2);}
  if(ans.venue==="City/rooftop"){["bold_editorial","minimalist","dark_moody","structured_wave"].forEach(k=>s[k]+=2);}
  if(ans.venue==="Intimate/elopement"){["minimalist","natural_beauty","dewy_skin","coastal_boho"].forEach(k=>s[k]+=2);}
  if(ans.dress==="Flowing/romantic"){["soft_glam","coastal_boho","structured_wave"].forEach(k=>s[k]+=2);}
  if(ans.dress==="Sleek/structured"){["sculpted_updo","minimalist","bold_editorial"].forEach(k=>s[k]+=2);}
  if(ans.dress==="Ballgown"){["classic_timeless","full_glam","vintage_glam","structured_wave"].forEach(k=>s[k]+=2);}
  if(ans.dress==="Boho"){["coastal_boho","natural_beauty"].forEach(k=>s[k]+=3);}
  if(ans.dress==="Minimalist/slip"){["minimalist","dewy_skin"].forEach(k=>s[k]+=3);}
  if(ans.fear==="Looking overdone"){["minimalist","dewy_skin","natural_beauty","coastal_boho"].forEach(k=>s[k]+=3);}
  if(ans.fear==="Not looking enough"){["full_glam","structured_wave","dark_moody","bold_editorial"].forEach(k=>s[k]+=3);}
  if(ans.fear==="Makeup fading"){["sculpted_updo","structured_wave","full_glam","classic_timeless"].forEach(k=>s[k]+=2);}
  if(ans.fear==="Not looking like myself"){["natural_beauty","soft_glam","dewy_skin"].forEach(k=>s[k]+=3);}
  if(ans.fear==="Looking like every other bride"){["bold_editorial","vintage_glam","dark_moody"].forEach(k=>s[k]+=3);}
  if(ans.transform==="Transformed"){["full_glam","structured_wave","bold_editorial","vintage_glam","dark_moody"].forEach(k=>s[k]+=3);}
  if(ans.transform==="Elevated"){["natural_beauty","dewy_skin","soft_glam","minimalist","coastal_boho"].forEach(k=>s[k]+=3);}
  if(ans.makeup_rel==="Full face daily"){["full_glam","structured_wave","bold_editorial"].forEach(k=>s[k]+=2);}
  if(ans.makeup_rel==="Mascara and lip gloss"){["soft_glam","dewy_skin","coastal_boho"].forEach(k=>s[k]+=2);}
  if(ans.makeup_rel==="Skincare only"){["minimalist","natural_beauty","dewy_skin"].forEach(k=>s[k]+=2);}
  if(ans.priority==="Longevity"){["sculpted_updo","structured_wave","classic_timeless"].forEach(k=>s[k]+=3);}
  if(ans.priority==="Drama"){["bold_editorial","full_glam","dark_moody","vintage_glam"].forEach(k=>s[k]+=3);}
  if(ans.priority==="Softness"){["soft_glam","coastal_boho","natural_beauty"].forEach(k=>s[k]+=3);}
  if(ans.priority==="Looking expensive"){["structured_wave","sculpted_updo","minimalist","classic_timeless"].forEach(k=>s[k]+=3);}
  if(ans.priority==="Comfort"){["coastal_boho","natural_beauty","soft_glam","minimalist"].forEach(k=>s[k]+=2);}
  if(ans.photo==="Light & airy"){["soft_glam","dewy_skin","natural_beauty"].forEach(k=>s[k]+=2);}
  if(ans.photo==="Dark & moody"){["dark_moody","vintage_glam","bold_editorial"].forEach(k=>s[k]+=2);}
  if(ans.photo==="Editorial"){["bold_editorial","structured_wave","vintage_glam"].forEach(k=>s[k]+=2);}
  if(ans.photo==="Classic"){["classic_timeless","sculpted_updo"].forEach(k=>s[k]+=2);}
  // skin/hair influence
  if(ans.hairDensity==="Fine / sparse"){["minimalist","classic_timeless","soft_glam","dewy_skin"].forEach(k=>s[k]+=1);}
  if(ans.hairDensity==="Thick / dense"){["full_glam","structured_wave","coastal_boho"].forEach(k=>s[k]+=1);}
  if(ans.hairType==="Curly"||ans.hairType==="Coily"){["natural_beauty","coastal_boho"].forEach(k=>s[k]+=2);}
  if(ans.hairLength==="Pixie / short"||ans.hairLength==="Bob / lob"){["minimalist","bold_editorial","natural_beauty"].forEach(k=>s[k]+=1);}
  if(ans.hairLength==="Chest length"||ans.hairLength==="Waist length or longer"){["structured_wave","full_glam","coastal_boho"].forEach(k=>s[k]+=1);}
  if(ans.eyeShape==="Hooded"||ans.eyeShape==="Deep-set"){["soft_glam","dark_moody","classic_timeless"].forEach(k=>s[k]+=1);}
  if(ans.hairColor==="Gray / silver"||ans.hairColor==="Fashion color"){["bold_editorial","minimalist"].forEach(k=>s[k]+=1);}
  const sorted=Object.entries(s).sort((a,b)=>b[1]-a[1]);
  return { primary:sorted[0][0], secondary:sorted[1][0] };
}

// ── SKIN/HAIR ASSESSMENT QUESTIONS ─────────────────────────────────────────
const SKIN_Q = [
  {id:"skinLook",q:"When you look at your bare skin mid-afternoon, it usually looks...",opts:["Shiny or greasy, especially in the T-zone","Tight, flaky, or uncomfortable","A mix — shiny in some places, dry in others","Calm and even — no real issues","Easily irritated, red, or reactive"]},
  {id:"skinPores",q:"How would you describe your pores?",opts:["Visible, especially on nose and chin","Barely noticeable","Noticeable only in certain areas","I honestly can't tell"]},
];
const HAIR_Q = [
  {id:"hairPattern",q:"Without any product, your hair naturally...",opts:["Dries completely straight","Has a slight wave or bend","Forms loose, defined waves","Forms tight curls or ringlets","Has very tight coils or kinks"]},
  {id:"hairStrand",q:"Take a single strand of your hair. It feels...",opts:["So fine I can barely feel it between my fingers","Noticeable but lightweight","Noticeably thick and strong","I'm not sure"]},
  {id:"hairDensity2",q:"When you pull your hair into a ponytail, the circumference is...",opts:["Very thin — less than an inch around","Medium — about an inch","Thick — more than an inch around"]},
];
const FEATURE_Q = [
  {id:"faceShape",q:"Which face shape feels closest?",sub:"This helps translate parting, face-framing, updo height, and veil placement.",opts:["Oval","Round","Square","Heart","Long","Not sure"]},
  {id:"eyeColor",q:"What color are your eyes?",sub:"This helps with shadow tone, liner contrast, and how much definition reads on camera.",opts:["Brown","Hazel","Green","Blue","Gray","Other"]},
  {id:"eyeShape",q:"Which eye shape feels closest?",sub:"Eye shape changes liner, lash, and shimmer placement more than almost anything.",opts:["Hooded","Almond","Round","Deep-set","Monolid","Not sure"]},
  {id:"hairColor",q:"What is your current hair color?",sub:"Hair color changes how much texture, shine, and detail show in photos.",opts:["Black","Brunette","Blonde","Red","Gray / silver","Fashion color"]},
  {id:"hairLength",q:"What is your current hair length?",sub:"This determines whether an inspo style needs extensions, padding, or a different shape.",opts:["Pixie / short","Bob / lob","Shoulder length","Chest length","Waist length or longer"]},
];
const MAIN_Q = [
  {id:"venue",q:"Where is your wedding?",sub:"",opts:["Beach/waterfront","Ballroom","Garden/outdoor","City/rooftop","Intimate/elopement","Other"]},
  {id:"dress",q:"Your dress silhouette?",sub:"",opts:["Flowing/romantic","Sleek/structured","Ballgown","Boho","Minimalist/slip","Other"]},
  {id:"fear",q:"What scares you most about your wedding day glam?",sub:"Be honest — this shapes everything.",opts:["Looking overdone or unlike myself","Not looking enough — like I didn't try","My makeup fading by dinner","Not looking like myself","Looking like every other bride"]},
  {id:"transform",q:"Do you want to look transformed or elevated?",sub:"There is no right answer.",opts:["Transformed — I want to feel like a different, elevated version","Elevated — I want to look unmistakably like me, but radiant"]},
  {id:"makeup_rel",q:"Your real relationship with makeup day-to-day?",sub:"Not what you want for your wedding — your actual normal.",opts:["Full face daily","Mascara and lip gloss","Skincare only — I rarely wear makeup","Depends on the day"]},
  {id:"priority",q:"What matters most above anything else?",sub:"",opts:["Longevity — holds 12+ hours no matter what","Drama and visual impact","Softness and romance","Looking expensive","Comfort all day"]},
  {id:"photo",q:"Your photographer's style?",sub:"Makeup behaves differently in different lighting.",opts:["Light & airy","Dark & moody","Editorial / film","Classic documentary","Haven't booked yet"]},
  {id:"venue2",q:"What's the climate like on your wedding day?",sub:"",opts:["Hot and humid (coastal, tropical, summer)","Hot and dry (desert, indoor AC)","Mild and temperate","Cool or cold","Indoor venue — climate controlled"]},
];
const FAQ_CATEGORIES = [
  {
    category: "Timeline",
    questions: [
      "When should I book hair and makeup?",
      "How much time should I reserve on the wedding morning?",
      "When should I schedule my preview?",
    ],
  },
  {
    category: "Hair",
    questions: [
      "Will my hair hold this style all day?",
      "Should I wear my hair up or down for my venue?",
      "What style works best with my hair texture?",
    ],
  },
  {
    category: "Makeup",
    questions: [
      "How do I make my makeup last through heat and photos?",
      "What makeup style fits my bridal archetype?",
      "What should I ask for at my preview appointment?",
    ],
  },
  {
    category: "Skin Prep",
    questions: [
      "When should I start serious skin prep?",
      "What should I avoid the week of the wedding?",
      "How do I prep oily or dry skin for makeup?",
    ],
  },
  {
    category: "Extensions",
    questions: [
      "Do I need extensions for my inspo style?",
      "What type of extensions are best for bridal hair?",
      "When should I buy or test extensions?",
    ],
  },
];
const BRIDAL_BEAUTY_FAQS = [
  {
    question: "When should I book hair and makeup?",
    answer: "For weddings, start looking 9 to 12 months out if your date is during peak season, on a holiday weekend, or in a high-demand location. If your wedding is smaller or off-season, 6 to 9 months can still work, but the best-fit artists may book earlier.",
  },
  {
    question: "How do I choose a bridal beauty artist?",
    answer: "Look for consistent portfolio work on real brides, experience with your hair texture and makeup style, clear communication, transparent pricing, and a calm presence. The right artist should understand your vision and also be honest about what will last and photograph well.",
  },
  {
    question: "Should I do a preview/trial?",
    answer: "Yes if it is available. A preview helps test your look, timing, product wear, comfort level, and how your inspo translates to your actual features, hair, skin, dress, and wedding setting.",
  },
  {
    question: "What should I look for in portfolio photos?",
    answer: "Look for clear, recent work in natural and professional lighting, brides with similar features or hair texture, clean skin finish, balanced lashes, smooth hair shaping, and styles that still look polished from multiple angles.",
  },
  {
    question: "How do I know if my inspo will work for me?",
    answer: "Compare your inspo to your hair length, density, texture, face shape, eye shape, makeup comfort level, venue, dress, and photo style. The goal is not to copy a photo exactly, but to translate the feeling of it onto you.",
  },
  {
    question: "What should I ask before booking?",
    answer: "Ask about availability, services included, pricing, travel fees, preview options, timing for the wedding morning, assistant needs, minimums, contract terms, payment schedule, cancellation policy, and what they need from you before the wedding.",
  },
  {
    question: "What affects how long hair and makeup lasts?",
    answer: "Longevity depends on skin prep, hair prep, weather, humidity, hair texture, product choice, tears, touch, timeline, and whether the style matches your natural hair and skin behavior. Good prep and realistic styling choices matter as much as products.",
  },
  {
    question: "How should I prep my skin before the wedding?",
    answer: "Keep your routine consistent, focus on hydration and barrier support, avoid new active products close to the wedding, and do not schedule aggressive treatments right before the day. Arrive with clean, moisturized skin unless your artist asks otherwise.",
  },
  {
    question: "How should I prep my hair before the wedding?",
    answer: "Follow your artist's instructions, because prep varies by texture and style. In general, avoid heavy oils or masks right before styling, make sure your hair is fully dry, and clarify timing for washing, blow drying, extensions, and accessories.",
  },
  {
    question: "What should I bring on the wedding morning?",
    answer: "Bring your lip color or gloss, touch-up powder if you use it, hair accessories, extensions if needed, veil or headpiece, inspiration notes from your preview, a button-down or robe, water, and anything your artist specifically requested.",
  },
];

function deriveHairType(ans) {
  const p = ans.hairPattern;
  if(p==="Dries completely straight") return "Straight";
  if(p==="Has a slight wave or bend") return "Wavy";
  if(p==="Forms loose, defined waves") return "Wavy";
  if(p==="Forms tight curls or ringlets") return "Curly";
  if(p==="Has very tight coils or kinks") return "Coily";
  return "Wavy";
}
function deriveHairDensity(ans) {
  const d = ans.hairDensity2;
  if(d==="Very thin — less than an inch around") return "Fine / sparse";
  if(d==="Thick — more than an inch around") return "Thick / dense";
  return "Medium";
}
function deriveSkinType(ans) {
  const l=ans.skinLook;
  if(l==="Shiny or greasy, especially in the T-zone") return "Oily";
  if(l==="Tight, flaky, or uncomfortable") return "Dry";
  if(l==="A mix — shiny in some places, dry in others") return "Combination";
  if(l==="Easily irritated, red, or reactive") return "Sensitive";
  return "Normal";
}

// ── BEAUTY TIMELINE (date-based, auto-populated) ───────────────────────────
function parseLocalDate(dateStr) {
  if(!dateStr) return null;
  const [year,month,day] = dateStr.split("-").map(Number);
  if(!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0);
}

function daysBetween(fromDate, toDate) {
  const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(), 12, 0, 0);
  const end = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 12, 0, 0);
  return Math.round((end - start) / 86400000);
}

function formatTimelineDate(date) {
  return date.toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" });
}

function getTimeline(weddingDate, archetype) {
  const wd = parseLocalDate(weddingDate);
  if(!wd) return [];
  const today = new Date();
  const items = [
    {daysOut:365,title:"Book your artist",detail:"Top artists book 12+ months out. Secure your date now.",cat:"Booking",urgent:true},
    {daysOut:300,title:"Start a consistent skincare routine",detail:"Cleanse, moisturize, SPF daily. Consistency over perfection.",cat:"Skin"},
    {daysOut:270,title:"Begin hair health treatments",detail:"Weekly deep conditioning. Consider a trim to remove damage.",cat:"Hair"},
    {daysOut:240,title:"Book a dermatologist or esthetician consult",detail:"Start any targeted treatments with enough runway.",cat:"Skin"},
    {daysOut:180,title:"Schedule your hair & makeup preview",detail:"Around 6 months out is ideal. Bring inspo photos, dress photo, accessories, and notes.",cat:"Booking"},
    {daysOut:150,title:"Skin treatments window",detail:"Peels, microneedling, laser — do them now, not later. Allow full recovery.",cat:"Skin"},
    {daysOut:120,title:"Evaluate extension needs",detail:archetype&&(archetype.includes("wave")||archetype.includes("full"))?"Your archetype may need clip-in or tape extensions for the desired density.":"Discuss with your artist whether your hair density needs support for your chosen look.",cat:"Hair"},
    {daysOut:90,title:"Confirm bridal party beauty plan",detail:"Lock in headcount, timing, and logistics for your party.",cat:"Booking"},
    {daysOut:60,title:"Hair & makeup preview",detail:"Arrive with clean, dry hair unless your artist tells you otherwise. Bring the whole vision.",cat:"Preview",urgent:true},
    {daysOut:45,title:"Second skin check-in",detail:"Adjust your routine based on your current skin condition.",cat:"Skin"},
    {daysOut:30,title:"Stop experimenting",detail:"No new products, procedures, or drastic changes. We are not inviting chaos to the group chat.",cat:"Skin",urgent:true},
    {daysOut:21,title:"Lash lift, extensions, or strip-lash decision",detail:"Make the lash plan early enough to test comfort and shape.",cat:"Beauty"},
    {daysOut:14,title:"Brow appointment",detail:"Shape and tint with enough time for redness to calm.",cat:"Beauty"},
    {daysOut:7,title:"Final hair trim or gloss",detail:"Freshen ends if needed. No dramatic new color decisions.",cat:"Hair"},
    {daysOut:5,title:"Facial, gentle only",detail:"Hydrating only. No extractions. No surprise peeling. Behave.",cat:"Skin"},
    {daysOut:3,title:"Pack your touch-up kit",detail:"Lip product, blotting papers, setting spray, mini hairspray, pins, and tissues.",cat:"Day-Of",urgent:true},
    {daysOut:2,title:"Hydrate aggressively",detail:"Water in. Alcohol down. Your skin is taking attendance.",cat:"Prep"},
    {daysOut:1,title:"Wash and fully dry hair",detail:"Follow your artist's prep instructions exactly.",cat:"Day-Of",urgent:true},
    {daysOut:0,title:"Wedding day",detail:"The timeline is built. The prep is done. Let the glam do its job.",cat:"Day-Of",urgent:true},
  ];
  return items.map(item => {
    const itemDate = new Date(wd);
    itemDate.setDate(wd.getDate() - item.daysOut);
    const daysUntilTask = daysBetween(today, itemDate);
    let status = "upcoming";
    if(daysUntilTask < 0) status = "overdue";
    if(daysUntilTask >= 0 && daysUntilTask <= 14) status = "now";
    return { ...item, id:`${item.daysOut}-${item.title}`, itemDate, daysUntilTask, status, dateLabel:formatTimelineDate(itemDate) };
  }).sort((a,b)=>a.itemDate - b.itemDate);
}

// ── ARTISTS (extensive) ─────────────────────────────────────────────────────
const ARTISTS = [
  {id:1,name:"Bailee Cribb Bridal",owner:"Bailee Cribb",city:"Myrtle Beach",state:"SC",services:"Hair + Makeup",badge:"Signature Artist",
   specialties:["Hollywood Waves","The Bailee Wave + Sculpt™","Airbrush","Structured Bridal Styling"],not_ideal:["Undone boho texture","Ultra-natural no-makeup","Loose unlstructured waves"],
   aesthetic:"Coastal editorial glam — structured, polished, engineered to hold.",bio:"Specializing in Hollywood waves, structured bridal styling, and airbrushed makeup designed to hold in coastal heat, humidity, and long timelines. Signature: The Bailee Wave + Sculpt™.",
   best_for:["Fine hair brides","Coastal/humid weddings","Longevity-focused brides","Editorial photography"],
   portfolio:"Consistent editorial coastal bridal. Strong wave structure. Clean airbrush finish.",education:"Advanced airbrush · Coastal bridal specialization",rating:5.0,reviews:84,avatar:"BC",travel:true,price:"Request quote",fit_styles:["structured_wave","sculpted_updo","full_glam","soft_glam"],email:"bailee@baileecribbbridal.com",website:"baileecribbbridal.com",
   // portfolio_photos: paste Bailee's actual Supabase public URLs here, one object per photo:
   // { id: "bailee-portfolio-1", image_url: "https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>.jpg", category, look_type, hair_look, makeup_look }
   portfolio_photos:[]},
  {id:2,name:"Glamour Cosmetics",owner:"Sarah Levin",city:"Boston",state:"MA",services:"Hair + Makeup",
   specialties:["Soft Glam","Bridal Waves","Airbrush","Inclusive skin-matching"],not_ideal:["Heavy editorial","Extreme updos","Very dark/moody makeup"],
   aesthetic:"Modern soft glam — glowy, current, timeless.",bio:"Named Best of Boston. Signature soft glam. A team that makes brides feel like the best version of themselves.",
   best_for:["All skin tones","Large parties","Soft and glowing looks"],
   portfolio:"High volume, consistent soft-glam. Excellent inclusive portfolio.",education:"Boston Aesthetics Institute · Airbrush Pro",rating:4.9,reviews:312,avatar:"GC",travel:true,price:"Request quote",fit_styles:["soft_glam","dewy_skin","natural_beauty"],email:"bookings@glamourcosmetics.com",website:"glamourcosmetics.com"},
  {id:3,name:"Samara Beauty",owner:"Nicole Samara Iyer",city:"Santa Barbara",state:"CA",services:"Hair + Makeup",
   specialties:["Hollywood Waves","Fresh elevated looks","All hair types","Longevity-focused"],not_ideal:["Extreme editorial","Very heavy glam"],
   aesthetic:"Fresh, elevated, editorial bridal.",bio:"15 years, 1,000+ weddings. Fresh elevated looks that last. Available for destination bookings.",
   best_for:["Destination weddings","Fine hair","Long timelines"],
   portfolio:"Impeccable consistency. Exceptional wave structure.",education:"15+ years · International editorial credits",rating:5.0,reviews:204,avatar:"NS",travel:true,price:"Request quote",fit_styles:["structured_wave","soft_glam","classic_timeless"],email:"nicole@samarabeauty.com",website:"samarabeauty.com"},
  {id:4,name:"Triplow Beauty",owner:"Stacey Triplow",city:"San Diego",state:"CA",services:"Hair + Makeup",
   specialties:["Luxe minimalism","Editorial","Soft Glam"],not_ideal:["Boho looks","Heavy full glam","Vintage-specific technique"],
   aesthetic:"Luxe minimalism — enhancing, never overpowering.",bio:"17+ years. Internationally acclaimed. Signature: luxe minimalism.",
   best_for:["Editorial photography","Minimalist brides","Destination"],
   portfolio:"Refined editorial quality. Strong skin work.",education:"17 years · Commercial/editorial credits",rating:4.9,reviews:178,avatar:"ST",travel:true,price:"Request quote",fit_styles:["minimalist","soft_glam","bold_editorial"],email:"book@triplowbeauty.com",website:"triplowbeauty.com"},
  {id:5,name:"Etoilly Artistry",owner:"Maria Espinoza",city:"Houston",state:"TX",services:"Hair + Makeup",
   specialties:["Full Glam","Sculpted Updo","Airbrush","Large party logistics"],not_ideal:["Minimal looks","Boho texture","Avant-garde"],
   aesthetic:"Luxury full-glam bridal — executed at scale.",bio:"Houston and Dallas studios. Built for large parties. Visionary team.",
   best_for:["Large bridal parties","Full glam brides","Humid climate"],
   portfolio:"Excellent large-party consistency. Strong updo architecture.",education:"Multi-artist team · Airbrush advanced",rating:4.9,reviews:143,avatar:"EA",travel:true,price:"Request quote",fit_styles:["full_glam","sculpted_updo","structured_wave"],email:"hello@etoillyartistry.com",website:"etoillyartistry.com"},
  {id:6,name:"Beauty Asylum",owner:"Jessica Cole",city:"Charlotte",state:"NC",services:"Hair + Makeup",
   specialties:["Soft Glam","Chic Bridal Styling","Airbrush","On-location SE"],not_ideal:["Avant-garde","Very dark moody","Highly technical vintage"],
   aesthetic:"Soft glam and chic — modern, effortless, Southeast-ready.",bio:"16+ years. SE specialist. 5-star consistency across large parties.",
   best_for:["Southeast weddings","Soft glam brides","Scheduling-sensitive parties"],
   portfolio:"Very high review volume. Consistent soft-glam.",education:"16 years · SE regional specialist",rating:5.0,reviews:267,avatar:"BA",travel:true,price:"Request quote",fit_styles:["soft_glam","classic_timeless","natural_beauty"],email:"book@beautyasylum.com",website:"beautyasylum.com"},
  {id:7,name:"Torie Conn Artistry",owner:"Torie Conn",city:"Chicago",state:"IL",services:"Makeup Only",
   specialties:["Editorial","Full Glam","Bold Color","TV/Film technique"],not_ideal:["Hair styling","Soft understated looks"],
   aesthetic:"Bold editorial bridal — television technique on your wedding day.",bio:"ABC-TV, NYFW, celebrity clientele. Strong bold makeup specialist.",
   best_for:["Bold brides","Editorial photography","TV-quality makeup"],
   portfolio:"Exceptional editorial portfolio. Strong bold and graphic work.",education:"Make Up First School · ABC-TV · NYFW",rating:4.8,reviews:91,avatar:"TC",travel:false,price:"Request quote",fit_styles:["bold_editorial","full_glam","dark_moody"],email:"torie@torieconnartistry.com",website:"torieconnartistry.com"},
  {id:8,name:"Pre-Dame Beauty",owner:"Team",city:"New York",state:"NY",services:"Hair + Makeup",
   specialties:["Editorial","Bold Glam","Sculpted Updo","Feature-based artistry"],not_ideal:["Natural boho looks","Minimal makeup","Standard traditional"],
   aesthetic:"NYC boutique editorial — elevated, feature-forward.",bio:"NYC boutique team. Editorial eye applied to bridal.",
   best_for:["Editorial photography","Bold and graphic brides","NYC area"],
   portfolio:"Consistent editorial. Feature-based artistry.",education:"NYC industry training",rating:4.9,reviews:156,avatar:"PD",travel:true,price:"Request quote",fit_styles:["bold_editorial","dark_moody","sculpted_updo"],email:"inquire@predamebeauty.com",website:"predamebeauty.com"},
  {id:9,name:"Wildeflower Collective",owner:"Analisa Marie",city:"Portland",state:"OR",services:"Hair + Makeup",
   specialties:["Natural texture","Boho Waves","Minimal makeup","Inclusive beauty"],not_ideal:["Heavy full glam","Structured Hollywood waves","Dramatic updos"],
   aesthetic:"Luminous, skin-focused, inclusive.",bio:"13 years of inclusive bridal beauty. Every bride celebrated.",
   best_for:["Natural texture","Boho brides","Inclusive/LGBTQ+ weddings"],
   portfolio:"Beautiful natural texture work. Diverse and inclusive.",education:"13 years · Inclusive beauty advocate",rating:4.8,reviews:88,avatar:"WC",travel:true,price:"Request quote",fit_styles:["coastal_boho","natural_beauty","dewy_skin"],email:"hello@wildeflowercollective.com",website:"wildeflowercollective.com"},
  {id:10,name:"J Fink Beauty",owner:"J Fink",city:"Philadelphia",state:"PA",services:"Hair + Makeup",
   specialties:["Soft Glam","Classic Bridal","Natural-looking polish"],not_ideal:["Bold editorial","Heavy dark glam"],
   aesthetic:"Polished, relationship-driven — you look like you, perfected.",bio:"Connection between artist and bride is paramount. Luxury experience start to finish.",
   best_for:["Classic brides","Relationship-focused experience","PA/NJ area"],
   portfolio:"Consistent soft-glam. Excellent communication reputation.",education:"Bridal specialization · Client-relationship training",rating:5.0,reviews:119,avatar:"JF",travel:true,price:"Request quote",fit_styles:["soft_glam","classic_timeless","natural_beauty"],email:"jfink@jfinkbeauty.com",website:"jfinkbeauty.com"},
  {id:11,name:"Beautiful Brides Philly",owner:"Dana Persia",city:"Philadelphia",state:"PA",services:"Hair + Makeup",
   specialties:["Classic","Full Glam","Airbrush","Licensed esthetics"],not_ideal:["Boho texture","Editorial avant-garde"],
   aesthetic:"Refined classic bridal — polished, full-service.",bio:"Dana Persia — 20 years, licensed esthetician. 1,500+ brides.",
   best_for:["Classic and glam brides","Mature skin","Large parties"],
   portfolio:"20-year track record. Classic-to-glam range.",education:"Licensed esthetician · 20 years · Airbrush",rating:4.9,reviews:340,avatar:"BB",travel:false,price:"Request quote",fit_styles:["classic_timeless","full_glam","soft_glam"],email:"dana@beautifulbridesphilly.com",website:"beautifulbridesphilly.com"},
  {id:12,name:"Daniela Gozlan Bridal",owner:"Daniela Gozlan",city:"Miami",state:"FL",services:"Makeup Only",
   specialties:["Celebrity technique","Editorial","Natural glow","Bone-structure artistry"],not_ideal:["Hair styling","Standard traditional"],
   aesthetic:"Celebrity-level skin artistry — structure-based, luminous.",bio:"Celebrity clients: Elle MacPherson, Paris Hilton. Bone structure and light are the technique.",
   best_for:["Celebrity-level finish","Editorial photography","Destination Miami"],
   portfolio:"Celebrity-level portfolio. Exceptional skin technique.",education:"Romanian trained · NYC celebrity career",rating:5.0,reviews:97,avatar:"DG",travel:true,price:"Request quote",fit_styles:["bold_editorial","natural_beauty","dewy_skin"],email:"daniela@danielagozlanbridal.com",website:"danielagozlanbridal.com"},
  {id:13,name:"I.M. Artistry",owner:"Team",city:"Tacoma",state:"WA",services:"Hair + Makeup",
   specialties:["Luxury updo","Classic waves","Formal bridal","Full Glam"],not_ideal:["Boho or undone looks","Ultra-minimal makeup"],
   aesthetic:"Opulent, luxury bridal — atelier-trained.",bio:"Atelier-trained luxury team. Tacoma and Kirkland. Every bride treated like royalty.",
   best_for:["Formal venues","Updo brides","Luxury experience"],
   portfolio:"Consistent luxury finish. Strong updo architecture.",education:"Decades of atelier training",rating:4.9,reviews:73,avatar:"IM",travel:true,price:"Request quote",fit_styles:["sculpted_updo","classic_timeless","full_glam"],email:"book@imartistry.com",website:"imartistry.com"},
  {id:14,name:"Teresa Miranda Beauty",owner:"Teresa Miranda",city:"Los Angeles",state:"CA",services:"Hair + Makeup",
   specialties:["Skin prep + day-of","Dewy glow","Soft Glam","Lash/brow work"],not_ideal:["Heavy full glam","Dramatic updo","Bold editorial"],
   aesthetic:"Skin-first bridal — prep, glow, polish from the ground up.",bio:"Full-service skin prep + wedding day artistry. Studio for pre-wedding facials, lash lifts, brow.",
   best_for:["Skin-conscious brides","Dewy/glowing looks","LA area"],
   portfolio:"Exceptional skin quality. 5-star on The Knot.",education:"Licensed esthetician · Lash/brow certified · The Knot Best 2024",rating:5.0,reviews:289,avatar:"TM",travel:true,price:"Request quote",fit_styles:["dewy_skin","soft_glam","natural_beauty"],email:"teresa@tmirandabeauty.com",website:"tmirandabeauty.com"},
  {id:15,name:"Emily Lynn & Co.",owner:"Emily Lynn",city:"Los Angeles",state:"CA",services:"Hair + Makeup",
   specialties:["Cool-girl editorial","Boho waves","Natural texture","Published editorial"],not_ideal:["Traditional classic","Heavy glam","Formal structured updos"],
   aesthetic:"Cool-girl bridal — published, editorial, effortless.",bio:"Published nationwide, film and TV. Good vibes and great beauty for the cool-girl bride.",
   best_for:["Boho brides","Editorial photography","Cool/casual vibe"],
   portfolio:"Published work. Strong editorial boho.",education:"Film/TV credits · Ongoing editorial",rating:4.9,reviews:112,avatar:"EL",travel:true,price:"Request quote",fit_styles:["coastal_boho","bold_editorial","natural_beauty"],email:"book@emilylynnandc.com",website:"emilylynnandc.com"},
  {id:16,name:"Mansi Bridal",owner:"Mansi Patel",city:"Edison",state:"NJ",services:"Hair + Makeup",
   specialties:["South Asian bridal","Diverse skin tones","Traditional + modern fusion"],not_ideal:["Very minimal looks","Boho undone styling"],
   aesthetic:"South Asian and multicultural bridal — rich, precise, celebratory.",bio:"South Asian specialist. 7 years. Highlights natural beauty across all skin tones.",
   best_for:["South Asian weddings","Diverse skin tones","NJ/NY area"],
   portfolio:"Strong South Asian portfolio. Diverse and inclusive.",education:"7 years South Asian specialization",rating:4.9,reviews:67,avatar:"MP",travel:true,price:"Request quote",fit_styles:["full_glam","classic_timeless","natural_beauty"],email:"mansi@mansibridal.com",website:"mansibridal.com"},
  {id:17,name:"Page Beauty",owner:"Tanya Bures",city:"New York",state:"NY",services:"Hair + Makeup",
   specialties:["Natural-looking beauty","Soft elegant","Effortless polish"],not_ideal:["Heavy drama","Full glam","Bold editorial"],
   aesthetic:"Refined effortless — every client already their best version.",bio:"Founded 2013. Every client is already their best version. Effortless, chic, timeless.",
   best_for:["Minimalist brides","Natural beauty","NYC area"],
   portfolio:"Consistent natural elegance. Strong editorial and bridal.",education:"Since 2013 · Top wedding planners and photographers",rating:4.9,reviews:88,avatar:"PB",travel:true,price:"Request quote",fit_styles:["minimalist","natural_beauty","dewy_skin"],email:"tanya@pagebeauty.com",website:"pagebeauty.com"},
  {id:18,name:"Innovations by Jen",owner:"Jennifer",city:"Cleveland",state:"OH",services:"Makeup Only",
   specialties:["Traditional + airbrush","Classic bridal","Mature skin"],not_ideal:["Hair styling","Bold editorial","Heavy dark makeup"],
   aesthetic:"Classic, confidence-building — 35 years of expertise.",bio:"35+ years. Traditional and airbrush. Ohio regional specialist.",
   best_for:["Classic brides","Mature skin","Ohio/Midwest"],
   portfolio:"Very high review count. Classic-traditional consistency.",education:"35+ years licensed · Airbrush certification",rating:4.8,reviews:203,avatar:"IJ",travel:false,price:"Request quote",fit_styles:["classic_timeless","soft_glam","natural_beauty"],email:"jen@innovationsbyjenmakeup.com",website:"innovationsbyjenmakeup.com"},
  {id:19,name:"Kim Baker Beauty",owner:"Kim Baker",city:"Nashville",state:"TN",services:"Hair + Makeup",
   specialties:["Soft Glam","Bridal Waves","Editorial","Airbrush"],not_ideal:["Ultra-minimal","Boho undone","Heavy vintage"],
   aesthetic:"Nashville-chic — polished, warm, photographically flawless.",bio:"Nashville bridal specialist. Strong soft glam and polished wave work.",
   best_for:["Southern weddings","Airbrush finish","Editorial photography"],
   portfolio:"Consistent polished finish. Strong warm-toned makeup.",education:"Nashville industry training · Airbrush specialist",rating:4.9,reviews:134,avatar:"KB",travel:true,price:"Request quote",fit_styles:["soft_glam","structured_wave","classic_timeless"],email:"kim@kimbakeerbeauty.com",website:"kimbakerbeauty.com"},
  {id:20,name:"Blush & Co.",owner:"Lauren Hughes",city:"Atlanta",state:"GA",services:"Hair + Makeup",
   specialties:["Soft Glam","Classic Bridal","Airbrush","Large parties"],not_ideal:["Extreme editorial","Very dark makeup","Boho texture"],
   aesthetic:"Southern refined — warm, classic, consistently beautiful.",bio:"Atlanta-based team. Warm, polished bridal beauty for the Southern bride.",
   best_for:["Southern venues","Large parties","Classic glam"],
   portfolio:"Strong volume and consistency. Southern bridal aesthetic.",education:"8 years · Team of artists · Airbrush certified",rating:4.8,reviews:156,avatar:"BC2",travel:true,price:"Request quote",fit_styles:["soft_glam","classic_timeless","full_glam"],email:"hello@blushandco.com",website:"blushandco.com"},
  {id:21,name:"Abbi Neel Makeup Artistry",owner:"Abbi Neel",city:"Boston",state:"MA",services:"Makeup Only",
   specialties:["Personalized bridal","Soft Glam","Natural-looking"],not_ideal:["Hair styling","Very bold/editorial"],
   aesthetic:"Personalized, unique — each bride's beauty expressed.",bio:"8+ years. Dedicated to personalized, unique experience for each bride.",
   best_for:["Boston area","Personalized experience","Natural-looking makeup"],
   portfolio:"Strong personalized portfolio. Excellent client reviews.",education:"8+ years · Continuous bridal education",rating:4.8,reviews:72,avatar:"AN",travel:true,price:"Request quote",fit_styles:["soft_glam","natural_beauty","dewy_skin"],email:"abbi@abbineelmakeup.com",website:"abbineelmakeup.com"},
  {id:22,name:"Erica Cassell Beauty",owner:"Erica Cassell",city:"Charleston",state:"SC",services:"Hair + Makeup",
   specialties:["Coastal Bridal","Soft Glam","Bridal Waves","Airbrush"],not_ideal:["Very heavy glam","Extreme editorial"],
   aesthetic:"Coastal charm — effortless, Southern, glowing.",bio:"Charleston coastal bridal specialist. Soft and polished looks that hold in humidity.",
   best_for:["Coastal weddings","Humidity resistance","Charleston/SC area"],
   portfolio:"Strong coastal bridal aesthetic. Consistent quality.",education:"Charleston bridal specialist",rating:4.9,reviews:91,avatar:"EC",travel:true,price:"Request quote",fit_styles:["soft_glam","structured_wave","coastal_boho"],email:"erica@ericacassellbeauty.com",website:"ericacassellbeauty.com"},
  {id:23,name:"TEAM Inc.",owner:"Marlynda Romero",city:"Tampa",state:"FL",services:"Hair + Makeup",
   specialties:["Natural wedding styles","Timeless elegant","Groom/groomsmen","LGBTQ+ inclusive"],not_ideal:["Heavy editorial","Extreme updos"],
   aesthetic:"Natural, timeless, inclusive — 20+ years of dream-job passion.",bio:"20+ years. Natural-looking timeless styles. LGBTQ+ allies. Grooms and groomsmen welcome.",
   best_for:["Natural brides","Inclusive weddings","Groom styling","FL heat"],
   portfolio:"20-year portfolio. Natural and timeless consistency.",education:"20+ years · LGBTQ+ ally",rating:4.8,reviews:167,avatar:"TI",travel:true,price:"Request quote",fit_styles:["natural_beauty","classic_timeless","coastal_boho"],email:"team@teaminc.com",website:"teaminc.com"},
  {id:24,name:"Brittany Renee Beauty",owner:"Brittany Renee",city:"Phoenix",state:"AZ",services:"Hair + Makeup",
   specialties:["Desert Bridal","Airbrush","Full Glam","Longevity in heat"],not_ideal:["Very natural/minimal looks","Boho undone texture"],
   aesthetic:"Desert glam — airbrush-ready, heat-proof, polished.",bio:"Phoenix bridal specialist. Expert in longevity in extreme heat. Airbrush specialist.",
   best_for:["Desert/outdoor weddings","Extreme heat","Full glam in heat"],
   portfolio:"Strong desert bridal aesthetic. Airbrush consistency.",education:"AZ bridal specialist · Airbrush advanced",rating:4.9,reviews:108,avatar:"BR",travel:true,price:"Request quote",fit_styles:["full_glam","structured_wave","classic_timeless"],email:"brittany@brittanyreneebeauty.com",website:"brittanyreneebeauty.com"},
  {id:25,name:"Luxe Artistry",owner:"Victoria Chen",city:"San Francisco",state:"CA",services:"Hair + Makeup",
   specialties:["Editorial","Minimalist","Asian skin tones","Soft Glam"],not_ideal:["Heavy traditional glam","Very boho undone"],
   aesthetic:"Modern editorial — clean, precise, skin-forward.",bio:"SF-based editorial bridal artist. Specializes in Asian skin tones and editorial aesthetics.",
   best_for:["Editorial photography","Asian skin tones","Minimalist brides"],
   portfolio:"Clean editorial work. Strong skin expertise.",education:"SF industry training · Editorial credits",rating:4.8,reviews:63,avatar:"VC",travel:true,price:"Request quote",fit_styles:["bold_editorial","minimalist","soft_glam"],email:"victoria@luxeartistry.com",website:"luxeartistry.com"},
];

function normalizedArtistMatchValue(value){
  return String(value||"").trim().toLowerCase().replace(/\s+/g," ");
}

function artistEmailMatchKey(artist){
  return normalizedArtistMatchValue(artist?.email);
}

function artistBusinessMatchKey(artist){
  return normalizedArtistMatchValue(artist?.business_name||artist?.name);
}

const US_STATES = ["All States","AK","AL","AR","AZ","CA","CO","CT","DC","DE","FL","GA","HI","IA","ID","IL","IN","KS","KY","LA","MA","MD","ME","MI","MN","MO","MS","MT","NC","ND","NE","NH","NJ","NM","NV","NY","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VA","VT","WA","WI","WV","WY"];
const PROFILE_COUNTRIES = ["United States","Canada","United Kingdom","Australia","Other"];
const PROFILE_US_STATES = US_STATES.filter(state=>state!=="All States");
const CANADIAN_PROVINCES = ["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"];
const ARTIST_APP_COUNTRIES = ["United States","Canada","United Kingdom","Australia","New Zealand","Other"];
const UK_REGIONS = ["England","Scotland","Wales","Northern Ireland"];
const AU_STATES = ["Australian Capital Territory","New South Wales","Northern Territory","Queensland","South Australia","Tasmania","Victoria","Western Australia"];
const NZ_REGIONS = ["Auckland","Bay of Plenty","Canterbury","Gisborne","Hawke's Bay","Manawatu-Whanganui","Marlborough","Nelson","Northland","Otago","Southland","Taranaki","Tasman","Waikato","Wellington","West Coast"];
const ARTIST_APP_REGION_OPTIONS = {
  "United States": {label:"State", placeholder:"Select a state", options: PROFILE_US_STATES},
  "Canada": {label:"Province / Territory", placeholder:"Select a province/territory", options: CANADIAN_PROVINCES},
  "United Kingdom": {label:"Country / Region", placeholder:"Select a region", options: UK_REGIONS},
  "Australia": {label:"State / Territory", placeholder:"Select a state/territory", options: AU_STATES},
  "New Zealand": {label:"Region", placeholder:"Select a region", options: NZ_REGIONS},
};
const SERVICES_F = ["All Services","Hair + Makeup","Hair Only","Makeup Only"];
const PRICE_LEGEND = "Pricing varies by date, location, travel, and services. Visit each artist’s website for current pricing.";

function artistFit(artist, result) {
  if(!result) return 70;
  let score = 55;
  const fitStyles = Array.isArray(artist?.fit_styles) ? artist.fit_styles : [];
  if(fitStyles.includes(result.primary)) score += 30;
  if(fitStyles.includes(result.secondary)) score += 15;
  return Math.min(99, score);
}

function ScoreBar({label,value}){
  const color = value>=90?"#2D6E6E":value>=80?"#8B6B4A":"#C8A97E";
  return(
    <div style={{marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
        <span style={{fontFamily:ag,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray}}>{label.replace(/_/g," ")}</span>
        <span style={{fontFamily:ve,fontSize:13,color}}>{value}</span>
      </div>
      <div style={{height:2.5,background:"#eee"}}><div style={{height:2.5,width:`${value}%`,background:color,transition:"width 1s ease"}}/></div>
    </div>
  );
}

function getInitials(name,fallback="BE"){
  const parts=String(name||"").trim().split(/\s+/).filter(Boolean);
  if(parts.length===0)return fallback;
  return parts.slice(0,2).map(part=>part[0]?.toUpperCase()).join("")||fallback;
}

function InitialsFallback({name,label,size=9,background=C.nearBlack,color=C.lavender}){
  const initials=getInitials(name);
  return(
    <div style={{width:"100%",height:"100%",background,display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center",fontFamily:ag,fontSize:size,letterSpacing:"0.08em",color,lineHeight:1.4}}>
      {name?initials:label}
    </div>
  );
}

function ImagePlaceholder({label="No photo",background=C.iceBlue,color=C.gray}){
  return(
    <div style={{width:"100%",height:"100%",background,border:`0.5px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center",fontFamily:co,fontSize:12,fontStyle:"italic",color,padding:"0.75rem",boxSizing:"border-box",lineHeight:1.4}}>
      {label}
    </div>
  );
}

function SafeImage({src,alt="",style={},fallback,loadingLabel="Loading..."}) {
  const cleanSrc=getArtistStorageDisplayUrl(src);
  const [status,setStatus]=useState(cleanSrc?"loading":"error");

  useEffect(()=>{
    setStatus(cleanSrc?"loading":"error");
  },[cleanSrc]);

  return(
    <div style={{position:"relative",width:"100%",height:"100%",overflow:"hidden"}}>
      {status==="error"&&fallback}
      {status==="loading"&&(
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:C.iceBlue,fontFamily:co,fontSize:11,fontStyle:"italic",color:C.gray,zIndex:1}}>
          {loadingLabel}
        </div>
      )}
      {cleanSrc&&status!=="error"&&(
        <img
          src={cleanSrc}
          alt={alt}
          onLoad={()=>setStatus("loaded")}
          onError={()=>setStatus("error")}
          style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",display:"block",...style}}
        />
      )}
    </div>
  );
}

function ForgotPasswordScreen({email,setEmail,loading,error,onSendReset,onBack,resetSent}){
  return(
    <>
      <p style={{fontFamily:co,fontSize:14,color:C.gray,lineHeight:1.6,margin:"0 0 0.25rem"}}>Enter your email and we’ll send a password reset link.</p>
      <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" autoComplete="email" style={{border:"0.5px solid #ccc",padding:"11px 12px",fontSize:16,fontFamily:co,outline:"none"}}/>
      {error&&<p style={{fontFamily:co,fontSize:13,color:"#cc4444",fontStyle:"italic",margin:"0.2rem 0"}}>{error}</p>}
      {resetSent&&<p style={{fontFamily:co,fontSize:13,color:C.teal,fontStyle:"italic",margin:"0.2rem 0"}}>Password reset email sent. Tap the link in your email to continue.</p>}
      <button onClick={onSendReset} disabled={loading||!email.trim()} style={{background:C.black,color:C.white,border:"none",padding:"11px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase",opacity:loading||!email.trim()?0.5:1}}>{loading?"SENDING...":"SEND RESET LINK"}</button>
      <button onClick={onBack} style={{background:"transparent",border:`0.5px solid ${C.border}`,fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,cursor:"pointer",padding:"9px 13px",width:"100%"}}>BACK TO SIGN IN</button>
    </>
  );
}

function ResetPasswordScreen({password,setPassword,confirmPassword,setConfirmPassword,loading,error,onSave,resetSent}){
  return(
    <>
      <p style={{fontFamily:co,fontSize:14,color:C.gray,lineHeight:1.6,margin:"0 0 0.25rem"}}>Enter a new password for your account.</p>
      <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="New password" autoComplete="new-password" style={{border:"0.5px solid #ccc",padding:"11px 12px",fontSize:16,fontFamily:co,outline:"none"}}/>
      <input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Confirm password" autoComplete="new-password" style={{border:"0.5px solid #ccc",padding:"11px 12px",fontSize:16,fontFamily:co,outline:"none"}}/>
      {error&&<p style={{fontFamily:co,fontSize:13,color:"#cc4444",fontStyle:"italic",margin:"0.2rem 0"}}>{error}</p>}
      {resetSent&&<p style={{fontFamily:co,fontSize:13,color:C.teal,fontStyle:"italic",margin:"0.2rem 0"}}>Password updated. Redirecting...</p>}
      <button onClick={onSave} disabled={loading||!password||password.length<6||!confirmPassword} style={{background:C.black,color:C.white,border:"none",padding:"11px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase",opacity:loading||!password||password.length<6||!confirmPassword?0.5:1}}>{loading?"SAVING...":"SAVE PASSWORD"}</button>
    </>
  );
}

function AuthModal({authMode,setAuthMode,accountType,setAccountType,firstName,setFirstName,lastName,setLastName,email,setEmail,password,setPassword,confirmPassword,setConfirmPassword,staySignedIn,setStaySignedIn,loading,error,onLogin,onSignUp,onForgotPassword,onResetPassword,onClose,onArtistApply,checkEmail,resetSent}){
  const isSignUp = authMode === "signup";
  const isForgotPassword = authMode === "forgot";
  return(
    <div style={{position:"fixed",left:0,right:0,top:0,bottom:0,width:"100%",zIndex:1000,background:"rgba(0,0,0,0.48)",display:"flex",alignItems:"center",justifyContent:"center",padding:"calc(1.25rem + env(safe-area-inset-top)) 1.25rem calc(1.25rem + env(safe-area-inset-bottom))",overflowX:"hidden"}}>
      <div style={{width:"100%",maxWidth:380,background:C.white,padding:"1.5rem",boxShadow:"0 18px 50px rgba(0,0,0,0.24)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:"1.2rem"}}>
          <div>
            <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.22em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.3rem"}}>Your account</p>
            <h2 style={{fontFamily:ve,fontSize:20,fontWeight:400,letterSpacing:"0.12em",margin:0}}>{isForgotPassword?"RESET PASSWORD":isSignUp?"CREATE ACCOUNT":"SIGN IN"}</h2>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,lineHeight:1,cursor:"pointer",color:C.gray}}>×</button>
        </div>
        {checkEmail?(
          <div style={{textAlign:"center",padding:"1rem 0"}}>
            <div style={{background:C.nearBlack,padding:"2rem 1.5rem",marginBottom:"1.25rem"}}>
              <p style={{fontFamily:ve,fontSize:16,letterSpacing:"0.12em",color:C.white,marginBottom:"0.75rem"}}>CHECK YOUR EMAIL</p>
              <div style={{width:40,height:1,background:C.lavender,margin:"0 auto 0.75rem"}}/>
              <p style={{fontFamily:co,fontSize:14,color:"#ccc",lineHeight:1.7,margin:0}}>We sent a confirmation link to <span style={{color:C.white}}>{email}</span>. Tap the link to verify your account, then come back and log in.</p>
            </div>
            <button onClick={onClose} style={{background:C.black,color:C.white,border:"none",padding:"11px 24px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Got It</button>
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {isForgotPassword?(
              <ForgotPasswordScreen email={email} setEmail={setEmail} loading={loading} error={error} onSendReset={onForgotPassword} onBack={()=>setAuthMode("login")} resetSent={resetSent}/>
            ):<>
            {isSignUp && (
              <>
                <div>
                  <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.4rem"}}>I am a</p>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(120px,100%),1fr))",gap:8,minWidth:0,maxWidth:"100%"}}>
                    <button type="button" onClick={()=>setAccountType("bride")} style={{background:accountType==="bride"?C.black:"transparent",color:accountType==="bride"?C.white:C.black,border:`0.5px solid ${C.black}`,padding:"10px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Bride</button>
                    <button type="button" onClick={()=>setAccountType("artist")} style={{background:accountType==="artist"?C.black:"transparent",color:accountType==="artist"?C.white:C.black,border:`0.5px solid ${C.black}`,padding:"10px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Artist</button>
                  </div>
                  {accountType==="artist"&&<p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:C.gray,margin:"0.55rem 0 0",lineHeight:1.5}}>Create an account, then apply to be listed.</p>}
                </div>
                <div className="name-row" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(150px,100%),1fr))",gap:8,minWidth:0,maxWidth:"100%"}}>
                  <input type="text" value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="First Name" autoComplete="given-name" style={{border:"0.5px solid #ccc",padding:"11px 12px",fontSize:16,fontFamily:co,outline:"none",minWidth:0}}/>
                  <input type="text" value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="Last Name" autoComplete="family-name" style={{border:"0.5px solid #ccc",padding:"11px 12px",fontSize:16,fontFamily:co,outline:"none",minWidth:0}}/>
                </div>
              </>
            )}
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" autoComplete="email" style={{border:"0.5px solid #ccc",padding:"11px 12px",fontSize:16,fontFamily:co,outline:"none"}}/>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" style={{border:"0.5px solid #ccc",padding:"11px 12px",fontSize:16,fontFamily:co,outline:"none"}}/>
            <label style={{display:"flex",alignItems:"center",gap:8,fontFamily:co,fontSize:13,color:C.gray,cursor:"pointer"}}>
              <input type="checkbox" checked={staySignedIn} onChange={e=>setStaySignedIn(e.target.checked)} style={{accentColor:C.black}}/>
              Stay signed in
            </label>
            {error&&<p style={{fontFamily:co,fontSize:13,color:"#cc4444",fontStyle:"italic",margin:"0.2rem 0"}}>{error}</p>}
            {isSignUp?(
              <button onClick={onSignUp} disabled={loading||!firstName.trim()||!lastName.trim()||!email.trim()||!password} style={{background:C.black,color:C.white,border:"none",padding:"11px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase",opacity:loading||!firstName.trim()||!lastName.trim()||!email.trim()||!password?0.5:1}}>SIGN UP</button>
            ):(
              <>
                <button onClick={onLogin} disabled={loading||!email.trim()||!password} style={{background:C.black,color:C.white,border:"none",padding:"11px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase",opacity:loading||!email.trim()||!password?0.5:1}}>LOG IN</button>
                <button onClick={()=>setAuthMode("forgot")} style={{background:"none",border:"none",fontFamily:co,fontStyle:"italic",fontSize:13,color:C.gray,cursor:"pointer",textDecoration:"underline",padding:0}}>Forgot password?</button>
              </>
            )}
            <div style={{borderTop:`0.5px solid ${C.border}`,paddingTop:"0.85rem",textAlign:"center"}}>
              <button onClick={()=>{const nextMode=isSignUp?"login":"signup";setAuthMode(nextMode);if(nextMode==="login"){setFirstName("");setLastName("");}}} style={{background:"transparent",border:`0.5px solid ${C.border}`,fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,cursor:"pointer",padding:"9px 13px",width:"100%"}}>{isSignUp?"LOG IN":"SIGN UP"}</button>
            </div>
            {onArtistApply&&<button onClick={onArtistApply} style={{background:"none",border:"none",fontFamily:co,fontStyle:"italic",fontSize:13,color:C.gray,cursor:"pointer",textDecoration:"underline",marginTop:4,padding:0}}>I'm an artist — apply to be listed</button>}
            </>}
          </div>
        )}
      </div>
    </div>
  );
}

function PremiumModal({
  feature,
  onClose,
  onUnlock,
  loading,
  isLoggedIn,
  isPremium,
  checkoutError,
  // iOS in-app purchase props (all unused on web/Android)
  iosOffering,
  iosOfferingLoading,
  iosOfferingError,
  iosPurchaseLoading,
  iosPurchaseError,
  iosRestoreLoading,
  iosRestoreMessage,
  onIosPurchase,
  onIosRestore,
}){
  if(isPremium)return null;
  const iosNative = isNativeIOSApp();
  const isArtistPaywall = typeof feature === "string" && /artist/i.test(feature);
  const isInspoTranslation = !iosNative && typeof feature === "string" && /inspo translation/i.test(feature);
  const heroTitle = iosNative ? "PREMIUM ACCESS" : (isInspoTranslation ? "INSPO TRANSLATION INCLUDED" : "UPGRADE TO PREMIUM");
  const heroBody = iosNative
    ? "Unlock personalized recommendations, your full beauty timeline, and the inspo translation tools."
    : (isInspoTranslation
      ? "Upload the looks you keep coming back to and receive a personalized review from Bailee."
      : (feature || "This is a premium feature."));
  const bullets = iosNative
    ? ["Beauty timeline","Personalized product recommendations","Inspo translation reviews"]
    : (isInspoTranslation
      ? [
          "Why you’re drawn to the look",
          "What creates it",
          "What realistically translates",
          "Hair density considerations",
          "Longevity recommendations",
          "Climate + humidity notes",
          "Product suggestions",
          "Personalized notes based on your profile + photos",
        ]
      : ["Beauty timeline","Personalized product recommendations"]);
  const expectedIosProductID = isArtistPaywall ? REVENUECAT_ARTIST_PRODUCT_ID : REVENUECAT_BRIDE_PRODUCT_ID;
  const iosPackages = (Array.isArray(iosOffering?.availablePackages) ? iosOffering.availablePackages : [])
    .filter(pkg => pkg?.product?.identifier === expectedIosProductID);
  const iosAnyBusy = !!(iosOfferingLoading || iosPurchaseLoading || iosRestoreLoading);
  const monthlyPriceText = product => {
    const rawPrice = product?.priceString || "";
    if(!rawPrice) return "";
    if(/month|mo|\/\s*m/i.test(rawPrice)) return rawPrice;
    return `${rawPrice.replace(/\.00\b/, "")}/month`;
  };
  const subscriptionTitle = product => product?.title || product?.localizedTitle || "The Bridal Edit™ Premium";
  const subscriptionDuration = product => {
    const period = product?.subscriptionPeriod || product?.period || product?.defaultOption?.billingPeriod || product?.subscriptionOptions?.[0]?.billingPeriod;
    const unit = String(period?.unit || period?.periodUnit || period?.interval || period?.durationUnit || "").toLowerCase();
    const value = period?.value || period?.numberOfUnits || period?.periodNumberOfUnits || period?.intervalCount || 1;
    if(unit.includes("year")) return value > 1 ? `${value} years` : "1 year";
    if(unit.includes("week")) return value > 1 ? `${value} weeks` : "1 week";
    if(unit.includes("day")) return value > 1 ? `${value} days` : "1 day";
    return "1 month";
  };
  return(
    <div style={{position:"fixed",left:0,right:0,top:0,bottom:0,width:"100%",zIndex:1000,background:"rgba(0,0,0,0.48)",display:"flex",alignItems:"center",justifyContent:"center",padding:"calc(1.25rem + env(safe-area-inset-top)) 1.25rem calc(1.25rem + env(safe-area-inset-bottom))",overflowX:"hidden"}}>
      <div style={{width:"100%",maxWidth:"min(420px, 100%)",maxHeight:"80vh",overflowY:"auto",background:C.white,padding:"1.5rem",boxShadow:"0 18px 50px rgba(0,0,0,0.24)",boxSizing:"border-box"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:"1.1rem"}}>
          <div>
            <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.22em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.3rem"}}>Premium</p>
            <h2 style={{fontFamily:ve,fontSize:20,fontWeight:400,letterSpacing:"0.12em",margin:0}}>{heroTitle}</h2>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,lineHeight:1,cursor:"pointer",color:C.gray}}>×</button>
        </div>
        <div style={{background:C.nearBlack,color:C.white,padding:"1.25rem",marginBottom:"1rem"}}>
          <p style={{fontFamily:co,fontStyle:"italic",fontSize:15,lineHeight:1.7,margin:0}}>{heroBody}</p>
        </div>
        {!iosNative&&checkoutError&&<p style={{fontFamily:co,fontSize:13,color:"#cc4444",fontStyle:"italic",lineHeight:1.6,margin:"0 0 1rem"}}>{checkoutError}</p>}
        {!iosNative&&isInspoTranslation&&<p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.6rem"}}>Included</p>}
        {bullets.length>0&&(
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:isInspoTranslation?"1rem":"1.35rem",borderTop:iosNative?`0.5px solid ${C.border}`:"none",borderBottom:iosNative?`0.5px solid ${C.border}`:"none",padding:iosNative?"0.9rem 0":"0"}}>
            {bullets.map(item=>(
              <p key={item} style={{fontFamily:co,fontSize:14,color:C.gray,lineHeight:1.55,margin:0,display:"flex",gap:8,alignItems:"baseline"}}>
                <span style={{fontFamily:ag,fontSize:8,color:C.black,lineHeight:1}}>•</span>
                <span>{item}</span>
              </p>
            ))}
          </div>
        )}
        {!iosNative&&isInspoTranslation&&(
          <p style={{fontFamily:co,fontStyle:"italic",fontSize:12,color:C.gray,margin:"0 0 1.25rem",borderTop:`0.5px solid ${C.border}`,paddingTop:"0.75rem"}}>Reviewed by Bailee Cribb Bridal</p>
        )}
        {iosNative&&(
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:"1rem"}}>
            {iosOfferingLoading&&(
              <p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:C.gray,lineHeight:1.6,margin:0}}>Loading purchase options…</p>
            )}
            {!iosOfferingLoading&&iosOfferingError&&(
              <p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:"#cc4444",lineHeight:1.6,margin:0}}>Subscription options are loading. Please try again in a moment.</p>
            )}
            {!iosOfferingLoading&&!iosOfferingError&&iosPackages.length===0&&(
              <p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:"#cc4444",lineHeight:1.6,margin:0}}>Subscription options are loading. Please try again in a moment.</p>
            )}
            {!iosOfferingLoading&&!iosOfferingError&&iosPackages.map(pkg=>{
              const product = pkg?.product || {};
              const price = monthlyPriceText(product);
              const description = product.description || "";
              const title = subscriptionTitle(product);
              const duration = subscriptionDuration(product);
              return(
                <div
                  key={pkg.identifier}
                  style={{border:`0.5px solid ${C.black}`,padding:"18px 18px 16px",display:"grid",gap:14}}
                >
                  <div>
                    <p style={{fontFamily:ve,fontSize:18,letterSpacing:"0.08em",margin:"0 0 6px",color:C.black,lineHeight:1.25}}>{title}</p>
                    {price&&<p style={{fontFamily:co,fontStyle:"italic",fontSize:24,margin:"0 0 6px",color:C.black,lineHeight:1.1}}>{price}</p>}
                    <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,margin:description?"0 0 8px":"0"}}>{duration}</p>
                    {description&&<p style={{fontFamily:co,fontStyle:"italic",fontSize:12,color:C.gray,lineHeight:1.55,margin:0}}>{description}</p>}
                  </div>
                  <div style={{display:"grid",gap:8}}>
                    <button
                      type="button"
                      onClick={()=>onIosPurchase?.(pkg)}
                      disabled={iosAnyBusy}
                      style={{background:C.black,color:C.white,border:"none",padding:"13px 14px",fontSize:10,letterSpacing:"0.2em",cursor:iosAnyBusy?"wait":"pointer",fontFamily:ag,textTransform:"uppercase",opacity:iosAnyBusy?0.6:1,width:"100%"}}
                    >
                      Subscribe
                    </button>
                    <LegalLinks/>
                    <p style={{fontFamily:co,fontStyle:"italic",fontSize:11,color:C.gray,lineHeight:1.45,margin:0,textAlign:"center"}}>
                      Auto-renewing monthly subscription. Cancel anytime in Apple Account Settings.
                    </p>
                  </div>
                </div>
              );
            })}
            {iosPurchaseLoading&&(
              <p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:C.gray,margin:0}}>Processing your purchase…</p>
            )}
            {iosPurchaseError&&(
              <p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:"#cc4444",lineHeight:1.6,margin:0}}>{iosPurchaseError}</p>
            )}
            {iosRestoreMessage&&(
              <p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:C.gray,lineHeight:1.6,margin:0}}>{iosRestoreMessage}</p>
            )}
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr",gap:8}}>
          {!iosNative&&(
            <Fragment>
              <button onClick={onUnlock} disabled={loading} style={{background:C.black,color:C.white,border:"none",padding:"12px",fontSize:10,letterSpacing:"0.18em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase",opacity:loading?0.55:1}}>{loading?"Opening checkout...":isLoggedIn?"UPGRADE TO PREMIUM":"SIGN IN OR CREATE ACCOUNT"}</button>
              <LegalLinks/>
            </Fragment>
          )}
          {iosNative&&(
            <button
              type="button"
              onClick={onIosRestore}
              disabled={iosAnyBusy}
              style={{background:"transparent",color:C.black,border:`0.5px solid ${C.black}`,padding:"11px",fontSize:10,letterSpacing:"0.18em",cursor:iosAnyBusy?"wait":"pointer",fontFamily:ag,textTransform:"uppercase",opacity:iosAnyBusy?0.6:1}}
            >
              {iosRestoreLoading?"Restoring…":"Restore Purchases"}
            </button>
          )}
          <button onClick={onClose} style={{background:"transparent",color:C.black,border:`0.5px solid ${C.black}`,padding:"11px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>{iosNative?"Close":"Keep browsing free"}</button>
        </div>
      </div>
    </div>
  );
}

function getCheckoutErrorMessage(error){
  const status = error?.context?.status;
  const message = [
    error?.name,
    error?.message,
    error?.context?.error,
    error?.context?.message,
    error?.details,
  ].filter(Boolean).join(" ").toLowerCase();

  if(message.includes("failed to send") || message.includes("network") || message.includes("unreachable") || status === 404){
    return "Checkout is not connected yet.";
  }

  if(message.includes("stripe") || message.includes("price") || message.includes("checkout session did not return") || status >= 500){
    return "Stripe checkout is not configured yet.";
  }

  return "Checkout is not connected yet.";
}

function getProfileSaveErrorMessage(error){
  const message = [error?.message,error?.details,error?.hint,error?.code].filter(Boolean).join(" ").toLowerCase();
  if(message.includes("row-level security") || message.includes("rls") || message.includes("permission") || message.includes("policy")){
    return "Profile could not be saved. Check Supabase table/RLS.";
  }
  if(message.includes("relation") || message.includes("does not exist") || message.includes("schema cache") || message.includes("column")){
    return "Profile could not be saved. Check Supabase table/RLS.";
  }
  return "Profile could not be saved. Check Supabase table/RLS.";
}

function buildInspoAnalysis(url,profile,result){
  const featureSummary = [profile.faceShape,profile.eyeColor,profile.eyeShape,profile.hairColor,profile.hairLength].filter(Boolean).join(" ");
  const text = [url,profile.concerns,profile.location,result?.primary||"",featureSummary].join(" ").toLowerCase();
  const has = (...words) => words.some(word => text.includes(word));

  const analysis = {
    attracted_to: ["polished finish","romantic shape","camera-ready softness"],
    actually_creates: ["intentional prep","balanced placement","long-wear finishing"],
    reality_check: "Most inspo photos are captured in controlled light before weather, movement, and a full wedding timeline affect the look.",
    achievable: "A wedding-day version is achievable when the look is adapted to your hair, skin, venue, and timeline.",
  };

  if(has("wave","waves","hollywood","glam","curl","curls")){
    analysis.attracted_to = ["structured movement","shine","old-Hollywood polish"];
    analysis.actually_creates = ["set curls cooled completely","brushed-out shaping","humidity-resistant finishing spray"];
    analysis.reality_check = "Those waves usually rely on setting time, density, and controlled brushing, not just a curling iron pass.";
  }else if(has("updo","bun","chignon","twist","slick","sleek")){
    analysis.attracted_to = ["clean structure","lifted face-framing","all-night control"];
    analysis.actually_creates = ["internal pinning support","sectioned smoothing","strategic padding or extensions if needed"];
    analysis.reality_check = "Most effortless updos have hidden structure underneath so they do not collapse after photos and dancing.";
  }else if(has("natural","minimal","clean","dewy","glow","skin")){
    analysis.attracted_to = ["fresh skin","soft definition","effortless glow"];
    analysis.actually_creates = ["skin prep layers","selective coverage","powder only where shine breaks down"];
    analysis.reality_check = "Dewy inspo often looks different in heat and flash, so the glow needs to be placed carefully.";
  }else if(has("boho","beach","coastal","braid","braids","messy")){
    analysis.attracted_to = ["relaxed texture","movement","undone romance"];
    analysis.actually_creates = ["grip-building prep","intentional loose pieces","wind-aware hold"];
    analysis.reality_check = "Undone bridal hair still needs structure or it can read messy by the ceremony.";
  }else if(has("editorial","bold","smoky","smokey","red lip","liner","dark")){
    analysis.attracted_to = ["visual impact","strong contrast","memorable detail"];
    analysis.actually_creates = ["defined feature balance","precision blending","lighting-aware color placement"];
    analysis.reality_check = "Bold inspo is often shot for a camera angle, so it needs softening or balancing for a full wedding day.";
  }

  if(profile.hairDensity === "Fine / sparse"){
    analysis.actually_creates = [...analysis.actually_creates.slice(0,2),"volume support or extensions"];
  }

  if(profile.hairLength === "Pixie / short" || profile.hairLength === "Bob / lob"){
    analysis.achievable = "A shorter-hair version is achievable, but long inspo will need extensions or a redesigned silhouette.";
  }else if(profile.hairLength === "Shoulder length"){
    analysis.achievable = "A wedding-day version is achievable, though fuller waves or large updos may need extensions or padding.";
  }

  if(profile.hairColor === "Black" || profile.hairColor === "Brunette"){
    analysis.actually_creates = [...analysis.actually_creates.slice(0,2),"extra shine and shape definition for darker hair"];
  }else if(profile.hairColor === "Blonde" || profile.hairColor === "Gray / silver"){
    analysis.reality_check += " Lighter hair shows texture and flyaways more clearly, so finishing has to be precise.";
  }

  if(profile.eyeShape === "Hooded" || profile.eyeShape === "Deep-set"){
    analysis.actually_creates = [...analysis.actually_creates.slice(0,2),"lash and liner placement adjusted for your eye shape"];
  }

  if(profile.faceShape && profile.faceShape !== "Not sure"){
    analysis.reality_check += ` For a ${profile.faceShape.toLowerCase()} face shape, the front pieces and volume placement matter as much as the style itself.`;
  }

  if(profile.skinType === "Oily" || profile.skinType === "Combination"){
    analysis.achievable = "A polished version is achievable with oil-control prep, selective glow, and a touch-up plan.";
  }else if(profile.skinType === "Dry"){
    analysis.achievable = "A soft, luminous version is achievable with layered hydration and restrained powder.";
  }

  return analysis;
}

function clearPersistedSupabaseSession(){
  if(typeof localStorage==="undefined")return;
  Object.keys(localStorage).forEach(key=>{
    if(key.startsWith("sb-")||key.includes("supabase"))localStorage.removeItem(key);
  });
}

const SCREEN_TO_PATH = {
  home: "/",
  bridalDirection: "/my-bridal-direction",
  artistDashboard: "/artist-dashboard",
  artistPortfolio: "/artist-portfolio",
  artistAnalytics: "/artist-analytics",
  artistPremium: "/artist-premium",
};

const PATH_TO_SCREEN = Object.fromEntries(Object.entries(SCREEN_TO_PATH).map(([screen,path])=>[path,screen]));

function initialScreenFromPath(){
  if(typeof window==="undefined")return "home";
  return PATH_TO_SCREEN[window.location.pathname] || "home";
}

function ArtistDashboardHome({ artistProfile, onEditProfile, onUploadProfilePhoto, profilePhotoUploading, profilePhotoMessage, profilePhotoError, children }) {
  const displayName=artistProfile?.business_name||artistProfile?.owner_name||artistProfile?.email||"Artist";
  const initial=String(displayName).trim().charAt(0).toUpperCase()||"A";
  const hasProfilePhoto=Boolean(artistProfile?.profile_photo_url);
  const profilePhotoInputRef=useRef(null);
  return (
    <div className="artist-workspace-page">
      <div className="artist-profile-summary-card">
        <p className="artist-section-label">Profile Summary</p>
        <div className="artist-profile-summary-content">
          <div className="artist-profile-photo-wrap">
            {artistProfile?.profile_photo_url ? (
              <img src={artistProfile.profile_photo_url} alt="Artist profile" className="artist-profile-photo" />
            ) : (
              <div className="artist-profile-photo-placeholder">{initial}</div>
            )}
          </div>
          <div className="artist-profile-summary-copy">
            <h3>{artistProfile?.business_name || "Your Artist Profile"}</h3>
            <p className="artist-summary-line">{[artistProfile?.city, artistProfile?.state || artistProfile?.country].filter(Boolean).join(", ") || "Location not set"}</p>
            <p className="artist-summary-line">{artistProfile?.services || "Services not set"}</p>
          </div>
        </div>
        <div className="artist-profile-photo-actions">
          <button type="button" className="artist-primary-button" onClick={onEditProfile}>Edit Profile</button>
          <button
            type="button"
            className={`artist-primary-button ${profilePhotoUploading ? "is-disabled" : ""}`}
            disabled={profilePhotoUploading}
            onClick={()=>profilePhotoInputRef.current?.click()}
          >
            {profilePhotoUploading ? "UPLOADING..." : (hasProfilePhoto ? "CHANGE PROFILE PHOTO" : "UPLOAD PROFILE PHOTO")}
          </button>
          <input
            ref={profilePhotoInputRef}
            type="file"
            accept="image/*"
            disabled={profilePhotoUploading}
            hidden
            onChange={(event)=>{
              const file=event.target.files?.[0];
              if(file)onUploadProfilePhoto?.(file);
              event.target.value="";
            }}
          />
          {profilePhotoMessage&&<p className="artist-upload-message">{profilePhotoMessage}</p>}
          {profilePhotoError&&<p className="artist-upload-error">{profilePhotoError}</p>}
        </div>
      </div>

      {children}
    </div>
  );
}

function ArtistPortfolioPage({ artistProfile, supabase, userId, onProfileUpdated }) {
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const existingPhotos = artistProfile?.portfolio_photos || [];
    setPhotos(Array.isArray(existingPhotos) ? existingPhotos : []);
  }, [artistProfile]);

  // Wrap whatever Supabase / fetch / unknown threw into a real Error so that
  // .message, .stack, and the original payload survive console.error (which
  // otherwise prints `{}` for objects with non-enumerable properties).
  function wrapPortfolioError(rawError, step) {
    if (rawError instanceof Error) {
      rawError.step = step;
      return rawError;
    }
    const message = rawError?.message || rawError?.error_description || rawError?.error || `Portfolio ${step} failed`;
    const wrapped = new Error(message);
    wrapped.step = step;
    wrapped.code = rawError?.code ?? rawError?.statusCode ?? null;
    wrapped.details = rawError?.details ?? null;
    wrapped.hint = rawError?.hint ?? null;
    wrapped.status = rawError?.status ?? rawError?.statusCode ?? null;
    wrapped.raw = rawError;
    return wrapped;
  }

  function logPortfolioError(prefix, err) {
    const payload = {
      step: err?.step || "unknown",
      message: err?.message || String(err),
      name: err?.name || null,
      code: err?.code ?? null,
      details: err?.details ?? null,
      hint: err?.hint ?? null,
      status: err?.status ?? null,
      stack: err?.stack || null,
      raw: err?.raw ?? err ?? null,
    };
    console.error(prefix, payload);
  }

  async function persistPortfolioPhotos(updatedPhotos) {
    if (!userId) throw wrapPortfolioError({ message: "Not signed in." }, "persist:auth-missing");
    console.log("[DEBUG] portfolio persist — updating artist_profiles.portfolio_photos where user_id =", userId, "count:", updatedPhotos.length);
    const dbResponse = await supabase
      .from("artist_profiles")
      .update({ portfolio_photos: updatedPhotos })
      .eq("user_id", userId)
      .select()
      .maybeSingle();
    console.log("[DEBUG] portfolio persist DB response:", dbResponse);
    const { data, error } = dbResponse;
    // Only an explicit `error` from Supabase counts as a failure. A null
    // `data` with error === null is a valid success — PostgREST/RLS can
    // legitimately omit the returning row. Status is NOT inspected here.
    if (error) {
      throw wrapPortfolioError(error, "persist:db-update");
    }
    if (data) return data;
    // Best-effort refetch so the parent state can pick up a fresh row.
    // Wrapped in try/catch — if it fails for ANY reason we still treat the
    // original write as successful and return null.
    try {
      console.log("[DEBUG] portfolio persist — update OK with null data; attempting refetch");
      const refetch = await supabase
        .from("artist_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      console.log("[DEBUG] portfolio persist — refetch response:", refetch);
      if (refetch?.error) {
        logPortfolioError("[DEBUG] portfolio persist refetch error (non-fatal)", wrapPortfolioError(refetch.error, "persist:refetch"));
        return null;
      }
      return refetch?.data || null;
    } catch (refetchErr) {
      logPortfolioError("[DEBUG] portfolio persist refetch threw (non-fatal)", wrapPortfolioError(refetchErr, "persist:refetch"));
      return null;
    }
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    console.log("[DEBUG] portfolio handleUpload called, file:", {name:file?.name,size:file?.size,type:file?.type});
    if (!file) return;
    if (!userId) {
      console.warn("[DEBUG] portfolio upload aborted — no userId");
      alert("Please sign in to upload portfolio photos.");
      return;
    }
    console.log("[DEBUG] portfolio upload — props.userId:", userId);
    try {
      const { data: authResult } = await supabase.auth.getUser();
      console.log("[DEBUG] portfolio upload — auth.uid():", authResult?.user?.id || null);
    } catch (authErr) {
      logPortfolioError("[DEBUG] portfolio upload — supabase.auth.getUser threw", wrapPortfolioError(authErr, "auth:getUser"));
    }

    setUploading(true);
    let step = "begin";

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${userId}/${Date.now()}.${fileExt}`;
      console.log("[DEBUG] portfolio storage path:", fileName);

      step = "storage:upload";
      const storageResponse = await supabase.storage
        .from("artist-portfolio")
        .upload(fileName, file);
      console.log("[DEBUG] portfolio storage.upload result:", storageResponse);
      const { error: uploadError } = storageResponse;
      if (uploadError) {
        throw wrapPortfolioError(uploadError, step);
      }

      step = "storage:getPublicUrl";
      const { data } = supabase.storage
        .from("artist-portfolio")
        .getPublicUrl(fileName);
      console.log("[DEBUG] portfolio publicUrl:", data?.publicUrl);
      if (!data?.publicUrl) {
        throw wrapPortfolioError({ message: "Could not generate a public URL for the uploaded file." }, step);
      }

      const newPhoto = {
        url: data.publicUrl,
        image_url: data.publicUrl,
        storage_path: fileName,
        tag: "full_look",
        created_at: new Date().toISOString(),
      };

      const updatedPhotos = [...photos, newPhoto];
      setPhotos(updatedPhotos);

      step = "db:persist";
      const updatedRow = await persistPortfolioPhotos(updatedPhotos);
      console.log("[DEBUG] portfolio upload SUCCESS — persisted row:", updatedRow);
      if (updatedRow) {
        // Freshest row from the server — replace parent state entirely.
        onProfileUpdated?.(updatedRow);
      } else {
        // DB write succeeded but RLS hid the returning row. Merge the new
        // portfolio_photos into the existing parent state so we don't drop
        // business_name / profile_photo_url / etc.
        console.log("[DEBUG] portfolio upload — DB update succeeded with null data; merging optimistic photos into parent state");
        onProfileUpdated?.((prev) => ({ ...(prev || {}), portfolio_photos: updatedPhotos }));
      }
    } catch (error) {
      const wrapped = wrapPortfolioError(error, error?.step || step);
      logPortfolioError("[DEBUG] portfolio upload error", wrapped);
      alert(`Upload failed at "${wrapped.step}": ${wrapped.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function updatePhotoTag(index, newTag) {
    const updatedPhotos = photos.map((photo, i) =>
      i === index ? { ...photo, tag: newTag } : photo
    );
    setPhotos(updatedPhotos);

    try {
      const updatedRow = await persistPortfolioPhotos(updatedPhotos);
      if (updatedRow) {
        onProfileUpdated?.(updatedRow);
      } else {
        onProfileUpdated?.((prev) => ({ ...(prev || {}), portfolio_photos: updatedPhotos }));
      }
    } catch (error) {
      const wrapped = wrapPortfolioError(error, error?.step || "tag:persist");
      logPortfolioError("[DEBUG] portfolio tag update error", wrapped);
      alert(`Could not update tag: ${wrapped.message}`);
    }
  }

  async function deletePhoto(index) {
    const photoToDelete = photos[index];
    const updatedPhotos = photos.filter((_, i) => i !== index);
    setPhotos(updatedPhotos);

    try {
      const updatedRow = await persistPortfolioPhotos(updatedPhotos);
      if (updatedRow) {
        onProfileUpdated?.(updatedRow);
      } else {
        onProfileUpdated?.((prev) => ({ ...(prev || {}), portfolio_photos: updatedPhotos }));
      }
    } catch (error) {
      const wrapped = wrapPortfolioError(error, error?.step || "delete:persist");
      logPortfolioError("[DEBUG] portfolio delete error", wrapped);
      alert(`Could not delete photo: ${wrapped.message}`);
      return;
    }

    if (photoToDelete?.storage_path) {
      try {
        const removeResponse = await supabase.storage
          .from("artist-portfolio")
          .remove([photoToDelete.storage_path]);
        console.log("[DEBUG] portfolio delete — storage.remove result:", removeResponse);
        if (removeResponse?.error) {
          logPortfolioError("[DEBUG] portfolio delete — storage remove failed", wrapPortfolioError(removeResponse.error, "delete:storage-remove"));
        }
      } catch (removeErr) {
        logPortfolioError("[DEBUG] portfolio delete — storage.remove threw", wrapPortfolioError(removeErr, "delete:storage-remove"));
      }
    }
  }

  return (
    <div className="artist-workspace-page">
      <div className="artist-upload-card">
        <p className="artist-section-label">Portfolio Upload</p>
        <label className={`artist-primary-button ${uploading ? "is-disabled" : ""}`}>
          {uploading ? "Uploading..." : "Upload Photo"}
          <input
            type="file"
            accept="image/*"
            onChange={handleUpload}
            disabled={uploading}
            hidden
          />
        </label>
      </div>

      {photos.length === 0 ? (
        <div className="artist-empty-card">
          <p>Add portfolio photo</p>
        </div>
      ) : (
        <div className="artist-portfolio-grid">
          {photos.map((photo, index) => (
            <div className="artist-portfolio-card" key={photo.url || photo.image_url || index}>
              <img src={photo.url || photo.image_url} alt="Portfolio" />

              <div className="artist-portfolio-controls">
                <label>
                  Tag
                  <select
                    value={photo.tag || "full_look"}
                    onChange={(e) => updatePhotoTag(index, e.target.value)}
                  >
                    <option value="full_look">Full Look</option>
                    <option value="hair_look">Hair Look</option>
                    <option value="makeup_look">Makeup Look</option>
                    <option value="details">Details</option>
                  </select>
                </label>

                <button onClick={() => deletePhoto(index)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArtistAnalyticsPage({ artistProfile }) {
  const profileViews = artistProfile?.profile_views || 0;
  const linkClicks = artistProfile?.link_clicks || 0;
  const inquiryClicks = artistProfile?.inquiry_clicks || 0;
  const portfolioViews = artistProfile?.portfolio_views || 0;

  return (
    <div className="artist-workspace-page">
      <div className="artist-analytics-grid">
        {[
          ["PROFILE VIEWS",profileViews],
          ["LINK CLICKS",linkClicks],
          ["INQUIRY CLICKS",inquiryClicks],
          ["PORTFOLIO VIEWS",portfolioViews],
        ].map(([label,value])=>(
          <div className="artist-stat-card" key={label}>
            <p>{label}</p>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App(){
  console.log("APP START");
  // screens: home | quiz | result | chat | profile | directory | artistDetail | inquire | timeline | products
  const [screen,setScreen]=useState(()=>initialScreenFromPath());
  // quiz
  const [quizPhase,setQuizPhase]=useState("skin"); // skin | hair | features | main
  const [skinStep,setSkinStep]=useState(0);
  const [hairStep,setHairStep]=useState(0);
  const [featureStep,setFeatureStep]=useState(0);
  const [mainStep,setMainStep]=useState(0);
  const [skinAns,setSkinAns]=useState({});
  const [hairAns,setHairAns]=useState({});
  const [featureAns,setFeatureAns]=useState({});
  const [mainAns,setMainAns]=useState({});
  const [showOther,setShowOther]=useState(false);
  const [otherTxt,setOtherTxt]=useState("");
  // results
  const [result,setResult]=useState(null);
  const [quizUpdatedAt,setQuizUpdatedAt]=useState("");
  const [swipePreferenceSummary,setSwipePreferenceSummary]=useState(()=>readSwipePreferenceSummary());
  // quiz-to-profile save state
  const [quizSaveStatus,setQuizSaveStatus]=useState("idle"); // idle | saving | saved
  const [quizSaveError,setQuizSaveError]=useState("");
  const [quizSavedSignature,setQuizSavedSignature]=useState("");
  // profile
  const [profile,setProfile]=useState({name:"",date:"",location:"",country:"United States",province:"",skinType:"",hairType:"",hairDensity:"",faceShape:"",eyeColor:"",eyeShape:"",hairColor:"",hairLength:"",concerns:"",inspoUrls:["","",""],profilePhoto:null});
  const [profileSaved,setProfileSaved]=useState(false);
  const [profileSaving,setProfileSaving]=useState(false);
  const [profileSaveMessage,setProfileSaveMessage]=useState("");
  const [profileSaveError,setProfileSaveError]=useState("");
  const [profilesHasStateColumn,setProfilesHasStateColumn]=useState(null);
  const [moodItems,setMoodItems]=useState([]);
  const [moodInput,setMoodInput]=useState("");
  const [completedTimeline,setCompletedTimeline]=useState({});
  const [pinterestAnalysis,setPinterestAnalysis]=useState({});
  const [analyzeLoading,setAnalyzeLoading]=useState(false);
  // chat
  const [messages,setMessages]=useState([]);
  const [chatInput,setChatInput]=useState("");
  const [chatLoading,setChatLoading]=useState(false);
  const [expandedFaqQuestion,setExpandedFaqQuestion]=useState("");
  const chatEndRef=useRef(null);
  const [hasUnreadResponses,setHasUnreadResponses]=useState(false);
  // admin messages
  const [adminMessages,setAdminMessages]=useState([]);
  const [adminReplyInputs,setAdminReplyInputs]=useState({});
  const [adminMsgLoading,setAdminMsgLoading]=useState(false);
  const [messageError,setMessageError]=useState("");
  const [adminMsgError,setAdminMsgError]=useState("");
  // directory
  const [dirCountry,setDirCountry]=useState("All Countries");
  const [dirState,setDirState]=useState("All Regions");
  const [dirService,setDirService]=useState("All Services");
  const [dirSearch,setDirSearch]=useState("");
  const [dirTravel,setDirTravel]=useState(false);
  const [selectedArtist,setSelectedArtist]=useState(null);
  const photoRef=useRef(null);
  const currentPhotoFileRef=useRef(null);
  const shareCardRef=useRef(null);
  const pushRegisteredUserRef=useRef(null);
  // auth
  const [session,setSession]=useState(null);
  const [authOpen,setAuthOpen]=useState(false);
  const [authMode,setAuthMode]=useState("login");
  const [authAccountType,setAuthAccountType]=useState("bride");
  const [authFirstName,setAuthFirstName]=useState("");
  const [authLastName,setAuthLastName]=useState("");
  const [authEmail,setAuthEmail]=useState("");
  const [authPassword,setAuthPassword]=useState("");
  const [resetConfirmPassword,setResetConfirmPassword]=useState("");
  const [staySignedIn,setStaySignedIn]=useState(true);
  const [authLoading,setAuthLoading]=useState(false);
  const [authError,setAuthError]=useState("");
  const [authCheckEmail,setAuthCheckEmail]=useState(false);
  const [authResetSent,setAuthResetSent]=useState(false);
  const [isPasswordRecovery,setIsPasswordRecovery]=useState(()=>isPasswordRecoveryStored());
  // Results-gate onboarding. `pendingOnboarding` holds a quiz snapshot captured
  // before sign-up; `onboardingCommitting` guards the post-auth upload from
  // running twice; `authChecked` flips true once the initial session lookup
  // resolves so the protected-screen guard never fires before auth is known.
  const [pendingOnboarding,setPendingOnboarding]=useState(()=>readPendingOnboarding());
  const [onboardingCommitting,setOnboardingCommitting]=useState(false);
  const onboardingCommitRef=useRef(false);
  // The protected screen the user was trying to reach when the gate appeared.
  // After authentication we return them here (e.g. the quiz results screen)
  // instead of dropping them on a generic landing.
  const [gateReturnTo,setGateReturnTo]=useState(null);
  const [authChecked,setAuthChecked]=useState(false);
  const [roleChecked,setRoleChecked]=useState(false);
  const [userFirstName,setUserFirstName]=useState("");
  const [navMenuOpen,setNavMenuOpen]=useState(false);
  const [isAdmin,setIsAdmin]=useState(false);
  const [userRole,setUserRole]=useState("");
  // Admin "View As" toggle. Only honored when the user is an admin; lets
  // admins preview the bride/artist experience without changing their
  // underlying profile role in the database.
  const [viewMode,setViewMode]=useState("admin");
  // Admin dashboard accordion. Tracks which group is currently expanded;
  // null = all collapsed so large management tools never spill below the
  // accordion layout until an admin intentionally opens a section.
  const [adminOpenGroup,setAdminOpenGroup]=useState(null);
  const [adminExpandedArtistId,setAdminExpandedArtistId]=useState(null);
  const [isPremium,setIsPremium]=useState(false);
  const [subscriptionStatus,setSubscriptionStatus]=useState("");
  const [freeMembership,setFreeMembership]=useState(false);
  const [isBookedBride,setIsBookedBride]=useState(false);
  const [premiumOpen,setPremiumOpen]=useState(false);
  const [premiumFeature,setPremiumFeature]=useState("");
  const [checkoutLoading,setCheckoutLoading]=useState(false);
  const [checkoutError,setCheckoutError]=useState("");
  const [checkoutAfterAuth,setCheckoutAfterAuth]=useState(false);
  // iOS in-app purchase state (RevenueCat). All unused on web / Android.
  const [iosOffering,setIosOffering]=useState(null);
  const [iosOfferingLoading,setIosOfferingLoading]=useState(false);
  const [iosOfferingError,setIosOfferingError]=useState("");
  const [iosPurchaseLoading,setIosPurchaseLoading]=useState(false);
  const [iosPurchaseError,setIosPurchaseError]=useState("");
  const [iosRestoreLoading,setIosRestoreLoading]=useState(false);
  const [iosRestoreMessage,setIosRestoreMessage]=useState("");
  // Account deletion (App Store Guideline 5.1.1(v))
  const [deleteAccountOpen,setDeleteAccountOpen]=useState(false);
  const [deleteAccountConfirmText,setDeleteAccountConfirmText]=useState("");
  const [deleteAccountLoading,setDeleteAccountLoading]=useState(false);
  const [deleteAccountError,setDeleteAccountError]=useState("");
  const [deleteAccountSuccess,setDeleteAccountSuccess]=useState(false);
  const emptyProductForm = {name:"",why:"",link:"",price:"",cat:""};
  const [adminProductForm,setAdminProductForm]=useState(emptyProductForm);
  const [editingProductId,setEditingProductId]=useState(null);
  const [adminProductEditorOpen,setAdminProductEditorOpen]=useState(false);
  const [adminLoading,setAdminLoading]=useState(false);
  const [adminError,setAdminError]=useState("");
  // admin products database (read-only view of Supabase products table)
  const [productsDb,setProductsDb]=useState([]);
  const [productsDbLoading,setProductsDbLoading]=useState(false);
  const [productsDbError,setProductsDbError]=useState("");
  const [productsDbSearch,setProductsDbSearch]=useState("");
  const [productsDbCategoryFilter,setProductsDbCategoryFilter]=useState("");
  // artist applications
  const emptyAppForm={name:"",business:"",city:"",country:"",provinceState:"",services:"Hair",specialties:"",bio:"",website:"",instagram:"",experience:"",priceRange:"",email:""};
  const [appForm,setAppForm]=useState(emptyAppForm);
  const [appSubmitting,setAppSubmitting]=useState(false);
  const [appSubmitted,setAppSubmitted]=useState(false);
  const [appSubmitMessage,setAppSubmitMessage]=useState("");
  const [appSubmitError,setAppSubmitError]=useState("");
  const [artistApplicationStatus,setArtistApplicationStatus]=useState("");
  const [artistApplication,setArtistApplication]=useState(null);
  const [artistUpgradeStatus,setArtistUpgradeStatus]=useState("");
  const [artistProfileTier,setArtistProfileTier]=useState("free");
  const [adminApps,setAdminApps]=useState([]);
  const [adminAppsLoading,setAdminAppsLoading]=useState(false);
  const [adminAppsError,setAdminAppsError]=useState("");
  const [expandedAppId,setExpandedAppId]=useState(null);
  const [appActionId,setAppActionId]=useState(null);
  // admin notifications (in-app feed populated by the artist_applications trigger)
  const [adminNotifications,setAdminNotifications]=useState([]);
  const [adminNotifLoading,setAdminNotifLoading]=useState(false);
  const [adminNotifError,setAdminNotifError]=useState("");
  // admin dashboard
  const [adminMsgFilter,setAdminMsgFilter]=useState("unreplied");
  const [adminMsgViewAll,setAdminMsgViewAll]=useState(false);
  const [adminStats,setAdminStats]=useState({signups:0,messagesThisWeek:0,topArchetype:"—",upcomingWeddings:0});
  const [adminWeddings,setAdminWeddings]=useState([]);
  const [adminWelcome,setAdminWelcome]=useState("");
  const [adminWelcomeSaved,setAdminWelcomeSaved]=useState(false);
  // booked bride free membership
  const [bookedBrides,setBookedBrides]=useState([]);
  const [bookedBrideEmail,setBookedBrideEmail]=useState("");
  const [bookedBrideLoading,setBookedBrideLoading]=useState(false);
  const [bookedBrideError,setBookedBrideError]=useState("");
  const [bookedBrideMessage,setBookedBrideMessage]=useState("");
  // admin artist profiles
  const emptyArtistForm={name:"",owner:"",city:"",state:"",country:"",services:"Hair + Makeup",badge:"",specialties:"",not_ideal:"",aesthetic:"",bio:"",best_for:"",portfolio:"",education:"",rating:"5.0",reviews:"0",avatar:"",travel:false,price:"",fit_styles:"",email:"",website:""};
  const [dbArtists,setDbArtists]=useState([]);
  const [adminArtistForm,setAdminArtistForm]=useState(emptyArtistForm);
  const [editingArtistId,setEditingArtistId]=useState(null);
  const [adminArtistLoading,setAdminArtistLoading]=useState(false);
  const [adminArtistError,setAdminArtistError]=useState("");
  const [artistSearch,setArtistSearch]=useState("");
  const [artistFilterPublished,setArtistFilterPublished]=useState("");
  const [artistFilterActive,setArtistFilterActive]=useState("");
  const [artistFilterTier,setArtistFilterTier]=useState("");
  const [artistToDelete,setArtistToDelete]=useState(null);
  const [artistActionId,setArtistActionId]=useState(null);
  // admin directory seed artists
  const emptySeedArtistForm={name:"",owner:"",city:"",state:"",country:"",services:"Hair + Makeup",badge:"",specialties:"",not_ideal:"",aesthetic:"",bio:"",best_for:"",portfolio:"",education:"",rating:"5.0",reviews:"0",avatar:"",travel:false,price:"",fit_styles:"",email:"",website:"",profile_photo_url:""};
  const [seedArtistsAdmin,setSeedArtistsAdmin]=useState([]);
  const [seedArtistForm,setSeedArtistForm]=useState(emptySeedArtistForm);
  const [seedArtistFormOpen,setSeedArtistFormOpen]=useState(false);
  const [editingSeedArtistId,setEditingSeedArtistId]=useState(null);
  const [seedArtistLoading,setSeedArtistLoading]=useState(false);
  const [seedArtistSaving,setSeedArtistSaving]=useState(false);
  const [seedArtistError,setSeedArtistError]=useState("");
  const [seedArtistMessage,setSeedArtistMessage]=useState("");
  const [seedArtistSearch,setSeedArtistSearch]=useState("");
  const [seedArtistCountryFilter,setSeedArtistCountryFilter]=useState("");
  const [seedArtistStateFilter,setSeedArtistStateFilter]=useState("");
  const [seedArtistServiceFilter,setSeedArtistServiceFilter]=useState("");
  const [seedArtistTravelFilter,setSeedArtistTravelFilter]=useState("");
  const [seedArtistActionId,setSeedArtistActionId]=useState(null);
  // artist portfolio photos
  const [portfolioPhotos,setPortfolioPhotos]=useState([]);
  const [portfolioUploading,setPortfolioUploading]=useState(false);
  const [portfolioMessage,setPortfolioMessage]=useState("");
  const [portfolioError,setPortfolioError]=useState("");
  const [portfolioSavingId,setPortfolioSavingId]=useState(null);
  const [portfolioTagForms,setPortfolioTagForms]=useState({});
  const [adminPortfolioPhotos,setAdminPortfolioPhotos]=useState([]);
  const [adminPortfolioLoading,setAdminPortfolioLoading]=useState(false);
  const [adminPortfolioError,setAdminPortfolioError]=useState("");
  const [artistPortfolioFilter,setArtistPortfolioFilter]=useState("all");
  const [adminPortfolioFilter,setAdminPortfolioFilter]=useState("all");
  const [artistPortfolioIndex,setArtistPortfolioIndex]=useState(0);
  const [adminPortfolioIndex,setAdminPortfolioIndex]=useState(0);
  const [portfolioThumbsOpen,setPortfolioThumbsOpen]=useState({});
  const [photosLoadError,setPhotosLoadError]=useState("");
  const portfolioFileRef=useRef(null);
  const portfolioSectionRef=useRef(null);
  const [currentPhotos,setCurrentPhotos]=useState([]);
  const [currentPhotoUploading,setCurrentPhotoUploading]=useState(false);
  const [currentPhotoMessage,setCurrentPhotoMessage]=useState("");
  const [currentPhotoError,setCurrentPhotoError]=useState("");
  const [currentPhotoInteracted,setCurrentPhotoInteracted]=useState(false);
  // current artist's own profile (for portfolio + profile photo upload)
  const [myArtistProfile,setMyArtistProfile]=useState(null);
  const [profilePhotoUploading,setProfilePhotoUploading]=useState(false);
  const [profilePhotoMessage,setProfilePhotoMessage]=useState("");
  const [profilePhotoError,setProfilePhotoError]=useState("");
  const profilePhotoFileRef=useRef(null);
  const emptyArtistEditForm={business_name:"",owner_name:"",city:"",state:"",country:"",services:"",bio:"",aesthetic:"",specialties:"",best_for:[],not_ideal_for:[],signature_method:"",featured_services:"",artist_notes:"",featured_badge_label:"",cover_image_url:"",education:"",starting_price:"",travels:false,website:"",instagram:"",email:""};
  const [artistEditOpen,setArtistEditOpen]=useState(false);
  const [artistEditForm,setArtistEditForm]=useState(emptyArtistEditForm);
  const [artistEditSaving,setArtistEditSaving]=useState(false);
  const [artistEditMessage,setArtistEditMessage]=useState("");
  const [artistEditError,setArtistEditError]=useState("");
  const [artistVisibilitySaving,setArtistVisibilitySaving]=useState(false);
  const [artistVisibilityMessage,setArtistVisibilityMessage]=useState("");
  const [artistVisibilityError,setArtistVisibilityError]=useState("");
  const [artistTab, setArtistTab] = useState("dashboard");
  // approved artists from applications (for public directory)
  const [approvedArtists,setApprovedArtists]=useState([]);
  const [hiddenDirectoryArtists,setHiddenDirectoryArtists]=useState(0);
  const [directoryError,setDirectoryError]=useState("");
  // bride inspo board
  const [inspoPhotos,setInspoPhotos]=useState([]);
  const [inspoLoading,setInspoLoading]=useState(false);
  const [inspoUploading,setInspoUploading]=useState(false);
  const [inspoMessage,setInspoMessage]=useState("");
  const [inspoError,setInspoError]=useState("");
  const [inspoInteracted,setInspoInteracted]=useState(false);
  const [inspoDeletingId,setInspoDeletingId]=useState(null);
  const [inspoCategory,setInspoCategory]=useState("Hair");
  const [inspoNotes,setInspoNotes]=useState("");
  const inspoFileRef=useRef(null);
  // saved artists (bride favorites — only real artist_profile UUIDs)
  const [savedArtistIds,setSavedArtistIds]=useState(()=>new Set());
  const [savedArtistMessage,setSavedArtistMessage]=useState("");
  const [savedArtistError,setSavedArtistError]=useState("");
  const [savedArtistPending,setSavedArtistPending]=useState(false);
  // artist portfolio (per-selected-artist, source-aware, inline horizontal strip)
  const [galleryPhotos,setGalleryPhotos]=useState([]);
  const [galleryLoading,setGalleryLoading]=useState(false);
  const [galleryError,setGalleryError]=useState("");

  useEffect(()=>{chatEndRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);

  useEffect(()=>{
    setAuthError("");
    setAuthResetSent(false);
    setResetConfirmPassword("");
  },[authMode]);

  function authCallbackInfo(url){
    if(!url || (!url.includes("auth/callback") && !url.includes("login-callback"))) {
      return {isAuthCallback:false,isRecovery:false,params:new URLSearchParams()};
    }
    try{
      const parsedUrl=new URL(url);
      const params=new URLSearchParams(parsedUrl.search);
      if(parsedUrl.hash){
        new URLSearchParams(parsedUrl.hash.replace(/^#/,"")).forEach((value,key)=>params.set(key,value));
      }
      return {
        isAuthCallback:true,
        isRecovery:params.get("type")==="recovery",
        params,
      };
    }catch(error){
      console.error("AUTH CALLBACK URL PARSE ERROR:", error);
      return {isAuthCallback:false,isRecovery:false,params:new URLSearchParams()};
    }
  }

  function showResetPasswordScreen(){
    setPasswordRecoveryStored();
    setScreen("reset-password");
    setIsPasswordRecovery(true);
    setAuthOpen(false);
    setAuthPassword("");
    setResetConfirmPassword("");
    setAuthError("");
    setAuthResetSent(false);
    setAuthCheckEmail(false);
    setCheckoutAfterAuth(false);
  }

  function showResetExpiredScreen(){
    clearPasswordRecoveryStored();
    setIsPasswordRecovery(false);
    setScreen("reset-expired");
    setAuthOpen(false);
    setAuthPassword("");
    setResetConfirmPassword("");
    setAuthError("");
    setAuthResetSent(false);
    setAuthCheckEmail(false);
  }

  async function handleAuthCallbackUrl(url){
    console.log("AUTH CALLBACK RECEIVED:", url);
    const callbackInfo=authCallbackInfo(url);
    if(!callbackInfo.isAuthCallback) return;
    const errorCode=callbackInfo.params.get("error_code");
    const errorParam=callbackInfo.params.get("error");
    const errorDescription=callbackInfo.params.get("error_description");
    if(errorCode||errorParam){
      console.log("AUTH CALLBACK ERROR PARAMS:", {error:errorParam, error_code:errorCode, error_description:errorDescription});
      showResetExpiredScreen();
      return;
    }
    if(callbackInfo.isRecovery){
      console.log("RECOVERY MODE", true);
      setPasswordRecoveryStored();
      showResetPasswordScreen();
    }
    try{
      const params=callbackInfo.params;
      const accessToken=params.get("access_token");
      const refreshToken=params.get("refresh_token");
      const code=params.get("code");
      let isRecovery=callbackInfo.isRecovery;
      if(accessToken&&refreshToken){
        console.log("AUTH SESSION RESTORE STARTED");
        const {data,error}=await supabase.auth.setSession({access_token:accessToken,refresh_token:refreshToken});
        if(error)throw error;
        console.log("AUTH SESSION RESTORE SUCCESS:", data?.session?.user?.id);
        setSession(data?.session||null);
        if(isRecovery){
          setPasswordRecoveryStored();
          showResetPasswordScreen();
          return;
        }
      }else if(code){
        console.log("AUTH SESSION EXCHANGE STARTED");
        const {data,error}=await supabase.auth.exchangeCodeForSession(url);
        if(error)throw error;
        console.log("AUTH SESSION EXCHANGE SUCCESS:", data?.session?.user?.id);
        isRecovery = isRecovery || data?.redirectType === "recovery";
        setSession(data?.session||null);
        if(isRecovery){
          setPasswordRecoveryStored();
          showResetPasswordScreen();
          return;
        }
      }else{
        console.log("AUTH CALLBACK IGNORED: no code or tokens found");
        return;
      }
      if(isRecovery){
        showResetPasswordScreen();
      }else{
        if(isPasswordRecoveryStored()) return;
        await refreshAuthState();
        setAuthOpen(false);
        setAuthCheckEmail(false);
        setScreen("home");
      }
    }catch(error){
      console.error("AUTH CALLBACK ERROR:", error);
    }
  }

  useEffect(()=>{
    console.log("APP URL:", typeof window !== "undefined" ? window.location.href : "(no window)");
    console.log("SESSION:", session);
    console.log("RECOVERY MODE:", localStorage.getItem("passwordRecoveryMode"));
    console.log("CURRENT URL:", window.location.href);
    const startupCallbackInfo=authCallbackInfo(window.location?.href||"");
    console.log("STARTUP CALLBACK INFO:", startupCallbackInfo);
    if(startupCallbackInfo.isRecovery){
      console.log("RECOVERY MODE", true);
      setPasswordRecoveryStored();
      showResetPasswordScreen();
    }else{
      clearPasswordRecoveryStored();
      setIsPasswordRecovery(false);
    }
    setRoleChecked(false);
    supabase.auth.getSession().then(async ({data})=>{
      console.log("SESSION:", data.session);
      setSession(data.session);
      if(startupCallbackInfo.isRecovery || isPasswordRecovery) {
        setRoleChecked(true);
        setAuthChecked(true);
        return;
      }
      if(!DISABLE_RECENT_STARTUP_FEATURES)syncProfileEmailFromSession(data.session);
      await checkAdmin(data.session?.user);
      setRoleChecked(true);
      setAuthChecked(true);
    }).catch(error=>{
      console.error("STARTUP AUTH LOAD ERROR:", error);
      setSession(null);
      checkAdmin(null);
      setRoleChecked(true);
      setAuthChecked(true);
    });
    const {data:{subscription}}=supabase.auth.onAuthStateChange(async (event,nextSession)=>{
      try{
        console.log("AUTH EVENT:", event);
        console.log("SESSION:", nextSession);
        console.log("RECOVERY MODE:", localStorage.getItem("passwordRecoveryMode"));
        console.log("CURRENT URL:", window.location.href);
        setAuthChecked(false);
        setRoleChecked(false);
        if(event==="PASSWORD_RECOVERY"){
          setSession(nextSession);
          console.log("PASSWORD RECOVERY DETECTED");
          setPasswordRecoveryStored();
          console.log("RECOVERY MODE", true);
          showResetPasswordScreen();
          setRoleChecked(true);
          setAuthChecked(true);
          return;
        }
        console.log("SESSION:", nextSession);
        setSession(nextSession);
        if(!DISABLE_RECENT_STARTUP_FEATURES)await syncProfileEmailFromSession(nextSession);
        await checkAdmin(nextSession?.user);
        setRoleChecked(true);
        setAuthChecked(true);
      }catch(error){
        console.error("AUTH STATE CHANGE ERROR:", error);
        setSession(null);
        await checkAdmin(null);
        setRoleChecked(true);
        setAuthChecked(true);
      }
    });
    let urlOpenListener;
    (async()=>{
      try{
        console.log("DEEP LINK LISTENER REGISTERING");
        urlOpenListener=await CapacitorApp.addListener("appUrlOpen",({url})=>{
          console.log("DEEP LINK appUrlOpen FIRED:", url);
          return handleAuthCallbackUrl(url);
        });
        console.log("DEEP LINK LISTENER REGISTERED");
        const launchUrl=await CapacitorApp.getLaunchUrl?.();
        console.log("LAUNCH URL RESULT:", launchUrl);
        if(launchUrl?.url)await handleAuthCallbackUrl(launchUrl.url);
      }catch(e){
        console.log("DEEP LINK LISTENER UNAVAILABLE:", e?.message || e);
      }
    })();
    return ()=>{
      subscription.unsubscribe();
      if(urlOpenListener)urlOpenListener.remove();
    };
  },[]);

  async function refreshAuthState(){
    try{
      setAuthChecked(false);
      setRoleChecked(false);
      const {data}=await supabase.auth.getSession();
      console.log("SESSION:", data.session);
      setSession(data.session);
      if(!DISABLE_RECENT_STARTUP_FEATURES)await syncProfileEmailFromSession(data.session);
      await checkAdmin(data.session?.user);
      setRoleChecked(true);
      setAuthChecked(true);
      return data.session;
    }catch(error){
      console.error("REFRESH AUTH STATE ERROR:", error);
      setSession(null);
      await checkAdmin(null);
      setRoleChecked(true);
      setAuthChecked(true);
      return null;
    }
  }

  async function syncProfileEmailFromSession(activeSession=session, selectedRole=null){
    if(DISABLE_RECENT_STARTUP_FEATURES)return null;
    const user=activeSession?.user;
    const email=user?.email?.trim()||"";
    if(!user?.id||!email)return null;
    try{
      const {data:existing,error:lookupError}=await supabase.from("profiles").select("id,email,role").eq("id",user.id).maybeSingle();
      if(lookupError)throw lookupError;
      if(existing){
        if(!existing.email||existing.email.toLowerCase()!==email.toLowerCase()){
          const {data:updated,error:updateError}=await supabase.from("profiles").update({email}).eq("id",user.id).select("id,email,role").single();
          if(updateError)throw updateError;
          console.log("PROFILE EMAIL SYNC UPDATED:", updated);
          return updated;
        }
        return existing;
      }
      const {data:created,error:createError}=await supabase.from("profiles").insert({id:user.id,email,role:selectedRole||userRole||"bride"}).select("id,email,role").single();
      if(createError)throw createError;
      console.log("PROFILE EMAIL SYNC CREATED:", created);
      return created;
    }catch(error){
      console.error("PROFILE EMAIL SYNC ERROR:", error);
      return null;
    }
  }

  function hydrateProfileFromRow(row,userId){
    if(!row)return;
    clearCachedProfilePhotos(userId);
    setProfile(prev=>({
      ...prev,
      name:row.name||prev.name||"",
      date:row.wedding_date||row.date||prev.date||"",
      location:row.location||prev.location||"",
      country:row.country||prev.country||"United States",
      province:row.state||prev.province||"",
      skinType:row.skin_type||prev.skinType||"",
      hairType:row.hair_type||prev.hairType||"",
      hairDensity:row.hair_density||prev.hairDensity||"",
      faceShape:row.face_shape||prev.faceShape||"",
      eyeColor:row.eye_color||prev.eyeColor||"",
      eyeShape:row.eye_shape||prev.eyeShape||"",
      hairColor:row.hair_color||prev.hairColor||"",
      hairLength:row.hair_length||prev.hairLength||"",
      concerns:row.concerns||prev.concerns||"",
      inspoUrls:Array.isArray(row.inspo_urls)&&row.inspo_urls.length?row.inspo_urls:prev.inspoUrls,
    }));
    if(Array.isArray(row.mood_items))setMoodItems(row.mood_items);
  }

  function clearCachedProfilePhotos(userId){
    try{
      if(userId)localStorage.removeItem(`profile_photo_${userId}`);
      Object.keys(localStorage).forEach(key=>{
        if(key.startsWith("profile_photo_"))localStorage.removeItem(key);
      });
    }catch(error){
      console.warn("Could not clear cached profile photos:", error);
    }
  }

  async function displayUrlForStoredPhoto(bucket,imageUrl){
    const raw=String(imageUrl||"").trim();
    if(!raw)return "";
    const marker=`/${bucket}/`;
    const markerIndex=raw.indexOf(marker);
    const storagePath=markerIndex===-1?raw:raw.slice(markerIndex+marker.length);
    if(!storagePath||/^https?:\/\//i.test(storagePath)&&markerIndex===-1)return raw;
    const {data,error}=await supabase.storage.from(bucket).createSignedUrl(storagePath,3600);
    if(!error&&data?.signedUrl)return data.signedUrl;
    return raw;
  }

  async function loadCurrentPhotos(){
    const user=session?.user;
    if(!user){
      setCurrentPhotos([]);
      return;
    }
    const tableName="bride_current_photos";
    const selectedColumns="id, bride_id, image_url, notes, photo_type, sort_order, created_at";
    console.log("CURRENT PHOTOS FETCH START");
    console.log("CURRENT PHOTOS auth user id:", user.id);
    console.log("CURRENT PHOTOS table name:", tableName);
    console.log("CURRENT PHOTOS selected columns:", selectedColumns);
    setCurrentPhotoError("");
    try{
      const {data,error}=await supabase
        .from(tableName)
        .select(selectedColumns)
        .eq("bride_id",user.id)
        .order("sort_order",{ascending:true})
        .order("created_at",{ascending:false});
      console.log("CURRENT PHOTOS fetch error:", error);
      if(error){
        console.error("CURRENT PHOTO READ ERROR:", error);
        setCurrentPhotos([]);
        return;
      }
      console.log("CURRENT PHOTOS rows returned:", (data||[]).length);
      const rowsWithImages=(data||[]).filter(photo=>photo?.image_url);
      const rows=await Promise.all(rowsWithImages.map(async photo=>({
        ...photo,
        display_url:await displayUrlForStoredPhoto(BRIDE_CURRENT_BUCKET,photo.image_url),
      })));
      console.log("CURRENT PHOTOS fetched current photos count:", rows.length);
      console.log("CURRENT PHOTOS all current photo URLs:", rows.map(photo=>photo.image_url));
      console.log("CURRENT PHOTOS profile image URL updated?:", false);
      console.log("CURRENT PHOTOS bride_current_photos row inserted?:", false);
      setCurrentPhotos(rows);
    }catch(err){
      console.error("CURRENT PHOTO READ EXCEPTION:", err);
      console.log("CURRENT PHOTOS fetch error:", err);
      setCurrentPhotos([]);
    }
  }

  async function uploadCurrentPhoto(file){
    console.log("UPLOAD FUNCTION CALLED:", "uploadCurrentPhoto");
    const user=session?.user;
    if(!file)return;
    if(!user){
      setCurrentPhotoError("Please sign in to upload current photos.");
      setAuthMode("login");
      setAuthOpen(true);
      setTimeout(()=>setCurrentPhotoError(""),5000);
      return;
    }
    setCurrentPhotoInteracted(true);
    setCurrentPhotoUploading(true);
    setCurrentPhotoError("");
    setCurrentPhotoMessage("");
    try{
      const randomId=Math.random().toString(36).slice(2,10);
      const filePath=`${user.id}/${Date.now()}-${randomId}.jpeg`;
      console.log("CURRENT PHOTO upload bucket/path:", {bucket:BRIDE_CURRENT_BUCKET,path:filePath});
      const {data:uploadData,error:uploadError}=await supabase.storage
        .from(BRIDE_CURRENT_BUCKET)
        .upload(filePath,file,{cacheControl:"3600",upsert:false,contentType:file.type||"image/jpeg"});
      if(uploadError){
        console.error("CURRENT PHOTO STORAGE UPLOAD ERROR:", uploadError);
        setCurrentPhotoError("We couldn't load your photos right now.");
        setTimeout(()=>setCurrentPhotoError(""),6000);
        return;
      }
      const storedPath=uploadData?.path||filePath;
      const {data:publicUrlData}=supabase.storage.from(BRIDE_CURRENT_BUCKET).getPublicUrl(storedPath);
      const imageUrl=publicUrlData?.publicUrl||"";
      if(!imageUrl){
        console.error("CURRENT PHOTO PUBLIC URL ERROR:", {storedPath,publicUrlData});
        setCurrentPhotoError("We couldn't load your photos right now.");
        setTimeout(()=>setCurrentPhotoError(""),6000);
        return;
      }
      const insertPayload={
        bride_id:user.id,
        image_url:imageUrl,
        notes:null,
        photo_type:"current",
        sort_order:0,
      };
      console.log("CURRENT PHOTO database table updated:", "bride_current_photos");
      console.log("CURRENT PHOTO profile image URL updated?:", false);
      console.log("CURRENT PHOTO bride_current_photos row inserted?:", true);
      console.log("CURRENT PHOTO INSERT payload:", insertPayload);
      const {data:insertData,error:insertError}=await supabase
        .from("bride_current_photos")
        .insert(insertPayload)
        .select("id, bride_id, image_url, notes, photo_type, sort_order, created_at")
        .single();
      if(insertError){
        console.error("CURRENT PHOTO INSERT ERROR:", insertError);
        setCurrentPhotoError("We couldn't load your photos right now.");
        setTimeout(()=>setCurrentPhotoError(""),6000);
        return;
      }
      const displayUrl=await displayUrlForStoredPhoto(BRIDE_CURRENT_BUCKET,insertData.image_url);
      const savedPhoto={...insertData,display_url:displayUrl};
      setCurrentPhotos(prev=>[savedPhoto,...prev]);
      console.log("CURRENT PHOTO saved current photos count incremented");
      console.log("CURRENT PHOTO all current photo URLs:", [savedPhoto,...currentPhotos].map(photo=>photo.image_url));
      setCurrentPhotoMessage("Current photo saved.");
      setTimeout(()=>setCurrentPhotoMessage(""),3000);
    }catch(err){
      console.error("CURRENT PHOTO UPLOAD EXCEPTION:", err);
      setCurrentPhotoError("We couldn't load your photos right now.");
      setTimeout(()=>setCurrentPhotoError(""),6000);
    }finally{
      setCurrentPhotoUploading(false);
      if(currentPhotoFileRef.current)currentPhotoFileRef.current.value="";
      if(photoRef.current)photoRef.current.value="";
    }
  }

  async function uploadBrideProfilePhoto(file){
    console.log("PROFILE PHOTO UPLOAD START");
    console.log("UPLOAD FUNCTION CALLED:", "uploadBrideProfilePhoto");
    console.log("PROFILE PHOTO UPLOAD: should not insert current photo");
    const user=session?.user;
    if(!file)return;
    if(!user){
      setCurrentPhotoError("Please sign in to upload a profile photo.");
      setAuthMode("login");
      setAuthOpen(true);
      setTimeout(()=>setCurrentPhotoError(""),5000);
      return;
    }
    console.log("PROFILE PHOTO current user id:", user.id);
    console.log("PROFILE PHOTO bride profile id:", user.id);
    setCurrentPhotoUploading(true);
    setCurrentPhotoError("");
    setCurrentPhotoMessage("");
    try{
      const {data:beforeProfile,error:beforeError}=await supabase
        .from("bride_profiles")
        .select("id, profile_image_url, profile_photo_url")
        .eq("id",user.id)
        .maybeSingle();
      if(beforeError){
        console.warn("PROFILE PHOTO profile_image_url before update read error:", beforeError);
      }
      console.log("PROFILE PHOTO profile_image_url before update:", beforeProfile?.profile_image_url || null);
      const brideProfileId=beforeProfile?.id || user.id;
      console.log("PROFILE PHOTO bride profile id used for storage/update:", brideProfileId);
      const photoId=globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const filePath=`${brideProfileId}/profile-photo-${photoId}.jpeg`;
      console.log("PROFILE PHOTO storage path:", filePath);
      console.log("PROFILE PHOTO upload bucket/path:", {bucket:BRIDE_PROFILE_BUCKET,path:filePath});
      console.log("PROFILE PHOTO database table updated:", "bride_profiles");
      console.log("PROFILE PHOTO bride_current_photos row inserted?:", false);
      const {data:uploadData,error:uploadError}=await supabase.storage
        .from(BRIDE_PROFILE_BUCKET)
        .upload(filePath,file,{cacheControl:"3600",upsert:false,contentType:file.type||"image/jpeg"});
      if(uploadError){
        console.error("PROFILE PHOTO STORAGE UPLOAD ERROR:", uploadError);
        setCurrentPhotoError("We couldn't update your profile photo right now.");
        setTimeout(()=>setCurrentPhotoError(""),6000);
        return;
      }
      const storedPath=uploadData?.path||filePath;
      const {data:publicUrlData}=supabase.storage.from(BRIDE_PROFILE_BUCKET).getPublicUrl(storedPath);
      const profileImageUrl=publicUrlData?.publicUrl||"";
      if(!profileImageUrl){
        console.error("PROFILE PHOTO PUBLIC URL ERROR:", {storedPath,publicUrlData});
        setCurrentPhotoError("We couldn't update your profile photo right now.");
        setTimeout(()=>setCurrentPhotoError(""),6000);
        return;
      }
      console.log("PROFILE PHOTO profile image URL updated?:", true);
      console.log("PROFILE PHOTO public URL:", profileImageUrl);
      const updatePayload={
        profile_image_url:profileImageUrl,
        profile_photo_url:profileImageUrl,
        updated_at:new Date().toISOString(),
      };
      const updateResponse=await supabase
        .from("bride_profiles")
        .update(updatePayload)
        .eq("id",brideProfileId)
        .select("*");
      console.log("PROFILE PHOTO Supabase update response:", updateResponse);
      let updateRows=Array.isArray(updateResponse.data) ? updateResponse.data : [];
      let updatedProfile=updateRows[0] || null;
      let updateError=updateResponse.error;
      if(updateError){
        console.error("PROFILE PHOTO DB UPDATE ERROR:", updateError);
        setCurrentPhotoError("We couldn't update your profile photo right now.");
        setTimeout(()=>setCurrentPhotoError(""),6000);
        return;
      }
      if(!updatedProfile){
        console.warn("PROFILE PHOTO DB UPDATE returned no row; creating bride_profiles row for current user id");
        const insertResponse=await supabase
          .from("bride_profiles")
          .upsert({id:user.id,...updatePayload},{onConflict:"id"})
          .select("*");
        console.log("PROFILE PHOTO Supabase insert/upsert response:", insertResponse);
        const insertRows=Array.isArray(insertResponse.data) ? insertResponse.data : [];
        updatedProfile=insertRows[0] || null;
        updateError=insertResponse.error;
        if(updateError){
          console.error("PROFILE PHOTO DB UPSERT ERROR:", updateError);
          setCurrentPhotoError("We couldn't update your profile photo right now.");
          setTimeout(()=>setCurrentPhotoError(""),6000);
          return;
        }
      }
      console.log("PROFILE PHOTO DB UPDATE SUCCESS:", updatedProfile);
      console.log("PROFILE PHOTO profile_image_url after update:", updatedProfile?.profile_image_url || profileImageUrl);
      console.log("PROFILE PHOTO clearing cached avatar/profile state before reload");
      setProfile(prev=>({...prev,profilePhoto:null}));
      await loadBrideProfile(user.id);
      setCurrentPhotoMessage("Profile photo updated.");
      setTimeout(()=>setCurrentPhotoMessage(""),3000);
    }catch(err){
      console.error("PROFILE PHOTO UPLOAD EXCEPTION:", err);
      alert(`Profile photo upload error: ${err?.message || String(err)}`);
      setCurrentPhotoError("We couldn't update your profile photo right now.");
      setTimeout(()=>setCurrentPhotoError(""),6000);
    }finally{
      setCurrentPhotoUploading(false);
      if(photoRef.current)photoRef.current.value="";
    }
  }

  async function loadInspoPhotos(){
    const user=session?.user;
    if(!user){ setInspoPhotos([]); return; }
    console.log("INSPO READ table = bride_inspo_photos");
    setInspoLoading(true);
    setInspoError("");
    try{
      const {data,error}=await supabase
        .from("bride_inspo_photos")
        .select("id, bride_id, image_url, notes, category, created_at")
        .eq("bride_id",user.id)
        .order("created_at",{ascending:false});
      if(error){
        console.error("INSPO READ ERROR:", error);
        setInspoPhotos([]);
        return;
      }
      console.log("INSPO row count:", (data||[]).length);
      setInspoPhotos((data||[]).filter(photo=>photo?.image_url));
    }catch(err){
      console.error("INSPO READ EXCEPTION:", err);
      setInspoPhotos([]);
    }finally{
      setInspoLoading(false);
    }
  }

  async function uploadInspoPhoto(file){
    const user=session?.user;
    if(!file) return;
    if(!user){
      setInspoError("Please sign in to upload inspo photos.");
      setTimeout(()=>setInspoError(""),5000);
      return;
    }
    setInspoInteracted(true);
    setInspoUploading(true);
    setInspoError("");
    setInspoMessage("");
    try{
      const ext=(file.name.split(".").pop()||"jpg").toLowerCase();
      const filePath=`${user.id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
      console.log("INSPO UPLOAD path:", filePath);
      const {data:uploadData,error:uploadError}=await supabase.storage
        .from(BRIDE_INSPO_BUCKET)
        .upload(filePath,file,{cacheControl:"3600",upsert:false,contentType:file.type||"image/jpeg"});
      if(uploadError){
        console.error("INSPO STORAGE UPLOAD ERROR:", uploadError);
        setInspoError("We couldn't load your inspiration right now.");
        setTimeout(()=>setInspoError(""),6000);
        return;
      }
      const storedPath=uploadData?.path||filePath;
      const {data:publicUrlData}=supabase.storage.from(BRIDE_INSPO_BUCKET).getPublicUrl(storedPath);
      const publicUrl=publicUrlData?.publicUrl||"";
      console.log("INSPO publicUrl:", publicUrl);
      if(!publicUrl){
        console.error("INSPO PUBLIC URL ERROR:", {storedPath});
        setInspoError("We couldn't load your inspiration right now.");
        setTimeout(()=>setInspoError(""),6000);
        return;
      }
      const insertPayload={
        bride_id:user.id,
        image_url:publicUrl,
        notes:(inspoNotes||"").trim()||null,
        category:inspoCategory||null,
      };
      console.log("INSPO INSERT payload:", insertPayload);
      const {data:insertData,error:insertError}=await supabase
        .from("bride_inspo_photos")
        .insert(insertPayload)
        .select()
        .single();
      if(insertError){
        console.error("INSPO INSERT ERROR:", insertError);
        setInspoError("We couldn't load your inspiration right now.");
        setTimeout(()=>setInspoError(""),6000);
        return;
      }
      console.log("INSPO INSERT SUCCESS:", insertData);
      setInspoPhotos(prev=>[insertData,...prev]);
      setInspoNotes("");
      setInspoMessage("Inspo photo saved.");
      setTimeout(()=>setInspoMessage(""),3000);
    }catch(err){
      console.error("INSPO UPLOAD EXCEPTION:", err);
      setInspoError("We couldn't load your inspiration right now.");
      setTimeout(()=>setInspoError(""),6000);
    }finally{
      setInspoUploading(false);
      if(inspoFileRef.current) inspoFileRef.current.value="";
    }
  }

  async function deleteInspoPhoto(photo){
    if(!photo?.id) return;
    const user=session?.user;
    if(!user) return;
    setInspoInteracted(true);
    setInspoDeletingId(photo.id);
    setInspoError("");
    try{
      // Try to delete the underlying storage object too (best-effort)
      if(photo.image_url){
        const marker=`/${BRIDE_INSPO_BUCKET}/`;
        const idx=photo.image_url.indexOf(marker);
        if(idx!==-1){
          const storagePath=photo.image_url.slice(idx+marker.length);
          console.log("INSPO DELETE storage path:", storagePath);
          const {error:storageError}=await supabase.storage.from(BRIDE_INSPO_BUCKET).remove([storagePath]);
          if(storageError) console.warn("INSPO STORAGE DELETE WARNING:", storageError);
        }
      }
      const {error}=await supabase.from("bride_inspo_photos").delete().eq("id",photo.id).eq("bride_id",user.id);
      if(error){
        console.error("INSPO DELETE ERROR:", error);
        setInspoError("We couldn't load your inspiration right now.");
        setTimeout(()=>setInspoError(""),6000);
        return;
      }
      console.log("INSPO DELETE SUCCESS:", photo.id);
      setInspoPhotos(prev=>prev.filter(p=>p.id!==photo.id));
    }catch(err){
      console.error("INSPO DELETE EXCEPTION:", err);
      setInspoError("We couldn't load your inspiration right now.");
      setTimeout(()=>setInspoError(""),6000);
    }finally{
      setInspoDeletingId(null);
    }
  }

  async function loadBrideProfile(userId){
    if(!userId) return;
    console.log("BRIDE PROFILE READ table = bride_profiles");
    console.log("BRIDE PROFILE current_user_id:", userId);
    console.log("profileImageURL before fetch:", profile.profilePhoto || null);
    try{
      const {data,error}=await supabase
        .from("bride_profiles")
        .select("id, wedding_date, wedding_location, skin_type, hair_type, hair_density, primary_archetype, secondary_archetype, mood_keywords, profile_image_url, profile_photo_url, created_at, updated_at")
        .eq("id",userId)
        .maybeSingle();
      if(error){
        console.error("BRIDE PROFILE READ ERROR:", error);
        console.log("BRIDE PROFILE row returned: null (error)");
        return;
      }
      console.log("BRIDE PROFILE row returned:", data || null);
      if(!data) return;
      const profileImageUrl=data.profile_image_url || null;
      const profilePhotoUrl=data.profile_photo_url || null;
      const loadedProfilePhoto=[
        profilePhotoUrl,
        profileImageUrl,
      ].find(url=>String(url||"").includes("/public/bride-profile-photo/")) || profilePhotoUrl || profileImageUrl || null;
      console.log("profileImageURL after fetch:", loadedProfilePhoto);
      setProfile(prev=>({
        ...prev,
        date: data.wedding_date || prev.date || "",
        location: data.wedding_location || prev.location || "",
        skinType: data.skin_type || prev.skinType || "",
        hairType: data.hair_type || prev.hairType || "",
        hairDensity: data.hair_density || prev.hairDensity || "",
        profilePhoto: loadedProfilePhoto,
      }));
      if(Array.isArray(data.mood_keywords)) setMoodItems(data.mood_keywords);
      if(data.primary_archetype && data.secondary_archetype){
        setResult(prev=>prev||{primary:data.primary_archetype, secondary:data.secondary_archetype});
      }
      if(data.updated_at)setQuizUpdatedAt(data.updated_at);
    }catch(err){
      console.error("BRIDE PROFILE READ EXCEPTION:", err);
    }
  }

  async function shareResult(){
    if(!shareCardRef.current)return;
    try{
      const canvas=await html2canvas(shareCardRef.current,{backgroundColor:"#ffffff",scale:2});
      const dataUrl=canvas.toDataURL("image/png");
      await Share.share({title:"My Bridal Archetype",text:"I just discovered my bridal archetype on The Bridal Edit™",url:dataUrl});
    }catch(e){console.error("Share error",e);}
  }

  async function registerPush(user){
    if(pushRegisteredUserRef.current===user.id)return;
    pushRegisteredUserRef.current=user.id;
    try{
      const perm=await PushNotifications.requestPermissions();
      if(perm.receive!=="granted")return;
      await PushNotifications.register();
      PushNotifications.addListener("registration",async(token)=>{
        console.log("Push token",token.value);
        await supabase.from("profiles").upsert({id:user.id,push_token:token.value},{onConflict:"id"});
      });
      PushNotifications.addListener("registrationError",(err)=>{
        console.error("Push registration error",err);
      });
    }catch(e){console.log("Push not available",e);}
  }

  useEffect(()=>{if(session?.user)registerPush(session.user);},[session]);

  const priArc = result ? ARC[result.primary] : null;
  const secArc = result ? ARC[result.secondary] : null;

  useEffect(()=>{
    function handleSwipePreferenceUpdate(event){
      const next=event?.detail || readSwipePreferenceSummary();
      if(next)setSwipePreferenceSummary(next);
    }
    window.addEventListener("bridalSwipePreferencesUpdated",handleSwipePreferenceUpdate);
    return ()=>window.removeEventListener("bridalSwipePreferencesUpdated",handleSwipePreferenceUpdate);
  },[]);

  // Derived from quiz answers
  const derivedSkin = Object.keys(skinAns).length > 0 ? deriveSkinType(skinAns) : profile.skinType;
  const derivedHairType = Object.keys(hairAns).length > 0 ? deriveHairType(hairAns) : profile.hairType;
  const derivedHairDensity = Object.keys(hairAns).length > 0 ? deriveHairDensity(hairAns) : profile.hairDensity;
  const derivedFeatures = {
    faceShape: featureAns.faceShape || profile.faceShape,
    eyeColor: featureAns.eyeColor || profile.eyeColor,
    eyeShape: featureAns.eyeShape || profile.eyeShape,
    hairColor: featureAns.hairColor || profile.hairColor,
    hairLength: featureAns.hairLength || profile.hairLength,
  };

  const hasPremiumAccess = isPremium || isAdmin;
  const personalizedProductRecs = getProductRecs(derivedSkin, derivedHairType, derivedHairDensity, result?.primary||"") || [];
  const productRecs = (hasPremiumAccess ? personalizedProductRecs : GENERIC_PRODUCT_RECS) || [];
  const rawTimeline = (()=>{try{return getTimeline(profile.date, result?.primary||"");}catch(err){console.error("GET TIMELINE ERROR:",err);return [];}})();
  const timeline = Array.isArray(rawTimeline) ? rawTimeline : [];
  const nowItems = timeline.filter(t=>t&&t.status==="now" && !completedTimeline[t.id]);
  const overdueItems = timeline.filter(t=>t&&t.status==="overdue" && !completedTimeline[t.id]);
  const completedCount = timeline.filter(t=>t&&completedTimeline[t.id]).length;
  const daysToWedding = profile.date ? Math.max(0, daysBetween(new Date(), parseLocalDate(profile.date))) : 0;
  const userInitial = userFirstName?.trim()?.[0]?.toUpperCase() || session?.user?.email?.trim()?.[0]?.toUpperCase() || "?";

  async function checkAdmin(user){
    console.log("PROFILE FETCH START");
    if(!user){
      setIsAdmin(false);
      setIsPremium(false);
      setSubscriptionStatus("");
      setFreeMembership(false);
      setIsBookedBride(false);
      setUserFirstName("");
      setUserRole("");
      setArtistApplicationStatus("");
      setArtistApplication(null);
      setArtistUpgradeStatus("");
      setArtistProfileTier("free");
      console.log("CURRENT USER ROLE:", null);
      console.log("APPLICATION STATUS:", "");
      console.log("ARTIST APPROVED:", false);
      console.log("ARTIST PROFILE TIER:", "free");
      console.log("ARTIST UPGRADE STATUS:", "");
      console.log("ARTIST HAS UPGRADED PROFILE:", false);
      return false;
    }
    try{
    const {data,error}=await supabase.from("profiles").select("*").eq("id",user.id).maybeSingle();
    if(!error&&data)hydrateProfileFromRow(data,user.id);
    await loadBrideProfile(user.id);
    if(!DISABLE_RECENT_STARTUP_FEATURES && user.email && data && data.email !== user.email){
      supabase.from("profiles").update({email:user.email}).eq("id",user.id).then(()=>{}).catch(()=>{});
    }
    // Admin is determined ONLY by profile.role === "admin" or profile.is_admin === true.
    // Email-based admin override has been removed — never grant admin based on logged-in email alone.
    // If a temporary allowlist is ever needed, populate ADMIN_EMAIL_ALLOWLIST explicitly.
    const ADMIN_EMAIL_ALLOWLIST = [];
    const profileSaysAdmin = !error && (data?.role === "admin" || data?.is_admin === true);
    const emailAllowlisted = !!(user.email && ADMIN_EMAIL_ALLOWLIST.includes(user.email.trim().toLowerCase()));
    const adminAccess = profileSaysAdmin || emailAllowlisted;
    const adminReason = profileSaysAdmin
      ? `profile.${data?.is_admin===true?"is_admin=true":"role=admin"}`
      : emailAllowlisted
        ? "email in ADMIN_EMAIL_ALLOWLIST"
        : "not admin (no profile.is_admin/role=admin and email not in allowlist)";
    console.log("ADMIN CHECK:", {
      current_user_id: user.id,
      current_email: user.email || null,
      resolved_role: data?.role || null,
      profile_is_admin_flag: data?.is_admin === true,
      isAdmin: adminAccess,
      reason: adminReason,
    });
    const status = !error ? (data?.subscription_status || "") : "";
    const freeMem = !error && data?.free_membership === true;
    const bookedBride = !error && data?.is_booked_bride === true;
    const legacyPremium = !error && (data?.is_premium===true||data?.premium===true||data?.role==="premium");
    const premiumAccess = adminAccess || status === "active" || freeMem || bookedBride || legacyPremium;
    setIsAdmin(adminAccess);
    setSubscriptionStatus(status);
    setFreeMembership(freeMem);
    setIsBookedBride(bookedBride);
    setIsPremium(premiumAccess);
    setUserFirstName(!error?(data?.first_name||""):"");
    const loadedRole = !error ? (data?.role || "") : "";
    setUserRole(loadedRole);
    const {data:latestApplication}=await supabase.from("artist_applications").select("*").eq("user_id",user.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
    const applicationStatus = latestApplication?.status || "";
    const artistApproved = applicationStatus === "approved";
    let artistProfileForMembership=null;
    if(artistApproved&&latestApplication){
      try{
        artistProfileForMembership=await syncArtistProfileFromApprovedApplication(latestApplication);
      }catch(syncError){
        console.warn("CHECK ADMIN - approved artist profile sync failed:", syncError);
      }
    }
    if(!artistProfileForMembership){
      const {data:artistProfileRow}=await supabase.from("artist_profiles").select("*").eq("user_id",user.id).maybeSingle();
      artistProfileForMembership=artistProfileRow||null;
    }
    const artistUpgrade=artistUpgradeFromProfile(artistProfileForMembership||{});
    const rawArtistUpgradeStatus = artistUpgrade.artist_subscription_status || "";
    const resolvedArtistTier = artistUpgrade.tier || "free";
    const hasUpgradedArtistProfile = adminAccess || artistUpgrade.has_upgraded_profile;
    setArtistApplicationStatus(applicationStatus);
    setArtistApplication(latestApplication||null);
    setArtistUpgradeStatus(rawArtistUpgradeStatus);
    setArtistProfileTier(resolvedArtistTier);
    console.log("CURRENT USER ROLE:", loadedRole || null);
    console.log("APPLICATION STATUS:", applicationStatus);
    console.log("ARTIST APPROVED:", artistApproved);
    console.log("ARTIST PROFILE TIER:", resolvedArtistTier);
    console.log("ARTIST UPGRADE STATUS:", rawArtistUpgradeStatus);
    console.log("ARTIST HAS UPGRADED PROFILE:", hasUpgradedArtistProfile);
    console.log("PREMIUM ACCESS CHECK");
    console.log("SUBSCRIPTION STATUS:", status);
    console.log("FREE MEMBERSHIP:", freeMem);
    console.log("IS BOOKED BRIDE:", bookedBride);
    console.log("HAS PREMIUM ACCESS:", premiumAccess || adminAccess);
    return adminAccess;
    }catch(error){
      console.error("PROFILE FETCH ERROR:", error);
      setIsAdmin(false);
      setIsPremium(false);
      setSubscriptionStatus("");
      setFreeMembership(false);
      setIsBookedBride(false);
      setUserFirstName("");
      setUserRole("");
      setArtistApplicationStatus("");
      setArtistApplication(null);
      setArtistUpgradeStatus("");
      setArtistProfileTier("free");
      return false;
    }
  }

  function openPremium(feature){
    if(hasPremiumAccess)return;
    setCheckoutError("");
    setPremiumFeature(feature);
    setPremiumOpen(true);
  }

  function requirePremium(feature,onAllowed){
    if(hasPremiumAccess){
      onAllowed();
      return;
    }
    openPremium(feature);
  }

  // -- iOS in-app purchase (RevenueCat) ----------------------------------
  function iosPaywallContext(){
    const isArtist = typeof premiumFeature === "string" && /artist/i.test(premiumFeature);
    return {
      accountType: isArtist ? "artist" : "bride",
      offeringID: isArtist ? REVENUECAT_ARTIST_OFFERING_ID : REVENUECAT_BRIDE_OFFERING_ID,
      productID: isArtist ? REVENUECAT_ARTIST_PRODUCT_ID : REVENUECAT_BRIDE_PRODUCT_ID,
    };
  }

  async function loadIosOffering(){
    if(!isNativeIOSApp()) return;
    setIosOfferingLoading(true);
    setIosOfferingError("");
    setIosPurchaseError("");
    setIosRestoreMessage("");
    const appUserID = session?.user?.id || null;
    const context = iosPaywallContext();
    console.log("[RevenueCat] paywall load requested", context);
    const { offering, error } = await RevenueCatIOS.loadOffering(appUserID, context.offeringID, context.productID);
    if(error || !offering){
      console.warn("[RevenueCat] no offering available:", error?.message || error);
      setIosOffering(null);
      setIosOfferingError("Subscription options are loading. Please try again in a moment.");
    }else{
      setIosOffering(offering);
      setIosOfferingError("");
    }
    setIosOfferingLoading(false);
  }

  async function handleIosPurchase(pkg){
    if(!isNativeIOSApp() || !pkg) return;
    console.log("[RevenueCat] purchasing package:", pkg.identifier);
    setIosPurchaseError("");
    setIosRestoreMessage("");
    setIosPurchaseLoading(true);
    try{
      const result = await RevenueCatIOS.purchasePackage(pkg, session?.user?.id || null);
      const customerInfo = result?.customerInfo;
      RevenueCatIOS.logEntitlementStatus("purchase", customerInfo);
      console.log("[RevenueCat] purchase result:", { productIdentifier: result?.productIdentifier, hasEntitlement: RevenueCatIOS.hasActiveEntitlement(customerInfo) });
      if(RevenueCatIOS.hasActiveEntitlement(customerInfo)){
        setIsPremium(true);
        setPremiumOpen(false);
      }else{
        setIosPurchaseError("Purchase completed but premium access did not activate. Please tap Restore Purchases.");
      }
    }catch(err){
      const cancelled = err?.userCancelled === true || err?.code === "1" || /cancel/i.test(err?.message || "");
      if(cancelled){
        console.log("[RevenueCat] purchase cancelled by user");
        setIosPurchaseError("");
      }else{
        console.error("[RevenueCat] purchase failed:", err);
        setIosPurchaseError("We couldn't complete the purchase. Please try again.");
      }
    }finally{
      setIosPurchaseLoading(false);
    }
  }

  async function handleIosRestore(){
    if(!isNativeIOSApp()) return;
    console.log("[RevenueCat] restoring purchases");
    setIosPurchaseError("");
    setIosRestoreMessage("");
    setIosRestoreLoading(true);
    try{
      const result = await RevenueCatIOS.restore(session?.user?.id || null);
      const customerInfo = result?.customerInfo;
      RevenueCatIOS.logEntitlementStatus("restore", customerInfo);
      if(RevenueCatIOS.hasActiveEntitlement(customerInfo)){
        console.log("[RevenueCat] restore granted entitlement");
        setIsPremium(true);
        setIosRestoreMessage("Purchases restored.");
        setPremiumOpen(false);
      }else{
        console.log("[RevenueCat] restore returned no active entitlement");
        setIosRestoreMessage("No previous purchases found for this Apple ID.");
      }
    }catch(err){
      console.error("[RevenueCat] restore failed:", err);
      setIosRestoreMessage("");
      setIosPurchaseError("We couldn't restore purchases right now. Please try again.");
    }finally{
      setIosRestoreLoading(false);
    }
  }

  // Configure RevenueCat as soon as we know who the user is, so receipts are
  // tied to the same appUserID across reinstalls.
  useEffect(()=>{
    if(!isNativeIOSApp()) return;
    if(!revenueCatIsConfigured()){
      console.warn("[RevenueCat] not configured — REVENUECAT_APPLE_API_KEY / REVENUECAT_ENTITLEMENT_ID are empty.");
      return;
    }
    const appUserID = session?.user?.id || null;
    RevenueCatIOS.ensureConfigured(appUserID).then((ok)=>{
      if(!ok) return;
      // Reflect any already-granted entitlement immediately on launch.
      import("@revenuecat/purchases-capacitor").then(({ Purchases })=>{
        Purchases.getCustomerInfo().then(({ customerInfo })=>{
          RevenueCatIOS.logEntitlementStatus("launch", customerInfo);
          if(RevenueCatIOS.hasActiveEntitlement(customerInfo)){
            console.log("[RevenueCat] existing entitlement active on launch");
            setIsPremium(true);
          }
        }).catch(err=>console.warn("[RevenueCat] getCustomerInfo failed:", err));
      }).catch(()=>{});
    });
  },[session?.user?.id]);

  // Whenever the premium modal opens on iOS, load the offering fresh.
  useEffect(()=>{
    if(!premiumOpen || !isNativeIOSApp()) return;
    loadIosOffering();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[premiumOpen, premiumFeature, session?.user?.id]);

  async function startCheckout(activeSession=session, buttonSource="account_upgrade"){
    if(isNativeIOSApp()){
      // App Store 3.1.1: no external (Stripe) checkout on native iOS — the
      // PremiumModal renders the RevenueCat in-app purchase screen instead.
      setCheckoutError("");
      setPremiumFeature("bride");
      setPremiumOpen(true);
      return;
    }
    console.log("CHECKOUT BUTTON TAPPED");
    console.log("MEMBERSHIP BUTTON TAPPED");
    console.log("Membership button tapped");
    console.log("BUTTON SOURCE:", buttonSource);
    const currentSession = activeSession || session;
    let isArtistMembership = currentSession?.isArtistMembership===true;
    if(!currentSession?.user){
      console.log("current user id: signed out");
      console.log("subscription status: unknown");
      setCheckoutAfterAuth(true);
      setPremiumOpen(false);
      setAuthMode("login");
      setAuthOpen(true);
      return;
    }
    const {data:profile}=await supabase.from("profiles").select("is_premium,premium,role,is_admin,subscription_status,free_membership,is_booked_bride").eq("id",currentSession.user.id).maybeSingle();
    const freeAccess = profile?.free_membership===true || profile?.is_booked_bride===true;
    const profileRole = profile?.role || "bride";
    if(isArtistMembership || profileRole === "artist"){
      await openArtistCheckout(currentSession);
      return;
    }
    const resolvedAccountForCheckout = {
      role: profileRole,
      isArtist: isArtistMembership || profileRole === "artist" || profileRole === "admin",
      isBride: profileRole === "bride" || !(isArtistMembership || profileRole === "artist" || profileRole === "admin")
    };
    console.log("resolved role:", resolvedAccountForCheckout);
    if(resolvedAccountForCheckout.isArtist)isArtistMembership = true;
    if(resolvedAccountForCheckout.isBride)isArtistMembership = false;
    if(!isArtistMembership && freeAccess){
      console.log("FREE MEMBERSHIP ACTIVE — skipping Stripe checkout");
      setIsPremium(true);
      setCheckoutError("");
      setPremiumOpen(false);
      return;
    }
    const isArtistRole = profileRole === "artist" || profileRole === "admin";
    let artistAlreadyUpgraded = false;
    let artistHasStripeCustomer = false;
    let artistProfileRowExists = false;
    let artistSubscriptionIsActive = false;
    let resolvedArtistApplicationStatus = null;
    if(isArtistMembership){
      console.log("ARTIST UPGRADE BUTTON TAPPED");
      const {data:artistRow}=await supabase.from("artist_profiles").select("id,tier,artist_subscription_status,stripe_customer_id").eq("user_id",currentSession.user.id).maybeSingle();
      artistProfileRowExists = !!artistRow;
      artistSubscriptionIsActive = artistRow?.artist_subscription_status === "active";
      const tierLooksUpgraded = artistRow?.tier==="upgraded" || artistSubscriptionIsActive;
      artistHasStripeCustomer = !!(artistRow?.stripe_customer_id && String(artistRow.stripe_customer_id).trim());
      // Defensive: only route to artist billing portal when ALL of
      // (artist_profiles row exists, stripe_customer_id present, artist_subscription_status === "active")
      // are true. Otherwise fall back to artist checkout.
      artistAlreadyUpgraded = artistProfileRowExists && artistHasStripeCustomer && artistSubscriptionIsActive && tierLooksUpgraded;
      const {data:appRow}=await supabase.from("artist_applications").select("status").eq("user_id",currentSession.user.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
      resolvedArtistApplicationStatus = appRow?.status || null;
      console.log("resolved user role:", profileRole);
      console.log("artist application status:", resolvedArtistApplicationStatus);
      console.log("artist profile exists:", artistProfileRowExists);
      console.log("artist portal gate:", {
        tier: artistRow?.tier ?? null,
        artist_subscription_status: artistRow?.artist_subscription_status ?? null,
        artist_profile_row_exists: artistProfileRowExists,
        has_stripe_customer_id: artistHasStripeCustomer,
        artist_subscription_is_active: artistSubscriptionIsActive,
        routed_to: artistAlreadyUpgraded ? "billing_portal" : "checkout",
        tier_says_upgraded_but_missing_customer_id: tierLooksUpgraded && !artistHasStripeCustomer
      });
      // Artist eligibility: role === artist/admin OR an approved application
      // OR an existing artist_profiles row. Brides without any of these are
      // blocked from artist Stripe endpoints.
      const artistEligible = isArtistRole || resolvedArtistApplicationStatus === "approved" || artistProfileRowExists;
      if(!artistEligible){
        console.warn("ARTIST CHECKOUT BLOCKED:", {
          current_user_id: currentSession.user.id,
          resolved_user_role: profileRole,
          artist_application_status: resolvedArtistApplicationStatus,
          artist_profile_exists: artistProfileRowExists,
          reason: "Non-artist accounts cannot call artist checkout/billing endpoints.",
        });
        setCheckoutError("Artist membership is only available for artist accounts.");
        setCheckoutLoading(false);
        return;
      }
    }
    const brideSubscribed = profile?.subscription_status==="active" || profile?.is_premium===true || profile?.premium===true || profile?.role==="premium" || profile?.role==="admin" || profile?.is_admin===true || hasPremiumAccess;
    const subscribed = isArtistMembership ? artistAlreadyUpgraded : brideSubscribed;
    if(!isArtistMembership && brideSubscribed)setIsPremium(true);
    let functionName, checkoutTypeRequested;
    if(isArtistMembership){
      functionName = artistAlreadyUpgraded ? "create-artist-billing-portal-session" : "create-artist-checkout-session";
      checkoutTypeRequested = artistAlreadyUpgraded ? "artist_billing_portal" : "artist_checkout";
      if(functionName === "create-artist-checkout-session"){
        console.log("calling create-artist-checkout-session");
      }else{
        console.log("calling create-artist-billing-portal-session");
      }
    }else{
      // Bride flow: never call artist endpoints. Use super-handler for both
      // bride premium checkout and bride billing portal management.
      functionName = "super-handler";
      checkoutTypeRequested = brideSubscribed ? "bride_billing_portal" : "bride_premium_checkout";
    }
    console.log("selected Supabase function:", functionName);
    console.log("user role:", profile?.role || "bride");
    console.log("checkout type requested:", checkoutTypeRequested);
    console.log(`current user id: ${currentSession.user.id}`);
    console.log("current session exists:", !!currentSession);
    console.log("access token exists:", !!currentSession.access_token);
    console.log(`subscription status: ${subscribed?"active":"inactive"}`);
    setCheckoutLoading(true);
    setCheckoutError("");
    try{
      console.log("exact Supabase Edge Function name being called:", functionName);
      console.log("Supabase function called:", functionName);
      console.log(`function URL/call started: ${functionName}`);
      const payload = {
        user_id: currentSession.user.id,
        email: currentSession.user.email,
        token: currentSession.access_token,
        is_subscribed: subscribed,
        is_artist_membership: isArtistMembership,
        role: profile?.role || "bride",
        type: checkoutTypeRequested,
        checkout_function: functionName,
        session_exists: !!currentSession,
        button_source: buttonSource
      };
      if(window.webkit?.messageHandlers?.startCheckout){
        window.webkit.messageHandlers.startCheckout.postMessage(payload);
        console.log("startCheckout native message posted");
      }else{
        const checkoutLogPrefix = isArtistMembership
          ? (artistAlreadyUpgraded ? "ARTIST BILLING PORTAL" : "ARTIST CHECKOUT")
          : (brideSubscribed ? "BRIDE BILLING PORTAL" : "BRIDE PREMIUM CHECKOUT");
        const isBillingPortalCall = functionName === "create-artist-billing-portal-session" || checkoutTypeRequested === "bride_billing_portal";
        const {data,error}=await supabase.functions.invoke(functionName,{
          body:{
            user_id: currentSession.user.id,
            email: currentSession.user.email,
            type: checkoutTypeRequested,
            ...(isArtistMembership?{account_type:"artist"}:{account_type:"bride"}),
            ...(isBillingPortalCall?{return_url:window.location.origin}:{})
          },
          headers:{
            Authorization:`Bearer ${currentSession.access_token}`
          }
        });
        const responseStatus = error?.status || error?.context?.response?.status || error?.context?.status || null;
        console.log(`${checkoutLogPrefix} response status:`, responseStatus || "unknown");
        console.log(`${checkoutLogPrefix} full error object:`, error);
        console.log(`${checkoutLogPrefix} full returned data object:`, data);
        if(error){
          if(responseStatus === 404 && functionName === "create-artist-checkout-session"){
            console.error("create-artist-checkout-session is not deployed");
          }
          if(responseStatus === 404 && functionName === "create-artist-billing-portal-session"){
            console.error("create-artist-billing-portal-session is not deployed");
          }
          throw error;
        }
        const billingURL = data?.url;
        console.log("returned checkout URL:", billingURL || null);
        if(!billingURL)throw new Error("Billing portal response did not include a URL.");
        window.open(billingURL,"_blank","noopener,noreferrer");
      }
    }catch(err){
      console.error("Premium checkout real error message:", err?.message || err);
      console.error("full error if failed:", err);
      console.error("returned error",{
        message:err?.message,
        stack:err?.stack,
        responseStatus:err?.responseStatus||err?.response?.status,
        responseText:err?.responseText,
        error:err,
      });
      setCheckoutError("We couldn't open Premium membership right now. Please try again in a moment.");
      setPremiumOpen(true);
    }finally{
      setCheckoutLoading(false);
    }
  }

  function unlockPremium(){
    if(isNativeIOSApp()){
      // App Store 3.1.1: no external (Stripe) checkout on native iOS — the
      // PremiumModal already shows the RevenueCat in-app purchase buttons.
      return;
    }
    console.log("UPGRADE CLICKED");
    if(hasPremiumAccess){
      setCheckoutAfterAuth(false);
      setCheckoutError("");
      setPremiumOpen(false);
      return;
    }
    if(session?.user){
      if(resolvedAccount?.canAccessArtistFeatures)openArtistCheckout(session);
      else openBrideCheckout(session);
      return;
    }
    setCheckoutAfterAuth(true);
    setPremiumOpen(false);
    setAuthMode("login");
    setAuthOpen(true);
  }

  // ──────────────────────────────────────────────────────────────────
  // Account deletion (App Store Guideline 5.1.1(v))
  // Best-effort client-side cleanup of user-owned rows + storage files,
  // then a call to the delete-account Edge Function which repeats the
  // cleanup with service role and finally deletes the auth user.
  // ──────────────────────────────────────────────────────────────────
  function openDeleteAccountModal(){
    setDeleteAccountError("");
    setDeleteAccountConfirmText("");
    setDeleteAccountSuccess(false);
    setDeleteAccountOpen(true);
  }

  function closeDeleteAccountModal(){
    if(deleteAccountLoading)return;
    setDeleteAccountOpen(false);
    setDeleteAccountConfirmText("");
    setDeleteAccountError("");
    if(deleteAccountSuccess){
      setDeleteAccountSuccess(false);
    }
  }

  async function emptyStorageFolder(bucket,folder){
    if(!bucket||!folder)return;
    try{
      const {data:files,error}=await supabase.storage.from(bucket).list(folder,{limit:1000});
      if(error){
        console.warn("storage list failed",bucket,folder,error.message);
        return;
      }
      if(!Array.isArray(files)||files.length===0)return;
      const paths=files
        .filter(f=>f&&typeof f.name==="string"&&f.name.length>0)
        .map(f=>`${folder}/${f.name}`);
      if(paths.length===0)return;
      const {error:removeError}=await supabase.storage.from(bucket).remove(paths);
      if(removeError)console.warn("storage remove failed",bucket,folder,removeError.message);
    }catch(err){
      console.warn("storage cleanup threw",bucket,folder,err);
    }
  }

  async function performAccountDeletion(){
    const currentSession=session;
    if(!currentSession?.user){
      setDeleteAccountError("You are not signed in.");
      return;
    }
    setDeleteAccountLoading(true);
    setDeleteAccountError("");
    const userId=currentSession.user.id;
    try{
      // Look up any artist profile so we can target portfolio rows + the
      // artist-portfolio storage folder keyed by artist_profiles.id.
      let artistProfileId=null;
      try{
        const {data:artistRow}=await supabase
          .from("artist_profiles")
          .select("id")
          .eq("user_id",userId)
          .maybeSingle();
        artistProfileId=artistRow?.id||null;
      }catch(err){
        console.warn("delete: artist profile lookup failed",err);
      }

      // Best-effort row cleanup. We log but never throw on individual table
      // errors so RLS quirks on one table cannot trap the user.
      const rowOps=[
        ["bride_current_photos",supabase.from("bride_current_photos").delete().eq("bride_id",userId)],
        ["bride_inspo_photos",supabase.from("bride_inspo_photos").delete().eq("bride_id",userId)],
        ["saved_artists",supabase.from("saved_artists").delete().eq("bride_id",userId)],
        ["messages",supabase.from("messages").delete().eq("bride_user_id",userId)],
        ["quiz_results",supabase.from("quiz_results").delete().eq("user_id",userId)],
        ["bride_profiles",supabase.from("bride_profiles").delete().eq("id",userId)],
        ["artist_applications",supabase.from("artist_applications").delete().eq("user_id",userId)],
      ];
      if(artistProfileId){
        rowOps.push(["artist_portfolio_photos",supabase.from("artist_portfolio_photos").delete().eq("artist_id",artistProfileId)]);
        rowOps.push(["artist_profiles",supabase.from("artist_profiles").delete().eq("user_id",userId)]);
      }
      const rowResults=await Promise.allSettled(rowOps.map(([,p])=>p));
      rowResults.forEach((res,i)=>{
        const label=rowOps[i][0];
        if(res.status==="rejected"){
          console.warn("delete: row op rejected",label,res.reason);
        }else if(res.value&&res.value.error){
          console.warn("delete: row op error",label,res.value.error.message);
        }
      });

      // Best-effort storage cleanup of every folder the user might own.
      const storageFolders=[
        [BRIDE_CURRENT_BUCKET,userId],
        [BRIDE_INSPO_BUCKET,userId],
        [ARTIST_STORAGE_BUCKET,userId],
      ];
      if(artistProfileId)storageFolders.push([ARTIST_STORAGE_BUCKET,artistProfileId]);
      await Promise.all(storageFolders.map(([bucket,folder])=>emptyStorageFolder(bucket,folder)));

      // Final, authoritative step: call the Edge Function which repeats the
      // cleanup with service role and deletes the auth user.
      const {data:fnResult,error:fnError}=await supabase.functions.invoke("delete-account",{
        body:{},
        headers:{Authorization:`Bearer ${currentSession.access_token}`},
      });
      if(fnError||(fnResult&&fnResult.error)){
        const message=(fnResult&&fnResult.error)||fnError?.message||"";
        console.error("delete-account function failed",message,fnError);
        setDeleteAccountError("We couldn't fully delete your account. Please check your connection and try again.");
        return;
      }

      // Auth user is gone — clear local session and reset UI state.
      try{await supabase.auth.signOut();}catch(err){console.warn("post-delete signOut failed",err);}
      setDeleteAccountSuccess(true);
      setDeleteAccountConfirmText("");
    }catch(err){
      console.error("performAccountDeletion threw",err);
      setDeleteAccountError("Something went wrong deleting your account. Please try again in a moment.");
    }finally{
      setDeleteAccountLoading(false);
    }
  }

  function finishAccountDeletion(){
    // Called when the user dismisses the success screen.
    setDeleteAccountOpen(false);
    setDeleteAccountSuccess(false);
    setDeleteAccountConfirmText("");
    setDeleteAccountError("");
    setScreen("home");
    // Make sure any cached profile/session UI state resets to the
    // logged-out welcome state.
    try{refreshAuthState();}catch(err){console.warn("refreshAuthState after delete failed",err);}
  }

  async function authenticate(type){
    console.log("Signup/login submit handler invoked",{mode:type});
    if(!authEmail.trim()||!authPassword){
      setAuthCheckEmail(false);
      setAuthError(type==="signup"?"Please enter email and password. No confirmation email was sent.":"Please enter email and password.");
      return;
    }
    if(type==="signup"&&(!authFirstName.trim()||!authLastName.trim())){
      setAuthCheckEmail(false);
      setAuthError("Please enter first and last name. No confirmation email was sent.");
      return;
    }
    setAuthLoading(true);
    setAuthError("");
    try{
      const credentials={email:authEmail.trim(),password:authPassword};
      if(type==="signup"){
        console.log("Supabase signup request started",{
          projectHostname:new URL(SUPABASE_URL).hostname,
          redirectScheme:AUTH_CALLBACK_URL.split("://")[0],
        });
        const {data,error}=await supabase.auth.signUp({
          ...credentials,
          options:{
            emailRedirectTo:AUTH_CALLBACK_URL,
            data:{
              first_name:authFirstName.trim(),
              last_name:authLastName.trim(),
            },
          },
        });
        console.log("Supabase signup response received",{
          hasError:Boolean(error),
          errorCode:error?.code||null,
          errorStatus:error?.status||error?.statusCode||null,
          errorMessage:error?.message||null,
          hasUser:Boolean(data?.user),
          userId:data?.user?.id||null,
          hasSession:Boolean(data?.session),
          confirmationPopupOpened:false,
        });
        if(error)throw error;
        if(!data?.user?.id)throw new Error("Supabase did not create a user.");

        const signupRole=authAccountType==="artist"?"artist":"bride";
        const {error:profileError}=await supabase.from("profiles").upsert({
          id:data.user.id,
          role:signupRole,
          email:data.user.email||authEmail.trim().toLowerCase(),
          first_name:authFirstName.trim(),
          last_name:authLastName.trim(),
        },{onConflict:"id"});
        if(profileError){
          console.warn("Profile upsert after signup failed",{
            message:profileError.message,
            code:profileError.code||null,
            status:profileError.status||null,
          });
        }
        setUserFirstName(authFirstName.trim());
        setAuthCheckEmail(true);
        console.log("Confirmation popup opened",{
          userId:data.user.id,
          hasUser:true,
          confirmationPopupOpened:true,
        });
        return;
      }

      const {data,error}=await supabase.auth.signInWithPassword(staySignedIn?credentials:{...credentials,options:{persistSession:false}});
      if(error)throw error;
      if(data.user){
        await syncProfileEmailFromSession(data.session||{user:data.user},"bride");
        if(!staySignedIn)clearPersistedSupabaseSession();
      }
      const nextSession=await refreshAuthState();
      setAuthOpen(false);
      setAuthPassword("");
      if(checkoutAfterAuth&&nextSession?.user){
        setCheckoutAfterAuth(false);
        if(authAccountType === "artist")await openArtistCheckout(nextSession);
        else await openBrideCheckout(nextSession);
      }
    }catch(err){
      console.error("Signup/login failed",{
        mode:type,
        code:err?.code||null,
        status:err?.status||err?.statusCode||null,
        message:err?.message||String(err),
      });
      setAuthCheckEmail(false);
      setAuthError(type==="signup"
        ? err?.message
          ? `${err.message}${typeof err.message==="string"&&err.message.includes("No confirmation email was sent.")?"":" No confirmation email was sent."}`
          : "We could not create your account. No confirmation email was sent. Please try again."
        : err?.message||"Authentication failed."
      );
    }finally{
      setAuthLoading(false);
    }
  }

  async function sendPasswordReset(){
    if(!authEmail.trim()){setAuthError("Please enter your email.");return;}
    setAuthLoading(true);
    setAuthError("");
    setAuthResetSent(false);
    try{
      const {error}=await supabase.auth.resetPasswordForEmail(authEmail.trim(),{redirectTo:AUTH_CALLBACK_URL});
      if(error)throw error;
      setAuthResetSent(true);
    }catch(error){
      setAuthError(error?.message||"Password reset email could not be sent.");
    }finally{
      setAuthLoading(false);
    }
  }

  async function updateRecoveredPassword(){
    if(!authPassword || authPassword.length < 6){
      setAuthError("Please enter a new password with at least 6 characters.");
      return;
    }
    if(authPassword !== resetConfirmPassword){
      setAuthError("Passwords do not match.");
      return;
    }
    setAuthLoading(true);
    setAuthError("");
    setAuthResetSent(false);
    try{
      const {error}=await supabase.auth.updateUser({password:authPassword});
      if(error)throw error;
      console.log("PASSWORD UPDATE SUCCESS");
      setAuthResetSent(true);
      setAuthPassword("");
      setResetConfirmPassword("");
      setTimeout(()=>{
        clearPasswordRecoveryStored();
        try{ localStorage.removeItem("passwordRecoveryMode"); }catch(e){}
        try{ sessionStorage.removeItem("passwordRecoveryMode"); }catch(e){}
        setIsPasswordRecovery(false);
        setAuthOpen(false);
        setAuthCheckEmail(false);
        setAuthMode("login");
        setAuthResetSent(false);
        setAuthError("");
        setScreen("home");
        try{ window.history.replaceState({},"","/"); }catch(e){}
        window.location.href="/";
      },1600);
    }catch(error){
      setAuthError(error?.message||"Password could not be updated.");
    }finally{
      setAuthLoading(false);
    }
  }

  function resetAdminProductForm(){
    setAdminProductForm(emptyProductForm);
    setEditingProductId(null);
    setAdminProductEditorOpen(false);
  }

  function editAdminProduct(product){
    setEditingProductId(product?.id||null);
    setAdminProductForm({
      name: product?.name || "",
      why: product?.why || product?.notes || "",
      link: product?.link || product?.affiliate_url || "",
      price: product?.price || "",
      cat: product?.cat || product?.category || "",
    });
    setAdminProductEditorOpen(true);
  }

  async function saveAdminProduct(event){
    event?.preventDefault?.();
    if(!isAdmin||!adminProductForm.name.trim())return;
    setAdminLoading(true);
    setAdminError("");
    setProductsDbError("");
    try{
      const payload={
        name: adminProductForm.name.trim(),
        why: adminProductForm.why.trim() || null,
        link: adminProductForm.link.trim() || null,
        price: adminProductForm.price.trim() || null,
        cat: adminProductForm.cat.trim() || null,
      };
      const query=editingProductId
        ? supabase.from("products").update(payload).eq("id",editingProductId)
        : supabase.from("products").insert(payload);
      const {error}=await query;
      if(error)throw error;
      resetAdminProductForm();
      await loadProductsDb();
    }catch(err){
      setAdminError(err.message||"Could not save product.");
      setProductsDbError(err.message||"Could not save product.");
    }
    setAdminLoading(false);
  }

  async function deleteAdminProduct(id){
    if(!isAdmin||!window.confirm("Delete this product?"))return;
    setAdminLoading(true);
    setAdminError("");
    try{
      const {error}=await supabase.from("products").delete().eq("id",id);
      if(error)throw error;
      if(editingProductId===id)resetAdminProductForm();
      await loadProductsDb();
    }catch(err){
      setAdminError(err.message||"Could not delete product.");
      setProductsDbError(err.message||"Could not delete product.");
    }
    setAdminLoading(false);
  }

  async function loadProductsDb(){
    if(!isAdmin)return;
    setProductsDbLoading(true);
    setProductsDbError("");
    try{
      let result=await supabase.from("products").select("*").order("created_at",{ascending:false});
      if(result.error){
        console.error("Products DB ordered query failed, retrying without sort:",result.error);
        result=await supabase.from("products").select("*");
      }
      if(result.error){
        console.error("Supabase products error:",result.error);
        setProductsDbError("Could not load products right now.");
        setProductsDb([]);
      }else{
        setProductsDb(result.data||[]);
      }
    }catch(err){
      console.error("Could not load products database",err);
      setProductsDbError("Could not load products right now.");
      setProductsDb([]);
    }
    setProductsDbLoading(false);
  }

  useEffect(()=>{
    if(screen==="admin"&&isAdmin){
      loadProductsDb();
    }
  },[screen,isAdmin]);

  async function saveQuizResult(nextResult){
    if(!session?.user)return;
    const payload={
      user_id: session.user.id,
      primary_archetype: nextResult.primary,
      secondary_archetype: nextResult.secondary,
    };
    const {error}=await supabase.from("quiz_results").insert(payload);
    if(error)console.error("Could not save quiz result",error);
  }

  // Uploads the locally-stashed onboarding snapshot once the bride has an
  // account, then reveals the results. Driven entirely by the snapshot (not
  // live quiz state) so it also works after an email-confirmation reload, when
  // the in-memory answers are gone but localStorage still holds them.
  async function commitOnboardingAfterAuth(snapshot,returnTo){
    const user=session?.user;
    if(!user||!snapshot||onboardingCommitRef.current)return;
    onboardingCommitRef.current=true;
    setOnboardingCommitting(true);
    // Rehydrate in-memory state so the results screen has data to render.
    if(snapshot.result)setResult(snapshot.result);
    if(snapshot.profile)setProfile(prev=>({...prev,...snapshot.profile}));
    if(Array.isArray(snapshot.moodItems))setMoodItems(snapshot.moodItems);
    const p=snapshot.profile||{};
    try{
      if(snapshot.result){
        const {error:resultError}=await supabase.from("quiz_results").insert({
          user_id:user.id,
          primary_archetype:snapshot.result.primary,
          secondary_archetype:snapshot.result.secondary,
        });
        if(resultError)console.error("ONBOARDING COMMIT quiz_results error:",resultError);
      }
      const {error:profileError}=await supabase.from("bride_profiles").upsert({
        id:user.id,
        primary_archetype:snapshot.result?.primary||null,
        secondary_archetype:snapshot.result?.secondary||null,
        mood_keywords:snapshot.moodItems||[],
        hair_type:p.hairType||null,
        hair_density:p.hairDensity||null,
        skin_type:p.skinType||null,
        wedding_date:p.date||null,
        wedding_location:p.location?p.location.trim():null,
        updated_at:new Date().toISOString(),
      },{onConflict:"id"});
      if(profileError){
        console.error("ONBOARDING COMMIT bride_profiles error:",profileError);
      }else{
        setQuizSaveStatus("saved");
      }
    }catch(err){
      console.error("ONBOARDING COMMIT ERROR:",err);
    }finally{
      clearPendingOnboarding();
      setPendingOnboarding(null);
      setOnboardingCommitting(false);
      onboardingCommitRef.current=false;
      setGateReturnTo(null);
      // Reveal the results screen they were trying to reach (quiz/swipe deck
      // results both resolve to the archetype results screen today). The user
      // continues into the dashboard from there.
      setScreen(returnTo||"result");
    }
  }

  // When a session appears and onboarding is still pending, upload it and
  // reveal results. Covers both in-app sign-up/login and the deep-link return
  // after email confirmation.
  useEffect(()=>{
    if(!session?.user)return;
    if(pendingOnboarding && !onboardingCommitting){
      // Sync local quiz/swipe answers, generate results, then show the
      // results screen they were trying to reach.
      commitOnboardingAfterAuth(pendingOnboarding, gateReturnTo);
    }else if(gateReturnTo && !pendingOnboarding && !onboardingCommitting){
      // No onboarding to commit — they were simply blocked from a protected
      // feature. Send them on to it now that they're authenticated.
      const target=gateReturnTo;
      setGateReturnTo(null);
      goToScreen(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[session,pendingOnboarding,gateReturnTo]);

  // Results gate enforcement: an unauthenticated user may only sit on a public
  // screen (welcome, quiz, the auth gate, password recovery). Any attempt to
  // reach a protected feature is redirected to the auth gate. Waits for the
  // initial session check so returning users aren't bounced before auth loads.
  useEffect(()=>{
    if(!authChecked||isPasswordRecovery)return;
    if(!session?.user && !PUBLIC_SCREENS.has(screen)){
      setGateReturnTo(screen);
      setScreen("authGate");
    }
  },[authChecked,session,screen,isPasswordRecovery]);

  function buildQuizSaveSignature(){
    return JSON.stringify({
      primary: result?.primary || "",
      secondary: result?.secondary || "",
      mood: moodItems || [],
      skin: deriveSkinType(skinAns) || profile.skinType || "",
      hair: deriveHairType(hairAns) || profile.hairType || "",
      density: deriveHairDensity(hairAns) || profile.hairDensity || "",
      features: featureAns || {},
      main: mainAns || {},
    });
  }

  async function saveQuizToProfile(){
    console.log("QUIZ SAVE START");
    setQuizSaveError("");
    setQuizSaveStatus("saving");

    const {data:userData}=await supabase.auth.getUser().catch(err=>{ console.error("AUTH GET USER ERROR:", err); return {data:null}; });
    const user=userData?.user||session?.user||null;
    console.log("QUIZ SAVE current_user_id:", user?.id ?? null);

    if(!user){
      setQuizSaveError("Please sign in to save your quiz to your bridal profile.");
      setQuizSaveStatus("idle");
      setAuthMode("login");
      setAuthOpen(true);
      return;
    }

    const derivedSkinNow=deriveSkinType(skinAns) || profile.skinType || null;
    const derivedHairTypeNow=deriveHairType(hairAns) || profile.hairType || null;
    const derivedHairDensityNow=deriveHairDensity(hairAns) || profile.hairDensity || null;

    const payload={
      id: user.id,
      primary_archetype: result?.primary || null,
      secondary_archetype: result?.secondary || null,
      mood_keywords: moodItems || [],
      hair_type: derivedHairTypeNow,
      hair_density: derivedHairDensityNow,
      skin_type: derivedSkinNow,
      wedding_date: profile.date || null,
      wedding_location: profile.location ? profile.location.trim() : null,
      updated_at: new Date().toISOString(),
    };
    console.log("QUIZ SAVE fields_being_saved:", payload);

    try{
      const {error}=await supabase.from("bride_profiles").upsert(payload,{onConflict:"id"});
      if(error){
        console.error("QUIZ SAVE ERROR:", error);
        const detail=[error.message,error.details,error.hint,error.code].filter(Boolean).join(" — ");
        setQuizSaveError(detail || "Could not save quiz to your bridal profile.");
        setQuizSaveStatus("idle");
        return;
      }
      console.log("QUIZ SAVE SUCCESS");
      setProfile(prev=>({
        ...prev,
        skinType: derivedSkinNow || prev.skinType,
        hairType: derivedHairTypeNow || prev.hairType,
        hairDensity: derivedHairDensityNow || prev.hairDensity,
      }));
      setQuizSavedSignature(buildQuizSaveSignature());
      setQuizUpdatedAt(new Date().toISOString());
      setQuizSaveStatus("saved");
    }catch(err){
      console.error("QUIZ SAVE ERROR:", err);
      setQuizSaveError(err?.message || "Could not save quiz to your bridal profile.");
      setQuizSaveStatus("idle");
    }
  }

  // ── Quiz flow ──────────────────────────────────────────────────────────────
  function processSkin(opt){
    const q=SKIN_Q[skinStep];
    const na={...skinAns,[q.id]:opt};
    setSkinAns(na);
    if(skinStep<SKIN_Q.length-1) setSkinStep(skinStep+1);
    else setQuizPhase("hair");
  }
  function processHair(opt){
    const q=HAIR_Q[hairStep];
    const na={...hairAns,[q.id]:opt};
    setHairAns(na);
    if(hairStep<HAIR_Q.length-1) setHairStep(hairStep+1);
    else { setQuizPhase("features"); }
  }
  function processFeature(opt){
    setShowOther(false);setOtherTxt("");
    const q=FEATURE_Q[featureStep];
    const na={...featureAns,[q.id]:opt};
    setFeatureAns(na);
    if(featureStep<FEATURE_Q.length-1) setFeatureStep(featureStep+1);
    else { setQuizPhase("main"); }
  }
  function processMain(opt){
    setShowOther(false);setOtherTxt("");
    const q=MAIN_Q[mainStep];
    const na={...mainAns,[q.id]:opt};
    // inject derived skin/hair
    na.skinType=deriveSkinType(skinAns);
    na.hairType=deriveHairType(hairAns);
    na.hairDensity=deriveHairDensity(hairAns);
    setMainAns(na);
    if(mainStep<MAIN_Q.length-1) setMainStep(mainStep+1);
    else {
      const r=scoreArchetype({...na,...featureAns,...hairAns,...skinAns});
      const nextProfile={...profile,skinType:deriveSkinType(skinAns),hairType:deriveHairType(hairAns),hairDensity:deriveHairDensity(hairAns),...featureAns};
      setResult(r);
      setQuizUpdatedAt(new Date().toISOString());
      // auto-update profile
      setProfile(nextProfile);
      if(session?.user){
        // Already signed in (e.g. retaking the quiz): save and reveal results.
        saveQuizResult(r);
        setScreen("result");
      }else{
        // New bride: stash the full quiz outcome locally and gate the results
        // behind a free account. Nothing is written to Supabase yet.
        const snapshot={
          result:r,
          profile:nextProfile,
          moodItems:moodItems||[],
          skinAns,hairAns,featureAns,mainAns:na,
        };
        writePendingOnboarding(snapshot);
        setPendingOnboarding(snapshot);
        setGateReturnTo("result");
        setScreen("authGate");
      }
    }
  }

  function quizBack(){
    setShowOther(false);setOtherTxt("");
    if(quizPhase==="skin"){
      if(skinStep>0)setSkinStep(skinStep-1);
      else setScreen("home");
    }else if(quizPhase==="hair"){
      if(hairStep>0)setHairStep(hairStep-1);
      else{setQuizPhase("skin");setSkinStep(SKIN_Q.length-1);}
    }else if(quizPhase==="features"){
      if(featureStep>0)setFeatureStep(featureStep-1);
      else{setQuizPhase("hair");setHairStep(HAIR_Q.length-1);}
    }else{
      if(mainStep>0)setMainStep(mainStep-1);
      else{setQuizPhase("features");setFeatureStep(FEATURE_Q.length-1);}
    }
  }

  const totalSteps = SKIN_Q.length + HAIR_Q.length + FEATURE_Q.length + MAIN_Q.length;
  const currentStep = quizPhase==="skin"?skinStep:quizPhase==="hair"?SKIN_Q.length+hairStep:quizPhase==="features"?SKIN_Q.length+HAIR_Q.length+featureStep:SKIN_Q.length+HAIR_Q.length+FEATURE_Q.length+mainStep;
  const progress = (currentStep/totalSteps)*100;

  function resetQuiz(){setQuizPhase("skin");setSkinStep(0);setHairStep(0);setFeatureStep(0);setMainStep(0);setSkinAns({});setHairAns({});setFeatureAns({});setMainAns({});setShowOther(false);setQuizSaveStatus("idle");setQuizSavedSignature("");setQuizSaveError("");}

  // ── Pinterest analysis ─────────────────────────────────────────────────────
  async function analyzeInspo(url,idx){
    if(!url.trim())return;
    setAnalyzeLoading(true);
    const analysis = buildInspoAnalysis(url,profile,result);
    setPinterestAnalysis(p=>({...p,[idx]:analysis}));
    setAnalyzeLoading(false);
  }

  // ── Profile Save ──────────────────────────────────────────────────────────
  async function profilesSupportsStateColumn(){
    if(profilesHasStateColumn !== null)return profilesHasStateColumn;

    const {error}=await supabase.from("profiles").select("state").limit(1);
    const hasState=!error;
    setProfilesHasStateColumn(hasState);
    return hasState;
  }

  function locationWithRegion(location,region){
    if(!region)return location;
    if(!location)return region;
    return location.toLowerCase().includes(region.toLowerCase()) ? location : `${location}, ${region}`;
  }

  async function saveProfile(){
    console.log("SAVE PROFILE TAPPED");
    const user = session?.user;
    console.log("CURRENT USER:", user ? {id:user.id, email:user.email} : null);
    setProfileSaveError("");
    setProfileSaveMessage("");

    if(!user){
      setProfileSaveError("Please sign in before saving your profile.");
      setAuthMode("login");
      setAuthOpen(true);
      return;
    }

    const existingRole = userRole === "artist" ? "artist" : "bride";
    const selectedRegion=profile.province.trim();
    const hasStateColumn=await profilesSupportsStateColumn();
    // Account-level fields stay in `profiles` (auth/contact only — no bridal quiz data)
    const accountPayload={
      id:user.id,
      role:existingRole,
      name:profile.name.trim(),
      country:profile.country,
      concerns:profile.concerns.trim(),
      inspo_urls:profile.inspoUrls.filter(url=>url.trim()),
    };
    if(hasStateColumn)accountPayload.state=selectedRegion || null;
    // Bridal quiz / wedding fields go into `bride_profiles`
    const bridePayload={
      id:user.id,
      wedding_date: profile.date || null,
      wedding_location: profile.location ? profile.location.trim() : null,
      skin_type: profile.skinType || null,
      hair_type: profile.hairType || null,
      hair_density: profile.hairDensity || null,
      mood_keywords: moodItems || [],
      updated_at: new Date().toISOString(),
    };
    if(result?.primary) bridePayload.primary_archetype = result.primary;
    if(result?.secondary) bridePayload.secondary_archetype = result.secondary;
    console.log("PROFILE PAYLOAD (account → profiles):", accountPayload);
    console.log("BRIDE PROFILE SAVE payload:", bridePayload);

    setProfileSaving(true);
    try{
      console.log("PROFILE SAVE STARTED");
      const accountResult=await supabase.from("profiles").upsert(accountPayload,{onConflict:"id"});
      if(accountResult.error){
        console.log("PROFILE SAVE ERROR:", accountResult.error);
        setProfileSaveError("Your profile could not save right now. Please try again.");
        return;
      }
      const brideResult=await supabase.from("bride_profiles").upsert(bridePayload,{onConflict:"id"});
      console.log("BRIDE PROFILE SAVE result:", brideResult);
      if(brideResult.error){
        console.log("BRIDE PROFILE SAVE ERROR:", brideResult.error);
        setProfileSaveError("Your profile could not save right now. Please try again.");
        return;
      }
      console.log("PROFILE SAVE SUCCESS:", accountResult.data);
      clearCachedProfilePhotos(user.id);
      setProfileSaved(true);
      setProfileSaveMessage("Profile saved.");
      setTimeout(()=>{
        setProfileSaved(false);
        setProfileSaveMessage("");
      },2500);
    }catch(error){
      console.log("PROFILE SAVE ERROR:", error);
      setProfileSaveError("Your profile could not save right now. Please try again.");
    }finally{
      setProfileSaving(false);
    }
  }

  // ── Chat / Messages ───────────────────────────────────────────────────────
  async function loadMessages(){
    if(!session?.user)return;
    console.log("MESSAGES FETCH START");
    setMessageError("");
    const {data,error}=await supabase.from("messages").select("*").eq("bride_user_id",session.user.id).order("created_at",{ascending:true});
    if(error){
      setMessageError(error.message||"Could not load messages.");
      return;
    }
    if(data){
      setMessages(data);
      const lastViewed=localStorage.getItem("messages_last_viewed");
      const unread=data.some(m=>m.responded_at&&(!lastViewed||new Date(m.responded_at)>new Date(lastViewed)));
      setHasUnreadResponses(unread);
    }
  }

  function markMessagesRead(){
    localStorage.setItem("messages_last_viewed",new Date().toISOString());
    setHasUnreadResponses(false);
  }

  async function sendMessage(){
    if(!hasPremiumAccess){
      requirePremium("Message Bailee directly with Premium.",()=>{});
      return;
    }
    if(!chatInput.trim()||chatLoading||!session?.user)return;
    const msg=chatInput.trim();setChatInput("");setChatLoading(true);
    const {data,error:insertError}=await supabase.from("messages").insert({bride_user_id:session.user.id,bride_email:session.user.email,bride_name:profile.name||"",message:msg}).select().single();
    console.log("insert result",data,insertError);
    if(insertError){
      setMessageError(insertError.message||"Message could not be sent.");
      setChatInput(msg);
      setChatLoading(false);
      return;
    }
    if(data){
      setMessages(prev=>[...prev,data]);
      console.log("Calling resend-email edge function",{bride_name:profile.name||"",bride_email:session.user.email,message:msg});
      try{
        const emailRes=await fetch("https://wrkbkkbxkwawoabqfdeg.supabase.co/functions/v1/resend-email",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token},body:JSON.stringify({bride_name:profile.name||"",bride_email:session.user.email,message:msg})});
        const emailData=await emailRes.json();
        console.log("resend-email response",emailRes.status,emailData);
      }catch(e){console.error("resend-email error",e);}
    }
    setChatLoading(false);
  }

  function toggleBridalBeautyFaq(faq){
    setExpandedFaqQuestion(openQuestion=>openQuestion===faq.question?"":faq.question);
  }

  useEffect(()=>{if(screen==="chat"&&session?.user&&hasPremiumAccess){loadMessages().then(()=>markMessagesRead());}else if(session?.user&&hasPremiumAccess){loadMessages();}},[screen,session,hasPremiumAccess]);

  async function loadAdminMessages(){
    console.log("MESSAGES FETCH START");
    setAdminMsgLoading(true);
    setAdminMsgError("");
    const {data,error}=await supabase.from("messages").select("*").order("created_at",{ascending:false});
    if(error)setAdminMsgError(error.message||"Could not load messages.");
    if(data)setAdminMessages(data);
    setAdminMsgLoading(false);
  }

  async function sendAdminReply(msgId){
    const reply=(adminReplyInputs[msgId]||"").trim();
    if(!reply)return;
    const msg=adminMessages.find(m=>m.id===msgId);
    setAdminMsgError("");
    const {error}=await supabase.from("messages").update({response:reply,responded_at:new Date().toISOString()}).eq("id",msgId);
    if(!error){
      setAdminMessages(prev=>prev.map(m=>m.id===msgId?{...m,response:reply,responded_at:new Date().toISOString()}:m));
      setAdminReplyInputs(prev=>{const n={...prev};delete n[msgId];return n;});
      if(msg?.bride_user_id){
        fetch("https://wrkbkkbxkwawoabqfdeg.supabase.co/functions/v1/send-push",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token},body:JSON.stringify({user_id:msg.bride_user_id,message:reply})}).catch(e=>console.error("send-push error",e));
      }
    }else{
      setAdminMsgError(error.message||"Could not send reply.");
    }
  }

  useEffect(()=>{if(screen==="admin"&&isAdmin){loadAdminMessages();loadAdminApps();loadAdminNotifications();loadAdminStats();loadAdminWeddings();loadAdminWelcome();loadSeedArtists();loadAdminPortfolioPhotos();if(!DISABLE_ARTIST_PROFILE_EDITING)loadDbArtists();if(!DISABLE_BOOKED_BRIDE_LOOKUP)loadBookedBrides();}},[screen,isAdmin]);
  useEffect(()=>{if(!DISABLE_ARTIST_PROFILE_EDITING)loadDbArtists();},[]);

  async function loadAdminStats(){
    const weekAgo=new Date(Date.now()-7*24*60*60*1000).toISOString();
    const in30=new Date(Date.now()+30*24*60*60*1000).toISOString().slice(0,10);
    const today=new Date().toISOString().slice(0,10);
    const [signups,msgs,archetypes,weddings]=await Promise.all([
      supabase.from("profiles").select("id",{count:"exact",head:true}),
      supabase.from("messages").select("id",{count:"exact",head:true}).gte("created_at",weekAgo),
      supabase.from("quiz_results").select("primary_archetype"),
      supabase.from("profiles").select("id",{count:"exact",head:true}).gte("date",today).lte("date",in30)
    ]);
    const arcCounts={};
    (archetypes.data||[]).forEach(r=>{const a=r.primary_archetype;if(a)arcCounts[a]=(arcCounts[a]||0)+1;});
    const top=Object.entries(arcCounts).sort((a,b)=>b[1]-a[1])[0];
    setAdminStats({signups:signups.count||0,messagesThisWeek:msgs.count||0,topArchetype:top?`${top[0]} (${top[1]})`:"—",upcomingWeddings:weddings.count||0});
  }

  async function loadAdminWeddings(){
    const today=new Date().toISOString().slice(0,10);
    const in60=new Date(Date.now()+60*24*60*60*1000).toISOString().slice(0,10);
    const {data}=await supabase.from("profiles").select("id,name,date").gte("date",today).lte("date",in60).order("date",{ascending:true});
    if(data){
      const authUsers=await Promise.all(data.map(async p=>{
        const {data:msgs}=await supabase.from("messages").select("bride_email").eq("bride_user_id",p.id).limit(1);
        return {...p,email:msgs?.[0]?.bride_email||"—"};
      }));
      setAdminWeddings(authUsers);
    }
  }

  async function loadBookedBrides(){
    setBookedBrideLoading(true);
    const {data,error}=await supabase.from("profiles").select("id,name,first_name,email,date,is_booked_bride,free_membership,is_premium").or("is_booked_bride.eq.true,free_membership.eq.true,is_premium.eq.true").order("date",{ascending:true});
    if(!error&&data){
      const enriched=await Promise.all(data.map(async p=>{
        if(p.email)return p;
        const {data:msgs}=await supabase.from("messages").select("bride_email").eq("bride_user_id",p.id).limit(1);
        return {...p,email:msgs?.[0]?.bride_email||""};
      }));
      setBookedBrides(enriched);
    }
    setBookedBrideLoading(false);
  }

  async function grantFreeMembership(){
    if(DISABLE_BOOKED_BRIDE_LOOKUP){
      setBookedBrideError("Booked bride lookup is temporarily disabled while the app startup issue is being isolated.");
      return;
    }
    const normalizedEmail=bookedBrideEmail.trim().toLowerCase();
    setBookedBrideError("");
    setBookedBrideMessage("");
    if(!normalizedEmail){setBookedBrideError("Enter an email");return;}
    setBookedBrideLoading(true);
    try{
      console.log("BOOKED BRIDE NORMALIZED EMAIL:", normalizedEmail);
      const {data:profileMatch,error:profileLookupError}=await supabase.from("profiles").select("*").ilike("email",normalizedEmail).maybeSingle();
      if(profileLookupError){
        console.error("BOOKED BRIDE PROFILE LOOKUP ERROR:", profileLookupError);
        setBookedBrideError("Could not find bride profile right now.");
        return;
      }
      console.log("BOOKED BRIDE FOUND PROFILE:", profileMatch);
      if(!profileMatch?.id){
        setBookedBrideError("No bride found with that email. She must sign in to the app at least once before you can grant her access.");
        return;
      }
      if(profileMatch.email==null){
        setBookedBrideError("Profile found but email is missing. Sync email from auth first.");
        return;
      }
      const {data:updateResult,error:updateErr}=await supabase.from("profiles").update({free_membership:true,is_booked_bride:true,is_premium:true}).eq("id",profileMatch.id).select("*").single();
      if(updateErr){
        console.error("BOOKED BRIDE UPDATE ERROR:", updateErr);
        setBookedBrideError("Could not grant free membership right now.");
        return;
      }
      console.log("BOOKED BRIDE UPDATE RESULT:", updateResult);
      const {data:refetchedProfile,error:refetchError}=await supabase.from("profiles").select("*").eq("id",profileMatch.id).maybeSingle();
      if(refetchError){
        console.error("BOOKED BRIDE REFETCH ERROR:", refetchError);
      }
      console.log("BOOKED BRIDE REFETCHED PROFILE:", refetchedProfile);
      setBookedBrideMessage(`Free membership granted to ${refetchedProfile?.email||updateResult?.email||normalizedEmail}`);
      setBookedBrideEmail("");
      await loadBookedBrides();
    }catch(error){
      console.error("BOOKED BRIDE GRANT ERROR:", error);
      setBookedBrideError("Could not grant free membership right now.");
    }finally{
      setBookedBrideLoading(false);
    }
  }

  async function revokeFreeMembership(id){
    setBookedBrideError("");
    setBookedBrideMessage("");
    const {error}=await supabase.from("profiles").update({is_booked_bride:false,free_membership:false}).eq("id",id);
    if(error){
      setBookedBrideError(error.message||"Could not revoke");
    }else{
      setBookedBrides(prev=>prev.filter(b=>b.id!==id));
      setBookedBrideMessage("Free membership revoked");
    }
  }

  async function loadAdminWelcome(){
    const {data}=await supabase.from("settings").select("value").eq("key","welcome_message").maybeSingle();
    if(data)setAdminWelcome(data.value||"");
  }

  async function saveAdminWelcome(){
    const {error}=await supabase.from("settings").upsert({key:"welcome_message",value:adminWelcome},{onConflict:"key"});
    if(!error){setAdminWelcomeSaved(true);setTimeout(()=>setAdminWelcomeSaved(false),2500);}
  }

  async function loadDbArtists(){
    console.log("ARTIST PROFILE FETCH START");
    if(DISABLE_ARTIST_PROFILE_EDITING){
      setDbArtists([]);
      setAdminArtistLoading(false);
      return;
    }
    setAdminArtistLoading(true);
    setAdminArtistError("");
    let result=await supabase.from("artist_profiles").select("*").order("created_at",{ascending:false});
    if(result.error){
      console.error("Artist profiles ordered query failed, retrying:",result.error);
      result=await supabase.from("artist_profiles").select("*").order("business_name",{ascending:true});
    }
    if(result.error){
      console.error("Could not load artist profiles",result.error);
      setAdminArtistError("Could not load artist profiles right now.");
      setDbArtists([]);
    }else{
      setDbArtists((result.data||[]).map(a=>({...a,specialties:a.specialties||[],not_ideal:a.not_ideal||[],best_for:a.best_for||[],fit_styles:a.fit_styles||[],rating:Number(a.rating)||5,reviews:Number(a.reviews)||0,travel:!!a.travel})));
    }
    setAdminArtistLoading(false);
  }

  async function toggleArtistPublished(artist){
    if(!isAdmin)return;
    setArtistActionId(artist.id);
    setAdminArtistError("");
    const newValue=!artist.is_published;
    const {error}=await supabase.from("artist_profiles").update({is_published:newValue}).eq("id",artist.id);
    if(error){
      console.error("Could not toggle is_published",error);
      setAdminArtistError("Could not update publish status right now.");
    }else{
      setDbArtists(prev=>prev.map(a=>a.id===artist.id?{...a,is_published:newValue}:a));
    }
    setArtistActionId(null);
  }

  async function toggleArtistActive(artist){
    if(!isAdmin)return;
    setArtistActionId(artist.id);
    setAdminArtistError("");
    const newValue=!artist.is_active;
    const {error}=await supabase.from("artist_profiles").update({is_active:newValue}).eq("id",artist.id);
    if(error){
      console.error("Could not toggle is_active",error);
      setAdminArtistError("Could not update active status right now.");
    }else{
      setDbArtists(prev=>prev.map(a=>a.id===artist.id?{...a,is_active:newValue}:a));
    }
    setArtistActionId(null);
  }

  async function confirmDeleteArtist(){
    if(!isAdmin||!artistToDelete)return;
    const artistId=artistToDelete.id;
    setArtistActionId(artistId);
    setAdminArtistError("");
    try{
      const {error:portfolioError}=await supabase.from("artist_portfolio_photos").delete().eq("artist_id",artistId);
      if(portfolioError)console.error("Could not delete related portfolio photos",portfolioError);
      const {error:profileError}=await supabase.from("artist_profiles").delete().eq("id",artistId);
      if(profileError)throw profileError;
      setDbArtists(prev=>prev.filter(a=>a.id!==artistId));
      if(editingArtistId===artistId){setAdminArtistForm(emptyArtistForm);setEditingArtistId(null);}
      setArtistToDelete(null);
    }catch(err){
      console.error("Could not delete artist profile",err);
      setAdminArtistError("Could not delete artist right now.");
    }
    setArtistActionId(null);
  }

  function viewArtistProfile(artist){
    setSelectedArtist(artist);
    setScreen("directory");
  }

  function csvToArr(s){return(s||"").split(",").map(x=>x.trim()).filter(Boolean);}

  function seedArtistToForm(seed){
    const a=seed||{};
    return{
      name:a.name||"",
      owner:a.owner||"",
      city:a.city||"",
      state:a.state||"",
      country:a.country||"",
      services:a.services||"Hair + Makeup",
      badge:a.badge||"",
      specialties:(a.specialties||[]).join(", "),
      not_ideal:((a.not_ideal_for||a.not_ideal||[])).join(", "),
      aesthetic:a.aesthetic||"",
      bio:a.bio||"",
      best_for:(a.best_for||[]).join(", "),
      portfolio:a.portfolio||"",
      education:a.education||"",
      rating:String(a.rating||5),
      reviews:String(a.reviews||0),
      avatar:a.avatar||"",
      travel:!!(a.travels??a.travel),
      price:a.price||"",
      fit_styles:(a.fit_styles||[]).join(", "),
      email:a.email||"",
      website:a.website||"",
      profile_photo_url:a.profile_photo_url||"",
    };
  }

  function seedArtistFormToRow(form){
    return{
      name:form.name.trim(),
      owner:form.owner.trim(),
      city:form.city.trim(),
      state:form.state.trim(),
      country:form.country.trim(),
      services:form.services.trim(),
      badge:form.badge.trim()||null,
      specialties:csvToArr(form.specialties),
      not_ideal:csvToArr(form.not_ideal),
      aesthetic:form.aesthetic.trim(),
      bio:form.bio.trim(),
      best_for:csvToArr(form.best_for),
      portfolio:form.portfolio.trim(),
      education:form.education.trim(),
      rating:Number(form.rating)||5,
      reviews:Number(form.reviews)||0,
      avatar:form.avatar.trim(),
      travel:!!form.travel,
      price:form.price.trim(),
      fit_styles:csvToArr(form.fit_styles),
      email:form.email.trim(),
      website:form.website.trim()||null,
      profile_photo_url:form.profile_photo_url.trim()||null,
    };
  }

  async function loadSeedArtists(){
    if(!isAdmin)return;
    setSeedArtistLoading(true);
    setSeedArtistError("");
    try{
      const {data,error}=await supabase.from("artist_directory_seeds").select("*").order("name",{ascending:true});
      if(error)throw error;
      setSeedArtistsAdmin(data||[]);
    }catch(err){
      console.error("Could not load seed artists",err);
      setSeedArtistError("Could not load directory seed artists right now.");
      setSeedArtistsAdmin([]);
    }finally{
      setSeedArtistLoading(false);
    }
  }

  function editSeedArtist(seed){
    setSeedArtistForm(seedArtistToForm(seed));
    setSeedArtistFormOpen(true);
    setEditingSeedArtistId(seed.id);
    setSeedArtistError("");
    setSeedArtistMessage("");
  }

  function cancelSeedArtistEdit(){
    setSeedArtistForm(emptySeedArtistForm);
    setSeedArtistFormOpen(false);
    setEditingSeedArtistId(null);
    setSeedArtistError("");
  }

  function addSeedArtist(){
    setSeedArtistForm(emptySeedArtistForm);
    setEditingSeedArtistId(null);
    setSeedArtistFormOpen(true);
    setSeedArtistError("");
    setSeedArtistMessage("");
  }

  async function saveSeedArtist(event){
    event.preventDefault();
    if(!isAdmin||!seedArtistForm.name.trim())return;
    const actionId=editingSeedArtistId||"create";
    setSeedArtistActionId(actionId);
    setSeedArtistSaving(true);
    setSeedArtistError("");
    setSeedArtistMessage("");
    try{
      const row=seedArtistFormToRow(seedArtistForm);
      const result=editingSeedArtistId
        ? await supabase.from("artist_directory_seeds").update(row).eq("id",editingSeedArtistId)
        : await supabase.from("artist_directory_seeds").insert(row);
      const {error}=result;
      if(error)throw error;
      cancelSeedArtistEdit();
      await loadSeedArtists();
      await loadApprovedArtists();
      setSeedArtistMessage(editingSeedArtistId?"Seed artist saved.":"Seed artist added.");
    }catch(err){
      console.error("Could not save seed artist",err);
      setSeedArtistError("Could not save this seed artist right now.");
    }finally{
      setSeedArtistActionId(null);
      setSeedArtistSaving(false);
    }
  }

  async function deleteSeedArtist(seed){
    if(!isAdmin||!seed?.id)return;
    const label=seed.name||"this seed artist";
    if(!window.confirm(`Delete ${label}? This cannot be undone.`))return;
    setSeedArtistActionId(seed.id);
    setSeedArtistError("");
    try{
      const {error}=await supabase.from("artist_directory_seeds").delete().eq("id",seed.id);
      if(error)throw error;
      if(editingSeedArtistId===seed.id)cancelSeedArtistEdit();
      await loadSeedArtists();
      await loadApprovedArtists();
      setSeedArtistMessage("Seed artist deleted.");
    }catch(err){
      console.error("Could not delete seed artist",err);
      setSeedArtistError(err?.message||"Could not delete this seed artist right now.");
    }finally{
      setSeedArtistActionId(null);
    }
  }

  async function saveArtistProfile(e){
    e.preventDefault();
    const f=adminArtistForm;
    const row={
      business_name:f.name,
      owner_name:f.owner,
      city:f.city,
      state:f.state,
      country:f.country,
      services:f.services,
      specialties:csvToArr(f.specialties),
      not_ideal_for:csvToArr(f.not_ideal),
      aesthetic:f.aesthetic,
      bio:f.bio,
      best_for:csvToArr(f.best_for),
      starting_price:f.price,
      travels:!!f.travel,
      email:f.email,
      website:f.website||null,
    };
    setAdminArtistError("");
    if(editingArtistId){
      const {error}=await supabase.from("artist_profiles").update(row).eq("id",editingArtistId);
      if(error){console.error("Could not update artist profile",error);setAdminArtistError("Could not update artist right now.");}
      else{await loadDbArtists();setAdminArtistForm(emptyArtistForm);setEditingArtistId(null);}
    }else{
      const {error}=await supabase.from("artist_profiles").insert(row);
      if(error){console.error("Could not insert artist profile",error);setAdminArtistError("Could not add artist right now.");}
      else{await loadDbArtists();setAdminArtistForm(emptyArtistForm);}
    }
  }

  function editArtistProfile(a){
    setAdminArtistForm({
      name:a.business_name||a.name||"",
      owner:a.owner_name||a.owner||"",
      city:a.city||"",
      state:a.state||"",
      country:a.country||"",
      services:a.services||"Hair + Makeup",
      badge:a.badge||"",
      specialties:(a.specialties||[]).join(", "),
      not_ideal:((a.not_ideal_for||a.not_ideal||[])).join(", "),
      aesthetic:a.aesthetic||"",
      bio:a.bio||"",
      best_for:(a.best_for||[]).join(", "),
      portfolio:a.portfolio||"",
      education:a.education||"",
      rating:String(a.rating||5),
      reviews:String(a.reviews||0),
      avatar:a.avatar||"",
      travel:!!(a.travels??a.travel),
      price:a.starting_price||a.price||"",
      fit_styles:(a.fit_styles||[]).join(", "),
      email:a.email||"",
      website:a.website||"",
    });
    setEditingArtistId(a.id);
  }

  async function deleteArtistProfile(id){
    if(!confirm("Delete this artist profile?"))return;
    const {error}=await supabase.from("artist_profiles").delete().eq("id",id);
    if(!error)await loadDbArtists();
  }

  async function submitApplication(e){
    e.preventDefault();
    console.log("ARTIST APPLICATION SUBMIT TAPPED");
    console.log("FORM DATA:",appForm);
    console.log("CURRENT USER:",session?.user||null);
    setAppSubmitMessage("");
    setAppSubmitError("");

    if(appSubmitting)return;

    const selectedCountry=String(appForm.country||"").trim();
    const selectedProvinceState=String(appForm.provinceState||"").trim();
    console.log("COUNTRY SELECTED:",selectedCountry);
    console.log("PROVINCE/STATE SELECTED:",selectedProvinceState);

    const requiredFields=[
      ["name","Your Name"],
      ["business","Business Name"],
      ["email","Email"],
      ["city","City"],
      ["country","Country"],
      ["website","Website"],
      ["instagram","Instagram Handle"],
      ["experience","Years of Experience"],
      ["priceRange","Price Range"],
      ["bio","Bio"],
    ];
    const missingFields=requiredFields.filter(([key])=>!String(appForm[key]||"").trim()).map(([,label])=>label);
    if((selectedCountry==="United States"||selectedCountry==="Canada")&&!selectedProvinceState){
      missingFields.push(selectedCountry==="United States"?"State":"Province");
    }
    if(missingFields.length){
      setAppSubmitError(`Please complete: ${missingFields.join(", ")}.`);
      return;
    }

    if(!session?.user){
      setAppSubmitError("Please create an account or sign in to submit your artist application.");
      setAuthMode("signup");
      setAuthAccountType("artist");
      setAuthOpen(true);
      return;
    }

    setAppSubmitting(true);
    const payload={
      name:appForm.name.trim(),
      business_name:appForm.business.trim(),
      email:appForm.email.trim(),
      city:appForm.city.trim(),
      country:selectedCountry,
      province_state:selectedProvinceState,
      services:appForm.services,
      specialties:appForm.specialties.trim(),
      bio:appForm.bio.trim(),
      website:appForm.website.trim(),
      instagram:appForm.instagram.trim(),
      years_experience:appForm.experience.trim(),
      price_range:appForm.priceRange.trim(),
      user_id:session.user.id,
      status:"pending",
    };
    console.log("ARTIST APPLICATION PAYLOAD:",payload);
    try{
      console.log("SUPABASE INSERT STARTED");
      const {data,error}=await supabase.from("artist_applications").insert(payload).select();
      if(error){
        console.error("SUPABASE INSERT ERROR:",error.message,error.details,error.hint,error.code,error);
        setAppSubmitError(error.message||"Artist application submit failed.");
        return;
      }
      console.log("SUPABASE INSERT SUCCESS:",data);
      setAppSubmitMessage("Application submitted. Thank you for applying — our team will be in touch within 48 hours.");
      setAppSubmitted(true);
      setArtistApplicationStatus("pending");
      setArtistApplication(payload);
      await supabase.from("profiles").upsert({id:session.user.id,role:"artist"},{onConflict:"id"});
      fetch("https://wrkbkkbxkwawoabqfdeg.supabase.co/functions/v1/resend-email",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token},body:JSON.stringify({type:"artist_application",artist_name:payload.name,artist_email:payload.email,business_name:payload.business_name})}).catch(e=>console.error("app email error",e));
      setAppForm(emptyAppForm);
    }catch(error){
      console.error("SUPABASE INSERT ERROR:",error);
      setAppSubmitError(error?.message||String(error));
    }finally{
      setAppSubmitting(false);
    }
  }

  async function loadAdminApps(){
    if(!isAdmin)return;
    setAdminAppsLoading(true);
    setAdminAppsError("");
    try{
      const {data,error}=await supabase.from("artist_applications").select("*").order("created_at",{ascending:false});
      if(error)throw error;
      setAdminApps(data||[]);
    }catch(err){
      console.error("Could not load artist applications",err);
      setAdminAppsError("Could not load applications right now.");
      setAdminApps([]);
    }
    setAdminAppsLoading(false);
  }

  async function loadAdminNotifications(){
    if(!isAdmin)return;
    setAdminNotifLoading(true);
    setAdminNotifError("");
    try{
      const {data,error}=await supabase.from("admin_notifications").select("*").order("created_at",{ascending:false}).limit(50);
      if(error)throw error;
      setAdminNotifications(data||[]);
    }catch(err){
      console.error("Could not load admin notifications",err);
      setAdminNotifError("Could not load notifications right now.");
      setAdminNotifications([]);
    }
    setAdminNotifLoading(false);
  }

  async function markAdminNotificationRead(id,read=true){
    if(!isAdmin||!id)return;
    setAdminNotifications(list=>list.map(n=>n.id===id?{...n,read}:n));
    const {error}=await supabase.from("admin_notifications").update({read}).eq("id",id);
    if(error){
      console.error("Could not update admin notification",error);
      // revert local state so the badge stays accurate
      setAdminNotifications(list=>list.map(n=>n.id===id?{...n,read:!read}:n));
    }
  }

  async function markAllAdminNotificationsRead(){
    if(!isAdmin)return;
    const unreadIds=adminNotifications.filter(n=>!n.read).map(n=>n.id);
    if(unreadIds.length===0)return;
    setAdminNotifications(list=>list.map(n=>n.read?n:{...n,read:true}));
    const {error}=await supabase.from("admin_notifications").update({read:true}).in("id",unreadIds);
    if(error){
      console.error("Could not mark notifications as read",error);
      await loadAdminNotifications();
    }
  }

  async function resolveArtistApplicationUserId(app){
    if(app?.user_id)return app.user_id;
    const email=(app?.email||"").trim();
    if(!email)return null;
    const {data,error}=await supabase.from("profiles").select("id,email").ilike("email",email).maybeSingle();
    if(error)console.warn("ARTIST PROFILE SYNC - could not resolve user_id by email:", error);
    return data?.id||null;
  }

  async function findExistingArtistProfileForApplication(app,userId){
    if(userId){
      const byUser=await supabase.from("artist_profiles").select("*").eq("user_id",userId).maybeSingle();
      if(!byUser.error&&byUser.data)return byUser.data;
    }
    if(app?.id){
      const byApplication=await supabase.from("artist_profiles").select("*").eq("application_id",app.id).maybeSingle();
      if(!byApplication.error&&byApplication.data)return byApplication.data;
    }
    if(app?.email){
      const byEmail=await supabase.from("artist_profiles").select("*").ilike("email",app.email.trim()).maybeSingle();
      if(!byEmail.error&&byEmail.data)return byEmail.data;
    }
    return null;
  }

  function profilePayloadFromApplication(app,existingProfile,userId){
    const specialtiesValue=typeof app?.specialties==="string"?csvToArr(app.specialties):(Array.isArray(app?.specialties)?app.specialties:[]);
    const existingUpgrade=artistUpgradeFromProfile(existingProfile||{});
    return {
      business_name:app?.business_name||app?.name||existingProfile?.business_name||"",
      owner_name:app?.name||existingProfile?.owner_name||"",
      city:app?.city||existingProfile?.city||"",
      state:app?.province_state||app?.state||existingProfile?.state||"",
      country:app?.country||existingProfile?.country||null,
      services:app?.services||existingProfile?.services||"Hair + Makeup",
      bio:app?.bio||existingProfile?.bio||"",
      email:app?.email||existingProfile?.email||"",
      website:app?.website||existingProfile?.website||null,
      instagram:app?.instagram||existingProfile?.instagram||null,
      specialties:specialtiesValue.length?specialtiesValue:(existingProfile?.specialties||[]),
      starting_price:app?.price_range||app?.starting_price||existingProfile?.starting_price||"",
      user_id:userId||existingProfile?.user_id||null,
      application_id:app?.id||existingProfile?.application_id||null,
      application_status:"approved",
      approval_status:"approved",
      artist_application_status:"approved",
      is_published:existingProfile?.is_published??true,
      is_active:existingProfile?.is_active??true,
      tier:existingProfile?.tier||existingUpgrade.tier||"free",
      artist_subscription_status:existingProfile?.artist_subscription_status||existingProfile?.subscription_status||"",
      portfolio_photos:Array.isArray(existingProfile?.portfolio_photos)?existingProfile.portfolio_photos:[],
      profile_photo_url:existingProfile?.profile_photo_url||null,
    };
  }

  async function writeArtistProfilePayload(payload,existingProfile){
    let mutablePayload={...payload};
    for(let attempt=0;attempt<20;attempt+=1){
      const {data,error}=existingProfile?.id
        ? await supabase.from("artist_profiles").update(mutablePayload).eq("id",existingProfile.id).select().maybeSingle()
        : await supabase.from("artist_profiles").insert(mutablePayload).select().maybeSingle();
      if(!error)return data||existingProfile||mutablePayload;
      const message=error.message||"";
      const missingColumn=message.match(/'([^']+)' column/)?.[1]||message.match(/column .*?\.?(\w+) does not exist/)?.[1];
      if(missingColumn&&Object.prototype.hasOwnProperty.call(mutablePayload,missingColumn)){
        console.warn("ARTIST PROFILE SYNC - dropping missing column:", missingColumn);
        delete mutablePayload[missingColumn];
        continue;
      }
      if(!existingProfile?.id&&payload.email){
        const updateByEmail=await supabase.from("artist_profiles").update(mutablePayload).ilike("email",payload.email).select().maybeSingle();
        if(!updateByEmail.error)return updateByEmail.data||mutablePayload;
      }
      throw error;
    }
    throw new Error("Artist profile sync failed.");
  }

  async function syncArtistProfileFromApprovedApplication(app){
    if(!app||app.status&&app.status!=="approved")return null;
    const userId=await resolveArtistApplicationUserId(app);
    if(userId&&!app.user_id&&app.id){
      supabase.from("artist_applications").update({user_id:userId}).eq("id",app.id).then(()=>{}).catch(()=>{});
    }
    const existingProfile=await findExistingArtistProfileForApplication(app,userId);
    const payload=profilePayloadFromApplication(app,existingProfile,userId);
    const syncedProfile=await writeArtistProfilePayload(payload,existingProfile);
    console.log("ARTIST PROFILE SYNC - synced artist_profiles row:", syncedProfile);
    return syncedProfile;
  }

  async function approveApplication(app){
    if(!isAdmin)return;
    setAdminAppsError("");
    setAppActionId(app.id);

    console.log("APPROVE APPLICATION - selected application id:", app?.id);
    console.log("APPROVE APPLICATION - full application object:", app);

    try{
      console.log("APPROVE APPLICATION - supabase query:",
        `supabase.from("artist_applications").update({status:"approved"}).eq("id", "${app.id}")`);
      const resolvedUserId=await resolveArtistApplicationUserId(app);
      const applicationUpdate={status:"approved"};
      if(resolvedUserId)applicationUpdate.user_id=resolvedUserId;
      const {data:approvedRows,error:statusError} = await supabase.from("artist_applications").update(applicationUpdate).eq("id",app.id).select();
      if(statusError){
        console.error("APPROVE APPLICATION - supabase status update error (full):", statusError);
        throw statusError;
      }
      const approvedApplication=approvedRows?.[0]||{...app,...applicationUpdate};
      await syncArtistProfileFromApprovedApplication(approvedApplication);
      setAdminApps(prev=>prev.map(a=>a.id===app.id?{...a,...applicationUpdate}:a));
      await loadAdminApps();
      await loadDbArtists();
      await loadApprovedArtists();
    }catch(err){
      console.error("APPROVE APPLICATION - caught error (full):", err);
      console.error("Could not approve application",err);
      setAdminAppsError(err?.message ? `Could not approve application: ${err.message}` : "Could not approve application right now.");
    }
    setAppActionId(null);
  }

  async function rejectApplication(id){
    if(!isAdmin)return;
    setAdminAppsError("");
    setAppActionId(id);
    try{
      const {error} = await supabase.from("artist_applications").update({status:"rejected"}).eq("id",id);
      if(error)throw error;
      setAdminApps(prev=>prev.map(a=>a.id===id?{...a,status:"rejected"}:a));
    }catch(err){
      console.error("Could not reject application",err);
      setAdminAppsError("Could not reject application right now.");
    }
    setAppActionId(null);
  }

  // ── ARTIST PORTFOLIO PHOTOS ────────────────────────────────────────

  // The artist dashboard, portfolio, analytics, profile photo, membership,
  // and directory visibility all read from a single source of truth:
  async function findOrLinkArtistProfile(){
    if(!session?.user){
      console.log("[DEBUG] findOrLinkArtistProfile: no session.user");
      return null;
    }
    const userId = session.user.id;
    // Verify auth.uid() seen by the Supabase JWT matches the local session.
    let authUid = null;
    try{
      const {data:userResult,error:userError} = await supabase.auth.getUser();
      authUid = userResult?.user?.id || null;
      console.log("[DEBUG] auth.uid():", authUid);
      console.log("[DEBUG] session.user.id:", userId);
      if(userError) console.warn("[DEBUG] supabase.auth.getUser error:", userError);
      if(authUid && authUid !== userId){
        console.warn("[DEBUG] auth.uid() != session.user.id — JWT/session mismatch");
      }
    }catch(authErr){
      console.warn("[DEBUG] supabase.auth.getUser threw:", authErr);
    }
    const currentEmail=(session.user.email||"").trim();
    let approvedApplication=null;
    const byUser=await supabase
      .from("artist_applications")
      .select("*")
      .eq("status","approved")
      .eq("user_id",userId)
      .order("created_at",{ascending:false})
      .limit(1)
      .maybeSingle();
    approvedApplication=byUser?.data||null;
    if(!approvedApplication&&currentEmail){
      const byEmail=await supabase
        .from("artist_applications")
        .select("*")
        .eq("status","approved")
        .ilike("email",currentEmail)
        .order("created_at",{ascending:false})
        .limit(1)
        .maybeSingle();
      approvedApplication=byEmail?.data||null;
    }
    const candidateMap=new Map();
    const rememberCandidate=row=>{
      if(row?.id&&!candidateMap.has(String(row.id)))candidateMap.set(String(row.id),row);
    };
    const runCandidateQuery=async(label,query)=>{
      try{
        const {data,error,status,statusText}=await query;
        console.log(`[DEBUG] artist_profiles candidate query (${label}) status:`, status, statusText||"");
        if(error){
          console.warn(`[DEBUG] artist_profiles candidate query (${label}) error:`, error);
          return;
        }
        (Array.isArray(data)?data:(data?[data]:[])).forEach(rememberCandidate);
      }catch(queryError){
        console.warn(`[DEBUG] artist_profiles candidate query (${label}) threw:`, queryError);
      }
    };
    console.log("[DEBUG] querying artist_profiles workspace/public candidates", {
      user_id:userId,
      email:currentEmail||null,
      application_id:approvedApplication?.id||null,
      application_business:approvedApplication?.business_name||approvedApplication?.business||approvedApplication?.name||null,
    });
    await runCandidateQuery("user_id", supabase.from("artist_profiles").select("*").eq("user_id",userId).order("created_at",{ascending:false}));
    if(currentEmail){
      await runCandidateQuery("email", supabase.from("artist_profiles").select("*").ilike("email",currentEmail).order("created_at",{ascending:false}));
    }
    if(approvedApplication?.id){
      await runCandidateQuery("application_id", supabase.from("artist_profiles").select("*").eq("application_id",approvedApplication.id).order("created_at",{ascending:false}));
    }
    const applicationBusiness=(approvedApplication?.business_name||approvedApplication?.business||approvedApplication?.name||"").trim();
    if(applicationBusiness){
      await runCandidateQuery("business_name", supabase.from("artist_profiles").select("*").ilike("business_name",applicationBusiness).order("created_at",{ascending:false}));
    }
    const candidates=Array.from(candidateMap.values());
    const norm=value=>String(value||"").trim().toLowerCase();
    const portfolioCount=row=>Array.isArray(row?.portfolio_photos)?row.portfolio_photos.length:0;
    const candidateScore=row=>{
      let score=0;
      if(row?.is_published===true&&row?.is_active===true)score+=1000;
      if(row?.user_id===userId)score+=150;
      if(currentEmail&&norm(row?.email)===norm(currentEmail))score+=120;
      if(approvedApplication?.id&&row?.application_id===approvedApplication.id)score+=100;
      if(applicationBusiness&&norm(row?.business_name)===norm(applicationBusiness))score+=80;
      if(row?.profile_photo_url)score+=30;
      score+=Math.min(portfolioCount(row),50);
      if(row?.business_name)score+=10;
      if(row?.services)score+=5;
      return score;
    };
    const chosenProfile=candidates.sort((a,b)=>candidateScore(b)-candidateScore(a))[0]||null;
    console.log("ARTIST DASHBOARD PROFILE RESOLUTION:", {
      current_user_id:userId,
      current_user_email:currentEmail||null,
      candidate_count:candidates.length,
      candidates:candidates.map(row=>({
        artist_profiles_id:row?.id||null,
        user_id:row?.user_id||null,
        business_name:row?.business_name||null,
        email:row?.email||null,
        is_published:row?.is_published,
        is_active:row?.is_active,
        tier:row?.tier||null,
        portfolio_photos_length:portfolioCount(row),
        score:candidateScore(row),
      })),
      selected_artist_profiles_id:chosenProfile?.id||null,
    });
    if(chosenProfile){
      if(!chosenProfile.user_id){
        const {data:linked,error:linkError}=await supabase
          .from("artist_profiles")
          .update({user_id:userId})
          .eq("id",chosenProfile.id)
          .select()
          .maybeSingle();
        if(linkError){
          console.warn("ARTIST DASHBOARD PROFILE LINK ERROR:", linkError);
        }else if(linked){
          console.log("ARTIST DASHBOARD PROFILE LINKED TO CURRENT USER:", {artist_profiles_id:linked.id,user_id:linked.user_id});
          return linked;
        }
      }
      if(chosenProfile.user_id&&chosenProfile.user_id!==userId){
        console.warn("ARTIST DASHBOARD PROFILE USER_ID MISMATCH:", {
          artist_profiles_id:chosenProfile.id,
          profile_user_id:chosenProfile.user_id,
          current_user_id:userId,
        });
      }
      return chosenProfile;
    }
    console.log("[DEBUG] artist_profiles: no existing public/workspace row found for current artist; checking approved artist application intake");
    if(approvedApplication){
      console.log("[DEBUG] approved artist application found; syncing artist_profiles source of truth", approvedApplication);
      return await syncArtistProfileFromApprovedApplication({...approvedApplication,user_id:approvedApplication.user_id||userId});
    }
    return null;
  }

  async function resolveArtistProfileId(){
    if(myArtistProfile?.id)return myArtistProfile.id;
    if(!session?.user)return null;
    try{
      const row = await findOrLinkArtistProfile();
      if(row){
        setMyArtistProfile(row);
        return row.id;
      }
    }catch(err){
      console.error("RESOLVE ARTIST PROFILE EXCEPTION:", err);
      setMyArtistProfile(null);
      setPhotosLoadError("Could not load photos right now.");
    }
    return null;
  }

  async function loadMyArtistProfile(){
    console.log("ARTIST PROFILE FETCH START");
    if(DISABLE_ARTIST_PHOTO_FEATURES){setMyArtistProfile(null);return;}
    if(!session?.user){setMyArtistProfile(null);return;}
    try{
      const row = await findOrLinkArtistProfile();
      setMyArtistProfile(row || null);
      if(!row){
        console.log("LOAD MY ARTIST PROFILE: no row found for", {user_id:session.user.id});
      }
      return row || null;
    }catch(err){
      console.error("LOAD MY ARTIST PROFILE EXCEPTION:", err);
      setMyArtistProfile(null);
      setPhotosLoadError("Could not load photos right now.");
      return null;
    }
  }

  async function fetchPortfolioPhotos(profileOverride=null){
    if(DISABLE_ARTIST_PHOTO_FEATURES){setPortfolioPhotos([]);return;}
    if(!session?.user){setPortfolioPhotos([]);return;}
    try{
      const activeProfile=profileOverride||myArtistProfile;
      const artistProfileId=activeProfile?.id||await resolveArtistProfileId();
      if(!artistProfileId){setPortfolioPhotos([]);return;}
      const {data,error}=await supabase.from("artist_portfolio_photos").select("id, artist_id, image_url, sort_order, tags, category, look_type, hair_look, makeup_look, is_pinned, pin_order, created_at").eq("artist_id",artistProfileId).order("sort_order",{ascending:true});
      if(error){
        console.error("FETCH PORTFOLIO PHOTOS ERROR:", error);
        setPortfolioPhotos([]);
        setPhotosLoadError("Could not load photos right now.");
        return;
      }
      console.log("FETCH PORTFOLIO PHOTOS:", data);
      const relatedPhotos=sortPinnedPortfolioPhotos((Array.isArray(data)?data:[]).map(photo=>({...photo,source:"portfolio"})),artistPinnedPortfolioIds(activeProfile));
      const jsonPhotos=normalizeGalleryPhotos(activeProfile?.portfolio_photos||[],artistPinnedPortfolioIds(activeProfile)).map(photo=>({...photo,source:photo.source||"profile_json"}));
      const safePhotos=relatedPhotos.length?relatedPhotos:jsonPhotos;
      console.log("ARTIST WORKSPACE PORTFOLIO RESOLUTION:", {
        current_user_id:session?.user?.id||null,
        current_user_email:session?.user?.email||null,
        artist_profiles_id:artistProfileId,
        profile_user_id:activeProfile?.user_id||null,
        related_table_count:relatedPhotos.length,
        portfolio_photos_length:Array.isArray(activeProfile?.portfolio_photos)?activeProfile.portfolio_photos.length:0,
        resolved_portfolio_count:safePhotos.length,
        is_sample_artist:activeProfile?.source==="seed"||activeProfile?.source==="fallback"||activeProfile?.is_sample_artist===true,
        is_published:activeProfile?.is_published,
        is_active:activeProfile?.is_active,
        tier:activeProfile?.tier||null,
      });
      setPortfolioPhotos(safePhotos);
      setPortfolioTagForms(Object.fromEntries(safePhotos.map(photo=>[photo.id,buildPortfolioTagForm(photo)])));
      setMyArtistProfile(prev=>prev?.id===artistProfileId?{...prev,portfolio_photos:safePhotos}:prev);
      if(relatedPhotos.length){
        supabase.from("artist_profiles").update({portfolio_photos:relatedPhotos}).eq("id",artistProfileId).then(({error})=>{
          if(error)console.warn("ARTIST WORKSPACE PORTFOLIO MIRROR UPDATE ERROR:", error);
        }).catch(error=>console.warn("ARTIST WORKSPACE PORTFOLIO MIRROR UPDATE THREW:", error));
      }
    }catch(err){
      console.error("FETCH PORTFOLIO PHOTOS EXCEPTION:", err);
      setPortfolioPhotos([]);
      setPhotosLoadError("Could not load photos right now.");
    }
  }

  function arrayToCsv(value){
    return Array.isArray(value) ? value.filter(Boolean).join(", ") : "";
  }

  function csvToTextArray(value){
    return String(value||"").split(",").map(item=>item.trim()).filter(Boolean);
  }

  function cleanTextList(value){
    return (Array.isArray(value) ? value : csvToTextArray(value))
      .map(item=>String(item||"").trim())
      .filter(Boolean);
  }

  function editableTextList(value){
    return Array.isArray(value) ? value.map(item=>String(item||"")) : csvToTextArray(value);
  }

  function updateArtistEditList(field,index,value){
    setArtistEditForm(prev=>{
      const list=editableTextList(prev[field]);
      const next=[...list];
      next[index]=value;
      return {...prev,[field]:next};
    });
  }

  function addArtistEditListItem(field){
    setArtistEditForm(prev=>({
      ...prev,
      [field]:[...editableTextList(prev[field]),""],
    }));
  }

  function removeArtistEditListItem(field,index){
    setArtistEditForm(prev=>({
      ...prev,
      [field]:editableTextList(prev[field]).filter((_,itemIndex)=>itemIndex!==index),
    }));
  }

  function isArtistProProfile(profile){
    if(!profile)return false;
    const status=profile.artist_subscription_status||profile.subscription_status||"";
    const tier=String(profile.tier||"").toLowerCase();
    return profile.is_featured===true
      || tier==="premium"
      || tier==="pro"
      || tier==="upgraded"
      || status==="active"
      || profile.has_upgraded_profile===true;
  }

  function artistPortfolioLimit(profile){
    return isArtistProProfile(profile) ? 50 : 12;
  }

  function artistPinnedPortfolioIds(profile){
    const value=profile?.pinned_portfolio_photo_ids;
    if(Array.isArray(value))return value.map(String).filter(Boolean).slice(0,3);
    if(typeof value==="string")return csvToTextArray(value).map(String).slice(0,3);
    return [];
  }

  function sortPinnedPortfolioPhotos(photos,pinnedIds=[]){
    const pinnedOrder=new Map((pinnedIds||[]).map((id,index)=>[String(id),index+1]));
    return [...(Array.isArray(photos)?photos:[])].sort((a,b)=>{
      const aPinned=pinnedOrder.has(String(a?.id))||a?.is_pinned===true;
      const bPinned=pinnedOrder.has(String(b?.id))||b?.is_pinned===true;
      if(aPinned!==bPinned)return aPinned?-1:1;
      if(aPinned&&bPinned){
        const aOrder=pinnedOrder.get(String(a?.id))??(Number.isFinite(Number(a?.pin_order))?Number(a.pin_order):99);
        const bOrder=pinnedOrder.get(String(b?.id))??(Number.isFinite(Number(b?.pin_order))?Number(b.pin_order):99);
        if(aOrder!==bOrder)return aOrder-bOrder;
      }
      const aSort=Number.isFinite(Number(a?.sort_order))?Number(a.sort_order):999999;
      const bSort=Number.isFinite(Number(b?.sort_order))?Number(b.sort_order):999999;
      if(aSort!==bSort)return aSort-bSort;
      const aDate=a?.created_at?new Date(a.created_at).getTime():0;
      const bDate=b?.created_at?new Date(b.created_at).getTime():0;
      return aDate-bDate;
    });
  }

  function buildPortfolioTagForm(photo){
    return {
      category:photo?.category||"",
      look_type:photo?.look_type||"",
      hair_look:photo?.hair_look||"",
      makeup_look:photo?.makeup_look||"",
      tags:arrayToCsv(photo?.tags),
    };
  }

  function portfolioTagsFromForm(photoId, fallbackPhoto){
    const form=portfolioTagForms[photoId]||buildPortfolioTagForm(fallbackPhoto);
    return csvToTextArray(form.tags);
  }

  function updatePortfolioTagForm(photoId,field,value){
    setPortfolioTagForms(prev=>({
      ...prev,
      [photoId]:{
        ...(prev[photoId]||{}),
        [field]:value,
      },
    }));
  }

  function togglePortfolioTag(photo,tag){
    if(!photo?.id)return;
    const current=portfolioTagsFromForm(photo.id,photo);
    const next=current.includes(tag)?current.filter(item=>item!==tag):[...current,tag];
    updatePortfolioTagForm(photo.id,"tags",arrayToCsv(next));
  }

  function removePortfolioTags(photo){
    if(!photo?.id)return;
    updatePortfolioTagForm(photo.id,"tags","");
  }

  async function togglePortfolioPhotoPin(photo){
    if(!photo?.id||photo.source==="swipe_deck")return;
    if(!isArtistProProfile(myArtistProfile)){
      setPortfolioError("Upgrade to pin your strongest images first.");
      setTimeout(()=>setPortfolioError(""),4000);
      return;
    }
    setPortfolioError("");
    setPortfolioMessage("");
    setPortfolioSavingId(photo.id);
    try{
      const isPinned=photo.is_pinned===true;
      const currentPinnedIds=artistPinnedPortfolioIds(myArtistProfile).filter(id=>id!==String(photo.id));
      const payload=isPinned
        ?{is_pinned:false,pin_order:null}
        :(()=>{
          const usedOrders=new Set((portfolioPhotos||[])
            .filter(item=>item.id!==photo.id&&(item.is_pinned===true||currentPinnedIds.includes(String(item.id))))
            .map(item=>currentPinnedIds.indexOf(String(item.id))+1||Number(item.pin_order))
            .filter(order=>order>=1&&order<=3));
          const nextOrder=[1,2,3].find(order=>!usedOrders.has(order));
          if(!nextOrder)throw new Error("You can pin up to 3 photos.");
          return {is_pinned:true,pin_order:nextOrder};
        })();
      const nextPinnedIds=isPinned ? currentPinnedIds : [...currentPinnedIds,String(photo.id)].slice(0,3);
      const {data,error}=await supabase
        .from("artist_portfolio_photos")
        .update(payload)
        .eq("id",photo.id)
        .select("id, artist_id, image_url, sort_order, tags, category, look_type, hair_look, makeup_look, is_pinned, pin_order, created_at")
        .single();
      if(error)throw error;
      if(myArtistProfile?.id){
        const {data:profileUpdate,error:profileError}=await supabase
          .from("artist_profiles")
          .update({pinned_portfolio_photo_ids:nextPinnedIds})
          .eq("id",myArtistProfile.id)
          .select("*")
          .maybeSingle();
        if(profileError)throw profileError;
        if(profileUpdate)setMyArtistProfile(profileUpdate);
      }
      const updatedPhoto={...data,source:"portfolio"};
      setPortfolioPhotos(prev=>sortPinnedPortfolioPhotos(prev.map(item=>item.id===photo.id?{...item,...updatedPhoto}:item),nextPinnedIds));
      setPortfolioTagForms(prev=>({...prev,[photo.id]:buildPortfolioTagForm(updatedPhoto)}));
      setPortfolioMessage(isPinned?"Photo unpinned.":"Photo pinned.");
      setTimeout(()=>setPortfolioMessage(""),4000);
    }catch(error){
      console.error("PORTFOLIO PIN SAVE ERROR:", error);
      setPortfolioError(error?.message||"Could not update pinned photo right now.");
      setTimeout(()=>setPortfolioError(""),5000);
    }finally{
      setPortfolioSavingId(null);
    }
  }

  async function reorderPortfolioPhoto(photo,direction){
    if(!photo?.id)return;
    const ordered=[...safePortfolioPhotos].sort((a,b)=>(Number(a.sort_order)||0)-(Number(b.sort_order)||0));
    const currentIndex=ordered.findIndex(item=>item.id===photo.id);
    const nextIndex=currentIndex+direction;
    if(currentIndex<0 || nextIndex<0 || nextIndex>=ordered.length)return;
    const current=ordered[currentIndex];
    const next=ordered[nextIndex];
    const currentOrder=Number(current.sort_order)||currentIndex+1;
    const nextOrder=Number(next.sort_order)||nextIndex+1;
    setPortfolioSavingId(photo.id);
    setPortfolioError("");
    setPortfolioMessage("");
    try{
      const {error:firstError}=await supabase.from("artist_portfolio_photos").update({sort_order:nextOrder}).eq("id",current.id);
      if(firstError)throw firstError;
      const {error:secondError}=await supabase.from("artist_portfolio_photos").update({sort_order:currentOrder}).eq("id",next.id);
      if(secondError)throw secondError;
      setPortfolioPhotos(prev=>sortPinnedPortfolioPhotos(prev.map(item=>{
        if(item.id===current.id)return {...item,sort_order:nextOrder};
        if(item.id===next.id)return {...item,sort_order:currentOrder};
        return item;
      }),artistPinnedPortfolioIds(myArtistProfile)));
      setPortfolioMessage("Photo order saved.");
    }catch(error){
      console.error("REORDER PORTFOLIO PHOTO ERROR:", error);
      setPortfolioError("Could not reorder photos right now.");
    }finally{
      setPortfolioSavingId(null);
    }
  }

  async function loadAdminPortfolioPhotos(){
    if(!isAdmin)return;
    setAdminPortfolioLoading(true);
    setAdminPortfolioError("");
    setAdminPortfolioPhotos([]);
    try{
      const {data,error}=await supabase.from("artist_portfolio_photos").select("id, artist_id, image_url, sort_order, tags, category, look_type, hair_look, makeup_look, is_pinned, pin_order, created_at").order("sort_order",{ascending:true});
      if(error){
        console.error("PORTFOLIO TAG LOAD ERROR", error);
        setAdminPortfolioError("Could not load portfolio photos right now.");
        setAdminPortfolioPhotos([]);
        return;
      }
      const safePhotos=sortPinnedPortfolioPhotos((Array.isArray(data)?data:[]).map(photo=>({...photo,source:"portfolio"})));
      setAdminPortfolioPhotos(safePhotos);
      setPortfolioTagForms(prev=>({
        ...prev,
        ...Object.fromEntries(safePhotos.map(photo=>[photo.id,buildPortfolioTagForm(photo)])),
      }));
    }catch(error){
      console.error("PORTFOLIO TAG LOAD ERROR", error);
      setAdminPortfolioError("Could not load portfolio photos right now.");
      setAdminPortfolioPhotos([]);
    }finally{
      setAdminPortfolioLoading(false);
    }
  }

  async function savePortfolioPhotoTags(photo,scope="artist"){
    console.log("PHOTO BEING TAGGED", photo);
    if(!photo?.id){
      const message="Could not save tags because this photo is missing an ID.";
      if(scope==="admin")setAdminPortfolioError(message);
      else setPortfolioError(message);
      return false;
    }
    const form=portfolioTagForms[photo.id]||buildPortfolioTagForm(photo);
    setPortfolioError("");
    setPortfolioMessage("");
    setAdminPortfolioError("");
    setPortfolioSavingId(photo.id);
    try{
      const source=photo.source||"portfolio";
      const table=source==="swipe_deck"?"swipe_deck_photos":"artist_portfolio_photos";
      const category=form.category||null;
      const hairLook=String(form.hair_look||"").trim()||null;
      const makeupLook=String(form.makeup_look||"").trim()||null;
      const lookTypeRaw=String(form.look_type||"").trim()||null;
      const lookType=category==="full_look"
        ?(hairLook&&makeupLook?`${hairLook}_${makeupLook}`:lookTypeRaw)
        :lookTypeRaw;
      const payload={
        category,
        look_type:lookType,
        hair_look:category==="full_look"?hairLook:null,
        makeup_look:category==="full_look"?makeupLook:null,
        tags:csvToTextArray(form.tags),
      };
      const {data,error}=await supabase.from(table).update(payload).eq("id",photo.id).select();
      if(error)throw error;
      const rows=Array.isArray(data)?data:[];
      if(rows.length===0){
        throw new Error(`No ${table} row matched id ${photo.id}.`);
      }
      const savedPhoto={...rows[0],source};
      setPortfolioPhotos(prev=>prev.map(item=>item.id===photo.id?{...item,...savedPhoto}:item));
      setAdminPortfolioPhotos(prev=>prev.map(item=>item.id===photo.id?{...item,...savedPhoto}:item));
      setPortfolioTagForms(prev=>({...prev,[photo.id]:buildPortfolioTagForm(savedPhoto)}));
      setPortfolioMessage("Portfolio photo tags saved.");
      setTimeout(()=>setPortfolioMessage(""),4000);
      if(source==="portfolio"){
        if(scope==="admin")await loadAdminPortfolioPhotos();
        else await fetchPortfolioPhotos();
      }else if(source==="swipe_deck"){
        const {data:swipeDeckRows,error:swipeDeckError}=await supabase.from("swipe_deck_photos").select("id,image_url,tags,category,look_type,hair_look,makeup_look,sort_order").order("sort_order",{ascending:true});
        if(swipeDeckError)throw swipeDeckError;
        const updatedRows=(Array.isArray(swipeDeckRows)?swipeDeckRows:[]).map(item=>({...item,source:"swipe_deck"}));
        if(scope==="admin")setAdminPortfolioPhotos(updatedRows);
        else setPortfolioPhotos(updatedRows);
        setPortfolioTagForms(prev=>({
          ...prev,
          ...Object.fromEntries(updatedRows.map(item=>[item.id,buildPortfolioTagForm(item)])),
        }));
      }
      return true;
    }catch(error){
      console.error("PORTFOLIO TAG SAVE ERROR:", error);
      if(scope==="admin")setAdminPortfolioError("Could not save photo tags right now.");
      else setPortfolioError("Could not save photo tags right now.");
      setTimeout(()=>setPortfolioError(""),8000);
      return false;
    }finally{
      setPortfolioSavingId(null);
    }
  }

  function buildArtistEditForm(profileRow){
    const row=profileRow||{};
    return {
      business_name:row.business_name||"",
      owner_name:row.owner_name||"",
      city:row.city||"",
      state:row.state||"",
      country:row.country||"",
      services:row.services||"",
      bio:row.bio||"",
      aesthetic:row.aesthetic||"",
      specialties:arrayToCsv(row.specialties),
      best_for:cleanTextList(row.best_for),
      not_ideal_for:cleanTextList(row.not_ideal_for),
      signature_method:row.signature_method||"",
      featured_services:arrayToCsv(row.featured_services),
      artist_notes:row.artist_notes||"",
      featured_badge_label:row.featured_badge_label||"",
      cover_image_url:row.cover_image_url||"",
      education:row.education||"",
      starting_price:row.starting_price||"",
      travels:!!row.travels,
      website:row.website||"",
      instagram:row.instagram||"",
      email:row.email||"",
    };
  }

  function openArtistEditProfile(){
    console.log("ARTIST EDIT FORM PROFILE RESOLUTION:", {
      artist_profiles_id:myArtistProfile?.id||null,
      user_id:myArtistProfile?.user_id||null,
      business_name:myArtistProfile?.business_name||null,
      is_published:myArtistProfile?.is_published,
      is_active:myArtistProfile?.is_active,
      tier:myArtistProfile?.tier||null,
    });
    setArtistEditForm(buildArtistEditForm(myArtistProfile));
    setArtistEditError("");
    setArtistEditMessage("");
    setArtistEditOpen(true);
  }

  function cancelArtistEditProfile(){
    setArtistEditOpen(false);
    setArtistEditForm(buildArtistEditForm(myArtistProfile));
    setArtistEditError("");
    setArtistEditMessage("");
  }

  async function saveArtistEditProfile(){
    setArtistEditError("");
    setArtistEditMessage("");
    const artistId=myArtistProfile?.id||await resolveArtistProfileId();
    console.log("ARTIST EDIT SAVE TARGET:", {
      artist_profiles_id:artistId||null,
      dashboard_artist_profiles_id:myArtistProfile?.id||null,
      user_id:myArtistProfile?.user_id||null,
      business_name:myArtistProfile?.business_name||null,
    });
    if(!artistId){
      setArtistEditError("Could not save profile right now.");
      return;
    }
    setArtistEditSaving(true);
    try{
      const payload={
        business_name:artistEditForm.business_name.trim(),
        owner_name:artistEditForm.owner_name.trim(),
        city:artistEditForm.city.trim(),
        state:artistEditForm.state.trim(),
        country:artistEditForm.country.trim(),
        services:artistEditForm.services.trim(),
        bio:artistEditForm.bio.trim(),
        aesthetic:artistEditForm.aesthetic.trim(),
        specialties:csvToTextArray(artistEditForm.specialties),
        signature_method:artistEditForm.signature_method.trim(),
        featured_services:csvToTextArray(artistEditForm.featured_services),
        artist_notes:artistEditForm.artist_notes.trim(),
        featured_badge_label:artistEditForm.featured_badge_label.trim(),
        cover_image_url:artistEditForm.cover_image_url.trim(),
        education:artistEditForm.education.trim(),
        best_for:cleanTextList(artistEditForm.best_for),
        not_ideal_for:cleanTextList(artistEditForm.not_ideal_for),
        starting_price:artistEditForm.starting_price.trim(),
        travels:!!artistEditForm.travels,
        website:artistEditForm.website.trim(),
        instagram:artistEditForm.instagram.trim(),
        email:artistEditForm.email.trim(),
        profile_photo_url:myArtistProfile?.profile_photo_url||null,
      };
      const {data,error}=await supabase.from("artist_profiles").update(payload).eq("id",artistId).select().single();
      if(error)throw error;
      console.log("ARTIST PROFILE SAVE SUCCESS:", data);
      setArtistEditForm(buildArtistEditForm(data));
      setArtistEditMessage("Profile saved.");
      await loadMyArtistProfile();
      setArtistEditOpen(false);
    }catch(error){
      console.error("ARTIST PROFILE SAVE ERROR:", error);
      setArtistEditError("Could not save profile right now.");
    }finally{
      setArtistEditSaving(false);
    }
  }

  async function setMyArtistDirectoryPublished(nextPublished){
    setArtistVisibilityError("");
    setArtistVisibilityMessage("");
    if(!myArtistProfile?.id){
      setArtistVisibilityError("No artist profile found.");
      return;
    }
    if(myArtistProfile.is_active===false&&nextPublished){
      setArtistVisibilityError("This profile is suspended. An admin must restore it before it can be listed.");
      return;
    }
    setArtistVisibilitySaving(true);
    try{
      const payload={
        is_published:nextPublished,
        is_active:myArtistProfile?.is_active===false?false:true,
      };
      const {data,error}=await supabase
        .from("artist_profiles")
        .update(payload)
        .eq("id",myArtistProfile.id)
        .select()
        .single();
      if(error)throw error;
      setMyArtistProfile(data);
      setArtistVisibilityMessage(nextPublished?"Directory listing published.":"Directory listing hidden.");
      console.log("ARTIST DIRECTORY VISIBILITY UPDATED:", {
        artist_profiles_id:data?.id||null,
        user_id:data?.user_id||null,
        business_name:data?.business_name||null,
        is_published:data?.is_published,
        is_active:data?.is_active,
      });
      if(screen==="directory")await loadApprovedArtists();
      setTimeout(()=>setArtistVisibilityMessage(""),4000);
    }catch(error){
      console.error("ARTIST DIRECTORY VISIBILITY UPDATE ERROR:", error);
      setArtistVisibilityError("Could not update directory visibility right now.");
      setTimeout(()=>setArtistVisibilityError(""),6000);
    }finally{
      setArtistVisibilitySaving(false);
    }
  }

  async function uploadArtistProfilePhoto(file){
    console.log("[DEBUG] uploadArtistProfilePhoto called, file:", {name:file?.name,size:file?.size,type:file?.type});
    if(!file||!session?.user){
      console.warn("[DEBUG] uploadArtistProfilePhoto aborted — file or session missing", {hasFile:!!file,hasSession:!!session?.user});
      setProfilePhotoError("You must be signed in to upload a profile photo.");
      return;
    }
    const userId = session.user.id;
    console.log("[DEBUG] profile photo upload — session.user.id:", userId);
    try{
      const {data:authResult} = await supabase.auth.getUser();
      console.log("[DEBUG] profile photo upload — auth.uid():", authResult?.user?.id || null);
    }catch(authErr){
      console.warn("[DEBUG] profile photo upload — supabase.auth.getUser threw:", authErr);
    }
    setProfilePhotoError("");
    setProfilePhotoMessage("");
    setProfilePhotoUploading(true);
    try{
      // Namespace the storage path by auth user_id so it lines up with
      // storage RLS policies and with the artist_profiles row we'll update.
      const ext=(file.name.split(".").pop()||"jpg").toLowerCase();
      const filePath=`${userId}/profile-photo-${Date.now()}.${ext}`;
      console.log("[DEBUG] profile photo storage path:", filePath);
      const storageResponse=await supabase.storage.from(ARTIST_STORAGE_BUCKET).upload(filePath,file,{cacheControl:"3600",upsert:true,contentType:file.type||"image/jpeg"});
      console.log("[DEBUG] profile photo storage.upload result:", storageResponse);
      const {data:uploadData,error:uploadError}=storageResponse;
      if(uploadError){
        console.error("[DEBUG] profile photo storage upload error:", uploadError);
        setProfilePhotoError("Could not upload your profile photo right now.");
        setTimeout(()=>setProfilePhotoError(""),8000);
        return;
      }
      const storedPath=uploadData?.path||filePath;
      const {data:publicUrlData}=supabase.storage.from(ARTIST_STORAGE_BUCKET).getPublicUrl(storedPath);
      const publicUrl=publicUrlData?.publicUrl||"";
      console.log("[DEBUG] profile photo publicUrl:", publicUrl);
      if(!publicUrl){
        console.warn("[DEBUG] profile photo — empty publicUrl");
        setProfilePhotoError("Could not generate a public URL for your photo.");
        setTimeout(()=>setProfilePhotoError(""),8000);
        return;
      }
      console.log("[DEBUG] profile photo — updating artist_profiles where user_id =", userId);
      const dbResponse=await supabase
        .from("artist_profiles")
        .update({profile_photo_url:publicUrl})
        .eq("user_id",userId)
        .select()
        .maybeSingle();
      console.log("[DEBUG] profile photo DB update response:", dbResponse);
      const {data:updatedRow,error:updateError}=dbResponse;
      if(updateError){
        console.error("[DEBUG] profile photo DB update error:", updateError);
        setProfilePhotoError("Could not save your profile photo right now.");
        setTimeout(()=>setProfilePhotoError(""),8000);
        return;
      }
      if(!updatedRow){
        console.warn("[DEBUG] profile photo DB update returned no row — RLS or missing artist_profiles row for user_id", userId);
        const friendly = artistApplicationStatus === "approved"
          ? "Your artist profile is being set up. Please try again in a moment."
          : "Submit and get your artist application approved before uploading a profile photo.";
        setProfilePhotoError(friendly);
        setTimeout(()=>setProfilePhotoError(""),8000);
        return;
      }
      console.log("[DEBUG] profile photo upload SUCCESS — persisted row:", updatedRow);
      // Replace myArtistProfile with the freshly persisted row so the
      // dashboard, profile summary, and score recompute against the new URL.
      setMyArtistProfile(updatedRow);
      setProfilePhotoMessage("Profile photo updated.");
      setTimeout(()=>setProfilePhotoMessage(""),4000);
    }catch(err){
      console.error("[DEBUG] profile photo upload exception:", err);
      setProfilePhotoError("Could not upload your profile photo right now.");
      setTimeout(()=>setProfilePhotoError(""),8000);
    }finally{
      setProfilePhotoUploading(false);
      if(profilePhotoFileRef.current)profilePhotoFileRef.current.value="";
    }
  }

  async function uploadPortfolioPhoto(file){
    console.log("PORTFOLIO UPLOAD TAPPED");
    if(!file||!session?.user){
      setPortfolioError("You must be signed in to upload portfolio photos.");
      return;
    }
    setPortfolioError("");
    setPortfolioMessage("");
    setPortfolioUploading(true);
    try{
      const artistProfileId=await resolveArtistProfileId();
      if(!artistProfileId){
        const friendly = artistApplicationStatus === "approved"
          ? "Your artist profile is being set up. Please try again in a moment."
          : "Submit and get your artist application approved before uploading portfolio photos.";
        setPortfolioError(friendly);
        setTimeout(()=>setPortfolioError(""),8000);
        return;
      }
      const limit=artistPortfolioLimit(myArtistProfile);
      if((portfolioPhotos||[]).length>=limit){
        setPortfolioError(`Your current plan allows up to ${limit} portfolio photos.`);
        setTimeout(()=>setPortfolioError(""),8000);
        return;
      }
      const ext=(file.name.split(".").pop()||"jpg").toLowerCase();
      const filePath=`${artistProfileId}/portfolio-${Date.now()}.${ext}`;
      const {data:uploadData,error:uploadError}=await supabase.storage.from(ARTIST_STORAGE_BUCKET).upload(filePath,file,{cacheControl:"3600",upsert:false,contentType:file.type||"image/jpeg"});
      if(uploadError){
        console.error("PORTFOLIO STORAGE UPLOAD ERROR:", uploadError);
        setPortfolioError("Could not upload your photo right now.");
        setTimeout(()=>setPortfolioError(""),8000);
        return;
      }
      const storedPath=uploadData?.path||filePath;
      const {data:publicUrlData}=supabase.storage.from(ARTIST_STORAGE_BUCKET).getPublicUrl(storedPath);
      const publicUrl=publicUrlData?.publicUrl||"";
      console.log("filePath", storedPath);
      console.log("publicUrl", publicUrl);
      if(!publicUrl){
        setPortfolioError("Could not generate a public URL for your photo.");
        setTimeout(()=>setPortfolioError(""),8000);
        return;
      }
      const sortOrder=(portfolioPhotos ?? []).length;
      const {data:saveData,error:saveError}=await supabase.from("artist_portfolio_photos").insert({artist_id:artistProfileId,image_url:publicUrl,sort_order:sortOrder,tags:[],category:null,look_type:null,is_pinned:false,pin_order:null}).select().single();
      if(saveError){
        console.error("PORTFOLIO DB SAVE ERROR:", saveError);
        setPortfolioError("Could not save your photo right now.");
        setTimeout(()=>setPortfolioError(""),8000);
        return;
      }
      console.log("saved database row", saveData);
      setPortfolioPhotos(prev=>sortPinnedPortfolioPhotos([...prev,{...saveData,image_url:saveData?.image_url||publicUrl,source:"portfolio"}],artistPinnedPortfolioIds(myArtistProfile)));
      setPortfolioTagForms(prev=>({...prev,[saveData.id]:buildPortfolioTagForm(saveData)}));
      setPortfolioMessage("Portfolio photo saved.");
      setTimeout(()=>setPortfolioMessage(""),4000);
    }catch(err){
      console.error("PORTFOLIO UPLOAD EXCEPTION:", err);
      setPortfolioError("Could not upload your photo right now.");
      setTimeout(()=>setPortfolioError(""),8000);
    }finally{
      setPortfolioUploading(false);
      if(portfolioFileRef.current)portfolioFileRef.current.value="";
    }
  }

  async function deletePortfolioPhoto(photo){
    if(!photo||!session?.user)return;
    try{
      const bucketMarker=`/${ARTIST_STORAGE_BUCKET}/`;
      const imageUrl=typeof photo.image_url==="string"?photo.image_url:"";
      const markerIndex=imageUrl.indexOf(bucketMarker);
      const derivedPath=markerIndex>=0?imageUrl.slice(markerIndex+bucketMarker.length).split("?")[0]:"";
      if(derivedPath){
        await supabase.storage.from(ARTIST_STORAGE_BUCKET).remove([derivedPath]);
      }
      const {error}=await supabase.from("artist_portfolio_photos").delete().eq("id",photo.id);
      if(error){
        console.error("PORTFOLIO DELETE ERROR:", error);
        setPortfolioError("Could not delete this photo right now.");
        setTimeout(()=>setPortfolioError(""),8000);
        return;
      }
      setPortfolioPhotos(prev=>prev.filter(p=>p.id!==photo.id));
      setPortfolioTagForms(prev=>{
        const next={...prev};
        delete next[photo.id];
        return next;
      });
    }catch(err){
      console.error("PORTFOLIO DELETE EXCEPTION:", err);
      setPortfolioError("Could not delete this photo right now.");
      setTimeout(()=>setPortfolioError(""),8000);
    }
  }

  useEffect(()=>{
    if(DISABLE_ARTIST_PHOTO_FEATURES){
      setMyArtistProfile(null);
      setPortfolioPhotos([]);
      setPhotosLoadError("");
      return;
    }
    // The artist workspace reads only from artist_profiles where
    // user_id = auth.uid(); the lookup is gated on a signed-in session and
    // the RLS policy naturally restricts results to the current user's row.
    const canLoad = !!session?.user;
    if(canLoad){
      setPhotosLoadError("");
      (async()=>{
        try{
          const row=await loadMyArtistProfile();
          await fetchPortfolioPhotos(row);
        }catch(error){
          console.error("ARTIST DASHBOARD PHOTO LOAD ERROR:", error);
          setMyArtistProfile(null);
          setPortfolioPhotos([]);
          setPhotosLoadError("Could not load photos right now.");
        }
      })();
    }else{
      setMyArtistProfile(null);
      setPortfolioPhotos([]);
      setPhotosLoadError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[session?.user?.id]);

  // Observer: surface every change to myArtistProfile so it's easy to see
  // whether the workspace has data, what fields are present, and when it
  // gets cleared. Pairs with the [DEBUG] logs in findOrLinkArtistProfile.
  useEffect(()=>{
    if(myArtistProfile){
      console.log("[DEBUG] myArtistProfile updated:", {
        id: myArtistProfile.id,
        user_id: myArtistProfile.user_id,
        business_name: myArtistProfile.business_name,
        profile_photo_url: myArtistProfile.profile_photo_url,
        portfolio_photos_count: Array.isArray(myArtistProfile.portfolio_photos) ? myArtistProfile.portfolio_photos.length : 0,
        is_published: myArtistProfile.is_published,
        is_active: myArtistProfile.is_active,
      });
    }else{
      console.log("[DEBUG] myArtistProfile is null (no artist_profiles row in state)");
    }
  },[myArtistProfile]);

  // ── APPROVED ARTISTS (public directory) ────────────────────────────
  function csvArr(v){
    if(Array.isArray(v))return v.filter(Boolean);
    if(typeof v==="string")return v.split(",").map(s=>s.trim()).filter(Boolean);
    return [];
  }
  function safeArtistArray(value){
    return Array.isArray(value) ? value.filter(Boolean) : csvArr(value);
  }
  function artistRegion(artist){
    return artist?.state||artist?.province_state||artist?.province||artist?.region||"";
  }
  function artistLocationLabel(artist){
    return [artist?.city||"", artistRegion(artist), artist?.country||""].filter(Boolean).join(", ");
  }
function artistUpgradeFromProfile(profile){
    const status = profile?.artist_subscription_status || profile?.subscription_status || "";
    const tier = String(profile?.tier || "").toLowerCase();
    const upgradedTierValues = ["upgraded","premium","pro"];
    const hasUpgradedProfile = upgradedTierValues.includes(tier) || status === "active" || profile?.is_featured === true || profile?.is_premium === true || profile?.premium === true || profile?.role === "premium" || profile?.role === "admin" || profile?.is_admin === true;
    return {
      tier: hasUpgradedProfile ? "upgraded" : "free",
      artist_subscription_status: status,
      has_upgraded_profile: hasUpgradedProfile,
    };
  }
  function artistProfileCompleteness(app, photos=[], shouldLog=true){
    // Workspace data comes ONLY from artist_profiles columns — no
    // application-style aliases (name/about/location/service) and no
    // local fallback objects.
    const safePhotos = Array.isArray(photos) ? photos : [];
    const displayName=app?.business_name||"";
    const location=app?.city||"";
    const country=app?.country||"";
    const bio=app?.bio||app?.aesthetic||"";
    const specialties=csvArr(app?.specialties);
    const service=app?.services||"";
    const profilePhoto=app?.profile_photo_url||"";
    const missingFields=[];
    if(!displayName.trim())missingFields.push("display name");
    if(!profilePhoto)missingFields.push("profile photo");
    if(safePhotos.length<3)missingFields.push("at least 3 portfolio photos");
    if(!location.trim())missingFields.push("location");
    if(!country.trim())missingFields.push("country");
    if(!bio.trim())missingFields.push("bio/about section");
    if(!service.trim()&&specialties.length===0)missingFields.push("specialty/service");
    // Directory visibility is gated on the artist_profiles row being
    // published/active and the profile being complete — no application
    // status involvement.
    const isVisible=app?.is_published===true&&app?.is_active===true&&missingFields.length===0;
    if(shouldLog){
      console.log("PROFILE COMPLETENESS CHECK");
      console.log("MISSING PROFILE FIELDS:", missingFields);
      console.log("DIRECTORY VISIBILITY:", isVisible);
    }
    return {missingFields,isVisible,profilePhoto,portfolioPhotoCount:safePhotos.length};
  }
  function approvedAppToArtist(app, photos=[], artistUpgrade={}, completeness=null){
    const safeApp = app || {};
    const safePhotos = Array.isArray(photos) ? photos : [];
    const firstPhotoUrl=safePhotos[0]?.image_url||"";
    const displayName=safeApp.business_name||safeApp.name||"";
    const location=safeApp.city||"";
    const provinceState=safeApp.province_state||safeApp.state||"";
    const country=safeApp.country||"";
    const services=safeApp.services||"Hair + Makeup";
    const isUpgraded=artistUpgrade?.has_upgraded_profile===true;
    return {
      id:`app-${safeApp.id}`,
      name:displayName,
      business_name:displayName,
      owner:safeApp.name||"",
      city:location,
      state:provinceState,
      country:country,
      services:services,
      badge:isUpgraded?"Upgraded Profile":null,
      is_featured:safeApp.is_featured===true,
      featured_badge_label:safeApp.featured_badge_label||"",
      cover_image_url:safeApp.cover_image_url||"",
      signature_method:safeApp.signature_method||"",
      featured_services:safeArtistArray(safeApp.featured_services),
      artist_notes:safeApp.artist_notes||"",
      pinned_portfolio_photo_ids:safeArtistArray(safeApp.pinned_portfolio_photo_ids),
      portfolio_limit:Number(safeApp.portfolio_limit)||artistPortfolioLimit({...safeApp,has_upgraded_profile:isUpgraded}),
      profile_views:Number(safeApp.profile_views)||0,
      inquiry_clicks:Number(safeApp.inquiry_clicks)||0,
      specialties:safeArtistArray(safeApp.specialties),
      not_ideal:[],
      aesthetic:app.bio||"",
      bio:app.bio||"",
      best_for:safeArtistArray(safeApp.specialties),
      portfolio:"",
      portfolio_image:completeness?.profilePhoto||firstPhotoUrl,
      education:safeApp.years_experience?`${safeApp.years_experience} years experience`:"",
      rating:5,
      reviews:0,
      avatar:(displayName||"A").split(" ").map(w=>w[0]).filter(Boolean).slice(0,2).join("").toUpperCase(),
      travel:true,
      price:safeApp.price_range||"Request quote",
      fit_styles:[],
      email:safeApp.email||"",
      website:safeApp.website||"",
      instagram:safeApp.instagram||"",
      portfolio_photos:safePhotos,
      profile_photo_url:completeness?.profilePhoto||firstPhotoUrl,
      tier:artistUpgrade?.tier||"free",
      artist_subscription_status:artistUpgrade?.artist_subscription_status||"",
      has_upgraded_profile:isUpgraded,
      missing_profile_fields:completeness?.missingFields||[],
      is_directory_visible:completeness?.isVisible===true,
      portfolio_photo_count:completeness?.portfolioPhotoCount||safePhotos.length,
    };
  }
  function normalizeDirectoryArtist(row, source){
    const safeRow = row || {};
    const isProfile = source === "profile";
    const displayName=isProfile ? (safeRow.business_name||"") : (safeRow.name||safeRow.business_name||"");
    const ownerName=isProfile ? (safeRow.owner_name||"") : (safeRow.owner||safeRow.owner_name||"");
    const travels=isProfile ? !!safeRow.travels : !!(safeRow.travels??safeRow.travel);
    const price=isProfile ? (safeRow.starting_price||safeRow.price||"Request quote") : (safeRow.price||safeRow.starting_price||"Request quote");
    const rawNotIdeal=safeRow.not_ideal_for??safeRow.not_ideal;
    const specialties=safeArtistArray(safeRow.specialties);
    const bestFor=safeArtistArray(safeRow.best_for);
    const notIdeal=safeArtistArray(rawNotIdeal);
    const fitStyles=safeArtistArray(safeRow.fit_styles);
    return {
      ...safeRow,
      id:`${source}-${safeRow.id}`,
      source,
      raw_id:safeRow.id,
      name:displayName,
      business_name:displayName,
      owner_name:ownerName,
      owner:ownerName,
      city:safeRow.city||"",
      state:safeRow.state||safeRow.province_state||"",
      country:safeRow.country||"",
      services:safeRow.services||"Hair + Makeup",
      badge:safeRow.badge||null,
      is_featured:safeRow.is_featured===true,
      featured_badge_label:safeRow.featured_badge_label||"",
      cover_image_url:safeRow.cover_image_url||"",
      signature_method:safeRow.signature_method||"",
      featured_services:safeArtistArray(safeRow.featured_services),
      artist_notes:safeRow.artist_notes||"",
      pinned_portfolio_photo_ids:safeArtistArray(safeRow.pinned_portfolio_photo_ids),
      portfolio_limit:Number(safeRow.portfolio_limit)||artistPortfolioLimit(safeRow),
      profile_views:Number(safeRow.profile_views)||0,
      inquiry_clicks:Number(safeRow.inquiry_clicks)||0,
      specialties,
      not_ideal_for:notIdeal,
      not_ideal:notIdeal,
      aesthetic:safeRow.aesthetic||safeRow.bio||"",
      bio:safeRow.bio||"",
      best_for:bestFor.length?bestFor:specialties,
      portfolio:safeRow.portfolio||"",
      portfolio_image:safeRow.profile_photo_url||safeRow.portfolio_image||safeRow.image_url||safeRow.photo_url||safeRow.avatar_url||"",
      profile_photo_url:safeRow.profile_photo_url||"",
      portfolio_photos:Array.isArray(safeRow.portfolio_photos)?safeRow.portfolio_photos:[],
      education:safeRow.education||"",
      rating:Number(safeRow.rating)||5,
      reviews:Number(safeRow.reviews)||0,
      avatar:safeRow.avatar||(displayName||"A").split(" ").map(w=>w[0]).filter(Boolean).slice(0,2).join("").toUpperCase(),
      travel:travels,
      travels,
      price,
      fit_styles:fitStyles,
      email:safeRow.email||"",
      website:safeRow.website||"",
      instagram:safeRow.instagram||"",
      is_directory_visible:true,
    };
  }

  function directoryFilterReason(artist){
    if(!artist)return "missing artist";
    if(dirCountry!=="All Countries"&&artist.country!==dirCountry)return `country filter: ${artist.country||"blank"} !== ${dirCountry}`;
    if(dirState!=="All Regions"&&artistRegion(artist)!==dirState)return `region filter: ${artistRegion(artist)||"blank"} !== ${dirState}`;
    if(dirService!=="All Services"&&artist.services!==dirService)return `service filter: ${artist.services||"blank"} !== ${dirService}`;
    if(dirTravel&&!artist.travel)return "travel filter: artist does not travel";
    const specialties = artist?.specialties ?? [];
    const bestFor = artist?.best_for ?? [];
    const searchable = `${artist?.business_name ?? ""} ${artist?.owner_name ?? ""} ${artist?.city ?? ""} ${artistRegion(artist)} ${artist?.country ?? ""} ${specialties.join(" ")} ${artist?.aesthetic ?? ""} ${bestFor.join(" ")}`;
    if(dirSearch&&!searchable.toLowerCase().includes(dirSearch.toLowerCase()))return `search filter: "${dirSearch}" not found`;
    return "";
  }

  async function loadApprovedArtists(){
    console.log("ARTIST DIRECTORY FETCH STARTED");
    console.log("ARTIST DIRECTORY QUERY FILTER:", {tables:["artist_profiles","artist_directory_seeds","hardcoded"], artist_profiles:{is_published:true,is_active:true}});
    const currentUserId=session?.user?.id||null;
    const currentUserEmail=session?.user?.email||null;
    const canPreviewOwnHiddenArtist=isAdmin===true||userRole==="admin";
    setDirectoryError("");
    let seedRows=[], profileRows=[], seedError=null, profileError=null, seedCountCheck=null;
    let currentUserProfile=null;
    let fallbackArtists=[];
    try{
      fallbackArtists=(ARTISTS||[]).map(row=>normalizeDirectoryArtist(row,"fallback"));
    }catch(err){
      console.error("HARDCODED ARTIST NORMALIZE ERROR:", err);
      fallbackArtists=[];
    }
    console.log("Hardcoded artists count:", fallbackArtists.length);
    const artistProfileSelectBase = `
id,
user_id,
business_name,
owner_name,
city,
state,
country,
services,
bio,
aesthetic,
specialties,
signature_method,
is_featured,
featured_badge_label,
cover_image_url,
featured_services,
artist_notes,
pinned_portfolio_photo_ids,
portfolio_limit,
profile_views,
inquiry_clicks,
tier,
artist_subscription_status,
is_sample_artist,
starting_price,
travels,
website,
instagram,
email,
profile_photo_url,
portfolio_photos,
is_published,
is_active
`;
    const artistProfileSelect = artistProfileSelectBase.replace("signature_method,", "best_for,\nnot_ideal_for,\nsignature_method,").replace("featured_services,", "education,\nfeatured_services,");
    const isOptionalArtistProfileColumnError = error => {
      const message=String(error?.message||error?.details||error?.hint||"").toLowerCase();
      return Boolean(message&&["education","best_for","not_ideal_for"].some(column=>message.includes(column)));
    };
    let activeArtistProfileSelect=artistProfileSelect;
    try{
      const results=await Promise.allSettled([
        supabase.from("artist_directory_seeds").select("*").order("name",{ascending:true}),
        supabase.from("artist_profiles").select(activeArtistProfileSelect).eq("is_published",true).eq("is_active",true).order("business_name",{ascending:true}),
      ]);
      const seedRes=results[0]?.status==="fulfilled"?results[0].value:{data:[],error:results[0]?.reason};
      let profileRes=results[1]?.status==="fulfilled"?results[1].value:{data:[],error:results[1]?.reason};
      if(profileRes?.error&&isOptionalArtistProfileColumnError(profileRes.error)){
        console.warn("ARTIST DIRECTORY OPTIONAL PROFILE FIELDS UNAVAILABLE; RETRYING BASE PROFILE SELECT:", profileRes.error);
        activeArtistProfileSelect=artistProfileSelectBase;
        profileRes=await supabase.from("artist_profiles").select(activeArtistProfileSelect).eq("is_published",true).eq("is_active",true).order("business_name",{ascending:true});
      }
      seedRows=seedRes?.data||[];
      profileRows=profileRes?.data ?? [];
      seedError=seedRes?.error||null;
      profileError=profileRes?.error||null;
      console.log("SEED RAW", seedRows);
      console.log("SEED RAW COUNT", seedRows?.length);
      if(!seedError && seedRows.length===0){
        console.log("ARTIST DIRECTORY SEEDS EMPTY, CHECKING TABLE COUNT/RLS");
        seedCountCheck=await supabase.from("artist_directory_seeds").select("*",{count:"exact",head:true});
        console.log("SEED TABLE COUNT CHECK", seedCountCheck);
        if(seedCountCheck?.error){
          console.log("SEED TABLE CHECK ERROR - possible table name or RLS issue", seedCountCheck.error);
        }else{
          console.log("SEED TABLE EXACT COUNT", seedCountCheck?.count);
        }
      }
      console.log("ARTISTS RAW", profileRows);
      console.log("ARTIST COUNT", profileRows?.length);
      if(currentUserId){
        const {data:currentProfile,error:currentProfileError}=await supabase
          .from("artist_profiles")
          .select("*")
          .eq("user_id",currentUserId)
          .maybeSingle();
        if(currentProfileError){
          console.error("CURRENT ARTIST DIRECTORY PROFILE LOOKUP ERROR:", currentProfileError);
        }else{
          currentUserProfile=currentProfile||null;
          const fetchedInPublishedQuery=!!(currentUserProfile?.id&&profileRows.some(row=>String(row?.id)===String(currentUserProfile.id)));
          const isPublished=currentUserProfile?.is_published===true;
          const isActive=currentUserProfile?.is_active===true;
          const directoryVisible=isPublished&&isActive;
          console.log("CURRENT ARTIST DIRECTORY PROFILE DEBUG:", {
            current_user_id:currentUserId,
            current_user_email:currentUserEmail,
            artist_profiles_id:currentUserProfile?.id||null,
            user_id:currentUserProfile?.user_id||null,
            business_name:currentUserProfile?.business_name||null,
            approval_status:currentUserProfile?.approval_status||currentUserProfile?.application_status||(currentUserProfile?"approved_profile_exists":artistApplicationStatus||null),
            visibility_status:directoryVisible?"visible":"hidden",
            directory_listing_status:directoryVisible?"listed":"not_listed",
            is_published:currentUserProfile?.is_published,
            is_active:currentUserProfile?.is_active,
            tier:currentUserProfile?.tier||null,
            services:currentUserProfile?.services||null,
            country:currentUserProfile?.country||null,
            region_state:artistRegion(currentUserProfile),
            fetched_in_public_query:fetchedInPublishedQuery,
            included_for_admin_preview:!directoryVisible&&canPreviewOwnHiddenArtist,
          });
          if(currentUserProfile?.id&&!fetchedInPublishedQuery&&(directoryVisible||canPreviewOwnHiddenArtist)){
            profileRows=[currentUserProfile,...profileRows];
            console.log("CURRENT ARTIST DIRECTORY PROFILE MERGED:", {
              artist_profiles_id:currentUserProfile.id,
              reason:directoryVisible?"public-visible current artist was missing from fetched rows":"admin preview of hidden current artist",
            });
          }
          if(currentUserProfile?.id&&!directoryVisible&&!canPreviewOwnHiddenArtist){
            console.log("CURRENT ARTIST DIRECTORY PROFILE FILTERED BEFORE MERGE:", {
              artist_profiles_id:currentUserProfile.id,
              reason:"profile is not both is_published=true and is_active=true",
              is_published:currentUserProfile.is_published,
              is_active:currentUserProfile.is_active,
            });
          }
        }
      }
      if(!profileError && profileRows.length===0){
        console.log("ARTIST DIRECTORY FILTERED EMPTY, RETRYING WITHOUT PUBLISHED/ACTIVE FILTERS");
        profileRes=await supabase.from("artist_profiles").select(activeArtistProfileSelect).order("business_name",{ascending:true});
        profileRows=profileRes?.data ?? [];
        profileError=profileRes?.error||null;
        console.log("ARTISTS RAW", profileRows);
        console.log("ARTIST COUNT", profileRows?.length);
      }
    }catch(err){
      console.error("Artist fetch failed", err);
      console.error("ARTIST DIRECTORY FETCH EXCEPTION:", err);
      seedError=err;
    }
    if(seedError||profileError){
      const error=seedError||profileError;
      console.error("Artist Supabase fetch error:", error);
      console.log("ARTIST DIRECTORY FETCH ERROR:", error);
      setDirectoryError((error&&error.message)||"Could not load artists right now.");
      setTimeout(()=>setDirectoryError(""),8000);
    }
    // Hydrate hardcoded artists with their real artist_profiles id/user_id (by email or business name)
    // so the gallery + save routes can use Supabase, not placeholders.
    const hardcodedEmails=Array.from(new Set(fallbackArtists.map(artistEmailMatchKey).filter(Boolean)));
    const hardcodedBusinessNames=Array.from(new Set(fallbackArtists.map(artistBusinessMatchKey).filter(Boolean)));
    const profileByEmail=new Map();
    const profileByBusinessName=new Map();
    const rememberProfileMatch=row=>{
      const emailKey=artistEmailMatchKey(row);
      const businessKey=artistBusinessMatchKey(row);
      if(emailKey&&!profileByEmail.has(emailKey)) profileByEmail.set(emailKey,row);
      if(businessKey&&!profileByBusinessName.has(businessKey)) profileByBusinessName.set(businessKey,row);
    };
    (profileRows||[]).forEach(row=>{
      rememberProfileMatch(row);
    });
    const missingEmails=hardcodedEmails.filter(e=>!profileByEmail.has(e));
    const missingBusinessNames=hardcodedBusinessNames.filter(name=>!profileByBusinessName.has(name));
    if(missingEmails.length||missingBusinessNames.length){
      try{
        const {data:directMatches,error:directMatchError}=await supabase
          .from("artist_profiles")
          .select(activeArtistProfileSelect)
          .order("business_name",{ascending:true});
        if(directMatchError){
          console.error("HARDCODED PROFILE LOOKUP ERROR:", directMatchError);
        }else{
          (directMatches||[]).forEach(row=>{
            const emailKey=artistEmailMatchKey(row);
            const businessKey=artistBusinessMatchKey(row);
            const matchesHardcodedEmail=emailKey&&hardcodedEmails.includes(emailKey);
            const matchesHardcodedBusiness=businessKey&&hardcodedBusinessNames.includes(businessKey);
            if(matchesHardcodedEmail||matchesHardcodedBusiness) rememberProfileMatch(row);
          });
        }
      }catch(err){
        console.error("HARDCODED PROFILE LOOKUP EXCEPTION:", err);
      }
    }
    const mergedProfileIds=new Set();
    fallbackArtists=fallbackArtists.map(fa=>{
      const emailKey=artistEmailMatchKey(fa);
      const businessKey=artistBusinessMatchKey(fa);
      const match=(emailKey&&profileByEmail.get(emailKey))||(businessKey&&profileByBusinessName.get(businessKey))||null;
      if(!match||!match.id) return fa;
      mergedProfileIds.add(String(match.id));
      const supabasePhotos=Array.isArray(match.portfolio_photos)?match.portfolio_photos:[];
      console.log("HARDCODED ARTIST HYDRATED FROM SUPABASE:", fa.business_name||fa.name, {profile_id:match.id, user_id:match.user_id||null});
      return {
        ...fa,
        source:"profile",
        raw_id:match.id,
        user_id:match.user_id||fa.user_id||null,
        id:`profile-${match.id}`,
        profile_photo_url:match.profile_photo_url||fa.profile_photo_url||"",
        portfolio_image:match.profile_photo_url||fa.portfolio_image||"",
        portfolio_photos:supabasePhotos.length?supabasePhotos:(fa.portfolio_photos||[]),
      };
    });
    let seedArtists=[], profileArtists=[];
    try{
      seedArtists=(seedError?[]:seedRows||[]).map(row=>normalizeDirectoryArtist(row,"seed"));
    }catch(err){
      console.error("SEED NORMALIZE ERROR:", err);
      seedArtists=[];
    }
    try{
      const artists = profileRows ?? [];
      profileArtists=(profileError?[]:artists)
        .filter(row=>!mergedProfileIds.has(String(row?.id)))
        .map(row=>normalizeDirectoryArtist(row,"profile"));
    }catch(err){
      console.error("PROFILE NORMALIZE ERROR:", err);
      profileArtists=[];
    }
    const dbArtists=[
      ...(seedArtists ?? []),
      ...(profileArtists ?? []),
    ];
    console.log("Database artists count:", dbArtists.length);
    const seenArtistKeys=new Set();
    const allArtists=[...(fallbackArtists ?? []), ...(dbArtists ?? [])].filter(artist=>{
      const emailKey=String(artist?.email||"").trim().toLowerCase();
      const businessKey=artistBusinessMatchKey(artist);
      const idKey=artist?.raw_id!==undefined&&artist?.raw_id!==null ? String(artist.raw_id) : String(artist?.id||"");
      const keys=[emailKey?`email:${emailKey}`:null, businessKey?`business:${businessKey}`:null, idKey?`id:${idKey}`:null].filter(Boolean);
      if(keys.some(key=>seenArtistKeys.has(key)))return false;
      keys.forEach(key=>seenArtistKeys.add(key));
      return true;
    });
    console.log("Final merged artist count:", allArtists.length);
    setHiddenDirectoryArtists(0);
    console.log("ARTIST DIRECTORY FETCH SUCCESS:", allArtists);
    console.log("PROFILE ARTISTS:", profileArtists);
    console.log("PROFILE COUNT:", profileArtists?.length);
    console.log("SEED ARTISTS:", seedArtists);
    console.log("SEED COUNT:", seedArtists?.length);
    console.log("COMBINED:", allArtists);
    console.log("COMBINED COUNT:", allArtists?.length);
    console.log("HARDCODED ARTISTS", fallbackArtists.length);
    console.log("DATABASE ARTISTS", dbArtists.length);
    console.log("PROFILE ARTISTS", profileArtists.length);
    console.log("SEED ARTISTS", seedArtists.length);
    console.log("ALL ARTISTS", allArtists.length);
    console.log("APPROVED ARTISTS COUNT:", allArtists.length);
    setApprovedArtists(allArtists);
  }

  function hasArtistProfileId(artist){
    if(!artist) return false;
    if(artist.source !== "profile") return false;
    const id = artist.raw_id;
    return typeof id === "string" && /^[0-9a-fA-F-]{36}$/.test(id);
  }

  function artistSaveKey(artist){
    if(!artist) return null;
    const rawIdStr=String(artist.raw_id ?? "");
    const isUuid=/^[0-9a-fA-F-]{36}$/.test(rawIdStr);
    if(isUuid) return rawIdStr;
    // Build a stable synthetic UUID for non-UUID sources (hardcoded/fallback)
    const source=(artist.source||"x").toLowerCase();
    const sourceTag=source==="fallback"?"fbac":source==="seed"?"5eed":"00ff";
    const hex=rawIdStr.replace(/[^0-9a-fA-F]/g,"")||"0";
    const padded=hex.padStart(12,"0").slice(-12);
    return `${sourceTag}0000-0000-0000-0000-${padded}`;
  }

  async function loadSavedArtists(){
    const {data:userData}=await supabase.auth.getUser().catch(err=>{ console.error("AUTH GET USER ERROR:",err); return {data:null}; });
    const authUserId=userData?.user?.id||session?.user?.id||null;
    console.log("SAVE ARTIST auth user id:", authUserId);
    if(!authUserId){ setSavedArtistIds(new Set()); return; }
    try{
      const {data,error}=await supabase.from("saved_artists").select("artist_id").eq("bride_id",authUserId);
      if(error){ console.error("LOAD SAVED ARTISTS ERROR:",error); return; }
      setSavedArtistIds(new Set((data||[]).map(r=>r.artist_id)));
    }catch(err){
      console.error("LOAD SAVED ARTISTS EXCEPTION:",err);
    }
  }

  async function toggleSaveArtist(artist){
    if(!artist) return;
    const {data:userData}=await supabase.auth.getUser().catch(err=>{ console.error("AUTH GET USER ERROR:",err); return {data:null}; });
    const authUser=userData?.user||session?.user||null;
    console.log("SAVE ARTIST auth user id:", authUser?.id ?? null);
    console.log("SAVE ARTIST eligibility:", !!authUser?"eligible (signed in)":"not signed in");
    if(!authUser){ setAuthOpen(true); return; }
    const saveKey=artistSaveKey(artist);
    if(!saveKey){
      setSavedArtistError("Could not identify this artist.");
      setTimeout(()=>setSavedArtistError(""),4000);
      return;
    }
    setSavedArtistPending(true);
    setSavedArtistError("");
    setSavedArtistMessage("");
    try{
      if(savedArtistIds.has(saveKey)){
        const {error}=await supabase.from("saved_artists").delete().eq("bride_id",authUser.id).eq("artist_id",saveKey);
        if(error) throw error;
        setSavedArtistIds(prev=>{ const next=new Set(prev); next.delete(saveKey); return next; });
        setSavedArtistMessage("Removed from your saved artists.");
      }else{
        const {error}=await supabase.from("saved_artists").insert({bride_id:authUser.id,artist_id:saveKey});
        if(error) throw error;
        setSavedArtistIds(prev=>{ const next=new Set(prev); next.add(saveKey); return next; });
        setSavedArtistMessage("Saved to your artists.");
      }
      setTimeout(()=>setSavedArtistMessage(""),3000);
    }catch(err){
      console.error("TOGGLE SAVE ARTIST ERROR:",err);
      setSavedArtistError(err?.message||"Could not update saved artists right now.");
      setTimeout(()=>setSavedArtistError(""),4000);
    }finally{
      setSavedArtistPending(false);
    }
  }

  function normalizeGalleryPhoto(photo,fallbackKey){
    if(!photo) return null;
    if(typeof photo === "string"){
      const trimmed=photo.trim();
      return trimmed?{id:fallbackKey,image_url:trimmed}:null;
    }
    const rawUrl=photo.image_url||photo.url||photo.src||"";
    const cleanUrl=typeof rawUrl==="string"?rawUrl.trim():"";
    if(!cleanUrl) return null;
    return {
      id:photo.id||fallbackKey,
      image_url:cleanUrl,
      category:photo.category||null,
      look_type:photo.look_type||null,
      hair_look:photo.hair_look||null,
      makeup_look:photo.makeup_look||null,
      is_pinned:photo.is_pinned===true,
      pin_order:typeof photo.pin_order==="number"?photo.pin_order:null,
      sort_order:typeof photo.sort_order==="number"?photo.sort_order:null,
      created_at:photo.created_at||null,
    };
  }

  function normalizeGalleryPhotos(photos,pinnedIds=[]){
    if(!Array.isArray(photos)) return [];
    return sortPinnedPortfolioPhotos(photos.map((p,i)=>normalizeGalleryPhoto(p,`local-${i}`)).filter(Boolean),pinnedIds);
  }

  async function loadArtistPortfolio(artist){
    if(!artist){ setGalleryPhotos([]); setGalleryError(""); return; }
    setGalleryError("");
    const artistType=hasArtistProfileId(artist)?"supabase":"hardcoded";
    const artistName=artist?.business_name||artist?.name||"";
    console.log("GALLERY artist name:", artistName);
    console.log("GALLERY artist type:", artistType);
    console.log("GALLERY artist id:", artist?.raw_id ?? null);
    console.log("PUBLIC PROFILE ARTIST_PROFILE_ID:", artistType==="supabase"?(artist?.raw_id??null):null);
    console.log("GALLERY artist user_id:", artist?.user_id ?? null);
    console.log("GALLERY portfolio_photos array length:", Array.isArray(artist?.portfolio_photos)?artist.portfolio_photos.length:0);
    console.log("PUBLIC ARTIST PROFILE RESOLUTION:", {
      current_user_id:session?.user?.id||null,
      current_user_email:session?.user?.email||null,
      artist_profiles_id:artist?.raw_id??null,
      route_artist_id:artist?.id??null,
      profile_user_id:artist?.user_id??null,
      portfolio_photos_length:Array.isArray(artist?.portfolio_photos)?artist.portfolio_photos.length:0,
      is_sample_artist:artist?.source==="seed"||artist?.source==="fallback"||artist?.is_sample_artist===true,
      is_published:artist?.is_published,
      is_active:artist?.is_active,
      tier:artist?.tier||null,
    });
    const galleryPinnedIds=safeArtistArray(artist?.pinned_portfolio_photo_ids);
    const hardcodedPhotos=normalizeGalleryPhotos(artist.portfolio_photos,galleryPinnedIds);
    if(artistType==="hardcoded"){
      console.log("GALLERY portfolio source used: hardcoded portfolio_photos");
      console.log("GALLERY number of photos found:", hardcodedPhotos.length);
      hardcodedPhotos.forEach((p,i)=>console.log(`GALLERY image_url[${i}]:`, p?.image_url));
      console.log("GALLERY first image_url:", hardcodedPhotos[0]?.image_url ?? null);
      setGalleryPhotos(hardcodedPhotos);
      return;
    }
    setGalleryLoading(true);
    const selectFields="id, image_url, category, look_type, hair_look, makeup_look, is_pinned, pin_order, sort_order, created_at";
    let resolvedPhotos=[];
    let sourceUsed="none";
    try{
      const {data:byArtistId,error:byArtistIdError}=await supabase
        .from("artist_portfolio_photos")
        .select(selectFields)
        .eq("artist_id",artist.raw_id)
        .order("sort_order",{ascending:true});
      if(byArtistIdError) throw byArtistIdError;
      console.log("GALLERY supabase query rows returned (artist_id):", (byArtistId||[]).length);
      const primary=normalizeGalleryPhotos(byArtistId,galleryPinnedIds);
      if(primary.length){
        resolvedPhotos=primary;
        sourceUsed="supabase artist_portfolio_photos by artist_id";
      }
      if(!resolvedPhotos.length && hardcodedPhotos.length){
        resolvedPhotos=hardcodedPhotos;
        sourceUsed="artist_profiles.portfolio_photos";
      }
      console.log("GALLERY portfolio source used:", sourceUsed);
      console.log("GALLERY number of photos found:", resolvedPhotos.length);
      resolvedPhotos.forEach((p,i)=>console.log(`GALLERY image_url[${i}]:`, p?.image_url));
      console.log("GALLERY first image_url:", resolvedPhotos[0]?.image_url ?? null);
      if(resolvedPhotos.length===0){
        console.log("GALLERY ZERO PHOTOS DIAGNOSTIC:", {
          artist_name: artistName,
          artist_id: artist?.raw_id ?? null,
          user_id: artist?.user_id ?? null,
          photo_rows_returned: 0,
          first_image_url: null,
        });
      }
      setGalleryPhotos(resolvedPhotos);
    }catch(err){
      console.error("LOAD ARTIST GALLERY ERROR:",err);
      setGalleryError("Could not load the portfolio gallery right now.");
      console.log("GALLERY portfolio source used: error fallback to hardcoded");
      console.log("GALLERY number of photos found:", hardcodedPhotos.length);
      console.log("GALLERY first image_url:", hardcodedPhotos[0]?.image_url ?? null);
      setGalleryPhotos(hardcodedPhotos);
    }finally{
      setGalleryLoading(false);
    }
  }

  async function shareArtist(artist){
    if(!artist) return;
    try{
      const displayName=artist?.business_name||artist?.name||"a bridal artist";
      const city=artist?.city||"";
      const aesthetic=artist?.aesthetic||"";
      const location=[city,artistRegion(artist),artist?.country].filter(Boolean).join(", ");
      const lines=[`Check out ${displayName} on The Bridal Edit™`];
      if(location) lines.push(location);
      if(aesthetic) lines.push(aesthetic);
      const payload={title:displayName,text:lines.join(" — "),dialogTitle:"Share artist"};
      if(hasArtistProfileId(artist)){
        payload.url=`https://thebridaledit.com/artist/${artist.raw_id}`;
      }
      await Share.share(payload);
    }catch(err){
      console.error("SHARE ARTIST ERROR:",err);
    }
  }

  useEffect(()=>{
    if(DISABLE_RECENT_STARTUP_FEATURES){
      console.log("ARTIST PROFILE FETCH START");
      setApprovedArtists([]);
      return;
    }
    loadApprovedArtists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{
    if(screen==="directory")loadApprovedArtists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[screen]);

  useEffect(()=>{
    clearCachedProfilePhotos(session?.user?.id);
    loadSavedArtists();
    loadCurrentPhotos();
    loadInspoPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[session?.user?.id]);

  useEffect(()=>{
    if(selectedArtist) loadArtistPortfolio(selectedArtist);
    else { setGalleryPhotos([]); setGalleryError(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selectedArtist?.id]);

  const allArtists=approvedArtists ?? [];
  const filteredArtists = (allArtists ?? []).filter(a=>{
    return !directoryFilterReason(a);
  }).sort((a,b)=>{
    const visibilityBoost=(artist)=>(artist?.is_featured===true?2:0)+(artist?.tier==="upgraded"||artist?.has_upgraded_profile===true?1:0);
    if(result){
      const fitA=artistFit(a,result), fitB=artistFit(b,result);
      if(fitA!==fitB)return fitB-fitA;
      const boostDiff=visibilityBoost(b)-visibilityBoost(a);
      if(boostDiff!==0)return boostDiff;
      return (b.rating||0)-(a.rating||0);
    }
    const ratingA=Number(a.rating)||0, ratingB=Number(b.rating)||0;
    const boostDiff=visibilityBoost(b)-visibilityBoost(a);
    if(boostDiff!==0)return boostDiff;
    if(ratingA!==ratingB)return ratingB-ratingA;
    return String(a.business_name||a.name||"").localeCompare(String(b.business_name||b.name||""));
  });

  useEffect(()=>{
    if(screen==="directory"&&!selectedArtist){
      const currentProfileId=myArtistProfile?.id?String(myArtistProfile.id):null;
      const currentUserId=session?.user?.id||null;
      const currentDirectoryArtist=(approvedArtists||[]).find(artist=>
        (currentProfileId&&String(artist?.raw_id)===currentProfileId)||
        (currentUserId&&String(artist?.user_id||"")===currentUserId)
      );
      const currentFilteredArtist=currentDirectoryArtist ? filteredArtists.find(artist=>artist.id===currentDirectoryArtist.id) : null;
      console.log("ARTIST DIRECTORY VIEW RENDERED");
      console.log("ARTIST DIRECTORY ARTIST COUNT:", filteredArtists.length);
      console.log("ARTIST DIRECTORY FINAL ARRAY LENGTHS:", {
        merged:approvedArtists.length,
        filtered:filteredArtists.length,
      });
      console.log("CURRENT ARTIST DIRECTORY FILTER DEBUG:", {
        current_user_id:currentUserId,
        current_user_email:session?.user?.email||null,
        artist_profiles_id:currentProfileId,
        user_id:myArtistProfile?.user_id||null,
        business_name:myArtistProfile?.business_name||null,
        approval_status:myArtistProfile?.approval_status||myArtistProfile?.application_status||(myArtistProfile?"approved_profile_exists":artistApplicationStatus||null),
        visibility_status:myArtistProfile?.is_published===true&&myArtistProfile?.is_active===true?"visible":"hidden",
        directory_listing_status:myArtistProfile?.is_published===true&&myArtistProfile?.is_active===true?"listed":"not_listed",
        is_published:myArtistProfile?.is_published,
        is_active:myArtistProfile?.is_active,
        tier:myArtistProfile?.tier||null,
        services:myArtistProfile?.services||null,
        country:myArtistProfile?.country||null,
        region_state:artistRegion(myArtistProfile),
        present_after_merge:!!currentDirectoryArtist,
        present_after_filters:!!currentFilteredArtist,
        filtered_out_reason:currentDirectoryArtist&&!currentFilteredArtist?directoryFilterReason(currentDirectoryArtist):"",
      });
    }
  },[screen,selectedArtist,approvedArtists,filteredArtists.length,myArtistProfile,session?.user?.id,session?.user?.email,artistApplicationStatus,dirCountry,dirState,dirService,dirTravel,dirSearch]);

  // ── RESOLVED ACCOUNT ─────────────────────────────────────────────────
  // Single source of truth for all role/account routing decisions. Every
  // bride-vs-artist branch in the app should read from `resolvedAccount`.
  const hasArtistApplication = !!(artistApplication && (artistApplicationStatus === "pending" || artistApplicationStatus === "approved" || artistApplicationStatus === "rejected"));
  const hasArtistProfileRow = !!myArtistProfile;
  // Core role detection. Admin is a combined superset role: it gets bride
  // routes + artist routes + admin routes. The `viewMode` toggle changes
  // preview context only; it must never reduce admin permissions to one user
  // type.
  const isAdminRole = isAdmin === true || userRole === "admin";
  const isArtistAccount = userRole === "artist" || artistApplicationStatus === "approved" || hasArtistProfileRow;
  const isBrideAccount = !isArtistAccount && !isAdminRole;
  // Effective view for admins. Non-admins are always pinned to their own
  // role; the viewMode state is ignored for them.
  const effectiveView = isAdminRole
    ? (viewMode === "bride" || viewMode === "artist" || viewMode === "admin" ? viewMode : "admin")
    : (isArtistAccount ? "artist" : "bride");
  // Unified permission flags. Use these (NOT raw role checks) anywhere we
  // gate features in the UI. Admins always pass bride/artist checks; the
  // viewMode only affects what shell/dashboard they are *currently*
  // viewing, not what they are allowed to access. Pure brides and pure
  // artists remain mutually exclusive.
  const canAccessBrideFeatures = isAdminRole || isBrideAccount;
  const canAccessArtistFeatures = isAdminRole || isArtistAccount;
  const canAccessAdminFeatures = isAdminRole;
  const resolvedAccount = {
    email: session?.user?.email || null,
    user_id: session?.user?.id || null,
    role: userRole || null,
    artist_application_status: artistApplicationStatus || null,
    artistProfileExists: hasArtistProfileRow,
    isArtist: canAccessArtistFeatures,
    isApprovedArtist: artistApplicationStatus === "approved" || hasArtistProfileRow || isAdminRole,
    isAdmin: isAdminRole,
    isBride: canAccessBrideFeatures,
    canAccessBrideFeatures,
    canAccessArtistFeatures,
    canAccessAdminFeatures,
    viewMode: effectiveView,
  };
  const safePortfolioPhotos = portfolioPhotos ?? [];
  const isArtist = resolvedAccount?.isArtist;
  const isUpgraded = isArtistProProfile(myArtistProfile);
  const hasUpgradedProfile = isUpgraded;
  const artistPortfolioMax=artistPortfolioLimit(myArtistProfile);
  const resolvedArtistPortfolioPhotos=safePortfolioPhotos.length
    ? safePortfolioPhotos
    : (Array.isArray(myArtistProfile?.portfolio_photos)?myArtistProfile.portfolio_photos:[]);
  const artistPortfolioCount=resolvedArtistPortfolioPhotos.length;
  const artistFeaturedServices=safeArtistArray(myArtistProfile?.featured_services);
  const isArtistApproved = resolvedAccount?.isApprovedArtist;
  const isArtistPending = artistApplicationStatus === "pending";
  const isArtistRejected = artistApplicationStatus === "rejected";

  // Single render-time log so every render publishes the resolved account
  // state (per requirements). Selected routing decisions are appended below.
  const resolvedCheckoutFunction = resolvedAccount?.isArtist ? "create-artist-checkout-session" : "super-handler";
  const resolvedProfileRoute = resolvedAccount?.isArtist ? "artistDashboard" : "profile";
  console.log("RESOLVED ACCOUNT:", {
    email: resolvedAccount?.email,
    user_id: resolvedAccount?.user_id,
    "profiles.role": resolvedAccount?.role,
    artist_application_status: resolvedAccount?.artist_application_status,
    artistProfileExists: resolvedAccount?.artistProfileExists,
    isArtist: resolvedAccount?.isArtist,
    isApprovedArtist: resolvedAccount?.isApprovedArtist,
    isAdmin: resolvedAccount?.isAdmin,
    checkout_function_selected: resolvedCheckoutFunction,
    profile_route_selected: resolvedProfileRoute,
  });
  // Dashboard reads profile details ONLY from artist_profiles — no
  // application status, no separate portfolio table, no profiles/bride_profiles.
  const myArtistPortfolioPhotos = resolvedArtistPortfolioPhotos;
  const dashboardCompleteness = artistProfileCompleteness(myArtistProfile||{}, myArtistPortfolioPhotos, false);
  const dashboardMissingFields = dashboardCompleteness.missingFields;
  const profileCompleteness = [
    {label:"Display name added",complete:!dashboardMissingFields.includes("display name")},
    {label:"Profile photo added",complete:!dashboardMissingFields.includes("profile photo")},
    {label:"At least 3 portfolio photos",complete:!dashboardMissingFields.includes("at least 3 portfolio photos")},
    {label:"Location added",complete:!dashboardMissingFields.includes("location")},
    {label:"Country added",complete:!dashboardMissingFields.includes("country")},
    {label:"Bio/about section added",complete:!dashboardMissingFields.includes("bio/about section")},
    {label:"Specialty/service added",complete:!dashboardMissingFields.includes("specialty/service")},
  ];

  async function openBrideCheckout(activeSession=session){
    if(isNativeIOSApp()){
      // App Store 3.1.1: no external (Stripe) checkout on native iOS — the
      // PremiumModal renders the RevenueCat in-app purchase screen instead.
      setCheckoutError("");
      setPremiumFeature("bride");
      setPremiumOpen(true);
      return;
    }
    // When wired directly to a button's onClick React passes the SyntheticEvent
    // as the first arg, which would shadow the default `session`. Only honor
    // `activeSession` if it looks like a real Supabase session; otherwise fetch
    // a fresh one (mirrors the artist checkout pattern).
    const passedSession = activeSession && typeof activeSession === "object" && activeSession.access_token ? activeSession : null;
    const {data:sessionResult} = await supabase.auth.getSession();
    const currentSession = sessionResult?.session || passedSession || session;
    if(!currentSession?.user){
      setCheckoutAfterAuth(true);
      setPremiumOpen(false);
      setAuthMode("login");
      setAuthOpen(true);
      return;
    }

    setCheckoutLoading(true);
    setCheckoutError("");

    try{
      const {data,error}=await supabase.functions.invoke("super-handler",{
        body:{
          user_id: currentSession.user.id,
          email: currentSession.user.email,
          type: "bride_premium_checkout",
          account_type:"bride"
        },
        headers:{
          Authorization:`Bearer ${currentSession.access_token}`
        }
      });
      if(error)throw error;
      const checkoutURL = data?.url;
      if(!checkoutURL)throw new Error("Bride checkout response did not include a URL.");
      // WKWebView silently drops window.open(_,"_blank",...) with no popup
      // handler configured; use the Capacitor Browser plugin
      // (SFSafariViewController on iOS) and fall back to a same-window
      // navigation if it ever throws.
      try{
        await Browser.open({url:checkoutURL,presentationStyle:"fullscreen"});
      }catch(openError){
        console.error("Failed to open bride checkout URL", openError);
        window.location.href = checkoutURL;
      }
    }catch(err){
      console.error("Bride checkout error:", err);
      setCheckoutError("We couldn't open Premium membership right now. Please try again in a moment.");
      setPremiumOpen(true);
    }finally{
      setCheckoutLoading(false);
    }
  }

  async function openArtistCheckout(activeSession=session){
    if(isNativeIOSApp()){
      // App Store 3.1.1: no external (Stripe) checkout on native iOS — the
      // PremiumModal renders the RevenueCat in-app purchase screen instead.
      setCheckoutError("");
      setPremiumFeature("artist");
      setPremiumOpen(true);
      return;
    }
    const {data:sessionResult,error:sessionError}=await supabase.auth.getSession();
    const currentSession = sessionResult?.session || activeSession || session;
    console.log("NEW ARTIST UPGRADE BUTTON CLICKED");
    console.log("selected function: create-artist-checkout-session");
    console.log("current user id:", currentSession?.user?.id || "signed out");
    console.log("current email:", currentSession?.user?.email || "missing");

    if(sessionError || !currentSession?.user || !currentSession?.access_token){
      console.error("Artist upgrade auth session missing:", sessionError || {hasUser:!!currentSession?.user,hasAccessToken:!!currentSession?.access_token});
      setCheckoutError("Please sign in again");
      setPremiumOpen(true);
      return;
    }

    setCheckoutLoading(true);
    setCheckoutError("");

    try{
      const {data,error}=await supabase.functions.invoke("create-artist-checkout-session",{
        body:{
          user_id: currentSession.user.id,
          email: currentSession.user.email,
          type:"artist_checkout",
          account_type:"artist"
        },
        headers:{
          Authorization:`Bearer ${currentSession.access_token}`
        }
      });
      if(error)throw error;
      const checkoutURL = data?.url;
      console.log("returned URL:", checkoutURL || null);
      if(!checkoutURL)throw new Error("Artist checkout response did not include a URL.");
      window.open(checkoutURL,"_blank","noopener,noreferrer");
    }catch(err){
      console.error("Artist upgrade full error:", err);
      setCheckoutError("We couldn't open artist checkout right now. Please try again in a moment.");
      setPremiumOpen(true);
    }finally{
      setCheckoutLoading(false);
    }
  }

  function handleBrideUpgradeMembership(){
    openBrideCheckout();
  }

  function ArtistUpgradeButton({variant="account"}){
    if(!resolvedAccount || !resolvedAccount?.canAccessArtistFeatures)return null;
    const isDashboard = variant === "dashboard";
    if(hasUpgradedProfile){
      const labelColor = isDashboard ? C.teal : C.lavender;
      const itemColor = isDashboard ? C.black : "rgba(255,255,255,0.86)";
      return (
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          <p style={{fontFamily:ag,fontSize:10,letterSpacing:"0.16em",textTransform:"uppercase",color:labelColor,margin:"0 0 0.35rem"}}>Premium Artist Active</p>
          <p style={{fontFamily:co,fontSize:13,color:itemColor,margin:0,lineHeight:1.6}}>Featured placement enabled</p>
          <p style={{fontFamily:co,fontSize:13,color:itemColor,margin:0,lineHeight:1.6}}>Portfolio limit: 50</p>
          <p style={{fontFamily:co,fontSize:13,color:itemColor,margin:0,lineHeight:1.6}}>Pinned portfolio slots active</p>
          <p style={{fontFamily:co,fontSize:13,color:itemColor,margin:0,lineHeight:1.6}}>Enhanced analytics enabled</p>
        </div>
      );
    }
    const legalColor = isDashboard ? C.gray : "rgba(255,255,255,0.72)";
    return (
      <div style={{display:"grid",gap:8}}>
        <div style={{border:`0.5px solid ${isDashboard?C.border:"rgba(214,202,221,0.45)"}`,padding:"0.9rem",background:isDashboard?C.white:"rgba(255,255,255,0.04)"}}>
          <p style={{fontFamily:ve,fontSize:17,letterSpacing:"0.08em",margin:"0 0 0.35rem",color:isDashboard?C.black:C.white,lineHeight:1.25}}>The Bridal Edit™ Artist Premium</p>
          <p style={{fontFamily:co,fontStyle:"italic",fontSize:20,margin:"0 0 0.35rem",color:isDashboard?C.black:C.white,lineHeight:1.15}}>$29/month</p>
          <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:legalColor,margin:0}}>1 month</p>
        </div>
        <button onClick={openArtistCheckout} disabled={checkoutLoading} style={isDashboard?{background:C.black,color:C.white,border:"none",padding:"11px 18px",fontSize:10,letterSpacing:"0.16em",cursor:checkoutLoading?"wait":"pointer",fontFamily:ag,textTransform:"uppercase",opacity:checkoutLoading?0.55:1}:{width:"100%",height:50,background:"rgba(255,255,255,0.06)",border:"0.5px solid rgba(214,202,221,0.6)",borderRadius:16,color:C.white,cursor:checkoutLoading?"wait":"pointer",fontFamily:ag,fontSize:10,letterSpacing:"0.18em",textTransform:"uppercase",padding:"0 22px",textAlign:"center",opacity:checkoutLoading?0.65:1}}>
          {checkoutLoading?"Opening...":"Upgrade Artist Profile"}
        </button>
        <LegalLinks color={legalColor}/>
      </div>
    );
  }

  function ArtistProLockedCard({title,body}){
    if(isUpgraded)return null;
    return (
      <div style={{border:`0.5px solid ${C.border}`,padding:"1rem",background:C.iceBlue,minWidth:0,overflowX:"hidden"}}>
        <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.16em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.45rem"}}>{title}</p>
        <p style={{fontFamily:co,fontSize:13,fontStyle:"italic",color:C.gray,lineHeight:1.55,margin:"0 0 0.8rem"}}>{body}</p>
        <ArtistUpgradeButton variant="dashboard"/>
      </div>
    );
  }

  function renderPortfolioPhotoTagCard(photo,scope="artist"){
    const tagForm=portfolioTagForms[photo.id]||buildPortfolioTagForm(photo);
    const selectedTags=portfolioTagsFromForm(photo.id,photo);
    const savedTags=Array.isArray(photo.tags)?photo.tags:[];
    const isSaving=portfolioSavingId===photo.id;
    const isArtistUpgraded=isArtistProProfile(myArtistProfile);
    const pinnedCount=(portfolioPhotos||[]).filter(item=>item.is_pinned===true).length;
    const isPinned=photo.is_pinned===true;
    const pinLimitReached=!isPinned&&pinnedCount>=3;
    return (
      <div key={photo.id} style={{background:C.white,border:`0.5px solid ${C.border}`,padding:10,minWidth:0,width:"100%",maxWidth:"100%",boxSizing:"border-box",overflowX:"hidden"}}>
        <div style={{position:"relative",width:"100%",aspectRatio:"1 / 1",background:C.iceBlue,border:`0.5px solid ${C.border}`,overflow:"hidden"}}>
          <SafeImage src={photo.image_url} alt="" loadingLabel="Loading" fallback={<ImagePlaceholder label="Photo unavailable"/>}/>
          {scope==="artist"&&<button onClick={()=>deletePortfolioPhoto(photo)} aria-label="Delete photo" style={{position:"absolute",top:4,right:4,background:"rgba(0,0,0,0.6)",color:C.white,border:"none",padding:"2px 6px",fontSize:10,fontFamily:ag,letterSpacing:"0.08em",cursor:"pointer"}}>×</button>}
          {isPinned&&<span style={{position:"absolute",left:6,top:6,background:C.black,color:C.white,padding:"3px 8px",fontFamily:ag,fontSize:8,letterSpacing:"0.12em",textTransform:"uppercase"}}>Pinned {photo.pin_order||""}</span>}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:10,minWidth:0}}>
          {scope==="artist"&&isArtistUpgraded&&(
            <button
              type="button"
              onClick={()=>togglePortfolioPhotoPin(photo)}
              disabled={isSaving||pinLimitReached}
              title={pinLimitReached?"You can pin up to 3 photos.":isPinned?"Unpin this photo":"Pin this photo to the top"}
              style={{background:isPinned?"transparent":C.black,color:isPinned?C.black:C.white,border:isPinned?`0.5px solid ${C.black}`:"none",padding:"9px 12px",fontSize:9,fontFamily:ag,letterSpacing:"0.12em",textTransform:"uppercase",cursor:isSaving||pinLimitReached?"default":"pointer",opacity:isSaving||pinLimitReached?0.45:1}}
            >
              {isPinned?"Pinned · Unpin":"Pin to top"}
            </button>
          )}
          <div>
            <label style={{fontFamily:ag,fontSize:8,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray,display:"block",marginBottom:4}}>Category</label>
            <select value={tagForm.category} onChange={e=>updatePortfolioTagForm(photo.id,"category",e.target.value)} disabled={isSaving} style={{width:"100%",maxWidth:"100%",border:`0.5px solid ${C.border}`,padding:"8px 9px",fontSize:16,fontFamily:co,boxSizing:"border-box",background:C.white}}>
              <option value="">Select category</option>
              {PORTFOLIO_CATEGORY_OPTIONS.map(option=><option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          {tagForm.category==="hair"&&(
            <div>
              <label style={{fontFamily:ag,fontSize:8,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray,display:"block",marginBottom:4}}>Look Type</label>
              <select value={tagForm.look_type} onChange={e=>updatePortfolioTagForm(photo.id,"look_type",e.target.value)} disabled={isSaving} style={{width:"100%",maxWidth:"100%",border:`0.5px solid ${C.border}`,padding:"8px 9px",fontSize:16,fontFamily:co,boxSizing:"border-box",background:C.white}}>
                <option value="">Select look type</option>
                {PORTFOLIO_HAIR_LOOK_OPTIONS.map(option=><option key={option} value={option}>{option}</option>)}
              </select>
            </div>
          )}
          {tagForm.category==="makeup"&&(
            <div>
              <label style={{fontFamily:ag,fontSize:8,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray,display:"block",marginBottom:4}}>Look Type</label>
              <select value={tagForm.look_type} onChange={e=>updatePortfolioTagForm(photo.id,"look_type",e.target.value)} disabled={isSaving} style={{width:"100%",maxWidth:"100%",border:`0.5px solid ${C.border}`,padding:"8px 9px",fontSize:16,fontFamily:co,boxSizing:"border-box",background:C.white}}>
                <option value="">Select look type</option>
                {PORTFOLIO_MAKEUP_LOOK_OPTIONS.map(option=><option key={option} value={option}>{option}</option>)}
              </select>
            </div>
          )}
          {tagForm.category==="full_look"&&(
            <>
              <div>
                <label style={{fontFamily:ag,fontSize:8,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray,display:"block",marginBottom:4}}>Hair Look</label>
                <select value={tagForm.hair_look||""} onChange={e=>updatePortfolioTagForm(photo.id,"hair_look",e.target.value)} disabled={isSaving} style={{width:"100%",maxWidth:"100%",border:`0.5px solid ${C.border}`,padding:"8px 9px",fontSize:16,fontFamily:co,boxSizing:"border-box",background:C.white}}>
                  <option value="">Select hair look</option>
                  {PORTFOLIO_HAIR_LOOK_OPTIONS.map(option=><option key={option} value={option}>{option}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontFamily:ag,fontSize:8,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray,display:"block",marginBottom:4}}>Makeup Look</label>
                <select value={tagForm.makeup_look||""} onChange={e=>updatePortfolioTagForm(photo.id,"makeup_look",e.target.value)} disabled={isSaving} style={{width:"100%",maxWidth:"100%",border:`0.5px solid ${C.border}`,padding:"8px 9px",fontSize:16,fontFamily:co,boxSizing:"border-box",background:C.white}}>
                  <option value="">Select makeup look</option>
                  {PORTFOLIO_MAKEUP_LOOK_OPTIONS.map(option=><option key={option} value={option}>{option}</option>)}
                </select>
              </div>
            </>
          )}
          <div>
            <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray,margin:"0 0 5px"}}>Tags</p>
            <div style={{display:"flex",flexDirection:"column",gap:7,minWidth:0}}>
              {PORTFOLIO_TAG_GROUPS.map(([group,tags])=>(
                <div key={group} style={{minWidth:0}}>
                  <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.1em",textTransform:"uppercase",color:C.gray,margin:"0 0 4px"}}>{group}</p>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4,minWidth:0}}>
                    {tags.map(tag=>{
                      const selected=selectedTags.includes(tag);
                      return <button key={tag} type="button" onClick={()=>togglePortfolioTag(photo,tag)} disabled={isSaving} style={{background:selected?C.black:C.iceBlue,color:selected?C.white:C.black,border:`0.5px solid ${selected?C.black:C.border}`,padding:"3px 7px",fontFamily:ag,fontSize:8,letterSpacing:"0.06em",cursor:isSaving?"wait":"pointer",maxWidth:"100%",wordBreak:"break-word"}}>{tag}</button>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {photo.category==="full_look"&&(photo.hair_look||photo.makeup_look)&&(
            <div>
              <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray,margin:"0 0 4px"}}>Full Look Details</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:4,minWidth:0}}>
                {photo.hair_look&&<span style={{background:C.iceBlue,border:`0.5px solid ${C.border}`,padding:"2px 7px",fontFamily:co,fontSize:12,wordBreak:"break-word"}}>Hair: {photo.hair_look}</span>}
                {photo.makeup_look&&<span style={{background:C.iceBlue,border:`0.5px solid ${C.border}`,padding:"2px 7px",fontFamily:co,fontSize:12,wordBreak:"break-word"}}>Makeup: {photo.makeup_look}</span>}
              </div>
            </div>
          )}
          <div>
            <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray,margin:"0 0 4px"}}>Current Tags</p>
            {savedTags.length?(
              <div style={{display:"flex",flexWrap:"wrap",gap:4,minWidth:0}}>
                {savedTags.map(tag=><span key={tag} style={{background:C.iceBlue,border:`0.5px solid ${C.border}`,padding:"2px 7px",fontFamily:co,fontSize:12,wordBreak:"break-word"}}>{tag}</span>)}
              </div>
            ):(
              <p style={{fontFamily:co,fontSize:12,fontStyle:"italic",color:C.gray,margin:0}}>No tags yet.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  function portfolioPhotoMatchesFilter(photo,filter){
    if(filter==="untagged")return !(Array.isArray(photo.tags)&&photo.tags.length>0)&&!photo.category&&!photo.look_type&&!photo.hair_look&&!photo.makeup_look;
    if(filter==="hair")return photo.category==="hair";
    if(filter==="makeup")return photo.category==="makeup";
    if(filter==="full_look")return photo.category==="full_look";
    return true;
  }

  function renderPortfolioTagWorkflow({photos,scope,loading=false,error="",emptyText="No uploaded portfolio photos found."}){
    const filter=scope==="admin"?adminPortfolioFilter:artistPortfolioFilter;
    const setFilter=scope==="admin"?setAdminPortfolioFilter:setArtistPortfolioFilter;
    const activeIndex=scope==="admin"?adminPortfolioIndex:artistPortfolioIndex;
    const setActiveIndex=scope==="admin"?setAdminPortfolioIndex:setArtistPortfolioIndex;
    const filteredPhotos=(photos||[]).filter(photo=>portfolioPhotoMatchesFilter(photo,filter));
    const safeIndex=Math.min(Math.max(activeIndex,0),Math.max(filteredPhotos.length-1,0));
    const activePhoto=filteredPhotos[safeIndex];
    const thumbsOpen=!!portfolioThumbsOpen[scope];
    const isSaving=activePhoto&&portfolioSavingId===activePhoto.id;

    async function moveTo(nextIndex){
      if(!activePhoto)return;
      const saved=await savePortfolioPhotoTags(activePhoto,scope);
      if(saved)setActiveIndex(Math.min(Math.max(nextIndex,0),Math.max(filteredPhotos.length-1,0)));
    }

    if(loading)return <p style={{fontFamily:co,fontStyle:"italic",color:C.gray}}>Loading portfolio photos...</p>;
    if(error)return <p style={{fontFamily:co,fontSize:13,color:"#cc4444",lineHeight:1.5,margin:"0 0 0.75rem"}}>{error}</p>;
    if(!photos?.length)return <p style={{fontFamily:co,fontStyle:"italic",color:C.gray}}>{emptyText}</p>;

    return (
      <div style={{width:"100%",maxWidth:"100%",minWidth:0,overflowX:"hidden",boxSizing:"border-box"}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",margin:"0 0 0.85rem",maxWidth:"100%"}}>
          {[["all","All photos"],["untagged","Untagged only"],["hair","Hair"],["makeup","Makeup"],["full_look","Full look"]].map(([value,label])=>(
            <button key={value} type="button" onClick={()=>{setFilter(value);setActiveIndex(0);}} style={{background:filter===value?C.black:C.white,color:filter===value?C.white:C.black,border:`0.5px solid ${filter===value?C.black:C.border}`,padding:"9px 12px",fontSize:9,fontFamily:ag,letterSpacing:"0.1em",textTransform:"uppercase",cursor:"pointer",minHeight:38}}>{label}</button>
          ))}
        </div>
        {filteredPhotos.length===0?(
          <p style={{fontFamily:co,fontStyle:"italic",color:C.gray}}>No photos match this filter.</p>
        ):(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:"0.75rem"}}>
              <p style={{fontFamily:ag,fontSize:10,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,margin:0}}>Photo {safeIndex+1} of {filteredPhotos.length}</p>
              <span style={{fontFamily:ag,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",background:(Array.isArray(activePhoto.tags)&&activePhoto.tags.length>0)||activePhoto.category||activePhoto.look_type||activePhoto.hair_look||activePhoto.makeup_look?`${C.teal}18`:C.iceBlue,color:(Array.isArray(activePhoto.tags)&&activePhoto.tags.length>0)||activePhoto.category||activePhoto.look_type||activePhoto.hair_look||activePhoto.makeup_look?C.teal:C.gray,border:`0.5px solid ${C.border}`,padding:"4px 8px"}}>{(Array.isArray(activePhoto.tags)&&activePhoto.tags.length>0)||activePhoto.category||activePhoto.look_type||activePhoto.hair_look||activePhoto.makeup_look?"Tagged":"Untagged"}</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr)",gap:12}}>
              {renderPortfolioPhotoTagCard(activePhoto,scope)}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(130px,100%),1fr))",gap:8,marginTop:12,width:"100%",maxWidth:"100%",minWidth:0}}>
              <button type="button" onClick={()=>moveTo(safeIndex-1)} disabled={safeIndex===0||isSaving} style={{background:C.white,color:C.black,border:`0.5px solid ${C.black}`,padding:"12px",fontSize:10,fontFamily:ag,letterSpacing:"0.14em",textTransform:"uppercase",cursor:safeIndex===0||isSaving?"default":"pointer",opacity:safeIndex===0||isSaving?0.45:1,minHeight:44}}>Previous</button>
              <button type="button" onClick={()=>moveTo(safeIndex+1)} disabled={safeIndex>=filteredPhotos.length-1||isSaving} style={{background:C.white,color:C.black,border:`0.5px solid ${C.black}`,padding:"12px",fontSize:10,fontFamily:ag,letterSpacing:"0.14em",textTransform:"uppercase",cursor:safeIndex>=filteredPhotos.length-1||isSaving?"default":"pointer",opacity:safeIndex>=filteredPhotos.length-1||isSaving?0.45:1,minHeight:44}}>Next</button>
              <button type="button" onClick={()=>savePortfolioPhotoTags(activePhoto,scope)} disabled={isSaving} style={{background:isSaving?C.gray:C.black,color:C.white,border:"none",padding:"12px",fontSize:10,fontFamily:ag,letterSpacing:"0.14em",textTransform:"uppercase",cursor:isSaving?"wait":"pointer",minHeight:44}}>{isSaving?"Saving...":"Save"}</button>
              <button type="button" onClick={()=>moveTo(safeIndex+1)} disabled={safeIndex>=filteredPhotos.length-1||isSaving} style={{background:isSaving?C.gray:C.teal,color:C.white,border:"none",padding:"12px",fontSize:10,fontFamily:ag,letterSpacing:"0.14em",textTransform:"uppercase",cursor:safeIndex>=filteredPhotos.length-1||isSaving?"default":"pointer",opacity:safeIndex>=filteredPhotos.length-1||isSaving?0.45:1,minHeight:44}}>Save & Next</button>
              <button type="button" onClick={()=>removePortfolioTags(activePhoto)} disabled={isSaving||portfolioTagsFromForm(activePhoto.id,activePhoto).length===0} style={{background:"transparent",color:C.gray,border:`0.5px solid ${C.border}`,padding:"12px",fontSize:10,fontFamily:ag,letterSpacing:"0.14em",textTransform:"uppercase",cursor:isSaving||portfolioTagsFromForm(activePhoto.id,activePhoto).length===0?"default":"pointer",opacity:isSaving||portfolioTagsFromForm(activePhoto.id,activePhoto).length===0?0.45:1,minHeight:44}}>Remove Tags</button>
            </div>
            <button type="button" onClick={()=>setPortfolioThumbsOpen(prev=>({...prev,[scope]:!thumbsOpen}))} style={{marginTop:12,background:"transparent",border:"none",fontFamily:co,fontSize:13,fontStyle:"italic",color:C.gray,cursor:"pointer",padding:"8px 0"}}>{thumbsOpen?"Hide thumbnail strip":"Show thumbnail strip"}</button>
            {thumbsOpen&&(
              <div style={{display:"flex",gap:6,overflowX:"auto",maxWidth:"100%",paddingBottom:4}}>
                {filteredPhotos.map((photo,index)=>(
                  <button key={photo.id} type="button" onClick={()=>setActiveIndex(index)} style={{border:`2px solid ${index===safeIndex?C.black:C.border}`,padding:0,width:54,height:54,flex:"0 0 auto",background:C.iceBlue,cursor:"pointer",overflow:"hidden"}}>
                    <SafeImage src={photo.image_url} alt="" loadingLabel="" fallback={<ImagePlaceholder label=""/>}/>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  const artistListingPublished = myArtistProfile?.is_published===true&&myArtistProfile?.is_active===true;
  const artistDirectoryVisible = dashboardCompleteness.isVisible;
  // Profile status is derived from the artist_profiles row only — having a
  // row means the artist is approved; the published/active columns describe
  // whether they're live in the directory.
  const artistStatusLabel = hasArtistProfileRow
    ? (myArtistProfile?.is_published===true && myArtistProfile?.is_active===true ? "Approved" : "Approved — not published")
    : "No artist profile";
  const artistTierLabel = hasUpgradedProfile ? "Upgraded" : "Free";
  const dashboardData = {
    status:artistStatusLabel,
    tier:artistTierLabel,
    portfolio_photo_count:myArtistPortfolioPhotos.length,
    directory_visible:artistDirectoryVisible,
  };

  useEffect(()=>{
    if(screen==="artistDashboard"){
      console.log("ARTIST DASHBOARD RENDERED");
      console.log("ARTIST DASHBOARD SCREEN WIDTH:", window.innerWidth);
      console.log("ARTIST DASHBOARD DATA:", dashboardData);
      console.log("ARTIST DASHBOARD ARTIST_PROFILE_ID:", myArtistProfile?.id||null);
      console.log("PROFILE COMPLETENESS:", profileCompleteness);
      console.log("PROFILE COMPLETENESS CHECK");
      console.log("MISSING PROFILE FIELDS:", dashboardMissingFields);
      console.log("DIRECTORY VISIBILITY:", artistDirectoryVisible);
      console.log("ARTIST DIRECTORY VISIBILITY:", artistDirectoryVisible);
    }
  },[screen,dashboardData,myArtistProfile?.id,profileCompleteness,dashboardMissingFields,artistDirectoryVisible]);

  function goToScreen(nextScreen){
    const premiumScreens = {
      chat: "",
      timeline: "Your personalized beauty timeline is included with Premium.",
    };
    if(nextScreen==="signout"){
      setNavMenuOpen(false);
      (async()=>{
        try{
          await supabase.auth.signOut();
          await refreshAuthState();
        }catch(err){
          console.error("SIGN OUT ERROR:", err);
        }
        setScreen("home");
      })();
      return;
    }
    // Results gate: protected features require an account. Unauthenticated
    // users are routed to the auth gate and returned here after they sign in.
    if(!session?.user && !PUBLIC_SCREENS.has(nextScreen)){
      setGateReturnTo(nextScreen);
      setScreen("authGate");
      setNavMenuOpen(false);
      return;
    }
    // Bride-only screens require bride access. Admins always pass this
    // check (they can access ALL bride features) regardless of viewMode.
    // Pure artists are redirected to the artist dashboard. Messages (chat)
    // is intentionally NOT in this list — artists also have a Messages
    // surface so the chat screen is shared.
    const brideOnlyScreens = new Set(["quiz","bridalDirection","timeline","products","profile"]);
    if(brideOnlyScreens.has(nextScreen) && !canAccessBrideFeatures){
      console.warn("BRIDE-ONLY SCREEN BLOCKED:", {
        attempted_screen: nextScreen,
        rerouted_to: "artistDashboard",
        resolvedAccount,
      });
      setScreen("artistDashboard");
      setNavMenuOpen(false);
      return;
    }
    if(premiumScreens[nextScreen]&&!hasPremiumAccess){
      requirePremium(premiumScreens[nextScreen],()=>goToScreen(nextScreen));
      setNavMenuOpen(false);
      return;
    }
    // Artist-only screens require artist access. Admins always pass.
    const artistOnlyScreens = new Set(["artistDashboard","artistPortfolio","artistAnalytics","artistPremium"]);
    if(artistOnlyScreens.has(nextScreen) && !canAccessArtistFeatures){
      console.warn("ARTIST WORKSPACE ACCESS DENIED:", {
        attempted_screen: nextScreen,
        current_user_id: session?.user?.id || null,
        role: userRole || null,
        hasArtistApplication,
        hasArtistProfileRow,
        reason: "User is not an artist/admin and has not applied as an artist.",
      });
      if(typeof window!=="undefined" && typeof window.alert==="function"){
        window.alert("Dashboard is only available for artist accounts. Apply as an artist to access it.");
      }
      setScreen("account");
      setNavMenuOpen(false);
      return;
    }
    // Admin-only screen.
    if(nextScreen==="admin" && !canAccessAdminFeatures){
      console.warn("ADMIN SCREEN ACCESS DENIED:", {
        current_user_id: session?.user?.id || null,
        role: userRole || null,
      });
      setScreen("account");
      setNavMenuOpen(false);
      return;
    }
    if(nextScreen==="home"){
      setSelectedArtist(null);
    }
    if(nextScreen==="directory")setSelectedArtist(null);
    setScreen(nextScreen);
    if(typeof window!=="undefined" && SCREEN_TO_PATH[nextScreen]){
      try{
        window.history.pushState({screen:nextScreen},"",SCREEN_TO_PATH[nextScreen]);
      }catch(error){
        console.warn("ROUTE PUSH FAILED:", error);
      }
    }
    setNavMenuOpen(false);
  }

  useEffect(()=>{
    if(typeof window==="undefined")return undefined;
    const handlePopState=()=>setScreen(initialScreenFromPath());
    window.addEventListener("popstate",handlePopState);
    return ()=>window.removeEventListener("popstate",handlePopState);
  },[]);

  useEffect(()=>{
    if(!isPasswordRecovery&&screen==="apply"&&isArtistApproved){
      setScreen("artistDashboard");
    }
  },[screen,isArtistApproved,isPasswordRecovery]);
  useEffect(()=>{
    const artistScreens = new Set(["artistDashboard","artistPortfolio","artistAnalytics","artistPremium"]);
    if(artistScreens.has(screen)&&session?.user){
      checkAdmin(session.user);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[screen,session?.user?.id]);
  // Re-fetch the artist_profiles row (matched by user_id = auth.uid()) when
  // the user navigates into an artist workspace screen, so the dashboard
  // reflects the latest server state.
  useEffect(()=>{
    const artistScreens = new Set(["artistDashboard","artistPortfolio","artistAnalytics","artistPremium"]);
    if(artistScreens.has(screen) && session?.user && !hasArtistProfileRow){
      console.log("ARTIST PROFILE refetch on workspace entry for user_id:", resolvedAccount?.user_id);
      loadMyArtistProfile().catch(err=>console.error("ARTIST PROFILE refetch error:", err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[screen,session?.user?.id,hasArtistProfileRow]);
  const brideNavItems = [
    {label:"Find My Archetype",screen:"quiz",scope:"bride"},
    {label:"My Bridal Direction",screen:"bridalDirection",scope:"bride"},
    {label:"ASK A BRIDAL PRO",screen:"chat",scope:"bride"},
    {label:"Bride Profile",screen:"profile",scope:"bride"},
    {label:"Timeline",screen:"timeline",scope:"bride"},
    {label:"Products",screen:"products",scope:"bride"},
    {label:"Artists",screen:"directory",scope:"bride"},
  ];
  const artistNavItems = [
    {label:"ASK A BRIDAL PRO",screen:"chat",scope:"artist"},
    {label:"Artist Profile",screen:"artistDashboard",scope:"artist"},
    {label:"Portfolio",screen:"artistPortfolio",scope:"artist"},
    {label:"Analytics",screen:"artistAnalytics",scope:"artist"},
  ];
  const adminNavItems = [
    {label:"Admin Dashboard",screen:"admin",scope:"admin",adminGroup:null},
  ];
  const dedupeNavItems = items => {
    const seen = new Set();
    return items.filter(item => {
      const key = `${item.label}-${item.screen}-${item.adminGroup || ""}`;
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    });
  };
  const navigationReady = authChecked && (!session?.user || roleChecked);
  const nav = navigationReady ? dedupeNavItems([
    ...(canAccessBrideFeatures ? brideNavItems : []),
    ...(canAccessArtistFeatures ? artistNavItems : []),
    ...(canAccessAdminFeatures ? adminNavItems : []),
    ...(session?.user ? [
      {label:"Account",screen:"account",scope:"account"},
      {label:"Sign Out",screen:"signout",scope:"account"},
    ] : []),
  ]) : [];
  console.log("RESOLVED ACCOUNT menu items rendered:", nav.map(item=>`${item.label}->${item.screen}${item.adminGroup?`#${item.adminGroup}`:""}`));
  // Active nav highlight reflects what's actually visible. The Dashboard
  // screen also has internal sub-tabs (artistTab), so map those to the
  // matching workspace route values used by the nav.
  const activeNavScreen = (() => {
    if (screen === "artistDashboard") {
      if (artistTab === "portfolio") return "artistPortfolio";
      if (artistTab === "analytics") return "artistAnalytics";
      return "artistDashboard";
    }
    return screen;
  })();
  function openNavItem(item){
    if(item?.screen==="admin" && canAccessAdminFeatures){
      setAdminOpenGroup(item.adminGroup ?? null);
    }
    goToScreen(item.screen);
  }
  const screenContainerStyle={width:"100%",maxWidth:"100%",minWidth:0,overflowX:"hidden",boxSizing:"border-box",touchAction:"pan-y"};
  const recoveryMode = isPasswordRecovery === true;

  const formatDirectionDate = value => {
    if(!value)return "";
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return "";
    return date.toLocaleString(undefined,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"});
  };
  const latestDirectionUpdatedAt = [quizUpdatedAt,swipePreferenceSummary?.updatedAt]
    .filter(Boolean)
    .sort((a,b)=>new Date(b).getTime()-new Date(a).getTime())[0] || "";
  const directionSectionStyle={background:C.white,border:`0.5px solid ${C.border}`,padding:"1.2rem",display:"flex",flexDirection:"column",gap:10};
  const directionSection = (title,children,accent=false) => (
    <section style={{...directionSectionStyle,background:accent?C.blush:C.white}}>
      <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:0}}>{title}</p>
      {children}
    </section>
  );
  const directionList = (items,emptyText="Not enough data yet.") => {
    const safeItems=Array.isArray(items)?items.filter(Boolean):[];
    if(safeItems.length===0)return <p style={{fontFamily:co,fontSize:14,fontStyle:"italic",lineHeight:1.7,color:C.gray,margin:0}}>{emptyText}</p>;
    return (
      <ul style={{margin:0,paddingLeft:"1.1rem",display:"flex",flexDirection:"column",gap:6}}>
        {safeItems.map(item=><li key={item} style={{fontFamily:co,fontSize:15,lineHeight:1.65,color:C.black}}>{item}</li>)}
      </ul>
    );
  };
  const myBridalDirectionSections = [
    {title:"Hair preferences",items:swipePreferenceSummary?.hairPreferences},
    {title:"Makeup preferences",items:swipePreferenceSummary?.makeupPreferences},
    {title:"Finish",items:swipePreferenceSummary?.finish},
    {title:"Structure",items:swipePreferenceSummary?.structure},
    {title:"Details",items:swipePreferenceSummary?.details},
    {title:"Other recurring themes",items:swipePreferenceSummary?.otherRecurringThemes},
  ];

  function renderArtistGate(message,buttonLabel="Back to Home"){
    return (
      <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.blush}}>
        <p style={{fontFamily:co,fontSize:14,fontStyle:"italic",color:C.gray,lineHeight:1.7,margin:"0 0 1rem"}}>{message}</p>
        <button onClick={()=>buttonLabel==="Sign In"?(()=>{setAuthMode("login");setAuthOpen(true);})():setScreen("home")} style={{background:C.black,color:C.white,border:"none",padding:"12px 24px",fontSize:10,letterSpacing:"0.18em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>{buttonLabel}</button>
      </div>
    );
  }

  function renderArtistWorkspacePage(section,children){
    return (
      <div className="artist-dashboard" style={{...screenContainerStyle,height:"calc(100vh - 74px - env(safe-area-inset-top) - env(safe-area-inset-bottom))",overflowY:"auto",overflowX:"hidden",WebkitOverflowScrolling:"touch",overscrollBehaviorY:"contain",overscrollBehaviorX:"none",touchAction:"pan-y",padding:"2.5rem min(2rem, 5vw) calc(5rem + env(safe-area-inset-bottom))",background:C.white,color:C.black}}>
        <div style={{width:"100%",maxWidth:720,margin:"0 auto",minWidth:0,overflowX:"hidden",boxSizing:"border-box"}}>
          <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.35em",textTransform:"uppercase",color:C.gray,marginBottom:"0.4rem"}}>Artist workspace</p>
          <h2 style={{fontFamily:ve,fontSize:24,fontWeight:400,letterSpacing:"0.14em",margin:"0 0 1rem"}}>{section}</h2>
          {!session?.user?renderArtistGate(`Sign in to view ${section.toLowerCase()}.`,"Sign In"):!canAccessArtistFeatures?renderArtistGate("Artist access only."):children}
        </div>
      </div>
    );
  }

  function artistProfileForWorkspace(){
    const relatedPortfolioPhotos = Array.isArray(portfolioPhotos)&&portfolioPhotos.length
      ? portfolioPhotos.map(photo => ({
          ...photo,
          url: photo?.url || photo?.image_url || "",
        }))
      : [];
    const jsonPortfolioPhotos = Array.isArray(myArtistProfile?.portfolio_photos)
      ? myArtistProfile.portfolio_photos.map(photo => ({
          ...photo,
          url: photo?.url || photo?.image_url || "",
        }))
      : [];
    const resolvedPortfolioPhotos=relatedPortfolioPhotos.length?relatedPortfolioPhotos:jsonPortfolioPhotos;
    return {
      ...(myArtistProfile || {}),
      portfolio_photos: resolvedPortfolioPhotos,
      link_clicks: myArtistProfile?.link_clicks ?? myArtistProfile?.inquiry_clicks ?? 0,
      portfolio_views: myArtistProfile?.portfolio_views ?? resolvedPortfolioPhotos.length,
    };
  }

  function renderArtistDashboard(){
    const artistProfileForTabs = artistProfileForWorkspace();
    // Score/activity read portfolio photos from artist_profiles.portfolio_photos
    // (the single source of truth), not from the artist_portfolio_photos table.
    const portfolioPhotos = Array.isArray(artistProfileForTabs?.portfolio_photos)
      ? artistProfileForTabs.portfolio_photos
      : [];
    console.log("ARTIST DASHBOARD PROFILE RESOLUTION:", {
      current_user_id:session?.user?.id||null,
      current_user_email:session?.user?.email||null,
      artist_profiles_id:artistProfileForTabs?.id||null,
      profile_user_id:artistProfileForTabs?.user_id||null,
      portfolio_photos_length:portfolioPhotos.length,
      workspace_portfolio_count:portfolioPhotos.length,
      is_sample_artist:artistProfileForTabs?.source==="seed"||artistProfileForTabs?.source==="fallback"||artistProfileForTabs?.is_sample_artist===true,
      is_published:artistProfileForTabs?.is_published,
      is_active:artistProfileForTabs?.is_active,
      tier:artistProfileForTabs?.tier||null,
    });
    const artistServicesText = String(artistProfileForTabs?.services || "").toLowerCase();
    const artistSpecialtyText = [
      artistProfileForTabs?.specialties,
      artistProfileForTabs?.featured_services,
      artistProfileForTabs?.best_for,
    ].flatMap(value => Array.isArray(value) ? value : [value]).filter(Boolean).join(" ").toLowerCase();
    const serviceMentionsHair = /hair|styling|updo|waves|curls|texture/.test(artistServicesText);
    const serviceMentionsMakeup = /makeup|make-up|glam|beauty|airbrush|skin/.test(artistServicesText);
    const specialtyMentionsHair = /hair|styling|updo|waves|curls|texture|veil|fine-hair|fine hair|transformation/.test(artistSpecialtyText);
    const specialtyMentionsMakeup = /makeup|make-up|glam|beauty|airbrush|skin|complexion|eye|eyes|lash/.test(artistSpecialtyText);
    const scoresHair = serviceMentionsHair || (!artistServicesText && specialtyMentionsHair);
    const scoresMakeup = serviceMentionsMakeup || (!artistServicesText && specialtyMentionsMakeup);
    const scoreHair = scoresHair || (!scoresMakeup && !scoresHair);
    const scoreMakeup = scoresMakeup || (!scoresMakeup && !scoresHair);
    const portfolioText = photo => [
      photo.category,
      photo.look_type,
      photo.hair_look,
      photo.makeup_look,
      ...(Array.isArray(photo.tags) ? photo.tags : []),
    ].join(" ").toLowerCase();
    const countPhotosMatching = pattern => portfolioPhotos.filter(photo => pattern.test(portfolioText(photo))).length;
    const hasPhotoMatching = pattern => portfolioPhotos.some(photo => pattern.test(portfolioText(photo)));
    const hairStyleCategoryCount = new Set(portfolioPhotos.map(photo => photo.hair_look || (/hair|updo|wave|curl|bun|pony|texture/.test(portfolioText(photo)) ? photo.look_type || photo.category : "")).filter(Boolean)).size;
    const makeupStyleCategoryCount = new Set(portfolioPhotos.map(photo => photo.makeup_look || (/makeup|glam|skin|eye|lash|lip/.test(portfolioText(photo)) ? photo.look_type || photo.category : "")).filter(Boolean)).size;
    const detailShotCount = countPhotosMatching(/detail|accessory|veil|texture|close|closeup|close-up|lash|lip|eye/);
    const hairTextureCount = countPhotosMatching(/texture|curly|coily|natural|straight|fine hair|fine-hair|thin hair|thick hair|density/);
    const skinCloseupCount = countPhotosMatching(/skin|complexion|face|close|closeup|close-up|beauty/);
    const eyeDetailCount = countPhotosMatching(/eye|eyes|lash|liner|shadow|brow/);
    const complexionDiversityCount = countPhotosMatching(/deep skin|dark skin|brown skin|fair skin|olive skin|mature skin|freckle|complexion|skin tone|diverse/);
    const hasFineHairTransformation = hasPhotoMatching(/fine hair|thin hair|low density|fine-hair/);
    const hasTransformation = hasPhotoMatching(/before|after|transformation|before\/after|before and after/);
    const hasVeilPhoto = hasPhotoMatching(/veil/);
    const scoreCriteria = [
      ...(scoreHair ? [
        { met: hairStyleCategoryCount >= 3 },
        { met: detailShotCount >= 2 },
        { met: hairTextureCount >= 2 },
        { met: hasFineHairTransformation },
        { met: hasTransformation },
      ] : []),
      ...(scoreMakeup ? [
        { met: skinCloseupCount >= 2 },
        { met: eyeDetailCount >= 2 },
        { met: complexionDiversityCount >= 2 },
        { met: hasTransformation },
        { met: makeupStyleCategoryCount >= 3 },
      ] : []),
    ];
    const portfolioQualityScore = Math.min(40, Math.round(scoreCriteria.reduce((total, item) => total + (item.met ? 1 : 0), 0) / Math.max(scoreCriteria.length, 1) * 40));
    const discoverabilityScore = Math.min(30, 20 + (artistDirectoryVisible ? 4 : 0) + (artistProfileForTabs?.bio ? 3 : 0) + (artistSpecialtyText ? 3 : 0));
    const engagementHealthScore = Math.min(30, 22 + (portfolioPhotos.length >= 3 ? 4 : 0) + (artistProfileForTabs?.website || artistProfileForTabs?.instagram ? 4 : 0));
    const profileScore = portfolioQualityScore + discoverabilityScore + engagementHealthScore;
    const profileScoreStatusLabel = profileScore >= 90
      ? "Exceptional profile visibility"
      : profileScore >= 75
        ? "Strong profile presence"
        : profileScore >= 60
          ? "Growing profile momentum"
          : "Building profile strength";
    const profileScoreHelperText = profileScore >= 90
      ? "Your profile is highly optimized. Keep it fresh with recent work."
      : profileScore >= 75
        ? "Your profile is in a strong place. A few refinements can make it work harder."
        : profileScore >= 60
          ? "Your profile has a solid foundation. The next updates should focus on portfolio strength."
          : "Your profile is still building strength. Start with portfolio images and clear positioning.";
    const isHollywoodWaveSpecialist = /hollywood|wave|waves|old hollywood|signature wave/.test(artistSpecialtyText);
    const isUpdoSpecialist = /updo|upstyles|bun|chignon|twist|pinned/.test(artistSpecialtyText);
    const profileScoreOpportunities = [
      ...(scoreHair ? [
        { title: "✨ Add another wave angle", reason: "Multiple angles reinforce your signature wave work", impact: 2, show: isHollywoodWaveSpecialist && detailShotCount < 3 },
        { title: "✨ Add one detail image", reason: "Close details show structure, pins, and finish", impact: 1, show: isUpdoSpecialist || detailShotCount < 2 },
      ] : []),
      ...(scoreHair && !scoreMakeup ? [
        { title: "✨ Add another angle of your signature style", reason: "Focused repetition helps brides trust your specialty", impact: 2, show: !isHollywoodWaveSpecialist && !isUpdoSpecialist },
        { title: "✨ Add one recent transformation", reason: "Before-and-after hair work makes results easier to picture", impact: 2, show: !hasTransformation || !hasFineHairTransformation },
      ] : []),
      ...(scoreMakeup && !scoreHair ? [
        { title: "✨ Add one flash example", reason: "Flash photos help brides trust the finish in real wedding lighting", impact: 2, show: eyeDetailCount < 2 },
        { title: "✨ Add one transformation image", reason: "Visible transformations help brides understand your skin finish", impact: 2, show: !hasTransformation },
        { title: "✨ Add one skin close-up", reason: "Close skin images make complexion work easier to trust", impact: 1, show: skinCloseupCount < 2 },
      ] : []),
      ...(scoreHair && scoreMakeup ? [
        { title: "✨ Add one transformation example", reason: "Full-look transformations show how your hair and makeup work together", impact: 2, show: !hasTransformation },
        { title: "✨ Add one detail image", reason: "Detail images help brides notice finish, texture, and polish", impact: 1, show: detailShotCount < 2 },
        { title: "✨ Refresh your cover image", reason: "A current cover image keeps your profile feeling active", impact: 1, show: true },
      ] : []),
    ].filter(item => item.show).sort((a, b) => b.impact - a.impact).slice(0, 3);
    const renderArtistEditListField = (field,label,placeholder) => {
      const items=editableTextList(artistEditForm[field]);
      return (
        <div className="artist-edit-field artist-edit-field-wide">
          <span>{label}</span>
          <div style={{display:"grid",gap:8}}>
            {items.length===0&&(
              <p style={{fontFamily:co,fontSize:13,fontStyle:"italic",color:C.gray,lineHeight:1.45,margin:0}}>No entries yet.</p>
            )}
            {items.map((item,index)=>(
              <div key={`${field}-${index}`} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:8,alignItems:"center"}}>
                <input
                  value={item}
                  onChange={event=>updateArtistEditList(field,index,event.target.value)}
                  placeholder={placeholder}
                />
                <button
                  type="button"
                  onClick={()=>removeArtistEditListItem(field,index)}
                  style={{background:"transparent",border:`0.5px solid ${C.border}`,color:C.gray,padding:"9px 10px",fontFamily:ag,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",cursor:"pointer"}}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={()=>addArtistEditListItem(field)}
              style={{background:"transparent",border:`0.5px solid ${C.black}`,color:C.black,padding:"10px 12px",fontFamily:ag,fontSize:10,letterSpacing:"0.14em",textTransform:"uppercase",cursor:"pointer",justifySelf:"start"}}
            >
              Add Entry
            </button>
          </div>
        </div>
      );
    };
    const renderArtistProfileEditForm = () => (
      <div className="artist-edit-card">
        <p className="artist-section-label">Edit Profile</p>
        <div className="artist-edit-photo-row">
          <div className="artist-profile-photo-wrap">
            {myArtistProfile?.profile_photo_url ? (
              <img src={myArtistProfile.profile_photo_url} alt="Artist profile" className="artist-profile-photo" />
            ) : (
              <div className="artist-profile-photo-placeholder">{(artistEditForm.business_name||artistEditForm.owner_name||"A").trim().charAt(0).toUpperCase()||"A"}</div>
            )}
          </div>
          <button
            type="button"
            className={`artist-primary-button ${profilePhotoUploading ? "is-disabled" : ""}`}
            disabled={profilePhotoUploading}
            onClick={()=>profilePhotoFileRef.current?.click()}
          >
            {profilePhotoUploading ? "UPLOADING..." : (myArtistProfile?.profile_photo_url ? "CHANGE PROFILE PHOTO" : "UPLOAD PROFILE PHOTO")}
          </button>
          <input
            ref={profilePhotoFileRef}
            type="file"
            accept="image/*"
            disabled={profilePhotoUploading}
            hidden
            onChange={(event)=>{
              const file=event.target.files?.[0];
              if(file)uploadArtistProfilePhoto(file);
              event.target.value="";
            }}
          />
        </div>
        <div className="artist-edit-grid">
          {[
            ["business_name","Business / display name"],
            ["city","City"],
            ["state","State / province"],
            ["country","Country"],
            ["services","Services"],
            ["website","Website"],
            ["instagram","Instagram"],
            ["starting_price","Starting price"],
          ].map(([key,label])=>(
            <label key={key} className="artist-edit-field">
              {label}
              <input value={artistEditForm[key]||""} onChange={event=>setArtistEditForm(prev=>({...prev,[key]:event.target.value}))} />
            </label>
          ))}
          <label className="artist-edit-field artist-edit-field-wide">
            Bio
            <textarea value={artistEditForm.bio||""} onChange={event=>setArtistEditForm(prev=>({...prev,bio:event.target.value}))} rows={4} />
          </label>
          <label className="artist-edit-field artist-edit-field-wide">
            Specialties
            <textarea value={artistEditForm.specialties||""} onChange={event=>setArtistEditForm(prev=>({...prev,specialties:event.target.value}))} rows={3} />
          </label>
          <label className="artist-edit-field artist-edit-field-wide">
            Education
            <textarea
              value={artistEditForm.education||""}
              onChange={event=>setArtistEditForm(prev=>({...prev,education:event.target.value}))}
              rows={4}
              placeholder="Cosmetology school, licenses, certifications, advanced training, masterclasses..."
            />
          </label>
          {renderArtistEditListField("best_for","Best For","e.g. Fine hair brides")}
          {renderArtistEditListField("not_ideal_for","Not Ideal For","e.g. Ultra-natural no-makeup")}
          <label className="artist-edit-checkbox">
            <input type="checkbox" checked={!!artistEditForm.travels} onChange={event=>setArtistEditForm(prev=>({...prev,travels:event.target.checked}))} />
            Travels
          </label>
        </div>
        {artistEditMessage&&<p className="artist-upload-message">{artistEditMessage}</p>}
        {artistEditError&&<p className="artist-upload-error">{artistEditError}</p>}
        {profilePhotoMessage&&<p className="artist-upload-message">{profilePhotoMessage}</p>}
        {profilePhotoError&&<p className="artist-upload-error">{profilePhotoError}</p>}
        <div className="artist-edit-actions">
          <button onClick={saveArtistEditProfile} disabled={artistEditSaving}>{artistEditSaving?"Saving...":"Save Profile"}</button>
          <button onClick={cancelArtistEditProfile} disabled={artistEditSaving}>Cancel</button>
        </div>
      </div>
    );
    const dashboardContent = (
      <div className="artist-dashboard-sections">
        {artistEditOpen&&renderArtistProfileEditForm()}
        <div className="artist-detail-card" style={{padding:"1rem"}}>
          <p className="artist-section-label" style={{margin:"0 0 0.7rem"}}>Workspace Summary</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:"0 18px"}}>
            {[
              ["Approval",hasArtistProfileRow?"Approved":"No artist profile",hasArtistProfileRow?C.teal:C.gray],
              ["Visibility",artistDirectoryVisible?"Visible":"Hidden",artistDirectoryVisible?C.teal:C.gray],
              ["Membership",hasUpgradedProfile?"Premium Artist":"Free Artist",hasUpgradedProfile?C.teal:C.gray],
              ["Portfolio Photos",`${portfolioPhotos.length}/${artistPortfolioMax}`,C.black],
            ].map(([label,value,color])=>(
              <div key={label} style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:12,borderTop:`0.5px solid ${C.border}`,padding:"0.65rem 0"}}>
                <span style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray}}>{label}</span>
                <strong style={{fontFamily:ve,fontSize:15,letterSpacing:"0.06em",fontWeight:400,color,whiteSpace:"nowrap"}}>{value}</strong>
              </div>
            ))}
          </div>
          <p style={{fontFamily:co,fontSize:13,fontStyle:"italic",color:C.gray,lineHeight:1.5,margin:"0.25rem 0 0"}}>{artistStatusLabel} · {artistDirectoryVisible?"Your listing is live in the directory.":"Complete the missing items to improve directory readiness."}</p>
        </div>
        <div className="artist-detail-card">
          <p className="artist-section-label">Profile Completeness</p>
          <div className="artist-completeness-list">
            {profileCompleteness.map(item=>(
              <div key={item.label}>
                <span>{item.label}</span>
                <strong>{item.complete?"Done":"Missing"}</strong>
              </div>
            ))}
          </div>
        </div>
        <div id="artist-profile-score" className="artist-detail-card">
          <p className="artist-section-label">PROFILE SCORE</p>
          <p style={{fontFamily:ve,fontSize:34,letterSpacing:"0.08em",fontWeight:400,margin:"0.7rem 0 0.35rem"}}>{profileScore}/100</p>
          <p style={{fontFamily:ag,fontSize:10,letterSpacing:"0.16em",textTransform:"uppercase",color:C.teal,margin:"0 0 0.65rem"}}>{profileScoreStatusLabel}</p>
          <p style={{fontFamily:co,fontSize:14,fontStyle:"italic",color:C.gray,lineHeight:1.65,margin:"0 0 1rem"}}>
            {profileScoreHelperText}
          </p>
          <div style={{height:8,background:C.iceBlue,border:`0.5px solid ${C.border}`,overflow:"hidden",marginBottom:"1rem"}}>
            <div style={{height:"100%",width:`${profileScore}%`,background:C.teal}} />
          </div>
          <div className="artist-completeness-list">
            {[
              ["Portfolio Quality", portfolioQualityScore, 40],
              ["Discoverability", discoverabilityScore, 30],
              ["Engagement Health", engagementHealthScore, 30],
            ].map(([label, score, total]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{score} / {total}</strong>
              </div>
            ))}
          </div>
          <p className="artist-section-label" style={{marginTop:"1.15rem"}}>NEXT BEST MOVES</p>
          <div style={{display:"grid",gap:12,marginTop:"0.8rem"}}>
            {profileScoreOpportunities.length ? profileScoreOpportunities.map(item => (
              <div key={item.title} style={{display:"grid",gap:3}}>
                <p style={{fontFamily:co,fontSize:15,color:C.black,lineHeight:1.45,margin:0}}>{item.title}</p>
                <p style={{fontFamily:co,fontSize:13,fontStyle:"italic",color:C.gray,lineHeight:1.45,margin:0}}>{item.reason}</p>
                <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.teal,margin:0}}>Estimated impact: +{item.impact}</p>
              </div>
            )) : (
              <p style={{fontFamily:co,fontSize:14,fontStyle:"italic",color:C.gray,lineHeight:1.55,margin:0}}>Your profile has the right next moves covered for now.</p>
            )}
          </div>
        </div>
        <div className="artist-detail-card">
          <p className="artist-section-label">WORKSPACE</p>
          <div className="artist-quick-link-grid">
            <button onClick={()=>goToScreen("artistPortfolio")} style={{background:"transparent",color:C.black,border:`0.5px solid ${C.black}`,padding:"12px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Portfolio</button>
            <button onClick={()=>goToScreen("artistAnalytics")} style={{background:"transparent",color:C.black,border:`0.5px solid ${C.black}`,padding:"12px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Analytics</button>
            <button onClick={()=>goToScreen("directory")} style={{background:"transparent",color:C.black,border:`0.5px solid ${C.black}`,padding:"12px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Directory</button>
            <button onClick={openArtistEditProfile} style={{background:"transparent",color:C.black,border:`0.5px solid ${C.black}`,padding:"12px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Edit Profile</button>
          </div>
        </div>
      </div>
    );

    return renderArtistWorkspacePage("DASHBOARD",(
      <>
        <div className="artist-nav artist-workspace-tabs">
          <button
            className={`artist-workspace-tab ${artistTab === "dashboard" ? "active" : ""}`}
            onClick={() => setArtistTab("dashboard")}
          >
            Dashboard
          </button>

          <button
            className={`artist-workspace-tab ${artistTab === "portfolio" ? "active" : ""}`}
            onClick={() => setArtistTab("portfolio")}
          >
            Portfolio
          </button>

          <button
            className={`artist-workspace-tab ${artistTab === "analytics" ? "active" : ""}`}
            onClick={() => setArtistTab("analytics")}
          >
            Analytics
          </button>
        </div>

        {artistTab === "dashboard" && (
          <ArtistDashboardHome
            artistProfile={artistProfileForTabs}
            onEditProfile={openArtistEditProfile}
            onUploadProfilePhoto={uploadArtistProfilePhoto}
            profilePhotoUploading={profilePhotoUploading}
            profilePhotoMessage={profilePhotoMessage}
            profilePhotoError={profilePhotoError}
          >
            {dashboardContent}
          </ArtistDashboardHome>
        )}

        {artistTab === "portfolio" && (
          <ArtistPortfolioPage
            artistProfile={artistProfileForTabs}
            supabase={supabase}
            userId={session?.user?.id}
            onProfileUpdated={setMyArtistProfile}
          />
        )}

        {artistTab === "analytics" && (
          <ArtistAnalyticsPage artistProfile={artistProfileForTabs} />
        )}
      </>
    ));
  }

  function renderArtistPortfolio(){
    return renderArtistWorkspacePage("PORTFOLIO",(
      <ArtistPortfolioPage
        artistProfile={artistProfileForWorkspace()}
        supabase={supabase}
        userId={session?.user?.id}
        onProfileUpdated={setMyArtistProfile}
      />
    ));
  }

  function renderArtistAnalytics(){
    return renderArtistWorkspacePage("ANALYTICS",(
      <ArtistAnalyticsPage artistProfile={artistProfileForWorkspace()} />
    ));
  }

  function renderArtistPremium(){
    const premiumBenefits=[
      "Featured badge",
      "Priority placement",
      "50 portfolio photos",
      "Pinned portfolio slots",
      "Enhanced analytics",
      "Cover image",
      "Signature method",
    ];
    return renderArtistWorkspacePage("PREMIUM",(
      <div style={{display:"grid",gap:10}}>
        <div style={{border:`0.5px solid ${isUpgraded?C.teal:C.border}`,padding:"1rem",background:isUpgraded?"#eaf7ea":C.white}}>
          <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:isUpgraded?C.teal:C.gray,margin:"0 0 0.5rem"}}>Current Tier</p>
          <p style={{fontFamily:ve,fontSize:22,letterSpacing:"0.1em",margin:0}}>{isUpgraded?"Premium Artist":"Free Artist"}</p>
        </div>
        <div style={{border:`0.5px solid ${isUpgraded?C.teal:C.border}`,padding:"1rem",background:isUpgraded?"#eaf7ea":C.white}}>
          <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:isUpgraded?C.teal:C.gray,margin:"0 0 0.75rem"}}>Premium Benefits</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:"0 18px"}}>
            {premiumBenefits.map(benefit=>(
              <div key={benefit} style={{display:"flex",alignItems:"center",gap:9,borderTop:`0.5px solid ${isUpgraded?"rgba(45,110,110,0.25)":C.border}`,padding:"0.55rem 0"}}>
                <span aria-hidden="true" style={{width:18,height:18,display:"inline-flex",alignItems:"center",justifyContent:"center",border:`0.5px solid ${isUpgraded?C.teal:C.lavender}`,color:isUpgraded?C.teal:C.gray,fontFamily:ag,fontSize:10,flexShrink:0}}>✓</span>
                <span style={{fontFamily:co,fontSize:14,color:C.black,lineHeight:1.35}}>{benefit}</span>
              </div>
            ))}
          </div>
        </div>
        {!isUpgraded&&(
          <div style={{border:`0.5px solid ${C.border}`,padding:"1rem",background:C.white}}>
            <ArtistUpgradeButton variant="dashboard"/>
          </div>
        )}
      </div>
    ));
  }

  if(recoveryMode){
    return(
      <div style={{...screenContainerStyle,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"2.5rem 1.5rem",background:C.nearBlack,fontFamily:co,color:C.black,boxSizing:"border-box"}}>
        <div style={{width:"100%",maxWidth:380,background:C.white,padding:"1.5rem",boxShadow:"0 18px 50px rgba(0,0,0,0.24)"}}>
          <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.22em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.3rem"}}>Your account</p>
          <h2 style={{fontFamily:ve,fontSize:20,fontWeight:400,letterSpacing:"0.12em",margin:"0 0 1.2rem"}}>RESET PASSWORD</h2>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <ResetPasswordScreen password={authPassword} setPassword={setAuthPassword} confirmPassword={resetConfirmPassword} setConfirmPassword={setResetConfirmPassword} loading={authLoading} error={authError} onSave={updateRecoveredPassword} resetSent={authResetSent}/>
          </div>
        </div>
      </div>
    );
  }

  return(
    <div className="app-shell" style={{minHeight:"100vh",background:"white",fontFamily:co,color:C.black,overflowX:"hidden",overscrollBehaviorX:"none",touchAction:"pan-y",width:"100%",maxWidth:"100%",minWidth:0,position:"relative",margin:"0 auto",paddingTop:"env(safe-area-inset-top)",paddingBottom:"env(safe-area-inset-bottom)",boxSizing:"border-box",display:"flex",flexDirection:"column"}}>
      <style>{`
        html, body, #root, .app-shell, .app-main {
          width: 100%;
          max-width: 100%;
          min-width: 0;
          overflow-x: hidden;
          box-sizing: border-box;
        }
        *, *::before, *::after {
          box-sizing: border-box;
        }
        .app-header {
          left: 0;
          right: 0;
          width: 100%;
          max-width: 100%;
        }
        .app-shell *,
        .app-main * {
          min-width: 0;
        }
        img,
        svg,
        video,
        canvas {
          max-width: 100%;
        }
        button,
        input,
        textarea,
        select {
          max-width: 100%;
        }
        p,
        span,
        div,
        a,
        li,
        h1,
        h2,
        h3,
        h4,
        h5,
        h6 {
          overflow-wrap: anywhere;
        }
        table {
          max-width: 100%;
        }
        .table-scroll {
          width: 100%;
          max-width: 100%;
          min-width: 0;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior-x: contain;
        }
        .table-scroll table {
          width: max-content;
          min-width: 100%;
        }
        .artist-dashboard,
        .artist-dashboard *,
        .admin-dashboard,
        .admin-dashboard * {
          max-width: 100%;
          box-sizing: border-box;
        }
        .artist-dashboard,
        .admin-dashboard {
          width: 100%;
          min-width: 0;
          overflow-x: hidden;
          overscroll-behavior-x: none;
        }
        .artist-dashboard input,
        .artist-dashboard textarea,
        .artist-dashboard select,
        .artist-dashboard button,
        .admin-dashboard input,
        .admin-dashboard textarea,
        .admin-dashboard select,
        .admin-dashboard button {
          max-width: 100%;
        }
        .artist-dashboard input,
        .artist-dashboard textarea,
        .artist-dashboard select,
        .admin-dashboard input,
        .admin-dashboard textarea,
        .admin-dashboard select {
          width: 100%;
          min-width: 0;
        }
        .artist-dashboard p,
        .artist-dashboard span,
        .artist-dashboard div,
        .artist-dashboard a,
        .artist-dashboard input,
        .artist-dashboard textarea,
        .admin-dashboard p,
        .admin-dashboard span,
        .admin-dashboard div,
        .admin-dashboard a,
        .admin-dashboard input,
        .admin-dashboard textarea {
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .admin-dashboard h1,
        .admin-dashboard h2,
        .admin-dashboard h3 {
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .admin-dashboard .admin-toolbar,
        .admin-dashboard .admin-action-row,
        .admin-dashboard .booked-bride-form,
        .admin-dashboard .admin-list-row,
        .admin-dashboard .admin-message-header {
          min-width: 0;
          max-width: 100%;
          flex-wrap: wrap;
        }
        @media (max-width: 640px) {
          .admin-dashboard .booked-bride-form {
            flex-direction: column;
            align-items: stretch;
          }
          .admin-dashboard .booked-bride-form input,
          .admin-dashboard .booked-bride-form button {
            width: 100%;
            max-width: 100%;
            flex: 1 1 auto;
          }
          .admin-dashboard .admin-action-row,
          .admin-dashboard .admin-list-row,
          .admin-dashboard .admin-message-header {
            align-items: stretch;
          }
        }
      `}</style>

      {/* NAV */}
      {(<>
        <header className="app-header" style={{position:"relative",zIndex:120,background:C.white,borderBottom:`0.5px solid ${C.border}`,boxSizing:"border-box",padding:"8px 20px 10px",paddingTop:28,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
            <button onClick={()=>{setScreen("home");setNavMenuOpen(false);}} style={{background:"none",border:"none",fontFamily:ve,fontSize:11,letterSpacing:"0.2em",cursor:"pointer",color:C.black,padding:0,whiteSpace:"nowrap"}}>THE BRIDAL EDIT™</button>
            <div style={{display:"flex",gap:10,alignItems:"center",justifyContent:"flex-end"}}>
            {session?.user?(
              <button title={session.user.email} onClick={()=>{setScreen("account");setNavMenuOpen(false);}} style={{width:26,height:26,borderRadius:"50%",background:C.black,color:C.white,border:"none",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:ag,fontSize:10,letterSpacing:"0.08em",flexShrink:0,cursor:"pointer",padding:0}}>{userInitial}</button>
            ):(
              <button onClick={()=>{setAuthMode("login");setAuthOpen(true);}} style={{background:"none",color:C.black,border:"none",fontSize:8,letterSpacing:"0.12em",fontFamily:ag,textTransform:"uppercase",cursor:"pointer",padding:0,whiteSpace:"nowrap"}}>Sign In</button>
            )}
              <button onClick={()=>setNavMenuOpen(open=>!open)} aria-label="Open navigation menu" aria-expanded={navMenuOpen} style={{background:"none",border:`0.5px solid ${C.black}`,color:C.black,width:32,height:30,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,lineHeight:1,cursor:"pointer",padding:0}}>☰</button>
            </div>
          </div>
          {navMenuOpen&&(
            <>
              {/* Backdrop: tapping outside the menu closes it. */}
              <div
                onClick={()=>setNavMenuOpen(false)}
                aria-hidden="true"
                style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.18)",zIndex:110}}
              />
              {/* Overlay menu: absolutely positioned under the header so it
                  does not push page content down. */}
              <div
                role="menu"
                style={{position:"absolute",top:"100%",left:0,right:0,zIndex:130,background:C.nearBlack,color:C.white,padding:"0.5rem 0",boxShadow:"0 12px 30px rgba(0,0,0,0.18)"}}
              >
                {!navigationReady&&(
                  <div
                    role="menuitem"
                    aria-disabled="true"
                    style={{
                      width:"100%",
                      borderBottom:"0.5px solid rgba(255,255,255,0.14)",
                      color:"rgba(255,255,255,0.72)",
                      fontFamily:co,
                      fontSize:13,
                      fontStyle:"italic",
                      padding:"13px 18px",
                      boxSizing:"border-box",
                    }}
                  >
                    Loading navigation...
                  </div>
                )}
                {nav.map(item=>{
                  const {label:l,screen:s}=item;
                  const isActive = activeNavScreen === s && (s !== "admin" || (item.adminGroup ?? null) === (adminOpenGroup ?? null));
                  return (
                    <button
                      key={`${l}-${s}-${item.adminGroup || ""}`}
                      role="menuitem"
                      aria-current={isActive ? "page" : undefined}
                      onClick={()=>{openNavItem(item);setNavMenuOpen(false);}}
                      style={{
                        width:"100%",
                        background: isActive ? "rgba(214,202,221,0.16)" : "none",
                        border:"none",
                        borderLeft: isActive ? `3px solid ${C.lavender}` : "3px solid transparent",
                        borderBottom:"0.5px solid rgba(255,255,255,0.14)",
                        color: isActive ? C.lavender : C.white,
                        cursor:"pointer",
                        fontFamily:ag,
                        fontSize:10,
                        letterSpacing:"0.18em",
                        textTransform:"uppercase",
                        fontWeight: isActive ? 700 : 400,
                        padding:"13px 18px",
                        textAlign:"left",
                        display:"flex",
                        alignItems:"center",
                        justifyContent:"space-between",
                      }}
                    >
                      <span>{l}</span>
                      {s==="chat"&&hasUnreadResponses&&<span style={{width:7,height:7,borderRadius:"50%",background:"#cc4444",display:"inline-block"}}/>}
                      {l==="Timeline"&&hasPremiumAccess&&nowItems.length>0&&<span style={{width:7,height:7,borderRadius:"50%",background:"#cc4444",display:"inline-block"}}/>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </header>
      </>)}

      <main className="app-main" style={{flex:"1 1 auto",width:"100%",maxWidth:"100%",minWidth:0,minHeight:0,overflowY:"auto",overflowX:"hidden",WebkitOverflowScrolling:"touch",overscrollBehaviorX:"none",touchAction:"pan-y",boxSizing:"border-box"}}>
      {/* ── RESET LINK EXPIRED ───────────────────────────────────────── */}
      {screen==="reset-expired"&&(
        <div style={{...screenContainerStyle,minHeight:"100%",display:"flex",alignItems:"center",justifyContent:"center",padding:"2.5rem 1.5rem",background:C.nearBlack}}>
          <div style={{width:"100%",maxWidth:380,background:C.white,padding:"1.5rem",boxShadow:"0 18px 50px rgba(0,0,0,0.24)"}}>
            <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.22em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.3rem"}}>Your account</p>
            <h2 style={{fontFamily:ve,fontSize:20,fontWeight:400,letterSpacing:"0.12em",margin:"0 0 1.2rem"}}>RESET LINK EXPIRED</h2>
            <p style={{fontFamily:co,fontSize:14,color:C.gray,lineHeight:1.6,margin:"0 0 1.25rem"}}>This reset link expired or was already used. Request a new password reset email.</p>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <button onClick={()=>{
                setAuthEmail("");
                setAuthError("");
                setAuthResetSent(false);
                setAuthMode("forgot");
                setAuthOpen(true);
                setScreen("home");
                try{ window.history.pushState({},"","/"); }catch(e){}
              }} style={{background:C.black,color:C.white,border:"none",padding:"11px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Back to Forgot Password</button>
              <button onClick={()=>{
                setScreen("home");
                try{ window.history.pushState({},"","/"); }catch(e){}
              }} style={{background:"transparent",color:C.gray,border:`0.5px solid #ccc`,padding:"11px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Back to Home</button>
            </div>
          </div>
        </div>
      )}

      {/* ── HOME ──────────────────────────────────────────────────────── */}
      {screen==="home"&&(
        <div style={{...screenContainerStyle,minHeight:"100%",display:"flex",flexDirection:"column"}}>
          <div style={{background:C.nearBlack,flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"5rem 2rem",textAlign:"center",position:"relative",overflow:"hidden",color:C.white}}>
            <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at 25% 75%,${C.lavender}18 0%,transparent 55%),radial-gradient(ellipse at 80% 20%,${C.blush}10 0%,transparent 50%)`,pointerEvents:"none"}}/>
            <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.5em",color:C.lavender,textTransform:"uppercase",marginBottom:"1.5rem"}}>The bridal beauty app for brides who care how it actually wears</p>
            <h1 style={{fontFamily:ve,fontSize:50,fontWeight:400,letterSpacing:"0.2em",margin:"0 0 0.2rem",lineHeight:1.1}}>THE BRIDAL EDIT</h1>
            <span style={{fontFamily:ve,fontSize:17,color:C.lavender,letterSpacing:"0.3em"}}>™</span>
            <p style={{fontFamily:co,fontSize:19,fontStyle:"italic",color:"#bbb",margin:"1.5rem 0 0.5rem",maxWidth:420,lineHeight:1.6}}>Pinterest, translated professionally.</p>
            <p style={{fontFamily:co,fontSize:15,color:"#888",margin:"0 0 3rem",maxWidth:400,lineHeight:1.6}}>Find the look that fits your features, venue, climate, and timeline — not just your mood board.</p>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
              <button onClick={()=>{resetQuiz();setScreen("quiz");}} style={{background:C.white,color:C.black,border:"none",padding:"15px 44px",fontSize:10,letterSpacing:"0.28em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Discover My Bridal Edit</button>
              <button onClick={()=>goToScreen("directory")} style={{background:"transparent",color:C.lavender,border:`1px solid ${C.lavender}50`,padding:"12px 36px",fontSize:9,letterSpacing:"0.22em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Find My Artist</button>
            </div>
          </div>
          <div style={{background:C.blush,padding:"2rem",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:18,textAlign:"center"}}>
            {[["Skin & hair quiz","Personalized to your actual features"],["12 archetypes","With Reality Score™ and Pinterest honesty"],["Beauty Timeline","Auto-populated from your wedding date"],["Product Recs","Affiliate picks matched to your profile"],["Artist Directory","25+ vetted artists, nationwide"]].map(([t,d])=>(
              <div key={t}><p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.16em",textTransform:"uppercase",marginBottom:"0.3rem"}}>{t}</p><p style={{fontFamily:co,fontStyle:"italic",fontSize:12,color:C.gray,lineHeight:1.5,margin:0}}>{d}</p></div>
            ))}
          </div>
        </div>
      )}

      {/* ── QUIZ ──────────────────────────────────────────────────────── */}
      {screen==="quiz"&&(
        <div style={{...screenContainerStyle,display:"flex",flexDirection:"column",alignItems:"center",padding:"2.5rem 2rem",minHeight:"80vh"}}>
          <div style={{width:"100%",maxWidth:540}}>
            {/* Progress */}
            <div style={{height:2,background:"#eee",marginBottom:"0.5rem"}}><div style={{height:2,width:`${progress}%`,background:C.black,transition:"width 0.3s"}}/></div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"2rem"}}>
              <button onClick={quizBack} style={{background:"none",border:"none",padding:0,cursor:"pointer",fontFamily:ag,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray}}>← Back</button>
              <span style={{fontFamily:ag,fontSize:9,letterSpacing:"0.15em",textTransform:"uppercase",color:C.gray}}>{quizPhase==="skin"?"Skin profile":quizPhase==="hair"?"Hair profile":quizPhase==="features"?"Feature profile":"Your vision"}</span>
              <span style={{fontFamily:ag,fontSize:9,color:C.gray}}>{currentStep+1} / {totalSteps}</span>
            </div>

            {/* Phase label */}
            {quizPhase==="skin"&&skinStep===0&&<div style={{background:C.iceBlue,padding:"0.9rem 1.1rem",marginBottom:"1.5rem",borderLeft:`3px solid ${C.lavender}`}}><p style={{fontFamily:co,fontStyle:"italic",fontSize:14,color:C.gray,margin:0}}>First, let's understand your skin. You don't need to know your "skin type" — just answer honestly.</p></div>}
            {quizPhase==="hair"&&hairStep===0&&<div style={{background:C.iceBlue,padding:"0.9rem 1.1rem",marginBottom:"1.5rem",borderLeft:`3px solid ${C.lavender}`}}><p style={{fontFamily:co,fontStyle:"italic",fontSize:14,color:C.gray,margin:0}}>Now let's figure out your hair. No jargon needed — just describe what you observe.</p></div>}
            {quizPhase==="features"&&featureStep===0&&<div style={{background:C.iceBlue,padding:"0.9rem 1.1rem",marginBottom:"1.5rem",borderLeft:`3px solid ${C.lavender}`}}><p style={{fontFamily:co,fontStyle:"italic",fontSize:14,color:C.gray,margin:0}}>A few feature details help translate inspo into what flatters you specifically.</p></div>}
            {quizPhase==="main"&&mainStep===0&&<div style={{background:C.blush,padding:"0.9rem 1.1rem",marginBottom:"1.5rem",borderLeft:`3px solid ${C.lavender}`}}><p style={{fontFamily:co,fontStyle:"italic",fontSize:14,color:C.gray,margin:0}}>Skin and hair profiled. Now — your vision and emotional priorities. These answers shape everything.</p></div>}

            {/* Question */}
            {(()=>{
              let q,onAnswer;
              if(quizPhase==="skin"){q=SKIN_Q[skinStep];onAnswer=processSkin;}
              else if(quizPhase==="hair"){q=HAIR_Q[hairStep];onAnswer=processHair;}
              else if(quizPhase==="features"){q=FEATURE_Q[featureStep];onAnswer=processFeature;}
              else{q=MAIN_Q[mainStep];onAnswer=processMain;}
              if(!q)return null;
              return(
                <>
                  <h2 style={{fontFamily:co,fontSize:24,fontWeight:400,marginBottom:"0.5rem",lineHeight:1.4}}>{q.q}</h2>
                  {q.sub&&<p style={{fontFamily:co,fontStyle:"italic",color:C.gray,fontSize:14,marginBottom:"1.5rem"}}>{q.sub}</p>}
                  <div style={{height:quizPhase==="main"&&q.sub?0:16}}/>
                  {!showOther?(
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {q.opts.map(opt=>(
                        <button key={opt} onClick={()=>opt==="Other"?setShowOther(true):onAnswer(opt)} style={{background:C.white,border:`0.5px solid #ccc`,padding:"13px 18px",fontSize:16,textAlign:"left",cursor:"pointer",fontFamily:co,color:opt==="Other"?C.gray:C.black,fontStyle:opt==="Other"?"italic":"normal"}}
                          onMouseEnter={e=>{e.currentTarget.style.background=C.blush;e.currentTarget.style.borderColor=C.black;}}
                          onMouseLeave={e=>{e.currentTarget.style.background=C.white;e.currentTarget.style.borderColor="#ccc";}}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  ):(
                    <div style={{display:"flex",flexDirection:"column",gap:12}}>
                      <textarea value={otherTxt} onChange={e=>setOtherTxt(e.target.value)} placeholder="Describe in your own words..." rows={3} style={{border:`0.5px solid #ccc`,padding:"12px",fontSize:16,fontFamily:co,resize:"vertical",outline:"none"}}/>
                      <div style={{display:"flex",gap:10}}>
                        <button onClick={()=>{if(otherTxt.trim()){if(quizPhase==="skin")processSkin(otherTxt.trim());else if(quizPhase==="hair")processHair(otherTxt.trim());else if(quizPhase==="features")processFeature(otherTxt.trim());else processMain(otherTxt.trim());}}} style={{background:C.black,color:C.white,border:"none",padding:"11px 24px",fontSize:10,letterSpacing:"0.14em",fontFamily:ag,textTransform:"uppercase",cursor:"pointer"}}>Continue</button>
                        <button onClick={()=>setShowOther(false)} style={{background:"none",color:C.gray,border:`0.5px solid #ccc`,padding:"11px 14px",fontSize:10,fontFamily:ag,cursor:"pointer"}}>Back</button>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── AUTH GATE (results gate) ─────────────────────────────────────
          Shown once after the quiz/swipe deck is complete. The bride has
          already invested the effort; creating a free account is the final,
          rewarding step that unlocks her personalized results. No skip path. */}
      {screen==="authGate"&&(
        <div style={{...screenContainerStyle,minHeight:"100%",flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"3.5rem 2rem",background:C.nearBlack,color:C.white,textAlign:"center",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at 25% 75%,${C.lavender}1f 0%,transparent 55%),radial-gradient(ellipse at 80% 20%,${C.blush}12 0%,transparent 50%)`,pointerEvents:"none"}}/>
          <div style={{position:"relative",width:"100%",maxWidth:440,display:"flex",flexDirection:"column",alignItems:"center"}}>
            <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.4em",textTransform:"uppercase",color:C.lavender,margin:"0 0 1.5rem"}}>Your style analysis is complete</p>
            <div style={{fontSize:30,marginBottom:"1rem"}}>✦</div>
            <h1 style={{fontFamily:ve,fontSize:30,fontWeight:400,letterSpacing:"0.1em",lineHeight:1.25,margin:"0 0 1.25rem"}}>Your Bridal Beauty Profile Is Ready</h1>
            <p style={{fontFamily:co,fontSize:16,color:"#d4d4d4",lineHeight:1.8,margin:"0 0 2.25rem",maxWidth:400}}>Create your free account to reveal your quiz results, unlock your swipe deck results, save your profile, and get matched with artists who actually fit your style.</p>
            <button
              onClick={()=>{setAuthMode("signup");setAuthAccountType("bride");setAuthCheckEmail(false);setAuthError("");setAuthResetSent(false);setAuthOpen(true);}}
              style={{width:"100%",background:C.white,color:C.black,border:"none",padding:"16px",fontSize:11,letterSpacing:"0.24em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase",marginBottom:"0.85rem"}}
            >
              Create Free Account
            </button>
            <button
              onClick={()=>{setAuthMode("login");setAuthCheckEmail(false);setAuthError("");setAuthResetSent(false);setAuthOpen(true);}}
              style={{width:"100%",background:"transparent",color:C.white,border:`0.5px solid ${C.lavender}80`,padding:"14px",fontSize:10,letterSpacing:"0.22em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}
            >
              Log In
            </button>
          </div>
        </div>
      )}

      {/* ── RESULT ──────────────────────────────────────────────────────── */}
      {screen==="result"&&priArc&&secArc&&(
        <div style={{...screenContainerStyle,display:"flex",flexDirection:"column",alignItems:"center",padding:"3rem 2rem"}}>
          <div style={{width:"100%",maxWidth:620}}>
            {/* Skin/hair summary */}
            <div style={{display:"flex",gap:8,marginBottom:"1.5rem",flexWrap:"wrap"}}>
              {[["Skin",derivedSkin],["Hair type",derivedHairType],["Hair density",derivedHairDensity],["Face",derivedFeatures.faceShape],["Eyes",derivedFeatures.eyeColor],["Eye shape",derivedFeatures.eyeShape],["Hair color",derivedFeatures.hairColor],["Length",derivedFeatures.hairLength]].map(([l,v])=>v&&(
                <span key={l} style={{background:C.iceBlue,padding:"4px 12px",fontFamily:ag,fontSize:9,letterSpacing:"0.12em"}}>{l}: {v}</span>
              ))}
            </div>
            <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.35em",textTransform:"uppercase",color:C.gray,marginBottom:"0.75rem",textAlign:"center"}}>Your bridal look profile</p>
            <div style={{textAlign:"center",marginBottom:"1.5rem"}}>
              <div style={{fontSize:30,marginBottom:"0.5rem"}}>{priArc.icon}</div>
              <h2 style={{fontFamily:ve,fontSize:24,fontWeight:400,letterSpacing:"0.14em",marginBottom:"0.25rem"}}>{priArc.name.toUpperCase()}</h2>
              <p style={{fontFamily:co,fontStyle:"italic",fontSize:16,color:C.gray,marginBottom:"0.5rem"}}>{priArc.sub}</p>
              <span style={{background:C.iceBlue,padding:"4px 14px",fontFamily:ag,fontSize:9,letterSpacing:"0.1em"}}>Secondary: {secArc.name}</span>
            </div>
            <div style={{background:C.nearBlack,color:C.white,padding:"1.5rem",marginBottom:"1rem"}}>
              <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.lavender,marginBottom:"0.6rem"}}>Why this is your look</p>
              <p style={{fontFamily:co,fontSize:16,lineHeight:1.8,margin:0,fontStyle:"italic"}}>{priArc.why}</p>
            </div>
            {derivedHairDensity==="Fine / sparse"&&(
              <div style={{background:`${C.lavender}30`,border:`0.5px solid ${C.lavender}`,padding:"1rem 1.25rem",marginBottom:"1rem"}}>
                <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",color:"#6a3d7a",marginBottom:"0.3rem"}}>Fine hair note for your look</p>
                <p style={{fontFamily:co,fontSize:14,color:C.nearBlack,margin:0,lineHeight:1.7}}>{priArc.fine_hair_note}</p>
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(180px,100%),1fr))",gap:12,marginBottom:"1rem",minWidth:0,maxWidth:"100%"}}>
              {[["Hair",priArc.hair],["Makeup",priArc.makeup]].map(([l,d])=>(
                <div key={l} style={{background:C.iceBlue,padding:"1.25rem"}}>
                  <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,marginBottom:"0.4rem"}}>{l}</p>
                  <p style={{fontFamily:co,fontSize:14,lineHeight:1.75,margin:0}}>{d}</p>
                </div>
              ))}
            </div>
            <div style={{background:C.white,border:`0.5px solid ${C.border}`,padding:"1.4rem",marginBottom:"1rem"}}>
              <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",marginBottom:"1rem"}}>Bridal Compatibility Score™</p>
              {Object.entries(priArc.score).map(([k,v])=><ScoreBar key={k} label={k} value={v}/>)}
              <p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:C.gray,marginTop:"0.9rem",lineHeight:1.7}}>{priArc.reality}</p>
            </div>
            <div style={{background:C.blush,borderLeft:`3px solid ${C.lavender}`,padding:"1.1rem 1.4rem",marginBottom:"1.5rem"}}>
              <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray,marginBottom:"0.4rem"}}>Pinterest honesty</p>
              <p style={{fontFamily:co,fontSize:14,lineHeight:1.8,margin:0}}>{priArc.pinterest_truth}</p>
            </div>
            {(()=>{
              const currentSig=buildQuizSaveSignature();
              const alreadySaved=quizSaveStatus==="saved" && quizSavedSignature===currentSig;
              const isSaving=quizSaveStatus==="saving";
              return (
                <div style={{marginBottom:"1.5rem"}}>
                  <button
                    onClick={saveQuizToProfile}
                    disabled={isSaving||alreadySaved}
                    style={{
                      width:"100%",
                      background:alreadySaved?C.teal:C.black,
                      color:C.white,
                      border:"none",
                      padding:"16px",
                      fontSize:11,
                      letterSpacing:"0.22em",
                      cursor:isSaving?"wait":alreadySaved?"default":"pointer",
                      fontFamily:ag,
                      textTransform:"uppercase",
                      opacity:isSaving?0.65:1,
                      transition:"background 0.25s",
                    }}
                  >
                    {isSaving?"Saving…":alreadySaved?"✓ Saved":"Save To My Bridal Profile"}
                  </button>
                  {alreadySaved&&<p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:C.teal,textAlign:"center",margin:"0.6rem 0 0"}}>✓ Saved to your Bridal Profile</p>}
                  {quizSaveError&&<p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:"#cc4444",textAlign:"center",margin:"0.6rem 0 0",lineHeight:1.5}}>{quizSaveError}</p>}
                </div>
              );
            })()}
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {[["Chat with your stylist","chat"],["Build my profile","profile"],["Upload Inspo Photos","profile#inspo-board"],["View my beauty timeline","timeline"],["See product recommendations","products"],["Find my artist","directory"]].map(([l,s],i)=>(
                <button key={s} onClick={()=>{
                  if(s==="chat")setMessages([{role:"assistant",content:`Your archetype is ${priArc.name} with ${secArc.name} influence. ${derivedHairDensity==="Fine / sparse"?"Your fine hair is the most important variable here — "+priArc.fine_hair_note+" ":""}${priArc.reality} What do you want to dig into?`}]);
                  const [target,hash]=s.split("#");
                  goToScreen(target);
                  if(hash) setTimeout(()=>{const el=document.getElementById(hash); if(el) el.scrollIntoView({behavior:"smooth",block:"start"});},80);
                }} style={{background:i===0?C.black:"transparent",color:i===0?C.white:C.black,border:`0.5px solid ${i===0?C.black:C.black}`,padding:i===0?"13px":"11px",fontSize:10,letterSpacing:"0.18em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>{l}</button>
              ))}
              <button onClick={shareResult} style={{background:"transparent",color:C.black,border:`0.5px solid ${C.black}`,padding:"11px",fontSize:10,letterSpacing:"0.18em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Share My Look</button>
              <button onClick={()=>{resetQuiz();setScreen("quiz");}} style={{background:"none",border:"none",fontSize:11,color:C.gray,cursor:"pointer",fontFamily:ag,letterSpacing:"0.1em"}}>Retake quiz</button>
            </div>
            {/* Share card (rendered off-screen for html2canvas capture) */}
            <div style={{position:"fixed",left:"-10000px",top:0,width:"100%",maxWidth:"100%",overflow:"hidden",pointerEvents:"none"}}>
              <div ref={shareCardRef} style={{width:"100%",maxWidth:600,boxSizing:"border-box",padding:"3rem 2.5rem",background:C.white,textAlign:"center",fontFamily:co}}>
                <p style={{fontFamily:ag,fontSize:10,letterSpacing:"0.5em",textTransform:"uppercase",color:C.gray,marginBottom:"1.5rem"}}>The Bridal Edit™</p>
                <div style={{fontSize:40,marginBottom:"0.5rem"}}>{priArc.icon}</div>
                <h2 style={{fontFamily:ve,fontSize:28,fontWeight:400,letterSpacing:"0.16em",marginBottom:"0.3rem"}}>{priArc.name.toUpperCase()}</h2>
                <p style={{fontFamily:co,fontStyle:"italic",fontSize:17,color:C.gray,marginBottom:"1.5rem"}}>{priArc.sub}</p>
                <div style={{width:60,height:1,background:C.lavender,margin:"0 auto 1.5rem"}}/>
                <p style={{fontFamily:co,fontSize:14,color:C.gray,margin:0}}>thebaileecribb.com</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {screen==="bridalDirection"&&(
        <div style={{...screenContainerStyle,display:"flex",flexDirection:"column",alignItems:"center",padding:"2.5rem 1.5rem"}}>
          <div style={{width:"100%",maxWidth:680,display:"flex",flexDirection:"column",gap:14}}>
            <div style={{background:C.nearBlack,color:C.white,padding:"1.5rem",textAlign:"center"}}>
              <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.32em",textTransform:"uppercase",color:"#aaa",margin:"0 0 0.45rem"}}>Personal beauty blueprint</p>
              <h2 style={{fontFamily:ve,fontSize:24,fontWeight:400,letterSpacing:"0.16em",margin:"0 0 0.5rem"}}>MY BRIDAL DIRECTION</h2>
              <p style={{fontFamily:co,fontStyle:"italic",fontSize:15,lineHeight:1.7,color:"#d4d4d4",margin:0}}>A read-only reference point for your archetype, swipe preferences, and artist consultation notes.</p>
            </div>

            {directionSection("Your Bridal Archetype",
              priArc ? (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr",gap:10}}>
                    <div style={{background:C.iceBlue,padding:"1rem"}}>
                      <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.3rem"}}>Primary Archetype</p>
                      <p style={{fontFamily:ve,fontSize:18,letterSpacing:"0.1em",margin:"0 0 0.25rem"}}>{priArc.name}</p>
                      <p style={{fontFamily:co,fontStyle:"italic",fontSize:14,color:C.gray,lineHeight:1.6,margin:0}}>{priArc.sub}</p>
                    </div>
                    {secArc&&(
                      <div style={{background:C.iceBlue,padding:"1rem"}}>
                        <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.3rem"}}>Secondary Archetype</p>
                        <p style={{fontFamily:ve,fontSize:18,letterSpacing:"0.1em",margin:"0 0 0.25rem"}}>{secArc.name}</p>
                        <p style={{fontFamily:co,fontStyle:"italic",fontSize:14,color:C.gray,lineHeight:1.6,margin:0}}>{secArc.sub}</p>
                      </div>
                    )}
                  </div>
                  <p style={{fontFamily:co,fontSize:15,lineHeight:1.75,margin:0}}>{priArc.why}</p>
                </div>
              ) : (
                <div>
                  <p style={{fontFamily:co,fontSize:15,fontStyle:"italic",lineHeight:1.7,color:C.gray,margin:"0 0 0.9rem"}}>Take the archetype quiz to add your primary and secondary bridal archetypes.</p>
                  <button onClick={()=>{resetQuiz();setScreen("quiz");}} style={{background:C.black,color:C.white,border:"none",padding:"12px 22px",fontSize:10,letterSpacing:"0.18em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Find My Archetype</button>
                </div>
              )
            )}

            {directionSection("Your Preference Summary",
              <p style={{fontFamily:co,fontSize:16,lineHeight:1.75,margin:0,color:swipePreferenceSummary?.summary?C.black:C.gray,fontStyle:swipePreferenceSummary?.summary?"normal":"italic"}}>
                {swipePreferenceSummary?.summary || "Complete the Bridal Edit swipe deck to translate your image choices into clear hair and makeup language."}
              </p>,
              true
            )}

            {directionSection("You're Drawn To",
              <div style={{display:"grid",gridTemplateColumns:"1fr",gap:10}}>
                {myBridalDirectionSections.map(section=>(
                  <div key={section.title} style={{background:C.iceBlue,padding:"0.95rem"}}>
                    <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.45rem"}}>{section.title}</p>
                    {directionList(section.items)}
                  </div>
                ))}
              </div>
            )}

            {directionSection("You'd Rather Avoid",
              directionList(swipePreferenceSummary?.ratherAvoid,"Disliked images have not created a clear avoid pattern yet.")
            )}

            {directionSection("Talking Points for Your Artist",
              directionList(swipePreferenceSummary?.talkingPoints,"Complete the swipe deck to generate consultation-ready talking points."),
              true
            )}

            {directionSection("Last Updated",
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                <p style={{fontFamily:co,fontSize:15,lineHeight:1.7,margin:0,color:latestDirectionUpdatedAt?C.black:C.gray,fontStyle:latestDirectionUpdatedAt?"normal":"italic"}}>
                  {latestDirectionUpdatedAt?formatDirectionDate(latestDirectionUpdatedAt):"No quiz or swipe preference result has been generated yet."}
                </p>
                <p style={{fontFamily:co,fontSize:13,fontStyle:"italic",lineHeight:1.6,color:C.gray,margin:0}}>This page updates automatically when you retake the quiz or Bridal Edit swipe deck.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MESSAGES ──────────────────────────────────────────────────── */}
      {screen==="chat"&&(
        <div style={{...screenContainerStyle,display:"flex",flexDirection:"column",height:"100%",minHeight:0}}>
          <div style={{background:C.nearBlack,padding:"0.9rem 1.4rem",borderBottom:`0.5px solid ${C.border}`,flexShrink:0}}>
            <p style={{margin:0,fontFamily:ve,fontSize:12,letterSpacing:"0.18em",color:C.white}}>MESSAGE BAILEE</p>
            <p style={{margin:0,fontFamily:co,fontSize:12,fontStyle:"italic",color:"#aaa"}}>Bridal beauty guidance and premium messaging.</p>
          </div>
          <div style={{flex:"1 1 auto",minHeight:0,overflowY:"auto",overflowX:"hidden",WebkitOverflowScrolling:"touch",overscrollBehaviorY:"contain",padding:"1.4rem",display:"flex",flexDirection:"column",gap:16}}>
            {!session?.user&&(
              <div style={{textAlign:"center",padding:"1rem 0.5rem"}}>
                <p style={{fontFamily:co,fontStyle:"italic",fontSize:16,color:C.gray,margin:0}}>Browse bridal beauty guidance below. Sign in when you're ready to send a premium message.</p>
              </div>
            )}
            {session?.user&&!hasPremiumAccess&&(
              <div style={{textAlign:"center",padding:"1rem 0.5rem"}}>
                <p style={{fontFamily:co,fontStyle:"italic",fontSize:16,color:C.gray,margin:0}}>Browse bridal beauty guidance below. Messaging Bailee is a premium feature.</p>
              </div>
            )}
            {messages.length===0&&session?.user&&hasPremiumAccess&&(
              <div style={{textAlign:"center",padding:"2rem 0.5rem"}}>
                <p style={{fontFamily:co,fontStyle:"italic",fontSize:16,color:C.gray}}>No messages yet. Choose a guidance question below or ask Bailee anything about your bridal look, skin prep, timeline, or inspo.</p>
              </div>
            )}
            {messages.map((m)=>(
              <div key={m.id} style={{display:"flex",flexDirection:"column",gap:6}}>
                <div style={{display:"flex",justifyContent:"flex-end",maxWidth:"100%",overflowX:"hidden"}}>
                  <div style={{maxWidth:"75%",boxSizing:"border-box",overflowWrap:"break-word",wordBreak:"break-word",background:C.nearBlack,color:C.white,padding:"11px 15px",fontSize:16,lineHeight:1.8,fontFamily:co}}>{m.message||m.content}</div>
                </div>
                {m.response&&(
                  <div style={{display:"flex",justifyContent:"flex-start",maxWidth:"100%",overflowX:"hidden"}}>
                    <div style={{maxWidth:"75%",boxSizing:"border-box",overflowWrap:"break-word",wordBreak:"break-word",background:C.iceBlue,color:C.black,padding:"11px 15px",fontSize:16,lineHeight:1.8,fontFamily:co}}>{m.response}</div>
                  </div>
                )}
                {!m.response&&session?.user&&hasPremiumAccess&&(
                  <p style={{fontSize:12,fontFamily:co,fontStyle:"italic",color:C.gray,margin:0,paddingLeft:4}}>Awaiting reply...</p>
                )}
              </div>
            ))}
            {messageError&&<p style={{fontFamily:co,fontSize:13,color:"#cc4444",lineHeight:1.5,margin:0}}>{messageError}</p>}
            {chatLoading&&<div style={{background:C.iceBlue,padding:"11px 15px",fontSize:14,fontFamily:co,fontStyle:"italic",color:C.gray,alignSelf:"flex-start"}}>Sending...</div>}
            {effectiveView!=="artist"&&(
              <div style={{background:C.white,border:`0.5px solid ${C.border}`,padding:"1rem",marginTop:4}}>
                <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.35rem"}}>Bridal beauty guidance</p>
                <p style={{fontFamily:co,fontSize:12,fontStyle:"italic",color:C.gray,lineHeight:1.5,margin:"0 0 0.7rem"}}>These answers are general guidance and may vary by artist.</p>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {BRIDAL_BEAUTY_FAQS.map(faq=>{
                    const isOpen=expandedFaqQuestion===faq.question;
                    return(
                      <div key={faq.question} style={{background:C.iceBlue,border:`0.5px solid ${isOpen?C.black:C.border}`}}>
                        <button onClick={()=>toggleBridalBeautyFaq(faq)} aria-expanded={isOpen} style={{width:"100%",background:"transparent",border:"none",padding:"0.65rem 0.75rem",fontFamily:co,fontSize:14,lineHeight:1.45,color:C.nearBlack,textAlign:"left",cursor:"pointer",display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start"}}>
                          <span>{faq.question}</span>
                          <span style={{fontFamily:ag,fontSize:12,lineHeight:1,color:C.gray,flexShrink:0}}>{isOpen?"-":"+"}</span>
                        </button>
                        {isOpen&&(
                          <div style={{borderTop:`0.5px solid ${C.border}`,padding:"0.75rem",fontFamily:co,fontSize:14,lineHeight:1.65,color:C.gray,background:C.white}}>
                            {faq.answer}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div ref={chatEndRef}/>
          </div>
          <div style={{background:C.white,borderTop:`0.5px solid ${C.border}`,padding:"0.8rem 1.1rem",flexShrink:0}}>
            <div style={{display:"flex",gap:8}}>
              <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMessage()} placeholder="Ask about your look, skin prep, timeline, inspo..." style={{flex:1,border:`0.5px solid #ccc`,padding:"10px 13px",fontSize:16,fontFamily:co,outline:"none",background:C.iceBlue}}/>
              <button onClick={sendMessage} disabled={chatLoading||!chatInput.trim()} style={{background:C.black,color:C.white,border:"none",width:40,height:40,fontSize:17,cursor:"pointer",opacity:chatLoading||!chatInput.trim()?0.4:1}}>→</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TIMELINE ──────────────────────────────────────────────────── */}
      {screen==="timeline"&&hasPremiumAccess&&(
        <div style={{...screenContainerStyle,display:"flex",flexDirection:"column",alignItems:"center",padding:"2.5rem 2rem"}}>
          <div style={{width:"100%",maxWidth:620}}>
            <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.35em",textTransform:"uppercase",color:C.gray,marginBottom:"0.4rem"}}>Auto-built from your wedding date</p>
            <h2 style={{fontFamily:ve,fontSize:22,fontWeight:400,letterSpacing:"0.14em",marginBottom:"0.5rem"}}>BEAUTY TIMELINE</h2>
            <p style={{fontFamily:co,fontStyle:"italic",fontSize:14,color:C.gray,lineHeight:1.7,margin:"0 0 1rem"}}>Add or change your wedding date. The checklist updates automatically and you can mark items complete.</p>

            <div style={{background:C.blush,padding:"1rem 1.25rem",marginBottom:"1rem",display:"grid",gridTemplateColumns:"1fr auto",gap:12,alignItems:"end"}}>
              <div>
                <label style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,display:"block",marginBottom:"0.35rem"}}>Wedding date</label>
                <input type="date" value={profile.date} onChange={e=>{setProfile(p=>({...p,date:e.target.value}));setCompletedTimeline({});}} style={{border:`0.5px solid #ccc`,padding:"10px 12px",fontSize:16,fontFamily:co,outline:"none",width:"100%",boxSizing:"border-box",background:C.white}}/>
              </div>
              {profile.date&&<button onClick={()=>{setProfile(p=>({...p,date:""}));setCompletedTimeline({});}} style={{background:"transparent",border:`0.5px solid ${C.gray}`,color:C.gray,padding:"10px 12px",fontFamily:ag,fontSize:9,letterSpacing:"0.1em",cursor:"pointer"}}>Clear</button>}
            </div>

            {!profile.date&&(
              <div style={{background:C.iceBlue,padding:"1.25rem",borderLeft:`3px solid ${C.lavender}`}}>
                <p style={{fontFamily:co,fontStyle:"italic",fontSize:15,color:C.gray,margin:0}}>Pick a date first. No date, no timeline. Annoying, but technically very reasonable.</p>
              </div>
            )}

            {profile.date&&(
              <>
                <div style={{background:C.nearBlack,color:C.white,padding:"1.5rem",marginBottom:"1.25rem",textAlign:"center"}}>
                  <p style={{fontFamily:ve,fontSize:44,margin:"0 0 0.2rem",color:C.lavender}}>{daysToWedding}</p>
                  <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.2em",textTransform:"uppercase",margin:"0 0 0.9rem",color:"#aaa"}}>days until your wedding</p>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8,minWidth:0,maxWidth:"100%"}}>
                    <div style={{background:"rgba(255,255,255,0.08)",padding:"0.7rem"}}><p style={{fontFamily:ve,fontSize:20,margin:"0 0 0.1rem",color:overdueItems.length?"#ff8888":C.white}}>{overdueItems.length}</p><p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.12em",textTransform:"uppercase",color:"#aaa",margin:0}}>overdue</p></div>
                    <div style={{background:"rgba(255,255,255,0.08)",padding:"0.7rem"}}><p style={{fontFamily:ve,fontSize:20,margin:"0 0 0.1rem",color:nowItems.length?C.lavender:C.white}}>{nowItems.length}</p><p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.12em",textTransform:"uppercase",color:"#aaa",margin:0}}>next 14 days</p></div>
                    <div style={{background:"rgba(255,255,255,0.08)",padding:"0.7rem"}}><p style={{fontFamily:ve,fontSize:20,margin:"0 0 0.1rem",color:C.white}}>{completedCount}/{timeline.length}</p><p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.12em",textTransform:"uppercase",color:"#aaa",margin:0}}>complete</p></div>
                  </div>
                </div>

                {(overdueItems.length>0||nowItems.length>0)&&(
                  <div style={{background:overdueItems.length?"#fff0f0":C.iceBlue,border:`0.5px solid ${overdueItems.length?"#cc4444":C.lavender}`,padding:"0.9rem 1rem",marginBottom:"1rem"}}>
                    <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",color:overdueItems.length?"#cc4444":C.teal,margin:"0 0 0.35rem"}}>{overdueItems.length?"Needs attention":"Coming up"}</p>
                    <p style={{fontFamily:co,fontStyle:"italic",fontSize:14,color:C.gray,lineHeight:1.6,margin:0}}>{overdueItems.length?`${overdueItems.length} timeline item${overdueItems.length>1?"s are":" is"} past the recommended date. Mark complete if you've handled it.`:`${nowItems.length} item${nowItems.length>1?"s are":" is"} due in the next 14 days.`}</p>
                  </div>
                )}

                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {timeline.map((item)=>(
                    <div key={item.id} style={{border:`0.5px solid ${completedTimeline[item.id]?C.border:item.status==="overdue"?"#cc4444":item.status==="now"?C.lavender:C.border}`,background:completedTimeline[item.id]?"#fafafa":item.status==="now"?`${C.lavender}22`:C.white,padding:"1rem",display:"flex",gap:14,alignItems:"flex-start",opacity:completedTimeline[item.id]?0.58:1}}>
                      <button onClick={()=>setCompletedTimeline(p=>({...p,[item.id]:!p[item.id]}))} style={{width:30,height:30,borderRadius:"50%",background:completedTimeline[item.id]?C.black:item.status==="overdue"?"#cc4444":C.white,border:`1px solid ${completedTimeline[item.id]?C.black:item.status==="overdue"?"#cc4444":"#bbb"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:completedTimeline[item.id]||item.status==="overdue"?C.white:C.gray,flexShrink:0,marginTop:2,cursor:"pointer"}}>
                        {completedTimeline[item.id]?"✓":item.status==="overdue"?"!":""}
                      </button>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:4}}>
                          <div>
                            <p style={{margin:0,fontFamily:co,fontSize:16,color:completedTimeline[item.id]?C.gray:C.black,textDecoration:completedTimeline[item.id]?"line-through":"none",fontWeight:item.status==="now"&&!completedTimeline[item.id]?"bold":"normal"}}>{item.title}</p>
                            <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray,margin:"3px 0 0"}}>{item.dateLabel}</p>
                          </div>
                          <span style={{fontFamily:ag,fontSize:8,letterSpacing:"0.08em",background:item.status==="overdue"&&!completedTimeline[item.id]?"#cc4444":C.iceBlue,color:item.status==="overdue"&&!completedTimeline[item.id]?C.white:C.gray,padding:"3px 7px",flexShrink:0}}>{item.cat}</span>
                        </div>
                        <p style={{margin:"3px 0 0",fontFamily:co,fontStyle:"italic",fontSize:13,color:C.gray,lineHeight:1.6}}>{item.detail}</p>
                        {!completedTimeline[item.id]&&item.status==="overdue"&&<p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.1em",color:"#cc4444",margin:"7px 0 0",textTransform:"uppercase"}}>{Math.abs(item.daysUntilTask)} day{Math.abs(item.daysUntilTask)===1?"":"s"} overdue</p>}
                        {!completedTimeline[item.id]&&item.status==="now"&&<p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.1em",color:C.teal,margin:"7px 0 0",textTransform:"uppercase"}}>{item.daysUntilTask===0?"Due today":`Due in ${item.daysUntilTask} day${item.daysUntilTask===1?"":"s"}`}</p>}
                        {!completedTimeline[item.id]&&item.status==="upcoming"&&item.daysUntilTask<=45&&<p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.08em",color:"#8B6B4A",margin:"7px 0 0"}}>Coming up in {item.daysUntilTask} days</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── PRODUCTS ──────────────────────────────────────────────────── */}
      {screen==="products"&&(
        <div style={{...screenContainerStyle,display:"flex",flexDirection:"column",alignItems:"center",padding:"2.5rem 2rem"}}>
          <div style={{width:"100%",maxWidth:560}}>
            <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.35em",textTransform:"uppercase",color:C.gray,marginBottom:"0.4rem"}}>{hasPremiumAccess?"Matched to your skin, hair & archetype":"Free starter recommendations"}</p>
            <h2 style={{fontFamily:ve,fontSize:22,fontWeight:400,letterSpacing:"0.14em",marginBottom:"0.5rem"}}>YOUR PRODUCT RECOMMENDATIONS</h2>
            <p style={{fontFamily:co,fontStyle:"italic",color:C.gray,fontSize:14,marginBottom:productRecs.length>0?"2rem":"1rem",lineHeight:1.7}}>
              {hasPremiumAccess
                ? (derivedSkin||priArc?"Curated for your "+[derivedSkin,derivedHairDensity,priArc?.name].filter(Boolean).join(", ")+" profile.":"Complete the quiz to get personalized recommendations.")
                : "Free members get 2 generic bridal staples. Upgrade for recommendations matched to your archetype, skin type, hair type, and hair density."}
            </p>
            {!hasPremiumAccess&&(
              <button onClick={()=>requirePremium("Personalized product recommendations based on your specific archetype, hair type, and skin type are included with Premium.",()=>{})} style={{background:C.black,color:C.white,border:"none",padding:"12px 28px",fontSize:10,letterSpacing:"0.18em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase",marginBottom:"2rem"}}>Unlock Personalized Picks</button>
            )}
            {hasPremiumAccess&&!derivedSkin&&!priArc&&(
              <button onClick={()=>{resetQuiz();setScreen("quiz");}} style={{background:C.black,color:C.white,border:"none",padding:"12px 28px",fontSize:10,letterSpacing:"0.18em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase",marginBottom:"2rem"}}>Take the quiz first</button>
            )}
            {productRecs.length>0&&(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {productRecs.map((p,i)=>(
                  <a key={i} href={p.link} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none",color:"inherit"}}>
                    <div style={{background:C.white,border:`0.5px solid ${C.border}`,padding:"1.25rem",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,cursor:"pointer",transition:"border-color 0.15s"}}
                      onMouseEnter={e=>e.currentTarget.style.borderColor=C.black}
                      onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:"0.3rem"}}>
                          <span style={{background:C.iceBlue,padding:"2px 9px",fontFamily:ag,fontSize:8,letterSpacing:"0.1em"}}>{p.cat}</span>
                        </div>
                        <p style={{fontFamily:ve,fontSize:14,letterSpacing:"0.06em",margin:"0 0 0.25rem"}}>{p.name}</p>
                        <p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:C.gray,margin:0,lineHeight:1.6}}>{p.why}</p>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <p style={{fontFamily:ve,fontSize:15,margin:"0 0 0.3rem"}}>{p.price}</p>
                        <span style={{fontFamily:ag,fontSize:9,letterSpacing:"0.12em",color:C.teal}}>Shop →</span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
            {productRecs.length>0&&<p style={{fontFamily:co,fontStyle:"italic",fontSize:12,color:"#bbb",marginTop:"1.5rem",textAlign:"center",lineHeight:1.6}}>Some links may be affiliate links. The Bridal Edit™ only recommends products we'd actually recommend.</p>}
          </div>
        </div>
      )}

      {/* ── ADMIN ────────────────────────────────────────────────────── */}
      {screen==="admin"&&canAccessAdminFeatures&&(
        <div className="admin-dashboard" style={{...screenContainerStyle}}>
        {/* Admin dashboard header + accordion group buttons. Each button
            toggles a single group; only one group is expanded at a time.
            This keeps the long admin surface scannable on mobile. */}
        <div style={{maxWidth:900,margin:"0 auto",padding:"2rem 1.5rem 0.25rem"}}>
          <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.35em",textTransform:"uppercase",color:C.gray,marginBottom:"0.4rem"}}>Admin Workspace</p>
          <div style={{display:"flex",alignItems:"baseline",gap:10,flexWrap:"wrap"}}>
            <h2 style={{fontFamily:ve,fontSize:22,fontWeight:400,letterSpacing:"0.18em",margin:"0 0 0.45rem"}}>ADMIN TOOLS</h2>
            {adminNotifications.filter(n=>!n.read).length>0&&(
              <span aria-label={`${adminNotifications.filter(n=>!n.read).length} unread notifications`} style={{display:"inline-flex",alignItems:"center",gap:6,background:C.blush,color:C.nearBlack,padding:"3px 10px",fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",borderRadius:999}}>
                <span style={{display:"inline-block",width:6,height:6,borderRadius:"50%",background:"#cc4444"}}/>
                {adminNotifications.filter(n=>!n.read).length} new
              </span>
            )}
          </div>
          <p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:C.gray,margin:"0 0 1.25rem",lineHeight:1.6}}>Tap a section to expand. Only one section is open at a time.</p>
        </div>
        <div style={{maxWidth:900,margin:"0 auto",padding:"0 1.5rem 1rem",display:"flex",flexDirection:"column",gap:8}}>
          {[
            {id:"artist",label:"Artist Management",desc:"Applications, profiles, directory seeds, portfolio tags"},
            {id:"bride",label:"Bride / User Management",desc:"Bride messages, upcoming weddings, booked brides"},
            {id:"content",label:"Content + App Management",desc:"Product recommendations, products database"},
            {id:"analytics",label:"Analytics",desc:"App usage and weekly activity"},
            {id:"tools",label:"Admin Tools",desc:"View as toggle, welcome message, settings"},
          ].map(group=>{
            const open=adminOpenGroup===group.id;
            const badgeCount=group.id==="artist"
              ?adminNotifications.filter(n=>!n.read&&n.type==="artist_application").length
              :0;
            return (
              <button
                key={group.id}
                type="button"
                aria-expanded={open}
                onClick={()=>setAdminOpenGroup(open?null:group.id)}
                style={{
                  width:"100%",
                  display:"flex",
                  alignItems:"center",
                  justifyContent:"space-between",
                  gap:12,
                  padding:"13px 16px",
                  background:open?C.nearBlack:C.white,
                  color:open?C.white:C.black,
                  border:`0.5px solid ${open?C.nearBlack:C.border}`,
                  cursor:"pointer",
                  textAlign:"left",
                }}
              >
                <span style={{minWidth:0,flex:1,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <span style={{minWidth:0}}>
                    <span style={{display:"block",fontFamily:ag,fontSize:10,letterSpacing:"0.22em",textTransform:"uppercase"}}>{group.label}</span>
                    <span style={{display:"block",fontFamily:co,fontStyle:"italic",fontSize:12,opacity:0.72,lineHeight:1.5,marginTop:3}}>{group.desc}</span>
                  </span>
                  {badgeCount>0&&(
                    <span aria-label={`${badgeCount} new artist applications`} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:22,height:22,padding:"0 7px",background:"#cc4444",color:C.white,fontFamily:ag,fontSize:10,letterSpacing:"0.04em",borderRadius:999,fontWeight:600}}>{badgeCount}</span>
                  )}
                </span>
                <span aria-hidden="true" style={{fontFamily:ag,fontSize:16,lineHeight:1,marginLeft:12}}>{open?"−":"+"}</span>
              </button>
            );
          })}
        </div>
        {adminOpenGroup==="content"&&(<>

        {/* Products Database */}
        {(()=>{
          const categories=[...new Set(productsDb.map(p=>p.category||p.cat).filter(Boolean))].sort();
          const q=productsDbSearch.trim().toLowerCase();
          const filtered=productsDb.filter(p=>{
            const category=p.category||p.cat||"";
            if(productsDbCategoryFilter&&category!==productsDbCategoryFilter)return false;
            if(!q)return true;
            return [p.name,p.brand,p.category,p.cat,p.why,p.notes].some(v=>(v||"").toString().toLowerCase().includes(q));
          });
          return(
            <div style={{maxWidth:900,margin:"0 auto",padding:"0 1.5rem 2rem"}}>
              <div className="admin-toolbar" style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem",gap:12,flexWrap:"wrap"}}>
                <div>
                  <h2 style={{fontFamily:ve,fontSize:18,fontWeight:400,letterSpacing:"0.14em",margin:"0 0 0.25rem"}}>PRODUCTS</h2>
                  <p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:C.gray,margin:0,lineHeight:1.5}}>Search, filter, and tap any row to edit.</p>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <button onClick={()=>editAdminProduct(null)} style={{background:C.black,color:C.white,border:"none",padding:"7px 12px",fontSize:10,fontFamily:ag,letterSpacing:"0.12em",cursor:"pointer",textTransform:"uppercase"}}>New Product</button>
                  <button onClick={loadProductsDb} disabled={productsDbLoading} style={{background:"none",border:`0.5px solid ${C.border}`,padding:"7px 12px",fontSize:10,fontFamily:ag,letterSpacing:"0.12em",cursor:"pointer",textTransform:"uppercase",opacity:productsDbLoading?0.5:1}}>Refresh</button>
                </div>
              </div>
              <div style={{display:"flex",gap:8,marginBottom:"1rem",flexWrap:"wrap"}}>
                <input value={productsDbSearch} onChange={e=>setProductsDbSearch(e.target.value)} placeholder="Search name, brand, category" style={{flex:"1 1 220px",border:"0.5px solid #ccc",padding:"8px 12px",fontSize:16,fontFamily:co,outline:"none",background:C.white}}/>
                {categories.length>0&&(
                  <select value={productsDbCategoryFilter} onChange={e=>setProductsDbCategoryFilter(e.target.value)} style={{border:"0.5px solid #ccc",padding:"8px 12px",fontSize:16,fontFamily:co,outline:"none",background:C.white}}>
                    <option value="">All categories</option>
                    {categories.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                )}
              </div>
              {productsDbError&&<div style={{background:"#fff0f0",border:"0.5px solid #cc4444",padding:"0.9rem 1rem",marginBottom:"1rem",fontFamily:co,fontStyle:"italic",color:"#cc4444"}}>{productsDbError}</div>}
              {productsDbLoading&&<p style={{fontFamily:co,fontStyle:"italic",color:C.gray}}>Loading products...</p>}
              {!productsDbLoading&&!productsDbError&&productsDb.length===0&&<p style={{fontFamily:co,fontStyle:"italic",color:C.gray}}>No products found yet.</p>}
              {!productsDbLoading&&!productsDbError&&productsDb.length>0&&filtered.length===0&&<p style={{fontFamily:co,fontStyle:"italic",color:C.gray}}>No products match your search.</p>}
              {!productsDbLoading&&filtered.length>0&&(
                <div className="table-scroll" style={{overflowX:"auto",border:`0.5px solid ${C.border}`,background:C.white,maxWidth:"100%",minWidth:0}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontFamily:co,fontSize:13}}>
                    <thead>
                      <tr style={{background:C.iceBlue}}>
                        {["Product","Category","Price","Link","Updated"].map(label=>(
                          <th key={label} style={{textAlign:"left",padding:"10px 12px",fontFamily:ag,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray,borderBottom:`0.5px solid ${C.border}`,whiteSpace:"nowrap"}}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(p=>{
                        const link=p.link||p.affiliate_url||"";
                        const category=p.category||p.cat||"—";
                        return(
                        <tr key={p.id} onClick={()=>editAdminProduct(p)} style={{borderBottom:`0.5px solid ${C.border}`,cursor:"pointer"}}>
                          <td style={{padding:"10px 12px",verticalAlign:"top",minWidth:190}}>
                            <p style={{fontFamily:ve,fontSize:13,letterSpacing:"0.06em",margin:"0 0 0.15rem"}}>{p.name||"Untitled"}</p>
                            <p style={{fontFamily:co,fontSize:12,color:C.gray,fontStyle:"italic",lineHeight:1.35,margin:0,maxWidth:360}}>{p.why||p.notes||"No recommendation note"}</p>
                          </td>
                          <td style={{padding:"10px 12px",verticalAlign:"top",whiteSpace:"nowrap"}}>{category}</td>
                          <td style={{padding:"10px 12px",verticalAlign:"top",whiteSpace:"nowrap"}}>{p.price||"—"}</td>
                          <td style={{padding:"10px 12px",verticalAlign:"top",whiteSpace:"nowrap"}}>{link?<a href={link} target="_blank" rel="noopener noreferrer" onClick={event=>event.stopPropagation()} style={{color:C.teal}}>Open</a>:<span style={{color:"#bbb"}}>—</span>}</td>
                          <td style={{padding:"10px 12px",verticalAlign:"top",whiteSpace:"nowrap",color:C.gray}}>{p.updated_at||p.created_at?new Date(p.updated_at||p.created_at).toLocaleDateString():"—"}</td>
                        </tr>
                      );})}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}
        {adminProductEditorOpen&&(
          <div onClick={resetAdminProductForm} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.42)",display:"flex",alignItems:"flex-end",justifyContent:"center",padding:"1rem",zIndex:1000}}>
            <form onSubmit={saveAdminProduct} onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:560,background:C.white,border:`0.5px solid ${C.border}`,padding:"1rem",boxShadow:"0 16px 48px rgba(0,0,0,0.24)",display:"grid",gap:9}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start"}}>
                <div>
                  <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.3rem"}}>{editingProductId?"Edit Product":"New Product"}</p>
                  <h3 style={{fontFamily:ve,fontSize:17,letterSpacing:"0.1em",fontWeight:400,margin:0}}>PRODUCT DETAILS</h3>
                </div>
                <button type="button" onClick={resetAdminProductForm} style={{background:"transparent",border:"none",fontFamily:ag,fontSize:18,cursor:"pointer",color:C.gray}}>×</button>
              </div>
              <input value={adminProductForm.name} onChange={e=>setAdminProductForm(p=>({...p,name:e.target.value}))} placeholder="Product name" style={{border:"0.5px solid #ccc",padding:"9px 10px",fontSize:16,fontFamily:co,outline:"none",background:C.white}}/>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(180px,100%),1fr))",gap:8,minWidth:0,maxWidth:"100%"}}>
                <input value={adminProductForm.price} onChange={e=>setAdminProductForm(p=>({...p,price:e.target.value}))} placeholder="Price" style={{border:"0.5px solid #ccc",padding:"9px 10px",fontSize:16,fontFamily:co,outline:"none",background:C.white}}/>
                <input value={adminProductForm.cat} onChange={e=>setAdminProductForm(p=>({...p,cat:e.target.value}))} placeholder="Category" style={{border:"0.5px solid #ccc",padding:"9px 10px",fontSize:16,fontFamily:co,outline:"none",background:C.white}}/>
              </div>
              <input value={adminProductForm.link} onChange={e=>setAdminProductForm(p=>({...p,link:e.target.value}))} placeholder="Product link" style={{border:"0.5px solid #ccc",padding:"9px 10px",fontSize:16,fontFamily:co,outline:"none",background:C.white}}/>
              <textarea value={adminProductForm.why} onChange={e=>setAdminProductForm(p=>({...p,why:e.target.value}))} placeholder="Why this product is recommended" rows={3} style={{border:"0.5px solid #ccc",padding:"9px 10px",fontSize:16,fontFamily:co,resize:"vertical",outline:"none",background:C.white}}/>
              <div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap",marginTop:2}}>
                {editingProductId?<button type="button" onClick={()=>deleteAdminProduct(editingProductId)} disabled={adminLoading} style={{background:"#fff0f0",border:"0.5px solid #cc4444",color:"#cc4444",padding:"9px 13px",fontSize:9,fontFamily:ag,letterSpacing:"0.12em",textTransform:"uppercase",cursor:"pointer",opacity:adminLoading?0.5:1}}>Delete</button>:<span/>}
                <div style={{display:"flex",gap:8}}>
                  <button type="button" onClick={resetAdminProductForm} style={{background:"transparent",color:C.gray,border:`0.5px solid ${C.gray}`,padding:"9px 13px",fontSize:9,letterSpacing:"0.14em",fontFamily:ag,textTransform:"uppercase",cursor:"pointer"}}>Cancel</button>
                  <button disabled={adminLoading||!adminProductForm.name.trim()} style={{background:C.black,color:C.white,border:"none",padding:"9px 15px",fontSize:9,letterSpacing:"0.14em",fontFamily:ag,textTransform:"uppercase",cursor:"pointer",opacity:adminLoading||!adminProductForm.name.trim()?0.5:1}}>{adminLoading?"Saving...":"Save Product"}</button>
                </div>
              </div>
            </form>
          </div>
        )}
        </>)}

        {adminOpenGroup==="analytics"&&(
        <div style={{maxWidth:700,margin:"2rem auto",padding:"0 1.5rem 2rem"}}>
          <h2 style={{fontFamily:ve,fontSize:18,fontWeight:400,letterSpacing:"0.14em",marginBottom:"1rem"}}>ANALYTICS</h2>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(180px,100%),1fr))",gap:10,minWidth:0,maxWidth:"100%"}}>
            {[["Total Signups",adminStats.signups],["Messages This Week",adminStats.messagesThisWeek],["Top Archetype",adminStats.topArchetype],["Weddings in 30 Days",adminStats.upcomingWeddings]].map(([l,v])=>(
              <div key={l} style={{background:C.nearBlack,padding:"1.1rem",textAlign:"center"}}>
                <p style={{margin:0,fontFamily:ve,fontSize:20,color:C.white,letterSpacing:"0.06em"}}>{v}</p>
                <p style={{margin:"4px 0 0",fontFamily:ag,fontSize:8,letterSpacing:"0.14em",textTransform:"uppercase",color:C.lavender}}>{l}</p>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* Portfolio Photo Tags */}
        {adminOpenGroup==="artist"&&(
        <div style={{maxWidth:900,margin:"0 auto",padding:"0 1.5rem 2rem",boxSizing:"border-box",overflowX:"hidden"}}>
          <div className="admin-toolbar" style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem",gap:12,flexWrap:"wrap"}}>
            <div>
              <h2 style={{fontFamily:ve,fontSize:18,fontWeight:400,letterSpacing:"0.14em",margin:"0 0 0.25rem"}}>PORTFOLIO PHOTO TAGS</h2>
              <p style={{fontFamily:co,fontSize:13,fontStyle:"italic",color:C.gray,margin:0,lineHeight:1.5}}>Edit category, look type, and swipe-result tags for uploaded artist photos.</p>
            </div>
            <button onClick={loadAdminPortfolioPhotos} disabled={adminPortfolioLoading} style={{background:"none",border:`0.5px solid ${C.border}`,padding:"7px 12px",fontSize:10,fontFamily:ag,letterSpacing:"0.12em",cursor:adminPortfolioLoading?"wait":"pointer",textTransform:"uppercase",opacity:adminPortfolioLoading?0.5:1}}>Refresh</button>
          </div>
          {renderPortfolioTagWorkflow({
            photos:adminPortfolioPhotos,
            scope:"admin",
            loading:adminPortfolioLoading,
            error:adminPortfolioError,
            emptyText:"No uploaded portfolio photos found.",
          })}
        </div>
        )}

        {/* Bride Messages */}
        {adminOpenGroup==="bride"&&(<>
        <div style={{maxWidth:700,margin:"0 auto",padding:"0 1.5rem 2rem"}}>
          <div className="admin-toolbar" style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem",gap:12,flexWrap:"wrap"}}>
            <h2 style={{fontFamily:ve,fontSize:18,fontWeight:400,letterSpacing:"0.14em",margin:0}}>BRIDE MESSAGES</h2>
            <button onClick={loadAdminMessages} style={{background:"none",border:`0.5px solid ${C.border}`,padding:"5px 12px",fontSize:10,fontFamily:ag,letterSpacing:"0.12em",cursor:"pointer",textTransform:"uppercase"}}>Refresh</button>
          </div>
          {adminMsgError&&<p style={{fontFamily:co,fontSize:13,color:"#cc4444",lineHeight:1.5,margin:"0 0 0.75rem"}}>{adminMsgError}</p>}
          {!adminMsgViewAll&&(<>
            {adminMsgLoading&&<p style={{fontFamily:co,fontStyle:"italic",color:C.gray}}>Loading...</p>}
            {(()=>{const unreplied=adminMessages.filter(m=>!m.response).slice(0,3);return unreplied.length===0?<p style={{fontFamily:co,fontStyle:"italic",color:C.gray}}>No unreplied messages.</p>:unreplied.map(m=>(
              <div key={m.id} style={{border:`0.5px solid ${C.border}`,padding:"1rem",marginBottom:"0.75rem",background:C.iceBlue,minWidth:0}}>
                <div className="admin-message-header" style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6,gap:8}}>
                  <p style={{margin:0,fontFamily:ag,fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",color:C.black,minWidth:0}}>{m.bride_name?`${m.bride_name} — `:""}{m.bride_email||"Unknown"}</p>
                  <p style={{margin:0,fontFamily:co,fontSize:11,color:C.gray,minWidth:0}}>{new Date(m.created_at).toLocaleString()}</p>
                </div>
                <p style={{margin:"6px 0 10px",fontFamily:co,fontSize:15,lineHeight:1.6,color:C.black}}>{m.message}</p>
                <div className="admin-action-row" style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <input value={adminReplyInputs[m.id]||""} onChange={e=>setAdminReplyInputs(prev=>({...prev,[m.id]:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&sendAdminReply(m.id)} placeholder="Type your reply..." style={{flex:"1 1 180px",minWidth:0,border:`0.5px solid #ccc`,padding:"8px 12px",fontSize:16,fontFamily:co,outline:"none"}}/>
                  <button onClick={()=>sendAdminReply(m.id)} disabled={!(adminReplyInputs[m.id]||"").trim()} style={{background:C.black,color:C.white,border:"none",padding:"8px 16px",fontSize:10,fontFamily:ag,letterSpacing:"0.12em",textTransform:"uppercase",cursor:"pointer",opacity:!(adminReplyInputs[m.id]||"").trim()?0.4:1}}>Reply</button>
                </div>
              </div>
            ));})()}
            <button onClick={()=>setAdminMsgViewAll(true)} style={{background:"none",border:`0.5px solid ${C.black}`,padding:"10px",width:"100%",fontSize:10,fontFamily:ag,letterSpacing:"0.14em",textTransform:"uppercase",cursor:"pointer",marginTop:"0.5rem"}}>View All Messages ({adminMessages.length})</button>
          </>)}
          {adminMsgViewAll&&(<>
            <div className="admin-action-row" style={{display:"flex",gap:8,marginBottom:"1rem",flexWrap:"wrap"}}>
              {["unreplied","replied","all"].map(f=>(
                <button key={f} onClick={()=>setAdminMsgFilter(f)} style={{background:adminMsgFilter===f?C.black:"transparent",color:adminMsgFilter===f?C.white:C.black,border:`0.5px solid ${C.black}`,padding:"6px 14px",fontSize:9,fontFamily:ag,letterSpacing:"0.12em",textTransform:"uppercase",cursor:"pointer"}}>{f}</button>
              ))}
              <button onClick={()=>setAdminMsgViewAll(false)} style={{marginLeft:"auto",background:"none",border:"none",fontFamily:ag,fontSize:9,letterSpacing:"0.1em",color:C.gray,cursor:"pointer",textTransform:"uppercase"}}>← Back</button>
            </div>
            {(()=>{
              const grouped={};
              const filtered=adminMessages.filter(m=>adminMsgFilter==="unreplied"?!m.response:adminMsgFilter==="replied"?!!m.response:true);
              filtered.forEach(m=>{const key=m.bride_email||m.bride_user_id;if(!grouped[key])grouped[key]={name:m.bride_name,email:m.bride_email,msgs:[]};grouped[key].msgs.push(m);});
              return Object.entries(grouped).map(([key,g])=>(
                <div key={key} style={{marginBottom:"1.5rem"}}>
                  <p style={{fontFamily:ag,fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",color:C.black,marginBottom:"0.5rem"}}>{g.name?`${g.name} — `:""}{g.email||"Unknown"}</p>
                  {g.msgs.map(m=>(
                    <div key={m.id} style={{border:`0.5px solid ${C.border}`,padding:"1rem",marginBottom:"0.5rem",background:m.response?C.white:C.iceBlue,minWidth:0}}>
                      <div className="admin-message-header" style={{display:"flex",justifyContent:"space-between",marginBottom:4,gap:8}}>
                        <p style={{margin:0,fontFamily:co,fontSize:15,lineHeight:1.6,color:C.black,minWidth:0}}>{m.message}</p>
                        <p style={{margin:0,fontFamily:co,fontSize:11,color:C.gray,marginLeft:12,minWidth:0}}>{new Date(m.created_at).toLocaleString()}</p>
                      </div>
                      {m.response?(
                        <div style={{background:C.iceBlue,padding:"8px 12px",marginTop:6}}>
                          <p style={{margin:0,fontFamily:co,fontSize:14,lineHeight:1.5,color:C.black}}>{m.response}</p>
                          <p style={{margin:"4px 0 0",fontFamily:co,fontSize:11,color:C.gray,fontStyle:"italic"}}>{m.responded_at?new Date(m.responded_at).toLocaleString():""}</p>
                        </div>
                      ):(
                        <div className="admin-action-row" style={{display:"flex",gap:8,marginTop:6,flexWrap:"wrap"}}>
                          <input value={adminReplyInputs[m.id]||""} onChange={e=>setAdminReplyInputs(prev=>({...prev,[m.id]:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&sendAdminReply(m.id)} placeholder="Type your reply..." style={{flex:"1 1 180px",minWidth:0,border:`0.5px solid #ccc`,padding:"8px 12px",fontSize:16,fontFamily:co,outline:"none"}}/>
                          <button onClick={()=>sendAdminReply(m.id)} disabled={!(adminReplyInputs[m.id]||"").trim()} style={{background:C.black,color:C.white,border:"none",padding:"8px 16px",fontSize:10,fontFamily:ag,letterSpacing:"0.12em",textTransform:"uppercase",cursor:"pointer",opacity:!(adminReplyInputs[m.id]||"").trim()?0.4:1}}>Reply</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ));
            })()}
          </>)}
        </div>

        {/* Upcoming Weddings */}
        <div style={{maxWidth:700,margin:"0 auto",padding:"0 1.5rem 2rem"}}>
          <h2 style={{fontFamily:ve,fontSize:18,fontWeight:400,letterSpacing:"0.14em",marginBottom:"1rem"}}>UPCOMING WEDDINGS</h2>
          {adminWeddings.length===0?<p style={{fontFamily:co,fontStyle:"italic",color:C.gray}}>No weddings in the next 60 days.</p>:
            adminWeddings.map(w=>{
              const days=Math.ceil((new Date(w.date)-new Date())/(1000*60*60*24));
              return(
                <div key={w.id} className="admin-list-row" style={{display:"flex",justifyContent:"space-between",alignItems:"center",border:`0.5px solid ${C.border}`,padding:"0.9rem 1rem",marginBottom:"0.5rem",background:days<=14?`${C.lavender}20`:C.white,gap:10}}>
                  <div style={{minWidth:0}}>
                    <p style={{margin:0,fontFamily:ve,fontSize:13,letterSpacing:"0.08em"}}>{w.name||"—"}</p>
                    <p style={{margin:0,fontFamily:co,fontSize:12,color:C.gray}}>{w.email}</p>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <p style={{margin:0,fontFamily:ag,fontSize:11,letterSpacing:"0.06em",color:days<=14?"#cc4444":C.black}}>{days} days</p>
                    <p style={{margin:0,fontFamily:co,fontSize:11,color:C.gray}}>{new Date(w.date).toLocaleDateString()}</p>
                  </div>
                </div>
              );
            })
          }
        </div>

        {/* Booked Brides — Free Membership */}
        <div style={{maxWidth:700,margin:"0 auto",padding:"0 1.5rem 2rem"}}>
          <div className="admin-toolbar" style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem",gap:12,flexWrap:"wrap"}}>
            <h2 style={{fontFamily:ve,fontSize:18,fontWeight:400,letterSpacing:"0.14em",margin:0}}>BOOKED BRIDES · FREE MEMBERSHIP</h2>
            <button onClick={loadBookedBrides} style={{background:"none",border:`0.5px solid ${C.border}`,padding:"5px 12px",fontSize:10,fontFamily:ag,letterSpacing:"0.12em",cursor:"pointer",textTransform:"uppercase"}}>Refresh</button>
          </div>
          <div className="booked-bride-form" style={{display:"flex",gap:8,marginBottom:"0.75rem",flexWrap:"wrap",alignItems:"stretch"}}>
            <input value={bookedBrideEmail} onChange={e=>setBookedBrideEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&grantFreeMembership()} placeholder="bride@email.com" style={{flex:"1 1 220px",minWidth:0,width:"100%",maxWidth:"100%",border:"0.5px solid #ccc",padding:"8px 12px",fontSize:16,fontFamily:co,outline:"none",overflowWrap:"anywhere"}}/>
            <button onClick={grantFreeMembership} disabled={bookedBrideLoading||!bookedBrideEmail.trim()} style={{flex:"0 1 auto",minWidth:0,maxWidth:"100%",background:C.black,color:C.white,border:"none",padding:"8px 16px",fontSize:10,fontFamily:ag,letterSpacing:"0.12em",textTransform:"uppercase",cursor:"pointer",opacity:bookedBrideLoading||!bookedBrideEmail.trim()?0.4:1}}>Grant Free Membership</button>
          </div>
          {bookedBrideError&&<p style={{fontFamily:co,fontSize:12,color:"#cc4444",margin:"0 0 0.5rem"}}>{bookedBrideError}</p>}
          {bookedBrideMessage&&<p style={{fontFamily:co,fontSize:12,color:C.teal,margin:"0 0 0.5rem"}}>{bookedBrideMessage}</p>}
          {bookedBrideLoading&&<p style={{fontFamily:co,fontStyle:"italic",color:C.gray}}>Loading...</p>}
          {!bookedBrideLoading&&bookedBrides.length===0&&<p style={{fontFamily:co,fontStyle:"italic",color:C.gray}}>No booked brides yet.</p>}
          {bookedBrides.map(b=>(
            <div key={b.id} className="admin-list-row" style={{display:"flex",justifyContent:"space-between",alignItems:"center",border:`0.5px solid ${C.border}`,padding:"0.9rem 1rem",marginBottom:"0.5rem",background:C.white,gap:10}}>
              <div style={{minWidth:0}}>
                <p style={{margin:0,fontFamily:ve,fontSize:13,letterSpacing:"0.08em"}}>{b.first_name||b.name||"—"}</p>
                <p style={{margin:0,fontFamily:co,fontSize:12,color:C.gray}}>{b.email||"—"}{b.date?` · ${new Date(b.date).toLocaleDateString()}`:""}</p>
              </div>
              <button onClick={()=>revokeFreeMembership(b.id)} style={{background:"none",color:"#cc4444",border:`0.5px solid #cc4444`,padding:"7px 14px",fontSize:9,fontFamily:ag,letterSpacing:"0.12em",textTransform:"uppercase",cursor:"pointer"}}>Revoke</button>
            </div>
          ))}
        </div>
        </>)}

        {/* Artist application notifications feed */}
        {adminOpenGroup==="artist"&&(
        <div style={{maxWidth:700,margin:"0 auto",padding:"0 1.5rem 1rem"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.75rem",gap:10,flexWrap:"wrap"}}>
            <div>
              <h2 style={{fontFamily:ve,fontSize:16,fontWeight:400,letterSpacing:"0.14em",margin:"0 0 0.2rem"}}>NOTIFICATIONS</h2>
              <p style={{fontFamily:co,fontStyle:"italic",fontSize:12,color:C.gray,margin:0,lineHeight:1.5}}>New artist applications alert you here automatically.</p>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button onClick={loadAdminNotifications} disabled={adminNotifLoading} style={{background:"none",border:`0.5px solid ${C.border}`,padding:"5px 12px",fontSize:10,fontFamily:ag,letterSpacing:"0.12em",cursor:"pointer",textTransform:"uppercase",opacity:adminNotifLoading?0.5:1}}>Refresh</button>
              {adminNotifications.some(n=>!n.read)&&(
                <button onClick={markAllAdminNotificationsRead} style={{background:C.nearBlack,color:C.white,border:"none",padding:"5px 12px",fontSize:10,fontFamily:ag,letterSpacing:"0.12em",cursor:"pointer",textTransform:"uppercase"}}>Mark all read</button>
              )}
            </div>
          </div>
          {adminNotifError&&<p style={{fontFamily:co,fontSize:12,color:"#cc4444",margin:"0 0 0.75rem"}}>{adminNotifError}</p>}
          {!adminNotifLoading&&adminNotifications.length===0&&!adminNotifError&&(
            <p style={{fontFamily:co,fontStyle:"italic",fontSize:12,color:C.gray,margin:"0 0 1rem"}}>No notifications yet.</p>
          )}
          {adminNotifications.slice(0,5).map(n=>{
            const applicantId=n?.data?.application_id;
            return (
              <div key={n.id} onClick={()=>{if(!n.read)markAdminNotificationRead(n.id,true);if(applicantId)setExpandedAppId(applicantId);}} style={{cursor:"pointer",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10,border:`0.5px solid ${C.border}`,borderLeft:n.read?`0.5px solid ${C.border}`:`3px solid #cc4444`,padding:"0.7rem 0.9rem",marginBottom:"0.5rem",background:n.read?C.white:C.iceBlue}}>
                <div style={{minWidth:0,flex:1}}>
                  <p style={{margin:"0 0 2px",fontFamily:ag,fontSize:10,letterSpacing:"0.14em",textTransform:"uppercase",color:n.read?C.gray:C.nearBlack}}>{n.title}</p>
                  <p style={{margin:"0 0 3px",fontFamily:co,fontSize:13,color:C.black,lineHeight:1.4}}>{n.message}</p>
                  <p style={{margin:0,fontFamily:co,fontSize:11,color:C.gray}}>{n.created_at?new Date(n.created_at).toLocaleString():""}</p>
                </div>
                {!n.read&&<span aria-hidden="true" style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:"#cc4444",marginTop:6}}/>}
              </div>
            );
          })}
        </div>
        )}

        {/* Artist Applications */}
        {adminOpenGroup==="artist"&&(<>
        <div style={{maxWidth:700,margin:"0 auto",padding:"0 1.5rem 2rem"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.2rem"}}>
            <h2 style={{fontFamily:ve,fontSize:18,fontWeight:400,letterSpacing:"0.14em",margin:0}}>ARTIST APPLICATIONS</h2>
            <button onClick={loadAdminApps} disabled={adminAppsLoading} style={{background:"none",border:`0.5px solid ${C.border}`,padding:"5px 12px",fontSize:10,fontFamily:ag,letterSpacing:"0.12em",cursor:"pointer",textTransform:"uppercase",opacity:adminAppsLoading?0.5:1}}>Refresh</button>
          </div>
          {adminAppsError&&<div style={{background:"#fff0f0",border:"0.5px solid #cc4444",padding:"0.9rem 1rem",marginBottom:"1rem",fontFamily:co,fontStyle:"italic",color:"#cc4444"}}>{adminAppsError}</div>}
          {adminAppsLoading&&<p style={{fontFamily:co,fontStyle:"italic",color:C.gray}}>Loading applications...</p>}
          {!adminAppsLoading&&!adminAppsError&&adminApps.length===0&&<p style={{fontFamily:co,fontStyle:"italic",color:C.gray}}>No applications yet.</p>}
          {adminApps.map(a=>{
            const isExpanded=expandedAppId===a.id;
            const isActing=appActionId===a.id;
            const detailEntries=Object.entries(a).filter(([k])=>!["id"].includes(k));
            return(
              <div key={a.id} style={{border:`0.5px solid ${C.border}`,padding:"1rem",marginBottom:"1rem",background:a.status==="pending"?C.iceBlue:a.status==="approved"?"#eaf7ea":"#faf0f0"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:8}}>
                  <p style={{margin:0,fontFamily:ve,fontSize:14,letterSpacing:"0.08em"}}>{a.name||"—"}</p>
                  <span style={{fontFamily:ag,fontSize:9,letterSpacing:"0.1em",textTransform:"uppercase",color:a.status==="pending"?C.gray:a.status==="approved"?C.teal:"#cc4444"}}>{a.status||"pending"}</span>
                </div>
                <p style={{margin:"0 0 4px",fontFamily:ag,fontSize:10,letterSpacing:"0.08em",color:C.gray}}>{a.business_name||"—"} · {artistLocationLabel(a)||"—"}</p>
                <p style={{margin:"0 0 4px",fontFamily:co,fontSize:13,color:C.black}}>{a.email||"—"}{a.instagram?` · ${a.instagram}`:""}</p>
                {a.created_at&&<p style={{margin:"0 0 8px",fontFamily:co,fontSize:11,color:C.gray}}>Applied {new Date(a.created_at).toLocaleString()}</p>}
                {isExpanded&&(
                  <div style={{background:C.white,border:`0.5px solid ${C.border}`,padding:"0.85rem 1rem",margin:"8px 0 10px"}}>
                    <p style={{margin:"0 0 8px",fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray}}>Application Details</p>
                    <div style={{display:"grid",gridTemplateColumns:"minmax(110px,140px) 1fr",rowGap:6,columnGap:12}}>
                      {detailEntries.map(([k,v])=>{
                        let display;
                        if(v==null||v==="")display=<span style={{color:"#bbb"}}>—</span>;
                        else if(k==="created_at"||k==="updated_at")display=new Date(v).toLocaleString();
                        else if(Array.isArray(v))display=v.join(", ")||<span style={{color:"#bbb"}}>—</span>;
                        else if(typeof v==="object")display=<code style={{fontSize:11}}>{JSON.stringify(v)}</code>;
                        else display=String(v);
                        return(
                          <Fragment key={k}>
                            <div style={{fontFamily:ag,fontSize:9,letterSpacing:"0.1em",textTransform:"uppercase",color:C.gray,paddingTop:2}}>{k}</div>
                            <div style={{fontFamily:co,fontSize:13,color:C.black,wordBreak:"break-word"}}>{display}</div>
                          </Fragment>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <button onClick={()=>setExpandedAppId(isExpanded?null:a.id)} style={{background:"none",border:`0.5px solid ${C.black}`,padding:"7px 16px",fontSize:9,fontFamily:ag,letterSpacing:"0.12em",textTransform:"uppercase",cursor:"pointer",color:C.black}}>{isExpanded?"Hide Details":"View Details"}</button>
                  {a.status==="pending"&&(
                    <>
                      <button onClick={()=>approveApplication(a)} disabled={isActing} style={{background:C.teal,color:C.white,border:"none",padding:"7px 16px",fontSize:9,fontFamily:ag,letterSpacing:"0.12em",textTransform:"uppercase",cursor:"pointer",opacity:isActing?0.5:1}}>{isActing?"Working...":"Approve"}</button>
                      <button onClick={()=>rejectApplication(a.id)} disabled={isActing} style={{background:"none",color:"#cc4444",border:`0.5px solid #cc4444`,padding:"7px 16px",fontSize:9,fontFamily:ag,letterSpacing:"0.12em",textTransform:"uppercase",cursor:"pointer",opacity:isActing?0.5:1}}>{isActing?"Working...":"Reject"}</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Directory Seeds */}
        <div style={{maxWidth:700,margin:"0 auto",padding:"0 1.5rem 2rem"}}>
          <div className="admin-toolbar" style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem",gap:12,flexWrap:"wrap"}}>
            <h2 style={{fontFamily:ve,fontSize:18,fontWeight:400,letterSpacing:"0.14em",margin:0}}>DIRECTORY SEEDS</h2>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",maxWidth:"100%"}}>
              <button onClick={addSeedArtist} disabled={seedArtistSaving} style={{background:C.black,color:C.white,border:"none",padding:"7px 12px",fontSize:10,fontFamily:ag,letterSpacing:"0.12em",cursor:"pointer",textTransform:"uppercase",opacity:seedArtistSaving?0.5:1}}>Add Seed Artist</button>
              <button onClick={loadSeedArtists} disabled={seedArtistLoading} style={{background:"none",border:`0.5px solid ${C.border}`,padding:"7px 12px",fontSize:10,fontFamily:ag,letterSpacing:"0.12em",cursor:"pointer",textTransform:"uppercase",opacity:seedArtistLoading?0.5:1}}>Refresh</button>
            </div>
          </div>
          {seedArtistError&&<p style={{fontFamily:co,fontSize:13,color:"#cc4444",lineHeight:1.5,margin:"0 0 0.75rem"}}>{seedArtistError}</p>}
          {seedArtistMessage&&<p style={{fontFamily:co,fontSize:13,color:C.teal,lineHeight:1.5,margin:"0 0 0.75rem"}}>{seedArtistMessage}</p>}
          {seedArtistFormOpen&&(
            <form onSubmit={saveSeedArtist} style={{background:C.iceBlue,padding:"1rem",marginBottom:"1.25rem",display:"flex",flexDirection:"column",gap:8,width:"100%",maxWidth:"100%",boxSizing:"border-box",overflowX:"hidden"}}>
              <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,margin:0}}>{editingSeedArtistId?"Edit Directory Seed":"Create Seed Artist"}</p>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8,width:"100%",maxWidth:"100%",minWidth:0}}>
                {[["name","Name"],["owner","Owner"],["city","City"],["state","State / Province / Region"],["country","Country"],["services","Services"],["badge","Badge"],["rating","Rating"],["reviews","Reviews"],["avatar","Avatar"],["price","Price"],["email","Email"],["website","Website"],["profile_photo_url","Profile Photo URL"]].map(([k,p])=>(
                  <input key={k} value={seedArtistForm[k]} onChange={e=>setSeedArtistForm(f=>({...f,[k]:e.target.value}))} placeholder={p} style={{width:"100%",minWidth:0,boxSizing:"border-box",border:"0.5px solid #ccc",padding:"8px 10px",fontSize:16,fontFamily:co,outline:"none",background:C.white}}/>
                ))}
              </div>
              <label style={{display:"flex",alignItems:"center",gap:8,fontFamily:ag,fontSize:9,letterSpacing:"0.1em",color:C.gray,cursor:"pointer"}}>
                <input type="checkbox" checked={seedArtistForm.travel} onChange={e=>setSeedArtistForm(f=>({...f,travel:e.target.checked}))} style={{accentColor:C.black}}/>Travels for Weddings
              </label>
              {[["specialties","Specialties (comma separated)"],["not_ideal","Not Ideal (comma separated)"],["best_for","Best For (comma separated)"],["fit_styles","Fit Styles (comma separated)"]].map(([k,p])=>(
                <input key={k} value={seedArtistForm[k]} onChange={e=>setSeedArtistForm(f=>({...f,[k]:e.target.value}))} placeholder={p} style={{width:"100%",minWidth:0,boxSizing:"border-box",border:"0.5px solid #ccc",padding:"8px 10px",fontSize:16,fontFamily:co,outline:"none",background:C.white}}/>
              ))}
              <textarea value={seedArtistForm.aesthetic} onChange={e=>setSeedArtistForm(f=>({...f,aesthetic:e.target.value}))} placeholder="Aesthetic" rows={2} style={{width:"100%",minWidth:0,boxSizing:"border-box",border:"0.5px solid #ccc",padding:"8px 10px",fontSize:16,fontFamily:co,resize:"vertical",outline:"none",background:C.white}}/>
              <textarea value={seedArtistForm.bio} onChange={e=>setSeedArtistForm(f=>({...f,bio:e.target.value}))} placeholder="Bio" rows={3} style={{width:"100%",minWidth:0,boxSizing:"border-box",border:"0.5px solid #ccc",padding:"8px 10px",fontSize:16,fontFamily:co,resize:"vertical",outline:"none",background:C.white}}/>
              <textarea value={seedArtistForm.portfolio} onChange={e=>setSeedArtistForm(f=>({...f,portfolio:e.target.value}))} placeholder="Portfolio" rows={2} style={{width:"100%",minWidth:0,boxSizing:"border-box",border:"0.5px solid #ccc",padding:"8px 10px",fontSize:16,fontFamily:co,resize:"vertical",outline:"none",background:C.white}}/>
              <textarea value={seedArtistForm.education} onChange={e=>setSeedArtistForm(f=>({...f,education:e.target.value}))} placeholder="Education" rows={2} style={{width:"100%",minWidth:0,boxSizing:"border-box",border:"0.5px solid #ccc",padding:"8px 10px",fontSize:16,fontFamily:co,resize:"vertical",outline:"none",background:C.white}}/>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button type="submit" disabled={seedArtistSaving||!seedArtistForm.name.trim()} style={{background:C.black,color:C.white,border:"none",padding:"10px 18px",fontSize:9,letterSpacing:"0.14em",fontFamily:ag,textTransform:"uppercase",cursor:"pointer",opacity:seedArtistSaving||!seedArtistForm.name.trim()?0.5:1}}>{seedArtistSaving?"Saving...":editingSeedArtistId?"Save":"Create Seed Artist"}</button>
                <button type="button" onClick={cancelSeedArtistEdit} disabled={seedArtistSaving} style={{background:"transparent",color:C.gray,border:`0.5px solid ${C.gray}`,padding:"10px 15px",fontSize:9,letterSpacing:"0.14em",fontFamily:ag,textTransform:"uppercase",cursor:"pointer",opacity:seedArtistSaving?0.5:1}}>Cancel</button>
              </div>
            </form>
          )}
          {(()=>{
            const countryOptions=[...new Set(seedArtistsAdmin.map(a=>a.country).filter(Boolean))].sort();
            const stateOptions=[...new Set(seedArtistsAdmin.map(a=>artistRegion(a)).filter(Boolean))].sort();
            const serviceOptions=[...new Set(seedArtistsAdmin.map(a=>a.services).filter(Boolean))].sort();
            const q=seedArtistSearch.trim().toLowerCase();
            const filtered=seedArtistsAdmin.filter(a=>{
              if(seedArtistCountryFilter&&a.country!==seedArtistCountryFilter)return false;
              if(seedArtistStateFilter&&artistRegion(a)!==seedArtistStateFilter)return false;
              if(seedArtistServiceFilter&&a.services!==seedArtistServiceFilter)return false;
              const canTravel=Boolean(a.travel??a.travels);
              if(seedArtistTravelFilter==="true"&&!canTravel)return false;
              if(seedArtistTravelFilter==="false"&&canTravel)return false;
              if(!q)return true;
              return [a.name,a.owner,a.city,artistRegion(a),a.country,a.services,a.aesthetic].some(v=>(v||"").toString().toLowerCase().includes(q));
            });
            return(
              <>
                <div className="admin-action-row" style={{display:"flex",gap:8,marginBottom:"0.75rem",flexWrap:"wrap"}}>
                  <input value={seedArtistSearch} onChange={e=>setSeedArtistSearch(e.target.value)} placeholder="Search name, owner, city, region, country, services" style={{flex:"1 1 220px",border:"0.5px solid #ccc",padding:"8px 12px",fontSize:16,fontFamily:co,outline:"none",background:C.white}}/>
                  <select value={seedArtistCountryFilter} onChange={e=>setSeedArtistCountryFilter(e.target.value)} style={{border:"0.5px solid #ccc",padding:"8px 12px",fontSize:16,fontFamily:co,outline:"none",background:C.white}}>
                    <option value="">All countries</option>
                    {countryOptions.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                  <select value={seedArtistStateFilter} onChange={e=>setSeedArtistStateFilter(e.target.value)} style={{border:"0.5px solid #ccc",padding:"8px 12px",fontSize:16,fontFamily:co,outline:"none",background:C.white}}>
                    <option value="">All regions</option>
                    {stateOptions.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                  <select value={seedArtistServiceFilter} onChange={e=>setSeedArtistServiceFilter(e.target.value)} style={{border:"0.5px solid #ccc",padding:"8px 12px",fontSize:16,fontFamily:co,outline:"none",background:C.white}}>
                    <option value="">All services</option>
                    {serviceOptions.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                  <select value={seedArtistTravelFilter} onChange={e=>setSeedArtistTravelFilter(e.target.value)} style={{border:"0.5px solid #ccc",padding:"8px 12px",fontSize:16,fontFamily:co,outline:"none",background:C.white}}>
                    <option value="">All travel</option>
                    <option value="true">Travels</option>
                    <option value="false">No travel</option>
                  </select>
                </div>
                {seedArtistLoading&&<p style={{fontFamily:co,fontStyle:"italic",color:C.gray}}>Loading seed artists...</p>}
                {!seedArtistLoading&&!seedArtistError&&seedArtistsAdmin.length===0&&<p style={{fontFamily:co,fontStyle:"italic",color:C.gray}}>No directory seed artists found.</p>}
                {!seedArtistLoading&&seedArtistsAdmin.length>0&&filtered.length===0&&<p style={{fontFamily:co,fontStyle:"italic",color:C.gray}}>No seed artists match your search or filters.</p>}
                {filtered.map(a=>{
                  const isActing=seedArtistActionId===a.id;
                  return(
                    <div key={a.id} style={{border:`0.5px solid ${C.border}`,padding:"1rem",marginBottom:"0.75rem",background:C.white}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:8,flexWrap:"wrap"}}>
                        <div style={{minWidth:0,flex:"1 1 220px"}}>
                          <p style={{margin:0,fontFamily:ve,fontSize:13,letterSpacing:"0.06em",overflow:"hidden",textOverflow:"ellipsis"}}>{a.name||"—"}</p>
                          <p style={{margin:"2px 0 0",fontFamily:ag,fontSize:9,color:C.gray}}>{a.owner||"—"} · {artistLocationLabel(a)||"—"} · {a.services||"—"}</p>
                        </div>
                        <span style={{background:(a.travel??a.travels)?"#eaf7ea":"#fafafa",border:`0.5px solid ${(a.travel??a.travels)?C.teal:C.border}`,padding:"2px 8px",fontFamily:ag,fontSize:8,letterSpacing:"0.1em",textTransform:"uppercase",color:(a.travel??a.travels)?C.teal:C.gray}}>{(a.travel??a.travels)?"Travels":"No travel"}</span>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,marginBottom:8}}>
                        {[["Aesthetic",a.aesthetic],["Rating",a.rating],["Reviews",a.reviews],["Price",a.price],["Website",a.website],["Email",a.email]].map(([label,value])=>(
                          <div key={label}>
                            <p style={{margin:0,fontFamily:ag,fontSize:8,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray}}>{label}</p>
                            <p style={{margin:0,fontFamily:co,fontSize:12,wordBreak:"break-word"}}>{value||"—"}</p>
                          </div>
                        ))}
                      </div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8}}>
                        <button onClick={()=>editSeedArtist(a)} disabled={isActing} style={{background:C.iceBlue,border:`0.5px solid ${C.border}`,padding:"6px 12px",fontSize:9,fontFamily:ag,letterSpacing:"0.1em",textTransform:"uppercase",cursor:"pointer",opacity:isActing?0.5:1}}>Edit</button>
                        <button onClick={()=>deleteSeedArtist(a)} disabled={isActing} style={{background:"#fff0f0",border:"0.5px solid #cc4444",padding:"6px 12px",fontSize:9,fontFamily:ag,letterSpacing:"0.1em",textTransform:"uppercase",cursor:"pointer",color:"#cc4444",opacity:isActing?0.5:1}}>{isActing?"Working...":"Delete"}</button>
                      </div>
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>

        {/* Artist Profiles */}
        <div style={{maxWidth:700,margin:"0 auto",padding:"0 1.5rem 2rem"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.2rem"}}>
            <h2 style={{fontFamily:ve,fontSize:18,fontWeight:400,letterSpacing:"0.14em",margin:0}}>ARTIST PROFILES</h2>
            <button onClick={loadDbArtists} style={{background:"none",border:`0.5px solid ${C.border}`,padding:"5px 12px",fontSize:10,fontFamily:ag,letterSpacing:"0.12em",cursor:"pointer",textTransform:"uppercase"}}>Refresh</button>
          </div>
          {adminArtistError&&<p style={{fontFamily:co,fontSize:13,color:"#cc4444",lineHeight:1.5,margin:"0 0 0.75rem"}}>{adminArtistError}</p>}
          <form onSubmit={saveArtistProfile} style={{background:C.iceBlue,padding:"1rem",marginBottom:"1.25rem",display:"flex",flexDirection:"column",gap:8}}>
            <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,margin:0}}>{editingArtistId?"Edit Artist":"Add New Artist"}</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(180px,100%),1fr))",gap:8,minWidth:0,maxWidth:"100%"}}>
              {[["name","Business Name"],["owner","Owner Name"],["city","City"],["state","State / Province / Region"],["country","Country"],["email","Email"],["website","Website"],["avatar","Avatar Initials (e.g. BC)"],["badge","Badge (e.g. Signature Artist)"],["price","Price Range"],["rating","Rating (e.g. 5.0)"],["reviews","Review Count"],["education","Education"]].map(([k,p])=>(
                <input key={k} value={adminArtistForm[k]} onChange={e=>setAdminArtistForm(f=>({...f,[k]:e.target.value}))} placeholder={p} style={{border:"0.5px solid #ccc",padding:"8px 10px",fontSize:16,fontFamily:co,outline:"none",background:C.white}}/>
              ))}
            </div>
            <select value={adminArtistForm.services} onChange={e=>setAdminArtistForm(f=>({...f,services:e.target.value}))} style={{border:"0.5px solid #ccc",padding:"8px 10px",fontSize:16,fontFamily:co,outline:"none",background:C.white}}>
              {["Hair + Makeup","Hair Only","Makeup Only"].map(o=><option key={o}>{o}</option>)}
            </select>
            <label style={{display:"flex",alignItems:"center",gap:8,fontFamily:ag,fontSize:9,letterSpacing:"0.1em",color:C.gray,cursor:"pointer"}}>
              <input type="checkbox" checked={adminArtistForm.travel} onChange={e=>setAdminArtistForm(f=>({...f,travel:e.target.checked}))} style={{accentColor:C.black}}/>Travels for Weddings
            </label>
            {[["specialties","Specialties (comma separated)"],["best_for","Best For (comma separated)"],["not_ideal","Not Ideal For (comma separated)"],["fit_styles","Fit Styles (comma separated)"]].map(([k,p])=>(
              <input key={k} value={adminArtistForm[k]} onChange={e=>setAdminArtistForm(f=>({...f,[k]:e.target.value}))} placeholder={p} style={{border:"0.5px solid #ccc",padding:"8px 10px",fontSize:16,fontFamily:co,outline:"none",background:C.white}}/>
            ))}
            <textarea value={adminArtistForm.aesthetic} onChange={e=>setAdminArtistForm(f=>({...f,aesthetic:e.target.value}))} placeholder="Aesthetic (short description)" rows={2} style={{border:"0.5px solid #ccc",padding:"8px 10px",fontSize:16,fontFamily:co,resize:"vertical",outline:"none",background:C.white}}/>
            <textarea value={adminArtistForm.bio} onChange={e=>setAdminArtistForm(f=>({...f,bio:e.target.value}))} placeholder="Bio" rows={3} style={{border:"0.5px solid #ccc",padding:"8px 10px",fontSize:16,fontFamily:co,resize:"vertical",outline:"none",background:C.white}}/>
            <textarea value={adminArtistForm.portfolio} onChange={e=>setAdminArtistForm(f=>({...f,portfolio:e.target.value}))} placeholder="Portfolio notes" rows={2} style={{border:"0.5px solid #ccc",padding:"8px 10px",fontSize:16,fontFamily:co,resize:"vertical",outline:"none",background:C.white}}/>
            <div style={{display:"flex",gap:8}}>
              <button type="submit" disabled={!adminArtistForm.name.trim()} style={{background:C.black,color:C.white,border:"none",padding:"10px 18px",fontSize:9,letterSpacing:"0.14em",fontFamily:ag,textTransform:"uppercase",cursor:"pointer",opacity:!adminArtistForm.name.trim()?0.5:1}}>{editingArtistId?"Update Artist":"Add Artist"}</button>
              {editingArtistId&&<button type="button" onClick={()=>{setAdminArtistForm(emptyArtistForm);setEditingArtistId(null);}} style={{background:"transparent",color:C.gray,border:`0.5px solid ${C.gray}`,padding:"10px 15px",fontSize:9,letterSpacing:"0.14em",fontFamily:ag,textTransform:"uppercase",cursor:"pointer"}}>Cancel</button>}
            </div>
          </form>
          {(()=>{
            const tierValues=[...new Set(dbArtists.map(a=>a.tier).filter(Boolean))].sort();
            const q=artistSearch.trim().toLowerCase();
            const filtered=dbArtists.filter(a=>{
              if(artistFilterPublished==="true"&&!a.is_published)return false;
              if(artistFilterPublished==="false"&&a.is_published)return false;
              if(artistFilterActive==="true"&&!a.is_active)return false;
              if(artistFilterActive==="false"&&a.is_active)return false;
              if(artistFilterTier&&a.tier!==artistFilterTier)return false;
              if(!q)return true;
              return [a.business_name,a.name,a.owner_name,a.owner,a.city].some(v=>(v||"").toString().toLowerCase().includes(q));
            });
            return(
              <>
                <div style={{display:"flex",gap:8,marginBottom:"0.75rem",flexWrap:"wrap"}}>
                  <input value={artistSearch} onChange={e=>setArtistSearch(e.target.value)} placeholder="Search business, owner, city" style={{flex:"1 1 220px",border:"0.5px solid #ccc",padding:"8px 12px",fontSize:16,fontFamily:co,outline:"none",background:C.white}}/>
                  <select value={artistFilterPublished} onChange={e=>setArtistFilterPublished(e.target.value)} style={{border:"0.5px solid #ccc",padding:"8px 12px",fontSize:16,fontFamily:co,outline:"none",background:C.white}}>
                    <option value="">All published</option>
                    <option value="true">Published only</option>
                    <option value="false">Unpublished only</option>
                  </select>
                  <select value={artistFilterActive} onChange={e=>setArtistFilterActive(e.target.value)} style={{border:"0.5px solid #ccc",padding:"8px 12px",fontSize:16,fontFamily:co,outline:"none",background:C.white}}>
                    <option value="">All active</option>
                    <option value="true">Active only</option>
                    <option value="false">Inactive only</option>
                  </select>
                  {tierValues.length>0&&(
                    <select value={artistFilterTier} onChange={e=>setArtistFilterTier(e.target.value)} style={{border:"0.5px solid #ccc",padding:"8px 12px",fontSize:16,fontFamily:co,outline:"none",background:C.white}}>
                      <option value="">All tiers</option>
                      {tierValues.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                </div>
                {adminArtistLoading&&<p style={{fontFamily:co,fontStyle:"italic",color:C.gray}}>Loading artists...</p>}
                {!adminArtistLoading&&!adminArtistError&&dbArtists.length===0&&<p style={{fontFamily:co,fontStyle:"italic",color:C.gray}}>No artist profiles yet.</p>}
                {!adminArtistLoading&&dbArtists.length>0&&filtered.length===0&&<p style={{fontFamily:co,fontStyle:"italic",color:C.gray}}>No artists match your search.</p>}
                {filtered.map(a=>{
                  const isActing=artistActionId===a.id;
                  const businessName=a.business_name||a.name||"—";
                  const ownerName=a.owner_name||a.owner||"—";
                  const expanded=adminExpandedArtistId===a.id;
                  const statusLabel=a.is_active?(a.is_published?"Active · Published":"Active · Hidden"):"Suspended";
                  const statusColor=a.is_active?(a.is_published?C.teal:C.gray):"#cc4444";
                  return(
                    <div key={a.id} style={{border:`0.5px solid ${C.border}`,padding:"0.7rem 0.8rem",marginBottom:"0.45rem",background:C.white}}>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(150px,100%),1fr))",alignItems:"center",gap:10,minWidth:0,maxWidth:"100%"}}>
                        <div style={{display:"flex",alignItems:"center",gap:9,minWidth:0}}>
                          <div style={{width:30,height:30,borderRadius:"50%",background:C.nearBlack,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:ag,fontSize:8,color:C.lavender,flexShrink:0}}>{a.avatar||String(businessName).slice(0,2).toUpperCase()}</div>
                          <div style={{minWidth:0}}>
                            <p style={{margin:0,fontFamily:ve,fontSize:13,letterSpacing:"0.06em",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{businessName}</p>
                            <p style={{margin:"2px 0 0",fontFamily:co,fontSize:12,color:C.gray,fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ownerName} · {artistLocationLabel(a)||"Location not set"}</p>
                          </div>
                        </div>
                        <div style={{minWidth:0}}>
                          <p style={{margin:0,fontFamily:ag,fontSize:8,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray}}>Status</p>
                          <p style={{margin:"2px 0 0",fontFamily:ag,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",color:statusColor}}>{statusLabel}</p>
                        </div>
                        <div style={{display:"flex",flexWrap:"wrap",justifyContent:"flex-end",gap:5,minWidth:0}}>
                          <button onClick={()=>viewArtistProfile(a)} style={{background:"none",border:`0.5px solid ${C.black}`,padding:"6px 10px",fontSize:8,fontFamily:ag,letterSpacing:"0.1em",textTransform:"uppercase",cursor:"pointer"}}>View</button>
                          <button onClick={()=>editArtistProfile(a)} style={{background:C.iceBlue,border:`0.5px solid ${C.border}`,padding:"6px 10px",fontSize:8,fontFamily:ag,letterSpacing:"0.1em",textTransform:"uppercase",cursor:"pointer"}}>Edit</button>
                          <button onClick={()=>toggleArtistActive(a)} disabled={isActing} style={{background:"transparent",color:a.is_active?"#cc4444":C.teal,border:`0.5px solid ${a.is_active?"#cc4444":C.teal}`,padding:"6px 10px",fontSize:8,fontFamily:ag,letterSpacing:"0.1em",textTransform:"uppercase",cursor:"pointer",opacity:isActing?0.5:1}}>{a.is_active?"Suspend":"Restore"}</button>
                          <button onClick={()=>setAdminExpandedArtistId(expanded?null:a.id)} style={{background:"transparent",color:C.gray,border:`0.5px solid ${C.border}`,padding:"6px 9px",fontSize:8,fontFamily:ag,letterSpacing:"0.1em",textTransform:"uppercase",cursor:"pointer"}}>{expanded?"Less":"Details"}</button>
                        </div>
                      </div>
                      {expanded&&(
                        <div style={{borderTop:`0.5px solid ${C.border}`,marginTop:"0.65rem",paddingTop:"0.65rem"}}>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,marginBottom:8}}>
                            {[
                              ["Tier",a.tier||"Free"],
                              ["Published",a.is_published?"Yes":"No"],
                              ["Profile Views",a.profile_views??"—"],
                              ["Link Clicks",a.inquiry_clicks??"—"],
                              ["Created",a.created_at?new Date(a.created_at).toLocaleDateString():"—"],
                            ].map(([label,value])=>(
                              <div key={label}>
                                <p style={{margin:0,fontFamily:ag,fontSize:8,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray}}>{label}</p>
                                <p style={{margin:"1px 0 0",fontFamily:co,fontSize:12,wordBreak:"break-word"}}>{value}</p>
                              </div>
                            ))}
                          </div>
                          {a.aesthetic&&<p style={{margin:"4px 0 8px",fontFamily:co,fontStyle:"italic",fontSize:13,color:C.nearBlack,lineHeight:1.45}}>{a.aesthetic}</p>}
                          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                            <button onClick={()=>toggleArtistPublished(a)} disabled={isActing} style={{background:a.is_published?"transparent":C.teal,color:a.is_published?C.black:C.white,border:`0.5px solid ${a.is_published?C.black:C.teal}`,padding:"6px 10px",fontSize:8,fontFamily:ag,letterSpacing:"0.1em",textTransform:"uppercase",cursor:"pointer",opacity:isActing?0.5:1}}>{a.is_published?"Unpublish":"Publish"}</button>
                            <button onClick={()=>setArtistToDelete(a)} disabled={isActing} style={{background:"#fff0f0",border:"0.5px solid #cc4444",padding:"6px 10px",fontSize:8,fontFamily:ag,letterSpacing:"0.1em",textTransform:"uppercase",cursor:"pointer",color:"#cc4444",opacity:isActing?0.5:1}}>Delete</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            );
          })()}
          {ARTISTS.length>0&&(
            <div style={{borderTop:`0.5px solid ${C.border}`,paddingTop:"1rem",marginTop:"0.5rem"}}>
              <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray,marginBottom:"0.75rem"}}>Hardcoded Artists ({ARTISTS.length})</p>
              {ARTISTS.map(a=>(
                <div key={a.id} style={{border:`0.5px solid ${C.border}`,padding:"0.75rem",marginBottom:"0.5rem",background:"#fafafa",opacity:0.7}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:28,height:28,borderRadius:"50%",background:C.nearBlack,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:ag,fontSize:7,color:C.lavender,flexShrink:0}}>{a.avatar}</div>
                    <div>
                      <p style={{margin:0,fontFamily:ve,fontSize:12,letterSpacing:"0.06em"}}>{a.name}</p>
                      <p style={{margin:0,fontFamily:ag,fontSize:8,color:C.gray}}>{artistLocationLabel(a)} · {a.services}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </>)}

        {/* Delete Artist Confirmation Modal — rendered outside any group
            so the confirm dialog stays available regardless of which
            section is currently expanded. */}
        {artistToDelete&&(
          <div onClick={()=>artistActionId!==artistToDelete.id&&setArtistToDelete(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",padding:"1.5rem",zIndex:1000}}>
            <div onClick={e=>e.stopPropagation()} style={{background:C.white,border:`0.5px solid ${C.border}`,padding:"1.5rem 1.5rem 1.25rem",maxWidth:420,width:"100%",boxShadow:"0 12px 40px rgba(0,0,0,0.2)"}}>
              <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.5rem"}}>Confirm Delete</p>
              <h3 style={{fontFamily:ve,fontSize:17,letterSpacing:"0.1em",margin:"0 0 0.75rem"}}>DELETE THIS ARTIST?</h3>
              <p style={{fontFamily:co,fontSize:14,lineHeight:1.6,color:C.nearBlack,margin:"0 0 0.4rem"}}>This will permanently delete <strong>{artistToDelete.business_name||artistToDelete.name||"this artist"}</strong> and all related portfolio photos.</p>
              <p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:C.gray,margin:"0 0 1.25rem"}}>This action cannot be undone.</p>
              <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
                <button onClick={()=>setArtistToDelete(null)} disabled={artistActionId===artistToDelete.id} style={{background:"transparent",border:`0.5px solid ${C.gray}`,color:C.gray,padding:"9px 16px",fontSize:9,fontFamily:ag,letterSpacing:"0.14em",textTransform:"uppercase",cursor:"pointer"}}>Cancel</button>
                <button onClick={confirmDeleteArtist} disabled={artistActionId===artistToDelete.id} style={{background:"#cc4444",color:C.white,border:"none",padding:"9px 16px",fontSize:9,fontFamily:ag,letterSpacing:"0.14em",textTransform:"uppercase",cursor:"pointer",opacity:artistActionId===artistToDelete.id?0.6:1}}>{artistActionId===artistToDelete.id?"Deleting...":"Delete"}</button>
              </div>
            </div>
          </div>
        )}

        {/* Admin Tools — View As toggle + Settings */}
        {adminOpenGroup==="tools"&&(<>
          <div style={{maxWidth:700,margin:"0 auto",padding:"0 1.5rem 2rem"}}>
            <h2 style={{fontFamily:ve,fontSize:18,fontWeight:400,letterSpacing:"0.14em",marginBottom:"1rem"}}>VIEW AS</h2>
            <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.white}}>
              <p style={{fontFamily:co,fontSize:13,fontStyle:"italic",color:C.gray,margin:"0 0 0.9rem",lineHeight:1.6}}>Preview the bride or artist experience without changing your role. Affects navigation and dashboards only — your admin access is not removed.</p>
              <div role="radiogroup" aria-label="View as" style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {[["admin","Admin"],["bride","Bride"],["artist","Artist"]].map(([value,label])=>{
                  const active=effectiveView===value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={()=>{setViewMode(value);console.log("VIEW MODE CHANGED:",value);}}
                      style={{
                        flex:"1 1 30%",
                        minWidth:90,
                        background:active?C.black:"transparent",
                        color:active?C.white:C.black,
                        border:`0.5px solid ${active?C.black:C.border}`,
                        padding:"10px",
                        fontFamily:ag,
                        fontSize:10,
                        letterSpacing:"0.16em",
                        textTransform:"uppercase",
                        cursor:"pointer",
                      }}
                    >{label}</button>
                  );
                })}
              </div>
              <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,margin:"0.9rem 0 0"}}>Currently viewing: <span style={{color:C.black}}>{effectiveView}</span></p>
            </div>
          </div>

          {/* Settings */}
          <div style={{maxWidth:700,margin:"0 auto",padding:"0 1.5rem 3rem"}}>
            <h2 style={{fontFamily:ve,fontSize:18,fontWeight:400,letterSpacing:"0.14em",marginBottom:"1rem"}}>SETTINGS</h2>
            <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem"}}>
              <label style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,display:"block",marginBottom:"0.4rem"}}>Welcome Message</label>
              <textarea value={adminWelcome} onChange={e=>setAdminWelcome(e.target.value)} placeholder="Enter a welcome message shown to new users..." rows={3} style={{width:"100%",border:`0.5px solid #ccc`,padding:"9px 12px",fontSize:16,fontFamily:co,resize:"vertical",outline:"none",boxSizing:"border-box",marginBottom:"0.75rem"}}/>
              <button onClick={saveAdminWelcome} style={{background:adminWelcomeSaved?C.teal:C.black,color:C.white,border:"none",padding:"10px 20px",fontSize:10,fontFamily:ag,letterSpacing:"0.14em",textTransform:"uppercase",cursor:"pointer",transition:"background 0.3s"}}>{adminWelcomeSaved?"Saved!":"Save"}</button>
            </div>
          </div>
        </>)}
        </div>
      )}

      {/* ── PROFILE ──────────────────────────────────────────────────── */}
      {screen==="profile"&&(
        <div style={{...screenContainerStyle,overflowY:"auto",WebkitOverflowScrolling:"touch",overscrollBehaviorX:"none",height:"auto",minHeight:"100%",display:"flex",flexDirection:"column",alignItems:"center",padding:"2.5rem 2rem"}}>
          <div style={{width:"100%",maxWidth:520,minWidth:0,boxSizing:"border-box"}}>
            {console.log("PROFILE VIEW RENDERED")}
            {console.log("PROFILE USER:", session?.user?.id||session?.user?.email||"signed out")}
            <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.35em",textTransform:"uppercase",color:C.gray,marginBottom:"0.4rem"}}>Your bridal beauty hub</p>
            <h2 style={{fontFamily:ve,fontSize:22,fontWeight:400,letterSpacing:"0.14em",marginBottom:"1.75rem"}}>MY BRIDAL PROFILE</h2>
            <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:"1.75rem",background:C.iceBlue,padding:"1.25rem"}}>
              <div onClick={()=>photoRef.current?.click()} style={{width:72,height:72,borderRadius:"50%",background:C.nearBlack,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",overflow:"hidden",flexShrink:0,border:`2px solid ${C.lavender}`}}>
                {profile.profilePhoto?(
                  <img
                    src={profile.profilePhoto}
                    alt="Bride profile"
                    style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}
                  />
                ):(
                  <InitialsFallback name={profile.name} label={<>ADD<br/>PHOTO</>} size={profile.name?16:8}/>
                )}
              </div>
              <input ref={photoRef} type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(f)uploadBrideProfilePhoto(f);}} style={{display:"none"}}/>
              <div>
                <p style={{fontFamily:ve,fontSize:15,letterSpacing:"0.1em",margin:"0 0 0.2rem"}}>{profile.name||"Your Name"}</p>
                {priArc&&<p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.1em",textTransform:"uppercase",color:C.teal,margin:"0 0 0.2rem"}}>{priArc.name}</p>}
                {derivedSkin&&<p style={{fontFamily:co,fontStyle:"italic",fontSize:12,color:C.gray,margin:0}}>{derivedSkin} skin · {derivedHairType||"—"} hair · {derivedHairDensity||"—"}</p>}
                {(derivedFeatures.faceShape||derivedFeatures.eyeColor||derivedFeatures.hairColor||derivedFeatures.hairLength)&&<p style={{fontFamily:co,fontStyle:"italic",fontSize:12,color:C.gray,margin:"0.2rem 0 0"}}>{[derivedFeatures.faceShape&&`${derivedFeatures.faceShape} face`,derivedFeatures.eyeColor&&`${derivedFeatures.eyeColor} eyes`,derivedFeatures.hairColor&&`${derivedFeatures.hairColor} hair`,derivedFeatures.hairLength].filter(Boolean).join(" · ")}</p>}
              </div>
            </div>
            {[{k:"name",l:"Your Name",p:"Full name",t:"text"},{k:"date",l:"Wedding Date",p:"",t:"date"},{k:"location",l:"Wedding Venue / Location",p:"e.g. Myrtle Beach, SC",t:"text"}].map(f=>(
              <div key={f.k} style={{marginBottom:"1rem"}}>
                <label style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,display:"block",marginBottom:"0.35rem"}}>{f.l}</label>
                <input type={f.t} value={profile[f.k]} onChange={e=>setProfile(p=>({...p,[f.k]:e.target.value}))} placeholder={f.p} style={{width:"100%",border:`0.5px solid #ccc`,padding:"9px 12px",fontSize:16,fontFamily:co,outline:"none",boxSizing:"border-box"}}/>
              </div>
            ))}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:"1rem"}}>
              <div>
                <label style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,display:"block",marginBottom:"0.35rem"}}>Country</label>
                <select value={profile.country} onChange={e=>setProfile(p=>({...p,country:e.target.value,province:""}))} style={{width:"100%",border:`0.5px solid #ccc`,padding:"9px 12px",fontSize:16,fontFamily:co,outline:"none",boxSizing:"border-box",background:C.white}}>
                  {PROFILE_COUNTRIES.map(country=><option key={country}>{country}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,display:"block",marginBottom:"0.35rem"}}>{profile.country==="United States"?"State":profile.country==="Canada"?"Province":"Province / Region"}</label>
                {profile.country==="United States"||profile.country==="Canada"?(
                  <select value={profile.province} onChange={e=>setProfile(p=>({...p,province:e.target.value}))} style={{width:"100%",border:`0.5px solid #ccc`,padding:"9px 12px",fontSize:16,fontFamily:co,outline:"none",boxSizing:"border-box",background:C.white}}>
                    <option value="">Select</option>
                    {(profile.country==="United States"?PROFILE_US_STATES:CANADIAN_PROVINCES).map(province=><option key={province} value={province}>{province}</option>)}
                  </select>
                ):(
                  <input value={profile.province} onChange={e=>setProfile(p=>({...p,province:e.target.value}))} placeholder="Province or region" style={{width:"100%",border:`0.5px solid #ccc`,padding:"9px 12px",fontSize:16,fontFamily:co,outline:"none",boxSizing:"border-box"}}/>
                )}
              </div>
            </div>
            <div style={{marginBottom:"1.5rem"}}>
              <label style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,display:"block",marginBottom:"0.35rem"}}>Concerns, allergies & notes for your artist</label>
              <textarea value={profile.concerns} onChange={e=>setProfile(p=>({...p,concerns:e.target.value}))} placeholder="Rosacea, fine hair, sweats in heat, latex allergy, don't want to feel overdone..." rows={3} style={{width:"100%",border:`0.5px solid #ccc`,padding:"9px 12px",fontSize:16,fontFamily:co,resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
            </div>
            {/* Inspo Translation */}
            {(()=>{
              const swipeDeckComplete = !!result?.primary;
              const profileComplete = !!(profile.name && profile.name.trim() && profile.date && profile.location && profile.location.trim());
              const currentPhotosComplete = currentPhotos.length>0;
              const inspoPhotosComplete = (inspoPhotos?.length || 0) > 0;
              const checklist = [
                {label:"Complete beauty quiz", done:swipeDeckComplete},
                {label:"Complete swipe deck", done:swipeDeckComplete},
                {label:"Complete bridal profile", done:profileComplete},
                {label:"Upload current photos", done:currentPhotosComplete},
                {label:"Save inspiration photos", done:inspoPhotosComplete},
              ];
              return (
                <div style={{background:C.white,border:`0.5px solid ${C.border}`,padding:"1.4rem",marginBottom:"1.5rem"}}>
                  <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",marginBottom:"0.25rem"}}>Inspo Translation</p>
                  <p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:C.gray,margin:"0 0 1rem",lineHeight:1.6}}>Pinterest shows inspiration. Context creates the final result.</p>
                  <div style={{background:C.nearBlack,color:C.white,padding:"1.5rem",marginBottom:"1rem"}}>
                    <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.22em",textTransform:"uppercase",color:C.lavender,margin:"0 0 0.5rem"}}>Your Inspo, Decoded</p>
                    <p style={{fontFamily:co,fontSize:15,lineHeight:1.75,margin:0}}>Complete your beauty quiz, finish your swipe deck, build your bridal profile, and upload current photos so your translation is based on you—not just the woman in the Pinterest photo.</p>
                  </div>
                  <div style={{background:C.iceBlue,padding:"1.1rem 1.2rem",marginBottom:"1rem"}}>
                    {checklist.map(item=>(
                      <div key={item.label} style={{display:"flex",alignItems:"center",gap:10,padding:"4px 0"}}>
                        <span style={{
                          width:18,height:18,display:"inline-flex",alignItems:"center",justifyContent:"center",
                          border:`1px solid ${item.done?C.teal:"#ccc"}`,
                          background:item.done?C.teal:"transparent",
                          color:C.white,fontFamily:ag,fontSize:10,lineHeight:1,flexShrink:0,
                        }}>{item.done?"✓":""}</span>
                        <span style={{fontFamily:co,fontSize:14,color:item.done?C.nearBlack:C.gray,textDecoration:"none"}}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{background:C.white,border:`0.5px solid ${C.border}`,padding:"1rem 1.2rem",marginBottom:"1.25rem"}}>
                    <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.5rem"}}>Your translation takes into account:</p>
                    {["your beauty quiz results","your swipe deck preferences","your face shape","your hair type + density","your skin type","your personal style preferences","your current photos","your saved inspiration"].map(line=>(
                      <p key={line} style={{fontFamily:co,fontSize:13,color:C.nearBlack,margin:"2px 0",lineHeight:1.6}}>• {line}</p>
                    ))}
                  </div>
                  <button
                    onClick={()=>requirePremium("Inspo translation is included with Premium.",()=>{ console.log("INSPO PREMIUM UNLOCKED"); })}
                    style={{width:"100%",background:C.black,color:C.white,border:"none",padding:"13px",fontSize:11,letterSpacing:"0.22em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}
                  >
                    Unlock Premium Translation
                  </button>
                </div>
              );
            })()}
            {/* Current Photos */}
            <div id="current-photos" style={{background:C.white,border:`0.5px solid ${C.border}`,padding:"1.2rem",marginBottom:"1.5rem"}}>
              <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",marginBottom:"0.3rem"}}>Current Photos</p>
              <p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:C.gray,margin:"0 0 1rem",lineHeight:1.6}}>Upload a current photo so your inspo translation can account for your actual hair, skin, and features.</p>
              <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:"0.9rem"}}>
                <div style={{display:"flex",gap:8,overflowX:"auto",maxWidth:180,flexShrink:0}}>
                  {currentPhotos.length>0 ? currentPhotos.map((photo,index)=>(
                    <div key={photo.id||index} style={{width:74,height:92,background:C.iceBlue,border:`0.5px solid ${C.border}`,overflow:"hidden",flex:"0 0 74px"}}>
                      <SafeImage src={photo.display_url||photo.image_url||""} alt="Current photo" loadingLabel="" fallback={<ImagePlaceholder label="No current photo"/>}/>
                    </div>
                  )) : (
                    <div style={{width:74,height:92,background:C.iceBlue,border:`0.5px solid ${C.border}`,overflow:"hidden",flex:"0 0 74px"}}>
                      <ImagePlaceholder label="No current photo"/>
                    </div>
                  )}
                </div>
                <div style={{flex:1}}>
                  <input ref={currentPhotoFileRef} type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(f)uploadCurrentPhoto(f);}} style={{display:"none"}}/>
                  <button onClick={()=>currentPhotoFileRef.current?.click()} disabled={currentPhotoUploading} style={{width:"100%",background:currentPhotoUploading?C.gray:C.black,color:C.white,border:"none",padding:"11px",fontSize:10,letterSpacing:"0.18em",cursor:currentPhotoUploading?"wait":"pointer",fontFamily:ag,textTransform:"uppercase",marginBottom:"0.5rem",opacity:currentPhotoUploading?0.7:1}}>
                    {currentPhotoUploading?"Uploading…":currentPhotos.length?"Add Another Current Photo":"+ Upload Current Photo"}
                  </button>
                  {currentPhotoMessage&&<p style={{fontFamily:co,fontStyle:"italic",fontSize:12,color:C.teal,margin:"0 0 0.35rem"}}>{currentPhotoMessage}</p>}
                  {currentPhotoError&&<p style={{fontFamily:co,fontStyle:"italic",fontSize:12,color:"#cc4444",margin:"0 0 0.35rem",lineHeight:1.5}}>{currentPhotoError}</p>}
                  {currentPhotos.length>0&&!currentPhotoMessage&&<p style={{fontFamily:co,fontStyle:"italic",fontSize:12,color:C.teal,margin:0}}>Current photo added.</p>}
                </div>
              </div>
              {!currentPhotoUploading&&!currentPhotoError&&currentPhotos.length===0&&(
                <p style={{fontFamily:co,fontStyle:"italic",fontSize:14,color:C.gray,margin:"0.75rem 0",textAlign:"center"}}>No current photos yet</p>
              )}
              {currentPhotos.length>0&&<p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0.5rem 0 0"}}>{currentPhotos.length} current photos saved</p>}
            </div>
            {/* My Inspo Board */}
            <div id="inspo-board" style={{background:C.white,border:`0.5px solid ${C.border}`,padding:"1.2rem",marginBottom:"1.5rem"}}>
              <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",marginBottom:"0.3rem"}}>My Inspo Board</p>
              <p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:C.gray,margin:"0 0 1rem",lineHeight:1.6}}>Your saved inspo, all in one place.</p>
              {!session?.user&&(
                <p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:C.gray,margin:"0 0 0.5rem"}}>Sign in to start saving inspo photos.</p>
              )}
              {session?.user&&(
                <>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(150px,100%),1fr))",gap:8,marginBottom:"0.6rem",minWidth:0,maxWidth:"100%"}}>
                    <div>
                      <label style={{fontFamily:ag,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray,display:"block",marginBottom:"0.25rem"}}>Category</label>
                      <select value={inspoCategory} onChange={e=>setInspoCategory(e.target.value)} style={{width:"100%",border:`0.5px solid #ccc`,padding:"7px 10px",fontSize:16,fontFamily:co,outline:"none",boxSizing:"border-box",background:C.white}}>
                        {BRIDE_INSPO_CATEGORIES.map(cat=><option key={cat} value={cat}>{cat}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{fontFamily:ag,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray,display:"block",marginBottom:"0.25rem"}}>Notes (optional)</label>
                      <input value={inspoNotes} onChange={e=>setInspoNotes(e.target.value)} placeholder="Soft Hollywood waves" style={{width:"100%",border:`0.5px solid #ccc`,padding:"7px 10px",fontSize:16,fontFamily:co,outline:"none",boxSizing:"border-box"}}/>
                    </div>
                  </div>
                  <input ref={inspoFileRef} type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0]; if(f) uploadInspoPhoto(f);}} style={{display:"none"}}/>
                  <button onClick={()=>inspoFileRef.current?.click()} disabled={inspoUploading} style={{width:"100%",background:inspoUploading?C.gray:C.black,color:C.white,border:"none",padding:"11px",fontSize:10,letterSpacing:"0.18em",cursor:inspoUploading?"wait":"pointer",fontFamily:ag,textTransform:"uppercase",marginBottom:"0.5rem",opacity:inspoUploading?0.7:1}}>
                    {inspoUploading?"Uploading…":"+ Upload Inspo Photo"}
                  </button>
                  {inspoMessage&&<p style={{fontFamily:co,fontStyle:"italic",fontSize:12,color:C.teal,margin:"0 0 0.5rem"}}>{inspoMessage}</p>}
                  {inspoError&&<p style={{fontFamily:co,fontStyle:"italic",fontSize:12,color:"#cc4444",margin:"0 0 0.5rem",lineHeight:1.5}}>{inspoError}</p>}
                  {inspoLoading&&<p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:C.gray,margin:"0.75rem 0"}}>Loading your inspo board…</p>}
                  {!inspoLoading&&!inspoError&&inspoPhotos.length===0&&(
                    <p style={{fontFamily:co,fontStyle:"italic",fontSize:14,color:C.gray,margin:"0.75rem 0",textAlign:"center"}}>Upload the looks you keep coming back to.</p>
                  )}
                  {!inspoLoading&&inspoPhotos.length>0&&(
                    <div style={{display:"flex",flexDirection:"row",gap:10,overflowX:"auto",overflowY:"hidden",scrollSnapType:"x mandatory",WebkitOverflowScrolling:"touch",paddingBottom:6,marginLeft:"-0.25rem",marginRight:"-0.25rem",paddingLeft:"0.25rem",paddingRight:"0.25rem"}}>
                      {inspoPhotos.map(photo=>{
                        const url=photo?.image_url||"";
                        const directHttp=typeof url==="string"&&/^https?:\/\//i.test(url);
                        const src=directHttp?url:url;
                        const deleting=inspoDeletingId===photo.id;
                        return (
                          <div key={photo.id} style={{flex:"0 0 60%",maxWidth:"60%",scrollSnapAlign:"start"}}>
                            <div style={{position:"relative",width:"100%",aspectRatio:"4 / 5",borderRadius:14,background:C.iceBlue,border:`0.5px solid ${C.border}`,overflow:"hidden"}}>
                              {src?(
                                <img src={src} alt={photo.notes||"Inspo photo"} loading="lazy" draggable={false} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
                              ):(
                                <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                                  <ImagePlaceholder label="Image unavailable"/>
                                </div>
                              )}
                              <button
                                onClick={()=>{ if(window.confirm("Remove this inspo photo?")) deleteInspoPhoto(photo); }}
                                disabled={deleting}
                                aria-label="Delete inspo photo"
                                style={{position:"absolute",top:8,right:8,width:30,height:30,borderRadius:"50%",background:"rgba(0,0,0,0.6)",color:C.white,border:"none",cursor:deleting?"wait":"pointer",fontFamily:ag,fontSize:13,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center"}}
                              >
                                {deleting?"…":"✕"}
                              </button>
                              {photo.category&&(
                                <div style={{position:"absolute",left:8,bottom:8,background:"rgba(0,0,0,0.55)",color:C.white,padding:"2px 8px",borderRadius:10,fontFamily:ag,fontSize:8,letterSpacing:"0.12em",textTransform:"uppercase"}}>{photo.category}</div>
                              )}
                            </div>
                            {photo.notes&&<p style={{fontFamily:co,fontSize:12,color:C.gray,margin:"0.4rem 0 0",fontStyle:"italic",lineHeight:1.4}}>{photo.notes}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {!inspoLoading&&inspoPhotos.length>1&&<p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0.5rem 0 0"}}>Swipe to view more</p>}
                </>
              )}
            </div>
            {/* Mood board */}
            <div style={{background:C.blush,padding:"1.2rem",marginBottom:"1.5rem"}}>
              <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",marginBottom:"0.6rem"}}>Mood board keywords</p>
              <div style={{display:"flex",gap:8,marginBottom:"0.6rem"}}>
                <input value={moodInput} onChange={e=>setMoodInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&moodInput.trim()&&(setMoodItems([...moodItems,moodInput.trim()]),setMoodInput(""))} placeholder="Grace Kelly · candlelight · old money..." style={{flex:1,border:`0.5px solid #ccc`,padding:"7px 10px",fontSize:16,fontFamily:co,outline:"none",background:C.white}}/>
                <button onClick={()=>{if(moodInput.trim()){setMoodItems([...moodItems,moodInput.trim()]);setMoodInput("");}}} style={{background:C.black,color:C.white,border:"none",padding:"7px 13px",fontSize:10,cursor:"pointer",fontFamily:ag}}>Add</button>
              </div>
              {moodItems.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6}}>{moodItems.map((item,i)=><span key={i} style={{background:`${C.lavender}50`,border:`0.5px solid ${C.lavender}`,padding:"3px 10px",fontSize:13,fontFamily:co,display:"flex",gap:6,alignItems:"center"}}>{item}<span onClick={()=>setMoodItems(moodItems.filter((_,j)=>j!==i))} style={{cursor:"pointer",color:C.gray,fontSize:14}}>×</span></span>)}</div>}
            </div>
            {console.log("PROFILE SAVE BUTTON RENDERED")}
            <button onClick={saveProfile} disabled={profileSaving} style={{width:"100%",background:profileSaved?C.teal:C.black,color:C.white,border:"none",padding:"13px",fontSize:10,letterSpacing:"0.2em",cursor:profileSaving?"default":"pointer",fontFamily:ag,textTransform:"uppercase",marginBottom:"0.6rem",transition:"background 0.3s",opacity:profileSaving?0.65:1}}>{profileSaving?"Saving…":profileSaved?"Profile saved.":"Save Profile"}</button>
            {(profileSaveMessage||profileSaveError)&&(
              <p style={{fontFamily:co,fontSize:13,fontStyle:"italic",color:profileSaveError?"#cc4444":C.teal,margin:"0 0 1.5rem",lineHeight:1.6}}>{profileSaveError||profileSaveMessage}</p>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <button onClick={()=>goToScreen("chat")} style={{background:C.black,color:C.white,border:"none",padding:"12px",fontSize:10,letterSpacing:"0.2em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Message Bailee</button>
              <button onClick={()=>goToScreen("timeline")} style={{background:"transparent",color:C.black,border:`0.5px solid ${C.black}`,padding:"11px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>View my beauty timeline</button>
              <button onClick={()=>goToScreen("directory")} style={{background:"transparent",color:C.black,border:`0.5px solid ${C.black}`,padding:"11px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Find my artist</button>
            </div>
            {session?.user&&(
              <button onClick={async()=>{await supabase.auth.signOut();await refreshAuthState();setScreen("home");}} style={{background:"none",border:"none",fontFamily:co,fontStyle:"italic",fontSize:13,color:C.gray,cursor:"pointer",marginTop:"2rem"}}>Sign Out</button>
            )}
          </div>
        </div>
      )}

      {/* ── ACCOUNT ──────────────────────────────────────────────────── */}
      {screen==="account"&&(
        <div style={{...screenContainerStyle,minHeight:"100vh",display:"flex",justifyContent:"center",padding:"2.5rem 2rem",background:C.nearBlack,color:C.white}}>
          {console.log("ACCOUNT SCREEN ROUTE RENDERED")}
          <div style={{width:"100%",maxWidth:520}}>
            <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.35em",textTransform:"uppercase",color:C.lavender,marginBottom:"0.4rem"}}>Account</p>
            <h2 style={{fontFamily:ve,fontSize:24,fontWeight:400,letterSpacing:"0.14em",margin:"0 0 1.5rem"}}>YOUR ACCOUNT</h2>
            <div style={{border:"0.5px solid rgba(214,202,221,0.45)",borderRadius:18,padding:"1.1rem",background:"rgba(255,255,255,0.06)",marginBottom:"1rem"}}>
              <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.lavender,margin:"0 0 0.5rem"}}>Email</p>
              <p style={{fontFamily:co,fontSize:14,fontStyle:"italic",color:"rgba(255,255,255,0.78)",margin:"0 0 1rem",lineHeight:1.6}}>{session?.user?.email||"Sign in to manage your account"}</p>
              <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.lavender,margin:"0 0 0.5rem"}}>Subscription</p>
              <p style={{fontFamily:co,fontSize:14,fontStyle:"italic",color:"rgba(255,255,255,0.78)",margin:"0 0 1rem",lineHeight:1.6}}>{(freeMembership||isBookedBride)?"Complimentary membership (Booked Bride)":(hasPremiumAccess?"Premium membership active":"Free membership")}</p>
              {resolvedAccount?.canAccessBrideFeatures && !hasPremiumAccess && (
                <button
                  type="button"
                  disabled={checkoutLoading}
                  onClick={()=>handleBrideUpgradeMembership()}
                  style={{width:"100%",height:50,background:"rgba(255,255,255,0.06)",border:"0.5px solid rgba(214,202,221,0.6)",borderRadius:16,color:C.white,cursor:checkoutLoading?"wait":"pointer",fontFamily:ag,fontSize:10,letterSpacing:"0.18em",textTransform:"uppercase",padding:"0 22px",textAlign:"center",opacity:checkoutLoading?0.65:1}}
                >
                  {checkoutLoading?"Opening...":"Upgrade Membership"}
                </button>
              )}
              <ArtistUpgradeButton/>
            </div>
            {/* Account is intentionally minimal: email, subscription, and
                upgrade controls only. Navigation lives in the slideout
                menu; admin tools (including View As) live in the Admin
                Dashboard so admin-only surfaces stay out of every page. */}
            {session?.user&&(
              <div style={{display:"flex",justifyContent:"center",marginTop:"0.75rem"}}>
                <button onClick={async()=>{await supabase.auth.signOut();await refreshAuthState();setScreen("home");}} style={{background:"transparent",color:"rgba(255,255,255,0.72)",border:"none",fontFamily:co,fontStyle:"italic",fontSize:13,cursor:"pointer"}}>Sign Out</button>
              </div>
            )}
            {session?.user&&(
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,marginTop:"1.75rem",paddingTop:"1.25rem",borderTop:"0.5px solid rgba(214,202,221,0.25)"}}>
                <button
                  type="button"
                  onClick={openDeleteAccountModal}
                  style={{background:"transparent",color:"#ff8a8a",border:"0.5px solid rgba(255,138,138,0.45)",borderRadius:14,padding:"10px 22px",fontFamily:ag,fontSize:10,letterSpacing:"0.18em",textTransform:"uppercase",cursor:"pointer"}}
                >
                  Delete Account
                </button>
                <p style={{fontFamily:co,fontStyle:"italic",fontSize:12,color:"rgba(255,255,255,0.55)",margin:0,textAlign:"center",lineHeight:1.5}}>Permanently deletes your account and removes your data.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {screen==="artistDashboard"&&renderArtistDashboard()}
      {screen==="artistPortfolio"&&renderArtistPortfolio()}
      {screen==="artistAnalytics"&&renderArtistAnalytics()}
      {screen==="artistPremium"&&renderArtistPremium()}

      {/* ── ARTIST DASHBOARD ─────────────────────────────────────────── */}
      {false&&screen==="artistDashboard"&&(
        <div className="artist-dashboard" style={{...screenContainerStyle,height:"calc(100vh - 74px - env(safe-area-inset-top) - env(safe-area-inset-bottom))",overflowY:"auto",overflowX:"hidden",WebkitOverflowScrolling:"touch",overscrollBehaviorY:"contain",overscrollBehaviorX:"none",touchAction:"pan-y",padding:"2.5rem min(2rem, 5vw) calc(5rem + env(safe-area-inset-bottom))",background:C.white,color:C.black}}>
          {console.log("ARTIST DASHBOARD ROUTE RENDERED")}
          {console.log("ARTIST DASHBOARD ACCESS:", isArtist?"allowed":"denied")}
          <div style={{width:"100%",maxWidth:720,margin:"0 auto",minWidth:0,overflowX:"hidden",boxSizing:"border-box"}}>
            <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.35em",textTransform:"uppercase",color:C.gray,marginBottom:"0.4rem"}}>Artist workspace</p>
            <h2 style={{fontFamily:ve,fontSize:24,fontWeight:400,letterSpacing:"0.14em",margin:"0 0 1rem"}}>DASHBOARD</h2>
            {session?.user&&!isArtist?(
              <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.blush}}>
                <p style={{fontFamily:co,fontSize:14,fontStyle:"italic",color:C.gray,lineHeight:1.7,margin:"0 0 1rem"}}>Artist access only.</p>
                <button onClick={()=>setScreen("home")} style={{background:C.black,color:C.white,border:"none",padding:"12px 24px",fontSize:10,letterSpacing:"0.18em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Back to Home</button>
              </div>
            ):!session?.user?(
              <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.blush}}>
                <p style={{fontFamily:co,fontSize:14,fontStyle:"italic",color:C.gray,lineHeight:1.7,margin:"0 0 1rem"}}>Sign in to manage your artist profile and application.</p>
                <button onClick={()=>{setAuthMode("login");setAuthOpen(true);}} style={{background:C.black,color:C.white,border:"none",padding:"12px 24px",fontSize:10,letterSpacing:"0.18em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Sign In</button>
              </div>
            ):(
              <div style={{display:"grid",gap:12,minWidth:0,width:"100%",maxWidth:"100%",overflowX:"hidden",boxSizing:"border-box"}}>
                <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.iceBlue,width:"100%",maxWidth:"100%",minWidth:0,overflowX:"hidden",boxSizing:"border-box"}}>
                  <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.5rem"}}>Signed in as</p>
                  <p style={{fontFamily:co,fontSize:14,fontStyle:"italic",color:C.gray,margin:0}}>{session.user.email}</p>
                </div>
                {isUpgraded&&(
                  <div style={{border:`0.5px solid ${C.lavender}`,padding:0,background:C.white,width:"100%",maxWidth:"100%",minWidth:0,overflow:"hidden",boxSizing:"border-box"}}>
                    {myArtistProfile?.cover_image_url&&(
                      <div style={{height:140,background:C.iceBlue,overflow:"hidden"}}>
                        <SafeImage src={myArtistProfile.cover_image_url} alt="" loadingLabel="Loading cover" fallback={<ImagePlaceholder label="Cover image unavailable"/>}/>
                      </div>
                    )}
                    <div style={{padding:"1.1rem"}}>
                      <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.lavender,margin:"0 0 0.45rem"}}>{myArtistProfile?.featured_badge_label||"Featured Artist"}</p>
                      {myArtistProfile?.signature_method&&<p style={{fontFamily:co,fontSize:14,fontStyle:"italic",color:C.gray,lineHeight:1.6,margin:"0 0 0.75rem"}}>{myArtistProfile.signature_method}</p>}
                      {artistFeaturedServices.length>0&&(
                        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                          {artistFeaturedServices.map(service=><span key={service} style={{background:C.blush,padding:"3px 9px",fontFamily:co,fontSize:12,color:C.black}}>{service}</span>)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(190px,100%),1fr))",gap:10,minWidth:0,width:"100%",maxWidth:"100%",overflowX:"hidden"}}>
                  <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.white,minWidth:0,overflowX:"hidden"}}>
                    <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.5rem"}}>Profile Status</p>
                    <p style={{fontFamily:ve,fontSize:18,letterSpacing:"0.08em",margin:"0 0 0.35rem",color:hasArtistProfileRow?C.teal:C.black}}>{artistStatusLabel}</p>
                    <p style={{fontFamily:co,fontSize:13,fontStyle:"italic",color:C.gray,lineHeight:1.5,margin:0}}>Profile tier: {artistTierLabel}</p>
                  </div>
                  <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.white,minWidth:0,overflowX:"hidden"}}>
                    <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.5rem"}}>Approval Status</p>
                    <p style={{fontFamily:ve,fontSize:18,letterSpacing:"0.08em",margin:"0 0 0.35rem",color:hasArtistProfileRow?C.teal:C.black}}>{hasArtistProfileRow?"Approved":"No artist profile"}</p>
                    <p style={{fontFamily:co,fontSize:13,fontStyle:"italic",color:C.gray,lineHeight:1.5,margin:0}}>{hasArtistProfileRow?"Your artist profile is set up.":"No artist_profiles row found for this user."}</p>
                  </div>
                  <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.white,minWidth:0,overflowX:"hidden"}}>
                    <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.5rem"}}>Portfolio</p>
                    <p style={{fontFamily:ve,fontSize:18,letterSpacing:"0.08em",margin:"0 0 0.35rem"}}>{artistPortfolioCount} / {artistPortfolioMax} photo{artistPortfolioCount===1?"":"s"}</p>
                    <button onClick={()=>goToScreen("artistPortfolio")} style={{background:"transparent",color:C.black,border:`0.5px solid ${C.black}`,padding:"9px 12px",fontSize:9,letterSpacing:"0.14em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Open Portfolio</button>
                  </div>
                  <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.white,minWidth:0,overflowX:"hidden"}}>
                    <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.5rem"}}>Directory Visibility</p>
                    <p style={{fontFamily:ve,fontSize:18,letterSpacing:"0.08em",margin:"0 0 0.35rem",color:artistDirectoryVisible?C.teal:C.black}}>{artistDirectoryVisible?"Visible to brides":"Complete profile to appear in directory"}</p>
                    <p style={{fontFamily:co,fontSize:13,fontStyle:"italic",color:C.gray,lineHeight:1.5,margin:0}}>{artistDirectoryVisible?"Approved and complete profiles appear in the public directory.":"Approval is still required, but approved artists also need a complete profile before appearing publicly."}</p>
                    {hasArtistProfileRow&&(
                      <>
                        <button
                          onClick={()=>setMyArtistDirectoryPublished(!artistListingPublished)}
                          disabled={artistVisibilitySaving||myArtistProfile?.is_active===false}
                          style={{marginTop:"0.75rem",background:artistListingPublished?"transparent":C.black,color:artistListingPublished?C.black:C.white,border:`0.5px solid ${artistListingPublished?C.black:C.black}`,padding:"9px 12px",fontSize:9,letterSpacing:"0.14em",cursor:artistVisibilitySaving||myArtistProfile?.is_active===false?"default":"pointer",fontFamily:ag,textTransform:"uppercase",opacity:artistVisibilitySaving||myArtistProfile?.is_active===false?0.55:1}}
                        >
                          {artistVisibilitySaving?"Saving...":artistListingPublished?"Hide Listing":"Publish Listing"}
                        </button>
                        {(artistVisibilityMessage||artistVisibilityError)&&<p style={{fontFamily:co,fontSize:12,fontStyle:"italic",color:artistVisibilityError?"#cc4444":C.teal,lineHeight:1.5,margin:"0.5rem 0 0"}}>{artistVisibilityError||artistVisibilityMessage}</p>}
                      </>
                    )}
                  </div>
                </div>
                <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.white,width:"100%",maxWidth:"100%",minWidth:0,overflowX:"hidden",boxSizing:"border-box"}}>
                  <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.85rem"}}>Profile Completeness</p>
                  <div style={{display:"grid",gap:8}}>
                    {profileCompleteness.map(item=>(
                      <div key={item.label} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,borderBottom:`0.5px solid ${C.border}`,paddingBottom:8}}>
                        <span style={{fontFamily:co,fontSize:14,color:C.gray}}>{item.label}</span>
                        <span style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:item.complete?C.teal:C.gray}}>{item.complete?"Done":"Missing"}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{border:`0.5px solid ${hasUpgradedProfile?C.teal:C.border}`,padding:"1.25rem",background:hasUpgradedProfile?"#eaf7ea":C.white,width:"100%",maxWidth:"100%",minWidth:0,overflowX:"hidden",boxSizing:"border-box"}}>
                  <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:hasUpgradedProfile?C.teal:C.gray,margin:"0 0 0.5rem"}}>Membership Status</p>
                  <p style={{fontFamily:co,fontSize:14,fontStyle:"italic",color:C.gray,lineHeight:1.6,margin:"0 0 0.85rem"}}>{hasUpgradedProfile?"Premium Artist membership active.":"Currently on the Free Artist plan."}</p>
                  <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                    <button onClick={()=>goToScreen("artistPremium")} style={{background:"transparent",color:C.black,border:`0.5px solid ${C.black}`,padding:"10px 16px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>View Premium</button>
                    <ArtistUpgradeButton variant="dashboard"/>
                  </div>
                </div>
                {(()=>{
                  const profileViews=Number(myArtistProfile?.profile_views)||0;
                  const inquiryClicks=Number(myArtistProfile?.inquiry_clicks)||0;
                  const profilePortfolioPhotos=Array.isArray(myArtistProfile?.portfolio_photos)?myArtistProfile.portfolio_photos:[];
                  const sortedPhotos=[...profilePortfolioPhotos].sort((a,b)=>{
                    const aTime=new Date(a?.created_at||0).getTime();
                    const bTime=new Date(b?.created_at||0).getTime();
                    return bTime-aTime;
                  });
                  const lastUpload=sortedPhotos[0]?.created_at?new Date(sortedPhotos[0].created_at):null;
                  const lastUploadLabel=lastUpload&&!isNaN(lastUpload.getTime())?lastUpload.toLocaleDateString():"No uploads yet";
                  const activityItems=[
                    ["Profile views", `${profileViews}`],
                    ["Link clicks", `${inquiryClicks}`],
                    ["Portfolio uploads", `${profilePortfolioPhotos.length}`],
                    ["Last upload", lastUploadLabel],
                  ];
                  return (
                    <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.white,width:"100%",maxWidth:"100%",minWidth:0,overflowX:"hidden",boxSizing:"border-box"}}>
                      <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.85rem"}}>Recent Activity</p>
                      <div style={{display:"grid",gap:8}}>
                        {activityItems.map(([label,value])=>(
                          <div key={label} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,borderBottom:`0.5px solid ${C.border}`,paddingBottom:8}}>
                            <span style={{fontFamily:co,fontSize:14,color:C.gray}}>{label}</span>
                            <span style={{fontFamily:ag,fontSize:11,letterSpacing:"0.08em",color:C.black}}>{value}</span>
                          </div>
                        ))}
                      </div>
                      <button onClick={()=>goToScreen("artistAnalytics")} style={{marginTop:"0.85rem",background:"transparent",color:C.black,border:`0.5px solid ${C.black}`,padding:"9px 14px",fontSize:10,letterSpacing:"0.14em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Open Analytics</button>
                    </div>
                  );
                })()}
                <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.white,width:"100%",maxWidth:"100%",minWidth:0,overflowX:"hidden",boxSizing:"border-box"}}>
                  <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.85rem"}}>WORKSPACE</p>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(180px,100%),1fr))",gap:10,minWidth:0,width:"100%",maxWidth:"100%",overflowX:"hidden"}}>
                    {!hasArtistProfileRow && (
                      <button onClick={()=>setScreen("apply")} style={{background:C.black,color:C.white,border:"none",padding:"13px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Application</button>
                    )}
                    <button onClick={()=>goToScreen("artistPortfolio")} style={{background:"transparent",color:C.black,border:`0.5px solid ${C.black}`,padding:"12px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Portfolio</button>
                    <button onClick={()=>goToScreen("artistAnalytics")} style={{background:"transparent",color:C.black,border:`0.5px solid ${C.black}`,padding:"12px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Analytics</button>
                    <button onClick={()=>goToScreen("directory")} style={{background:"transparent",color:C.black,border:`0.5px solid ${C.black}`,padding:"12px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Directory</button>
                    <button onClick={openArtistEditProfile} style={{background:"transparent",color:C.black,border:`0.5px solid ${C.black}`,padding:"12px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Edit Profile</button>
                  </div>
                </div>

                {artistEditOpen&&(
                  <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.white,width:"100%",maxWidth:"100%",minWidth:0,overflowX:"hidden",boxSizing:"border-box"}}>
                    <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.85rem"}}>Edit Profile</p>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(220px,100%),1fr))",gap:10,minWidth:0,width:"100%",maxWidth:"100%",overflowX:"hidden"}}>
                      {[
                        ["business_name","Business name"],
                        ["owner_name","Owner name"],
                        ["city","City"],
                        ["state","State"],
                        ["country","Country"],
                        ["services","Services"],
                        ["starting_price","Starting price"],
                        ["website","Website"],
                        ["instagram","Instagram"],
                        ["email","Email"],
                      ].map(([key,label])=>(
                        <label key={key} style={{display:"flex",flexDirection:"column",gap:5,fontFamily:ag,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray}}>
                          {label}
                          <input value={artistEditForm[key]||""} onChange={e=>setArtistEditForm(prev=>({...prev,[key]:e.target.value}))} style={{width:"100%",maxWidth:"100%",border:`0.5px solid ${C.border}`,padding:"9px 10px",fontFamily:co,fontSize:16,letterSpacing:0,textTransform:"none",color:C.black,outline:"none",boxSizing:"border-box",overflowWrap:"anywhere"}}/>
                        </label>
                      ))}
                    </div>
                    {[
                      ["bio","Bio"],
                      ["aesthetic","Aesthetic"],
                      ["specialties","Specialties"],
                    ].map(([key,label])=>(
                      <label key={key} style={{display:"flex",flexDirection:"column",gap:5,fontFamily:ag,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray,marginTop:10}}>
                        {label}
                        <textarea value={artistEditForm[key]||""} onChange={e=>setArtistEditForm(prev=>({...prev,[key]:e.target.value}))} rows={key==="bio"||key==="aesthetic"?3:2} style={{width:"100%",maxWidth:"100%",border:`0.5px solid ${C.border}`,padding:"9px 10px",fontFamily:co,fontSize:16,letterSpacing:0,textTransform:"none",color:C.black,outline:"none",resize:"vertical",boxSizing:"border-box",overflowWrap:"anywhere"}}/>
                      </label>
                    ))}
                    {isUpgraded?(
                      <>
                        {[
                          ["featured_badge_label","Featured Badge Label"],
                          ["featured_services","Featured Services"],
                          ["artist_notes","Artist Notes"],
                          ["best_for","Best For"],
                          ["not_ideal_for","Not Ideal For"],
                        ].map(([key,label])=>(
                          <label key={key} style={{display:"flex",flexDirection:"column",gap:5,fontFamily:ag,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray,marginTop:10}}>
                            {label}
                            <textarea value={artistEditForm[key]||""} onChange={e=>setArtistEditForm(prev=>({...prev,[key]:e.target.value}))} rows={2} style={{width:"100%",maxWidth:"100%",border:`0.5px solid ${C.border}`,padding:"9px 10px",fontFamily:co,fontSize:16,letterSpacing:0,textTransform:"none",color:C.black,outline:"none",resize:"vertical",boxSizing:"border-box",overflowWrap:"anywhere"}}/>
                          </label>
                        ))}
                        <p style={{fontFamily:co,fontSize:12,fontStyle:"italic",color:C.gray,margin:"0.6rem 0 0",lineHeight:1.5}}>Cover image and signature method are managed on the Portfolio screen.</p>
                      </>
                    ):(
                      <div style={{background:C.iceBlue,border:`0.5px solid ${C.border}`,padding:"0.95rem 1rem",fontFamily:co,fontSize:14,fontStyle:"italic",color:C.gray,lineHeight:1.6,marginTop:10}}>
                        Upgrade to unlock expanded profile customization
                      </div>
                    )}
                    <label style={{display:"flex",alignItems:"center",gap:8,fontFamily:ag,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray,marginTop:12}}>
                      <input type="checkbox" checked={!!artistEditForm.travels} onChange={e=>setArtistEditForm(prev=>({...prev,travels:e.target.checked}))} style={{accentColor:C.black}}/>
                      Travels
                    </label>
                    {artistEditMessage&&<p style={{fontFamily:ag,fontSize:10,letterSpacing:"0.14em",textTransform:"uppercase",color:C.teal,margin:"0.85rem 0 0"}}>{artistEditMessage}</p>}
                    {artistEditError&&<p style={{fontFamily:co,fontSize:12,color:"#b00020",lineHeight:1.5,margin:"0.85rem 0 0"}}>{artistEditError}</p>}
                    <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:"1rem"}}>
                      <button onClick={saveArtistEditProfile} disabled={artistEditSaving} style={{background:artistEditSaving?C.gray:C.black,color:C.white,border:"none",padding:"11px 18px",fontSize:10,letterSpacing:"0.16em",cursor:artistEditSaving?"wait":"pointer",fontFamily:ag,textTransform:"uppercase"}}>{artistEditSaving?"Saving...":"Save Profile"}</button>
                      <button onClick={cancelArtistEditProfile} disabled={artistEditSaving} style={{background:"transparent",color:C.black,border:`0.5px solid ${C.black}`,padding:"10px 18px",fontSize:10,letterSpacing:"0.16em",cursor:artistEditSaving?"wait":"pointer",fontFamily:ag,textTransform:"uppercase",opacity:artistEditSaving?0.6:1}}>Cancel</button>
                    </div>
                  </div>
                )}

                <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.white,width:"100%",maxWidth:"100%",minWidth:0,overflowX:"hidden",boxSizing:"border-box"}}>
                  <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.5rem"}}>Profile Photo</p>
                  <p style={{fontFamily:co,fontSize:13,fontStyle:"italic",color:C.gray,lineHeight:1.6,margin:"0 0 0.85rem"}}>Your main profile photo appears on your artist directory listing.</p>
                  <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
                    <div style={{width:84,height:84,borderRadius:"50%",overflow:"hidden",background:C.iceBlue,border:`0.5px solid ${C.border}`,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {(()=>{
                        const photoUrl=myArtistProfile?.profile_photo_url||"";
                        const displayUrl=getArtistStorageDisplayUrl(photoUrl);
                        const displayName=myArtistProfile?.business_name||myArtistProfile?.owner_name||"A";
                        const initials=displayName.split(" ").map(w=>w[0]).filter(Boolean).slice(0,2).join("").toUpperCase()||"A";
                        if(displayUrl){
                          return <img src={displayUrl} alt="Profile" style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.currentTarget.style.display="none";}}/>;
                        }
                        return <span style={{fontFamily:ag,fontSize:14,letterSpacing:"0.1em",color:C.nearBlack}}>{initials}</span>;
                      })()}
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      <input ref={profilePhotoFileRef} type="file" accept="image/*" disabled={profilePhotoUploading} onChange={e=>{const f=e.target.files&&e.target.files[0];if(f)uploadArtistProfilePhoto(f);}} style={{display:"none"}}/>
                      <button type="button" onClick={()=>profilePhotoFileRef.current?.click()} disabled={profilePhotoUploading} className={`artist-primary-button ${profilePhotoUploading ? "is-disabled" : ""}`}>{profilePhotoUploading?"UPLOADING...":(myArtistProfile?.profile_photo_url?"CHANGE PROFILE PHOTO":"UPLOAD PROFILE PHOTO")}</button>
                      {profilePhotoMessage&&<p style={{fontFamily:ag,fontSize:10,letterSpacing:"0.14em",textTransform:"uppercase",color:C.teal,margin:0}}>{profilePhotoMessage}</p>}
                      {profilePhotoError&&<p style={{fontFamily:co,fontSize:12,color:"#b00020",lineHeight:1.5,margin:0,maxWidth:280}}>{profilePhotoError}</p>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ARTIST PORTFOLIO ─────────────────────────────────────────── */}
      {false&&screen==="artistPortfolio"&&(
        <div className="artist-dashboard" style={{...screenContainerStyle,height:"calc(100vh - 74px - env(safe-area-inset-top) - env(safe-area-inset-bottom))",overflowY:"auto",overflowX:"hidden",WebkitOverflowScrolling:"touch",overscrollBehaviorY:"contain",overscrollBehaviorX:"none",touchAction:"pan-y",padding:"2.5rem min(2rem, 5vw) calc(5rem + env(safe-area-inset-bottom))",background:C.white,color:C.black}}>
          {console.log("ARTIST PORTFOLIO ROUTE RENDERED")}
          <div style={{width:"100%",maxWidth:720,margin:"0 auto",minWidth:0,overflowX:"hidden",boxSizing:"border-box"}}>
            <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.35em",textTransform:"uppercase",color:C.gray,marginBottom:"0.4rem"}}>Artist workspace</p>
            <h2 style={{fontFamily:ve,fontSize:24,fontWeight:400,letterSpacing:"0.14em",margin:"0 0 1rem"}}>PORTFOLIO</h2>
            {!session?.user?(
              <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.blush}}>
                <p style={{fontFamily:co,fontSize:14,fontStyle:"italic",color:C.gray,lineHeight:1.7,margin:"0 0 1rem"}}>Sign in to manage your portfolio.</p>
                <button onClick={()=>{setAuthMode("login");setAuthOpen(true);}} style={{background:C.black,color:C.white,border:"none",padding:"12px 24px",fontSize:10,letterSpacing:"0.18em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Sign In</button>
              </div>
            ):!isArtist?(
              <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.blush}}>
                <p style={{fontFamily:co,fontSize:14,fontStyle:"italic",color:C.gray,lineHeight:1.7,margin:"0 0 1rem"}}>Artist access only.</p>
                <button onClick={()=>setScreen("home")} style={{background:C.black,color:C.white,border:"none",padding:"12px 24px",fontSize:10,letterSpacing:"0.18em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Back to Home</button>
              </div>
            ):(
              <div style={{display:"grid",gap:12,minWidth:0,width:"100%",maxWidth:"100%",overflowX:"hidden",boxSizing:"border-box"}}>
                <div ref={portfolioSectionRef} style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.white,width:"100%",maxWidth:"100%",minWidth:0,overflowX:"hidden",boxSizing:"border-box"}}>
                  <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.5rem"}}>Portfolio Photos</p>
                  <p style={{fontFamily:co,fontSize:13,fontStyle:"italic",color:C.gray,lineHeight:1.6,margin:"0 0 0.75rem"}}>Upload portfolio images. Photos are saved to your account and will persist. Current limit: {artistPortfolioCount} / {artistPortfolioMax}.</p>
                  <input ref={portfolioFileRef} type="file" accept="image/*" disabled={portfolioUploading} onChange={e=>{const f=e.target.files&&e.target.files[0];if(f)uploadPortfolioPhoto(f);}} style={{display:"none"}}/>
                  <button onClick={()=>portfolioFileRef.current?.click()} disabled={portfolioUploading||artistPortfolioCount>=artistPortfolioMax} style={{background:portfolioUploading||artistPortfolioCount>=artistPortfolioMax?C.gray:C.black,color:C.white,border:"none",padding:"12px 18px",fontSize:10,letterSpacing:"0.16em",cursor:portfolioUploading?"wait":artistPortfolioCount>=artistPortfolioMax?"default":"pointer",fontFamily:ag,textTransform:"uppercase"}}>{portfolioUploading?"Uploading…":"Upload Photo"}</button>
                  {!isUpgraded&&<p style={{fontFamily:co,fontSize:12,fontStyle:"italic",color:C.gray,margin:"0.6rem 0 0"}}>Free artists can upload and tag up to 12 photos. Upgrade to pin your strongest images first and expand to 50.</p>}
                  {isUpgraded&&<p style={{fontFamily:co,fontSize:12,fontStyle:"italic",color:C.teal,margin:"0.6rem 0 0"}}>Premium: pin your top 3 photos and store up to 50.</p>}
                  {portfolioUploading&&<p style={{fontFamily:co,fontSize:12,fontStyle:"italic",color:C.gray,margin:"0.6rem 0 0"}}>Uploading your photo…</p>}
                  {portfolioMessage&&<p style={{fontFamily:ag,fontSize:10,letterSpacing:"0.14em",textTransform:"uppercase",color:C.teal,margin:"0.6rem 0 0"}}>{portfolioMessage}</p>}
                  {photosLoadError&&<p style={{fontFamily:co,fontSize:12,color:"#b00020",lineHeight:1.5,margin:"0.6rem 0 0",wordBreak:"break-word"}}>{photosLoadError}</p>}
                  {portfolioError&&<p style={{fontFamily:co,fontSize:12,color:"#b00020",lineHeight:1.5,margin:"0.6rem 0 0",wordBreak:"break-word"}}>{portfolioError}</p>}
                  <div style={{marginTop:"1rem",minWidth:0,width:"100%",maxWidth:"100%",overflowX:"hidden"}}>
                    {renderPortfolioTagWorkflow({
                      photos:safePortfolioPhotos,
                      scope:"artist",
                      emptyText:"No portfolio photos yet.",
                    })}
                  </div>
                  {safePortfolioPhotos.length===0&&!portfolioUploading&&(
                    <div style={{height:120,marginTop:"1rem"}}>
                      <ImagePlaceholder label="No portfolio photos yet"/>
                    </div>
                  )}
                </div>

                <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.white,width:"100%",maxWidth:"100%",minWidth:0,overflowX:"hidden",boxSizing:"border-box"}}>
                  <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.5rem"}}>Cover Image</p>
                  {isUpgraded?(
                    <>
                      <p style={{fontFamily:co,fontSize:13,fontStyle:"italic",color:C.gray,lineHeight:1.6,margin:"0 0 0.85rem"}}>A wide hero image shown at the top of your artist profile.</p>
                      {myArtistProfile?.cover_image_url&&(
                        <div style={{height:140,background:C.iceBlue,overflow:"hidden",border:`0.5px solid ${C.border}`,marginBottom:"0.75rem"}}>
                          <SafeImage src={myArtistProfile.cover_image_url} alt="Cover" loadingLabel="Loading cover" fallback={<ImagePlaceholder label="Cover image unavailable"/>}/>
                        </div>
                      )}
                      <label style={{display:"flex",flexDirection:"column",gap:5,fontFamily:ag,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray}}>
                        Cover Image URL
                        <input value={artistEditForm.cover_image_url||""} onChange={e=>setArtistEditForm(prev=>({...prev,cover_image_url:e.target.value}))} placeholder="https://..." style={{width:"100%",maxWidth:"100%",border:`0.5px solid ${C.border}`,padding:"9px 10px",fontFamily:co,fontSize:16,letterSpacing:0,textTransform:"none",color:C.black,outline:"none",boxSizing:"border-box",overflowWrap:"anywhere"}}/>
                      </label>
                      <button onClick={saveArtistEditProfile} disabled={artistEditSaving} style={{marginTop:"0.75rem",background:artistEditSaving?C.gray:C.black,color:C.white,border:"none",padding:"11px 18px",fontSize:10,letterSpacing:"0.16em",cursor:artistEditSaving?"wait":"pointer",fontFamily:ag,textTransform:"uppercase"}}>{artistEditSaving?"Saving...":"Save Cover Image"}</button>
                    </>
                  ):(
                    <ArtistProLockedCard title="Cover Image" body="Upgrade to add a wide hero image to the top of your artist profile."/>
                  )}
                </div>

                <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.white,width:"100%",maxWidth:"100%",minWidth:0,overflowX:"hidden",boxSizing:"border-box"}}>
                  <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.5rem"}}>Signature Method</p>
                  {isUpgraded?(
                    <>
                      <p style={{fontFamily:co,fontSize:13,fontStyle:"italic",color:C.gray,lineHeight:1.6,margin:"0 0 0.85rem"}}>A short statement that captures your signature technique or approach.</p>
                      <label style={{display:"flex",flexDirection:"column",gap:5,fontFamily:ag,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray}}>
                        Signature Method
                        <textarea value={artistEditForm.signature_method||""} onChange={e=>setArtistEditForm(prev=>({...prev,signature_method:e.target.value}))} rows={3} style={{width:"100%",maxWidth:"100%",border:`0.5px solid ${C.border}`,padding:"9px 10px",fontFamily:co,fontSize:16,letterSpacing:0,textTransform:"none",color:C.black,outline:"none",resize:"vertical",boxSizing:"border-box",overflowWrap:"anywhere"}}/>
                      </label>
                      <button onClick={saveArtistEditProfile} disabled={artistEditSaving} style={{marginTop:"0.75rem",background:artistEditSaving?C.gray:C.black,color:C.white,border:"none",padding:"11px 18px",fontSize:10,letterSpacing:"0.16em",cursor:artistEditSaving?"wait":"pointer",fontFamily:ag,textTransform:"uppercase"}}>{artistEditSaving?"Saving...":"Save Signature Method"}</button>
                    </>
                  ):(
                    <ArtistProLockedCard title="Signature Method" body="Upgrade to publish your signature technique on your artist profile."/>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ARTIST ANALYTICS ─────────────────────────────────────────── */}
      {false&&screen==="artistAnalytics"&&(
        <div className="artist-dashboard" style={{...screenContainerStyle,height:"calc(100vh - 74px - env(safe-area-inset-top) - env(safe-area-inset-bottom))",overflowY:"auto",overflowX:"hidden",WebkitOverflowScrolling:"touch",overscrollBehaviorY:"contain",overscrollBehaviorX:"none",touchAction:"pan-y",padding:"2.5rem min(2rem, 5vw) calc(5rem + env(safe-area-inset-bottom))",background:C.white,color:C.black}}>
          {console.log("ARTIST ANALYTICS ROUTE RENDERED")}
          <div style={{width:"100%",maxWidth:720,margin:"0 auto",minWidth:0,overflowX:"hidden",boxSizing:"border-box"}}>
            <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.35em",textTransform:"uppercase",color:C.gray,marginBottom:"0.4rem"}}>Artist workspace</p>
            <h2 style={{fontFamily:ve,fontSize:24,fontWeight:400,letterSpacing:"0.14em",margin:"0 0 1rem"}}>ANALYTICS</h2>
            {!session?.user?(
              <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.blush}}>
                <p style={{fontFamily:co,fontSize:14,fontStyle:"italic",color:C.gray,lineHeight:1.7,margin:"0 0 1rem"}}>Sign in to see your analytics.</p>
                <button onClick={()=>{setAuthMode("login");setAuthOpen(true);}} style={{background:C.black,color:C.white,border:"none",padding:"12px 24px",fontSize:10,letterSpacing:"0.18em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Sign In</button>
              </div>
            ):!isArtist?(
              <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.blush}}>
                <p style={{fontFamily:co,fontSize:14,fontStyle:"italic",color:C.gray,lineHeight:1.7,margin:"0 0 1rem"}}>Artist access only.</p>
                <button onClick={()=>setScreen("home")} style={{background:C.black,color:C.white,border:"none",padding:"12px 24px",fontSize:10,letterSpacing:"0.18em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Back to Home</button>
              </div>
            ):(()=>{
              const profileViews=Number(myArtistProfile?.profile_views)||0;
              const inquiryClicks=Number(myArtistProfile?.inquiry_clicks)||0;
              const inquiryRate=profileViews>0?`${((inquiryClicks/profileViews)*100).toFixed(1)}%`:"0%";
              return (
                <div style={{display:"grid",gap:12,minWidth:0,width:"100%",maxWidth:"100%",overflowX:"hidden",boxSizing:"border-box"}}>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(190px,100%),1fr))",gap:10,minWidth:0,width:"100%",maxWidth:"100%",overflowX:"hidden"}}>
                    <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.white,minWidth:0,overflowX:"hidden"}}>
                      <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.5rem"}}>Profile Views</p>
                      <p style={{fontFamily:ve,fontSize:22,letterSpacing:"0.08em",margin:0}}>👀 {profileViews}</p>
                    </div>
                    <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.white,minWidth:0,overflowX:"hidden"}}>
                      <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.5rem"}}>Link Clicks</p>
                      <p style={{fontFamily:ve,fontSize:22,letterSpacing:"0.08em",margin:0}}>💌 {inquiryClicks}</p>
                    </div>
                    <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.white,minWidth:0,overflowX:"hidden"}}>
                      <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.5rem"}}>Click-Through Rate</p>
                      <p style={{fontFamily:ve,fontSize:22,letterSpacing:"0.08em",margin:0}}>{inquiryRate}</p>
                    </div>
                  </div>
                  <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.white,width:"100%",maxWidth:"100%",minWidth:0,overflowX:"hidden",boxSizing:"border-box"}}>
                    <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.5rem"}}>Most Viewed Portfolio Photos</p>
                    {isUpgraded?(
                      <p style={{fontFamily:co,fontSize:13,fontStyle:"italic",color:C.gray,lineHeight:1.6,margin:0}}>Per-photo view counts appear here once your portfolio receives traffic.</p>
                    ):(
                      <ArtistProLockedCard title="Most Viewed Portfolio Photos" body="Upgrade to see which portfolio photos brides are viewing most."/>
                    )}
                  </div>
                  <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.white,width:"100%",maxWidth:"100%",minWidth:0,overflowX:"hidden",boxSizing:"border-box"}}>
                    <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.5rem"}}>Top Performing Tags</p>
                    {isUpgraded?(
                      <p style={{fontFamily:co,fontSize:13,fontStyle:"italic",color:C.gray,lineHeight:1.6,margin:0}}>Discover which tags brides match against most when your profile shows up.</p>
                    ):(
                      <ArtistProLockedCard title="Top Performing Tags" body="Upgrade to surface which tags are bringing brides to your profile."/>
                    )}
                  </div>
                  <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.white,width:"100%",maxWidth:"100%",minWidth:0,overflowX:"hidden",boxSizing:"border-box"}}>
                    <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.5rem"}}>Most Saved Categories</p>
                    {isUpgraded?(
                      <p style={{fontFamily:co,fontSize:13,fontStyle:"italic",color:C.gray,lineHeight:1.6,margin:0}}>Categories brides save most often from your portfolio show up here.</p>
                    ):(
                      <ArtistProLockedCard title="Most Saved Categories" body="Upgrade to learn which categories brides save most from your portfolio."/>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── ARTIST PREMIUM ───────────────────────────────────────────── */}
      {false&&screen==="artistPremium"&&(
        <div className="artist-dashboard" style={{...screenContainerStyle,height:"calc(100vh - 74px - env(safe-area-inset-top) - env(safe-area-inset-bottom))",overflowY:"auto",overflowX:"hidden",WebkitOverflowScrolling:"touch",overscrollBehaviorY:"contain",overscrollBehaviorX:"none",touchAction:"pan-y",padding:"2.5rem min(2rem, 5vw) calc(5rem + env(safe-area-inset-bottom))",background:C.white,color:C.black}}>
          {console.log("ARTIST PREMIUM ROUTE RENDERED")}
          <div style={{width:"100%",maxWidth:720,margin:"0 auto",minWidth:0,overflowX:"hidden",boxSizing:"border-box"}}>
            <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.35em",textTransform:"uppercase",color:C.gray,marginBottom:"0.4rem"}}>Artist workspace</p>
            <h2 style={{fontFamily:ve,fontSize:24,fontWeight:400,letterSpacing:"0.14em",margin:"0 0 1rem"}}>PREMIUM</h2>
            {!session?.user?(
              <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.blush}}>
                <p style={{fontFamily:co,fontSize:14,fontStyle:"italic",color:C.gray,lineHeight:1.7,margin:"0 0 1rem"}}>Sign in to view premium options.</p>
                <button onClick={()=>{setAuthMode("login");setAuthOpen(true);}} style={{background:C.black,color:C.white,border:"none",padding:"12px 24px",fontSize:10,letterSpacing:"0.18em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Sign In</button>
              </div>
            ):!isArtist?(
              <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.blush}}>
                <p style={{fontFamily:co,fontSize:14,fontStyle:"italic",color:C.gray,lineHeight:1.7,margin:"0 0 1rem"}}>Artist access only.</p>
                <button onClick={()=>setScreen("home")} style={{background:C.black,color:C.white,border:"none",padding:"12px 24px",fontSize:10,letterSpacing:"0.18em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Back to Home</button>
              </div>
            ):(
              <div style={{display:"grid",gap:12,minWidth:0,width:"100%",maxWidth:"100%",overflowX:"hidden",boxSizing:"border-box"}}>
                <div style={{border:`0.5px solid ${isUpgraded?C.teal:C.border}`,padding:"1.25rem",background:isUpgraded?"#eaf7ea":C.white,width:"100%",maxWidth:"100%",minWidth:0,overflowX:"hidden",boxSizing:"border-box"}}>
                  <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:isUpgraded?C.teal:C.gray,margin:"0 0 0.5rem"}}>Current Tier</p>
                  <p style={{fontFamily:ve,fontSize:22,letterSpacing:"0.1em",margin:0}}>{isUpgraded?"Premium Artist":"Free Artist"}</p>
                </div>
                {isUpgraded?(
                  <div style={{border:`0.5px solid ${C.teal}`,padding:"1.25rem",background:"#eaf7ea",width:"100%",maxWidth:"100%",minWidth:0,overflowX:"hidden",boxSizing:"border-box"}}>
                    <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.teal,margin:"0 0 0.85rem"}}>Premium Features Active ✓</p>
                    <ul style={{margin:0,padding:"0 0 0 1.1rem",fontFamily:co,fontSize:14,color:C.black,lineHeight:1.8}}>
                      <li>Featured placement enabled</li>
                      <li>Portfolio limit: 50</li>
                      <li>Pin top portfolio images</li>
                      <li>Enhanced analytics active</li>
                      <li>Featured Artist badge active</li>
                    </ul>
                  </div>
                ):(
                  <>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(220px,100%),1fr))",gap:10,minWidth:0,width:"100%",maxWidth:"100%",overflowX:"hidden"}}>
                      <ArtistProLockedCard title="Featured Badge" body="Stand out in the directory with a featured artist badge."/>
                      <ArtistProLockedCard title="Priority Placement" body="Appear higher in directory results when brides are searching."/>
                      <ArtistProLockedCard title="Pin Top Photos" body="Pin your top 3 portfolio images to lead your gallery."/>
                      <ArtistProLockedCard title="Expanded Portfolio Limit" body="Upload up to 50 portfolio photos instead of 12."/>
                      <ArtistProLockedCard title="Enhanced Analytics" body="Profile views, link clicks, top tags, and most-viewed photos."/>
                      <ArtistProLockedCard title="Cover Image" body="Add a wide hero image to the top of your artist profile."/>
                      <ArtistProLockedCard title="Signature Method" body="Publish your signature technique on your artist profile."/>
                    </div>
                    <div style={{border:`0.5px solid ${C.border}`,padding:"1.25rem",background:C.white,width:"100%",maxWidth:"100%",minWidth:0,overflowX:"hidden",boxSizing:"border-box"}}>
                      <ArtistUpgradeButton variant="dashboard"/>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DIRECTORY ────────────────────────────────────────────────── */}
      {screen==="directory"&&!selectedArtist&&(
        <div style={{...screenContainerStyle,height:"calc(100vh - 74px - env(safe-area-inset-top) - env(safe-area-inset-bottom))",overflowY:"auto",WebkitOverflowScrolling:"touch",overscrollBehaviorY:"contain",padding:"2.5rem 1.5rem calc(5rem + env(safe-area-inset-bottom))"}}>
          <div style={{textAlign:"center",marginBottom:"1.75rem"}}>
            <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.35em",textTransform:"uppercase",color:C.gray,marginBottom:"0.4rem"}}>Vetted for portfolio · specialty · education · communication</p>
            <h2 style={{fontFamily:ve,fontSize:24,fontWeight:400,letterSpacing:"0.14em",marginBottom:"0.4rem"}}>FIND YOUR ARTIST</h2>
            <p style={{fontFamily:co,fontStyle:"italic",color:C.gray,fontSize:14}}>Not a popularity contest — curated for quality, niche clarity, and specialization.</p>
          </div>
          <div style={{maxWidth:880,margin:"0 auto 1.75rem",display:"flex",flexDirection:"column",gap:9}}>
            <input value={dirSearch} onChange={e=>setDirSearch(e.target.value)} placeholder="Search by name, city, region, country, specialty, aesthetic..." style={{width:"100%",border:`0.5px solid #ccc`,padding:"10px 15px",fontSize:16,fontFamily:co,outline:"none",boxSizing:"border-box"}}/>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
              {(()=>{
                const countryOptions=["All Countries",...[...new Set((allArtists??[]).map(a=>a.country).filter(Boolean))].sort()];
                const regionOptions=["All Regions",...[...new Set((allArtists??[]).map(a=>artistRegion(a)).filter(Boolean))].sort()];
                return [["Country",countryOptions,dirCountry,setDirCountry],["State / Province / Region",regionOptions,dirState,setDirState],["Services",SERVICES_F,dirService,setDirService]].map(([l,opts,val,setter])=>(
                <select key={l} value={val} onChange={e=>setter(e.target.value)} style={{border:`0.5px solid #ccc`,padding:"7px 11px",fontSize:16,fontFamily:ag,letterSpacing:"0.06em",background:C.white,outline:"none",cursor:"pointer"}}>
                  {opts.map(o=><option key={o}>{o}</option>)}
                </select>
                ));
              })()}
              <label style={{display:"flex",alignItems:"center",gap:6,fontFamily:ag,fontSize:9,letterSpacing:"0.1em",color:C.gray,cursor:"pointer"}}>
                <input type="checkbox" checked={dirTravel} onChange={e=>setDirTravel(e.target.checked)} style={{accentColor:C.black}}/>Travels
              </label>
              <span style={{fontFamily:co,fontStyle:"italic",fontSize:12,color:C.gray,marginLeft:"auto"}}>{filteredArtists.length} found{result?" · sorted by match":""}</span>
            </div>
            <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.1em",color:"#bbb"}}>{PRICE_LEGEND}</p>
            {directoryError&&<p style={{fontFamily:co,fontSize:13,color:"#cc4444",maxWidth:880,margin:"0 auto",lineHeight:1.6}}>{directoryError}</p>}
            {!directoryError&&filteredArtists.length===0&&<p style={{fontFamily:co,fontStyle:"italic",fontSize:14,color:C.gray,maxWidth:880,margin:"0 auto"}}>{hiddenDirectoryArtists>0?"Approved artists are finishing their profiles before appearing here.":"No approved artists yet."}</p>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(250px,100%),1fr))",gap:12,maxWidth:880,width:"100%",minWidth:0,margin:"0 auto"}}>
            {filteredArtists.map(artist=>{
              const displayName = artist?.business_name ?? "";
              const ownerName = artist?.owner_name ?? "";
              const specialties = artist?.specialties ?? [];
              const fit=result?artistFit(artist,result):null;
              const matchRank = result ? filteredArtists.findIndex(a=>a.id===artist.id)+1 : null;
              const showFit = fit && (hasPremiumAccess || matchRank<=5);
              return(
                <div key={artist.id} style={{background:C.white,border:`0.5px solid ${C.border}`,padding:"1.25rem",cursor:"pointer",position:"relative",transition:"border-color 0.15s"}}
                  onClick={()=>setSelectedArtist(artist)}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=C.black}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                  {showFit&&<div style={{position:"absolute",top:10,right:10,background:fit>=90?C.nearBlack:fit>=80?"#4A7A6A":"#8B6B4A",color:C.white,padding:"2px 8px",fontFamily:ag,fontSize:8,letterSpacing:"0.1em"}}>{fit}%</div>}
                  <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:"0.75rem",paddingRight:showFit?44:0}}>
                    <div style={{width:40,height:40,borderRadius:"50%",background:C.nearBlack,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:ag,fontSize:9,color:C.lavender,flexShrink:0,overflow:"hidden"}}>
                      <SafeImage src={artist?.portfolio_image ?? artist?.profile_photo_url ?? ""} alt={displayName} loadingLabel="" fallback={<InitialsFallback name={displayName||ownerName} label={artist?.avatar} size={9}/>}/>
                    </div>
                    <div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:5,alignItems:"center"}}>
                        <p style={{margin:0,fontFamily:ve,fontSize:12,letterSpacing:"0.06em"}}>{displayName}</p>
                        {artist?.badge&&<span style={{background:`${C.lavender}40`,border:`0.5px solid ${C.lavender}`,padding:"1px 6px",fontSize:7,fontFamily:ag,letterSpacing:"0.1em",color:"#6a3d7a"}}>{artist.badge}</span>}
                        {artist?.is_featured===true&&<span style={{background:`${C.lavender}40`,border:`0.5px solid ${C.lavender}`,padding:"1px 6px",fontSize:7,fontFamily:ag,letterSpacing:"0.1em",color:"#6a3d7a"}}>{artist.featured_badge_label||"Featured Artist"}</span>}
                      </div>
                      <p style={{margin:0,fontFamily:ag,fontSize:9,letterSpacing:"0.07em",color:C.gray}}>{artistLocationLabel(artist)} · {artist?.services ?? ""}</p>
                    </div>
                  </div>
                  <p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:C.nearBlack,marginBottom:"0.6rem",lineHeight:1.6}}>{artist?.aesthetic ?? ""}</p>
                  {artist?.artist_notes&&<p style={{fontFamily:co,fontSize:12,color:C.gray,margin:"0 0 0.6rem",lineHeight:1.5}}>{artist.artist_notes}</p>}
                  <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:"0.6rem"}}>{specialties.slice(0,3).map(s=><span key={s} style={{background:C.iceBlue,padding:"1px 8px",fontSize:8,fontFamily:ag,letterSpacing:"0.06em"}}>{s}</span>)}</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontFamily:co,fontSize:12,color:C.gray}}>★ {artist?.rating ?? 5} ({artist?.reviews ?? 0}) · {artist?.price ?? "Request quote"}</span>
                    {artist?.travel&&<span style={{fontFamily:ag,fontSize:8,color:C.teal,letterSpacing:"0.1em"}}>TRAVELS</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{textAlign:"center",marginTop:"2rem"}}>
            <button onClick={()=>{if(!session?.user){setAuthMode("signup");setAuthAccountType("artist");setAuthOpen(true);return;}setScreen("apply");}} style={{background:"none",border:"none",fontFamily:co,fontStyle:"italic",fontSize:13,color:C.gray,cursor:"pointer",textDecoration:"underline"}}>Apply to be listed</button>
          </div>
        </div>
      )}

      {/* ── ARTIST APPLICATION ────────────────────────────────────────── */}
      {screen==="apply"&&(
        <div style={{...screenContainerStyle,display:"flex",flexDirection:"column",alignItems:"center",padding:"2.5rem 2rem"}}>
          <div style={{width:"100%",maxWidth:540}}>
            <button onClick={()=>goToScreen("directory")} style={{background:"none",border:"none",fontFamily:ag,fontSize:9,letterSpacing:"0.14em",color:C.gray,cursor:"pointer",marginBottom:"1.75rem",textTransform:"uppercase"}}>← Back to Directory</button>
            {isArtistApproved?(
              <div style={{background:C.iceBlue,border:`0.5px solid ${C.border}`,padding:"1.25rem",textAlign:"center"}}>
                <button onClick={()=>goToScreen("artistDashboard")} style={{background:C.black,color:C.white,border:"none",padding:"12px 24px",fontSize:10,letterSpacing:"0.18em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Open Dashboard</button>
              </div>
            ):(
              <>
            <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.35em",textTransform:"uppercase",color:C.gray,marginBottom:"0.4rem"}}>For professional bridal artists</p>
            <h2 style={{fontFamily:ve,fontSize:22,fontWeight:400,letterSpacing:"0.14em",marginBottom:"0.5rem"}}>APPLY TO BE LISTED</h2>
            <p style={{fontFamily:co,fontStyle:"italic",fontSize:14,color:C.gray,marginBottom:"2rem",lineHeight:1.6}}>We vet for portfolio quality, niche clarity, education, and communication. Not follower count.</p>
            {(appSubmitted||isArtistPending)?(
              <div style={{background:C.nearBlack,padding:"3rem 2rem",textAlign:"center",color:C.white}}>
                <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.5em",textTransform:"uppercase",color:C.lavender,marginBottom:"1.5rem"}}>The Bridal Edit™</p>
                <p style={{fontFamily:ve,fontSize:22,letterSpacing:"0.14em",marginBottom:"1rem"}}>APPLICATION RECEIVED</p>
                <div style={{width:40,height:1,background:C.lavender,margin:"0 auto 1.25rem"}}/>
                <p style={{fontFamily:ag,fontSize:10,letterSpacing:"0.16em",textTransform:"uppercase",color:C.lavender,margin:"0 0 1rem"}}>{appSubmitMessage||"Application submitted."}</p>
                <p style={{fontFamily:co,fontSize:15,color:"#ccc",lineHeight:1.8,marginBottom:"0.5rem"}}>Thank you for applying to our artist directory.</p>
                <p style={{fontFamily:co,fontStyle:"italic",fontSize:14,color:"#999",lineHeight:1.8,marginBottom:"2rem"}}>Our team will review your portfolio, specialties, and experience and be in touch within 48 hours.</p>
                <button onClick={()=>{setAppSubmitted(false);goToScreen("home");}} style={{background:C.white,color:C.black,border:"none",padding:"12px 28px",fontSize:10,letterSpacing:"0.18em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Back to Home</button>
              </div>
            ):isArtistRejected?(
              <div style={{background:"#faf0f0",border:"0.5px solid #cc4444",padding:"1.25rem",fontFamily:co,fontSize:14,fontStyle:"italic",color:"#9f2f2f",lineHeight:1.6}}>
                Your artist application was not approved.
              </div>
            ):(
              <form onSubmit={submitApplication} style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
                {appSubmitError&&(
                  <div style={{background:"#fff4f4",border:"0.5px solid #cc4444",padding:"0.9rem 1rem",fontFamily:co,fontSize:14,fontStyle:"italic",color:"#9f2f2f",lineHeight:1.6}}>{appSubmitError}</div>
                )}
                {appSubmitMessage&&(
                  <div style={{background:C.iceBlue,border:`0.5px solid ${C.teal}`,padding:"0.9rem 1rem",fontFamily:co,fontSize:14,fontStyle:"italic",color:C.teal,lineHeight:1.6}}>{appSubmitMessage}</div>
                )}
                {[{k:"name",l:"Your Name",p:"Full name",t:"text"},{k:"business",l:"Business Name",p:"Studio or brand name",t:"text"},{k:"email",l:"Email",p:"you@example.com",t:"email"},{k:"city",l:"City",p:"e.g. Charleston",t:"text"}].map(f=>(
                  <div key={f.k}>
                    <label style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,display:"block",marginBottom:"0.35rem"}}>{f.l}</label>
                    <input type={f.t==="email"?"email":"text"} value={appForm[f.k]} onChange={e=>setAppForm(p=>({...p,[f.k]:e.target.value}))} placeholder={f.p} style={{width:"100%",border:`0.5px solid #ccc`,padding:"9px 12px",fontSize:16,fontFamily:co,outline:"none",boxSizing:"border-box"}}/>
                  </div>
                ))}
                <div>
                  <label style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,display:"block",marginBottom:"0.35rem"}}>Country</label>
                  <select value={appForm.country} onChange={e=>setAppForm(p=>({...p,country:e.target.value,provinceState:""}))} style={{width:"100%",border:`0.5px solid #ccc`,padding:"9px 12px",fontSize:16,fontFamily:co,outline:"none",boxSizing:"border-box",background:C.white}}>
                    <option value="">Select a country</option>
                    {ARTIST_APP_COUNTRIES.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {(()=>{
                  const regionCfg=ARTIST_APP_REGION_OPTIONS[appForm.country];
                  return(
                    <div>
                      <label style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,display:"block",marginBottom:"0.35rem"}}>{regionCfg?regionCfg.label:"Region / Province"}</label>
                      {regionCfg?(
                        <select value={appForm.provinceState} onChange={e=>setAppForm(p=>({...p,provinceState:e.target.value}))} style={{width:"100%",border:`0.5px solid #ccc`,padding:"9px 12px",fontSize:16,fontFamily:co,outline:"none",boxSizing:"border-box",background:C.white}}>
                          <option value="">{regionCfg.placeholder}</option>
                          {regionCfg.options.map(s=><option key={s} value={s}>{s}</option>)}
                        </select>
                      ):(
                        <input type="text" value={appForm.provinceState} onChange={e=>setAppForm(p=>({...p,provinceState:e.target.value}))} placeholder="Region / Province (optional)" style={{width:"100%",border:`0.5px solid #ccc`,padding:"9px 12px",fontSize:16,fontFamily:co,outline:"none",boxSizing:"border-box"}}/>
                      )}
                    </div>
                  );
                })()}
                {[{k:"website",l:"Website",p:"https://...",t:"url"},{k:"instagram",l:"Instagram Handle",p:"@yourhandle",t:"text"},{k:"experience",l:"Years of Experience",p:"e.g. 8",t:"text"},{k:"priceRange",l:"Price Range",p:"e.g. $350–$600",t:"text"}].map(f=>(
                  <div key={f.k}>
                    <label style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,display:"block",marginBottom:"0.35rem"}}>{f.l}</label>
                    <input type={f.t==="email"?"email":"text"} value={appForm[f.k]} onChange={e=>setAppForm(p=>({...p,[f.k]:e.target.value}))} placeholder={f.p} style={{width:"100%",border:`0.5px solid #ccc`,padding:"9px 12px",fontSize:16,fontFamily:co,outline:"none",boxSizing:"border-box"}}/>
                  </div>
                ))}
                <div>
                  <label style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,display:"block",marginBottom:"0.35rem"}}>Services Offered</label>
                  <select value={appForm.services} onChange={e=>setAppForm(p=>({...p,services:e.target.value}))} style={{width:"100%",border:`0.5px solid #ccc`,padding:"9px 12px",fontSize:16,fontFamily:co,outline:"none",boxSizing:"border-box",background:C.white}}>
                    {["Hair","Makeup","Hair & Makeup"].map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,display:"block",marginBottom:"0.35rem"}}>Specialties</label>
                  <input value={appForm.specialties} onChange={e=>setAppForm(p=>({...p,specialties:e.target.value}))} placeholder="e.g. textured hair, bridal waves, airbrush, editorial" style={{width:"100%",border:`0.5px solid #ccc`,padding:"9px 12px",fontSize:16,fontFamily:co,outline:"none",boxSizing:"border-box"}}/>
                </div>
                <div>
                  <label style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,display:"block",marginBottom:"0.35rem"}}>Bio / Why You Should Be Listed</label>
                  <textarea value={appForm.bio} onChange={e=>setAppForm(p=>({...p,bio:e.target.value}))} placeholder="Tell us about your approach, niche, and what sets you apart..." rows={4} style={{width:"100%",border:`0.5px solid #ccc`,padding:"9px 12px",fontSize:16,fontFamily:co,resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
                </div>
                <button type="submit" disabled={appSubmitting} style={{background:C.black,color:C.white,border:"none",padding:"13px",fontSize:10,letterSpacing:"0.2em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase",opacity:appSubmitting?0.5:1,marginTop:"0.5rem"}}>{appSubmitting?"Submitting...":"Submit Application"}</button>
              </form>
            )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── ARTIST DETAIL ─────────────────────────────────────────────── */}
      {screen==="directory"&&selectedArtist&&(
        <div style={{...screenContainerStyle,display:"flex",flexDirection:"column",alignItems:"center",padding:"2.5rem 2rem"}}>
          <div style={{width:"100%",maxWidth:540}}>
            <button onClick={()=>setSelectedArtist(null)} style={{background:"none",border:"none",fontFamily:ag,fontSize:9,letterSpacing:"0.14em",color:C.gray,cursor:"pointer",marginBottom:"1.75rem",textTransform:"uppercase"}}>← Back</button>
            {(()=>{
              const displayName = selectedArtist?.business_name ?? "";
              const ownerName = selectedArtist?.owner_name ?? "";
              const bestFor = safeArtistArray(selectedArtist?.best_for);
              const notIdeal = safeArtistArray(selectedArtist?.not_ideal_for ?? selectedArtist?.not_ideal);
              const portfolioCount = selectedArtist?.portfolio_photos?.length ?? 0;
              const artistHasProfileId = hasArtistProfileId(selectedArtist);
              const artistEmail = (selectedArtist?.email||"").trim();
              const artistHasEmail = !!artistEmail;
              const brideSignedIn = !!session?.user;
              const artistSaveId = artistSaveKey(selectedArtist);
              const isArtistSaved = !!(artistSaveId && savedArtistIds.has(artistSaveId));
              return (<>
            <div style={{background:C.nearBlack,padding:selectedArtist?.cover_image_url?"0 0 2.25rem":"2.25rem",marginBottom:"1rem",textAlign:"center",color:C.white,overflow:"hidden"}}>
              {selectedArtist?.cover_image_url&&(
                <div style={{height:150,background:C.iceBlue,marginBottom:"1.25rem",overflow:"hidden"}}>
                  <SafeImage src={selectedArtist.cover_image_url} alt="" loadingLabel="Loading cover" fallback={<ImagePlaceholder label="Cover unavailable"/>}/>
                </div>
              )}
              <div style={{width:64,height:64,borderRadius:"50%",background:`${C.lavender}25`,border:`1px solid ${C.lavender}50`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:ag,fontSize:16,color:C.lavender,margin:"0 auto 0.9rem",overflow:"hidden"}}>
                <SafeImage src={selectedArtist?.portfolio_image ?? selectedArtist?.profile_photo_url ?? ""} alt={displayName} loadingLabel="" fallback={<InitialsFallback name={displayName||ownerName} label={selectedArtist?.avatar} size={16} background={`${C.lavender}25`}/>}/>
              </div>
              {selectedArtist?.badge&&<div style={{background:`${C.lavender}25`,border:`0.5px solid ${C.lavender}`,padding:"2px 10px",fontSize:7,fontFamily:ag,letterSpacing:"0.18em",color:C.lavender,display:"inline-block",marginBottom:"0.6rem"}}>{selectedArtist.badge}</div>}
              {selectedArtist?.is_featured===true&&<div style={{background:`${C.lavender}25`,border:`0.5px solid ${C.lavender}`,padding:"2px 10px",fontSize:7,fontFamily:ag,letterSpacing:"0.18em",color:C.lavender,display:"inline-block",marginBottom:"0.6rem",marginLeft:4}}>{selectedArtist.featured_badge_label||"Featured Artist"}</div>}
              <h2 style={{fontFamily:ve,fontSize:19,letterSpacing:"0.14em",margin:"0 0 0.2rem"}}>{displayName.toUpperCase()}</h2>
              <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",color:"#aaa",textTransform:"uppercase",margin:"0 0 0.2rem"}}>{artistLocationLabel(selectedArtist)} · {selectedArtist?.services ?? ""}</p>
              <p style={{fontFamily:co,fontStyle:"italic",color:"#888",margin:"0 0 0.5rem",fontSize:13}}>{ownerName}</p>
              {safeArtistArray(selectedArtist?.featured_services).length>0&&(
                <div style={{display:"flex",justifyContent:"center",flexWrap:"wrap",gap:6,margin:"0.65rem 1rem 0"}}>
                  {safeArtistArray(selectedArtist.featured_services).map(service=><span key={service} style={{background:`${C.lavender}20`,border:`0.5px solid ${C.lavender}50`,padding:"3px 9px",fontFamily:co,fontSize:12,color:C.lavender}}>{service}</span>)}
                </div>
              )}
              {result&&(hasPremiumAccess||filteredArtists.findIndex(a=>a.id===selectedArtist.id)<5)&&<div style={{background:`${C.lavender}20`,border:`0.5px solid ${C.lavender}50`,padding:"4px 12px",display:"inline-block"}}><span style={{fontFamily:ag,fontSize:9,letterSpacing:"0.1em"}}>{artistFit(selectedArtist,result)}% match to your archetype</span></div>}
            </div>
            <div style={{display:"flex",gap:8,marginBottom:"1rem"}}>
              <button
                onClick={()=>{ if(!brideSignedIn){ setAuthOpen(true); return; } toggleSaveArtist(selectedArtist); }}
                disabled={savedArtistPending}
                title={brideSignedIn?(isArtistSaved?"Remove from saved":"Save artist"):"Sign in to save this artist"}
                style={{flex:1,background:isArtistSaved?C.nearBlack:"transparent",color:isArtistSaved?C.white:C.black,border:`0.5px solid ${C.black}`,padding:"11px 8px",fontSize:9,letterSpacing:"0.14em",cursor:savedArtistPending?"wait":"pointer",fontFamily:ag,textTransform:"uppercase"}}
              >
                {!brideSignedIn?"Sign in to Save":(isArtistSaved?"Saved":"Save Artist")}
              </button>
              <button
                onClick={()=>shareArtist(selectedArtist)}
                style={{flex:1,background:"transparent",color:C.black,border:`0.5px solid ${C.black}`,padding:"11px 8px",fontSize:9,letterSpacing:"0.14em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}
              >
                Share
              </button>
              {artistHasEmail&&(
                <a
                  href={`mailto:${artistEmail}`}
                  style={{flex:1,background:"transparent",color:C.black,border:`0.5px solid ${C.black}`,padding:"11px 8px",fontSize:9,letterSpacing:"0.14em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase",textDecoration:"none",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center"}}
                >
                  Email Artist
                </a>
              )}
            </div>
            {savedArtistMessage&&<p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:C.teal,margin:"0 0 0.75rem",textAlign:"center"}}>{savedArtistMessage}</p>}
            {savedArtistError&&<p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:"#cc4444",margin:"0 0 0.75rem",textAlign:"center"}}>{savedArtistError}</p>}
            <div style={{marginBottom:"1.25rem"}}>
              <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.5rem"}}>Portfolio</p>
              {galleryLoading&&(
                <div style={{display:"flex",gap:10,overflowX:"hidden"}}>
                  {[0,1,2].map(i=>(
                    <div key={i} style={{flex:"0 0 70%",aspectRatio:"4 / 5",borderRadius:14,background:`linear-gradient(110deg,${C.iceBlue} 30%,#f5f8fc 50%,${C.iceBlue} 70%)`,backgroundSize:"200% 100%",animation:"galleryShimmer 1.4s ease-in-out infinite",border:`0.5px solid ${C.border}`}}/>
                  ))}
                </div>
              )}
              {!galleryLoading&&galleryError&&<p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:"#cc4444",margin:"0.5rem 0"}}>{galleryError}</p>}
              {!galleryLoading&&!galleryError&&galleryPhotos.length===0&&(
                <p style={{fontFamily:co,fontStyle:"italic",fontSize:14,color:C.gray,margin:"0.5rem 0"}}>No portfolio photos uploaded yet.</p>
              )}
              {!galleryLoading&&galleryPhotos.length>0&&(
                <div style={{display:"flex",flexDirection:"row",gap:10,overflowX:"auto",overflowY:"hidden",scrollSnapType:"x mandatory",WebkitOverflowScrolling:"touch",scrollPadding:"0 1rem",paddingBottom:6,marginLeft:"-0.25rem",marginRight:"-0.25rem",paddingLeft:"0.25rem",paddingRight:"0.25rem"}}>
                  {galleryPhotos.map((photo,i)=>{
                    const rawUrl=photo?.image_url||"";
                    const directHttp=typeof rawUrl==="string"&&/^https?:\/\//i.test(rawUrl);
                    const displaySrc=directHttp?rawUrl:getArtistStorageDisplayUrl(rawUrl);
                    return (
                      <div key={photo.id||i} style={{flex:"0 0 70%",maxWidth:"70%",scrollSnapAlign:"start"}}>
                        <div style={{position:"relative",width:"100%",aspectRatio:"4 / 5",borderRadius:14,background:C.iceBlue,border:`0.5px solid ${C.border}`,overflow:"hidden"}}>
                          {displaySrc?(
                            <img
                              src={displaySrc}
                              alt="Portfolio photo"
                              loading="lazy"
                              draggable={false}
                              onLoad={()=>console.log("GALLERY image load success:", displaySrc)}
                              onError={()=>console.log("GALLERY image load failure:", displaySrc)}
                              style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",display:"block"}}
                            />
                          ):(
                            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                              <ImagePlaceholder label="Image unavailable"/>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {!galleryLoading&&galleryPhotos.length>1&&<p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0.5rem 0 0"}}>Swipe to view more</p>}
            </div>
            {[{label:"Aesthetic",content:selectedArtist?.aesthetic ?? "",style:"italic"},{label:"Bio",content:selectedArtist?.bio ?? "",style:"normal"}].map(s=>(
              <div key={s.label} style={{background:C.iceBlue,padding:"1.2rem",marginBottom:"0.9rem"}}>
                <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,marginBottom:"0.4rem"}}>{s.label}</p>
                <p style={{fontFamily:co,fontSize:15,lineHeight:1.75,margin:0,fontStyle:s.style}}>{s.content}</p>
              </div>
            ))}
            {selectedArtist?.signature_method&&(
              <div style={{background:C.iceBlue,padding:"1.2rem",marginBottom:"0.9rem"}}>
                <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,marginBottom:"0.4rem"}}>Signature Experience</p>
                <p style={{fontFamily:co,fontSize:15,lineHeight:1.75,margin:0,fontStyle:"italic"}}>{selectedArtist.signature_method}</p>
              </div>
            )}
            {selectedArtist?.artist_notes&&(
              <div style={{background:C.white,border:`0.5px solid ${C.border}`,padding:"1.2rem",marginBottom:"0.9rem"}}>
                <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,marginBottom:"0.4rem"}}>Artist Notes</p>
                <p style={{fontFamily:co,fontSize:14,lineHeight:1.7,margin:0,fontStyle:"italic"}}>{selectedArtist.artist_notes}</p>
              </div>
            )}
            {(bestFor.length>0||notIdeal.length>0)&&(
              <div style={{background:C.white,border:`0.5px solid ${C.border}`,padding:"1.2rem",marginBottom:"0.9rem"}}>
                {bestFor.length>0&&(
                  <>
                    <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:"0.6rem"}}>Best for</p>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:notIdeal.length>0?"1rem":0}}>{bestFor.map(s=><span key={s} style={{background:C.blush,padding:"3px 10px",fontSize:13,fontFamily:co}}>{s}</span>)}</div>
                  </>
                )}
                {notIdeal.length>0&&(
                  <>
                    <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.12em",textTransform:"uppercase",color:"#cc6b6b",marginBottom:"0.4rem"}}>Not ideal for</p>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{notIdeal.map(n=><span key={n} style={{background:C.iceBlue,padding:"3px 10px",fontSize:13,fontFamily:co,color:C.gray,fontStyle:"italic"}}>{n}</span>)}</div>
                  </>
                )}
              </div>
            )}
            <div style={{background:C.iceBlue,padding:"1.1rem",marginBottom:"0.9rem"}}>
              <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.14em",textTransform:"uppercase",margin:"0 0 0.4rem"}}>Portfolio quality note</p>
              <p style={{fontFamily:co,fontSize:14,lineHeight:1.7,margin:0}}>{selectedArtist?.portfolio ?? (portfolioCount ? `${portfolioCount} portfolio photos` : "")}</p>
            </div>
            <div style={{background:C.white,border:`0.5px solid ${C.border}`,padding:"1.1rem",marginBottom:"1.5rem"}}>
              <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:"0.4rem"}}>Education & training</p>
              <p style={{fontFamily:co,fontSize:13,lineHeight:1.7,margin:0,fontStyle:"italic",whiteSpace:"pre-line"}}>{selectedArtist?.education ?? ""}</p>
            </div>
            <div style={{display:"flex",gap:12,marginBottom:"1.5rem",textAlign:"center"}}>
              {[[selectedArtist?.rating ?? 5,"Rating"],[selectedArtist?.reviews ?? 0,"Reviews"]].map(([v,l])=>(
                <div key={l} style={{flex:1,background:C.iceBlue,padding:"1rem"}}>
                  <p style={{fontFamily:ve,fontSize:22,margin:"0 0 0.2rem"}}>{v}</p>
                  <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.12em",color:C.gray,margin:0,textTransform:"uppercase"}}>{l}</p>
                </div>
              ))}
              <div style={{flex:1,background:C.iceBlue,padding:"1rem"}}>
                <p style={{fontFamily:ve,fontSize:14,margin:"0 0 0.2rem",letterSpacing:"0.06em"}}>{selectedArtist?.price ?? "Request quote"}</p>
                <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.12em",color:C.gray,margin:0,textTransform:"uppercase"}}>Pricing</p>
              </div>
            </div>
            <a
              href={selectedArtist?.website?.startsWith("http") ? selectedArtist.website : `https://${selectedArtist?.website ?? ""}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{width:"100%",background:C.black,color:C.white,padding:"13px",fontSize:10,letterSpacing:"0.22em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase",textDecoration:"none",display:"block",textAlign:"center",boxSizing:"border-box"}}
            >
              Visit Website
            </a>
            </>);})()}
          </div>
        </div>
      )}
      </main>

      {authOpen&&!session?.user&&authMode!=="reset"&&(
        <AuthModal
          authMode={authMode}
          setAuthMode={setAuthMode}
          accountType={authAccountType}
          setAccountType={setAuthAccountType}
          firstName={authFirstName}
          setFirstName={setAuthFirstName}
          lastName={authLastName}
          setLastName={setAuthLastName}
          email={authEmail}
          setEmail={setAuthEmail}
          password={authPassword}
          setPassword={setAuthPassword}
          confirmPassword={resetConfirmPassword}
          setConfirmPassword={setResetConfirmPassword}
          staySignedIn={staySignedIn}
          setStaySignedIn={setStaySignedIn}
          loading={authLoading}
          error={authError}
          onLogin={()=>authenticate("login")}
          onSignUp={()=>authenticate("signup")}
          onForgotPassword={sendPasswordReset}
          onResetPassword={updateRecoveredPassword}
          onClose={()=>{setAuthOpen(false);setAuthCheckEmail(false);setAuthResetSent(false);setAuthError("");setCheckoutAfterAuth(false);setAuthMode("login");setAuthAccountType("bride");setAuthFirstName("");setAuthLastName("");setResetConfirmPassword("");}}
          onArtistApply={()=>{setAuthMode("signup");setAuthAccountType("artist");setAuthCheckEmail(false);setAuthResetSent(false);setAuthError("");}}
          checkEmail={authCheckEmail}
          resetSent={authResetSent}
        />
      )}

      {premiumOpen&&(
        <PremiumModal
          feature={premiumFeature}
          onClose={()=>{
            setPremiumOpen(false);
            setCheckoutError("");
            setIosPurchaseError("");
            setIosRestoreMessage("");
          }}
          onUnlock={unlockPremium}
          loading={checkoutLoading}
          isLoggedIn={!!session?.user}
          isPremium={hasPremiumAccess}
          checkoutError={checkoutError}
          iosOffering={iosOffering}
          iosOfferingLoading={iosOfferingLoading}
          iosOfferingError={iosOfferingError}
          iosPurchaseLoading={iosPurchaseLoading}
          iosPurchaseError={iosPurchaseError}
          iosRestoreLoading={iosRestoreLoading}
          iosRestoreMessage={iosRestoreMessage}
          onIosPurchase={handleIosPurchase}
          onIosRestore={handleIosRestore}
        />
      )}

      {deleteAccountOpen&&(
        <div role="dialog" aria-modal="true" aria-labelledby="delete-account-title" style={{position:"fixed",left:0,right:0,top:0,bottom:0,width:"100%",zIndex:1100,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:"calc(1.25rem + env(safe-area-inset-top)) 1.25rem calc(1.25rem + env(safe-area-inset-bottom))",overflowX:"hidden"}}>
          <div style={{width:"100%",maxWidth:"min(440px, 100%)",maxHeight:"86vh",overflowY:"auto",background:C.white,color:C.black,padding:"1.5rem",boxShadow:"0 18px 50px rgba(0,0,0,0.28)",boxSizing:"border-box"}}>
            {deleteAccountSuccess?(
              <div>
                <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.22em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.3rem"}}>Account deleted</p>
                <h2 id="delete-account-title" style={{fontFamily:ve,fontSize:20,fontWeight:400,letterSpacing:"0.12em",margin:"0 0 1rem"}}>YOUR ACCOUNT HAS BEEN DELETED</h2>
                <p style={{fontFamily:co,fontSize:14,lineHeight:1.6,margin:"0 0 1.25rem",color:C.gray}}>Your account, profile, photos, messages, and any artist information have been permanently removed. We're sorry to see you go.</p>
                <button
                  type="button"
                  onClick={finishAccountDeletion}
                  style={{width:"100%",background:C.black,color:C.white,border:"none",padding:"12px",fontSize:10,letterSpacing:"0.18em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}
                >
                  Return to home
                </button>
              </div>
            ):(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:"1rem"}}>
                  <div>
                    <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.22em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.3rem"}}>Account</p>
                    <h2 id="delete-account-title" style={{fontFamily:ve,fontSize:20,fontWeight:400,letterSpacing:"0.12em",margin:0}}>DELETE YOUR ACCOUNT</h2>
                  </div>
                  <button
                    type="button"
                    onClick={closeDeleteAccountModal}
                    disabled={deleteAccountLoading}
                    aria-label="Close"
                    style={{background:"none",border:"none",fontSize:22,lineHeight:1,cursor:deleteAccountLoading?"not-allowed":"pointer",color:C.gray,opacity:deleteAccountLoading?0.4:1}}
                  >×</button>
                </div>
                <div style={{background:"#fff4f4",border:"0.5px solid #f3c4c4",padding:"1rem",marginBottom:"1rem"}}>
                  <p style={{fontFamily:co,fontSize:14,lineHeight:1.6,margin:0,color:"#7a1f1f"}}>This will permanently delete your account. We will remove your profile, photos, saved artists, messages, quiz results, artist application, artist profile, and portfolio photos. <strong>This action cannot be undone.</strong></p>
                </div>
                <label style={{display:"block",fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.4rem"}} htmlFor="delete-account-confirm">Type DELETE to confirm</label>
                <input
                  id="delete-account-confirm"
                  type="text"
                  value={deleteAccountConfirmText}
                  onChange={(e)=>setDeleteAccountConfirmText(e.target.value)}
                  disabled={deleteAccountLoading}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="DELETE"
                  style={{width:"100%",padding:"10px 12px",fontFamily:co,fontSize:16,border:`0.5px solid ${C.border}`,background:C.white,color:C.black,marginBottom:"0.85rem",boxSizing:"border-box"}}
                />
                {deleteAccountError&&(
                  <p style={{fontFamily:co,fontSize:13,color:"#cc4444",fontStyle:"italic",lineHeight:1.55,margin:"0 0 0.85rem"}}>{deleteAccountError}</p>
                )}
                <div style={{display:"grid",gridTemplateColumns:"1fr",gap:8}}>
                  <button
                    type="button"
                    onClick={performAccountDeletion}
                    disabled={deleteAccountLoading||deleteAccountConfirmText.trim().toUpperCase()!=="DELETE"}
                    style={{background:"#a32020",color:C.white,border:"none",padding:"12px",fontSize:10,letterSpacing:"0.18em",cursor:(deleteAccountLoading||deleteAccountConfirmText.trim().toUpperCase()!=="DELETE")?"not-allowed":"pointer",fontFamily:ag,textTransform:"uppercase",opacity:(deleteAccountLoading||deleteAccountConfirmText.trim().toUpperCase()!=="DELETE")?0.55:1}}
                  >
                    {deleteAccountLoading?"Deleting your account...":"Delete my account permanently"}
                  </button>
                  <button
                    type="button"
                    onClick={closeDeleteAccountModal}
                    disabled={deleteAccountLoading}
                    style={{background:"transparent",color:C.black,border:`0.5px solid ${C.black}`,padding:"11px",fontSize:10,letterSpacing:"0.16em",cursor:deleteAccountLoading?"not-allowed":"pointer",fontFamily:ag,textTransform:"uppercase",opacity:deleteAccountLoading?0.5:1}}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
