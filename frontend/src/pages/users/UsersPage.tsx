import { useState, useEffect, useCallback } from 'react';
import { PlusIcon, PencilIcon, KeyIcon } from '@heroicons/react/24/outline';
import { usersApi } from '@/api/users';
import { User, UserCreate, UserUpdate } from '@/types/auth';
import { useAuth } from '@/hooks/useAuth';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorCard from '@/components/ErrorCard';
import EmptyState from '@/components/EmptyState';
import FormField from '@/components/FormField';
import RoleGate from '@/components/RoleGate';
import Bi, { bi } from '@/components/Bi';

const roleBadge: Record<string, { label: string; className: string }> = {
  Admin: { label: bi('role.admin'), className: 'bg-purple-100 text-purple-700' },
  QA: { label: bi('role.qa'), className: 'bg-green-100 text-green-700' },
  Production: { label: bi('role.production'), className: 'bg-blue-100 text-blue-700' },
  Warehouse: { label: bi('role.warehouse'), className: 'bg-amber-100 text-amber-700' },
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();

  const [items, setItems] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<User | null>(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active');

  // Form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'Admin' | 'QA' | 'Production' | 'Warehouse'>('Production');
  const [isActive, setIsActive] = useState(true);

  // Password reset modal state
  const [showResetPw, setShowResetPw] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await usersApi.list(0, 200);
      setItems(res.items);
    } catch { setError(bi('error.loadFailed')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openCreate = () => {
    setEditingItem(null);
    setUsername(''); setPassword(''); setFullName(''); setEmail('');
    setRole('Production'); setIsActive(true);
    setFormError(''); setShowForm(true);
  };

  const openEdit = (item: User) => {
    setEditingItem(item);
    setUsername(item.username);
    setPassword('');
    setFullName(item.full_name);
    setEmail(item.email || '');
    setRole(item.role);
    setIsActive(item.is_active);
    setFormError(''); setShowForm(true);
  };

  const openResetPw = (item: User) => {
    setResetTarget(item);
    setNewPw(''); setConfirmPw(''); setResetError('');
    setShowResetPw(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(''); setSubmitting(true);
    try {
      if (editingItem) {
        const payload: UserUpdate = {
          full_name: fullName,
          email: email || undefined,
          role,
          is_active: isActive,
        };
        await usersApi.update(editingItem.id, payload);
      } else {
        const payload: UserCreate = {
          username,
          password,
          full_name: fullName,
          email: email || undefined,
          role,
        };
        await usersApi.create(payload);
      }
      setShowForm(false); fetchItems();
    } catch (err: unknown) {
      setFormError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || bi('error.saveFailed'));
    } finally { setSubmitting(false); }
  };

  const handleResetPw = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    if (newPw !== confirmPw) {
      setResetError(bi('confirm.resetPw.mismatch'));
      return;
    }
    setResetting(true);
    try {
      await usersApi.resetPassword(resetTarget!.id, newPw);
      setShowResetPw(false);
      alert(bi('confirm.resetPw.success'));
    } catch (err: unknown) {
      setResetError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || bi('error.saveFailed'));
    } finally { setResetting(false); }
  };

  const toggleActive = async (item: User) => {
    try {
      await usersApi.update(item.id, { is_active: !item.is_active });
      fetchItems();
    } catch { /* ignore */ }
  };

  if (loading) return <LoadingSpinner fullPage />;
  if (error) return <ErrorCard message={error} onRetry={fetchItems} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800"><Bi k="page.users.title" /></h1>
          <p className="text-sm text-gray-500 mt-1"><Bi k="page.users.subtitle" /></p>
        </div>
        <RoleGate roles={['Admin']}>
          <button onClick={openCreate} className="btn btn-primary flex items-center gap-1.5">
            <PlusIcon className="h-5 w-5" /><Bi label={{ zh: '新增使用者', en: 'New User' }} />
          </button>
        </RoleGate>
      </div>

      {/* Filter tabs */}
      {(() => {
        const activeCt = items.filter((i) => i.is_active).length;
        const inactiveCt = items.length - activeCt;
        const filteredItems = items.filter((item) => {
          if (filter === 'active') return item.is_active;
          if (filter === 'inactive') return !item.is_active;
          return true;
        });
        return (
          <>
            <div className="flex items-center gap-2">
              {([
                { key: 'active' as const, label: `${bi('filter.active')} (${activeCt})` },
                { key: 'inactive' as const, label: `${bi('filter.inactive')} (${inactiveCt})` },
                { key: 'all' as const, label: `${bi('filter.all')} (${items.length})` },
              ]).map((f) => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filter === f.key ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>

            {filteredItems.length === 0 ? <EmptyState message={bi('empty.users')} /> : (
              <div className="card overflow-hidden p-0">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600"><Bi k="field.username" /></th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600"><Bi k="field.fullName" /></th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600"><Bi k="field.role" /></th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600"><Bi k="th.status" /></th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600"><Bi k="th.actions" /></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredItems.map((item) => (
                      <tr key={item.id} className={!item.is_active ? 'opacity-50' : ''}>
                        <td className="px-4 py-3 font-medium">{item.username}</td>
                        <td className="px-4 py-3">{item.full_name}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleBadge[item.role]?.className || ''}`}>
                            {roleBadge[item.role]?.label || item.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <RoleGate roles={['Admin']}>
                            <button
                              onClick={() => toggleActive(item)}
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                            >
                              {item.is_active ? <Bi k="status.active" /> : <Bi k="status.inactive" />}
                            </button>
                          </RoleGate>
                          {currentUser?.role !== 'Admin' && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {item.is_active ? <Bi k="status.active" /> : <Bi k="status.inactive" />}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <RoleGate roles={['Admin']}>
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => openResetPw(item)} className="p-1.5 hover:bg-amber-50 rounded-lg" title={bi('btn.resetPassword')}>
                                <KeyIcon className="h-4 w-4 text-amber-600" />
                              </button>
                              <button onClick={() => openEdit(item)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                                <PencilIcon className="h-4 w-4 text-gray-500" />
                              </button>
                            </div>
                          </RoleGate>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        );
      })()}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowForm(false)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-semibold mb-4">{editingItem ? <Bi label={{ zh: '編輯使用者', en: 'Edit User' }} /> : <Bi label={{ zh: '新增使用者', en: 'New User' }} />}</h3>
              {formError && <div className="mb-3 p-2 bg-red-50 text-red-700 text-sm rounded">{formError}</div>}
              <form onSubmit={handleSubmit} className="space-y-4">
                <FormField label={bi('field.username')} required>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="input"
                    required
                    minLength={3}
                    maxLength={50}
                    disabled={!!editingItem}
                  />
                </FormField>

                {!editingItem && (
                  <FormField label={bi('field.password')} required>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input"
                      required
                      minLength={8}
                    />
                  </FormField>
                )}

                <FormField label={bi('field.fullName')} required>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="input"
                    required
                    maxLength={100}
                  />
                </FormField>

                <FormField label={bi('field.email')}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                  />
                </FormField>

                <FormField label={bi('field.role')} required>
                  <select value={role} onChange={(e) => setRole(e.target.value as 'Admin' | 'QA' | 'Production' | 'Warehouse')} className="input">
                    <option value="Admin">{bi('role.admin')}</option>
                    <option value="QA">{bi('role.qa')}</option>
                    <option value="Production">{bi('role.production')}</option>
                    <option value="Warehouse">{bi('role.warehouse')}</option>
                  </select>
                </FormField>

                {editingItem && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <label htmlFor="isActive" className="text-sm font-medium text-gray-700"><Bi label={{ zh: '啟用狀態', en: 'Active Status' }} /></label>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary"><Bi k="btn.cancel" /></button>
                  <button type="submit" disabled={submitting} className="btn btn-primary">{submitting ? <Bi k="btn.saving" /> : <Bi k="btn.save" />}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetPw && resetTarget && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowResetPw(false)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-semibold mb-1"><Bi k="confirm.resetPw.title" /></h3>
              <p className="text-sm text-gray-500 mb-4">
                {resetTarget.full_name} ({resetTarget.username})
              </p>
              {resetError && <div className="mb-3 p-2 bg-red-50 text-red-700 text-sm rounded">{resetError}</div>}
              <form onSubmit={handleResetPw} className="space-y-4">
                <FormField label={bi('confirm.resetPw.newPassword')} required hint={bi('confirm.resetPw.message')}>
                  <input
                    type="password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    className="input"
                    required
                    minLength={8}
                    maxLength={128}
                    autoFocus
                  />
                </FormField>
                <FormField label={bi('confirm.resetPw.confirm')} required>
                  <input
                    type="password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    className="input"
                    required
                    minLength={8}
                    maxLength={128}
                  />
                </FormField>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowResetPw(false)} className="btn btn-secondary"><Bi k="btn.cancel" /></button>
                  <button type="submit" disabled={resetting} className="btn btn-primary">
                    {resetting
                      ? <Bi k="btn.saving" />
                      : <><KeyIcon className="h-4 w-4 inline mr-1" /><Bi k="btn.resetPassword" /></>
                    }
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
