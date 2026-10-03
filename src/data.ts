import * as api from "./api";
import * as browser from "./browserStore";
import type {Attachment,Doc,Version} from "./types";

export type Mode="local"|"server";

export async function detectMode():Promise<Mode>{
  // Browser storage is the default so ELN remains fully usable without a hosted database.
  // Server persistence is opt-in through VITE_STORAGE_MODE=server.
  if((import.meta.env.VITE_STORAGE_MODE as string|undefined)!=="server")return "local";
  if(!api.apiConfigured())return "local";
  try{const h=await api.health();return h.ok&&h.database?"server":"local"}catch{return "local"}
}

export async function migrateLocalIfNeeded(){
  if(!api.apiConfigured())return;
  const server=await api.listDocuments({deleted:"all"});
  const localDocs=await browser.listBrowser();
  if(server.length===0&&localDocs.length)await api.importDocuments(localDocs);
}

export async function list(mode:Mode){return mode==="server"?api.listDocuments({deleted:"all"}):browser.listBrowser()}
export async function create(mode:Mode){return mode==="server"?api.createDocument():browser.createBrowser()}
export async function save(mode:Mode,doc:Doc,changeType="save"){return mode==="server"?api.saveDocument(doc,changeType):browser.saveBrowser(doc,changeType)}
export async function softDelete(mode:Mode,id:string){return mode==="server"?api.softDelete(id):browser.softDeleteBrowser(id)}
export async function restore(mode:Mode,id:string){return mode==="server"?api.restoreDocument(id):browser.restoreBrowser(id)}
export async function permanentDelete(mode:Mode,id:string){if(mode==="server")return api.permanentDelete(id);return browser.permanentDeleteBrowser(id)}
export async function versions(mode:Mode,id:string):Promise<Version[]>{return mode==="server"?api.listVersions(id):browser.versionsBrowser(id)}
export async function sign(mode:Mode,id:string,signerName:string){return mode==="server"?api.signDocument(id,signerName):browser.signBrowser(id,signerName)}
export async function upload(mode:Mode,id:string,file:File):Promise<Attachment>{return mode==="server"?api.uploadAttachment(id,file):browser.addAttachmentBrowser(id,file)}
export async function deleteAttachment(mode:Mode,documentId:string,attachmentId:string){if(mode==="server")return api.deleteAttachment(documentId,attachmentId);return browser.removeAttachmentBrowser(documentId,attachmentId)}
export async function searchExperiments(mode:Mode,q:string,docs:Doc[]){
  // External API lookup remains available even when ELN documents are stored locally.
  if(api.apiConfigured()){
    try{const result=await api.searchExperiments(q);if(result.length)return result}catch{}
  }
  const s=q.trim().toLowerCase();
  return docs.filter(d=>d.experimentNumber&&(!s||d.experimentNumber.toLowerCase().includes(s)))
    .map(d=>({experimentNumber:d.experimentNumber,title:d.title}))
    .filter((v,i,a)=>a.findIndex(x=>x.experimentNumber===v.experimentNumber)===i).slice(0,10);
}
export const attachmentUrl=(a:Attachment)=>a.url||(a.dataUrl||"");
export async function exportBackup(){return browser.exportBrowserBackup()}
export async function importBackup(text:string){return browser.importBrowserBackup(text)}
export async function backupStatus(){return browser.backupStatus()}
