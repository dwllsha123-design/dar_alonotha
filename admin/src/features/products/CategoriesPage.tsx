import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '@/api/client';

type Category = {
  id: string;
  parentId: string | null;
  nameAr: string;
  nameEn?: string | null;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  _count?: { products: number; children: number };
};

export function CategoriesPage({ embedded = false }: { embedded?: boolean }) {
  const [rows, setRows] = useState<Category[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { nameAr: string; isActive: boolean }>>({});

  async function load() {
    const list = await api<Category[]>('/categories');
    setRows(list);
    setDrafts(
      Object.fromEntries(
        list.map((c) => [c.id, { nameAr: c.nameAr, isActive: c.isActive }]),
      ),
    );
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'فشل التحميل'));
  }, []);

  const visible = useMemo(() => {
    const term = q.trim();
    const sorted = [...rows].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.nameAr.localeCompare(b.nameAr, 'ar'),
    );
    if (!term) return sorted;
    return sorted.filter(
      (c) => c.nameAr.includes(term) || drafts[c.id]?.nameAr?.includes(term),
    );
  }, [rows, q, drafts]);

  function patchDraft(id: string, next: Partial<{ nameAr: string; isActive: boolean }>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        nameAr: prev[id]?.nameAr ?? '',
        isActive: prev[id]?.isActive ?? true,
        ...next,
      },
    }));
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const name = nameAr.trim();
    if (!name) {
      setError('اكتبي اسم التصنيف');
      return;
    }
    setError('');
    setMsg('');
    setBusy(true);
    try {
      await api('/categories', {
        method: 'POST',
        body: JSON.stringify({ nameAr: name }),
      });
      setNameAr('');
      setMsg('تم إضافة التصنيف');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الحفظ');
    } finally {
      setBusy(false);
    }
  }

  async function saveRow(c: Category) {
    const draft = drafts[c.id];
    if (!draft?.nameAr.trim()) {
      setError('اسم التصنيف مطلوب');
      return;
    }
    setError('');
    setMsg('');
    try {
      await api(`/categories/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nameAr: draft.nameAr.trim(),
          isActive: draft.isActive,
        }),
      });
      setMsg('تم حفظ التعديل');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الحفظ');
    }
  }

  async function removeRow(c: Category) {
    if (!confirm(`حذف التصنيف «${c.nameAr}»؟`)) return;
    setError('');
    setMsg('');
    try {
      await api(`/categories/${c.id}`, { method: 'DELETE' });
      setMsg('تم الحذف');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الحذف');
    }
  }

  async function moveRow(c: Category, dir: -1 | 1) {
    const siblings = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = siblings.findIndex((r) => r.id === c.id);
    const swap = siblings[idx + dir];
    if (!swap) return;
    setError('');
    try {
      await Promise.all([
        api(`/categories/${c.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ sortOrder: swap.sortOrder }),
        }),
        api(`/categories/${swap.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ sortOrder: c.sortOrder }),
        }),
      ]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الترتيب');
    }
  }

  return (
    <div className="stack">
      {embedded ? null : (
        <div className="page-title">
          <h1>التصنيفات</h1>
          <p>أضيفي تصنيفاً جديداً أو عدّلي القائمة. يظهر في المتجر فوراً.</p>
        </div>
      )}
      {error ? <div className="error">{error}</div> : null}
      {msg ? <div className="success">{msg}</div> : null}

      <form className="panel form-grid two" onSubmit={onCreate}>
        <label>
          إضافة تصنيف
          <input
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            placeholder="اكتبي اسم التصنيف"
            required
            autoComplete="off"
          />
        </label>
        <div style={{ display: 'flex', alignItems: 'end' }}>
          <button className="btn" type="submit" disabled={busy || !nameAr.trim()}>
            {busy ? 'جارٍ الحفظ...' : 'إضافة'}
          </button>
        </div>
      </form>

      <div className="panel table-wrap">
        <div className="toolbar">
          <strong>التصنيفات ({rows.length})</strong>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث..."
            style={{ maxWidth: 220 }}
          />
        </div>
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>منتجات</th>
              <th>ترتيب</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => {
              const d = drafts[c.id];
              if (!d) return null;
              return (
                <tr key={c.id}>
                  <td>
                    <input
                      value={d.nameAr}
                      onChange={(e) => patchDraft(c.id, { nameAr: e.target.value })}
                    />
                  </td>
                  <td>{c._count?.products ?? 0}</td>
                  <td>
                    <div className="toolbar" style={{ justifyContent: 'flex-end', flexWrap: 'wrap', gap: 6 }}>
                      <button type="button" className="btn ghost" onClick={() => void moveRow(c, -1)}>
                        ↑
                      </button>
                      <button type="button" className="btn ghost" onClick={() => void moveRow(c, 1)}>
                        ↓
                      </button>
                    </div>
                  </td>
                  <td>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={d.isActive}
                        onChange={(e) => patchDraft(c.id, { isActive: e.target.checked })}
                      />
                      مفعّل
                    </label>
                  </td>
                  <td>
                    <div className="toolbar" style={{ justifyContent: 'flex-end', flexWrap: 'wrap', gap: 6 }}>
                      <button type="button" className="btn" onClick={() => void saveRow(c)}>
                        حفظ
                      </button>
                      <button type="button" className="btn ghost" onClick={() => void removeRow(c)}>
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!visible.length ? (
              <tr>
                <td colSpan={5} className="muted">
                  لا توجد تصنيفات بعد — أضيفي أول تصنيف من الخانة أعلاه.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
