import express from "express";
import cors from "cors";
import multer from "multer";
import pg from "pg";
import sanitizeHtml from "sanitize-html";
import {randomUUID} from "node:crypto";

const {Pool}=pg;
const app=express();
const port=Number(process.env.PORT||3001);
const frontendOrigin=process.env.FRONTEND_ORIGIN||"https://biopilot-eln.onrender.com";
const databaseUrl=process.env.DATABASE_URL||"";

app.use(cors({origin:[frontendOrigin,"http://localhost:5173"],credentials:false}));
app.use(express.json({limit:"10mb"}));

const pool=databaseUrl?new Pool({connectionString:databaseUrl,ssl:databaseUrl.includes("localhost")?false:{rejectUnauthorized:false}}):null;
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024,files:1}});

const cleanHtml=(html="")=>sanitizeHtml(String(html),{
  allowedTags:["p","br","h1","h2","h3","strong","b","em","i","u","s","ul","ol","li","blockquote","a","div","span","table","thead","tbody","tr","th","td","hr","sup","sub","img"],
  allowedAttributes:{a:["href","target","rel"],span:["style"],div:["style"],p:["style"],img:["src","alt","title"],table:["style"],th:["style"],td:["style"]},
  allowedSchemes:["http","https","mailto","data"],
  allowedStyles:{"*":{"text-align":[/^left$|^right$|^center$|^justify$/],"background-color":[/^#[0-9a-f]{3,8}$/i,/^[a-z]+$/i]}}
});

async function initDb(){
  if(!pool)return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS eln_sequences(
      year INTEGER PRIMARY KEY,
      last_value INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS eln_documents(
      id TEXT PRIMARY KEY,
      sequence INTEGER NOT NULL,
      year INTEGER NOT NULL,
      eln_number TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      experiment_number TEXT NOT NULL DEFAULT '',
      content_html TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','final','signed')),
      signer_name TEXT,
      signed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS eln_versions(
      id BIGSERIAL PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES eln_documents(id) ON DELETE CASCADE,
      version_no INTEGER NOT NULL,
      title TEXT NOT NULL,
      experiment_number TEXT NOT NULL DEFAULT '',
      content_html TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      signer_name TEXT,
      signed_at TIMESTAMPTZ,
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      change_type TEXT NOT NULL DEFAULT 'save',
      UNIQUE(document_id,version_no)
    );
    CREATE TABLE IF NOT EXISTS eln_attachments(
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES eln_documents(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS eln_documents_updated_idx ON eln_documents(updated_at DESC);
    CREATE INDEX IF NOT EXISTS eln_documents_experiment_idx ON eln_documents(experiment_number);
    CREATE INDEX IF NOT EXISTS eln_versions_document_idx ON eln_versions(document_id,version_no DESC);
  `);
}

const requireDb=(req,res,next)=>{if(!pool)return res.status(503).json({error:"Database is not configured"});next()};

function docFromRow(r,attachments=[]){
  return {
    id:r.id,elnNumber:r.eln_number,sequence:r.sequence,year:r.year,title:r.title,
    experimentNumber:r.experiment_number,contentHtml:r.content_html,status:r.status,
    signerName:r.signer_name,signedAt:r.signed_at,deletedAt:r.deleted_at,
    createdAt:r.created_at,updatedAt:r.updated_at,attachments
  };
}
function attachmentFromRow(r){
  return {id:r.id,documentId:r.document_id,fileName:r.file_name,mimeType:r.mime_type,sizeBytes:r.size_bytes,createdAt:r.created_at,url:`/api/attachments/${r.id}`};
}
function versionFromRow(r){
  return {id:r.id,documentId:r.document_id,versionNo:r.version_no,title:r.title,experimentNumber:r.experiment_number,contentHtml:r.content_html,status:r.status,signerName:r.signer_name,signedAt:r.signed_at,changedAt:r.changed_at,changeType:r.change_type};
}
async function attachmentsFor(documentId){
  const {rows}=await pool.query("SELECT id,document_id,file_name,mime_type,size_bytes,created_at FROM eln_attachments WHERE document_id=$1 ORDER BY created_at",[documentId]);
  return rows.map(attachmentFromRow);
}
async function getDoc(id){
  const {rows}=await pool.query("SELECT * FROM eln_documents WHERE id=$1",[id]);
  if(!rows[0])return null;
  return docFromRow(rows[0],await attachmentsFor(id));
}
async function addVersion(client,doc,changeType){
  if(changeType==="autosave"){
    const latest=await client.query("SELECT id,changed_at,change_type FROM eln_versions WHERE document_id=$1 ORDER BY version_no DESC LIMIT 1",[doc.id]);
    const row=latest.rows[0];
    if(row&&row.change_type==="autosave"&&Date.now()-new Date(row.changed_at).getTime()<60_000){
      await client.query(`UPDATE eln_versions SET title=$2,experiment_number=$3,content_html=$4,status=$5,signer_name=$6,signed_at=$7,changed_at=NOW() WHERE id=$1`,[row.id,doc.title,doc.experimentNumber,doc.contentHtml,doc.status,doc.signerName||null,doc.signedAt||null]);
      return;
    }
  }
  const q=await client.query("SELECT COALESCE(MAX(version_no),0)+1 AS next FROM eln_versions WHERE document_id=$1",[doc.id]);
  const n=Number(q.rows[0].next);
  await client.query(`INSERT INTO eln_versions(document_id,version_no,title,experiment_number,content_html,status,signer_name,signed_at,change_type)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[doc.id,n,doc.title,doc.experimentNumber,doc.contentHtml,doc.status,doc.signerName||null,doc.signedAt||null,changeType]);
}

app.get("/health",async(req,res)=>{
  if(!pool)return res.json({ok:true,database:false});
  try{await pool.query("SELECT 1");res.json({ok:true,database:true})}catch(e){res.status(503).json({ok:false,database:false,error:String(e.message||e)})}
});

app.get("/api/documents",requireDb,async(req,res,next)=>{
  try{
    const deleted=String(req.query.deleted||"active");
    const q=String(req.query.q||"").trim();
    const status=String(req.query.status||"").trim();
    const year=String(req.query.year||"").trim();
    const experiment=String(req.query.experiment||"").trim();
    const sort=String(req.query.sort||"updated_desc");
    const where=[],args=[];
    const add=(sql,val)=>{args.push(val);where.push(sql.replace("?","$"+args.length))};
    if(deleted==="active")where.push("deleted_at IS NULL");
    if(deleted==="trash")where.push("deleted_at IS NOT NULL");
    if(q)add("(eln_number ILIKE ? OR title ILIKE ? OR experiment_number ILIKE ?)",`%${q}%`);
    if(q){const v=args.pop();args.push(v,v,v);where[where.length-1]=`(eln_number ILIKE $${args.length-2} OR title ILIKE $${args.length-1} OR experiment_number ILIKE $${args.length})`}
    if(status)add("status=?",status);
    if(year&&/^\d{4}$/.test(year))add("year=?",Number(year));
    if(experiment)add("experiment_number ILIKE ?",`%${experiment}%`);
    const order={updated_asc:"updated_at ASC",number_asc:"year ASC, sequence ASC",number_desc:"year DESC, sequence DESC",title_asc:"LOWER(title) ASC"}[sort]||"updated_at DESC";
    const {rows}=await pool.query(`SELECT * FROM eln_documents ${where.length?"WHERE "+where.join(" AND "):""} ORDER BY ${order}`,args);
    const docs=[];for(const r of rows)docs.push(docFromRow(r,await attachmentsFor(r.id)));
    res.json(docs);
  }catch(e){next(e)}
});

app.post("/api/documents",requireDb,async(req,res,next)=>{
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const year=new Date().getFullYear();
    await client.query("INSERT INTO eln_sequences(year,last_value) VALUES($1,0) ON CONFLICT(year) DO NOTHING",[year]);
    const seqResult=await client.query("UPDATE eln_sequences SET last_value=last_value+1 WHERE year=$1 RETURNING last_value",[year]);
    const sequence=Number(seqResult.rows[0].last_value);
    const elnNumber=`ELN-${String(sequence).padStart(5,"0")}-${year}`;
    const id=randomUUID();
    const {rows}=await client.query(`INSERT INTO eln_documents(id,sequence,year,eln_number,title) VALUES($1,$2,$3,$4,$4) RETURNING *`,[id,sequence,year,elnNumber]);
    const doc=docFromRow(rows[0],[]);
    await addVersion(client,doc,"create");
    await client.query("COMMIT");
    res.status(201).json(doc);
  }catch(e){await client.query("ROLLBACK");next(e)}finally{client.release()}
});

app.put("/api/documents/:id",requireDb,async(req,res,next)=>{
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const existingResult=await client.query("SELECT * FROM eln_documents WHERE id=$1 FOR UPDATE",[req.params.id]);
    const existing=existingResult.rows[0];if(!existing){await client.query("ROLLBACK");return res.status(404).json({error:"Document not found"})}
    if(existing.status==="signed"){await client.query("ROLLBACK");return res.status(409).json({error:"Signed documents are immutable"})}
    if(existing.status==="final"){await client.query("ROLLBACK");return res.status(409).json({error:"Final documents are locked. Sign the document or create a new ELN."})}
    const status=["draft","final"].includes(req.body.status)?req.body.status:existing.status;
    const title=String(req.body.title||existing.eln_number).trim()||existing.eln_number;
    const experiment=String(req.body.experimentNumber||"").trim().slice(0,200);
    const html=cleanHtml(req.body.contentHtml||"");
    const {rows}=await client.query(`UPDATE eln_documents SET title=$2,experiment_number=$3,content_html=$4,status=$5,updated_at=NOW() WHERE id=$1 RETURNING *`,[req.params.id,title,experiment,html,status]);
    const doc=docFromRow(rows[0],await attachmentsFor(req.params.id));
    await addVersion(client,doc,String(req.body.changeType||"save").slice(0,50));
    await client.query("COMMIT");
    res.json(doc);
  }catch(e){await client.query("ROLLBACK");next(e)}finally{client.release()}
});

app.delete("/api/documents/:id",requireDb,async(req,res,next)=>{
  try{
    const {rows}=await pool.query("UPDATE eln_documents SET deleted_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING *",[req.params.id]);
    if(!rows[0])return res.status(404).json({error:"Document not found"});
    const doc=docFromRow(rows[0],await attachmentsFor(req.params.id));
    const client=await pool.connect();try{await client.query("BEGIN");await addVersion(client,doc,"soft_delete");await client.query("COMMIT")}catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
    res.json(doc);
  }catch(e){next(e)}
});

app.post("/api/documents/:id/restore",requireDb,async(req,res,next)=>{
  try{
    const {rows}=await pool.query("UPDATE eln_documents SET deleted_at=NULL,updated_at=NOW() WHERE id=$1 RETURNING *",[req.params.id]);
    if(!rows[0])return res.status(404).json({error:"Document not found"});
    const doc=docFromRow(rows[0],await attachmentsFor(req.params.id));
    const client=await pool.connect();try{await client.query("BEGIN");await addVersion(client,doc,"restore");await client.query("COMMIT")}catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
    res.json(doc);
  }catch(e){next(e)}
});

app.delete("/api/documents/:id/permanent",requireDb,async(req,res,next)=>{
  try{
    const {rows}=await pool.query("DELETE FROM eln_documents WHERE id=$1 AND deleted_at IS NOT NULL RETURNING id",[req.params.id]);
    if(!rows[0])return res.status(409).json({error:"Document must be in Trash before permanent deletion"});
    res.status(204).end();
  }catch(e){next(e)}
});

app.get("/api/documents/:id/versions",requireDb,async(req,res,next)=>{
  try{const {rows}=await pool.query("SELECT * FROM eln_versions WHERE document_id=$1 ORDER BY version_no DESC",[req.params.id]);res.json(rows.map(versionFromRow))}catch(e){next(e)}
});

app.post("/api/documents/:id/sign",requireDb,async(req,res,next)=>{
  const signerName=String(req.body.signerName||"").trim();
  if(!signerName)return res.status(400).json({error:"Signer name is required"});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const current=await client.query("SELECT * FROM eln_documents WHERE id=$1 FOR UPDATE",[req.params.id]);
    if(!current.rows[0]){await client.query("ROLLBACK");return res.status(404).json({error:"Document not found"})}
    if(current.rows[0].status!=="final"){await client.query("ROLLBACK");return res.status(409).json({error:"Only Final documents can be signed"})}
    const {rows}=await client.query("UPDATE eln_documents SET status='signed',signer_name=$2,signed_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING *",[req.params.id,signerName]);
    const doc=docFromRow(rows[0],await attachmentsFor(req.params.id));await addVersion(client,doc,"sign");
    await client.query("COMMIT");res.json(doc);
  }catch(e){await client.query("ROLLBACK");next(e)}finally{client.release()}
});

app.post("/api/documents/:id/attachments",requireDb,upload.single("file"),async(req,res,next)=>{
  try{
    if(!req.file)return res.status(400).json({error:"File is required"});
    const current=await pool.query("SELECT status FROM eln_documents WHERE id=$1",[req.params.id]);
    if(!current.rows[0])return res.status(404).json({error:"Document not found"});
    if(current.rows[0].status!=="draft")return res.status(409).json({error:"Attachments can only be changed while the ELN is Draft"});
    const id=randomUUID();
    const {rows}=await pool.query(`INSERT INTO eln_attachments(id,document_id,file_name,mime_type,size_bytes,data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,document_id,file_name,mime_type,size_bytes,created_at`,[id,req.params.id,req.file.originalname,req.file.mimetype||"application/octet-stream",req.file.size,req.file.buffer]);
    res.status(201).json(attachmentFromRow(rows[0]));
  }catch(e){next(e)}
});

app.get("/api/attachments/:id",requireDb,async(req,res,next)=>{
  try{
    const {rows}=await pool.query("SELECT file_name,mime_type,data FROM eln_attachments WHERE id=$1",[req.params.id]);
    if(!rows[0])return res.status(404).end();
    res.setHeader("Content-Type",rows[0].mime_type);res.setHeader("Content-Disposition",`inline; filename*=UTF-8''${encodeURIComponent(rows[0].file_name)}`);res.send(rows[0].data);
  }catch(e){next(e)}
});

app.delete("/api/documents/:docId/attachments/:attachmentId",requireDb,async(req,res,next)=>{
  try{
    const current=await pool.query("SELECT status FROM eln_documents WHERE id=$1",[req.params.docId]);
    if(!current.rows[0])return res.status(404).json({error:"Document not found"});
    if(current.rows[0].status!=="draft")return res.status(409).json({error:"Attachments can only be changed while the ELN is Draft"});
    await pool.query("DELETE FROM eln_attachments WHERE id=$1 AND document_id=$2",[req.params.attachmentId,req.params.docId]);res.status(204).end();
  }catch(e){next(e)}
});

app.get("/api/experiments",requireDb,async(req,res,next)=>{
  try{
    const q=String(req.query.q||"").trim();
    const {rows}=await pool.query(`SELECT experiment_number,MAX(title) AS title FROM eln_documents WHERE experiment_number<>'' AND experiment_number ILIKE $1 GROUP BY experiment_number ORDER BY experiment_number LIMIT 20`,[`%${q}%`]);
    res.json(rows.map(r=>({experimentNumber:r.experiment_number,title:r.title})));
  }catch(e){next(e)}
});

app.post("/api/import",requireDb,async(req,res,next)=>{
  const docs=Array.isArray(req.body.documents)?req.body.documents:[];
  const client=await pool.connect();let imported=0;
  try{
    await client.query("BEGIN");
    for(const raw of docs){
      const elnNumber=String(raw.elnNumber||"");if(!/^ELN-\d{5}-\d{4}$/.test(elnNumber))continue;
      const id=String(raw.id||randomUUID()),sequence=Number(raw.sequence||elnNumber.slice(4,9)),year=Number(raw.year||elnNumber.slice(-4));
      const title=String(raw.title||elnNumber).trim()||elnNumber,experiment=String(raw.experimentNumber||""),html=cleanHtml(raw.contentHtml||"");
      const status=["draft","final","signed"].includes(raw.status)?raw.status:"draft";
      const {rowCount}=await client.query(`INSERT INTO eln_documents(id,sequence,year,eln_number,title,experiment_number,content_html,status,signer_name,signed_at,created_at,updated_at,deleted_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(eln_number) DO NOTHING`,[id,sequence,year,elnNumber,title,experiment,html,status,raw.signerName||null,raw.signedAt||null,raw.createdAt||new Date(),raw.updatedAt||new Date(),raw.deletedAt||null]);
      if(rowCount){
        imported++;
        await client.query("INSERT INTO eln_sequences(year,last_value) VALUES($1,$2) ON CONFLICT(year) DO UPDATE SET last_value=GREATEST(eln_sequences.last_value,EXCLUDED.last_value)",[year,sequence]);
        const doc={id,elnNumber,sequence,year,title,experimentNumber:experiment,contentHtml:html,status,signerName:raw.signerName||null,signedAt:raw.signedAt||null};
        await addVersion(client,doc,"import");
        for(const a of Array.isArray(raw.attachments)?raw.attachments:[]){
          if(!a.dataUrl)continue;const m=String(a.dataUrl).match(/^data:([^;]+);base64,(.+)$/);if(!m)continue;
          const data=Buffer.from(m[2],"base64");if(data.length>15*1024*1024)continue;
          await client.query("INSERT INTO eln_attachments(id,document_id,file_name,mime_type,size_bytes,data,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING",[String(a.id||randomUUID()),id,String(a.fileName||"attachment"),String(a.mimeType||m[1]),data.length,data,a.createdAt||new Date()]);
        }
      }
    }
    await client.query("COMMIT");res.json({imported});
  }catch(e){await client.query("ROLLBACK");next(e)}finally{client.release()}
});

app.use((err,req,res,next)=>{
  console.error(err);
  if(err?.code==="LIMIT_FILE_SIZE")return res.status(413).json({error:"Attachment is too large (max 15 MB)"});
  res.status(500).json({error:"Server error"});
});

initDb().then(()=>app.listen(port,()=>console.log(`BioPilot ELN API listening on ${port}; database ${pool?"configured":"not configured"}`))).catch(err=>{console.error("Database initialization failed",err);process.exit(1)});
