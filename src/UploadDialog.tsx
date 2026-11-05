import { useRef, useState } from 'react';
import { buildLocalTraces, type LocalTrace } from './imports';

export function UploadDialog({ onImport }: { onImport: (sources: LocalTrace[]) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const single = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function apply(){setBusy(true);setError('');try{await onImport(buildLocalTraces(files));setFiles([]);dialog.current?.close();}catch(e){setError(e instanceof Error?e.message:'Import failed.');}finally{setBusy(false);}}

  return <>
    <button className="button upload-button" type="button" onClick={() => dialog.current?.showModal()}>↑ Upload traces</button>
    <dialog ref={dialog} className="upload-dialog" aria-labelledby="upload-heading">
      <div className="upload-heading"><div><p className="eyebrow">Local files</p><h2 id="upload-heading">Upload student traces</h2></div><button className="button" type="button" aria-label="Close upload" disabled={busy} onClick={() => dialog.current?.close()}>✕</button></div>
      <p className="muted">Choose a single trace or a folder containing several traces and their supporting files.</p>
      <div className="upload-choices"><button className="upload-choice" type="button" onClick={() => single.current?.click()}><span aria-hidden="true">↥</span><strong>Single trace</strong><small>CSV or prepared JSON</small></button><button className="upload-choice" type="button" onClick={() => { folder.current?.setAttribute('webkitdirectory', ''); folder.current?.click(); }}><span aria-hidden="true">▱</span><strong>Folder of traces</strong><small>Include event reports when available</small></button></div>
      <input ref={single} type="file" accept=".csv,.json" hidden onChange={e => setFiles(Array.from(e.target.files ?? []))}/>
      <input ref={folder} type="file" multiple hidden onChange={e => setFiles(Array.from(e.target.files ?? []))}/>
      {files.length > 0 && <div className="upload-selection" role="status"><strong>{files.length} {files.length === 1 ? 'file' : 'files'} selected</strong><ul>{files.slice(0,5).map((file,i) => <li key={i}>{file.webkitRelativePath || file.name}</li>)}</ul>{files.length > 5 && <p>And {files.length - 5} more.</p>}</div>}
      <div className="preview-notice"><strong>Files stay on this computer</strong><p>JSON must use the prepared trace format. CSV must use the CS1C simulator format. Include matching Markdown reports for event text; missing answers stay unavailable. Folder traces are validated as you open them.</p></div>{error&&<p role="alert" className="import-error">{error}</p>}
      <div className="upload-actions"><button className="button" type="button" disabled={busy} onClick={() => dialog.current?.close()}>Close</button><button className="button primary" type="button" disabled={busy||!files.length} onClick={()=>{void apply();}}>{busy?'Importing…':'Import traces'}</button></div>
    </dialog>
  </>;
}
