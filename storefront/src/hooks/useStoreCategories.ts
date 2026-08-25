import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { StoreCategory } from '../data/catalog';

export function useStoreCategories() {
  const [categories, setCategories] = useState<StoreCategory[]>([]);

  useEffect(() => {
    api<StoreCategory[]>('/store/categories')
      .then((rows) => {
        if (rows?.length) setCategories(rows);
      })
      .catch(() => undefined);
  }, []);

  return categories;
}
