-- =============================================================================
-- STAGE 3: PG_CRON + PG_NET INGESTION SCHEDULER
-- Migration: 20261101000001_schedule_ingestion_cron.sql
-- =============================================================================

-- Ensure pg_cron and pg_net are enabled
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function to safely trigger Edge Function with CRON_SECRET from Supabase Vault
CREATE OR REPLACE FUNCTION public.invoke_edge_cron(
    p_function_name TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_project_ref TEXT;
    v_url TEXT;
    v_cron_secret TEXT;
    v_request_id BIGINT;
BEGIN
    -- Read CRON_SECRET from Supabase Vault if available, else fallback to environment variable
    BEGIN
        SELECT decrypted_secret INTO v_cron_secret
        FROM vault.decrypted_secrets
        WHERE name = 'CRON_SECRET'
        LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        v_cron_secret := NULL;
    END;

    -- If not stored in vault, use configured standard secret
    IF v_cron_secret IS NULL THEN
        v_cron_secret := current_setting('app.settings.cron_secret', true);
    END IF;

    -- Edge Function URL
    v_url := 'https://kfbppkoioyuonzyqibra.supabase.co/functions/v1/' || p_function_name;

    -- Trigger asynchronously via pg_net
    SELECT net.http_post(
        url := v_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', COALESCE(v_cron_secret, '')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 15000
    ) INTO v_request_id;

    RETURN v_request_id;
END;
$$;

-- Unschedule any existing jobs to prevent duplicates
SELECT cron.unschedule('delhi-ingest-weather') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delhi-ingest-weather');
SELECT cron.unschedule('delhi-ingest-rainfall-satellite') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delhi-ingest-rainfall-satellite');
SELECT cron.unschedule('delhi-ingest-satellite-scenes') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delhi-ingest-satellite-scenes');
SELECT cron.unschedule('delhi-ingest-river') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delhi-ingest-river');

-- 1. Weather: Every 15 minutes (Open-Meteo precipitation nowcast)
SELECT cron.schedule(
    'delhi-ingest-weather',
    '*/15 * * * *',
    $$ SELECT public.invoke_edge_cron('ingest-weather'); $$
);

-- 2. Rainfall Satellite: Every 30 minutes (NASA GPM IMERG)
SELECT cron.schedule(
    'delhi-ingest-rainfall-satellite',
    '*/30 * * * *',
    $$ SELECT public.invoke_edge_cron('ingest-rainfall-satellite'); $$
);

-- 3. River Gauge: Every 30 minutes (CWC Yamuna Level)
SELECT cron.schedule(
    'delhi-ingest-river',
    '*/30 * * * *',
    $$ SELECT public.invoke_edge_cron('ingest-river'); $$
);

-- 4. Satellite Scenes: Every 3 hours (Copernicus Sentinel-1/2)
SELECT cron.schedule(
    'delhi-ingest-satellite-scenes',
    '0 */3 * * *',
    $$ SELECT public.invoke_edge_cron('ingest-satellite-scenes'); $$
);

