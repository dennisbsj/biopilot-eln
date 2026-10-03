import type {Attachment,Doc,DocStatus,Version} from "./types";

const DOCS_KEY="biopilot-eln-docs-v2";
const LEGACY_DOCS_KEY="biopilot-eln-docs-v1";
const SEQ_KEY="biopilot-eln-seq-v2";
const LEGACY_SEQ_KEY="biopilot-eln-seq-v1";
const VERSIONS_KEY="biopilot-eln-versions-v1";

function iso(){return new Date().toISOString()}
function read<T>(key:string,fallback:T):T{
  try{return JSON.parse(localStorage.getItem(key)||"") as T}catch{return fallback}
}
function write(key:string,value:unknown){localStorage.setItem(key,JSON.stringify(value))}

export function normalizeDoc(d:any):Doc{
  const now=iso();
  return {
    id:String(d?.id||crypto.randomUUID()),
    elnNumber:String(d?.elnNumber||""),
    sequence:Number(d?.sequence||0),
    year:Number(d?.year||new Date().getFullYear()),
    title:String(d?.title||d?.elnNumber||""),
    experimentNumber:String(d?.experimentNumber||""),
    contentHtml:String(d?.contentHtml||""),
    status:(["draft","final","signed"].includes(d?.status)?d.status:"draft") as DocStatus,
    signerName:d?.signerName||null,
    signedAt:d?.signedAt||null,
    deletedAt:d?.deletedAt||null,
    createdAt:String(d?.createdAt||now),
    updatedAt:String(d?.updatedAt||d?.createdAt||now),
    attachments:Array.isArray(d?.attachments)?d.attachments:[],
  };
}

export function loadAll():Doc[]{
  const current=read<any[]>(DOCS_KEY,[]);
  if(current.length)return current.map(normalizeDoc).filter(d=>d.elnNumber);
  const legacy=read<any[]>(LEGACY_DOCS_KEY,[]);
  const migrated=legacy.map(normalizeDoc).filter(d=>d.elnNumber);
  if(migrated.length)write(DOCS_KEY,migrated);
  return migrated;
}

function saveAll(docs:Doc[]){write(DOCS_KEY,docs)}

function nextNumber(){
  const year=new Date().getFullYear();
  const current=read<Record<string,number>>(SEQ_KEY,{});
  const legacy=read<Record<string,number>>(LEGACY_SEQ_KEY,{});
  const docs=loadAll().filter(d=>d.year===year);
  const maxDoc=docs.reduce((m,d)=>Math.max(m,d.sequence||0),0);
  const seq=Math.max(current[String(year)]||0,legacy[String(year)]||0,maxDoc)+1;
  current[String(year)]=seq;
  write(SEQ_KEY,current);
  return {year,sequence:seq,elnNumber:`ELN-${String(seq).padStart(5,"0")}-${year}`};
}

export function createLocal():Doc{
  const n=nextNumber(),now=iso();
  return {id:crypto.randomUUID(),...n,title:n.elnNumber,experimentNumber:"",contentHtml:"",status:"draft",signerName:null,signedAt:null,deletedAt:null,createdAt:now,updatedAt:now,attachments:[]};
}

export function listLocal():Doc[]{return loadAll()}

function addVersion(doc:Doc,changeType:string){
  const versions=read<Version[]>(VERSIONS_KEY,[]);
  const versionNo=versions.filter(v=>v.documentId===doc.id).reduce((m,v)=>Math.max(m,v.versionNo),0)+1;
  versions.unshift({
    id:crypto.randomUUID(),documentId:doc.id,versionNo,title:doc.title,experimentNumber:doc.experimentNumber,
    contentHtml:doc.contentHtml,status:doc.status,signerName:doc.signerName,signedAt:doc.signedAt,
    changedAt:iso(),changeType
  });
  write(VERSIONS_KEY,versions);
}

export function saveLocal(doc:Doc,changeType="save"):Doc{
  const updated={...normalizeDoc(doc),updatedAt:iso()};
  const docs=loadAll();
  const next=docs.some(d=>d.id===updated.id)?docs.map(d=>d.id===updated.id?updated:d):[updated,...docs];
  saveAll(next);
  addVersion(updated,changeType);
  return updated;
}

export function softDeleteLocal(id:string):Doc{
  const docs=loadAll();
  const found=docs.find(d=>d.id===id);if(!found)throw new Error("Document not found");
  const updated={...found,deletedAt:iso(),updatedAt:iso()};
  saveAll(docs.map(d=>d.id===id?updated:d));addVersion(updated,"soft_delete");return updated;
}
export function restoreLocal(id:string):Doc{
  const docs=loadAll();
  const found=docs.find(d=>d.id===id);if(!found)throw new Error("Document not found");
  const updated={...found,deletedAt:null,updatedAt:iso()};
  saveAll(docs.map(d=>d.id===id?updated:d));addVersion(updated,"restore");return updated;
}
export function permanentDeleteLocal(id:string){saveAll(loadAll().filter(d=>d.id!==id))}
export function versionsLocal(id:string){return read<Version[]>(VERSIONS_KEY,[]).filter(v=>v.documentId===id).sort((a,b)=>b.versionNo-a.versionNo)}

function fileToDataUrl(file:File){return new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||""));r.onerror=()=>reject(r.error);r.readAsDataURL(file)})}
export async function addAttachmentLocal(documentId:string,file:File):Promise<Attachment>{
  const docs=loadAll();const found=docs.find(d=>d.id===documentId);if(!found)throw new Error("Save the document before attaching files.");
  const a:Attachment={id:crypto.randomUUID(),documentId,fileName:file.name,mimeType:file.type||"application/octet-stream",sizeBytes:file.size,createdAt:iso(),dataUrl:await fileToDataUrl(file)};
  const updated={...found,attachments:[...(found.attachments||[]),a],updatedAt:iso()};
  saveAll(docs.map(d=>d.id===documentId?updated:d));addVersion(updated,"attachment_add");return a;
}
export function removeAttachmentLocal(documentId:string,attachmentId:string){
  const docs=loadAll();const found=docs.find(d=>d.id===documentId);if(!found)return;
  const updated={...found,attachments:(found.attachments||[]).filter(a=>a.id!==attachmentId),updatedAt:iso()};
  saveAll(docs.map(d=>d.id===documentId?updated:d));addVersion(updated,"attachment_delete");
}
export function signLocal(id:string,signerName:string):Doc{
  const docs=loadAll();const found=docs.find(d=>d.id===id);if(!found)throw new Error("Document not found");
  const updated={...found,status:"signed" as DocStatus,signerName,signedAt:iso(),updatedAt:iso()};
  saveAll(docs.map(d=>d.id===id?updated:d));addVersion(updated,"sign");return updated;
}
