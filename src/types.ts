export type DocStatus="draft"|"final"|"signed";

export type Attachment={
  id:string;
  documentId:string;
  fileName:string;
  mimeType:string;
  sizeBytes:number;
  createdAt:string;
  url?:string;
  dataUrl?:string;
};

export type Version={
  id:string|number;
  documentId:string;
  versionNo:number;
  title:string;
  experimentNumber:string;
  contentHtml:string;
  status:DocStatus;
  signerName?:string|null;
  signedAt?:string|null;
  changedAt:string;
  changeType:string;
};

export type Doc={
  id:string;
  elnNumber:string;
  sequence:number;
  year:number;
  title:string;
  experimentNumber:string;
  contentHtml:string;
  status:DocStatus;
  signerName?:string|null;
  signedAt?:string|null;
  deletedAt?:string|null;
  createdAt:string;
  updatedAt:string;
  attachments:Attachment[];
};
