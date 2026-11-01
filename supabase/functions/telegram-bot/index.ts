import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";

const DISCLAIMER = "\n\n⚠️ *NOTICE: This is an automated experimental research tool and NOT an official warning from the India Meteorological Department (IMD) or Delhi Government.*";

async function sendTelegramMessage(chatId: number, text: string) {
  if (!BOT_TOKEN) {
    console.warn("TELEGRAM_BOT_TOKEN not configured.");
    return false;
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown"
      })
    });
    return res.ok;
  } catch (err) {
    console.error(`Failed to send Telegram message to ${chatId}:`, err);
    return false;
  }
}

Deno.serve(async (req) => {
  // Verify Webhook Secret
  const incomingSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (WEBHOOK_SECRET && incomingSecret !== WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized webhook" }), { status: 401 });
  }

  // 1. Process Webhook Dispatch for Outgoing Alerts
  const url = new URL(req.url);
  if (url.searchParams.get("action") === "dispatch-alerts") {
    // Find undelivered active warnings
    const { data: pendingAlerts } = await supabase
      .from("alerts")
      .select("id, severity, title_en, message_en, location_name")
      .eq("is_active", true)
      .eq("telegram_dispatched", false)
      .limit(5);

    if (!pendingAlerts || pendingAlerts.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No pending alerts" }), { headers: { "Content-Type": "application/json" } });
    }

    // Get active subscribers
    const { data: subscribers } = await supabase
      .from("telegram_subscribers")
      .select("chat_id")
      .eq("is_active", true);

    let sentCount = 0;
    for (const alert of pendingAlerts) {
      const msg = `🚨 *DELHI FLOOD ALERT [${alert.severity.toUpperCase()}]*\n\n*${alert.title_en}*\n📍 *Location:* ${alert.location_name}\n\n${alert.message_en}${DISCLAIMER}`;
      for (const sub of subscribers || []) {
        await sendTelegramMessage(sub.chat_id, msg);
        sentCount++;
      }
      // Mark alert dispatched to prevent duplicate notifications
      await supabase.from("alerts").update({ telegram_dispatched: true }).eq("id", alert.id);
    }

    return new Response(JSON.stringify({ dispatched: pendingAlerts.length, total_messages: sentCount }), { headers: { "Content-Type": "application/json" } });
  }

  // 2. Incoming User Commands (/start, /stop, /status)
  try {
    const update = await req.json();
    const message = update.message;
    if (!message || !message.text) {
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();
    const username = message.from?.username || null;
    const firstName = message.from?.first_name || "Citizen";

    if (text.startsWith("/start")) {
      await supabase.from("telegram_subscribers").upsert({
        chat_id: chatId,
        username,
        first_name: firstName,
        is_active: true,
        subscribed_at: new Date().toISOString()
      });

      const welcome = `🌊 *Welcome to Delhi Urban Flood Nowcasting Bot, ${firstName}!*\n\nYou are now subscribed to automated 0–3 hour flash flood warnings for Delhi NCT underpasses, trunk drains, and low-lying transit corridors.\n\n*Commands:*\n• /status - View current citywide flood warnings\n• /stop - Unsubscribe from alerts${DISCLAIMER}`;
      await sendTelegramMessage(chatId, welcome);
    } else if (text.startsWith("/stop")) {
      await supabase.from("telegram_subscribers").update({ is_active: false }).eq("chat_id", chatId);
      await sendTelegramMessage(chatId, `You have been unsubscribed from Delhi flood alerts.${DISCLAIMER}`);
    } else if (text.startsWith("/status")) {
      const { data: activeAlerts } = await supabase
        .from("alerts")
        .select("severity, title_en, location_name")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(3);

      let statusMsg = "📍 *CURRENT ACTIVE FLOOD WARNINGS (DELHI NCT):*\n\n";
      if (!activeAlerts || activeAlerts.length === 0) {
        statusMsg += "✅ No active critical flood warnings. Primary trunk drains flowing within normal capacity.\n";
      } else {
        activeAlerts.forEach((a, i) => {
          statusMsg += `${i + 1}. [${a.severity.toUpperCase()}] *${a.location_name}*\n   ${a.title_en}\n\n`;
        });
      }
      statusMsg += DISCLAIMER;
      await sendTelegramMessage(chatId, statusMsg);
    } else {
      await sendTelegramMessage(chatId, `Available commands: /status, /start, /stop${DISCLAIMER}`);
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err: unknown) {
    console.error("Telegram handler error:", err);
    return new Response(JSON.stringify({ ok: false }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
});

