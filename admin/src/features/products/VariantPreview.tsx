import type { ColorGroup } from './productTypes';
import { variantPreviewRows } from './productUtils';

type Props = {
  colorGroups: ColorGroup[];
  retailPrice: number;
};

export function VariantPreview({ colorGroups, retailPrice }: Props) {
  const rows = variantPreviewRows(colorGroups, retailPrice);
  const byColor = colorGroups.map((g) => ({
    color: g.color,
    count: g.sizes.length,
  }));

  if (!rows.length) {
    return (
      <div className="pf-card">
        <h3>المتغيرات</h3>
        <p className="muted">أضيفي لونًا ومقاسات لعرض المتغيرات التي ستُنشأ تلقائيًا.</p>
      </div>
    );
  }

  return (
    <div className="pf-card">
      <h3>معاينة المتغيرات</h3>
      <p className="pf-variant-total">
        سيتم إنشاء <strong>{rows.length}</strong> متغيرًا تلقائيًا
      </p>
      <ul className="pf-variant-breakdown">
        {byColor
          .filter((c) => c.count > 0)
          .map((c) => (
            <li key={c.color}>
              {c.color} × {c.count} مقاسات = {c.count}
            </li>
          ))}
      </ul>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>اللون</th>
              <th>المقاس</th>
              <th>المخزون</th>
              <th>السعر</th>
              <th>SKU / باركود</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.color}-${r.size}`}>
                <td>{r.color}</td>
                <td>{r.size}</td>
                <td>{r.qty}</td>
                <td>{r.price.toLocaleString('ar-LY')} د.ل</td>
                <td className="muted">يُولَّد عند الحفظ</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
