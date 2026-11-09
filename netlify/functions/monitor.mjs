import { getStore } from "@netlify/blobs";

const store = getStore("tdk-monitor");
const json = (data, status=200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*", "Cache-Control":"no-store" }
});
const clean = (v,n=120) => String(v ?? "").replace(/[\u0000-\u001f]/g," ").trim().slice(0,n);

export default async (request) => {
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers:{
    "Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST, OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type"
  }});
  if (request.method !== "POST") return json({error:"Method not allowed"},405);
  let body;
  try { body = await request.json(); } catch { return json({error:"Invalid JSON"},400); }
  const type = clean(body.type,40);
  const allowed = new Set(["page_open","page_reload","heartbeat","tab_hidden","tab_returned","page_exit"]);
  if (!allowed.has(type)) return json({error:"Invalid event type"},400);
  const sessionId=clean(body.sessionId,80), studentName=clean(body.studentName,80), studentClass=clean(body.studentClass,30);
  if (!sessionId || !studentName || !studentClass) return json({error:"Missing student/session"},400);
  const now = new Date().toISOString();
  const id = `${Date.now()}_${crypto.randomUUID()}`;
  const event = {id,time:now,type,sessionId,studentName,studentClass,page:clean(body.page,200)};
  await store.setJSON(`event/${id}`,event);
  // Maintain a compact per-session record so the browser can retrieve a count.
  const key=`session/${sessionId}`;
  const prior=await store.get(key,{type:"json"}) || {sessionId,studentName,studentClass,tabSwitches:0,reloads:0,firstSeen:now};
  prior.studentName=studentName; prior.studentClass=studentClass; prior.lastSeen=now;
  if(type==="tab_hidden") prior.tabSwitches=(prior.tabSwitches||0)+1;
  if(type==="page_reload") prior.reloads=(prior.reloads||0)+1;
  await store.setJSON(key,prior);
  return json({ok:true,violationCount:prior.tabSwitches});
};

export const config = { path: "/api/monitor" };
