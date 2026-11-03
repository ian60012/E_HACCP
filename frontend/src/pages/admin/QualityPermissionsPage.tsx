import { useEffect, useState } from 'react';
import { ShieldCheckIcon } from '@heroicons/react/24/outline';
import { qualityControlApi, qualityError } from '@/api/qualityControl';
import ErrorCard from '@/components/ErrorCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import { QualityPermissionsConfig, QualityRolePermission } from '@/types/qualityControl';

const roleLabels: Record<string, string> = {
  Admin: '管理员 Admin', QA: '品管 QA', Production: '生产 Production', Warehouse: '仓库 Warehouse', Captain: 'Captain',
};

export default function QualityPermissionsPage() {
  const [config, setConfig] = useState<QualityPermissionsConfig | null>(null);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { setConfig(await qualityControlApi.getPermissions()); } catch (caught) { setError(qualityError(caught)); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const update = (role: string, field: 'can_view' | 'can_edit' | 'can_verify', checked: boolean) => {
    if (!config) return;
    const roles = config.roles.map((row): QualityRolePermission => {
      if (row.role !== role || row.fixed) return row;
      const next = { ...row, [field]: checked };
      if (field === 'can_view' && !checked) { next.can_edit = false; next.can_verify = false; }
      if ((field === 'can_edit' || field === 'can_verify') && checked) next.can_view = true;
      return next;
    });
    setConfig({ ...config, roles }); setMessage('');
  };

  const save = async () => {
    if (!config) return; setSaving(true); setError(''); setMessage('');
    try { setConfig(await qualityControlApi.updatePermissions(config.roles)); setMessage('权限设置已保存 Permissions saved'); }
    catch (caught) { setError(qualityError(caught)); } finally { setSaving(false); }
  };

  if (loading && !config) return <LoadingSpinner />;
  if (error && !config) return <ErrorCard message={error} onRetry={load} />;
  if (!config) return null;

  return <div className="mx-auto max-w-5xl space-y-6">
    <header><div className="flex items-center gap-3"><div className="rounded-xl bg-indigo-100 p-3 text-indigo-700"><ShieldCheckIcon className="h-7 w-7" /></div><div><h1 className="text-2xl font-bold text-gray-900">品质检验权限管控</h1><p className="text-sm text-gray-500">Quality inspection access control</p></div></div></header>
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">品质放行规则自 {new Date(config.enforcement_started_at).toLocaleString()} 起对新批次生效；此前建立的历史批次不会被新入库关卡阻塞。</div>
    {error && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    {message && <div aria-live="polite" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
    <section className="card overflow-hidden" aria-labelledby="permission-table-heading">
      <div className="mb-4"><h2 id="permission-table-heading" className="text-lg font-semibold text-gray-900">角色权限 Role permissions</h2><p className="text-sm text-gray-500">“填写/修改”或“签核放行”会自动包含查看权限。管理员与 Captain 权限固定，避免系统锁死。</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b text-left text-gray-500"><th scope="col" className="px-3 py-3">角色 Role</th><th scope="col" className="px-3 py-3 text-center">查看 View</th><th scope="col" className="px-3 py-3 text-center">填写/修改 Edit</th><th scope="col" className="px-3 py-3 text-center">签核放行 Verify</th></tr></thead>
        <tbody className="divide-y">{config.roles.map((row) => <tr key={row.role}><th scope="row" className="px-3 py-4 text-left font-medium text-gray-900">{roleLabels[row.role] || row.role}{row.fixed && <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">固定 Fixed</span>}</th>
          {(['can_view', 'can_edit', 'can_verify'] as const).map((field) => <td key={field} className="px-3 py-4 text-center"><input className="h-5 w-5 rounded border-gray-300" type="checkbox" aria-label={`${roleLabels[row.role]} ${field}`} checked={row[field]} disabled={row.fixed || saving} onChange={(event) => update(row.role, field, event.target.checked)} /></td>)}</tr>)}</tbody>
      </table></div>
    </section>
    <div className="flex justify-end"><button type="button" className="btn btn-primary min-h-11 min-w-36" disabled={saving} onClick={save}>{saving ? '保存中 Saving…' : '保存权限 Save'}</button></div>
  </div>;
}
