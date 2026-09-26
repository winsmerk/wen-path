export const documentKinds = ['reading_note','inspiration','diary','xhs_idea','xhs_copy','overseas_idea','overseas_copy'] as const;
export type HubDoc={id:string;kind:string;title:string;content:string;date:string;status:string;meta:string;versions:string;revision:number;updated_at:string};
export type Word={id:string;word:string;pos:string;meaning:string;mastered:number;created_at:string;forgotten?:number;recentForgotten?:number;checks?:number;lastChecked?:string;difficult?:boolean};
export type ListEntry={wordId:string;word:string;meaning:string;example:string;correction:string};
export type WordList={id:string;title:string;date:string;source:string;entries:string};
export type Review={id:string;items:string;answers:string;status:string;created_at:string;completed_at:string|null};
export function parse<T>(value:string,fallback:T):T{try{return JSON.parse(value) as T;}catch{return fallback;}}
export function wordStats(words:Word[],reviews:Review[]):Word[]{
 return words.map(word=>{const history=reviews.filter(r=>r.status==='completed').sort((a,b)=>(b.completed_at||'').localeCompare(a.completed_at||'')||b.id.localeCompare(a.id)).flatMap(r=>{const answer=parse<Record<string,string>>(r.answers,{})[word.id];return ['remembered','forgotten'].includes(answer)?[{answer,date:r.completed_at||r.created_at}]:[];});const recentForgotten=history.slice(0,5).filter(r=>r.answer==='forgotten').length;return {...word,checks:history.length,forgotten:history.filter(r=>r.answer==='forgotten').length,recentForgotten,difficult:recentForgotten>=3,lastChecked:history[0]?.date||''};}).sort((a,b)=>Number(b.difficult)-Number(a.difficult)||(b.recentForgotten||0)-(a.recentForgotten||0)||(b.forgotten||0)-(a.forgotten||0)||(a.lastChecked||'').localeCompare(b.lastChecked||'')||a.id.localeCompare(b.id));
}
export function clean(value:unknown,max=10000){return typeof value==='string'?value.trim().slice(0,max):'';}
export function validDate(value:string){const date=new Date(value+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}

// Original tables are retained as a recovery copy; the marker commits with all copies.
export async function migrateIndependentRecords(db:D1Database,user:string){
 if(await db.prepare("SELECT id FROM hub_imports WHERE user_id=? AND request_id='migration:independent:v1'").bind(user).first())return;
 const journals=await db.prepare('SELECT * FROM journal_entries WHERE user_id=?').bind(user).all<{id:string;type:string;title:string;content:string;recorded_at:string;created_at:string;updated_at:string}>();
 const checkins=await db.prepare('SELECT * FROM checkins WHERE user_id=?').bind(user).all<{id:string;type:string;note:string;created_at:string}>();
 const planning=await db.prepare('SELECT * FROM planning_records_v2 WHERE user_id=?').bind(user).all<{id:string;type_key:string;title:string;content:string;feeling:string;recorded_at:string;created_at:string;updated_at:string}>();
 const outputs=await db.prepare('SELECT * FROM task_outputs WHERE user_id=?').bind(user).all<{id:string;task_type:string;title:string;content:string;feeling:string;created_at:string}>();
 const rows=[...journals.results.map(r=>({source:'journal',id:r.id,kind:r.id==='f84de8fc-0039-4481-8598-5383226b4fc2'?'xhs_copy':r.type==='reading'?'reading_note':['diary','inspiration','reading_note'].includes(r.type)?r.type:r.type==='english_diary'?'diary':'',title:r.title,content:r.content,date:r.recorded_at,created:r.created_at})),...checkins.results.map(r=>({source:'checkin',id:r.id,kind:r.type==='reading'?'reading_note':r.type==='english'?'diary':'',title:r.type==='reading'?(r.note.split('\n')[0]||'读书笔记'):'英语学习笔记',content:r.note,date:r.created_at.slice(0,10),created:r.created_at})),...planning.results.map(r=>({source:'planning_record',id:r.id,kind:r.id==='10b6db11-9880-49f2-96fc-14a8f86c80b4'?'diary':r.type_key==='reading'?'reading_note':r.type_key==='english_diary'?'diary':'',title:r.title,content:r.content+(r.feeling?'\n\n'+r.feeling:''),date:r.recorded_at,created:r.created_at})),...outputs.results.map(r=>({source:'task_output',id:r.id,kind:r.task_type==='reading'?'reading_note':'',title:r.title,content:r.content,date:r.created_at.slice(0,10),created:r.created_at}))];
 const unknown=rows.filter(r=>!r.kind);if(unknown.length)throw new Error('存在待归类历史记录，请先核对迁移清单');
 const statements:D1PreparedStatement[]=[];const now=new Date().toISOString();
 for(const r of rows){const id=`legacy:${r.source}:${r.id}`;statements.push(db.prepare('INSERT OR IGNORE INTO hub_documents (id,user_id,kind,title,content,date,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,user,r.kind,r.title,r.content,r.date,r.kind.endsWith('_copy')?'final':'draft',r.created,now));
 const images=r.source==='journal'?await db.prepare('SELECT id,object_key,content_type FROM journal_images WHERE user_id=? AND journal_id=?').bind(user,r.id).all<{id:string;object_key:string;content_type:string}>():await db.prepare('SELECT id,object_key,content_type FROM record_images WHERE user_id=? AND record_type=? AND record_id=?').bind(user,r.source,r.id).all<{id:string;object_key:string;content_type:string}>();
 for(const image of images.results)statements.push(db.prepare('INSERT OR IGNORE INTO hub_images(id,user_id,document_id,object_key,content_type) VALUES(?,?,?,?,?)').bind(`legacy:${image.id}`,user,id,image.object_key,image.content_type));}
 statements.push(db.prepare('INSERT OR IGNORE INTO hub_imports(id,user_id,request_id,result,created_at) VALUES(?,?,?,?,?)').bind(`migration:${user}`,user,'migration:independent:v1',JSON.stringify({count:rows.length,sources:rows.map(r=>({source:r.source,id:r.id,kind:r.kind}))}),now));
 await db.batch(statements);
}

export async function hubSnapshot(db:D1Database,user:string){
 const [documents,images,words,lists,reviews]=await Promise.all([
 db.prepare('SELECT * FROM hub_documents WHERE user_id=? AND deleted=0 ORDER BY date DESC,updated_at DESC').bind(user).all<HubDoc>(),
 db.prepare('SELECT id,document_id FROM hub_images WHERE user_id=?').bind(user).all(),
 db.prepare('SELECT * FROM hub_words WHERE user_id=?').bind(user).all<Word>(),
 db.prepare('SELECT * FROM hub_word_lists WHERE user_id=? ORDER BY date DESC,created_at DESC').bind(user).all<WordList>(),
 db.prepare('SELECT * FROM hub_reviews WHERE user_id=? ORDER BY created_at DESC').bind(user).all<Review>()]);
 return {documents:documents.results,images:images.results,words:wordStats(words.results,reviews.results),lists:lists.results,reviews:reviews.results};
}
