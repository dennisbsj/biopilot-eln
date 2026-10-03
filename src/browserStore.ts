import type {Attachment,Doc,DocStatus,Version} from "./types";
import * as legacy from "./localStore";

const DB_NAME="biopilot-eln-browser-v1";
const DB_VERSION=1;
const DOCS="docs";
const VERSIONS="versions";
const META="meta";
const MIGRATED_KEY="migrated-local-storage-v1";
const LAST_BACKUP_KEY="last-backup-at";
const MAX_ATTACHMENT_BYTES=15*1024*1024;

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

async function storedDoc(id:string):Promise<Doc|undefined>{
  const db=await openDb();
  const tx=db.transaction(DOCS,"readonly");
  const doc=await request(tx.objectStore(DOCS).get(id)) as Doc|undefined;
  db.close();
  return doc;
}

function immutableFingerprint(d:Doc){
  return JSON.stringify({
    title:d.title,
    experimentNumber:d.experimentNumber,
    contentHtml:d.contentHtml,
    status:d.status,
    signerName:d.signerName||null,
    signedAt:d.signedAt||null,
    attachments:d.attachments||[]
  });
}

function validateBackupDoc(raw:unknown):Doc{
  if(!raw||typeof raw!=="object")throw new Error("Backup contains an invalid ELN document");
  const d=raw as Partial<Doc>;
  if(typeof d.id!=="string"||!d.id)throw new Error("Backup document is missing an ID");
  if(typeof d.elnNumber!=="string"||!/^ELN-\d{5}-\d{4}$/.test(d.elnNumber))throw new Error("Backup contains an invalid ELN number");
  if(!Number.isInteger(d.sequence)||Number(d.sequence)<1)throw new Error("Backup contains an invalid sequence number");
  if(!Number.isInteger(d.year)||Number(d.year)<2000||Number(d.year)>9999)throw new Error("Backup contains an invalid year");
  if(typeof d.title!=="string"||typeof d.experimentNumber!=="string"||typeof d.contentHtml!=="string")throw new Error("Backup contains invalid document fields");
  if(!["draft","final","signed"].includes(String(d.status)))throw new Error("Backup contains an invalid document status");
  if(typeof d.createdAt!=="string"||typeof d.updatedAt!=="string")throw new Error("Backup contains invalid timestamps");
  const attachments=Array.isArray(d.attachments)?d.attachments:[];
  for(const a of attachments){
    if(!a||typeof a!=="object"||typeof a.id!=="string"||typeof a.fileName!=="string")throw new Error("Backup contains an invalid attachment");
    if(Number(a.sizeBytes)>MAX_ATTACHMENT_BYTES)throw new Error("Backup contains an attachment larger than 15 MB");
    if(a.dataUrl&&typeof a.dataUrl!=="string")throw new Error("Backup contains an invalid attachment payload");
    if(typeof a.dataUrl==="string"&&a.dataUrl.length>MAX_ATTACHMENT_BYTES*1.5)throw new Error("Backup attachment payload is too large");
  }
  return {...d,attachments} as Doc;
}

function validateBackupVersion(raw:unknown,documentIds:Set<string>):Version{
  if(!raw||typeof raw!=="object")throw new Error("Backup contains an invalid version");
  const v=raw as Partial<Version>;
  if((typeof v.id!=="string"&&typeof v.id!=="number")||typeof v.documentId!=="string"||!documentIds.has(v.documentId))throw new Error("Backup contains an orphaned version");
  if(!Number.isInteger(v.versionNo)||Number(v.versionNo)<1)throw new Error("Backup contains an invalid version number");
  if(typeof v.title!=="string"||typeof v.experimentNumber!=="string"||typeof v.contentHtml!=="string"||typeof v.changedAt!=="string"||typeof v.changeType!=="string")throw new Error("Backup contains invalid version fields");
  if(!["draft","final","signed"].includes(String(v.status)))throw new Error("Backup contains an invalid version status");
  return v as Version;
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
  const db=await openDb();
  const tx=db.transaction([DOCS,META],"readwrite");
  const docsRequest=request(tx.objectStore(DOCS).getAll()) as Promise<Doc[]>;
  const sequenceRequest=request(tx.objectStore(META).get(`seq-${year}`)) as Promise<Meta|undefined>;
  const [docs,storedRow]=await Promise.all([docsRequest,sequenceRequest]);
  const maxDoc=docs.filter(d=>d.year===year).reduce((m,d)=>Math.max(m,d.sequence||0),0);
  const stored=Number(storedRow?.value||0);
  const sequence=Math.max(maxDoc,stored)+1;
  tx.objectStore(META).put({key:`seq-${year}`,value:sequence} satisfies Meta);
  await done(tx);db.close();
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
  const existing=await storedDoc(doc.id);
  if(existing&&existing.status!=="draft"){
    const isSign=changeType==="sign"&&existing.status==="final"&&doc.status==="signed";
    if(!isSign&&immutableFingerprint(existing)!==immutableFingerprint(doc)){
      throw new Error("Final and signed ELNs are immutable");
    }
  }
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
  if(file.size>MAX_ATTACHMENT_BYTES)throw new Error("Attachment is too large (max 15 MB)");
  const docs=await listBrowser();const found=docs.find(d=>d.id===documentId);if(!found)throw new Error("Save the document before attaching files.");
  if(found.status!=="draft")throw new Error("Attachments can only be changed while the ELN is Draft");
  const a:Attachment={id:crypto.randomUUID(),documentId,fileName:file.name,mimeType:file.type||"application/octet-stream",sizeBytes:file.size,createdAt:iso(),dataUrl:await fileToDataUrl(file)};
  await saveBrowser({...found,attachments:[...(found.attachments||[]),a]},"attachment_add");return a;
}
export async function removeAttachmentBrowser(documentId:string,attachmentId:string){
  const docs=await listBrowser();const found=docs.find(d=>d.id===documentId);if(!found)return;
  if(found.status!=="draft")throw new Error("Attachments can only be changed while the ELN is Draft");
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
  const exportedAt=iso();
  const payload=JSON.stringify({format:"biopilot-eln-browser-backup",version:1,exportedAt,documents,versions,sequences},null,2);
  await metaSet(LAST_BACKUP_KEY,exportedAt);
  return payload;
}

export async function backupStatus(){
  const documents=await listBrowser();
  const lastBackupAt=await metaGet<string>(LAST_BACKUP_KEY)||null;
  const due=documents.length>0&&(!lastBackupAt||Date.now()-new Date(lastBackupAt).getTime()>7*24*60*60*1000);
  return {lastBackupAt,due,documentCount:documents.length};
}

export async function importBrowserBackup(text:string){
  let parsed:any;
  try{parsed=JSON.parse(text)}catch{throw new Error("Backup file is not valid JSON")}
  if(parsed?.format!=="biopilot-eln-browser-backup"||parsed?.version!==1||!Array.isArray(parsed.documents))throw new Error("This is not a valid BioPilot ELN backup");
  const docs=parsed.documents.map(validateBackupDoc);
  const documentIds=new Set<string>();
  for(const d of docs){
    if(documentIds.has(d.id))throw new Error(`Backup contains duplicate document ID: ${d.id}`);
    documentIds.add(d.id);
  }
  const versions=Array.isArray(parsed.versions)?parsed.versions.map((v:unknown)=>validateBackupVersion(v,documentIds)):[];
  const versionIds=new Set<string>();
  for(const v of versions){
    const key=String(v.id);
    if(versionIds.has(key))throw new Error(`Backup contains duplicate version ID: ${key}`);
    versionIds.add(key);
  }
  const existing=await listBrowser();
  const existingById=new Map(existing.map(d=>[d.id,d]));
  const numberOwners=new Map(existing.map(d=>[d.elnNumber,d.id]));
  for(const d of docs){
    const owner=numberOwners.get(d.elnNumber);
    if(owner&&owner!==d.id)throw new Error(`ELN number conflict: ${d.elnNumber}`);
    const current=existingById.get(d.id);
    if(current&&current.status!=="draft"&&immutableFingerprint(current)!==immutableFingerprint(d)){
      throw new Error(`Restore cannot modify immutable ELN: ${current.elnNumber}`);
    }
    numberOwners.set(d.elnNumber,d.id);
  }
  const db=await openDb();const tx=db.transaction([DOCS,VERSIONS,META],"readwrite");
  const ds=tx.objectStore(DOCS),vs=tx.objectStore(VERSIONS),ms=tx.objectStore(META);
  for(const d of docs)ds.put(d);
  for(const v of versions)vs.put(v);
  const perYear:Record<string,number>={};
  for(const d of [...existing,...docs])perYear[String(d.year)]=Math.max(perYear[String(d.year)]||0,d.sequence||0);
  const seqs=parsed.sequences&&typeof parsed.sequences==="object"?parsed.sequences:{};
  for(const [year,value] of Object.entries(seqs))perYear[year]=Math.max(perYear[year]||0,Number(value)||0);
  for(const [year,value] of Object.entries(perYear))ms.put({key:`seq-${year}`,value});
  ms.put({key:MIGRATED_KEY,value:true});
  if(typeof parsed.exportedAt==="string")ms.put({key:LAST_BACKUP_KEY,value:parsed.exportedAt});
  await done(tx);db.close();
}
