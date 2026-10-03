import type {Attachment,Doc,DocStatus,Version} from "./types";
import * as legacy from "./localStore";

const DB_NAME="biopilot-eln-browser-v1";
const DB_VERSION=1;
const DOCS="docs";
const VERSIONS="versions";
const META="meta";
const MIGRATED_KEY="migrated-local-storage-v1";

type Meta={key:string;value:unknown};

function iso(){return new Date().toISOString()}

function openDb():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(DOCS))db.createObjectStore(DOCS,{keyPath:"id"});
      if(!db.objectStoreNames.contains(VERSIONS)){
        const store=db.createObjectStore(VERSIONS,{keyPath:"id"});
        store.createIndex("documentId","documentId",{unique:false});
      }
      if(!db.objectStoreNames.contains(META))db.createObjectStore(META,{keyPath:"key"});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error("Could not open browser database"));
  });
}

function request<T>(req:IDBRequest<T>):Promise<T>{
  return new Promise((resolve,reject)=>{
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error("Browser database request failed"));
  });
}

function done(tx:IDBTransaction):Promise<void>{
  return new Promise((resolve,reject)=>{
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error("Browser database transaction failed"));
    tx.onabort=()=>reject(tx.error||new Error("Browser database transaction aborted"));
  });
}

async function metaGet<T>(key:string):Promise<T|undefined>{
  const db=await openDb();
  const tx=db.transaction(META,"readonly");
  const row=await request(tx.objectStore(META).get(key)) as Meta|undefined;
  db.close();
  return row?.value as T|undefined;
}

async function metaSet(key:string,value:unknown){
  const db=await openDb();
  const tx=db.transaction(META,"readwrite");
  tx.objectStore(META).put({key,value} satisfies Meta);
  await done(tx);db.close();
}

async function ensureMigrated(){
  if(await metaGet<boolean>(MIGRATED_KEY))return;
  const docs=legacy.loadAll();
  const versions=docs.flatMap(d=>legacy.versionsLocal(d.id));
  const db=await openDb();
  const tx=db.transaction([DOCS,VERSIONS,META],"readwrite");
  const ds=tx.objectStore(DOCS),vs=tx.objectStore(VERSIONS),ms=tx.objectStore(META);
  for(const d of docs)ds.put(d);
  for(const v of versions)vs.put(v);
  const perYear:Record<string,number>={};
  for(const d of docs)perYear[String(d.year)]=Math.max(perYear[String(d.year)]||0,d.sequence||0);
  for(const [year,value] of Object.entries(perYear))ms.put({key:`seq-${year}`,value});
  ms.put({key:MIGRATED_KEY,value:true});
  await done(tx);db.close();
}

export async function listBrowser():Promise<Doc[]>{
  await ensureMigrated();
  const db=await openDb();const tx=db.transaction(DOCS,"readonly");
  const docs=await request(tx.objectStore(DOCS).getAll()) as Doc[];
  db.close();return docs;
}

export async function createBrowser():Promise<Doc>{
  await ensureMigrated();
  const year=new Date().getFullYear();
  const docs=await listBrowser();
  const maxDoc=docs.filter(d=>d.year===year).reduce((m,d)=>Math.max(m,d.sequence||0),0);
  const stored=Number(await metaGet<number>(`seq-${year}`)||0);
  const sequence=Math.max(maxDoc,stored)+1;
  await metaSet(`seq-${year}`,sequence);
  const now=iso(),elnNumber=`ELN-${String(sequence).padStart(5,"0")}-${year}`;
  return {id:crypto.randomUUID(),elnNumber,sequence,year,title:elnNumber,experimentNumber:"",contentHtml:"",status:"draft",signerName:null,signedAt:null,deletedAt:null,createdAt:now,updatedAt:now,attachments:[]};
}

async function addVersion(doc:Doc,changeType:string){
  const existing=await versionsBrowser(doc.id);
  const latest=existing[0];
  if(changeType==="autosave"&&latest?.changeType==="autosave"&&Date.now()-new Date(latest.changedAt).getTime()<60_000){
    const updated={...latest,title:doc.title,experimentNumber:doc.experimentNumber,contentHtml:doc.contentHtml,status:doc.status,signerName:doc.signerName,signedAt:doc.signedAt,changedAt:iso()};
    const db=await openDb();const tx=db.transaction(VERSIONS,"readwrite");tx.objectStore(VERSIONS).put(updated);await done(tx);db.close();return;
  }
  const versionNo=existing.reduce((m,v)=>Math.max(m,v.versionNo),0)+1;
  const version:Version={id:crypto.randomUUID(),documentId:doc.id,versionNo,title:doc.title,experimentNumber:doc.experimentNumber,contentHtml:doc.contentHtml,status:doc.status,signerName:doc.signerName,signedAt:doc.signedAt,changedAt:iso(),changeType};
  const db=await openDb();const tx=db.transaction(VERSIONS,"readwrite");tx.objectStore(VERSIONS).put(version);await done(tx);db.close();
}

export async function saveBrowser(doc:Doc,changeType="save"):Promise<Doc>{
  await ensureMigrated();
  const updated={...doc,updatedAt:iso()};
  const db=await openDb();const tx=db.transaction(DOCS,"readwrite");tx.objectStore(DOCS).put(updated);await done(tx);db.close();
  await addVersion(updated,changeType);return updated;
}

export async function softDeleteBrowser(id:string):Promise<Doc>{
  const docs=await listBrowser();const found=docs.find(d=>d.id===id);if(!found)throw new Error("Document not found");
  return saveBrowser({...found,deletedAt:iso()},"soft_delete");
}
export async function restoreBrowser(id:string):Promise<Doc>{
  const docs=await listBrowser();const found=docs.find(d=>d.id===id);if(!found)throw new Error("Document not found");
  return saveBrowser({...found,deletedAt:null},"restore");
}
export async function permanentDeleteBrowser(id:string){
  await ensureMigrated();
  const db=await openDb();const tx=db.transaction([DOCS,VERSIONS],"readwrite");
  tx.objectStore(DOCS).delete(id);
  const index=tx.objectStore(VERSIONS).index("documentId");
  const cursor=index.openCursor(IDBKeyRange.only(id));
  cursor.onsuccess=()=>{const c=cursor.result;if(c){c.delete();c.continue()}};
  await done(tx);db.close();
}
export async function versionsBrowser(id:string):Promise<Version[]>{
  await ensureMigrated();
  const db=await openDb();const tx=db.transaction(VERSIONS,"readonly");
  const rows=await request(tx.objectStore(VERSIONS).index("documentId").getAll(IDBKeyRange.only(id))) as Version[];
  db.close();return rows.sort((a,b)=>b.versionNo-a.versionNo);
}

function fileToDataUrl(file:File){return new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||""));r.onerror=()=>reject(r.error);r.readAsDataURL(file)})}

export async function addAttachmentBrowser(documentId:string,file:File):Promise<Attachment>{
  if(file.size>15*1024*1024)throw new Error("Attachment is too large (max 15 MB)");
  const docs=await listBrowser();const found=docs.find(d=>d.id===documentId);if(!found)throw new Error("Save the document before attaching files.");
  const a:Attachment={id:crypto.randomUUID(),documentId,fileName:file.name,mimeType:file.type||"application/octet-stream",sizeBytes:file.size,createdAt:iso(),dataUrl:await fileToDataUrl(file)};
  await saveBrowser({...found,attachments:[...(found.attachments||[]),a]},"attachment_add");return a;
}
export async function removeAttachmentBrowser(documentId:string,attachmentId:string){
  const docs=await listBrowser();const found=docs.find(d=>d.id===documentId);if(!found)return;
  await saveBrowser({...found,attachments:(found.attachments||[]).filter(a=>a.id!==attachmentId)},"attachment_delete");
}
export async function signBrowser(id:string,signerName:string):Promise<Doc>{
  const docs=await listBrowser();const found=docs.find(d=>d.id===id);if(!found)throw new Error("Document not found");
  if(found.status!=="final")throw new Error("Only Final documents can be signed");
  return saveBrowser({...found,status:"signed" as DocStatus,signerName,signedAt:iso()},"sign");
}

export async function exportBrowserBackup():Promise<string>{
  const documents=await listBrowser();
  const versions=(await Promise.all(documents.map(d=>versionsBrowser(d.id)))).flat();
  const sequences:Record<string,number>={};
  for(const d of documents)sequences[String(d.year)]=Math.max(sequences[String(d.year)]||0,d.sequence||0);
  return JSON.stringify({format:"biopilot-eln-browser-backup",version:1,exportedAt:iso(),documents,versions,sequences},null,2);
}

export async function importBrowserBackup(text:string){
  const parsed=JSON.parse(text);
  if(parsed?.format!=="biopilot-eln-browser-backup"||!Array.isArray(parsed.documents))throw new Error("This is not a valid BioPilot ELN backup");
  const docs=parsed.documents as Doc[],versions=Array.isArray(parsed.versions)?parsed.versions as Version[]:[];
  const db=await openDb();const tx=db.transaction([DOCS,VERSIONS,META],"readwrite");
  const ds=tx.objectStore(DOCS),vs=tx.objectStore(VERSIONS),ms=tx.objectStore(META);
  for(const d of docs)ds.put(d);
  for(const v of versions)vs.put(v);
  const seqs=parsed.sequences&&typeof parsed.sequences==="object"?parsed.sequences:{};
  for(const [year,value] of Object.entries(seqs))ms.put({key:`seq-${year}`,value:Number(value)||0});
  ms.put({key:MIGRATED_KEY,value:true});
  await done(tx);db.close();
}
