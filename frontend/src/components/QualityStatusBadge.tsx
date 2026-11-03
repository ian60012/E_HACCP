import { QualityStatus } from '@/types/qualityControl';

const styles: Record<QualityStatus, string> = { not_started: 'bg-gray-100 text-gray-700', draft: 'bg-amber-100 text-amber-800', approved: 'bg-emerald-100 text-emerald-800', rejected: 'bg-red-100 text-red-800' };
const labels: Record<QualityStatus, string> = { not_started: '未填写 Not started', draft: '待品管签核 Pending QA', approved: '已放行 Released', rejected: '未通过 Rejected' };

export default function QualityStatusBadge({ status }: { status?: string | null }) {
  const safeStatus = (status && status in styles ? status : 'not_started') as QualityStatus;
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[safeStatus]}`}>{labels[safeStatus]}</span>;
}
