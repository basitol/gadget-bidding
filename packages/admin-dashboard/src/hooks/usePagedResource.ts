import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PageResult } from '../api';

function totalPagesOf(pagination?: PageResult<unknown>['pagination']) {
  if (!pagination) return 1;
  return (
    pagination.totalPages ||
    pagination.total_pages ||
    Math.max(1, Math.ceil((pagination.total || 0) / (pagination.limit || 20)))
  );
}

export function usePagedResource<T>(
  fetcher: (params: {
    page: number;
    limit: number;
  }) => Promise<PageResult<T>>,
  deps: unknown[]
) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetcher({ page, limit });
      setItems(res.data || []);
      setTotal(res.pagination?.total || 0);
      setTotalPages(totalPagesOf(res.pagination));
    } catch (err: any) {
      setError(err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, ...deps]);

  useEffect(() => {
    load();
  }, [load]);

  const resetPage = useCallback(() => setPage(1), []);

  return {
    page,
    setPage,
    limit,
    setLimit: (value: number) => {
      setLimit(value);
      setPage(1);
    },
    items,
    setItems,
    total,
    totalPages,
    loading,
    error,
    setError,
    reload: load,
    resetPage,
  };
}

export function useInfiniteResource<T>(
  fetcher: (params: {
    page: number;
    limit: number;
  }) => Promise<PageResult<T>>,
  deps: unknown[],
  pageSize = 25
) {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const depsKey = useMemo(() => JSON.stringify(deps), [deps]);

  const loadPage = useCallback(
    async (nextPage: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError('');
      try {
        const res = await fetcher({ page: nextPage, limit: pageSize });
        const batch = res.data || [];
        setItems(prev => (append ? [...prev, ...batch] : batch));
        const tot = res.pagination?.total || batch.length;
        setTotal(tot);
        const pages = totalPagesOf(res.pagination);
        setHasMore(nextPage < pages && batch.length > 0);
        setPage(nextPage);
      } catch (err: any) {
        setError(err.message || 'Request failed');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetcher, pageSize, depsKey]
  );

  useEffect(() => {
    setItems([]);
    setHasMore(true);
    loadPage(1, false);
  }, [loadPage]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    loadPage(page + 1, true);
  }, [loading, loadingMore, hasMore, loadPage, page]);

  return {
    items,
    setItems,
    total,
    hasMore,
    loading,
    loadingMore,
    error,
    setError,
    loadMore,
    reload: () => loadPage(1, false),
  };
}
