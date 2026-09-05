import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, apiUpload } from '@/api/client';

type Category = {
  id: string;
  parentId: string | null;
  nameAr: string;
  slug: string;
  imageUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
  parent?: { id: string; nameAr: string; slug: string } | null;
  _count?: { products: number; children: number };
};

type CatTab = 'parents' | 'children';

export function CategoriesPage({ embedded = false }: { embedded?: boolean }) {
  const [rows, setRows] = useState<Category[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [catTab, setCatTab] = useState<CatTab>('parents');
  const [nameAr, setNameAr] = useState('');
  const [parentId, setParentId] = useState('');
  const [addToAllParents, setAddToAllParents] = useState(false);
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

  const parents = useMemo(() => rows.filter((c) => !c.parentId), [rows]);

  const visible = useMemo(() => {
    const term = q.trim();
    const base =
      catTab === 'parents'
        ? rows.filter((c) => !c.parentId)
        : rows.filter((c) => c.parentId);
    const sorted = [...base].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.nameAr.localeCompare(b.nameAr, 'ar'),
    );
    if (!term) return sorted;
    return sorted.filter(
      (c) =>
        c.nameAr.includes(term) ||
        c.parent?.nameAr.includes(term) ||
        drafts[c.id]?.nameAr?.includes(term),
    );
  }, [rows, q, drafts, catTab]);

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
      setError(catTab === 'parents' ? 'اكتبي اسم الفئة' : 'اكتبي اسم الصنف');
      return;
    }
    if (catTab === 'children' && !addToAllParents && !parentId) {
      setError('اختاري الفئة، أو فعّلي «أضف لكل الفئات»');
      return;
    }
    if (catTab === 'children' && addToAllParents && !parents.length) {
      setError('أضيفي فئة رئيسية أولاً');
      return;
    }
    setError('');
    setMsg('');
    setBusy(true);
    try {
      if (catTab === 'children' && addToAllParents) {
        const targets = parents.filter(
          (p) => !rows.some((c) => c.parentId === p.id && c.nameAr.trim() === name),
        );
        const skipped = parents.length - targets.length;
        for (const p of targets) {
          await api('/categories', {
            method: 'POST',
            body: JSON.stringify({ nameAr: name, parentId: p.id }),
          });
        }
        setNameAr('');
        setParentId('');
        setAddToAllParents(false);
        if (!targets.length) {
          setMsg(`«${name}» موجود مسبقاً تحت كل الفئات`);
        } else {
          setMsg(
            skipped > 0
              ? `تم إضافة «${name}» إلى ${targets.length} فئة (وتخطي ${skipped} كانت موجودة)`
              : `تم إضافة «${name}» إلى كل الفئات (${targets.length})`,
          );
        }
      } else {
        await api('/categories', {
          method: 'POST',
          body: JSON.stringify({
            nameAr: name,
            parentId: catTab === 'children' ? parentId : null,
          }),
        });
        setNameAr('');
        setParentId('');
        setMsg(catTab === 'parents' ? 'تم إضافة الفئة' : 'تم إضافة الصنف');
      }
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
      setError('الاسم مطلوب');
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
    if (!confirm(`حذف «${c.nameAr}»؟`)) return;
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

  async function uploadImage(c: Category, file: File | undefined) {
    if (!file) return;
    setError('');
    setMsg('');
    setUploadingId(c.id);
    try {
      await apiUpload(`/categories/${c.id}/image`, file);
      setMsg(`تم رفع صورة «${c.nameAr}»`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل رفع الصورة');
    } finally {
      setUploadingId(null);
    }
  }

  async function clearImage(c: Category) {
    if (!c.imageUrl) return;
    if (!confirm(`إزالة صورة «${c.nameAr}»؟`)) return;
    setError('');
    setMsg('');
    setUploadingId(c.id);
    try {
      await api(`/categories/${c.id}/image`, { method: 'DELETE' });
      setMsg('تم إزالة الصورة');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل إزالة الصورة');
    } finally {
      setUploadingId(null);
    }
  }

  async function moveRow(c: Category, dir: -1 | 1) {
    const siblings = rows
      .filter((r) => (r.parentId || '') === (c.parentId || ''))
      .sort((a, b) => a.sortOrder - b.sortOrder);
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
          <h1>الفئات والأصناف</h1>
          <p>أضيفي فئة رئيسية ثم أصنافاً مثل «مقاس كبير» تحت أي فئة أو لكل الفئات دفعة واحدة. الاسم يمكن أن يتكرر — الرابط يُنشأ تلقائياً لكل فئة.</p>
        </div>
      )}

      <div className="page-tabs" role="tablist" aria-label="الفئات والأصناف">
        <button
          type="button"
          role="tab"
          className={catTab === 'parents' ? 'active' : ''}
          onClick={() => {
            setCatTab('parents');
            setAddToAllParents(false);
          }}
        >
          الفئات ({parents.length})
        </button>
        <button
          type="button"
          role="tab"
          className={catTab === 'children' ? 'active' : ''}
          onClick={() => setCatTab('children')}
        >
          الأصناف ({rows.length - parents.length})
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {msg ? <div className="success">{msg}</div> : null}

      <form className="panel form-grid two" onSubmit={onCreate}>
        {catTab === 'children' ? (
          <label>
            تابع لفئة
            <select
              value={addToAllParents ? '' : parentId}
              onChange={(e) => {
                setAddToAllParents(false);
                setParentId(e.target.value);
              }}
              required={!addToAllParents}
              disabled={addToAllParents}
            >
              <option value="">— اختاري الفئة —</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nameAr}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          {catTab === 'parents' ? 'إضافة فئة' : 'إضافة صنف'}
          <input
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            placeholder={catTab === 'parents' ? 'مثال: لانجري' : 'مثال: مقاس كبير'}
            required
            autoComplete="off"
          />
        </label>
        {catTab === 'children' ? (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <input
              type="checkbox"
              checked={addToAllParents}
              onChange={(e) => {
                setAddToAllParents(e.target.checked);
                if (e.target.checked) setParentId('');
              }}
            />
            <span>أضف لكل الفئات (مثل مقاس كبير تحت كل فئة)</span>
          </label>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'end' }}>
          <button className="btn" type="submit" disabled={busy || !nameAr.trim()}>
            {busy
              ? 'جارٍ الحفظ...'
              : catTab === 'children' && addToAllParents
                ? 'إضافة لكل الفئات'
                : 'إضافة'}
          </button>
        </div>
      </form>

      {catTab === 'children' && !parents.length ? (
        <div className="panel muted">أضيفي فئة رئيسية أولاً ثم أضيفي الأصناف تحتها.</div>
      ) : null}

      <div className="panel table-wrap">
        <div className="toolbar">
          <strong>{catTab === 'parents' ? 'الفئات' : 'الأصناف'} ({visible.length})</strong>
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
              <th>الصورة</th>
              <th>الاسم</th>
              {catTab === 'children' ? <th>الفئة</th> : null}
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
              const busyImg = uploadingId === c.id;
              return (
                <tr key={c.id}>
                  <td>
                    <div className="cat-image-cell">
                      {c.imageUrl ? (
                        <img src={c.imageUrl} alt="" className="cat-image-thumb" />
                      ) : (
                        <span className="cat-image-empty muted">بدون صورة</span>
                      )}
                      <div className="toolbar" style={{ gap: 6, flexWrap: 'wrap' }}>
                        <label className="btn ghost" style={{ cursor: busyImg ? 'wait' : 'pointer' }}>
                          {busyImg ? '...' : c.imageUrl ? 'تغيير' : 'رفع'}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            hidden
                            disabled={busyImg}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              void uploadImage(c, file);
                            }}
                          />
                        </label>
                        {c.imageUrl ? (
                          <button
                            type="button"
                            className="btn ghost"
                            disabled={busyImg}
                            onClick={() => void clearImage(c)}
                          >
                            إزالة
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td>
                    <input
                      value={d.nameAr}
                      onChange={(e) => patchDraft(c.id, { nameAr: e.target.value })}
                    />
                  </td>
                  {catTab === 'children' ? (
                    <td>{c.parent?.nameAr || parents.find((p) => p.id === c.parentId)?.nameAr || '—'}</td>
                  ) : null}
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
                <td colSpan={catTab === 'children' ? 7 : 6} className="muted">
                  {catTab === 'parents'
                    ? 'لا توجد فئات بعد — أضيفي أول فئة من النموذج أعلاه.'
                    : 'لا توجد أصناف بعد — أضيفي صنفاً واربطيه بفئة.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
