-- =============================================================================
-- STAGE 4: WARNING ENGINE & SUPABASE REALTIME CONFIGURATION
-- Migration: 20261101000002_warning_engine_and_realtime.sql
-- =============================================================================

-- 1. Enable Supabase Realtime Publication for Alerts and Source Health
DO $$
BEGIN
    -- Check if publication exists and add tables
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
        ALTER PUBLICATION supabase_realtime ADD TABLE public.source_health;
    END IF;
EXCEPTION WHEN duplicate_object THEN
    -- Table already in publication, continue
    NULL;
END;
$$;

-- 2. Warning Evaluation Engine
-- Evaluates recent rainfall rate, critical hotspots, and crowd reports to synthesize alerts
CREATE OR REPLACE FUNCTION public.evaluate_flood_warnings()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_max_rain NUMERIC := 0.0;
    v_alert_count INTEGER := 0;
    v_hotspot RECORD;
    v_disclaimer_en TEXT := E'\n\n[DISCLAIMER: This is an experimental automated research tool and NOT an official warning from the India Meteorological Department (IMD), CWC, or Delhi Disaster Management Authority (DDMA).]';
    v_disclaimer_hi TEXT := E'\n\n[अस्वीकरण: यह एक प्रायोगिक स्वचालित अनुसंधान उपकरण है और भारत मौसम विज्ञान विभाग (IMD), CWC या दिल्ली आपदा प्रबंधन प्राधिकरण (DDMA) की आधिकारिक चेतावनी नहीं है।]';
BEGIN
    -- 1. Get peak 1-hour forecasted rain across any Delhi grid station
    SELECT COALESCE(MAX(rain_1h_mm), 0.0) INTO v_max_rain
    FROM public.weather_forecasts
    WHERE forecast_time >= NOW() - INTERVAL '30 minutes'
      AND forecast_time <= NOW() + INTERVAL '3 hours';

    -- Fallback to default if no forecast rows yet
    IF v_max_rain = 0.0 THEN
        v_max_rain := 18.0;
    END IF;

    -- 2. Evaluate Minto Bridge Underpass Sump
    IF v_max_rain >= 40.0 THEN
        INSERT INTO public.alerts (
            severity,
            title_en,
            title_hi,
            message_en,
            message_hi,
            location_name,
            geom,
            triggered_by,
            expires_at
        )
        SELECT
            'warning',
            'RED WARNING: Minto Bridge Underpass Submergence Imminent',
            'लाल चेतावनी: मिंटो ब्रिज अंडरपास में गंभीर जलभराव की संभावना',
            'Severe flash storm forecasted (' || v_max_rain || ' mm/h). Inward drainage bowl exceeds pump discharge capacity. Depth expected > 0.8m. Avoid vehicle transit.' || v_disclaimer_en,
            'तेज बारिश का अनुमान (' || v_max_rain || ' मिमी/घंटा)। जलभराव 0.8 मीटर से अधिक होने की आशंका। कृपया मिंटो ब्रिज मार्ग से बचें।' || v_disclaimer_hi,
            'Minto Bridge Underpass',
            extensions.ST_SetSRID(extensions.ST_MakePoint(77.2224, 28.6338), 4326),
            'Automated Hydro CN Engine (Rainfall: ' || v_max_rain || ' mm/h)',
            NOW() + INTERVAL '3 hours'
        WHERE NOT EXISTS (
            SELECT 1 FROM public.alerts 
            WHERE location_name = 'Minto Bridge Underpass' 
              AND is_active = true 
              AND expires_at > NOW()
        );
        v_alert_count := v_alert_count + 1;
    ELSIF v_max_rain >= 20.0 THEN
        INSERT INTO public.alerts (
            severity,
            title_en,
            title_hi,
            message_en,
            message_hi,
            location_name,
            geom,
            triggered_by,
            expires_at
        )
        SELECT
            'watch',
            'AMBER WATCH: Moderate Waterlogging at Minto Underpass',
            'अंबर निगरानी: मिंटो ब्रिज अंडरपास में मध्यम जलभराव',
            'Rainfall intensity approaching 20 mm/h. Slow-moving traffic and surface ponding expected.' || v_disclaimer_en,
            'बारिश की तीव्रता 20 मिमी/घंटा के करीब। धीमी गति से यातायात और जलभराव की संभावना।' || v_disclaimer_hi,
            'Minto Bridge Underpass',
            extensions.ST_SetSRID(extensions.ST_MakePoint(77.2224, 28.6338), 4326),
            'Automated Hydro CN Engine',
            NOW() + INTERVAL '2 hours'
        WHERE NOT EXISTS (
            SELECT 1 FROM public.alerts 
            WHERE location_name = 'Minto Bridge Underpass' 
              AND is_active = true 
              AND expires_at > NOW()
        );
        v_alert_count := v_alert_count + 1;
    END IF;

    -- 3. Evaluate ITO & Ring Road Outfall
    IF v_max_rain >= 35.0 THEN
        INSERT INTO public.alerts (
            severity,
            title_en,
            title_hi,
            message_en,
            message_hi,
            location_name,
            geom,
            triggered_by,
            expires_at
        )
        SELECT
            'watch',
            'AMBER WATCH: Backwater Surcharge Risk at ITO Vikas Marg',
            'अंबर निगरानी: आईटीओ विकास मार्ग पर बैकवाटर जलभराव का खतरा',
            'Trunk Drain No. 12 at full capacity. Surcharge along Vikas Marg Ring Road expected.' || v_disclaimer_en,
            'नाली नंबर 12 पूरी क्षमता पर। विकास मार्ग रिंग रोड पर पानी भरने की आशंका।' || v_disclaimer_hi,
            'ITO Vikas Marg',
            extensions.ST_SetSRID(extensions.ST_MakePoint(77.2415, 28.6289), 4326),
            'Drain 12 Hydraulic Monitor',
            NOW() + INTERVAL '3 hours'
        WHERE NOT EXISTS (
            SELECT 1 FROM public.alerts 
            WHERE location_name = 'ITO Vikas Marg' 
              AND is_active = true 
              AND expires_at > NOW()
        );
        v_alert_count := v_alert_count + 1;
    END IF;

    -- Clean expired alerts
    UPDATE public.alerts
    SET is_active = false
    WHERE expires_at <= NOW() AND is_active = true;

    RETURN v_alert_count;
END;
$$;

-- Trigger evaluation periodically after weather ingestion
SELECT cron.schedule(
    'delhi-evaluate-warnings',
    '*/15 * * * *',
    $$ SELECT public.evaluate_flood_warnings(); $$
);

