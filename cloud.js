import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cfg = window.MY_SCHEDULER_CONFIG || {};
const status = (message) => {
  const el = document.getElementById("cloudStatus");
  if (el) el.textContent = message;
};
let client = null;
let applyingRemote = false;
const configured = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);

function b64ToBytes(value) {
  const pad = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
async function pull() {
  if (!client) return null;
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await client.from("scheduler_records").select("records").eq("user_id", auth.user.id).maybeSingle();
  if (error) throw error;
  return data?.records ?? null;
}
async function push(records) {
  if (!client || applyingRemote) return;
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return;
  const { error } = await client.from("scheduler_records").upsert({
    user_id: auth.user.id, records, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id" });
  if (error) status("클라우드 저장 실패: " + error.message);
}
window.schedulerCloudPush = records => {
  clearTimeout(window.schedulerCloudPushTimer);
  window.schedulerCloudPushTimer = setTimeout(() => push(records).catch(e => status("동기화 오류: " + e.message)), 700);
};
window.schedulerCloudPull = pull;
window.schedulerCloudConfigured = configured;
window.schedulerApplyCloudRecords = async records => {
  applyingRemote = true;
  try { await window.schedulerSetRecordsFromCloud(records); }
  finally { applyingRemote = false; }
};

function addCloudPanel() {
  const settings = document.getElementById("settings");
  if (!settings || document.getElementById("cloudPanel")) return;
  const panel = document.createElement("div");
  panel.id = "cloudPanel";
  panel.innerHTML = `
    <hr><h3>계정 및 기기 동기화</h3>
    <p class="muted">로그인하면 같은 계정의 iPhone·PC 일정이 동기화됩니다.</p>
    <label>이메일 주소<input id="cloudEmail" type="email" autocomplete="email" placeholder="name@example.com"></label>
    <button id="cloudLogin" class="primary">로그인 링크 받기</button>
    <p id="cloudStatus" class="muted" aria-live="polite"></p>
    <button id="pushEnable" class="primary">이 기기에서 푸시 알림 켜기</button>
    <p class="muted">iPhone은 홈 화면에 추가한 앱에서 버튼을 눌러 권한을 허용해야 합니다.</p>`;
  settings.append(panel);
  if (!configured) {
    status("Supabase 설정이 필요합니다. DEPLOYMENT.md를 따라 프로젝트 설정 후 config.js를 채워주세요.");
    panel.querySelector("#cloudLogin").disabled = true;
    panel.querySelector("#pushEnable").disabled = true;
    return;
  }
  client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  client.auth.onAuthStateChange((_event, session) => {
    if (!session?.user) { status("로그인되지 않았습니다."); return; }
    setTimeout(async () => {
      try {
        await window.schedulerAppReady;
        const remote = await pull();
        if (remote) await window.schedulerApplyCloudRecords(remote);
        else await push(window.schedulerGetRecords());
        status("로그인됨 · 클라우드 동기화 사용 중");
      } catch (e) { status("동기화 오류: " + e.message); }
    }, 0);
  });
  panel.querySelector("#cloudLogin").onclick = async () => {
    const email = panel.querySelector("#cloudEmail").value.trim();
    if (!email) return status("이메일 주소를 입력해주세요.");
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href } });
    status(error ? "로그인 링크 발송 실패: " + error.message : "로그인 링크를 이메일로 보냈습니다.");
  };
  panel.querySelector("#pushEnable").onclick = async () => {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("이 브라우저는 웹 푸시를 지원하지 않습니다.");
      if (location.protocol !== "https:" && location.hostname !== "localhost") throw new Error("HTTPS 환경에서만 사용할 수 있습니다.");
      if (!cfg.vapidPublicKey) throw new Error("VAPID 공개키가 config.js에 설정되지 않았습니다.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("알림 권한이 허용되지 않았습니다.");
      const { data: auth } = await client.auth.getUser();
      if (!auth.user) throw new Error("먼저 이메일 로그인해주세요.");
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: b64ToBytes(cfg.vapidPublicKey)
      });
      const { error } = await client.from("push_subscriptions").upsert({
        user_id: auth.user.id, endpoint: subscription.endpoint, subscription: subscription.toJSON()
      }, { onConflict: "endpoint" });
      if (error) throw error;
      status("이 기기의 푸시 알림이 활성화되었습니다.");
    } catch (e) { status("푸시 설정 실패: " + e.message); }
  };
  if (client) client.auth.getSession().then(({data}) => {
    if (data.session) status("로그인됨 · 클라우드 동기화 사용 중");
  });
}
window.schedulerCloudReady = new Promise(resolve => {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { addCloudPanel(); resolve(); }, {once:true});
  else { addCloudPanel(); resolve(); }
});
