import { useCallback, useEffect, useState } from 'react'
import {
  BadgeCheck,
  Banknote,
  Check,
  Clock3,
  LoaderCircle,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  ShoppingBag,
  Users,
  Wallet
} from 'lucide-react'
import { api } from './api'
import { LoginPage } from './LoginPage'
import type { AuditLog, Order, StaffCustomer, StaffProfile, StoreSettings } from './types'

type Tab = 'orders' | 'charge'
type Queue = 'waiting' | 'done' | 'all'

const PERMISSIONS = [
  'admin.manage',
  'orders.view',
  'orders.manage',
  'storefront.manage',
  'users.view',
  'users.manage',
  'settings.manage',
  'logs.view',
  'stats.view'
]

const ROLES = ['customer', 'student', 'staff', 'admin']

export function StaffPage({ t, onLogin }: { t: any; onLogin: () => Promise<void> }) {
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [checking, setChecking] = useState(true)
  const [tab, setTab] = useState<Tab>('orders')

  const loadProfile = useCallback(async () => {
    setChecking(true)
    try {
      const me = await api.staffMe()
      setProfile(me)
    } catch {
      setProfile(null)
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => { void loadProfile() }, [loadProfile])

  // Mirrors the backend: ``admin.manage`` implies every other permission.
  const can = (permission: string) =>
    Boolean(
      profile &&
      (profile.is_admin ||
        profile.permissions.includes('admin.manage') ||
        profile.permissions.includes(permission))
    )

  if (checking) {
    return (
      <section className="page-section">
        <div className="container">
          <div className="loading-block"><LoaderCircle className="spin" /><span>{t.brewing}</span></div>
        </div>
      </section>
    )
  }

  if (!profile) {
    return (
      <section className="page-section">
        <div className="container staff-login">
          <p className="staff-login-hint"><ShieldCheck size={16} />{t.staffLoginHint}</p>
          <LoginPage t={t} onDone={async () => { await onLogin(); await loadProfile() }} />
        </div>
      </section>
    )
  }

  const tabs: { id: Tab; label: string; permission: string }[] = [
    { id: 'orders', label: t.staffOrders, permission: 'orders.view' },
    { id: 'charge', label: t.staffCharge, permission: 'orders.manage' }
  ]
  const visible = tabs.filter(entry => can(entry.permission))
  const active = visible.some(entry => entry.id === tab) ? tab : visible[0]?.id

  return (
    <section className="page-section staff-page">
      <div className="container">
        <div className="staff-heading">
          <div>
            <span className="eyebrow">VOLUNTEER</span>
            <h1>{t.staffConsole}</h1>
            <p>{t.staffConsoleSub}</p>
          </div>
          <div className="staff-identity">
            <BadgeCheck size={16} />
            <span><strong>{profile.name}</strong><small>{profile.role}</small></span>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="admin-empty">{t.staffPermissionDenied}</div>
        ) : (
          <>
            <div className="admin-tabs">
              {visible.map(entry => (
                <button
                  key={entry.id}
                  className={active === entry.id ? 'active' : ''}
                  onClick={() => setTab(entry.id)}
                >
                  {entry.label}
                </button>
              ))}
            </div>

            {active === 'orders' && <OrdersTab t={t} canManage={can('orders.manage')} />}
            {active === 'charge' && <ChargeTab t={t} />}
          </>
        )}
      </div>
    </section>
  )
}

function OrdersTab({ t, canManage }: { t: any; canManage: boolean }) {
  const [queue, setQueue] = useState<Queue>('waiting')
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)

  const fetchOrders = useCallback((next: Queue) => {
    api.staffOrders(next === 'all' ? undefined : next).then(setOrders).catch(() => setOrders([]))
  }, [])

  useEffect(() => {
    setLoading(true)
    api.staffOrders(queue === 'all' ? undefined : queue)
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false))
    const id = window.setInterval(() => fetchOrders(queue), 12000)
    return () => window.clearInterval(id)
  }, [queue, fetchOrders])

  const act = async (order: Order) => {
    if (!canManage) return
    setBusy(order.order_id)
    try {
      const updated = order.fulfillment_status === 'done'
        ? await api.staffReopen(order.order_id)
        : await api.staffFulfill(order.order_id)
      setOrders(current => current.map(row => row.order_id === updated.order_id ? updated : row))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="admin-section">
      <div className="admin-toolbar">
        <div className="admin-filters">
          {(['waiting', 'done', 'all'] as Queue[]).map(value => (
            <button
              key={value}
              className={queue === value ? 'active' : ''}
              onClick={() => setQueue(value)}
            >
              {value === 'waiting' ? t.staffWaiting : value === 'done' ? t.staffDone : t.adminAll}
            </button>
          ))}
        </div>
        <button className="button button-dark staff-refresh" onClick={() => fetchOrders(queue)}>
          <RefreshCw size={14} />
        </button>
      </div>

      {loading ? (
        <div className="loading-block"><LoaderCircle className="spin" /><span>{t.brewing}</span></div>
      ) : orders.length === 0 ? (
        <div className="admin-empty">{t.staffNoOrders}</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t.orderNumber}</th>
                <th>{t.adminCustomer}</th>
                <th>{t.adminItems}</th>
                <th className="num">{t.total}</th>
                <th>{t.pickupCode}</th>
                <th>{t.adminStatus}</th>
                <th>{t.adminOrderActions}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.order_id}>
                  <td>#{order.order_id}<small>{order.pickup_time?.slice(0, 5) ?? 'ASAP'}</small></td>
                  <td>{order.customer_name ?? '—'}<small>{order.payment_method}</small></td>
                  <td>{order.items.map(item => `${item.quantity}× ${item.product.product_name}`).join(', ')}</td>
                  <td className="num">¥{Number(order.total_amount).toFixed(2)}</td>
                  <td>{order.pickup_code ?? '—'}</td>
                  <td>
                    <span className={`staff-pill ${order.fulfillment_status}`}>
                      {order.fulfillment_status === 'done' ? t.staffDone : t.staffWaiting}
                    </span>
                    <small>{t[order.payment_status] ?? order.payment_status}</small>
                  </td>
                  <td>
                    {canManage ? (
                      <button
                        className="button button-dark staff-row-action"
                        disabled={busy === order.order_id}
                        onClick={() => act(order)}
                      >
                        {busy === order.order_id
                          ? <LoaderCircle className="spin" size={14} />
                          : order.fulfillment_status === 'done'
                            ? <><RefreshCw size={13} />{t.staffReopen}</>
                            : <><Check size={13} />{t.staffMarkDone}</>}
                      </button>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function ChargeTab({ t }: { t: any }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<StaffCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<StaffCustomer | null>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<{ name: string; amount: number; balance: number } | null>(null)

  useEffect(() => {
    setLoading(true)
    api.staffUsers(search.trim() || undefined)
      .then(setResults)
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [search])

  const value = Number(amount) || 0
  const balance = selected ? Number(selected.balance) : 0
  const overBalance = selected !== null && value > balance

  const pick = (user: StaffCustomer) => {
    setSelected(user)
    setAmount('')
    setNote('')
    setError('')
    setReceipt(null)
  }

  const charge = async () => {
    if (!selected || value <= 0) {
      setError(t.staffChargeInvalid)
      return
    }
    if (overBalance) {
      setError(t.staffChargeInsufficient)
      return
    }
    setBusy(true)
    setError('')
    try {
      const updated = await api.staffCharge(selected.customer_id, amount, note.trim() || undefined)
      setSelected(updated)
      setResults(current => current.map(row => row.customer_id === updated.customer_id ? updated : row))
      setReceipt({
        name: `${updated.first_name} ${updated.last_name}`.trim() || updated.email,
        amount: value,
        balance: Number(updated.balance)
      })
      setAmount('')
      setNote('')
    } catch (err) {
      setError(err instanceof Error ? err.message : t.apiOffline)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-section charge-section">
      <div className="charge-grid">
        <div className="charge-card">
          <span className="eyebrow">01</span>
          <h2>{t.staffFindCustomer}</h2>
          <p>{t.staffFindCustomerSub}</p>
          <label className="staff-search charge-search">
            <Search size={15} />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder={t.staffChargeSearchPlaceholder}
            />
          </label>

          {loading ? (
            <div className="loading-block"><LoaderCircle className="spin" /><span>{t.brewing}</span></div>
          ) : results.length === 0 ? (
            <p className="muted charge-empty">{t.staffNoUsers}</p>
          ) : (
            <div className="charge-results">
              {results.map(user => {
                const active = selected?.customer_id === user.customer_id
                return (
                  <button
                    key={user.customer_id}
                    type="button"
                    className={active ? 'charge-result selected' : 'charge-result'}
                    onClick={() => pick(user)}
                  >
                    <span className="avatar">{(user.first_name[0] ?? '')}{(user.last_name[0] ?? '')}</span>
                    <span className="charge-result-copy">
                      <strong>{user.first_name} {user.last_name}</strong>
                      <small>{user.email} · {user.phone}</small>
                    </span>
                    <span className="charge-result-balance">¥{Number(user.balance).toFixed(2)}</span>
                    {active ? <Check size={15} /> : null}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="charge-card">
          <span className="eyebrow">02</span>
          <h2>{t.staffChargeTitle}</h2>
          <p>{t.staffChargeSub}</p>

          {!selected ? (
            <div className="charge-placeholder">
              <Wallet size={26} />
              <p>{t.staffPickCustomer}</p>
            </div>
          ) : (
            <>
              <div className="charge-customer">
                <span className="avatar">{(selected.first_name[0] ?? '')}{(selected.last_name[0] ?? '')}</span>
                <div>
                  <strong>{selected.first_name} {selected.last_name}</strong>
                  <small>{selected.email}</small>
                </div>
                <div className="charge-customer-balance">
                  <span>{t.staffChargeBalance}</span>
                  <strong>¥{balance.toFixed(2)}</strong>
                </div>
              </div>

              <label className="charge-label">{t.staffChargeAmount}</label>
              <div className="charge-amount-field">
                <span>¥</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={event => { setAmount(event.target.value); setError(''); setReceipt(null) }}
                  placeholder="0.00"
                />
              </div>
              <div className="charge-quick">
                {[5, 10, 20, 50].map(quick => (
                  <button key={quick} type="button" onClick={() => { setAmount(String(quick)); setError(''); setReceipt(null) }}>
                    ¥{quick}
                  </button>
                ))}
                {overBalance && <span className="charge-warning">{t.staffChargeInsufficient}</span>}
              </div>

              <label className="charge-label">{t.staffChargeNote}</label>
              <input
                className="charge-note"
                value={note}
                maxLength={200}
                onChange={event => setNote(event.target.value)}
                placeholder={t.staffChargeNotePlaceholder}
              />

              {receipt && (
                <div className="charge-success">
                  <Check size={16} />
                  <span>
                    {t.staffChargeDone} {receipt.name} · −¥{receipt.amount.toFixed(2)} · {t.staffNewBalance} ¥{receipt.balance.toFixed(2)}
                  </span>
                </div>
              )}
              {error && <div className="inline-error">{error}</div>}

              <button className="button button-dark full" disabled={busy || value <= 0 || overBalance} onClick={charge}>
                {busy
                  ? <><LoaderCircle className="spin" />{t.staffCharging}</>
                  : <><Banknote size={16} />{t.staffChargeSubmit} ¥{value.toFixed(2)}</>}
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

export function UsersTab({ t, canManage }: { t: any; canManage: boolean }) {
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState<StaffCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api.staffUsers(search.trim() || undefined).then(setUsers).catch(() => setUsers([])).finally(() => setLoading(false))
  }, [search])

  useEffect(() => { load() }, [load])

  const save = async (id: number, patch: Parameters<typeof api.staffUpdateUser>[1]) => {
    setBusy(id)
    try {
      const updated = await api.staffUpdateUser(id, patch)
      setUsers(current => current.map(row => row.customer_id === id ? { ...updated, order_count: row.order_count } : row))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="admin-section">
      <div className="admin-toolbar">
        <label className="staff-search">
          <Search size={15} />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={t.staffSearchUsers}
          />
        </label>
        <span className="muted">{users.length} {t.staffUsers}</span>
      </div>

      {loading ? (
        <div className="loading-block"><LoaderCircle className="spin" /><span>{t.brewing}</span></div>
      ) : users.length === 0 ? (
        <div className="admin-empty">{t.staffNoUsers}</div>
      ) : (
        <div className="staff-user-list">
          {users.map(user => (
            <UserRow
              key={user.customer_id}
              t={t}
              user={user}
              canManage={canManage}
              busy={busy === user.customer_id}
              onSave={patch => save(user.customer_id, patch)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function UserRow({
  t, user, canManage, busy, onSave
}: {
  t: any
  user: StaffCustomer
  canManage: boolean
  busy: boolean
  onSave: (patch: { role?: string; permissions?: string[]; blocked?: boolean; loyalty_points?: number; balance_delta?: string; note?: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState<string>(user.role)
  const [permissions, setPermissions] = useState<string[]>(user.permissions)
  const [points, setPoints] = useState(String(user.loyalty_points))
  const [delta, setDelta] = useState('')

  const toggle = (permission: string) => {
    setPermissions(current => current.includes(permission)
      ? current.filter(value => value !== permission)
      : [...current, permission])
  }

  const apply = () => {
    onSave({
      role,
      permissions,
      loyalty_points: Number(points) || 0,
      balance_delta: delta.trim() || undefined
    })
    setDelta('')
  }

  return (
    <article className="staff-user">
      <div className="staff-user-main">
        <span className="avatar">{(user.first_name[0] ?? '')}{user.last_name[0] ?? ''}</span>
        <div className="staff-user-copy">
          <strong>{user.first_name} {user.last_name}
            {user.blocked ? <span className="staff-pill blocked">{t.staffBlocked}</span> : null}
          </strong>
          <small>{user.email} · {user.phone}</small>
        </div>
        <div className="staff-user-stats">
          <span><Users size={13} />{user.order_count} {t.staffOrderCount}</span>
          <span><ShoppingBag size={13} />¥{Number(user.balance).toFixed(2)}</span>
          <span><BadgeCheck size={13} />{user.loyalty_points}</span>
        </div>
        {canManage && (
          <div className="staff-user-actions">
            <button
              className="staff-ghost"
              disabled={busy}
              onClick={() => onSave({ blocked: !user.blocked })}
            >
              {user.blocked ? t.staffUnblock : t.staffBlock}
            </button>
            <button className="staff-ghost" onClick={() => setOpen(value => !value)}>
              {t.staffPermissions}
            </button>
          </div>
        )}
      </div>

      {open && canManage && (
        <div className="staff-user-editor">
          <label className="staff-field">
            <span>{t.staffRole}</span>
            <select value={role} onChange={event => setRole(event.target.value)}>
              {ROLES.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <div className="staff-permissions">
            <span>{t.staffPermissions}</span>
            <div className="staff-permission-grid">
              {PERMISSIONS.map(permission => (
                <label key={permission} className={permissions.includes(permission) ? 'checked' : ''}>
                  <input
                    type="checkbox"
                    checked={permissions.includes(permission)}
                    onChange={() => toggle(permission)}
                  />
                  {permission}
                </label>
              ))}
            </div>
          </div>
          <label className="staff-field">
            <span>{t.staffPoints}</span>
            <input type="number" value={points} onChange={event => setPoints(event.target.value)} />
          </label>
          <label className="staff-field">
            <span>{t.staffBalanceAdjust}</span>
            <input
              type="number"
              step="0.01"
              placeholder="+20.00 / -5.00"
              value={delta}
              onChange={event => setDelta(event.target.value)}
            />
          </label>
          <button className="button button-dark" disabled={busy} onClick={apply}>
            {busy ? <LoaderCircle className="spin" size={14} /> : <><Save size={14} />{t.staffApply}</>}
          </button>
        </div>
      )}
    </article>
  )
}

export function SettingsTab({ t }: { t: any }) {
  const [settings, setSettings] = useState<StoreSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.staffSettings().then(setSettings).catch(() => setSettings(null))
  }, [])

  if (!settings) return <div className="loading-block"><LoaderCircle className="spin" /><span>{t.brewing}</span></div>

  const set = <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) =>
    setSettings(current => current ? { ...current, [key]: value } : current)

  const save = async () => {
    setSaving(true)
    try {
      const updated = await api.staffSaveSettings(settings)
      setSettings(updated)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1800)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="admin-section staff-settings">
      <div className="staff-toggle-row">
        <label className="staff-switch">
          <input type="checkbox" checked={settings.store_open} onChange={event => set('store_open', event.target.checked)} />
          <span>{t.staffStoreOpen}</span>
        </label>
        <label className="staff-switch">
          <input type="checkbox" checked={settings.weekdays_only} onChange={event => set('weekdays_only', event.target.checked)} />
          <span>{t.staffWeekdaysOnly}</span>
        </label>
        <label className="staff-switch">
          <input type="checkbox" checked={settings.allow_pay_later} onChange={event => set('allow_pay_later', event.target.checked)} />
          <span>{t.staffPayLater}</span>
        </label>
        <label className="staff-switch">
          <input type="checkbox" checked={settings.allow_delivery} onChange={event => set('allow_delivery', event.target.checked)} />
          <span>{t.staffDelivery}</span>
        </label>
      </div>

      <div className="staff-settings-grid">
        <label className="staff-field">
          <span>{t.staffOpenTime}</span>
          <input type="time" value={settings.open_time} onChange={event => set('open_time', event.target.value)} />
        </label>
        <label className="staff-field">
          <span>{t.staffCloseTime}</span>
          <input type="time" value={settings.close_time} onChange={event => set('close_time', event.target.value)} />
        </label>
        <label className="staff-field">
          <span>{t.staffMaxPerOrder}</span>
          <input type="number" value={settings.maximum_cups_per_order} onChange={event => set('maximum_cups_per_order', Number(event.target.value))} />
        </label>
        <label className="staff-field">
          <span>{t.staffMaxPerDay}</span>
          <input type="number" value={settings.maximum_cups_per_day} onChange={event => set('maximum_cups_per_day', Number(event.target.value))} />
        </label>
        <label className="staff-field">
          <span>{t.staffMaxBalance}</span>
          <input type="number" step="0.01" value={settings.maximum_balance} onChange={event => set('maximum_balance', event.target.value)} />
        </label>
        <label className="staff-field">
          <span>{t.staffMinTopUp}</span>
          <input type="number" step="0.01" value={settings.balance_recharge_minimum} onChange={event => set('balance_recharge_minimum', event.target.value)} />
        </label>
      </div>

      <label className="staff-field staff-announcement">
        <span>{t.staffAnnouncementField}</span>
        <input value={settings.announcement} onChange={event => set('announcement', event.target.value)} />
      </label>

      <button className="button button-dark" disabled={saving} onClick={save}>
        {saving ? <LoaderCircle className="spin" size={14} /> : saved ? <><Check size={14} />{t.staffSettingsSaved}</> : <><Save size={14} />{t.staffSaveSettings}</>}
      </button>
    </section>
  )
}

export function LogsTab({ t }: { t: any }) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.staffLogs().then(setLogs).catch(() => setLogs([])).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading-block"><LoaderCircle className="spin" /><span>{t.brewing}</span></div>
  if (logs.length === 0) return <div className="admin-empty">{t.staffNoLogs}</div>

  return (
    <section className="admin-section staff-logs">
      {logs.map(log => (
        <div className="staff-log-row" key={log.audit_log_id}>
          <span className="staff-log-icon"><Clock3 size={14} /></span>
          <div>
            <strong>{log.action}{log.target ? ` · ${log.target}` : ''}</strong>
            <small>{new Date(log.created_at).toLocaleString()}{log.actor_customer_id ? ` · #${log.actor_customer_id}` : ''}</small>
            {log.detail && <p>{log.detail}</p>}
          </div>
        </div>
      ))}
    </section>
  )
}
