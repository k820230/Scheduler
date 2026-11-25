import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com", Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

const parts = (date: Date, tz: string) => {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", hourCycle:"h23"
  }).formatToParts(date);
  return Object.fromEntries(values.map(p => [p.type, p.value]));
};
const localDateKey = (date: Date, tz: string) => {
  const p = parts(date, tz);
  return `${p.year}-${p.month}-${p.day}`;
};
function addDays(key: string, amount: number) {
  const d = new Date(key + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0,10);
}
function localDateTimeToUtc(date: string, time: string, tz: string) {
  const [y,m,d] = date.split("-").map(Number);
  const [hh,mm] = time.split(":").map(Number);
  const desired = Date.UTC(y,m-1,d,hh,mm,0);
  let guess = desired;
  for (let i=0;i<4;i++) {
    const p = parts(new Date(guess), tz);
    const represented = Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),0);
    guess += desired - represented;
  }
  return new Date(guess);
}
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
    const { data: owners, error } = await db.from("scheduler_records").select("user_id,records,timezone");
    if (error) throw error;
    let sent = 0;
    for (const owner of owners ?? []) {
      const tz = owner.timezone || "UTC";
      const today = localDateKey(now, tz);
      const candidateDates = [today, addDays(today, 1)];
      const { data: subscriptions } = await db.from("push_subscriptions").select("id,subscription").eq("user_id", owner.user_id);
      if (!subscriptions?.length) continue;
      for (const record of owner.records ?? []) {
        if (record.kind !== "event" || !record.date || !record.time) continue;
        for (const occurrenceDate of candidateDates) {
          if (!occurs(record, occurrenceDate)) continue;
          const eventAt = localDateTimeToUtc(occurrenceDate, record.time, tz);
          for (const offset of [0,10,30]) {
            const due = eventAt.getTime() - offset*60000;
            if (due < minuteStart || due >= minuteEnd) continue;
            const { error: logError } = await db.from("reminder_deliveries").insert({
              user_id: owner.user_id, record_id: String(record.id),
              occurrence_date: occurrenceDate, reminder_offset: offset
            });
            if (logError) {
              if (logError.code === "23505") continue;
              throw logError;
            }
            const payload = JSON.stringify({
              title: record.title || "일정 알림",
              body: offset === 0 ? "지금 시작할 일정입니다." : `${offset}분 후 시작합니다.`,
              url: "/Scheduler/",
              tag: `scheduler-${record.id}-${occurrenceDate}-${offset}`
            });
            let delivered = 0;
            for (const sub of subscriptions) {
              try {
                await webpush.sendNotification(sub.subscription, payload, {TTL:3600, urgency:"high"});
                sent++; delivered++;
              } catch (e) {
                const code = (e as any)?.statusCode;
                if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", sub.id);
                console.error("push failed", code, e);
              }
            }
            if (delivered === 0) {
              await db.from("reminder_deliveries").delete().eq("user_id", owner.user_id)
                .eq("record_id", String(record.id)).eq("occurrence_date", occurrenceDate).eq("reminder_offset", offset);
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
