import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowRight,
  Check,
  GraduationCap,
  LoaderCircle,
  Mail,
  MessageCircle,
  ShieldCheck,
  Smartphone
} from 'lucide-react'
import { api } from './api'
import type { AuthProviders } from './types'

type Method = 'student' | 'email' | 'phone'

const API_PREFIX = '/api/v1'

export function LoginPage({
  t,
  onDone
}: {
  t: any
  onDone: () => Promise<void> | void
}) {
  const [method, setMethod] = useState<Method>('student')
  const [providers, setProviders] = useState<AuthProviders | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [studentId, setStudentId] = useState('')
  const [studentName, setStudentName] = useState('')
  const [studentPhone, setStudentPhone] = useState('')
  const [email, setEmail] = useState('')
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [phone, setPhone] = useState('')

  useEffect(() => {
    api.authProviders().then(setProviders).catch(() => setProviders(null))
  }, [])

  const finish = async () => {
    await onDone()
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (method === 'student') {
        const parsed = Number(studentId)
        if (!parsed) throw new Error(t.loginStudentHint)
        await api.studentLogin({
          seiue_id: parsed,
          name: studentName.trim() || String(parsed),
          phone: studentPhone.trim() || undefined
        })
      } else if (method === 'phone') {
        if (!phone.trim()) throw new Error(t.loginPhoneHint)
        await api.phoneLogin({
          phone: phone.trim(),
          first_name: first.trim() || undefined,
          last_name: last.trim() || undefined
        })
      } else {
        if (!email.trim()) throw new Error(t.loginEmail)
        await api.manualLogin({
          email: email.trim(),
          first_name: first.trim() || undefined,
          last_name: last.trim() || undefined
        })
      }
      await finish()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  const oauthLink = (provider: 'seiue' | 'feishu' | 'wechat') =>
    `${API_PREFIX}/auth/oauth/${provider}/start`
  const seiueOAuth = providers?.providers.seiue ?? false

  return (
    <div className="login-card login-card-wide">
      <div className="login-hero">
        <div className="login-logo"><ShieldCheck size={28} /></div>
        <div>
          <h2>{t.loginWelcome}</h2>
          <p>{t.loginMethod}</p>
        </div>
      </div>

      <div className="login-method-grid">
        <button
          type="button"
          className={method === 'student' ? 'login-method selected' : 'login-method'}
          onClick={() => setMethod('student')}
        >
          <GraduationCap size={20} />
          <strong>{t.loginStudent}</strong>
          <small>{t.loginStudentSub}</small>
        </button>
        <button
          type="button"
          className={method === 'email' ? 'login-method selected' : 'login-method'}
          onClick={() => setMethod('email')}
        >
          <Mail size={20} />
          <strong>{t.loginEmail}</strong>
          <small>{t.loginEmailSub}</small>
        </button>
        <button
          type="button"
          className={method === 'phone' ? 'login-method selected' : 'login-method'}
          onClick={() => setMethod('phone')}
        >
          <Smartphone size={20} />
          <strong>{t.loginPhone}</strong>
          <small>{t.loginPhoneSub}</small>
        </button>
      </div>

      {method === 'student' && seiueOAuth && (
        <div className="oauth-block">
          <a className="button button-dark full" href={oauthLink('seiue')}>
            <GraduationCap size={17} />
            {t.loginStudent}
            <ArrowRight size={16} />
          </a>
        </div>
      )}

      <form className="manual-login" onSubmit={submit}>
        {method === 'student' ? (
          <>
            <label className="login-field">
              <span>{t.loginStudentId}</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="20240123"
                value={studentId}
                onChange={e => setStudentId(e.target.value)}
              />
            </label>
            <label className="login-field">
              <span>{t.loginStudentName}</span>
              <input
                type="text"
                placeholder={t.loginStudentName}
                value={studentName}
                onChange={e => setStudentName(e.target.value)}
              />
            </label>
            <label className="login-field">
              <span>{t.phone}</span>
              <input
                type="tel"
                placeholder="13800000000"
                value={studentPhone}
                onChange={e => setStudentPhone(e.target.value)}
              />
            </label>
            <small className="login-hint">{t.loginStudentHint}</small>
          </>
        ) : method === 'phone' ? (
          <>
            <label className="login-field">
              <span>{t.phone}</span>
              <input
                type="tel"
                placeholder="13800000000"
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
            </label>
            <div className="login-name-grid">
              <label className="login-field">
                <span>{t.firstName}</span>
                <input type="text" value={first} onChange={e => setFirst(e.target.value)} />
              </label>
              <label className="login-field">
                <span>{t.lastName}</span>
                <input type="text" value={last} onChange={e => setLast(e.target.value)} />
              </label>
            </div>
            <small className="login-hint">{t.loginPhoneHint}</small>
          </>
        ) : (
          <>
            <label className="login-field">
              <span>{t.email}</span>
              <input
                type="email"
                placeholder="you@whale.coffee"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </label>
            <div className="login-name-grid">
              <label className="login-field">
                <span>{t.firstName}</span>
                <input type="text" value={first} onChange={e => setFirst(e.target.value)} />
              </label>
              <label className="login-field">
                <span>{t.lastName}</span>
                <input type="text" value={last} onChange={e => setLast(e.target.value)} />
              </label>
            </div>
          </>
        )}

        {error && <div className="login-error">{error}</div>}
        <button type="submit" className="button button-dark login-submit" disabled={busy}>
          {busy ? <><LoaderCircle className="spin" />{t.placing}</> : <>{t.loginMethod}<ArrowRight /></>}
        </button>
      </form>

      <div className="oauth-row">
        <a
          className={providers?.providers.feishu ? 'oauth-chip' : 'oauth-chip disabled'}
          href={providers?.providers.feishu ? oauthLink('feishu') : undefined}
          aria-disabled={!providers?.providers.feishu}
        >
          <MessageCircle size={16} />
          <span>{t.loginFeishu}</span>
          {providers?.providers.feishu ? <Check size={14} /> : <small>{t.loginNotConfigured}</small>}
        </a>
        <a
          className={providers?.providers.wechat ? 'oauth-chip' : 'oauth-chip disabled'}
          href={providers?.providers.wechat ? oauthLink('wechat') : undefined}
          aria-disabled={!providers?.providers.wechat}
        >
          <MessageCircle size={16} />
          <span>{t.loginWechat}</span>
          {providers?.providers.wechat ? <Check size={14} /> : <small>{t.loginNotConfigured}</small>}
        </a>
      </div>
    </div>
  )
}
