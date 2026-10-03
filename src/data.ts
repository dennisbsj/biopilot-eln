import * as api from "./api";
import * as local from "./localStore";
import type {Attachment,Doc,Version} from "./types";

export type Mode="local"|"server";

export async function detectMode():Promise<Mode>{
  if(!api.apiConfigured())return "local";
  try{const h=await api.health();return h.ok&&h.database?"server":"local"}catch{return "local"}
}

export async function migrateLocalIfNeeded(){
  const server=await api.listDocuments({deleted:"all"});
  const localDocs=local.loadAll();
  if(server.length===0&&localDocs.length){await api.importDocuments(localDocs)}
}

export async function list(mode:Mode){return mode==="server"?api.listDocuments({deleted:"all"}):local.listLocal()}
export async function create(mode:Mode){return mode==="server"?api.createDocument():local.createLocal()}
export async function save(mode:Mode,doc:Doc,changeType="save"){return mode==="server"?api.saveDocument(doc,changeType):local.saveLocal(doc,changeType)}
export async function softDelete(mode:Mode,id:string){return mode==="server"?api.softDelete(id):local.softDeleteLocal(id)}
export async function restore(mode:Mode,id:string){return mode==="server"?api.restoreDocument(id):local.restoreLocal(id)}
export async function permanentDelete(mode:Mode,id:string){if(mode==="server")return api.permanentDelete(id);local.permanentDeleteLocal(id)}
export async function versions(mode:Mode,id:string):Promise<Version[]>{return mode==="server"?api.listVersions(id):local.versionsLocal(id)}
export async function sign(mode:Mode,id:string,signerName:string){return mode==="server"?api.signDocument(id,signerName):local.signLocal(id,signerName)}
export async function upload(mode:Mode,id:string,file:File):Promise<Attachment>{return mode==="server"?api.uploadAttachment(id,file):local.addAttachmentLocal(id,file)}
export async function deleteAttachment(mode:Mode,documentId:string,attachmentId:string){if(mode==="server")return api.deleteAttachment(documentId,attachmentId);local.removeAttachmentLocal(documentId,attachmentId)}
export async function searchExperiments(mode:Mode,q:string,docs:Doc[]){
  if(mode==="server"){
    try{return await api.searchExperiments(q)}catch{}
  }
  const s=q.trim().toLowerCase();
  return docs.filter(d=>d.experimentNumber&&(!s||d.experimentNumber.toLowerCase().includes(s)))
    .map(d=>({experimentNumber:d.experimentNumber,title:d.title}))
    .filter((v,i,a)=>a.findIndex(x=>x.experimentNumber===v.experimentNumber)===i).slice(0,10);
}
export const attachmentUrl=(a:Attachment)=>a.url||(a.dataUrl||"");
