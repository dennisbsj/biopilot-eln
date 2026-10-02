import {useEffect,useMemo,useRef,useState} from "react";
import {
  AlignCenter,AlignLeft,AlignRight,ArrowLeft,Bold,Check,ChevronRight,
  FilePlus2,FolderOpen,Italic,Link,List,ListOrdered,Microscope,Quote,
  Redo2,RemoveFormatting,Save,ScrollText,Search,Trash2,Underline,Undo2,X
} from "lucide-react";

type Doc={
  id:string; elnNumber:string; sequence:number; year:number; title:string;
  experimentNumber:string; contentHtml:string; createdAt:string; updatedAt:string;
};
type Screen="home"|"browse"|"editor";

const DOCS_KEY="biopilot-eln-docs-v1";
const SEQ_KEY="biopilot-eln-seq-v1";

function loadDocs():Doc[]{
  try{
    const parsed=JSON.parse(localStorage.getItem(DOCS_KEY)||"[]");
    if(!Array.isArray(parsed))return[];
    return parsed.map((d:any)=>({
      id:String(d.id||crypto.randomUUID()),
      elnNumber:String(d.elnNumber||""),
      sequence:Number(d.sequence||0),
      year:Number(d.year||new Date().getFullYear()),
      title:String(d.title||d.elnNumber||""),
      experimentNumber:String(d.experimentNumber||""),
      contentHtml:String(d.contentHtml||""),
      createdAt:String(d.createdAt||new Date().toISOString()),
      updatedAt:String(d.updatedAt||d.createdAt||new Date().toISOString())
    })).filter((d:Doc)=>d.elnNumber);
  }catch{return[]}
}
function persist(docs:Doc[]){localStorage.setItem(DOCS_KEY,JSON.stringify(docs))}
function nextNumber(){
  const year=new Date().getFullYear();
  const raw=JSON.parse(localStorage.getItem(SEQ_KEY)||"{}") as Record<string,number>;
  const seq=(raw[String(year)]||0)+1;
  return {year,sequence:seq,elnNumber:`ELN-${String(seq).padStart(5,"0")}-${year}`};
}
function commitNumber(year:number,sequence:number){
  const raw=JSON.parse(localStorage.getItem(SEQ_KEY)||"{}") as Record<string,number>;
  raw[String(year)]=Math.max(raw[String(year)]||0,sequence);
  localStorage.setItem(SEQ_KEY,JSON.stringify(raw));
}
function makeDoc():Doc{
  const n=nextNumber(),now=new Date().toISOString();
  return {id:crypto.randomUUID(),...n,title:n.elnNumber,experimentNumber:"",contentHtml:"",createdAt:now,updatedAt:now};
}
function fmt(v:string){
  return new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(v));
}
function safeLink(v:string){
  const s=v.trim(); if(!s)return null;
  if(/^mailto:/i.test(s))return s;
  const c=/^https?:\/\//i.test(s)?s:`https://${s}`;
  try{const u=new URL(c);return ["http:","https:"].includes(u.protocol)?u.toString():null}catch{return null}
}
function Logo(){
  return <span className="logo" aria-hidden="true"><i/><b/><em/><strong/></span>;
}
function Header({home}:{home:()=>void}){
  return <header className="appHeader">
    <button className="brand" type="button" onClick={home}><Logo/><span>BioPilot</span><small>ELN</small></button>
    <div className="moduleBadge"><ScrollText size={15}/> Electronic Lab Notebook</div>
  </header>;
}
function Home({go}:{go:(s:Screen)=>void}){
  return <main className="home">
    <div className="eyebrow"><ScrollText size={17}/> Electronic Lab Notebook</div>
    <h1>ELN</h1>
    <p className="lead">Create, open and manage laboratory notes. Documents can be linked to a BioPilot experiment by experiment number.</p>
    <section className="cards">
      <button className="card primary" type="button" onClick={()=>go("editor")}><span><FilePlus2/></span><div><b>New</b><small>Create a new ELN document</small></div><ChevronRight/></button>
      <button className="card" type="button" onClick={()=>go("browse")} aria-label="Browse ELN documents"><span><FolderOpen/></span><div><b>Browse</b><small>Open or delete existing ELN documents</small></div><ChevronRight/></button>
    </section>
  </main>;
}
function Browser({docs,back,open,remove}:{docs:Doc[];back:()=>void;open:(d:Doc)=>void;remove:(d:Doc)=>void}){
  const[q,setQ]=useState("");
  const filtered=useMemo(()=>{
    const s=q.trim().toLowerCase(); if(!s)return docs;
    return docs.filter(d=>[d.elnNumber,d.title,d.experimentNumber].some(v=>v.toLowerCase().includes(s)));
  },[q,docs]);
  return <main className="browser">
    <div className="heading">
      <button className="back" type="button" onClick={back}><ArrowLeft size={18}/> Back</button>
      <div><h2>Browse ELN</h2><p>Open an ELN document or delete it from the list.</p></div>
      <span className="count">{docs.length} {docs.length===1?"document":"documents"}</span>
    </div>
    <label className="search"><Search size={18}/><input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by ELN number, title or experiment number"/>{q&&<button type="button" onClick={()=>setQ("")}><X size={15}/></button>}</label>
    {filtered.length===0?<div className="empty"><FolderOpen/><b>{q?"No matching ELN documents":"No ELN documents found"}</b><small>{q?"Try another search.":"Create a new document to get started."}</small></div>:
    <div className="tableWrap"><table><thead><tr><th>ELN number</th><th>Title</th><th>Experiment</th><th>Last edited</th><th/></tr></thead><tbody>
      {filtered.map(d=><tr className="browseRow" key={d.id} onClick={()=>open(d)} tabIndex={0} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open(d)}}}>
        <td className="num"><span className="numInner"><ScrollText size={16}/><span>{d.elnNumber}</span></span></td><td>{d.title||d.elnNumber}</td>
        <td>{d.experimentNumber?<span className="chip"><Microscope size={14}/>{d.experimentNumber}</span>:<i>—</i>}</td><td>{fmt(d.updatedAt)}</td>
        <td className="action"><button type="button" className="delete" onClick={e=>{e.stopPropagation();remove(d)}}><Trash2 size={15}/> Delete</button></td>
      </tr>)}
    </tbody></table></div>}
  </main>;
}
function Toolbar(){
  const cmd=(name:string,value?:string)=>document.execCommand(name,false,value);
  const keep=(e:React.MouseEvent)=>e.preventDefault();
  const addLink=()=>{const r=prompt("Link URL");if(!r)return;const u=safeLink(r);if(!u)return alert("Please enter a valid web or email link.");cmd("createLink",u)};
  return <div className="toolbar">
    <select defaultValue="p" onChange={e=>cmd("formatBlock",e.target.value)}><option value="p">Paragraph</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option></select>
    <i/>
    <button title="Bold" onMouseDown={keep} onClick={()=>cmd("bold")}><Bold size={17}/></button>
    <button title="Italic" onMouseDown={keep} onClick={()=>cmd("italic")}><Italic size={17}/></button>
    <button title="Underline" onMouseDown={keep} onClick={()=>cmd("underline")}><Underline size={17}/></button>
    <i/>
    <button title="Bulleted list" onMouseDown={keep} onClick={()=>cmd("insertUnorderedList")}><List size={17}/></button>
    <button title="Numbered list" onMouseDown={keep} onClick={()=>cmd("insertOrderedList")}><ListOrdered size={17}/></button>
    <button title="Quote" onMouseDown={keep} onClick={()=>cmd("formatBlock","blockquote")}><Quote size={17}/></button>
    <i/>
    <button title="Align left" onMouseDown={keep} onClick={()=>cmd("justifyLeft")}><AlignLeft size={17}/></button>
    <button title="Align center" onMouseDown={keep} onClick={()=>cmd("justifyCenter")}><AlignCenter size={17}/></button>
    <button title="Align right" onMouseDown={keep} onClick={()=>cmd("justifyRight")}><AlignRight size={17}/></button>
    <i/>
    <button title="Link" onMouseDown={keep} onClick={addLink}><Link size={17}/></button>
    <button title="Clear formatting" onMouseDown={keep} onClick={()=>cmd("removeFormat")}><RemoveFormatting size={17}/></button>
    <i/>
    <button title="Undo" onMouseDown={keep} onClick={()=>cmd("undo")}><Undo2 size={17}/></button>
    <button title="Redo" onMouseDown={keep} onClick={()=>cmd("redo")}><Redo2 size={17}/></button>
  </div>;
}
function Editor({doc,onChange,onSave,onBack}:{doc:Doc;onChange:(d:Doc)=>void;onSave:(d:Doc)=>void;onBack:()=>void}){
  const editor=useRef<HTMLDivElement>(null);
  const[dirty,setDirty]=useState(false);
  const[savedAt,setSavedAt]=useState(doc.updatedAt);
  const[editingTitle,setEditingTitle]=useState(false);
  const titleInput=useRef<HTMLInputElement>(null);

  useEffect(()=>{if(editor.current&&editor.current.innerHTML!==doc.contentHtml)editor.current.innerHTML=doc.contentHtml},[doc.id]);
  useEffect(()=>{if(editingTitle){titleInput.current?.focus();titleInput.current?.select()}},[editingTitle]);
  const update=(patch:Partial<Doc>)=>{onChange({...doc,...patch});setDirty(true)};
  const save=()=>{
    const d={...doc,contentHtml:editor.current?.innerHTML||doc.contentHtml,updatedAt:new Date().toISOString()};
    onChange(d);onSave(d);setDirty(false);setSavedAt(d.updatedAt);
  };
  useEffect(()=>{
    if(!dirty)return;
    const t=window.setTimeout(save,900);
    return()=>window.clearTimeout(t);
  },[dirty,doc.title,doc.experimentNumber,doc.contentHtml]);
  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="s"){e.preventDefault();save()}};
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[doc,dirty]);

  return <main className="editor">
    <div className="editorTop">
      <button className="back" type="button" onClick={()=>{if(dirty)save();onBack()}}><ArrowLeft size={18}/> Back</button>
      <div className="docId"><ScrollText size={17}/><b>{doc.elnNumber}</b></div>
      <span className={dirty?"status dirty":"status saved"}>{dirty?<><span/> Unsaved changes</>:<><Check size={15}/> Saved {new Intl.DateTimeFormat("en-GB",{hour:"2-digit",minute:"2-digit"}).format(new Date(savedAt))}</>}</span>
      <button className="save" type="button" onClick={save}><Save size={16}/> Save</button>
    </div>
    <section className="meta">
      <label><span>Document name</span><input value={doc.title} onChange={e=>update({title:e.target.value})} onBlur={()=>{if(!doc.title.trim())update({title:doc.elnNumber})}} placeholder={doc.elnNumber}/></label>
      <label><span>Experiment no.</span><div className="iconInput"><Microscope size={16}/><input value={doc.experimentNumber} onChange={e=>update({experimentNumber:e.target.value})} placeholder="e.g. EXP-00124"/></div></label>
      <div><span>Created</span><b>{fmt(doc.createdAt)}</b></div>
    </section>
    <section className="paperWrap"><div className="paper">
      <div className="documentTitleBar">
        {editingTitle?
          <input
            ref={titleInput}
            className="documentTitleInput"
            value={doc.title}
            onChange={e=>update({title:e.target.value})}
            onBlur={()=>{if(!doc.title.trim())update({title:doc.elnNumber});setEditingTitle(false)}}
            onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();e.currentTarget.blur()}if(e.key==="Escape"){e.preventDefault();setEditingTitle(false)}}}
          />:
          <button className="documentTitle" type="button" onClick={()=>setEditingTitle(true)} title="Click to edit document title">{doc.title||doc.elnNumber}</button>
        }
      </div>
      <Toolbar/>
      <div ref={editor} className="rich" contentEditable suppressContentEditableWarning data-placeholder="Start writing your laboratory notes…" onInput={e=>update({contentHtml:e.currentTarget.innerHTML})} onPaste={e=>{e.preventDefault();document.execCommand("insertText",false,e.clipboardData.getData("text/plain"))}}/>
    </div></section>
  </main>;
}
function Confirm({doc,cancel,confirm}:{doc:Doc;cancel:()=>void;confirm:()=>void}){
  return <div className="overlay"><div className="modal"><button className="x" type="button" onClick={cancel}><X/></button><div className="warn"><Trash2/></div><h3>Delete {doc.elnNumber}?</h3><p>This permanently removes the ELN document from this browser. This action cannot be undone.</p><div className="modalActions"><button type="button" onClick={cancel}>Cancel</button><button type="button" className="confirm" onClick={confirm}><Trash2 size={16}/> Delete</button></div></div></div>;
}
export default function App(){
  const[screen,setScreen]=useState<Screen>("home");
  const[docs,setDocs]=useState<Doc[]>(()=>loadDocs());
  const[current,setCurrent]=useState<Doc|null>(null);
  const[pendingDelete,setPendingDelete]=useState<Doc|null>(null);

  useEffect(()=>persist(docs),[docs]);
  const save=(d:Doc)=>{
    commitNumber(d.year,d.sequence);
    setDocs(list=>list.some(x=>x.id===d.id)?list.map(x=>x.id===d.id?d:x):[d,...list]);
  };
  const go=(s:Screen)=>{
    if(s==="editor"){
      setCurrent(makeDoc());
      setScreen("editor");
      return;
    }
    if(s==="browse"){
      setCurrent(null);
      setScreen("browse");
      return;
    }
    setScreen("home");
  };
  const home=()=>setScreen("home");
  const remove=()=>{if(!pendingDelete)return;setDocs(list=>list.filter(d=>d.id!==pendingDelete.id));setPendingDelete(null)};

  return <div className="app"><Header home={home}/>
    {screen==="home"&&<Home go={go}/>}
    {screen==="browse"&&<Browser docs={docs} back={home} open={d=>{setCurrent(d);setScreen("editor")}} remove={setPendingDelete}/>}
    {screen==="editor"&&current&&<Editor doc={current} onChange={setCurrent} onSave={save} onBack={home}/>}
    {pendingDelete&&<Confirm doc={pendingDelete} cancel={()=>setPendingDelete(null)} confirm={remove}/>}
  </div>;
}