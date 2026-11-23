"use client";

import { PaginationPageDefault } from "@/components/application/pagination/pagination";

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="px-4 pb-4 md:px-6">
      <PaginationPageDefault page={page} total={pages} onPageChange={onPage} />
    </div>
  );
}
