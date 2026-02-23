import { useState, useCallback } from 'react';

interface PaginationState {
  skip: number;
  limit: number;
  total: number;
}

export function usePagination(initialLimit = 20) {
  const [pagination, setPagination] = useState<PaginationState>({
    skip: 0,
    limit: initialLimit,
    total: 0,
  });

  const setTotal = useCallback((total: number) => {
    setPagination((prev) => ({ ...prev, total }));
  }, []);

  const nextPage = useCallback(() => {
    setPagination((prev) => {
      const newSkip = prev.skip + prev.limit;
      return newSkip < prev.total ? { ...prev, skip: newSkip } : prev;
    });
  }, []);

  const prevPage = useCallback(() => {
    setPagination((prev) => {
      const newSkip = Math.max(0, prev.skip - prev.limit);
      return { ...prev, skip: newSkip };
    });
  }, []);

  const goToPage = useCallback((page: number) => {
    setPagination((prev) => ({
      ...prev,
      skip: (page - 1) * prev.limit,
    }));
  }, []);

  const currentPage = Math.floor(pagination.skip / pagination.limit) + 1;
  const totalPages = Math.ceil(pagination.total / pagination.limit);
  const hasNext = pagination.skip + pagination.limit < pagination.total;
  const hasPrev = pagination.skip > 0;

  return {
    ...pagination,
    currentPage,
    totalPages,
    hasNext,
    hasPrev,
    setTotal,
    nextPage,
    prevPage,
    goToPage,
  };
}
