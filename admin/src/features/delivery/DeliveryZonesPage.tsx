import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '@/api/client';

type Zone = {
  id: string;
  city: string;
  area: string;
  maleFee: string | number;
  femaleFee: string | number;
  sortOrder: number;
  isActive: boolean;
};

type Draft = {
  area: string;
  maleFee: number;
  femaleFee: number;
};

export function DeliveryZonesPage() {
  const [rows, setRows] = useState<Zone[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [area, setArea] = useState('');
  const [maleFee, setMaleFee] = useState(15);
  const [femaleFee, setFemaleFee] = useState(20);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  async function load() {
    const list = await api<Zone[]>('/delivery/zones');
    setRows(list);
    setDrafts(
      Object.fromEntries(
        list.map((z) => [
          z.id,
          {
            area: z.area,
            maleFee: Number(z.maleFee),
            femaleFee: Number(z.femaleFee),
          },
        ]),
      ),
    );
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const visible = useMemo(() => {
    const term = q.trim();
    if (!term) return rows;
    return rows.filter((z) => z.area.includes(term) || drafts[z.id]?.area?.includes(term));
  }, [rows, q, drafts]);

  function patchDraft(id: string, next: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        area: prev[id]?.area ?? '',
        maleFee: prev[id]?.maleFee ?? 0,
        femaleFee: prev[id]?.femaleFee ?? 0,
        ...next,
      },
    }));
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    setBusy(true);
    try {
      await api('/delivery/zones', {
        method: 'POST',
        body: JSON.stringify({
          city: 'طرابلس',
          area: area.trim(),
          maleFee,
          femaleFee,
        }),
      });
      setArea('');
      setMsg('تم إضافة المنطقة وستظهر للزبونة فوراً');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الحفظ');
    } finally {
      setBusy(false);
    }
  }

  async function saveRow(z: Zone) {
    const draft = drafts[z.id];
    if (!draft?.area.trim()) {
      setError('اسم المنطقة مطلوب');
      return;
    }
    setError('');
    setMsg('');
    try {
      await api(`/delivery/zones/${z.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          area: draft.area.trim(),
          maleFee: draft.maleFee,
          femaleFee: draft.femaleFee,
        }),
      });
      setMsg(`تم حفظ «${draft.area.trim()}»`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التحديث');
    }
  }

  async function toggleActive(z: Zone) {
    setError('');
    setMsg('');
    try {
      if (z.isActive) {
        await api(`/delivery/zones/${z.id}/deactivate`, {
          method: 'POST',
          body: '{}',
        });
        setMsg(`تم إخفاء «${z.area}» عن الزبون`);
      } else {
        await api(`/delivery/zones/${z.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isActive: true }),
        });
        setMsg(`أصبحت «${z.area}» ظاهرة للزبون عند الشراء`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التغيير');
    }
  }

  async function removeRow(z: Zone) {
    if (!window.confirm(`حذف منطقة «${z.area}» من قائمة طرابلس؟`)) return;
    setError('');
    try {
      await api(`/delivery/zones/${z.id}`, { method: 'DELETE' });
      setMsg(`تم حذف «${z.area}»`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الحذف');
    }
  }

  async function moveRow(z: Zone, dir: -1 | 1) {
    const idx = rows.findIndex((r) => r.id === z.id);
    const swap = rows[idx + dir];
    if (!swap) return;
    setError('');
    try {
      await Promise.all([
        api(`/delivery/zones/${z.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ sortOrder: swap.sortOrder }),
        }),
        api(`/delivery/zones/${swap.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ sortOrder: z.sortOrder }),
        }),
      ]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الترتيب');
    }
  }

  return (
    <div className="stack">
      <div className="page-title">
        <h1>تعديل مناطق طرابلس</h1>
        <p>
          من هنا تغيّرين أسماء الأحياء، تضيفين منطقة جديدة، ترتّبين القائمة، أو تحذفين مكاناً. مربّع
          «للزبون» إذا كان محدداً تظهر المنطقة عند الشراء، وإذا تُرك فارغاً لا تظهر للزبون.
        </p>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {msg ? <div className="success">{msg}</div> : null}

      <form className="panel form-grid two" onSubmit={onCreate}>
        <label>
          إضافة منطقة جديدة
          <input
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="اكتبي اسم الحي أو المنطقة"
            required
          />
        </label>
        <div className="form-grid two">
          <label>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
                man
              </span>
              سعر الرجالي (د.ل)
            </span>
            <input
              type="number"
              min={0}
              step="0.5"
              value={maleFee}
              onChange={(e) => setMaleFee(Number(e.target.value))}
              required
            />
          </label>
          <label>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
                woman
              </span>
              سعر النسائي (د.ل)
            </span>
            <input
              type="number"
              min={0}
              step="0.5"
              value={femaleFee}
              onChange={(e) => setFemaleFee(Number(e.target.value))}
              required
            />
          </label>
        </div>
        <div>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'جارٍ الحفظ...' : 'إضافة المنطقة'}
          </button>
        </div>
      </form>

      <div className="panel table-wrap">
        <div className="toolbar">
          <strong>أماكن طرابلس ({rows.length})</strong>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث باسم المنطقة..."
            style={{ minWidth: 220, height: 36, padding: '0 12px' }}
          />
        </div>
        <table>
          <thead>
            <tr>
              <th>اسم المنطقة</th>
              <th>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
                    man
                  </span>
                  رجالي
                </span>
              </th>
              <th>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
                    woman
                  </span>
                  نسائي
                </span>
              </th>
              <th title="محدد = تظهر للزبون عند الشراء">للزبون</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((z, i) => (
              <tr key={z.id} style={{ opacity: z.isActive ? 1 : 0.55 }}>
                <td>
                  <input
                    value={drafts[z.id]?.area ?? z.area}
                    onChange={(e) => patchDraft(z.id, { area: e.target.value })}
                    aria-label="اسم المنطقة"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={drafts[z.id]?.maleFee ?? Number(z.maleFee)}
                    onChange={(e) => patchDraft(z.id, { maleFee: Number(e.target.value) })}
                    style={{ width: 90 }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={drafts[z.id]?.femaleFee ?? Number(z.femaleFee)}
                    onChange={(e) => patchDraft(z.id, { femaleFee: Number(e.target.value) })}
                    style={{ width: 90 }}
                  />
                </td>
                <td>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                    title={
                      z.isActive
                        ? 'ظاهرة للزبون — أزلِي التحديد للإخفاء'
                        : 'مخفية عن الزبون — حدّدي المربع لإظهارها'
                    }
                  >
                    <input
                      type="checkbox"
                      checked={z.isActive}
                      onChange={() => void toggleActive(z)}
                      aria-label={
                        z.isActive
                          ? `إخفاء منطقة ${z.area} عن الزبون`
                          : `إظهار منطقة ${z.area} للزبون`
                      }
                      style={{ width: 18, height: 18, accentColor: 'var(--primary)' }}
                    />
                    <span className="muted" style={{ fontSize: 13 }}>
                      {z.isActive ? 'ظاهرة' : 'مخفية'}
                    </span>
                  </label>
                </td>
                <td>
                  <div className="toolbar" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button
                      className="btn ghost"
                      type="button"
                      disabled={i === 0 || Boolean(q.trim())}
                      onClick={() => void moveRow(z, -1)}
                      title="أعلى"
                    >
                      ↑
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      disabled={i === visible.length - 1 || Boolean(q.trim())}
                      onClick={() => void moveRow(z, 1)}
                      title="أسفل"
                    >
                      ↓
                    </button>
                    <button className="btn secondary" type="button" onClick={() => void saveRow(z)}>
                      حفظ
                    </button>
                    <button className="btn ghost" type="button" onClick={() => void removeRow(z)}>
                      حذف
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
