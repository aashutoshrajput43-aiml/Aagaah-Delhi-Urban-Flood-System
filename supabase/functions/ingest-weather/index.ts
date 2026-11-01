import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

// 5 Key Delhi Representative Grid Coordinates
const DELHI_GRID_STATIONS = [
  { name: "Central Delhi (Safdarjung)", lat: 28.5833, lng: 77.2000 },
  { name: "North Delhi (Wazirabad/Burari)", lat: 28.7300, lng: 77.2100 },
  { name: "South Delhi (Pul Prahladpur/Badarpur)", lat: 28.5100, lng: 77.2900 },
  { name: "West Delhi (Najafgarh)", lat: 28.6100, lng: 76.9800 },
  { name: "East Delhi (Shahdara)", lat: 28.6700, lng: 77.2900 }
];

Deno.serve(async (req) => {
  const incomingSecret = req.headers.get("x-cron-secret");
  if (CRON_SECRET && incomingSecret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized cron trigger" }), { status: 401 });
  }

  const startTime = Date.now();
  let ingestedPoints = 0;
  let lastErrorMsg: string | null = null;

  try {
    for (const station of DELHI_GRID_STATIONS) {
      // Open-Meteo High-Resolution Precipitation and 72h Forecast (no API key needed)
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${station.lat}&longitude=${station.lng}&hourly=precipitation,temperature_2m,relative_humidity_2m,wind_speed_10m&minutely_15=precipitation&forecast_days=3&timezone=Asia%2FKolkata`;
      
      let res: Response | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          res = await fetch(url);
          if (res.ok) break;
        } catch (_err) {
          if (attempt === 3) throw _err;
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }

      if (!res || !res.ok) continue;

      const data = await res.json();

      // Current Observation
      const nowIdx = 0;
      const precip15m = data.minutely_15?.precipitation?.[nowIdx] ?? 0.0;
      const temp = data.hourly?.temperature_2m?.[nowIdx] ?? 28.0;
      const humidity = data.hourly?.relative_humidity_2m?.[nowIdx] ?? 75.0;
      const wind = data.hourly?.wind_speed_10m?.[nowIdx] ?? 12.0;

      await supabase.from("weather_observations").insert({
        station_name: station.name,
        geom: `POINT(${station.lng} ${station.lat})`,
        temp_c: temp,
        humidity_pct: humidity,
        precip_mm: precip15m,
        wind_speed_kmh: wind,
        observation_time: new Date().toISOString(),
        raw: { current: { precip15m, temp, humidity, wind } }
      });

      // 72h Forecast summary
      const totalRain72h = (data.hourly?.precipitation || []).reduce((acc: number, val: number) => acc + (val || 0), 0);
      const rain1h = data.hourly?.precipitation?.[0] ?? 0.0;

      await supabase.from("weather_forecasts").insert({
        grid_point: station.name,
        geom: `POINT(${station.lng} ${station.lat})`,
        forecast_time: new Date().toISOString(),
        rain_15m_mm: precip15m,
        rain_1h_mm: rain1h,
        total_rain_72h_mm: Math.round(totalRain72h * 10) / 10,
        raw: { hourly_sample: (data.hourly?.precipitation || []).slice(0, 24) }
      });

      ingestedPoints++;
    }

    const latency = Date.now() - startTime;
    await supabase.from("source_health").upsert({
      source: "open-meteo",
      last_success: new Date().toISOString(),
      status: "HEALTHY",
      latency_ms: latency,
      metadata: { stations_ingested: ingestedPoints, total_grid: DELHI_GRID_STATIONS.length }
    });

    return new Response(JSON.stringify({ success: true, stations: ingestedPoints, latency_ms: latency }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err: unknown) {
    lastErrorMsg = err instanceof Error ? err.message : String(err);
    await supabase.from("source_health").upsert({
      source: "open-meteo",
      last_error: new Date().toISOString(),
      last_error_msg: lastErrorMsg,
      status: "DEGRADED"
    });

    return new Response(JSON.stringify({ success: false, error: lastErrorMsg }), {
      status: 200, // Never throw so pg_cron doesn't fail violently
      headers: { "Content-Type": "application/json" }
    });
  }
});

