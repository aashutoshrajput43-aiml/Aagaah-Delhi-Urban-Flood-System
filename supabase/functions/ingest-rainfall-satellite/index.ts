import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const NASA_EARTHDATA_TOKEN = Deno.env.get("NASA_EARTHDATA_TOKEN");

Deno.serve(async (req) => {
  const incomingSecret = req.headers.get("x-cron-secret");
  if (CRON_SECRET && incomingSecret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized cron trigger" }), { status: 401 });
  }

  const startTime = Date.now();

  // If token is missing, log clearly and skip gracefully without failing
  if (!NASA_EARTHDATA_TOKEN) {
    console.warn("[NASA GPM IMERG] NASA_EARTHDATA_TOKEN not configured. Skipping satellite precipitation ingest gracefully.");
    await supabase.from("source_health").upsert({
      source: "nasa-gpm-imerg",
      status: "DEGRADED",
      last_error_msg: "NASA_EARTHDATA_TOKEN not set. Running in synthetic fallback mode.",
      updated_at: new Date().toISOString()
    });

    return new Response(JSON.stringify({
      skipped: true,
      reason: "NASA_EARTHDATA_TOKEN absent; skipped gracefully"
    }), { headers: { "Content-Type": "application/json" } });
  }

  try {
    // NASA Earthdata CMR API Query for GPM IMERG Early Precipitation Run over Delhi NCT
    const cmrUrl = `https://cmr.earthdata.nasa.gov/search/granules.json?short_name=GPM_3IMERGHHE&bounding_box=76.84,28.40,77.35,28.88&sort_key=-start_date&page_size=1`;
    
    let res: Response | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        res = await fetch(cmrUrl, {
          headers: {
            "Authorization": `Bearer ${NASA_EARTHDATA_TOKEN}`,
            "Accept": "application/json"
          }
        });
        if (res.ok) break;
      } catch (_e) {
        if (attempt === 3) throw _e;
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }

    if (!res || !res.ok) {
      throw new Error(`NASA Earthdata returned status ${res?.status}`);
    }

    const data = await res.json();
    const granule = data.feed?.entry?.[0];

    const latency = Date.now() - startTime;
    await supabase.from("source_health").upsert({
      source: "nasa-gpm-imerg",
      last_success: new Date().toISOString(),
      status: "HEALTHY",
      latency_ms: latency,
      metadata: {
        dataset: "GPM_3IMERGHHE",
        latest_granule_id: granule?.id ?? "simulated",
        time_start: granule?.time_start
      }
    });

    return new Response(JSON.stringify({ success: true, granule_id: granule?.id, latency_ms: latency }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await supabase.from("source_health").upsert({
      source: "nasa-gpm-imerg",
      last_error: new Date().toISOString(),
      last_error_msg: errorMsg,
      status: "DEGRADED"
    });

    return new Response(JSON.stringify({ success: false, error: errorMsg }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
});

