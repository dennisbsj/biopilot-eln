import "./test/setup";
import {beforeEach,describe,expect,it} from "vitest";
import {
  backupStatus,createBrowser,exportBrowserBackup,importBrowserBackup,listBrowser,
  permanentDeleteBrowser,saveBrowser,signBrowser,softDeleteBrowser,versionsBrowser
} from "./browserStore";

const DB_NAME="biopilot-eln-browser-v1";

async function clearDb(){
  await new Promise<void>((resolve,reject)=>{
    const req=indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess=()=>resolve();
    req.onerror=()=>reject(req.error);
    req.onblocked=()=>reject(new Error("IndexedDB reset was blocked"));
  });
  localStorage.clear();
}

beforeEach(async()=>{await clearDb()});

describe("browser ELN storage",()=>{
  it("allocates sequential ELN numbers and persists documents",async()=>{
    const first=await createBrowser();
    expect(first.sequence).toBe(1);
    expect(first.elnNumber).toMatch(/^ELN-00001-\d{4}$/);
    await saveBrowser({...first,title:"First ELN"},"manual_save");

    const second=await createBrowser();
    expect(second.sequence).toBe(2);
    expect(second.elnNumber).toMatch(/^ELN-00002-\d{4}$/);

    const docs=await listBrowser();
    expect(docs).toHaveLength(1);
    expect(docs[0].title).toBe("First ELN");
  });

  it("allocates unique sequences across concurrent browser tabs",async()=>{
    const created=await Promise.all(Array.from({length:10},()=>createBrowser()));
    const sequences=created.map(d=>d.sequence).sort((a,b)=>a-b);
    expect(sequences).toEqual([1,2,3,4,5,6,7,8,9,10]);
    expect(new Set(created.map(d=>d.elnNumber)).size).toBe(10);
  });

  it("coalesces rapid autosaves into one version",async()=>{
    const doc=await createBrowser();
    const saved=await saveBrowser(doc,"manual_save");
    await saveBrowser({...saved,contentHtml:"<p>A</p>"},"autosave");
    await saveBrowser({...saved,contentHtml:"<p>B</p>"},"autosave");

    const versions=await versionsBrowser(doc.id);
    expect(versions).toHaveLength(2);
    expect(versions[0].changeType).toBe("autosave");
    expect(versions[0].contentHtml).toBe("<p>B</p>");
  });

  it("keeps version numbers sequential across serial atomic saves",async()=>{
    let current=await saveBrowser(await createBrowser(),"manual_save");
    for(let i=0;i<5;i++)current=await saveBrowser({...current,contentHtml:`<p>${i}</p>`},"manual_save");
    const versions=await versionsBrowser(current.id);
    expect(versions).toHaveLength(6);
    expect(versions.map(v=>v.versionNo).sort((a,b)=>a-b)).toEqual([1,2,3,4,5,6]);
  });

  it("rejects stale writes from another browser tab",async()=>{
    const initial=await saveBrowser(await createBrowser(),"manual_save");
    const tabA={...initial,contentHtml:"<p>Tab A</p>"};
    const tabB={...initial,contentHtml:"<p>Tab B</p>"};
    const savedA=await saveBrowser(tabA,"manual_save");
    await expect(saveBrowser(tabB,"manual_save")).rejects.toThrow(/another browser tab/i);
    const stored=(await listBrowser()).find(d=>d.id===initial.id);
    expect(stored?.contentHtml).toBe("<p>Tab A</p>");
    expect(stored?.updatedAt).toBe(savedA.updatedAt);
    expect(await versionsBrowser(initial.id)).toHaveLength(2);
  });

  it("locks final documents against content changes but still permits trash operations",async()=>{
    const draft=await saveBrowser(await createBrowser(),"manual_save");
    const final=await saveBrowser({...draft,status:"final"},"finalize");

    await expect(saveBrowser({...final,title:"Changed"},"manual_save")).rejects.toThrow(/immutable/i);
    const deleted=await softDeleteBrowser(final.id);
    expect(deleted.deletedAt).toBeTruthy();
    expect(deleted.status).toBe("final");
  });

  it("only signs Final documents and keeps Signed content immutable",async()=>{
    const draft=await saveBrowser(await createBrowser(),"manual_save");
    await expect(signBrowser(draft.id,"Tester")).rejects.toThrow(/Final/);

    const final=await saveBrowser({...draft,status:"final"},"finalize");
    const signed=await signBrowser(final.id,"Tester");
    expect(signed.status).toBe("signed");
    expect(signed.signerName).toBe("Tester");
    expect(signed.signedAt).toBeTruthy();
    await expect(saveBrowser({...signed,contentHtml:"tampered"},"manual_save")).rejects.toThrow(/immutable/i);
  });

  it("exports and restores a validated backup",async()=>{
    const doc=await saveBrowser({...await createBrowser(),title:"Back me up"},"manual_save");
    const backup=await exportBrowserBackup();
    const status=await backupStatus();
    expect(status.due).toBe(false);
    expect(status.lastBackupAt).toBeTruthy();

    await permanentDeleteBrowser(doc.id);
    expect(await listBrowser()).toHaveLength(0);

    await importBrowserBackup(backup);
    const restored=await listBrowser();
    expect(restored).toHaveLength(1);
    expect(restored[0].title).toBe("Back me up");
  });

  it("rejects malformed backups and ELN-number conflicts",async()=>{
    await expect(importBrowserBackup("not-json")).rejects.toThrow(/JSON/);

    const original=await saveBrowser(await createBrowser(),"manual_save");
    const payload=JSON.parse(await exportBrowserBackup());
    payload.documents[0].id=crypto.randomUUID();
    payload.versions=[];
    await expect(importBrowserBackup(JSON.stringify(payload))).rejects.toThrow(/conflict/i);
    expect((await listBrowser()).find(d=>d.id===original.id)).toBeTruthy();
  });
  it("does not let restore alter a Final or Signed ELN",async()=>{
    const draft=await saveBrowser({...await createBrowser(),contentHtml:"<p>Original</p>"},"manual_save");
    const final=await saveBrowser({...draft,status:"final"},"finalize");
    const backup=JSON.parse(await exportBrowserBackup());
    backup.documents[0].contentHtml="<p>Tampered</p>";
    backup.versions=[];
    await expect(importBrowserBackup(JSON.stringify(backup))).rejects.toThrow(/immutable/i);
    expect((await listBrowser()).find(d=>d.id===final.id)?.contentHtml).toBe("<p>Original</p>");
  });

  it("rejects duplicate document and version identifiers in backups",async()=>{
    const doc=await saveBrowser(await createBrowser(),"manual_save");
    const payload=JSON.parse(await exportBrowserBackup());
    payload.documents.push({...payload.documents[0]});
    await expect(importBrowserBackup(JSON.stringify(payload))).rejects.toThrow(/duplicate document ID/i);

    const valid=JSON.parse(await exportBrowserBackup());
    expect(valid.versions.length).toBeGreaterThan(0);
    valid.versions.push({...valid.versions[0]});
    await expect(importBrowserBackup(JSON.stringify(valid))).rejects.toThrow(/duplicate version ID/i);
    expect((await listBrowser()).some(d=>d.id===doc.id)).toBe(true);
  });

});
