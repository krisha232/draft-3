import { useRef } from 'react';
import { Paperclip, X, FileText, Image as ImageIcon } from 'lucide-react';
import { ACCEPT, MAX_FILES, checkFile, formatSize, isImage } from '../lib/files';

// "Attach files" button plus the list of chosen files. Up to 4 files, 10 MB each.
export default function FilePicker({ files, setFiles, onError }) {
  const input = useRef(null);

  const add = (e) => {
    const picked = [...e.target.files];
    e.target.value = '';
    onError('');
    for (const f of picked) {
      const problem = checkFile(f);
      if (problem) return onError(problem);
    }
    if (files.length + picked.length > MAX_FILES) return onError(`You can attach up to ${MAX_FILES} files.`);
    setFiles([...files, ...picked]);
  };

  return (
    <div className="file-picker">
      {files.length > 0 && (
        <ul className="file-chips">
          {files.map((f, i) => (
            <li key={i} className="file-chip">
              {isImage(f.type) ? <ImageIcon size={16} aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />}
              <span className="file-chip-name">{f.name}</span>
              <span className="muted small">{formatSize(f.size)}</span>
              <button type="button" className="icon-btn tiny" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn ghost small" onClick={() => input.current.click()} disabled={files.length >= MAX_FILES}>
        <Paperclip size={16} aria-hidden="true" /> Attach files
      </button>
      <span className="muted small"> Posters, schedules, forms: up to {MAX_FILES} files, 10 MB each</span>
      <input ref={input} type="file" multiple accept={ACCEPT} onChange={add} hidden />
    </div>
  );
}
