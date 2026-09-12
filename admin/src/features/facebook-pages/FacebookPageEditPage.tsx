import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '@/api/client';

type Page = {
  id: string;
  name: string;
  status: string;
  notes?: string | null;
  publicCode?: number;
};

export function FacebookPageEditPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<Page>(`/facebook-pages/${id}`)
      .then((p) => {
        setName(p.name || '');
        setNotes(p.notes || '');
        setStatus(p.status || 'ACTIVE');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/facebook-pages/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          notes: notes || undefined,
          status,
        }),
      });
      navigate(`/facebook-pages/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الحفظ');
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="panel muted">جارٍ التحميل...</div>;
  }

  return (
    <div className="stack">
      <div className="page-title">
        <h1>تعديل صفحة فيسبوك</h1>
        <p>تحديث الاسم والملاحظات والحالة فقط.</p>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <form className="panel stack" onSubmit={onSubmit}>
        <div className="form-grid two">
          <label>
            اسم الصفحة *
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            الحالة
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ACTIVE">ACTIVE — مفعّلة</option>
              <option value="INACTIVE">INACTIVE — متوقفة</option>
            </select>
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            ملاحظات
            <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        <div className="toolbar">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'جارٍ الحفظ...' : 'حفظ'}
          </button>
          <Link className="btn secondary" to={`/facebook-pages/${id}`}>
            إلغاء
          </Link>
        </div>
      </form>
    </div>
  );
}
