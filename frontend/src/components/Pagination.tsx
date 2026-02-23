import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  total: number;
  hasNext: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
  onGoToPage?: (page: number) => void;
}

export default function Pagination({
  currentPage,
  totalPages,
  total,
  hasNext,
  hasPrev,
  onNext,
  onPrev,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 rounded-b-lg">
      <div className="hidden sm:flex sm:items-center">
        <p className="text-sm text-gray-500">
          共 <span className="font-medium">{total}</span> 筆記錄，
          第 <span className="font-medium">{currentPage}</span> / {totalPages} 頁
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          disabled={!hasPrev}
          className="relative inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeftIcon className="h-4 w-4 mr-1" />
          上一頁
        </button>
        <span className="text-sm text-gray-500 sm:hidden">
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={onNext}
          disabled={!hasNext}
          className="relative inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          下一頁
          <ChevronRightIcon className="h-4 w-4 ml-1" />
        </button>
      </div>
    </div>
  );
}
