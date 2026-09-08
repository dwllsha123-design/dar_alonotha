import { useRef, useState } from 'react';
import { MAX_COLOR_VIDEO_MS, type LocalVideo } from './productTypes';
import { uid } from './productUtils';

type Props = {
  video: LocalVideo | null;
  onChange: (next: LocalVideo | null) => void;
};

function readVideoDurationMs(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement('video');
    el.preload = 'metadata';
    el.muted = true;
    el.playsInline = true;
    el.onloadedmetadata = () => {
      const ms = Math.round((el.duration || 0) * 1000);
      URL.revokeObjectURL(url);
      resolve(ms);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('تعذر قراءة الفيديو'));
    };
    el.src = url;
  });
}

export function ColorVideoField({ video, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setError('');
    const okMime =
      /^video\/(mp4|webm|quicktime|x-m4v)$/i.test(file.type) ||
      /\.(mp4|webm|mov|m4v)$/i.test(file.name);
    if (!okMime) {
      setError('يُسمح بفيديو MP4 أو WebM فقط');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError('حجم الفيديو كبير جداً (الحد 25MB)');
      return;
    }
    setBusy(true);
    try {
      const durationMs = await readVideoDurationMs(file);
      if (durationMs > MAX_COLOR_VIDEO_MS) {
        setError('مدة الفيديو يجب ألا تتجاوز 10 ثوانٍ.');
        return;
      }
      if (video?.file && video.preview.startsWith('blob:')) {
        URL.revokeObjectURL(video.preview);
      }
      onChange({
        key: uid(),
        file,
        preview: URL.createObjectURL(file),
        existingId: video?.existingId,
        existingUrl: video?.existingUrl,
        durationMs,
      });
    } catch {
      setError('تعذر قراءة مدة الفيديو');
    } finally {
      setBusy(false);
    }
  }

  function removeVideo() {
    if (!window.confirm('حذف الفيديو القصير لهذا اللون؟')) return;
    if (video?.file && video.preview.startsWith('blob:')) {
      URL.revokeObjectURL(video.preview);
    }
    onChange(null);
    setError('');
  }

  return (
    <div className="pf-color-video">
      <div className="pf-section-label">فيديو قصير للون (اختياري)</div>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 8px' }}>
        يمكنك إضافة فيديو قصير لهذا اللون بمدة لا تتجاوز 10 ثوانٍ.
      </p>
      <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
        فيديو اختياري بمدة 10 ثوانٍ كحد أقصى — MP4 / WebM
      </p>

      {video ? (
        <div className="pf-video-preview">
          <video
            src={video.preview}
            controls
            playsInline
            muted
            preload="metadata"
            style={{ width: '100%', maxHeight: 280, borderRadius: 10, background: '#111' }}
          />
          <div className="pf-image-actions" style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn secondary" onClick={() => inputRef.current?.click()}>
              استبدال الفيديو
            </button>
            <button type="button" className="btn ghost" onClick={removeVideo}>
              حذف الفيديو
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn secondary"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'جارٍ التحقق...' : 'إضافة فيديو قصير'}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
        hidden
        onChange={(e) => {
          void pickFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {error ? <div className="pf-inline-warn">{error}</div> : null}
    </div>
  );
}
