import { NextResponse } from 'next/server';
import { getD1,getWorkspaceIdentity,ensureSchema,getMediaBucket } from '@/lib/workspace';
import { ensurePlanningSchema } from '@/lib/planning';
import { clean,validDate,documentKinds,hubSnapshot,migrateIndependentRecords,parse,wordStats,Word,Review,HubDoc,ListEntry } from '@/lib/content-hub';
export const dynamic='force-dynamic';
async function context(){const identity=await getWorkspaceIdentity();if(!identity)return null;const db=getD1();await ensureSchema(db);await ensurePlanningSchema(db);await migrateIndependentRecords(db,identity.userId);return {db,user:identity.userId};}
const error=(message:string,status=400)=>NextResponse.json({error:message},{status});
export async function GET(){try{const c=await context();if(!c)return error('请先登录',401);return NextResponse.json(await hubSnapshot(c.db,c.user));}catch(e){console.error('content-hub load failed',e);return error('内容暂时无法加载，请稍后重试',503);}}
export async function POST(request:Request){try{
 const c=await context();if(!c)return error('请先登录',401);const {db,user}=c;const now=new Date().toISOString();
 if(request.headers.get('content-type')?.includes('multipart/form-data')){
  const form=await request.formData(),id=clean(form.get('id'),180),files=form.getAll('images').filter((f):f is File=>f instanceof File&&f.size>0);
  if(!await db.prepare('SELECT id FROM hub_documents WHERE id=? AND user_id=? AND deleted=0').bind(id,user).first())return error('记录不存在',404);
  const count=await db.prepare('SELECT COUNT(*) n FROM hub_images WHERE user_id=? AND document_id=?').bind(user,id).first<{n:number}>();
  if(!files.length||files.length+Number(count?.n||0)>6||files.some(f=>f.size>8*1024*1024||!['image/jpeg','image/png','image/webp','image/gif'].includes(f.type)))return error('最多6张图片，每张8MB，支持 JPG、PNG、WebP、GIF');
  const bucket=getMediaBucket();if(!bucket)return error('图片服务暂不可用',503);
  for(const file of files){const bytes=await file.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join(''),imageId=`${id}:${hash}`,key=`${user}/content/${id}/${hash}`;await bucket.put(key,bytes,{httpMetadata:{contentType:file.type}});await db.prepare('INSERT OR IGNORE INTO hub_images(id,user_id,document_id,object_key,content_type) VALUES(?,?,?,?,?)').bind(imageId,user,id,key,file.type).run();}
  return NextResponse.json({ok:true,id});
 }
 const body=await request.json() as Record<string,unknown>,action=clean(body.action,40),id=clean(body.id,400);
 if(action==='save-document'){
  const kind=clean(body.kind,30),title=clean(body.title,180),content=clean(body.content,30000),date=clean(body.date,10),status=clean(body.status,20)||'draft',meta=JSON.stringify(body.meta||{});
  if(body.meta&&(typeof body.meta!=='object'||Array.isArray(body.meta)||Object.values(body.meta).some(value=>typeof value!=='string')))return error('附加信息必须为文字');
  if(!documentKinds.includes(kind as typeof documentKinds[number])||!title||!content||!validDate(date)||!['draft','final','published','selected','archived'].includes(status)||meta.length>6000)return error('请填写类型、标题、正文和有效日期');
  let docId=id;
  if(id){const row=await db.prepare('SELECT * FROM hub_documents WHERE id=? AND user_id=? AND deleted=0').bind(id,user).first<HubDoc>();if(!row)return error('记录不存在',404);if(Number(body.revision)!==row.revision)return error('记录已有更新，请重新加载后合并',409);
   const versions=parse<HubDoc[]>(row.versions,[]);versions.push({...row,versions:'[]'});
   const result=await db.prepare('UPDATE hub_documents SET kind=?,title=?,content=?,date=?,status=?,meta=?,versions=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=?').bind(kind,title,content,date,status,meta,JSON.stringify(versions),now,id,user,row.revision).run();if(!result.meta.changes)return error('记录已有更新，请重新加载后合并',409);
  }else{const requestId=clean(body.requestId,100);if(!requestId)return error('缺少保存请求编号');docId=`doc:${user}:${requestId}`;await db.prepare('INSERT OR IGNORE INTO hub_documents(id,user_id,kind,title,content,date,status,meta,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(docId,user,kind,title,content,date,status,meta,now,now).run();}
  return NextResponse.json({ok:true,id:docId,url:`/?section=${kind.includes('_')&&/^(xhs|overseas)_/.test(kind)?'media':'records'}&entry=${encodeURIComponent(docId)}`});
 }
 if(action==='delete-document'){await db.prepare('UPDATE hub_documents SET deleted=1,updated_at=? WHERE id=? AND user_id=?').bind(now,id,user).run();return NextResponse.json({ok:true});}
 if(action==='import-words'){
  const title=clean(body.title,180),date=clean(body.date,10),requestId=clean(body.requestId,100),source=clean(body.source,1000);
  const input=body.entries as Record<string,unknown>[];if(!title||!validDate(date)||!requestId||!Array.isArray(input)||!input.length||input.length>200)return error('请填写标题、日期和1–200个词条');
  const listId=`list:${user}:${requestId}`;if(await db.prepare('SELECT id FROM hub_word_lists WHERE id=? AND user_id=?').bind(listId,user).first())return NextResponse.json({ok:true,id:listId});
  const statements:D1PreparedStatement[]=[],entries:ListEntry[]=[];
  for(const row of input){if(!row||typeof row!=='object')return error('词条格式无效');const word=clean(row.word,120),pos=clean(row.pos,40),meaning=clean(row.meaning,2000),example=clean(row.example,4000),correction=clean(row.correction,4000);if(!word||!meaning)return error('每个词条都需要单词和释义');const normalized=word.normalize('NFKC').toLowerCase().replace(/\s+/g,' ')+'|'+pos.toLowerCase(),wordId=`word:${user}:${normalized}`;
   statements.push(db.prepare('INSERT OR IGNORE INTO hub_words(id,user_id,word,pos,normalized,meaning,created_at) VALUES(?,?,?,?,?,?,?)').bind(wordId,user,word,pos,normalized,meaning,now));entries.push({wordId,word,meaning,example,correction});}
  statements.push(db.prepare('INSERT OR IGNORE INTO hub_word_lists(id,user_id,title,date,source,entries,created_at) VALUES(?,?,?,?,?,?,?)').bind(listId,user,title,date,source,JSON.stringify(entries),now));await db.batch(statements);return NextResponse.json({ok:true,id:listId});
 }
 if(action==='master-word'){const result=await db.prepare('UPDATE hub_words SET mastered=? WHERE user_id=? AND id=?').bind(body.mastered===true?1:0,user,id).run();if(!result.meta.changes)return error('单词不存在',404);return NextResponse.json({ok:true});}
 if(action==='start-review'){
  const words=(await db.prepare('SELECT * FROM hub_words WHERE user_id=? AND mastered=0').bind(user).all<Word>()).results,reviews=(await db.prepare("SELECT * FROM hub_reviews WHERE user_id=? AND status='completed'").bind(user).all<Review>()).results;
  let candidates=wordStats(words,reviews);const listId=clean(body.listId,180),wordId=clean(body.wordId,300);
  if(listId){const list=await db.prepare('SELECT entries FROM hub_word_lists WHERE id=? AND user_id=?').bind(listId,user).first<{entries:string}>();if(!list)return error('词表不存在',404);const ids=new Set(parse<ListEntry[]>(list.entries,[]).map(e=>e.wordId));candidates=candidates.filter(w=>ids.has(w.id));}
  if(wordId)candidates=candidates.filter(w=>w.id===wordId);
  const count=wordId?1:Number(body.count);if(!Number.isInteger(count)||count<1||count>candidates.length)return error(`请选择1至${candidates.length}个单词`);
  const difficult=candidates.filter(w=>w.difficult),rest=candidates.filter(w=>!w.difficult);for(let i=rest.length-1;i>0;i--){const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);[rest[i],rest[j]]=[rest[j],rest[i]];}
  const requestId=clean(body.requestId,100);if(!requestId)return error('缺少检查请求编号');const reviewId=`review:${user}:${requestId}`;
  await db.prepare('INSERT OR IGNORE INTO hub_reviews(id,user_id,items,created_at) VALUES(?,?,?,?)').bind(reviewId,user,JSON.stringify([...difficult,...rest].slice(0,count)),now).run();return NextResponse.json({ok:true,id:reviewId});
 }
 if(action==='answer-review'||action==='finish-review'){
  const review=await db.prepare('SELECT * FROM hub_reviews WHERE id=? AND user_id=?').bind(id,user).first<Review>();if(!review)return error('检查不存在',404);if(review.status==='completed')return NextResponse.json({ok:true,id});
  const items=parse<Word[]>(review.items,[]),answers=parse<Record<string,string>>(review.answers,{});
  if(action==='answer-review'){const wordId=clean(body.wordId,300),answer=clean(body.answer,20);if(!items.some(w=>w.id===wordId)||!['remembered','forgotten'].includes(answer))return error('检查答案无效');answers[wordId]=answer;const result=await db.prepare("UPDATE hub_reviews SET answers=? WHERE id=? AND user_id=? AND status='active' AND answers=?").bind(JSON.stringify(answers),id,user,review.answers).run();if(!result.meta.changes)return error('检查已有更新，请重试',409);}
  else {const mastered=(await db.prepare('SELECT id FROM hub_words WHERE user_id=? AND mastered=1').bind(user).all<{id:string}>()).results.map(w=>w.id);for(const word of items){if(mastered.includes(word.id))answers[word.id]='skipped';else if(!['remembered','forgotten'].includes(answers[word.id]))return error('请完成所有单词的检查');}const result=await db.prepare("UPDATE hub_reviews SET answers=?,status='completed',completed_at=? WHERE id=? AND user_id=? AND status='active' AND answers=?").bind(JSON.stringify(answers),now,id,user,review.answers).run();if(!result.meta.changes)return error('检查已有更新，请重试',409);}
  return NextResponse.json({ok:true,id});
 }
 return error('不支持的操作');
 }catch(e){console.error('content-hub save failed',e);return error('保存失败，内容已保留，请稍后重试',503);}}
