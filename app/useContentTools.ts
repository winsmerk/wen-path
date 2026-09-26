'use client';

import { useEffect } from 'react';

type Tool = {name:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean;untrustedContentHint:boolean};execute:(input:Record<string,unknown>)=>Promise<unknown>};
const kinds=['reading_note','inspiration','diary','xhs_idea','xhs_copy','overseas_idea','overseas_copy'];
const str={type:'string'};

// Uses the signed-in browser session and the same API as the website forms.
export function useContentTools(){
 useEffect(()=>{
  const context=(document as Document & {modelContext?:{registerTool:(tool:Tool,options:{signal:AbortSignal})=>unknown}}).modelContext;
  if(!context?.registerTool)return;
  const lifecycle=new AbortController();
  async function snapshot(){const r=await fetch('/api/content-hub',{cache:'no-store'});const data=await r.json();if(!r.ok)throw new Error(data.error||'读取失败');return data;}
  async function save(input:Record<string,unknown>,action:string){
   if(!input||typeof input!=='object'||typeof input.requestId!=='string'||!input.requestId.trim())throw new Error('需要稳定的 requestId；同一次保存重试须复用它');
   const r=await fetch('/api/content-hub',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...input,action})});const result=await r.json();if(!r.ok)throw new Error(result.error||'保存失败');
   const data=await snapshot();const item=(action==='import-words'?data.lists:data.documents).find((row:{id:string})=>row.id===result.id);if(!item)throw new Error('保存回执未能核验，请使用相同 requestId 重试');
   const section=action==='import-words'?'vocabulary':/^(xhs|overseas)_/.test(item.kind)?'media':'records';
   const url=new URL(result.url||`/?section=${section}`,location.origin).href;
   history.replaceState(null,'',url);
   await new Promise<void>((resolve,reject)=>{const ready=()=>{clearTimeout(timer);window.removeEventListener('wen-path-content-ready',ready);resolve();};const timer=setTimeout(()=>{window.removeEventListener('wen-path-content-ready',ready);reject(new Error('内容已保存，但界面刷新失败，请凭记录 ID 读取核验'));},15000);window.addEventListener('wen-path-content-ready',ready);window.dispatchEvent(new CustomEvent('wen-path-content-updated',{detail:{section,id:result.id}}));});
   return {saved:true,id:result.id,title:item.title,kind:item.kind||'vocabulary',revision:item.revision,url};
  }
  const tools:Tool[]=[
   {name:'save_wen_path_document',description:'将用户明确选定的正文保存到 wen-path 的读书笔记、灵感、日记或自媒体。小红书定稿使用 xhs_copy 和 final。只提交用户指定的内容。更新已有记录必须提供 id 和当前 revision；重试复用 requestId。',inputSchema:{type:'object',properties:{requestId:str,id:str,revision:{type:'integer'},kind:{type:'string',enum:kinds},title:str,content:str,date:{type:'string',description:'YYYY-MM-DD'},status:{type:'string',enum:['draft','final','published','selected','archived']},meta:{type:'object',additionalProperties:{type:'string'}}},required:['requestId','kind','title','content','date','status'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:input=>save(input,'save-document')},
   {name:'save_wen_path_vocabulary',description:'保存用户明确选定的每日生词表与造句。相同单词和词性合并，保留每份词表的来源及例句。重试复用 requestId。',inputSchema:{type:'object',properties:{requestId:str,title:str,date:str,source:str,entries:{type:'array',minItems:1,maxItems:200,items:{type:'object',properties:{word:str,meaning:str,pos:str,example:str,correction:str},required:['word','meaning'],additionalProperties:false}}},required:['requestId','title','date','entries'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:input=>save(input,'import-words')},
   {name:'read_wen_path_entry',description:'按保存回执中的记录 ID 读取正文或词表，核实已保存的内容。',inputSchema:{type:'object',properties:{id:str},required:['id'],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async input=>{if(typeof input?.id!=='string')throw new Error('缺少记录 ID');const data=await snapshot();const item=[...data.documents,...data.lists].find(row=>row.id===input.id);if(!item)throw new Error('记录不存在');return item;}}
  ];
  for(const tool of tools)try{void Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(e=>console.warn('Content tools unavailable',e));}catch(e){console.warn('Content tools unavailable',e);}
  return ()=>lifecycle.abort();
 },[]);
}
