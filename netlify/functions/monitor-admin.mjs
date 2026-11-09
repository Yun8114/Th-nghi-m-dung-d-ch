import { getStore } from "@netlify/blobs";
const store = getStore("tdk-monitor");
const json = (data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean = v=>String(v??"").replace(/[<>&"]/g,"").trim().slice(0,120);

export default async (request) => {
  const configured = Netlify.env.get("TEACHER_MONITOR_PASSWORD");
  if (!configured) return json({error:"Teacher password is not configured in Netlify."},503);
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${configured}`) return json({error:"Unauthorized"},401);
  const events=[], studentsBySession=new Map();
  let cursor;
  do {
    const page=await store.list({prefix:"event/",cursor,limit:1000});
    for (const item of page.blobs) {
      const e=await store.get(item.key,{type:"json"});
      if(e) events.push(e);
    }
    cursor=page.cursor;
  } while(cursor);
  do {
    const page=await store.list({prefix:"session/",cursor,limit:1000});
    for (const item of page.blobs) {
      const s=await store.get(item.key,{type:"json"});
      if(s) studentsBySession.set(s.sessionId,s);
    }
    cursor=page.cursor;
  } while(cursor);
  events.sort((a,b)=>String(b.time).localeCompare(String(a.time)));
  const sessions=[...studentsBySession.values()];
  const grouped=new Map();
  for(const s of sessions){
    const key=`${s.studentClass}||${s.studentName}`;
    const g=grouped.get(key)||{name:s.studentName,studentClass:s.studentClass,tabSwitches:0,reloads:0,lastSeen:"",sessions:0};
    g.tabSwitches+=s.tabSwitches||0;g.reloads+=s.reloads||0;g.sessions++;
    if(String(s.lastSeen)>String(g.lastSeen))g.lastSeen=s.lastSeen;
    grouped.set(key,g);
  }
  const q=clean(new URL(request.url).searchParams.get("q")).toLocaleLowerCase("vi");
  const students=[...grouped.values()].filter(x=>!q||`${x.name} ${x.studentClass}`.toLocaleLowerCase("vi").includes(q)).sort((a,b)=>b.tabSwitches-a.tabSwitches);
  const filteredEvents=events.filter(e=>!q||`${e.studentName} ${e.studentClass}`.toLocaleLowerCase("vi").includes(q));
  return json({students,events:filteredEvents.slice(0,1000)});
};
export const config = { path: "/api/monitor-admin" };
