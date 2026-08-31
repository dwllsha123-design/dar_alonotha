import {
  COLOR_OPTIONS,
  MAX_COLOR_IMAGES,
  SIZE_OPTIONS,
  type ColorGroup,
  type LocalImage,
} from './productTypes';
import { ImageDropzone } from './ImageDropzone';
import { colorHex } from './productUtils';

type Props = {
  group: ColorGroup;
  retailPrice: number;
  onChange: (next: ColorGroup) => void;
  onRemove: () => void;
};

export function ColorCard({ group, retailPrice, onChange, onRemove }: Props) {
  function setImages(images: LocalImage[]) {
    onChange({ ...group, images });
  }

  function toggleSize(size: string) {
    const sizes = group.sizes.includes(size)
      ? group.sizes.filter((s) => s !== size)
      : [...group.sizes, size];
    const qtyBySize = { ...group.qtyBySize };
    if (!qtyBySize[size]) qtyBySize[size] = '0';
    onChange({ ...group, sizes, qtyBySize });
  }

  function setColorName(name: string) {
    onChange({ ...group, color: name });
  }

  return (
    <div className="pf-color-card">
      <div className="pf-color-card-head">
        <span className="color-chip">
          <span
            className="color-dot"
            style={{ background: colorHex(group.color) || '#ccc' }}
          />
          {group.color || 'لون جديد'}
        </span>
        <button type="button" className="btn ghost" onClick={onRemove}>
          حذف اللون
        </button>
      </div>

      <div className="pf-color-pick-row">
        <div className="color-swatches" role="listbox" aria-label="اختيار اللون">
          {COLOR_OPTIONS.map((c) => {
            const on = group.color === c.name;
            return (
              <button
                key={c.name}
                type="button"
                title={c.name}
                aria-label={c.name}
                aria-pressed={on}
                className={`color-swatch${c.light ? ' light' : ''}${on ? ' active' : ''}`}
                style={{ background: c.hex }}
                onClick={() => setColorName(c.name)}
              >
                {on ? <span className="tick">✓</span> : null}
              </button>
            );
          })}
        </div>
        <label className="pf-custom-color">
          اسم اللون
          <input
            value={group.color}
            onChange={(e) => setColorName(e.target.value)}
            placeholder="مثال: وردي فاتح"
          />
        </label>
      </div>

      <ImageDropzone
        images={group.images}
        max={MAX_COLOR_IMAGES}
        onChange={setImages}
        label={`صور اللون (${group.images.length}/${MAX_COLOR_IMAGES})`}
        hint="اسحب حتى 4 صور هنا أو اختاري من الجهاز"
      />

      <div className="pf-sizes-block">
        <div className="pf-section-label">المقاسات</div>
        <div className="size-pills" role="listbox" aria-label="المقاسات">
          {SIZE_OPTIONS.map((s) => {
            const on = group.sizes.includes(s.value);
            return (
              <button
                key={s.value}
                type="button"
                className={`size-pill${s.wide ? ' wide' : ''}${on ? ' active' : ''}`}
                aria-pressed={on}
                onClick={() => toggleSize(s.value)}
              >
                {s.value}
              </button>
            );
          })}
        </div>
      </div>

      {group.sizes.length ? (
        <div className="table-wrap pf-stock-table">
          <table>
            <thead>
              <tr>
                <th>المقاس</th>
                <th>المخزون</th>
                <th>السعر</th>
                <th>SKU</th>
                <th>الباركود</th>
              </tr>
            </thead>
            <tbody>
              {group.sizes.map((size) => (
                <tr key={size}>
                  <td>{size}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={group.qtyBySize[size] ?? '0'}
                      onChange={(e) =>
                        onChange({
                          ...group,
                          qtyBySize: { ...group.qtyBySize, [size]: e.target.value },
                        })
                      }
                      style={{ width: 88, height: 36 }}
                    />
                  </td>
                  <td>{retailPrice.toLocaleString('ar-LY')} د.ل</td>
                  <td className="muted">تلقائي</td>
                  <td className="muted">تلقائي DO-…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 13 }}>
          اختاري مقاسًا واحدًا على الأقل لهذا اللون.
        </p>
      )}
    </div>
  );
}
