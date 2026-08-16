import { NextResponse } from "next/server";
import { ensureSchema, getD1, getOpenAIKey, getWorkspaceIdentity } from "@/lib/workspace";

export const dynamic="force-dynamic";

function clean(value:unknown,length=1600){return typeof value==="string"?value.trim().slice(0,length):"";}
function base64(buffer:ArrayBuffer){const bytes=new Uint8Array(buffer);let binary="";for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));return btoa(binary);}
function parseCoach(content:string){
  const fallback={transcript:"Audio practice",reply:"Thanks for sharing your recording. Keep going!",feedback:"已收到录音。建议放慢语速、清晰读出每个重音，并再次录制对比。"};
  try{const parsed=JSON.parse(content.replace(/^```json\s*|\s*```$/g,"")) as {transcript?:string;reply?:string;feedback?:string};return {transcript:clean(parsed.transcript,1600)||fallback.transcript,reply:clean(parsed.reply,1600)||fallback.reply,feedback:clean(parsed.feedback,2400)||fallback.feedback};}catch{return {...fallback,reply:clean(content,1600)||fallback.reply};}
}

export async function POST(request:Request){
  const identity=await getWorkspaceIdentity();if(!identity)return NextResponse.json({error:"unauthorized"},{status:401});
  const key=getOpenAIKey();if(!key)return NextResponse.json({error:"ai_not_configured"},{status:503});
  const form=await request.formData(),audio=form.get("audio"),context=clean(form.get("context"),600);
  if(!(audio instanceof File)||audio.size===0||audio.size>18*1024*1024||audio.type!=="audio/wav")return NextResponse.json({error:"invalid_audio"},{status:400});
  const response=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{authorization:`Bearer ${key}`,"content-type":"application/json"},body:JSON.stringify({model:"gpt-audio-1.5",modalities:["text"],messages:[{role:"system",content:"You are an English speaking coach. Listen closely to the actual audio. Return only valid JSON with transcript, reply, feedback. transcript is the exact English heard. reply is a short natural English response. feedback is concise Chinese guidance covering fluency, grammar, stress/rhythm and specific likely pronunciation problems. Quote problematic words and give simple phonetic or mouth-position guidance. Do not claim certainty when audio is unclear."},{role:"user",content:[{type:"text",text:`请分析这段英语口语。${context?`用户补充语境：${context}`:""}`},{type:"input_audio",input_audio:{data:base64(await audio.arrayBuffer()),format:"wav"}}]}]})});
  if(!response.ok)return NextResponse.json({error:"ai_request_failed"},{status:502});
  const payload=await response.json() as {choices?:Array<{message?:{content?:string}}>},result=parseCoach(payload.choices?.[0]?.message?.content||"");
  const db=getD1();await ensureSchema(db);const now=new Date().toISOString();await db.batch([db.prepare("INSERT INTO english_messages (id,user_id,role,text,feedback,created_at) VALUES (?,?,'user',?,'口语录音',?)").bind(crypto.randomUUID(),identity.userId,result.transcript,now),db.prepare("INSERT INTO english_messages (id,user_id,role,text,feedback,created_at) VALUES (?,?,'assistant',?,?,?)").bind(crypto.randomUUID(),identity.userId,result.reply,result.feedback,new Date(Date.now()+1).toISOString())]);
  return NextResponse.json({ok:true,...result});
}
