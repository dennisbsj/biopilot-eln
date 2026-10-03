import {useEffect,useMemo,useRef,useState} from "react";
import type {MouseEvent as ReactMouseEvent} from "react";
import {
  AlignCenter,AlignLeft,AlignRight,ArrowLeft,Bold,Check,CheckSquare,Download,FilePlus2,
  FolderOpen,Highlighter,History,Italic,Link,List,ListOrdered,Microscope,Minus,
  Paperclip,Printer,Quote,Redo2,RemoveFormatting,RotateCcw,Save,ScrollText,Search,
  Subscript,Superscript,Table2,Trash2,Underline,Undo2,Upload,X
} from "lucide-react";
import type {Attachment,Doc,Version} from "./types";
import * as data from "./data";
import type {Mode} from "./data";

type Screen="browse"|"editor";
type PendingDelete={doc:Doc;permanent:boolean}|null;

function placeholderDoc():Doc{
  const now=new Date().toISOString();
  return {id:crypto.randomUUID(),elnNumber:"Loading…",sequence:0,year:new Date().getFullYear(),title:"Loading…",experimentNumber:"",contentHtml:"",status:"draft",signerName:null,signedAt:null,deletedAt:null,createdAt:now,updatedAt:now,attachments:[]};
}

function fmt(v:string|null|undefined){
  if(!v)return "—";
  return new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(v));
}
function safeLink(v:string){
  const s=v.trim();if(!s)return null;
  if(/^mailto:/i.test(s))return s;
  const c=/^https?:\/\//i.test(s)?s:`https://${s}`;
  try{const u=new URL(c);return ["http:","https:"].includes(u.protocol)?u.toString():null}catch{return null}
}
function bytes(v:number){
  if(v<1024)return `${v} B`;
  if(v<1024*1024)return `${(v/1024).toFixed(1)} KB`;
  return `${(v/(1024*1024)).toFixed(1)} MB`;
}
function Logo(){return <span className="logo" aria-hidden="true"><i/><b/><em/><strong/></span>}
function Header({editor}:{editor:()=>void}){
  return <header className="appHeader">
    <button className="brand" type="button" onClick={editor}><Logo/><span>BioPilot</span><small>ELN</small></button>
    <div className="moduleBadge"><ScrollText size={15}/> Electronic Lab Notebook</div>
  </header>;
}

function Browser({
  docs,back,open,remove,restore,permanent
}:{
  docs:Doc[];back:()=>void;open:(d:Doc)=>void;remove:(d:Doc)=>void;
  restore:(d:Doc)=>void;permanent:(d:Doc)=>void
}){
  const[q,setQ]=useState("");
  const[sort,setSort]=useState("updated_desc");
  const[status,setStatus]=useState("");
  const[year,setYear]=useState("");
  const[experiment,setExperiment]=useState("");
  const[trash,setTrash]=useState(false);

  const years=useMemo(()=>Array.from(new Set(docs.map(d=>String(d.year)))).sort().reverse(),[docs]);
  const filtered=useMemo(()=>{
    const s=q.trim().toLowerCase(),exp=experiment.trim().toLowerCase();
    const rows=docs.filter(d=>trash?Boolean(d.deletedAt):!d.deletedAt).filter(d=>{
      if(s&&![d.elnNumber,d.title,d.experimentNumber].some(v=>v.toLowerCase().includes(s)))return false;
      if(status&&d.status!==status)return false;
      if(year&&String(d.year)!==year)return false;
      if(exp&&!d.experimentNumber.toLowerCase().includes(exp))return false;
      return true;
    });
    return [...rows].sort((a,b)=>{
      if(sort==="updated_asc")return new Date(a.updatedAt).getTime()-new Date(b.updatedAt).getTime();
      if(sort==="number_asc")return a.year-b.year||a.sequence-b.sequence;
      if(sort==="number_desc")return b.year-a.year||b.sequence-a.sequence;
      if(sort==="title_asc")return a.title.localeCompare(b.title);
      return new Date(b.updatedAt).getTime()-new Date(a.updatedAt).getTime();
    });
  },[docs,q,sort,status,year,experiment,trash]);

  return <main className="browser">
    <div className="heading">
      <button className="back" type="button" onClick={back}><ArrowLeft size={18}/> Back</button>
      <div><h2>{trash?"Trash":"Browse ELN"}</h2><p>{trash?"Restore a deleted ELN or remove it permanently.":"Search, filter and open ELN documents."}</p></div>
      <button className={trash?"trashToggle active":"trashToggle"} type="button" onClick={()=>setTrash(v=>!v)}>{trash?<><FolderOpen size={15}/> Active ELNs</>:<><Trash2 size={15}/> Trash</>}</button>
    </div>
    <div className="browseFilters">
      <label className="search"><Search size={18}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search number, name or experiment"/>{q&&<button type="button" onClick={()=>setQ("")}><X size={15}/></button>}</label>
      <select value={sort} onChange={e=>setSort(e.target.value)} aria-label="Sort documents">
        <option value="updated_desc">Latest edited</option><option value="updated_asc">Oldest edited</option>
        <option value="number_desc">ELN number ↓</option><option value="number_asc">ELN number ↑</option><option value="title_asc">Name A–Z</option>
      </select>
      <select value={status} onChange={e=>setStatus(e.target.value)} aria-label="Filter status">
        <option value="">All statuses</option><option value="draft">Draft</option><option value="final">Final</option><option value="signed">Signed</option>
      </select>
      <select value={year} onChange={e=>setYear(e.target.value)} aria-label="Filter year"><option value="">All years</option>{years.map(y=><option key={y}>{y}</option>)}</select>
      <input className="experimentFilter" value={experiment} onChange={e=>setExperiment(e.target.value)} placeholder="Experiment"/>
    </div>
    {filtered.length===0?<div className="empty"><FolderOpen/><b>No ELN documents found</b><small>{trash?"Trash is empty.":"Try changing the filters or create a new ELN."}</small></div>:
    <div className="tableWrap"><table><thead><tr><th>ELN number</th><th>Document name</th><th>Experiment</th><th>Status</th><th>Last edited</th><th/></tr></thead><tbody>
      {filtered.map(d=><tr className="browseRow" key={d.id} onClick={()=>open(d)} tabIndex={0} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open(d)}}}>
        <td className="num"><span className="numInner"><ScrollText size={16}/><span>{d.elnNumber}</span></span></td>
        <td>{d.title||d.elnNumber}</td>
        <td>{d.experimentNumber?<span className="chip"><Microscope size={14}/>{d.experimentNumber}</span>:<i>—</i>}</td>
        <td><span className={`statusChip ${d.status}`}>{d.status}</span></td><td>{fmt(d.updatedAt)}</td>
        <td className="action">{trash?
          <span className="rowActions"><button type="button" onClick={e=>{e.stopPropagation();restore(d)}}><RotateCcw size={15}/> Restore</button><button type="button" className="delete" onClick={e=>{e.stopPropagation();permanent(d)}}><Trash2 size={15}/> Delete</button></span>:
          <button type="button" className="delete" onClick={e=>{e.stopPropagation();remove(d)}}><Trash2 size={15}/> Delete</button>}
        </td>
      </tr>)}
    </tbody></table></div>}
  </main>;
}

function Toolbar({disabled}:{disabled:boolean}){
  const cmd=(name:string,value?:string)=>{if(!disabled)document.execCommand(name,false,value)};
  const keep=(e:ReactMouseEvent)=>e.preventDefault();
  const addLink=()=>{if(disabled)return;const r=prompt("Link URL");if(!r)return;const u=safeLink(r);if(!u)return alert("Please enter a valid web or email link.");cmd("createLink",u)};
  const table=()=>cmd("insertHTML",'<table><tbody><tr><td>Cell</td><td>Cell</td></tr><tr><td>Cell</td><td>Cell</td></tr></tbody></table><p><br></p>');
  return <div className="toolbar">
    <select disabled={disabled} defaultValue="p" onChange={e=>cmd("formatBlock",e.target.value)}><option value="p">Paragraph</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option></select><i/>
    <button disabled={disabled} title="Bold" onMouseDown={keep} onClick={()=>cmd("bold")}><Bold size={17}/></button>
    <button disabled={disabled} title="Italic" onMouseDown={keep} onClick={()=>cmd("italic")}><Italic size={17}/></button>
    <button disabled={disabled} title="Underline" onMouseDown={keep} onClick={()=>cmd("underline")}><Underline size={17}/></button>
    <button disabled={disabled} title="Highlight" onMouseDown={keep} onClick={()=>cmd("hiliteColor","#fff2a8")}><Highlighter size={17}/></button><i/>
    <button disabled={disabled} title="Bulleted list" onMouseDown={keep} onClick={()=>cmd("insertUnorderedList")}><List size={17}/></button>
    <button disabled={disabled} title="Numbered list" onMouseDown={keep} onClick={()=>cmd("insertOrderedList")}><ListOrdered size={17}/></button>
    <button disabled={disabled} title="Checklist" onMouseDown={keep} onClick={()=>cmd("insertHTML","<p>☐&nbsp;</p>")}><CheckSquare size={17}/></button>
    <button disabled={disabled} title="Quote" onMouseDown={keep} onClick={()=>cmd("formatBlock","blockquote")}><Quote size={17}/></button><i/>
    <button disabled={disabled} title="Table" onMouseDown={keep} onClick={table}><Table2 size={17}/></button>
    <button disabled={disabled} title="Horizontal line" onMouseDown={keep} onClick={()=>cmd("insertHorizontalRule")}><Minus size={17}/></button>
    <button disabled={disabled} title="Superscript" onMouseDown={keep} onClick={()=>cmd("superscript")}><Superscript size={17}/></button>
    <button disabled={disabled} title="Subscript" onMouseDown={keep} onClick={()=>cmd("subscript")}><Subscript size={17}/></button><i/>
    <button disabled={disabled} title="Align left" onMouseDown={keep} onClick={()=>cmd("justifyLeft")}><AlignLeft size={17}/></button>
    <button disabled={disabled} title="Align center" onMouseDown={keep} onClick={()=>cmd("justifyCenter")}><AlignCenter size={17}/></button>
    <button disabled={disabled} title="Align right" onMouseDown={keep} onClick={()=>cmd("justifyRight")}><AlignRight size={17}/></button><i/>
    <button disabled={disabled} title="Link" onMouseDown={keep} onClick={addLink}><Link size={17}/></button>
    <button disabled={disabled} title="Clear formatting" onMouseDown={keep} onClick={()=>cmd("removeFormat")}><RemoveFormatting size={17}/></button>
    <button disabled={disabled} title="Undo" onMouseDown={keep} onClick={()=>cmd("undo")}><Undo2 size={17}/></button>
    <button disabled={disabled} title="Redo" onMouseDown={keep} onClick={()=>cmd("redo")}><Redo2 size={17}/></button>
  </div>;
}

function HistoryModal({doc,versions,close}:{doc:Doc;versions:Version[];close:()=>void}){
  const[selected,setSelected]=useState<Version|null>(versions[0]||null);
  return <div className="overlay"><div className="historyModal">
    <div className="historyTop"><div><h3>Version history</h3><p>{doc.elnNumber} · {versions.length} {versions.length===1?"version":"versions"}</p></div><button className="x" type="button" onClick={close}><X/></button></div>
    {versions.length===0?<div className="historyEmpty">No saved versions yet.</div>:<div className="historyGrid">
      <div className="versionList">{versions.map(v=><button key={String(v.id)} className={selected?.id===v.id?"selected":""} onClick={()=>setSelected(v)}><b>Version {v.versionNo}</b><small>{fmt(v.changedAt)} · {v.changeType}</small><span className={`statusChip ${v.status}`}>{v.status}</span></button>)}</div>
      {selected&&<div className="versionPreview"><div className="versionMeta"><b>{selected.title}</b><span>{selected.experimentNumber||"No experiment"}</span></div><div className="versionContent" dangerouslySetInnerHTML={{__html:selected.contentHtml||"<p><i>Empty document</i></p>"}}/></div>}
    </div>}
  </div></div>;
}

function Confirm({doc,permanent,cancel,confirm}:{doc:Doc;permanent:boolean;cancel:()=>void;confirm:()=>void}){
  return <div className="overlay"><div className="modal"><button className="x" type="button" onClick={cancel}><X/></button><div className="warn"><Trash2/></div><h3>{permanent?"Permanently delete":"Move to Trash"} {doc.elnNumber}?</h3>
    <p>{permanent?"This permanently removes the ELN and all attachments. This cannot be undone.":"The ELN will be moved to Trash and can be restored later."}</p>
    <div className="modalActions"><button type="button" onClick={cancel}>Cancel</button><button type="button" className="confirm" onClick={confirm}><Trash2 size={16}/> {permanent?"Delete permanently":"Move to Trash"}</button></div>
  </div></div>;
}

function Editor({
  doc,docs,mode,onChange,onSave,onBrowse,onNew,onDelete,onOpen,onHistory,onFinalize,onSign,onUpload,onDeleteAttachment,onSearchExperiments,onBackup,onRestore,backupDue
}:{
  doc:Doc;docs:Doc[];mode:Mode;onChange:(d:Doc)=>void;onSave:(d:Doc,changeType?:string)=>Promise<Doc>;
  onBrowse:()=>void;onNew:()=>void;onDelete:(d:Doc)=>void;onOpen:(d:Doc)=>void;onHistory:(d:Doc)=>void;
  onFinalize:(d:Doc)=>Promise<void>;onSign:(d:Doc)=>Promise<void>;onUpload:(d:Doc,file:File)=>Promise<Attachment>;
  onDeleteAttachment:(d:Doc,a:Attachment)=>Promise<void>;onSearchExperiments:(q:string)=>Promise<Array<{experimentNumber:string;title?:string}>>;
  onBackup:()=>void;onRestore:(file:File)=>void;backupDue:boolean
}){
  const editor=useRef<HTMLDivElement>(null);
  const fileInput=useRef<HTMLInputElement>(null);
  const restoreInput=useRef<HTMLInputElement>(null);
  const[dirty,setDirty]=useState(false);
  const[saving,setSaving]=useState(false);
  const[saveError,setSaveError]=useState<string|null>(null);
  const[savedAt,setSavedAt]=useState(doc.updatedAt);
  const[editingTitle,setEditingTitle]=useState(false);
  const[experimentOptions,setExperimentOptions]=useState<Array<{experimentNumber:string;title?:string}>>([]);
  const titleInput=useRef<HTMLInputElement>(null);
  const recent=useMemo(()=>docs.filter(d=>!d.deletedAt).sort((a,b)=>new Date(b.updatedAt).getTime()-new Date(a.updatedAt).getTime()).slice(0,5),[docs]);
  const locked=doc.status!=="draft"||Boolean(doc.deletedAt);

  useEffect(()=>{if(editor.current&&editor.current.innerHTML!==doc.contentHtml)editor.current.innerHTML=doc.contentHtml;setDirty(false);setSaveError(null);setSavedAt(doc.updatedAt);setEditingTitle(false)},[doc.id]);
  useEffect(()=>{if(editingTitle){titleInput.current?.focus();titleInput.current?.select()}},[editingTitle]);
  useEffect(()=>{
    const q=doc.experimentNumber.trim();if(!q){setExperimentOptions([]);return}
    const t=window.setTimeout(()=>{void onSearchExperiments(q).then(setExperimentOptions)},250);return()=>window.clearTimeout(t);
  },[doc.experimentNumber]);

  const update=(patch:Partial<Doc>)=>{if(locked)return;onChange({...doc,...patch});setDirty(true)};
  const save=async(changeType="save",patch:Partial<Doc>={})=>{
    if(locked&&!patch.status)return doc;
    const next={...doc,...patch,contentHtml:editor.current?.innerHTML||doc.contentHtml};
    setSaving(true);setSaveError(null);
    try{
      const saved=await onSave(next,changeType);
      onChange(saved);setDirty(false);setSavedAt(saved.updatedAt);return saved;
    }catch(e){
      setSaveError(e instanceof Error?e.message:"Could not save changes");
      throw e;
    }finally{setSaving(false)}
  };
  useEffect(()=>{
    if(!dirty||locked)return;
    const t=window.setTimeout(()=>{void save("autosave").catch(()=>{})},900);return()=>window.clearTimeout(t);
  },[dirty,doc.title,doc.experimentNumber,doc.contentHtml]);
  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="s"){e.preventDefault();void save("manual_save").catch(()=>{})}};
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[doc,dirty,locked]);

  const chooseFile=()=>fileInput.current?.click();
  const uploadFile=async(file:File)=>{
    let saved=doc;
    if(!docs.some(d=>d.id===doc.id))saved=await save("save_before_attachment");
    const a=await onUpload(saved,file);
    const next={...saved,attachments:[...(saved.attachments||[]),a],updatedAt:new Date().toISOString()};
    onChange(next);
    if(file.type.startsWith("image/")&&data.attachmentUrl(a)){editor.current?.focus();document.execCommand("insertImage",false,data.attachmentUrl(a));setDirty(true)}
  };
  const finalize=async()=>{if(!confirm("Mark this ELN as Final? Final documents are locked against further editing."))return;await save("finalize",{status:"final"});await onFinalize({...doc,status:"final"})};

  return <main className="editor">
    <div className="editorTop">
      <div className="docId"><ScrollText size={17}/><b>{doc.elnNumber}</b><span className={`statusChip ${doc.status}`}>{doc.status}</span>{mode==="local"&&<span className="storageBadge">On this device</span>}</div>
      <span className={dirty?"status dirty":"status saved"}>{saving?"Saving…":dirty?<><span/> Unsaved changes</>:<><Check size={15}/> Saved {fmt(savedAt).split(",").pop()}</>}</span>
      {!locked&&<button className="save" type="button" onClick={()=>void save("manual_save").catch(()=>{})}><Save size={16}/> Save</button>}
      <button className="editorAction" type="button" onClick={()=>onHistory(doc)}><History size={16}/> History</button>
      <button className="editorAction" type="button" onClick={()=>window.print()}><Printer size={16}/> Print / PDF</button>
      {mode==="local"&&<><button className={backupDue?"editorAction backupDue":"editorAction"} type="button" onClick={onBackup}><Download size={16}/> {backupDue?"Backup recommended":"Backup"}</button>
      <button className="editorAction" type="button" onClick={()=>restoreInput.current?.click()}><Upload size={16}/> Restore</button>
      <input ref={restoreInput} type="file" accept="application/json,.json" hidden onChange={e=>{const file=e.target.files?.[0];if(file)onRestore(file);e.currentTarget.value=""}}/></>}
      {!locked&&<><button className="editorAction" type="button" onClick={chooseFile}><Paperclip size={16}/> Attach</button><input ref={fileInput} type="file" hidden onChange={e=>{const file=e.target.files?.[0];if(file)void uploadFile(file).catch(err=>setSaveError(err instanceof Error?err.message:"Could not attach file"));e.currentTarget.value=""}}/></>}
      {doc.status==="draft"&&!doc.deletedAt&&<button className="editorAction finalAction" type="button" onClick={()=>void finalize()}><Check size={16}/> Finalize</button>}
      {doc.status==="final"&&!doc.deletedAt&&<button className="editorAction signAction" type="button" onClick={()=>void onSign(doc)}><Check size={16}/> Sign</button>}
      {!doc.deletedAt&&<button className="editorAction deleteCurrent" type="button" onClick={()=>onDelete(doc)}><Trash2 size={16}/> Delete</button>}
      <button className="editorAction newDoc" type="button" onClick={onNew}><FilePlus2 size={16}/> New</button>
    </div>
    {saveError&&<div className="storageError"><span>{saveError}</span>{!locked&&<button type="button" onClick={()=>void save("manual_save").catch(()=>{})}>Retry save</button>}</div>}

    <section className="recentStrip">
      <div className="recentHeader"><span>Recent ELNs</span><button type="button" onClick={onBrowse}><FolderOpen size={15}/> Browse</button></div>
      <div className="recentList">
        {recent.length?recent.map(d=><button key={d.id} type="button" className={d.id===doc.id?"recentItem active":"recentItem"} onClick={()=>onOpen(d)}><b>{d.elnNumber}</b><small>{d.title||d.elnNumber}</small></button>):<span className="recentEmpty">No saved ELNs yet</span>}
      </div>
    </section>

    {doc.deletedAt&&<div className="lockedNotice">This ELN is in Trash and is read-only.</div>}
    {doc.status==="final"&&<div className="lockedNotice">This ELN is Final and locked. It can be signed but not edited.</div>}
    {doc.status==="signed"&&<div className="lockedNotice">Signed by {doc.signerName||"Unknown"} on {fmt(doc.signedAt)}. Signed content is immutable.</div>}

    <section className="meta">
      <label><span>Document name</span><input disabled={locked} value={doc.title} onChange={e=>update({title:e.target.value})} onBlur={()=>{if(!doc.title.trim())update({title:doc.elnNumber})}} placeholder={doc.elnNumber}/></label>
      <label><span>Experiment no.</span><div className="iconInput"><Microscope size={16}/><input disabled={locked} list="experiment-options" value={doc.experimentNumber} onChange={e=>update({experimentNumber:e.target.value})} placeholder="e.g. EXP-00124"/><datalist id="experiment-options">{experimentOptions.map(x=><option key={x.experimentNumber} value={x.experimentNumber}>{x.title||""}</option>)}</datalist></div></label>
      <div><span>Created</span><b>{fmt(doc.createdAt)}</b></div>
    </section>

    {(doc.attachments||[]).length>0&&<section className="attachments"><div className="attachmentTitle"><Paperclip size={15}/> Attachments</div><div className="attachmentList">{doc.attachments.map(a=><div className="attachment" key={a.id}><a href={data.attachmentUrl(a)} target="_blank" rel="noreferrer"><b>{a.fileName}</b><small>{bytes(a.sizeBytes)}</small></a>{!locked&&<button title="Remove attachment" onClick={()=>void onDeleteAttachment(doc,a)}><X size={14}/></button>}</div>)}</div></section>}

    <section className="paperWrap"><div className="paper">
      <div className="documentTitleBar">{editingTitle&&!locked?
        <input ref={titleInput} className="documentTitleInput" value={doc.title} onChange={e=>update({title:e.target.value})} onBlur={()=>{if(!doc.title.trim())update({title:doc.elnNumber});setEditingTitle(false)}} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();e.currentTarget.blur()}if(e.key==="Escape"){e.preventDefault();setEditingTitle(false)}}}/>:
        <button className="documentTitle" disabled={locked} type="button" onClick={()=>!locked&&setEditingTitle(true)} title={locked?"Document is locked":"Click to edit document title"}>{doc.title||doc.elnNumber}</button>}
      </div>
      <Toolbar disabled={locked}/>
      <div ref={editor} className={locked?"rich readonly":"rich"} contentEditable={!locked} suppressContentEditableWarning data-placeholder="Start writing your laboratory notes…" onInput={e=>update({contentHtml:e.currentTarget.innerHTML})} onPaste={e=>{if(locked)return;e.preventDefault();document.execCommand("insertText",false,e.clipboardData.getData("text/plain"))}}/>
    </div></section>
  </main>;
}

export default function App(){
  const[screen,setScreen]=useState<Screen>("editor");
  const[mode,setMode]=useState<Mode>("local");
  const[docs,setDocs]=useState<Doc[]>([]);
  const[current,setCurrent]=useState<Doc>(()=>placeholderDoc());
  const[pendingDelete,setPendingDelete]=useState<PendingDelete>(null);
  const[historyDoc,setHistoryDoc]=useState<Doc|null>(null);
  const[historyVersions,setHistoryVersions]=useState<Version[]>([]);
  const[backupDue,setBackupDue]=useState(false);

  const refresh=async(m:Mode=mode)=>{const all=await data.list(m);setDocs(all);return all};

  useEffect(()=>{
    let cancelled=false;
    void (async()=>{
      const detected=await data.detectMode();
      if(cancelled)return;
      setMode(detected);
      try{
        if(detected==="server")await data.migrateLocalIfNeeded();
        const all=await data.list(detected);
        const next=await data.create(detected);
        if(cancelled)return;
        setDocs(all);setCurrent(next);
        if(detected==="local"){try{setBackupDue((await data.backupStatus()).due)}catch{}}
      }catch{
        const all=await data.list("local");
        const next=await data.create("local");
        if(cancelled)return;
        setMode("local");setDocs(all);setCurrent(next);
        try{setBackupDue((await data.backupStatus()).due)}catch{}
      }
    })();
    return()=>{cancelled=true};
  },[]);

  const saveDoc=async(d:Doc,changeType="save")=>{
    const saved=await data.save(mode,d,changeType);
    setDocs(list=>list.some(x=>x.id===saved.id)?list.map(x=>x.id===saved.id?saved:x):[saved,...list]);
    setCurrent(saved);
    if(mode==="local")void data.backupStatus().then(s=>setBackupDue(s.due)).catch(()=>{});
    return saved;
  };
  const newDoc=()=>{void (async()=>{const d=await data.create(mode);setCurrent(d);setScreen("editor")})()};
  const openDoc=(d:Doc)=>{setCurrent(d);setScreen("editor")};
  const showEditor=()=>setScreen("editor");
  const requestDelete=(d:Doc,permanent=false)=>setPendingDelete({doc:d,permanent});
  const confirmDelete=()=>{void (async()=>{
    if(!pendingDelete)return;
    const {doc,permanent}=pendingDelete;
    if(permanent)await data.permanentDelete(mode,doc.id);
    else if(docs.some(d=>d.id===doc.id))await data.softDelete(mode,doc.id);
    setPendingDelete(null);await refresh();
    if(current.id===doc.id){setCurrent(await data.create(mode));setScreen("editor")}
  })()};
  const restoreDoc=(d:Doc)=>{void (async()=>{await data.restore(mode,d.id);await refresh()})()};
  const showHistory=(d:Doc)=>{void (async()=>{setHistoryDoc(d);setHistoryVersions(await data.versions(mode,d.id))})()};
  const finalize=async()=>{await refresh()};
  const signDoc=async(d:Doc)=>{
    const name=prompt("Signer name");if(!name?.trim())return;
    const signed=await data.sign(mode,d.id,name.trim());setCurrent(signed);await refresh();
  };
  const upload=async(d:Doc,file:File)=>{const a=await data.upload(mode,d.id,file);await refresh();return a};
  const deleteAttachment=async(d:Doc,a:Attachment)=>{await data.deleteAttachment(mode,d.id,a.id);const all=await refresh();const updated=all.find(x=>x.id===d.id);if(updated)setCurrent(updated)};
  const searchExperiments=(q:string)=>data.searchExperiments(mode,q,docs);
  const backup=()=>{void (async()=>{
    const text=await data.exportBackup();
    const blob=new Blob([text],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`biopilot-eln-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();
    URL.revokeObjectURL(url);setBackupDue(false);
  })().catch(e=>alert(e instanceof Error?e.message:"Could not create backup"))};
  const restoreBackup=(file:File)=>{void (async()=>{
    if(!confirm("Restore this ELN backup? Existing documents with the same IDs will be updated."))return;
    try{
      await data.importBackup(await file.text());
      setMode("local");
      const all=await data.list("local");setDocs(all);
      setCurrent(all.filter(d=>!d.deletedAt).sort((a,b)=>new Date(b.updatedAt).getTime()-new Date(a.updatedAt).getTime())[0]||await data.create("local"));
      setBackupDue((await data.backupStatus()).due);
      alert("Backup restored.");
    }catch(e){alert(e instanceof Error?e.message:"Could not restore backup.")}
  })()};

  return <div className="app"><Header editor={showEditor}/>
    {screen==="browse"&&<Browser docs={docs} back={showEditor} open={openDoc} remove={d=>requestDelete(d)} restore={restoreDoc} permanent={d=>requestDelete(d,true)}/>}
    {screen==="editor"&&<Editor doc={current} docs={docs} mode={mode} onChange={setCurrent} onSave={saveDoc} onBrowse={()=>setScreen("browse")} onNew={newDoc} onDelete={d=>requestDelete(d)} onOpen={openDoc} onHistory={showHistory} onFinalize={finalize} onSign={signDoc} onUpload={upload} onDeleteAttachment={deleteAttachment} onSearchExperiments={searchExperiments} onBackup={backup} onRestore={restoreBackup} backupDue={backupDue}/>}
    {pendingDelete&&<Confirm doc={pendingDelete.doc} permanent={pendingDelete.permanent} cancel={()=>setPendingDelete(null)} confirm={confirmDelete}/>}
    {historyDoc&&<HistoryModal doc={historyDoc} versions={historyVersions} close={()=>{setHistoryDoc(null);setHistoryVersions([])}}/>}
  </div>;
}
