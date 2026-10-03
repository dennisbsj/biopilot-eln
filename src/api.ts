import type {Attachment,Doc,Version} from "./types";

const base=(import.meta.env.VITE_API_URL as string|undefined)?.replace(/\/$/,"")||"";

async function req<T>(path:string,init:RequestInit={}):Promise<T>{
  if(!base)throw new Error("API not configured");
  const headers=new Headers(init.headers||{});
  if(!(init.body instanceof FormData)&&!headers.has("Content-Type"))headers.set("Content-Type","application/json");
  const res=await fetch(base+path,{...init,headers});
  if(!res.ok){
    const body=await res.text().catch(()=>"");
    throw new Error(body||`API request failed: ${res.status}`);
  }
  if(res.status===204)return undefined as T;
  return res.json() as Promise<T>;
}

function absolutizeAttachment(a:Attachment):Attachment{
  return {...a,url:a.url&&a.url.startsWith("/")?base+a.url:a.url};
}
function absolutizeDoc(d:Doc):Doc{return {...d,attachments:(d.attachments||[]).map(absolutizeAttachment)}}

export const apiConfigured=()=>Boolean(base);
export const apiBase=()=>base;

export async function health(){return req<{ok:boolean;database:boolean}>("/health")}
export async function listDocuments(opts:{deleted?:"active"|"trash"|"all";q?:string;sort?:string;status?:string;year?:string;experiment?:string}={}){
  const p=new URLSearchParams();
  Object.entries(opts).forEach(([k,v])=>{if(v)p.set(k,String(v))});
  return (await req<Doc[]>(`/api/documents?${p.toString()}`)).map(absolutizeDoc);
}
export async function createDocument(){return absolutizeDoc(await req<Doc>("/api/documents",{method:"POST",body:"{}"}))}
export async function saveDocument(doc:Doc,changeType="save"){
  return absolutizeDoc(await req<Doc>(`/api/documents/${encodeURIComponent(doc.id)}`,{method:"PUT",body:JSON.stringify({...doc,changeType})}));
}
export async function softDelete(id:string){return absolutizeDoc(await req<Doc>(`/api/documents/${encodeURIComponent(id)}`,{method:"DELETE"}))}
export async function restoreDocument(id:string){return absolutizeDoc(await req<Doc>(`/api/documents/${encodeURIComponent(id)}/restore`,{method:"POST",body:"{}"}))}
export async function permanentDelete(id:string){return req<void>(`/api/documents/${encodeURIComponent(id)}/permanent`,{method:"DELETE"})}
export async function listVersions(id:string){return req<Version[]>(`/api/documents/${encodeURIComponent(id)}/versions`)}
export async function signDocument(id:string,signerName:string){return absolutizeDoc(await req<Doc>(`/api/documents/${encodeURIComponent(id)}/sign`,{method:"POST",body:JSON.stringify({signerName})}))}
export async function uploadAttachment(id:string,file:File){
  const data=new FormData();data.append("file",file);
  return absolutizeAttachment(await req<Attachment>(`/api/documents/${encodeURIComponent(id)}/attachments`,{method:"POST",body:data}));
}
export async function deleteAttachment(documentId:string,attachmentId:string){
  return req<void>(`/api/documents/${encodeURIComponent(documentId)}/attachments/${encodeURIComponent(attachmentId)}`,{method:"DELETE"});
}
export async function searchExperiments(q:string){
  return req<Array<{experimentNumber:string;title?:string}>>(`/api/experiments?q=${encodeURIComponent(q)}`);
}
export async function importDocuments(docs:Doc[]){return req<{imported:number}>("/api/import",{method:"POST",body:JSON.stringify({documents:docs})})}
