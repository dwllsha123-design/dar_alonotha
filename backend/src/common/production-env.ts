export function isProduction() {
  return process.env.NODE_ENV === 'production';
}

export function assertProductionEnv() {
  if (!isProduction()) return;

  const secret = process.env.JWT_SECRET || '';
  if (
    !secret ||
    /change-me|REPLACE_WITH/i.test(secret) ||
    secret.length < 32
  ) {
    throw new Error(
      'في الإنتاج يجب تعيين JWT_SECRET عشوائي بطول 32 حرفاً على الأقل (ولا تستخدم القيمة الافتراضية).',
    );
  }

  const dbUrl = (process.env.DATABASE_URL || '').trim();
  if (!dbUrl) {
    throw new Error(
      'في الإنتاج يجب تعيين DATABASE_URL إلى PostgreSQL (مثال: ${{Postgres.DATABASE_URL}}).',
    );
  }
  if (dbUrl.startsWith('file:') || /sqlite/i.test(dbUrl)) {
    throw new Error(
      'في الإنتاج ممنوع استخدام SQLite. عيّني DATABASE_URL إلى Railway PostgreSQL فقط — لا يوجد fallback إلى ملف محلي.',
    );
  }
  if (!/^postgres(ql)?:\/\//i.test(dbUrl)) {
    throw new Error(
      'في الإنتاج يجب أن يبدأ DATABASE_URL بـ postgresql:// أو postgres://',
    );
  }

  const cors = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (!cors.length) {
    throw new Error(
      'في الإنتاج يجب تعيين CORS_ORIGINS بنطاقات الواجهات، مثال: https://daralonotha.com,https://admin.daralonotha.com',
    );
  }

  const appUrl = process.env.APP_URL || '';
  const storeUrl = process.env.STORE_URL || '';
  if (!appUrl || appUrl.includes('localhost')) {
    throw new Error('في الإنتاج يجب تعيين APP_URL إلى عنوان الـ API العام.');
  }
  if (!storeUrl || storeUrl.includes('localhost')) {
    throw new Error('في الإنتاج يجب تعيين STORE_URL إلى عنوان المتجر العام.');
  }
}
