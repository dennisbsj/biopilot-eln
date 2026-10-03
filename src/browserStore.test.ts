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
    await expect(importBrowserBackup(JSON.stringify(payload))).rejects.toThrow(/conflict/i);
    expect((await listBrowser()).find(d=>d.id===original.id)).toBeTruthy();
  });
});
