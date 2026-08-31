import { useRef, useState, type DragEvent } from 'react';
import type { LocalImage } from './productTypes';
import { makeLocalFromFile, revokePreview } from './productUtils';

type Props = {
  images: LocalImage[];
  max: number;
  onChange: (next: LocalImage[]) => void;
  label?: string;
  hint?: string;
};

export function ImageDropzone({
  images,
  max,
  onChange,
  label = 'الصور',
  hint = 'اسحب الصور هنا أو اضغط لاختيار الصور',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [msg, setMsg] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  function addFiles(fileList: FileList | File[]) {
    setMsg('');
    const incoming = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (!incoming.length) {
      setMsg('اختاري ملفات صور فقط');
      return;
    }
    const room = max - images.length;
    if (room <= 0) {
      setMsg(`الحد الأقصى ${max} صور`);
      return;
    }
    if (incoming.length > room) {
      setMsg(`يمكن إضافة ${room} فقط (الحد ${max}). تم تجاهل الزائد.`);
    }
    const accepted = incoming.slice(0, room).map(makeLocalFromFile);
    onChange([...images, ...accepted]);
  }

  function removeAt(index: number) {
    const next = [...images];
    const [removed] = next.splice(index, 1);
    if (removed) revokePreview(removed);
    onChange(next);
  }

  function makePrimary(index: number) {
    if (index === 0) return;
    const next = [...images];
    const [item] = next.splice(index, 1);
    next.unshift(item);
    onChange(next);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }

  function onReorderDrop(toIdx: number) {
    if (dragIdx == null || dragIdx === toIdx) {
      setDragIdx(null);
      return;
    }
    const next = [...images];
    const [item] = next.splice(dragIdx, 1);
    next.splice(toIdx, 0, item);
    onChange(next);
    setDragIdx(null);
  }

  return (
    <div className="pf-dropzone-wrap">
      <div className="pf-section-label">{label}</div>
      <div
        className={`pf-dropzone${dragOver ? ' is-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
      >
        <span className="material-symbols-outlined">add_photo_alternate</span>
        <strong>{hint}</strong>
        <span className="muted">
          {images.length} / {max} — الأفضل 1200×1500 (4:5)
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {msg ? <div className="pf-inline-warn">{msg}</div> : null}
      {images.length ? (
        <div className="pf-image-grid">
          {images.map((img, idx) => (
            <div
              key={img.key}
              className={`pf-image-card${idx === 0 ? ' is-primary' : ''}`}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onReorderDrop(idx);
              }}
            >
              <img src={img.preview} alt="" loading="lazy" />
              {idx === 0 ? <span className="pf-primary-badge">رئيسية</span> : null}
              <div className="pf-image-actions">
                {idx !== 0 ? (
                  <button type="button" className="btn ghost" onClick={() => makePrimary(idx)}>
                    رئيسية
                  </button>
                ) : null}
                <button type="button" className="btn ghost" onClick={() => removeAt(idx)}>
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
