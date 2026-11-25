import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
const db = createClient(supabaseUrl, serviceKey);
webpush.setVapidDetails("mailto:admin@example.com", vapidPublicKey, vapidPrivateKey);

const dateKey = (d: Date) => {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
};
function occurs(record: any, date: string) {
  if (record.date === date) return true;
  if (!record.repeat || record.repeat === "none" || date < record.date) return false;
  const a = new Date(record.date + "T12:00:00Z"), b = new Date(date + "T12:00:00Z");
  if (record.repeat === "daily") return true;
  if (record.repeat === "weekly") return a.getUTCDay() === b.getUTCDay();
  if (record.repeat === "monthly") return a.getUTCDate() === b.getUTCDate();
  return false;
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", {status:405});
  try {
    const now = new Date();
    const minuteStart = Math.floor(now.getTime()/60000)*60000;
    const minuteEnd = minuteStart + 60000;
    const { data: owners, error } = await db.from("scheduler_records").select("user_id,records");
    if (error) throw error;
    let sent = 0;
    for (const owner of owners ?? []) {
      const { data: subscriptions } = await db.from("push_subscriptions").select("id,endpoint,subscription").eq("user_id", owner.user_id);
      if (!subscriptions?.length) continue;
      for (const record of owner.records ?? []) {
        if (record.kind !== "event" || !record.date || !record.time) continue;
        const base = new Date(`${record.date}T${record.time}:00`);
        if (Number.isNaN(base.getTime())) continue;
        for (const offset of [0,10,30]) {
          const due = new Date(base.getTime() - offset*60000);
          if (due.getTime() < minuteStart || due.getTime() >= minuteEnd) continue;
          const occurrenceDate = dateKey(base);
          if (!occurs(record, occurrenceDate)) continue;
          const { error: logError } = await db.from("reminder_deliveries").insert({
            user_id: owner.user_id, record_id: String(record.id), occurrence_date: occurrenceDate, reminder_offset: offset
          });
          if (logError) { if (logError.code === "23505") continue; throw logError; }
          const payload = JSON.stringify({
            title: record.title || "일정 알림",
            body: offset === 0 ? "지금 시작할 일정입니다." : `${offset}분 후 시작합니다.`,
            url: "/Scheduler/"
          });
          for (const sub of subscriptions) {
            try {
              await webpush.sendNotification(sub.subscription, payload, {TTL: 3600, urgency:"high"});
              sent++;
            } catch (e) {
              const code = (e as any)?.statusCode;
              if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", sub.id);
              console.error("push failed", code, e);
            }
          }
        }
      }
    }
    return Response.json({ok:true,sent,checkedAt:now.toISOString()});
  } catch (e) {
    console.error(e);
    return Response.json({error:String(e)}, {status:500});
  }
});
