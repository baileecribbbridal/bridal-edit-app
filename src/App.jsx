import { useState, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const C = { iceBlue:"#eff7ff", blush:"#fadfe5", nearBlack:"#1F1F1F", white:"#ffffff", black:"#000000", lavender:"#e9c6eb", gray:"#797979", border:"#e0e0e0", champagne:"#F5ECD7", teal:"#2D6E6E" };
const ag = "'Futura','Century Gothic',sans-serif";
const co = "'Garamond','Georgia',serif";
const ve = "'Trajan Pro','Times New Roman',serif";
const SUPABASE_URL = "https://wrkbkkbxkwawoabqfdeg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indya2Jra2J4a3dhd29hYnFmZGVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNzI0MjcsImV4cCI6MjA5Mzc0ODQyN30.h7s2e-OiwmQEnJgbS0rLAbWDmv_nEEy8qTmKfTFWRPI";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

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
   portfolio:"Consistent editorial coastal bridal. Strong wave structure. Clean airbrush finish.",education:"Advanced airbrush · Coastal bridal specialization",rating:5.0,reviews:84,avatar:"BC",travel:true,price:"Request quote",fit_styles:["structured_wave","sculpted_updo","full_glam","soft_glam"],email:"bailee@baileecribbbridal.com",website:"baileecribbbridal.com"},
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

const US_STATES = ["All States","AK","AL","AR","AZ","CA","CO","CT","DC","DE","FL","GA","HI","IA","ID","IL","IN","KS","KY","LA","MA","MD","ME","MI","MN","MO","MS","MT","NC","ND","NE","NH","NJ","NM","NV","NY","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VA","VT","WA","WI","WV","WY"];
const SERVICES_F = ["All Services","Hair + Makeup","Hair Only","Makeup Only"];
const PRICE_LEGEND = "Pricing varies by date, location, travel, and services. Visit each artist’s website for current pricing.";

function artistFit(artist, result) {
  if(!result) return 70;
  let score = 55;
  if(artist.fit_styles.includes(result.primary)) score += 30;
  if(artist.fit_styles.includes(result.secondary)) score += 15;
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

function AuthModal({email,setEmail,password,setPassword,loading,error,onLogin,onSignUp,onClose}){
  return(
    <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,0.48)",display:"flex",alignItems:"center",justifyContent:"center",padding:"1.25rem"}}>
      <div style={{width:"100%",maxWidth:380,background:C.white,padding:"1.5rem",boxShadow:"0 18px 50px rgba(0,0,0,0.24)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:"1.2rem"}}>
          <div>
            <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.22em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.3rem"}}>Your account</p>
            <h2 style={{fontFamily:ve,fontSize:20,fontWeight:400,letterSpacing:"0.12em",margin:0}}>SIGN IN</h2>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,lineHeight:1,cursor:"pointer",color:C.gray}}>×</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" autoComplete="email" style={{border:"0.5px solid #ccc",padding:"11px 12px",fontSize:15,fontFamily:co,outline:"none"}}/>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" style={{border:"0.5px solid #ccc",padding:"11px 12px",fontSize:15,fontFamily:co,outline:"none"}}/>
          {error&&<p style={{fontFamily:co,fontSize:13,color:"#cc4444",fontStyle:"italic",margin:"0.2rem 0"}}>{error}</p>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <button onClick={onLogin} disabled={loading||!email.trim()||!password} style={{background:C.black,color:C.white,border:"none",padding:"11px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase",opacity:loading||!email.trim()||!password?0.5:1}}>Log In</button>
            <button onClick={onSignUp} disabled={loading||!email.trim()||!password} style={{background:"transparent",color:C.black,border:`0.5px solid ${C.black}`,padding:"11px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase",opacity:loading||!email.trim()||!password?0.5:1}}>Sign Up</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminProducts({products,form,setForm,editingId,loading,error,onSubmit,onEdit,onDelete,onCancel,onRefresh}){
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"2.5rem 1.5rem"}}>
      <div style={{width:"100%",maxWidth:900}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:"1.5rem"}}>
          <div>
            <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.35em",textTransform:"uppercase",color:C.gray,marginBottom:"0.4rem"}}>Admin</p>
            <h2 style={{fontFamily:ve,fontSize:22,fontWeight:400,letterSpacing:"0.14em",margin:"0 0 0.4rem"}}>PRODUCTS</h2>
            <p style={{fontFamily:co,fontStyle:"italic",fontSize:14,color:C.gray,lineHeight:1.7,margin:0}}>Manage the Supabase products table.</p>
          </div>
          <button onClick={onRefresh} disabled={loading} style={{background:C.black,color:C.white,border:"none",padding:"10px 14px",fontSize:9,letterSpacing:"0.14em",fontFamily:ag,textTransform:"uppercase",cursor:"pointer",opacity:loading?0.55:1}}>Refresh</button>
        </div>

        {error&&<div style={{background:"#fff0f0",border:"0.5px solid #cc4444",padding:"0.9rem 1rem",marginBottom:"1rem",fontFamily:co,fontStyle:"italic",color:"#cc4444"}}>{error}</div>}

        <form onSubmit={onSubmit} style={{background:C.iceBlue,padding:"1rem",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:"1.25rem"}}>
          {[
            ["name","Product name"],
            ["cat","Category"],
            ["price","Price"],
            ["link","Link"],
          ].map(([key,label])=>(
            <input key={key} value={form[key]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))} placeholder={label} style={{border:"0.5px solid #ccc",padding:"9px 10px",fontSize:14,fontFamily:co,outline:"none",background:C.white}}/>
          ))}
          <textarea value={form.why} onChange={e=>setForm(p=>({...p,why:e.target.value}))} placeholder="Why this product is recommended" rows={2} style={{gridColumn:"1 / -1",border:"0.5px solid #ccc",padding:"9px 10px",fontSize:14,fontFamily:co,resize:"vertical",outline:"none",background:C.white}}/>
          <div style={{gridColumn:"1 / -1",display:"flex",gap:8}}>
            <button disabled={loading||!form.name.trim()} style={{background:C.black,color:C.white,border:"none",padding:"10px 15px",fontSize:9,letterSpacing:"0.14em",fontFamily:ag,textTransform:"uppercase",cursor:"pointer",opacity:loading||!form.name.trim()?0.5:1}}>{editingId?"Update Product":"Add Product"}</button>
            {editingId&&<button type="button" onClick={onCancel} style={{background:"transparent",color:C.gray,border:`0.5px solid ${C.gray}`,padding:"10px 15px",fontSize:9,letterSpacing:"0.14em",fontFamily:ag,textTransform:"uppercase",cursor:"pointer"}}>Cancel</button>}
          </div>
        </form>

        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {loading&&<p style={{fontFamily:co,fontStyle:"italic",color:C.gray}}>Loading products...</p>}
          {!loading&&products.map(product=>(
            <div key={product.id} style={{background:C.white,border:`0.5px solid ${C.border}`,padding:"1rem",display:"grid",gridTemplateColumns:"minmax(0,1.3fr) minmax(0,1fr) auto",gap:12,alignItems:"start"}}>
              <div>
                <p style={{fontFamily:ve,fontSize:13,letterSpacing:"0.08em",margin:"0 0 0.2rem"}}>{product.name}</p>
                <p style={{fontFamily:co,fontSize:13,color:C.gray,margin:0,lineHeight:1.6}}>{product.why}</p>
              </div>
              <div>
                <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray,margin:"0 0 0.35rem"}}>{product.cat || "Uncategorized"} · {product.price || "No price"}</p>
                {product.link&&<a href={product.link} target="_blank" rel="noopener noreferrer" style={{fontFamily:co,fontSize:13,color:C.teal}}>Open link</a>}
              </div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>onEdit(product)} style={{background:C.iceBlue,border:`0.5px solid ${C.border}`,padding:"7px 10px",fontSize:8,letterSpacing:"0.1em",fontFamily:ag,textTransform:"uppercase",cursor:"pointer"}}>Edit</button>
                <button onClick={()=>onDelete(product.id)} style={{background:"#fff0f0",border:"0.5px solid #cc4444",color:"#cc4444",padding:"7px 10px",fontSize:8,letterSpacing:"0.1em",fontFamily:ag,textTransform:"uppercase",cursor:"pointer"}}>Delete</button>
              </div>
            </div>
          ))}
          {!loading&&products.length===0&&<p style={{fontFamily:co,fontStyle:"italic",color:C.gray}}>No products yet.</p>}
        </div>
      </div>
    </div>
  );
}

// ── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App(){
  // screens: home | quiz | result | chat | profile | directory | artistDetail | inquire | timeline | products
  const [screen,setScreen]=useState("home");
  // quiz
  const [quizPhase,setQuizPhase]=useState("skin"); // skin | hair | main
  const [skinStep,setSkinStep]=useState(0);
  const [hairStep,setHairStep]=useState(0);
  const [mainStep,setMainStep]=useState(0);
  const [skinAns,setSkinAns]=useState({});
  const [hairAns,setHairAns]=useState({});
  const [mainAns,setMainAns]=useState({});
  const [showOther,setShowOther]=useState(false);
  const [otherTxt,setOtherTxt]=useState("");
  // results
  const [result,setResult]=useState(null);
  // profile
  const [profile,setProfile]=useState({name:"",date:"",location:"",skinType:"",hairType:"",hairDensity:"",concerns:"",inspoUrls:["","",""],profilePhoto:null});
  const [moodItems,setMoodItems]=useState([]);
  const [moodInput,setMoodInput]=useState("");
  const [completedTimeline,setCompletedTimeline]=useState({});
  const [pinterestAnalysis,setPinterestAnalysis]=useState({});
  const [analyzeLoading,setAnalyzeLoading]=useState(false);
  // chat
  const [messages,setMessages]=useState([]);
  const [chatInput,setChatInput]=useState("");
  const [chatLoading,setChatLoading]=useState(false);
  const chatEndRef=useRef(null);
  // directory
  const [dirState,setDirState]=useState("All States");
  const [dirService,setDirService]=useState("All Services");
  const [dirSearch,setDirSearch]=useState("");
  const [dirTravel,setDirTravel]=useState(false);
  const [selectedArtist,setSelectedArtist]=useState(null);
  // inquire
  const [inquireArtist,setInquireArtist]=useState(null);
  const [inquireForm,setInquireForm]=useState({name:"",email:"",date:"",location:"",partySize:"",budget:"",message:""});
  const [inquireSent,setInquireSent]=useState(false);
  const photoRef=useRef(null);
  // auth
  const [session,setSession]=useState(null);
  const [authOpen,setAuthOpen]=useState(false);
  const [authEmail,setAuthEmail]=useState("");
  const [authPassword,setAuthPassword]=useState("");
  const [authLoading,setAuthLoading]=useState(false);
  const [authError,setAuthError]=useState("");
  const [isAdmin,setIsAdmin]=useState(false);
  const emptyProductForm = {name:"",why:"",link:"",price:"",cat:""};
  const [adminProducts,setAdminProducts]=useState([]);
  const [adminProductForm,setAdminProductForm]=useState(emptyProductForm);
  const [editingProductId,setEditingProductId]=useState(null);
  const [adminLoading,setAdminLoading]=useState(false);
  const [adminError,setAdminError]=useState("");

  useEffect(()=>{chatEndRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{
      setSession(data.session);
      checkAdmin(data.session?.user);
    });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,nextSession)=>{
      setSession(nextSession);
      checkAdmin(nextSession?.user);
    });
    return ()=>subscription.unsubscribe();
  },[]);

  const priArc = result ? ARC[result.primary] : null;
  const secArc = result ? ARC[result.secondary] : null;

  // Derived from quiz answers
  const derivedSkin = Object.keys(skinAns).length > 0 ? deriveSkinType(skinAns) : profile.skinType;
  const derivedHairType = Object.keys(hairAns).length > 0 ? deriveHairType(hairAns) : profile.hairType;
  const derivedHairDensity = Object.keys(hairAns).length > 0 ? deriveHairDensity(hairAns) : profile.hairDensity;

  const productRecs = getProductRecs(derivedSkin, derivedHairType, derivedHairDensity, result?.primary||"");
  const timeline = getTimeline(profile.date, result?.primary||"");
  const nowItems = timeline.filter(t=>t.status==="now" && !completedTimeline[t.id]);
  const overdueItems = timeline.filter(t=>t.status==="overdue" && !completedTimeline[t.id]);
  const completedCount = timeline.filter(t=>completedTimeline[t.id]).length;
  const daysToWedding = profile.date ? Math.max(0, daysBetween(new Date(), parseLocalDate(profile.date))) : 0;
  const userInitial = session?.user?.email?.trim()?.[0]?.toUpperCase() || "?";

  async function checkAdmin(user){
    if(!user){
      setIsAdmin(false);
      setAdminProducts([]);
      return;
    }
    const {data,error}=await supabase.from("profiles").select("is_admin").eq("id",user.id).maybeSingle();
    setIsAdmin(!error&&data?.is_admin===true);
  }

  async function authenticate(type){
    setAuthLoading(true);
    setAuthError("");
    try{
      const credentials={email:authEmail.trim(),password:authPassword};
      const {data,error}=type==="login"
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);
      if(error)throw error;
      setSession(data.session);
      setAuthOpen(false);
      setAuthPassword("");
    }catch(err){
      setAuthError(err.message||"Authentication failed.");
    }
    setAuthLoading(false);
  }

  async function loadAdminProducts(){
    if(!isAdmin)return;
    setAdminLoading(true);
    setAdminError("");
    try{
      const {data,error}=await supabase.from("products").select("*");
      if(error)throw error;
      setAdminProducts(data||[]);
    }catch(err){
      setAdminError(err.message||"Could not load products.");
    }
    setAdminLoading(false);
  }

  function resetAdminProductForm(){
    setAdminProductForm(emptyProductForm);
    setEditingProductId(null);
  }

  function editAdminProduct(product){
    setEditingProductId(product.id);
    setAdminProductForm({
      name: product.name || "",
      why: product.why || "",
      link: product.link || "",
      price: product.price || "",
      cat: product.cat || "",
    });
  }

  async function saveAdminProduct(event){
    event.preventDefault();
    if(!isAdmin||!adminProductForm.name.trim())return;
    setAdminLoading(true);
    setAdminError("");
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
      await loadAdminProducts();
    }catch(err){
      setAdminError(err.message||"Could not save product.");
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
      await loadAdminProducts();
    }catch(err){
      setAdminError(err.message||"Could not delete product.");
    }
    setAdminLoading(false);
  }

  useEffect(()=>{
    if(screen==="admin"&&isAdmin)loadAdminProducts();
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
      const r=scoreArchetype({...na,...hairAns,...skinAns});
      const nextProfile={...profile,skinType:deriveSkinType(skinAns),hairType:deriveHairType(hairAns),hairDensity:deriveHairDensity(hairAns)};
      setResult(r);
      // auto-update profile
      setProfile(nextProfile);
      saveQuizResult(r);
      setScreen("result");
    }
  }

  const totalSteps = SKIN_Q.length + HAIR_Q.length + MAIN_Q.length;
  const currentStep = quizPhase==="skin"?skinStep:quizPhase==="hair"?SKIN_Q.length+hairStep:SKIN_Q.length+HAIR_Q.length+mainStep;
  const progress = (currentStep/totalSteps)*100;

  function resetQuiz(){setQuizPhase("skin");setSkinStep(0);setHairStep(0);setMainStep(0);setSkinAns({});setHairAns({});setMainAns({});setShowOther(false);}

  // ── Pinterest analysis ─────────────────────────────────────────────────────
  async function analyzeInspo(url,idx){
    if(!url.trim())return;
    setAnalyzeLoading(true);
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:800,system:`You are Bailee Cribb, expert coastal bridal artist. Analyze bridal inspo URLs with honesty. Return ONLY valid JSON (no markdown): {"attracted_to":["word1","word2","word3"],"actually_creates":["technique1","technique2","technique3"],"reality_check":"one honest sentence about what the photo doesn't show","achievable":"one sentence on what's achievable on a wedding day"}`,messages:[{role:"user",content:`Analyze this bridal inspo: ${url}`}]})});
      const data=await res.json();
      const raw=data.content?.map(b=>b.text||"").join("")||"{}";
      try{setPinterestAnalysis(p=>({...p,[idx]:JSON.parse(raw.replace(/```json|```/g,"").trim())}));}
      catch{setPinterestAnalysis(p=>({...p,[idx]:{attracted_to:["polished","structured","intentional"],actually_creates:["internal support","humidity-resistant prep","curl pattern engineering"],reality_check:"Most inspo photos are shot before humidity exposure in controlled lighting.",achievable:"A structured version is achievable with the right artist and prep."}}));}
    }catch(e){}
    setAnalyzeLoading(false);
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  async function sendChat(){
    if(!chatInput.trim()||chatLoading)return;
    const msg=chatInput.trim();setChatInput("");
    const nm=[...messages,{role:"user",content:msg}];
    setMessages(nm);setChatLoading(true);
    try{
      const sys=`You are Bailee Cribb — expert coastal bridal hair and makeup artist, creator of The Bailee Wave + Sculpt™. You diagnose, not describe. You are specific, honest, and use editorial vocabulary.

Rules:
- Lead with the diagnosis: "Your concern about X is caused by Y."
- Be specific: "tension-engineered curl pattern" not "nice waves"
- Name what brides miss: structure, density, internal support, climate exposure
- Use: "Humidity exposes weak structure fast." "This collapses because..." "What creates that is..."
- Be honest about inspo: lighting, editing, extensions, controlled environments
- Never sound like a generic luxury assistant
- 2–4 sentences per response

Context:
${priArc?`Archetype: ${priArc.name}. ${priArc.why}`:"No archetype yet — ask about the quiz."}
${derivedSkin?`Skin: ${derivedSkin}`:""}
${derivedHairType?`Hair type: ${derivedHairType}, density: ${derivedHairDensity||"unknown"}`:""}
${profile.concerns?`Concerns: ${profile.concerns}`:""}
${moodItems.length?`Mood board: ${moodItems.join(", ")}`:""}`;
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:sys,messages:nm.map(m=>({role:m.role,content:m.content}))})});
      const data=await res.json();
      setMessages([...nm,{role:"assistant",content:data.content?.map(b=>b.text||"").join("")||"Say more."}]);
    }catch{setMessages([...nm,{role:"assistant",content:"Connection issue — try again."}]);}
    setChatLoading(false);
  }

  const filteredArtists = ARTISTS.filter(a=>{
    if(dirState!=="All States"&&a.state!==dirState)return false;
    if(dirService!=="All Services"&&a.services!==dirService)return false;
    if(dirTravel&&!a.travel)return false;
    if(dirSearch&&!`${a.name} ${a.owner} ${a.city} ${a.state} ${a.specialties.join(" ")} ${a.aesthetic} ${a.best_for.join(" ")}`.toLowerCase().includes(dirSearch.toLowerCase()))return false;
    return true;
  }).sort((a,b)=>result?artistFit(b,result)-artistFit(a,result):b.rating-a.rating);

  const nav=[["Quiz","quiz"],["Stylist","chat"],["Profile","profile"],["Timeline","timeline"],["Products","products"],["Artists","directory"],...(isAdmin?[["Admin","admin"]]:[])];

  return(
    <div style={{minHeight:"100vh",paddingTop:"env(safe-area-inset-top)",background:"white",fontFamily:co,color:C.black}}>

      {/* NAV */}
      {screen!=="home"&&(
        <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'white', borderBottom: '0.5px solid #e0e0e0', paddingTop: 'env(safe-area-inset-top)', paddingLeft: 20, paddingRight: 20, paddingBottom: 10 }}>
          <button onClick={()=>setScreen("home")} style={{background:"none",border:"none",fontFamily:ve,fontSize:11,letterSpacing:"0.2em",cursor:"pointer",color:C.black}}>THE BRIDAL EDIT™</button>
          <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center",justifyContent:"flex-end"}}>
            {nav.map(([l,s])=>(
              <button key={s} onClick={()=>setScreen(s)} style={{background:"none",border:"none",fontSize:9,letterSpacing:"0.14em",fontFamily:ag,textTransform:"uppercase",color:screen===s?C.black:C.gray,cursor:"pointer",borderBottom:screen===s?`1px solid ${C.black}`:"none",paddingBottom:2,position:"relative"}}>
                {l}
                {l==="Timeline"&&nowItems.length>0&&<span style={{position:"absolute",top:-4,right:-6,width:7,height:7,borderRadius:"50%",background:"#cc4444"}}/>}
              </button>
            ))}
            {session?.user?(
              <div title={session.user.email} style={{width:26,height:26,borderRadius:"50%",background:C.black,color:C.white,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:ag,fontSize:10,letterSpacing:"0.08em",flexShrink:0}}>{userInitial}</div>
            ):(
              <button onClick={()=>setAuthOpen(true)} style={{background:C.black,color:C.white,border:"none",fontSize:8,letterSpacing:"0.12em",fontFamily:ag,textTransform:"uppercase",cursor:"pointer",padding:"6px 9px",whiteSpace:"nowrap"}}>Sign In</button>
            )}
          </div>
        </div>
      )}

      {/* ── HOME ──────────────────────────────────────────────────────── */}
      {screen==="home"&&(
        <div style={{minHeight:"100vh",display:"flex",flexDirection:"column"}}>
          <div style={{background:C.nearBlack,flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"5rem 2rem",textAlign:"center",position:"relative",overflow:"hidden",color:C.white}}>
            <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at 25% 75%,${C.lavender}18 0%,transparent 55%),radial-gradient(ellipse at 80% 20%,${C.blush}10 0%,transparent 50%)`,pointerEvents:"none"}}/>
            <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.5em",color:C.lavender,textTransform:"uppercase",marginBottom:"1.5rem"}}>The bridal beauty app for brides who care how it actually wears</p>
            <h1 style={{fontFamily:ve,fontSize:50,fontWeight:400,letterSpacing:"0.2em",margin:"0 0 0.2rem",lineHeight:1.1}}>THE BRIDAL EDIT</h1>
            <span style={{fontFamily:ve,fontSize:17,color:C.lavender,letterSpacing:"0.3em"}}>™</span>
            <p style={{fontFamily:co,fontSize:19,fontStyle:"italic",color:"#bbb",margin:"1.5rem 0 0.5rem",maxWidth:420,lineHeight:1.6}}>Pinterest, translated professionally.</p>
            <p style={{fontFamily:co,fontSize:15,color:"#888",margin:"0 0 3rem",maxWidth:400,lineHeight:1.6}}>Find the look that fits your features, venue, climate, and timeline — not just your mood board.</p>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
              <button onClick={()=>{resetQuiz();setScreen("quiz");}} style={{background:C.white,color:C.black,border:"none",padding:"15px 44px",fontSize:10,letterSpacing:"0.28em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Translate My Inspo</button>
              <button onClick={()=>setScreen("directory")} style={{background:"transparent",color:C.lavender,border:`1px solid ${C.lavender}50`,padding:"12px 36px",fontSize:9,letterSpacing:"0.22em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Find My Artist</button>
            </div>
          </div>
          <div style={{background:C.blush,padding:"2rem",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:18,textAlign:"center"}}>
            {[["Skin & hair quiz","Personalized to your actual features"],["12 archetypes","With Reality Score™ and Pinterest honesty"],["AI Stylist","Bailee's expertise, direct and specific"],["Beauty Timeline","Auto-populated from your wedding date"],["Product Recs","Affiliate picks matched to your profile"],["Artist Directory","25+ vetted artists, nationwide"]].map(([t,d])=>(
              <div key={t}><p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.16em",textTransform:"uppercase",marginBottom:"0.3rem"}}>{t}</p><p style={{fontFamily:co,fontStyle:"italic",fontSize:12,color:C.gray,lineHeight:1.5,margin:0}}>{d}</p></div>
            ))}
          </div>
        </div>
      )}

      {/* ── QUIZ ──────────────────────────────────────────────────────── */}
      {screen==="quiz"&&(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"2.5rem 2rem",minHeight:"80vh"}}>
          <div style={{width:"100%",maxWidth:540}}>
            {/* Progress */}
            <div style={{height:2,background:"#eee",marginBottom:"0.5rem"}}><div style={{height:2,width:`${progress}%`,background:C.black,transition:"width 0.3s"}}/></div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:"2rem"}}>
              <span style={{fontFamily:ag,fontSize:9,letterSpacing:"0.15em",textTransform:"uppercase",color:C.gray}}>{quizPhase==="skin"?"Skin profile":quizPhase==="hair"?"Hair profile":"Your vision"}</span>
              <span style={{fontFamily:ag,fontSize:9,color:C.gray}}>{currentStep+1} / {totalSteps}</span>
            </div>

            {/* Phase label */}
            {quizPhase==="skin"&&skinStep===0&&<div style={{background:C.iceBlue,padding:"0.9rem 1.1rem",marginBottom:"1.5rem",borderLeft:`3px solid ${C.lavender}`}}><p style={{fontFamily:co,fontStyle:"italic",fontSize:14,color:C.gray,margin:0}}>First, let's understand your skin. You don't need to know your "skin type" — just answer honestly.</p></div>}
            {quizPhase==="hair"&&hairStep===0&&<div style={{background:C.iceBlue,padding:"0.9rem 1.1rem",marginBottom:"1.5rem",borderLeft:`3px solid ${C.lavender}`}}><p style={{fontFamily:co,fontStyle:"italic",fontSize:14,color:C.gray,margin:0}}>Now let's figure out your hair. No jargon needed — just describe what you observe.</p></div>}
            {quizPhase==="main"&&mainStep===0&&<div style={{background:C.blush,padding:"0.9rem 1.1rem",marginBottom:"1.5rem",borderLeft:`3px solid ${C.lavender}`}}><p style={{fontFamily:co,fontStyle:"italic",fontSize:14,color:C.gray,margin:0}}>Skin and hair profiled. Now — your vision and emotional priorities. These answers shape everything.</p></div>}

            {/* Question */}
            {(()=>{
              let q,onAnswer;
              if(quizPhase==="skin"){q=SKIN_Q[skinStep];onAnswer=processSkin;}
              else if(quizPhase==="hair"){q=HAIR_Q[hairStep];onAnswer=processHair;}
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
                        <button onClick={()=>{if(otherTxt.trim()){if(quizPhase==="skin")processSkin(otherTxt.trim());else if(quizPhase==="hair")processHair(otherTxt.trim());else processMain(otherTxt.trim());}}} style={{background:C.black,color:C.white,border:"none",padding:"11px 24px",fontSize:10,letterSpacing:"0.14em",fontFamily:ag,textTransform:"uppercase",cursor:"pointer"}}>Continue</button>
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

      {/* ── RESULT ──────────────────────────────────────────────────────── */}
      {screen==="result"&&priArc&&secArc&&(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"3rem 2rem"}}>
          <div style={{width:"100%",maxWidth:620}}>
            {/* Skin/hair summary */}
            <div style={{display:"flex",gap:8,marginBottom:"1.5rem",flexWrap:"wrap"}}>
              {[["Skin",derivedSkin],["Hair type",derivedHairType],["Hair density",derivedHairDensity]].map(([l,v])=>v&&(
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
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:"1rem"}}>
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
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {[["Chat with your stylist","chat"],["Build my profile","profile"],["View my beauty timeline","timeline"],["See product recommendations","products"],["Find my artist","directory"]].map(([l,s],i)=>(
                <button key={s} onClick={()=>{if(s==="chat")setMessages([{role:"assistant",content:`Your archetype is ${priArc.name} with ${secArc.name} influence. ${derivedHairDensity==="Fine / sparse"?"Your fine hair is the most important variable here — "+priArc.fine_hair_note+" ":""}${priArc.reality} What do you want to dig into?`}]);setScreen(s);}} style={{background:i===0?C.black:"transparent",color:i===0?C.white:C.black,border:`0.5px solid ${i===0?C.black:C.black}`,padding:i===0?"13px":"11px",fontSize:10,letterSpacing:"0.18em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>{l}</button>
              ))}
              <button onClick={()=>{resetQuiz();setScreen("quiz");}} style={{background:"none",border:"none",fontSize:11,color:C.gray,cursor:"pointer",fontFamily:ag,letterSpacing:"0.1em"}}>Retake quiz</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CHAT ──────────────────────────────────────────────────────── */}
      {screen==="chat"&&(
        <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 51px)"}}>
          <div style={{background:C.nearBlack,padding:"0.9rem 1.4rem",borderBottom:`0.5px solid ${C.border}`}}>
            <p style={{margin:0,fontFamily:ve,fontSize:12,letterSpacing:"0.18em",color:C.white}}>YOUR BRIDAL STYLIST</p>
            <p style={{margin:0,fontFamily:co,fontSize:12,fontStyle:"italic",color:"#aaa"}}>Direct · diagnostic · no filler</p>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"1.4rem",display:"flex",flexDirection:"column",gap:13}}>
            {messages.length===0&&(
              <div style={{textAlign:"center",padding:"2rem 0.5rem"}}>
                <p style={{fontFamily:co,fontStyle:"italic",fontSize:16,color:C.gray,marginBottom:"1.25rem"}}>Ask anything. Expect a real answer.</p>
                <div style={{display:"flex",flexWrap:"wrap",gap:7,justifyContent:"center"}}>
                  {["Will my waves hold in humidity?","Do I need extensions?","How do I not look overdone?","What does airbrush actually do?","My hair is fine — what works?","How to prep skin in 3 months?"].map(q=>(
                    <button key={q} onClick={()=>setChatInput(q)} style={{background:C.blush,border:"none",padding:"6px 12px",fontSize:13,fontFamily:co,cursor:"pointer",color:C.nearBlack,fontStyle:"italic"}}>{q}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m,i)=>(
              <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
                <div style={{maxWidth:"78%",background:m.role==="user"?C.nearBlack:C.iceBlue,color:m.role==="user"?C.white:C.black,padding:"11px 15px",fontSize:16,lineHeight:1.8,fontFamily:co}}>{m.content}</div>
              </div>
            ))}
            {chatLoading&&<div style={{background:C.iceBlue,padding:"11px 15px",fontSize:14,fontFamily:co,fontStyle:"italic",color:C.gray,alignSelf:"flex-start"}}>Thinking...</div>}
            <div ref={chatEndRef}/>
          </div>
          <div style={{background:C.white,borderTop:`0.5px solid ${C.border}`,padding:"0.8rem 1.1rem",display:"flex",gap:8}}>
            <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendChat()} placeholder="Ask about your look, skin prep, timeline, inspo..." style={{flex:1,border:`0.5px solid #ccc`,padding:"10px 13px",fontSize:15,fontFamily:co,outline:"none",background:C.iceBlue}}/>
            <button onClick={sendChat} disabled={chatLoading||!chatInput.trim()} style={{background:C.black,color:C.white,border:"none",width:40,height:40,fontSize:17,cursor:"pointer",opacity:chatLoading||!chatInput.trim()?0.4:1}}>→</button>
          </div>
        </div>
      )}

      {/* ── TIMELINE ──────────────────────────────────────────────────── */}
      {screen==="timeline"&&(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"2.5rem 2rem"}}>
          <div style={{width:"100%",maxWidth:620}}>
            <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.35em",textTransform:"uppercase",color:C.gray,marginBottom:"0.4rem"}}>Auto-built from your wedding date</p>
            <h2 style={{fontFamily:ve,fontSize:22,fontWeight:400,letterSpacing:"0.14em",marginBottom:"0.5rem"}}>BEAUTY TIMELINE</h2>
            <p style={{fontFamily:co,fontStyle:"italic",fontSize:14,color:C.gray,lineHeight:1.7,margin:"0 0 1rem"}}>Add or change your wedding date. The checklist updates automatically and you can mark items complete.</p>

            <div style={{background:C.blush,padding:"1rem 1.25rem",marginBottom:"1rem",display:"grid",gridTemplateColumns:"1fr auto",gap:12,alignItems:"end"}}>
              <div>
                <label style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,display:"block",marginBottom:"0.35rem"}}>Wedding date</label>
                <input type="date" value={profile.date} onChange={e=>{setProfile(p=>({...p,date:e.target.value}));setCompletedTimeline({});}} style={{border:`0.5px solid #ccc`,padding:"10px 12px",fontSize:15,fontFamily:co,outline:"none",width:"100%",boxSizing:"border-box",background:C.white}}/>
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
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
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
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"2.5rem 2rem"}}>
          <div style={{width:"100%",maxWidth:560}}>
            <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.35em",textTransform:"uppercase",color:C.gray,marginBottom:"0.4rem"}}>Matched to your skin, hair & archetype</p>
            <h2 style={{fontFamily:ve,fontSize:22,fontWeight:400,letterSpacing:"0.14em",marginBottom:"0.5rem"}}>YOUR PRODUCT RECOMMENDATIONS</h2>
            <p style={{fontFamily:co,fontStyle:"italic",color:C.gray,fontSize:14,marginBottom:productRecs.length>0?"2rem":"1rem",lineHeight:1.7}}>
              {derivedSkin||priArc?"Curated for your "+[derivedSkin,derivedHairDensity,priArc?.name].filter(Boolean).join(", ")+" profile.":"Complete the quiz to get personalized recommendations."}
            </p>
            {!derivedSkin&&!priArc&&(
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
      {screen==="admin"&&isAdmin&&(
        <AdminProducts
          products={adminProducts}
          form={adminProductForm}
          setForm={setAdminProductForm}
          editingId={editingProductId}
          loading={adminLoading}
          error={adminError}
          onSubmit={saveAdminProduct}
          onEdit={editAdminProduct}
          onDelete={deleteAdminProduct}
          onCancel={resetAdminProductForm}
          onRefresh={loadAdminProducts}
        />
      )}

      {/* ── PROFILE ──────────────────────────────────────────────────── */}
      {screen==="profile"&&(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"2.5rem 2rem"}}>
          <div style={{width:"100%",maxWidth:520}}>
            <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.35em",textTransform:"uppercase",color:C.gray,marginBottom:"0.4rem"}}>Your bridal beauty hub</p>
            <h2 style={{fontFamily:ve,fontSize:22,fontWeight:400,letterSpacing:"0.14em",marginBottom:"1.75rem"}}>MY BRIDAL PROFILE</h2>
            <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:"1.75rem",background:C.iceBlue,padding:"1.25rem"}}>
              <div onClick={()=>photoRef.current?.click()} style={{width:72,height:72,borderRadius:"50%",background:C.nearBlack,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",overflow:"hidden",flexShrink:0,border:`2px solid ${C.lavender}`}}>
                {profile.profilePhoto?<img src={profile.profilePhoto} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontFamily:ag,fontSize:8,color:C.lavender,textAlign:"center",lineHeight:1.5}}>ADD<br/>PHOTO</span>}
              </div>
              <input ref={photoRef} type="file" accept="image/*" onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>setProfile(p=>({...p,profilePhoto:ev.target.result}));r.readAsDataURL(f);}} style={{display:"none"}}/>
              <div>
                <p style={{fontFamily:ve,fontSize:15,letterSpacing:"0.1em",margin:"0 0 0.2rem"}}>{profile.name||"Your Name"}</p>
                {priArc&&<p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.1em",textTransform:"uppercase",color:C.teal,margin:"0 0 0.2rem"}}>{priArc.name}</p>}
                {derivedSkin&&<p style={{fontFamily:co,fontStyle:"italic",fontSize:12,color:C.gray,margin:0}}>{derivedSkin} skin · {derivedHairType||"—"} hair · {derivedHairDensity||"—"}</p>}
              </div>
            </div>
            {[{k:"name",l:"Your Name",p:"First name",t:"text"},{k:"date",l:"Wedding Date",p:"",t:"date"},{k:"location",l:"Wedding Venue / Location",p:"e.g. Myrtle Beach, SC",t:"text"}].map(f=>(
              <div key={f.k} style={{marginBottom:"1rem"}}>
                <label style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,display:"block",marginBottom:"0.35rem"}}>{f.l}</label>
                <input type={f.t} value={profile[f.k]} onChange={e=>setProfile(p=>({...p,[f.k]:e.target.value}))} placeholder={f.p} style={{width:"100%",border:`0.5px solid #ccc`,padding:"9px 12px",fontSize:15,fontFamily:co,outline:"none",boxSizing:"border-box"}}/>
              </div>
            ))}
            <div style={{marginBottom:"1.5rem"}}>
              <label style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,display:"block",marginBottom:"0.35rem"}}>Concerns, allergies & notes for your artist</label>
              <textarea value={profile.concerns} onChange={e=>setProfile(p=>({...p,concerns:e.target.value}))} placeholder="Rosacea, fine hair, sweats in heat, latex allergy, don't want to feel overdone..." rows={3} style={{width:"100%",border:`0.5px solid #ccc`,padding:"9px 12px",fontSize:15,fontFamily:co,resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
            </div>
            {/* Inspo + Translation */}
            <div style={{background:C.white,border:`0.5px solid ${C.border}`,padding:"1.4rem",marginBottom:"1.5rem"}}>
              <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",marginBottom:"0.25rem"}}>What you saved vs. What actually works</p>
              <p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:C.gray,marginBottom:"1rem",lineHeight:1.6}}>Paste inspo links — we'll translate what's drawing you to each one and what it takes to achieve it.</p>
              {profile.inspoUrls.map((url,i)=>(
                <div key={i} style={{marginBottom:"1rem"}}>
                  <div style={{display:"flex",gap:8,marginBottom:6}}>
                    <input value={url} onChange={e=>{const u=[...profile.inspoUrls];u[i]=e.target.value;setProfile(p=>({...p,inspoUrls:u}));}} placeholder="Instagram, Pinterest, or any URL..." style={{flex:1,border:`0.5px solid #ccc`,padding:"7px 10px",fontSize:14,fontFamily:co,outline:"none"}}/>
                    <button onClick={()=>analyzeInspo(url,i)} disabled={!url.trim()||analyzeLoading} style={{background:C.black,color:C.white,border:"none",padding:"7px 12px",fontSize:9,fontFamily:ag,letterSpacing:"0.1em",cursor:"pointer",opacity:!url.trim()||analyzeLoading?0.4:1,whiteSpace:"nowrap"}}>Translate</button>
                  </div>
                  {pinterestAnalysis[i]&&(
                    <div style={{background:C.iceBlue,padding:"0.9rem",marginTop:4}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:"0.7rem"}}>
                        <div><p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray,marginBottom:"0.4rem"}}>You saved because</p>{(pinterestAnalysis[i].attracted_to||[]).map(t=><p key={t} style={{fontFamily:co,fontSize:13,margin:"2px 0"}}>— {t}</p>)}</div>
                        <div><p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gray,marginBottom:"0.4rem"}}>What creates that</p>{(pinterestAnalysis[i].actually_creates||[]).map(t=><p key={t} style={{fontFamily:co,fontSize:13,margin:"2px 0"}}>· {t}</p>)}</div>
                      </div>
                      {pinterestAnalysis[i].reality_check&&<p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:C.nearBlack,borderTop:`0.5px solid ${C.border}`,paddingTop:"0.6rem",margin:0,lineHeight:1.7}}>{pinterestAnalysis[i].reality_check}</p>}
                    </div>
                  )}
                </div>
              ))}
              <button onClick={()=>setProfile(p=>({...p,inspoUrls:[...p.inspoUrls,""]}))} style={{background:"none",border:"none",fontFamily:ag,fontSize:9,letterSpacing:"0.1em",color:C.gray,cursor:"pointer"}}>+ Add another</button>
            </div>
            {/* Mood board */}
            <div style={{background:C.blush,padding:"1.2rem",marginBottom:"1.5rem"}}>
              <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",marginBottom:"0.6rem"}}>Mood board keywords</p>
              <div style={{display:"flex",gap:8,marginBottom:"0.6rem"}}>
                <input value={moodInput} onChange={e=>setMoodInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&moodInput.trim()&&(setMoodItems([...moodItems,moodInput.trim()]),setMoodInput(""))} placeholder="Grace Kelly · candlelight · old money..." style={{flex:1,border:`0.5px solid #ccc`,padding:"7px 10px",fontSize:14,fontFamily:co,outline:"none",background:C.white}}/>
                <button onClick={()=>{if(moodInput.trim()){setMoodItems([...moodItems,moodInput.trim()]);setMoodInput("");}}} style={{background:C.black,color:C.white,border:"none",padding:"7px 13px",fontSize:10,cursor:"pointer",fontFamily:ag}}>Add</button>
              </div>
              {moodItems.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6}}>{moodItems.map((item,i)=><span key={i} style={{background:`${C.lavender}50`,border:`0.5px solid ${C.lavender}`,padding:"3px 10px",fontSize:13,fontFamily:co,display:"flex",gap:6,alignItems:"center"}}>{item}<span onClick={()=>setMoodItems(moodItems.filter((_,j)=>j!==i))} style={{cursor:"pointer",color:C.gray,fontSize:14}}>×</span></span>)}</div>}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <button onClick={()=>{setMessages([{role:"assistant",content:`Profile received. ${priArc?`You're a ${priArc.name} with ${secArc?.name||"mixed"} influence. `:""}${derivedHairDensity==="Fine / sparse"?"Your fine hair is the single most important variable for what's achievable. ":""}${profile.concerns?`Noted your concerns: "${profile.concerns}". `:""}What do you want to work through?`}]);setScreen("chat");}} style={{background:C.black,color:C.white,border:"none",padding:"12px",fontSize:10,letterSpacing:"0.2em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Chat with your stylist</button>
              <button onClick={()=>setScreen("timeline")} style={{background:"transparent",color:C.black,border:`0.5px solid ${C.black}`,padding:"11px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>View my beauty timeline</button>
              <button onClick={()=>setScreen("directory")} style={{background:"transparent",color:C.black,border:`0.5px solid ${C.black}`,padding:"11px",fontSize:10,letterSpacing:"0.16em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase"}}>Find my artist</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DIRECTORY ────────────────────────────────────────────────── */}
      {screen==="directory"&&!selectedArtist&&(
        <div style={{padding:"2.5rem 1.5rem"}}>
          <div style={{textAlign:"center",marginBottom:"1.75rem"}}>
            <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.35em",textTransform:"uppercase",color:C.gray,marginBottom:"0.4rem"}}>Vetted for portfolio · specialty · education · communication</p>
            <h2 style={{fontFamily:ve,fontSize:24,fontWeight:400,letterSpacing:"0.14em",marginBottom:"0.4rem"}}>FIND YOUR ARTIST</h2>
            <p style={{fontFamily:co,fontStyle:"italic",color:C.gray,fontSize:14}}>Not a popularity contest — curated for quality, niche clarity, and specialization.</p>
          </div>
          <div style={{maxWidth:880,margin:"0 auto 1.75rem",display:"flex",flexDirection:"column",gap:9}}>
            <input value={dirSearch} onChange={e=>setDirSearch(e.target.value)} placeholder="Search by name, state, specialty, aesthetic, best for..." style={{width:"100%",border:`0.5px solid #ccc`,padding:"10px 15px",fontSize:16,fontFamily:co,outline:"none",boxSizing:"border-box"}}/>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
              {[["State",US_STATES,dirState,setDirState],["Services",SERVICES_F,dirService,setDirService]].map(([l,opts,val,setter])=>(
                <select key={l} value={val} onChange={e=>setter(e.target.value)} style={{border:`0.5px solid #ccc`,padding:"7px 11px",fontSize:12,fontFamily:ag,letterSpacing:"0.06em",background:C.white,outline:"none",cursor:"pointer"}}>
                  {opts.map(o=><option key={o}>{o}</option>)}
                </select>
              ))}
              <label style={{display:"flex",alignItems:"center",gap:6,fontFamily:ag,fontSize:9,letterSpacing:"0.1em",color:C.gray,cursor:"pointer"}}>
                <input type="checkbox" checked={dirTravel} onChange={e=>setDirTravel(e.target.checked)} style={{accentColor:C.black}}/>Travels
              </label>
              <span style={{fontFamily:co,fontStyle:"italic",fontSize:12,color:C.gray,marginLeft:"auto"}}>{filteredArtists.length} found{result?" · sorted by match":""}</span>
            </div>
            <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.1em",color:"#bbb"}}>{PRICE_LEGEND}</p>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:12,maxWidth:880,margin:"0 auto"}}>
            {filteredArtists.map(artist=>{
              const fit=result?artistFit(artist,result):null;
              return(
                <div key={artist.id} style={{background:C.white,border:`0.5px solid ${C.border}`,padding:"1.25rem",cursor:"pointer",position:"relative",transition:"border-color 0.15s"}}
                  onClick={()=>setSelectedArtist(artist)}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=C.black}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                  {fit&&<div style={{position:"absolute",top:10,right:10,background:fit>=90?C.nearBlack:fit>=80?"#4A7A6A":"#8B6B4A",color:C.white,padding:"2px 8px",fontFamily:ag,fontSize:8,letterSpacing:"0.1em"}}>{fit}%</div>}
                  <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:"0.75rem",paddingRight:fit?44:0}}>
                    <div style={{width:40,height:40,borderRadius:"50%",background:C.nearBlack,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:ag,fontSize:9,color:C.lavender,flexShrink:0}}>{artist.avatar}</div>
                    <div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:5,alignItems:"center"}}>
                        <p style={{margin:0,fontFamily:ve,fontSize:12,letterSpacing:"0.06em"}}>{artist.name}</p>
                        {artist.badge&&<span style={{background:`${C.lavender}40`,border:`0.5px solid ${C.lavender}`,padding:"1px 6px",fontSize:7,fontFamily:ag,letterSpacing:"0.1em",color:"#6a3d7a"}}>{artist.badge}</span>}
                      </div>
                      <p style={{margin:0,fontFamily:ag,fontSize:9,letterSpacing:"0.07em",color:C.gray}}>{artist.city}, {artist.state} · {artist.services}</p>
                    </div>
                  </div>
                  <p style={{fontFamily:co,fontStyle:"italic",fontSize:13,color:C.nearBlack,marginBottom:"0.6rem",lineHeight:1.6}}>{artist.aesthetic}</p>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:"0.6rem"}}>{artist.specialties.slice(0,3).map(s=><span key={s} style={{background:C.iceBlue,padding:"1px 8px",fontSize:8,fontFamily:ag,letterSpacing:"0.06em"}}>{s}</span>)}</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontFamily:co,fontSize:12,color:C.gray}}>★ {artist.rating} ({artist.reviews}) · {artist.price}</span>
                    {artist.travel&&<span style={{fontFamily:ag,fontSize:8,color:C.teal,letterSpacing:"0.1em"}}>TRAVELS</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ARTIST DETAIL ─────────────────────────────────────────────── */}
      {screen==="directory"&&selectedArtist&&(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"2.5rem 2rem"}}>
          <div style={{width:"100%",maxWidth:540}}>
            <button onClick={()=>setSelectedArtist(null)} style={{background:"none",border:"none",fontFamily:ag,fontSize:9,letterSpacing:"0.14em",color:C.gray,cursor:"pointer",marginBottom:"1.75rem",textTransform:"uppercase"}}>← Back</button>
            <div style={{background:C.nearBlack,padding:"2.25rem",marginBottom:"1.25rem",textAlign:"center",color:C.white}}>
              <div style={{width:64,height:64,borderRadius:"50%",background:`${C.lavender}25`,border:`1px solid ${C.lavender}50`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:ag,fontSize:16,color:C.lavender,margin:"0 auto 0.9rem"}}>{selectedArtist.avatar}</div>
              {selectedArtist.badge&&<div style={{background:`${C.lavender}25`,border:`0.5px solid ${C.lavender}`,padding:"2px 10px",fontSize:7,fontFamily:ag,letterSpacing:"0.18em",color:C.lavender,display:"inline-block",marginBottom:"0.6rem"}}>{selectedArtist.badge}</div>}
              <h2 style={{fontFamily:ve,fontSize:19,letterSpacing:"0.14em",margin:"0 0 0.2rem"}}>{selectedArtist.name.toUpperCase()}</h2>
              <p style={{fontFamily:ag,fontSize:9,letterSpacing:"0.14em",color:"#aaa",textTransform:"uppercase",margin:"0 0 0.2rem"}}>{selectedArtist.city}, {selectedArtist.state} · {selectedArtist.services}</p>
              <p style={{fontFamily:co,fontStyle:"italic",color:"#888",margin:"0 0 0.5rem",fontSize:13}}>{selectedArtist.owner}</p>
              {result&&<div style={{background:`${C.lavender}20`,border:`0.5px solid ${C.lavender}50`,padding:"4px 12px",display:"inline-block"}}><span style={{fontFamily:ag,fontSize:9,letterSpacing:"0.1em"}}>{artistFit(selectedArtist,result)}% match to your archetype</span></div>}
            </div>
            {[{label:"Aesthetic",content:selectedArtist.aesthetic,style:"italic"},{label:"Bio",content:selectedArtist.bio,style:"normal"}].map(s=>(
              <div key={s.label} style={{background:C.iceBlue,padding:"1.2rem",marginBottom:"0.9rem"}}>
                <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gray,marginBottom:"0.4rem"}}>{s.label}</p>
                <p style={{fontFamily:co,fontSize:15,lineHeight:1.75,margin:0,fontStyle:s.style}}>{s.content}</p>
              </div>
            ))}
            <div style={{background:C.white,border:`0.5px solid ${C.border}`,padding:"1.2rem",marginBottom:"0.9rem"}}>
              <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:"0.6rem"}}>Best for</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:"1rem"}}>{selectedArtist.best_for.map(s=><span key={s} style={{background:C.blush,padding:"3px 10px",fontSize:13,fontFamily:co}}>{s}</span>)}</div>
              <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.12em",textTransform:"uppercase",color:"#cc6b6b",marginBottom:"0.4rem"}}>Not ideal for</p>
              {selectedArtist.not_ideal.map(n=><p key={n} style={{fontFamily:co,fontSize:13,color:C.gray,margin:"2px 0",fontStyle:"italic"}}>— {n}</p>)}
            </div>
            <div style={{background:C.iceBlue,padding:"1.1rem",marginBottom:"0.9rem"}}>
              <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:"0.4rem"}}>Portfolio quality note</p>
              <p style={{fontFamily:co,fontSize:14,lineHeight:1.7,margin:0}}>{selectedArtist.portfolio}</p>
            </div>
            <div style={{background:C.white,border:`0.5px solid ${C.border}`,padding:"1.1rem",marginBottom:"1.5rem"}}>
              <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:"0.4rem"}}>Education & training</p>
              <p style={{fontFamily:co,fontSize:13,lineHeight:1.7,margin:0,fontStyle:"italic"}}>{selectedArtist.education}</p>
            </div>
            <div style={{display:"flex",gap:12,marginBottom:"1.5rem",textAlign:"center"}}>
              {[[selectedArtist.rating,"Rating"],[selectedArtist.reviews,"Reviews"]].map(([v,l])=>(
                <div key={l} style={{flex:1,background:C.iceBlue,padding:"1rem"}}>
                  <p style={{fontFamily:ve,fontSize:22,margin:"0 0 0.2rem"}}>{v}</p>
                  <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.12em",color:C.gray,margin:0,textTransform:"uppercase"}}>{l}</p>
                </div>
              ))}
              <div style={{flex:1,background:C.iceBlue,padding:"1rem"}}>
                <p style={{fontFamily:ve,fontSize:14,margin:"0 0 0.2rem",letterSpacing:"0.06em"}}>{selectedArtist.price}</p>
                <p style={{fontFamily:ag,fontSize:8,letterSpacing:"0.12em",color:C.gray,margin:0,textTransform:"uppercase"}}>Pricing</p>
              </div>
            </div>
            <a
              href={selectedArtist.website?.startsWith("http") ? selectedArtist.website : `https://${selectedArtist.website}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{width:"100%",background:C.black,color:C.white,padding:"13px",fontSize:10,letterSpacing:"0.22em",cursor:"pointer",fontFamily:ag,textTransform:"uppercase",textDecoration:"none",display:"block",textAlign:"center",boxSizing:"border-box"}}
            >
              Visit Website
            </a>
          </div>
        </div>
      )}

      {authOpen&&(
        <AuthModal
          email={authEmail}
          setEmail={setAuthEmail}
          password={authPassword}
          setPassword={setAuthPassword}
          loading={authLoading}
          error={authError}
          onLogin={()=>authenticate("login")}
          onSignUp={()=>authenticate("signup")}
          onClose={()=>setAuthOpen(false)}
        />
      )}

    </div>
  );
}
