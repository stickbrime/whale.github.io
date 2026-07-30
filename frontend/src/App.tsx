import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Bell,
  Check,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Coffee,
  CreditCard,
  Eye,
  Globe2,
  Heart,
  Leaf,
  LoaderCircle,
  LockKeyhole,
  Menu,
  Minus,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trash2,
  X
} from 'lucide-react'
import { api } from './api'
import { copy } from './i18n'
import type { AuthStatus, CartItem, Category, CreditStatus, Customer, Language, Order, Product } from './types'

const productArt: Record<string, string> = {
  Espresso: 'https://images.unsplash.com/photo-1510707577719-ae7c14805e3a?auto=format&fit=crop&w=900&q=82',
  Cappuccino: 'https://images.unsplash.com/photo-1534778101976-62847782c213?auto=format&fit=crop&w=900&q=82',
  'Cold Brew': 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=900&q=82',
  'Chai Latte': 'https://images.unsplash.com/photo-1571934811356-5cc061b6821f?auto=format&fit=crop&w=900&q=82',
  'Butter Croissant': 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=900&q=82'
}

const fallbackArt = 'https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=900&q=82'

function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) as T : initial
    } catch { return initial }
  })
  useEffect(() => localStorage.setItem(key, JSON.stringify(value)), [key, value])
  return [value, setValue] as const
}

function App() {
  const path = usePath()
  const [language, setLanguage] = useStoredState<Language>('whale-language', 'en')
  const [cart, setCart] = useStoredState<CartItem[]>('whale-cart', [])
  const [customerId, setCustomerId] = useStoredState<number | null>('whale-customer', null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const t = copy[language]

  const refreshAuth = useCallback(() => api.authStatus().then(status => {
    setAuth(status)
    if (status.customer) setCustomerId(status.customer.customer_id)
  }).catch(() => setAuth(null)), [setCustomerId])
  useEffect(() => { void refreshAuth() }, [refreshAuth])

  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const addToCart = (product: Product) => {
    setCart(current => {
      const found = current.find(item => item.product_id === product.product_id)
      return found
        ? current.map(item => item.product_id === product.product_id
          ? { ...item, quantity: Math.min(item.quantity + 1, item.stock_quantity) }
          : item)
        : [...current, { ...product, quantity: 1 }]
    })
    setToast(t.cartUpdated)
    window.setTimeout(() => setToast(''), 1800)
  }

  const locked = Boolean(auth?.credit?.locked)
  const page = path === '/shop'
    ? <ShopPage t={t} addToCart={addToCart} locked={locked} cart={cart} />
    : path === '/cart'
    ? <CartPage t={t} cart={cart} setCart={setCart} />
    : path === '/checkout'
      ? <CheckoutPage t={t} cart={cart} clearCart={() => setCart([])} customerId={customerId} setCustomerId={setCustomerId} auth={auth} />
      : path === '/account'
        ? <AccountPage t={t} customerId={customerId} setCustomerId={setCustomerId} auth={auth} refreshAuth={refreshAuth} />
        : <OrderPage t={t} addToCart={addToCart} locked={locked} cart={cart} />

  return (
    <div className="app-shell" lang={language === 'zh' ? 'zh-CN' : 'en'}>
      <Header
        t={t}
        itemCount={itemCount}
        onSettings={() => setSettingsOpen(true)}
      />
      <main>{page}</main>
      <Footer t={t} />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        language={language}
        setLanguage={setLanguage}
        t={t}
      />
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  )
}

function Header({ t, itemCount, onSettings }: { t: any; itemCount: number; onSettings: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const links = [
    { to: '/', label: t.order },
    { to: '/shop', label: t.shop },
    { to: '/cart', label: t.cart },
    { to: '/account', label: t.account }
  ]
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" to="/" aria-label="Whale home">
          <span className="brand-mark"><Coffee size={21} strokeWidth={1.8} /></span>
          <span>WHALE</span>
        </Link>
        <nav className={mobileOpen ? 'main-nav mobile-open' : 'main-nav'} aria-label="Main navigation">
          {links.map(link => (
            <NavLink key={link.to} to={link.to} end={link.to === '/'} onClick={() => setMobileOpen(false)}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="header-actions">
          <button className="icon-button" onClick={onSettings} aria-label={t.menuButton}><Settings size={19} /></button>
          <Link className="cart-button" to="/cart" aria-label={`${t.cart}: ${itemCount} ${t.items}`}>
            <ShoppingBag size={19} />
            {itemCount > 0 && <span>{itemCount}</span>}
          </Link>
          <button className="mobile-menu" onClick={() => setMobileOpen(value => !value)} aria-label="Menu">
            {mobileOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>
    </header>
  )
}

function OrderPage({ t, addToCart, locked, cart }: { t: any; addToCart: (product: Product) => void; locked: boolean; cart: CartItem[] }) {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadMenu = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [menu, groups] = await Promise.all([api.products(), api.categories()])
      setProducts(menu); setCategories(groups)
    } catch (err) { setError(err instanceof Error ? err.message : t.apiOffline) }
    finally { setLoading(false) }
  }, [t.apiOffline])

  useEffect(() => { void loadMenu() }, [loadMenu])
  const featured = products.slice(0, 3)

  return (
    <>
      <section className="hero">
        <div className="hero-overlay" />
        <div className="container hero-content">
          <span className="eyebrow light"><Sparkles size={13} /> {t.greeting}</span>
          <h1>{t.heroTitle}</h1>
          <p>{t.heroBody}</p>
          <Link className="button button-light" to="/shop">{t.orderNow}<ArrowRight size={17} /></Link>
        </div>
        <div className="hero-note"><Leaf size={16} /> 100% arabica</div>
      </section>

      <section className="menu-section" id="menu">
        <div className="container">
          {locked && <LockBanner t={t} />}
          <div className="section-heading-row">
            <div><span className="eyebrow">WHALE COLLECTION</span><h2>{t.menu}</h2><p>{t.menuSub}</p></div>
            <Link className="shop-all-link" to="/shop">{t.shopAll}<ArrowRight /></Link>
          </div>
          {loading ? <LoadingBlock /> : error ? <ErrorBlock text={error || t.apiOffline} retry={loadMenu} t={t} /> : (
            <div className="product-grid home-preview-grid">
              {featured.map((product, index) => (
                <article className="product-card" key={product.product_id} style={{ '--delay': `${index * 55}ms` } as React.CSSProperties}>
                  <div className="product-image-wrap">
                    <img src={productArt[product.product_name] ?? fallbackArt} alt={product.product_name} className="product-image" />
                    <span className={availableStock(product, cart) > 0 ? 'stock-pill' : 'stock-pill sold-out'}>{availableStock(product, cart) > 0 ? `${availableStock(product, cart)} ${t.left}` : t.soldOut}</span>
                    <button className="heart-button" aria-label="Add to favorites"><Heart size={18} /></button>
                  </div>
                  <div className="product-info">
                    <div><span className="product-kind">{categoryName(categories.find(c => c.category_id === product.category_id)?.category_name ?? 'Coffee', t)}</span><h3>{product.product_name}</h3></div>
                    <p>{product.description}</p>
                    <div className="product-bottom"><strong>${Number(product.price).toFixed(2)}</strong><button disabled={availableStock(product, cart) === 0 || locked} onClick={() => addToCart(product)}>{availableStock(product, cart) === 0 ? t.soldOut : <><Plus size={16} /> {t.add}</>}</button></div>
                  </div>
                </article>
              ))}
            </div>
          )}
          {!loading && !error && featured.length === 0 && <div className="empty-state compact"><Coffee /><h3>{t.noMatches}</h3><p>{t.noMatchesSub}</p></div>}
          {!loading && featured.length > 0 && <div className="home-shop-all"><Link className="button button-dark" to="/shop">{t.shopAll}<ArrowRight /></Link></div>}
        </div>
      </section>
      <section className="values-strip"><div className="container values-grid"><Value icon={<Leaf />} title={t.responsibleTitle} text={t.responsibleText} /><Value icon={<Coffee />} title={t.roastedTitle} text={t.roastedText} /><Value icon={<Clock3 />} title={t.readyTitle} text={t.readyText} /></div></section>
    </>
  )
}

function ShopPage({ t, addToCart, locked, cart }: { t: any; addToCart: (product: Product) => void; locked: boolean; cart: CartItem[] }) {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [category, setCategory] = useState<number | 'all'>('all')
  const [sort, setSort] = useState('featured')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => { Promise.all([api.products(), api.categories()]).then(([items, groups]) => { setProducts(items); setCategories(groups) }).finally(() => setLoading(false)) }, [])
  const listed = products.filter(item => (category === 'all' || item.category_id === category) && item.product_name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => {
    if (sort === 'priceLow') return Number(a.price) - Number(b.price)
    if (sort === 'priceHigh') return Number(b.price) - Number(a.price)
    if (sort === 'nameAZ') return a.product_name.localeCompare(b.product_name)
    if (sort === 'stockHigh') return b.stock_quantity - a.stock_quantity
    return a.product_id - b.product_id
  })
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  return <section className="page-section shop-page"><div className="container">
    <div className="shop-hero"><div><span className="eyebrow">WHALE MARKET</span><h1>{t.commodities}</h1><p>{t.commoditiesSub}</p></div><div className="shop-hero-mark"><Coffee /><span>{t.catalogNote}</span></div></div>
    {locked && <LockBanner t={t} />}
    <div className="shop-toolbar"><label className="search-box"><Search /><input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.search} /></label><div className="filter-tabs shop-tabs"><button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>{t.all}</button>{categories.map(group => <button className={category === group.category_id ? 'active' : ''} onClick={() => setCategory(group.category_id)} key={group.category_id}>{categoryName(group.category_name, t)}</button>)}</div><label className="sort-control"><span>{t.sortBy}</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="featured">{t.featured}</option><option value="priceLow">{t.priceLow}</option><option value="priceHigh">{t.priceHigh}</option><option value="nameAZ">{t.nameAZ}</option><option value="stockHigh">{t.stockHigh}</option></select></label></div>
    <div className="shop-meta"><span>{t.showing} <strong>{listed.length}</strong> / {products.length}</span>{cartCount > 0 && <Link to="/cart"><ShoppingBag />{cartCount} {t.inYourCart}<ArrowRight /></Link>}</div>
    {loading ? <LoadingBlock text={t.brewing} /> : <div className="catalog-grid">{listed.map((item, index) => {
      const available = availableStock(item, cart)
      const reserved = cart.find(cartItem => cartItem.product_id === item.product_id)?.quantity ?? 0
      const soldOut = available === 0
      return <article className={soldOut ? 'catalog-card is-sold-out' : 'catalog-card'} key={item.product_id} style={{ '--delay': `${index * 45}ms` } as React.CSSProperties}>
        <div className="catalog-image"><img src={productArt[item.product_name] ?? fallbackArt} alt={item.product_name} />{soldOut && <div className="sold-out-overlay"><span>{t.soldOut}</span><small>{t.soldOutNote}</small></div>}<span className="catalog-category">{categoryName(categories.find(c => c.category_id === item.category_id)?.category_name ?? '', t)}</span></div>
        <div className="catalog-copy"><div className="catalog-title"><h2>{item.product_name}</h2><strong>${Number(item.price).toFixed(2)}</strong></div><p>{item.description}</p><div className="inventory-row"><div><span>{t.inventory}</span><strong className={soldOut ? 'inventory-zero' : ''}>{soldOut ? t.soldOut : `${available} ${t.available}`}</strong></div>{reserved > 0 && <div className="reserved-count"><ShoppingBag />{reserved} {t.inYourCart}</div>}</div><button className="catalog-add" disabled={locked || soldOut} onClick={() => addToCart(item)}>{soldOut ? t.soldOut : <><Plus />{t.add}<span>·</span>${Number(item.price).toFixed(2)}</>}</button></div>
      </article>
    })}</div>}
    {!loading && listed.length === 0 && <div className="empty-state compact"><Search /><h3>{t.noMatches}</h3><p>{t.noMatchesSub}</p></div>}
  </div></section>
}

function CartPage({ t, cart, setCart }: { t: any; cart: CartItem[]; setCart: (value: CartItem[] | ((current: CartItem[]) => CartItem[])) => void }) {
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)
  const updateQuantity = (id: number, delta: number) => setCart(current => current.map(item => item.product_id === id ? { ...item, quantity: Math.max(0, Math.min(item.stock_quantity, item.quantity + delta)) } : item).filter(item => item.quantity > 0))
  const customize = (id: number, value: string) => setCart(current => current.map(item => item.product_id === id ? { ...item, customization: value } : item))

  return <section className="page-section"><div className="container narrow-page">
    <div className="cart-title-row"><PageTitle eyebrow="YOUR SELECTION" title={t.yourCart} subtitle={t.cartSub} />{cart.length > 0 && <button className="clear-cart" onClick={() => { if (window.confirm(t.clearCartConfirm)) setCart([]) }}><Trash2 />{t.clearCart}</button>}</div>
    {cart.length === 0 ? <div className="empty-state"><div className="empty-icon"><ShoppingBag /></div><h2>{t.emptyCart}</h2><p>{t.emptyCartSub}</p><Link className="button button-dark" to="/">{t.browse}<ArrowRight size={17} /></Link></div> : (
      <div className="cart-layout">
        <div className="cart-list">
          {cart.map(item => <article className="cart-item" key={item.product_id}>
            <img src={productArt[item.product_name] ?? fallbackArt} alt="" />
            <div className="cart-item-main"><div className="cart-item-title"><div><span>{t.coffee}</span><h3>{item.product_name}</h3></div><strong>${(Number(item.price) * item.quantity).toFixed(2)}</strong></div>
              <p>${Number(item.price).toFixed(2)} {t.each}</p>
              <input className="customization-input" placeholder={`${t.customization} (${t.optional})`} value={item.customization ?? ''} onChange={e => customize(item.product_id, e.target.value)} />
              <div className="cart-item-actions"><div className="stepper"><button onClick={() => updateQuantity(item.product_id, -1)}><Minus size={15} /></button><span>{item.quantity}</span><button onClick={() => updateQuantity(item.product_id, 1)}><Plus size={15} /></button></div><button className="text-button danger" onClick={() => setCart(current => current.filter(x => x.product_id !== item.product_id))}><Trash2 size={15} />{t.remove}</button></div>
            </div>
          </article>)}
        </div>
        <aside className="order-summary"><span className="eyebrow">{t.currentOrder}</span><h2>{t.total}</h2><div className="summary-line"><span>{t.subtotal}</span><span>${subtotal.toFixed(2)}</span></div><div className="summary-line"><span>{t.service}</span><span>—</span></div><div className="summary-total"><span>{t.total}</span><strong>${subtotal.toFixed(2)}</strong></div><Link className="button button-dark full" to="/checkout">{t.continueCheckout}<ArrowRight size={17} /></Link><Link className="continue-link" to="/"><ArrowLeft size={14} />{t.editOrder}</Link></aside>
      </div>
    )}
  </div></section>
}

function CheckoutPage({ t, cart, clearCart, customerId, setCustomerId, auth }: { t: any; cart: CartItem[]; clearCart: () => void; customerId: number | null; setCustomerId: (id: number | null) => void; auth: AuthStatus | null }) {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [mode, setMode] = useState<'existing' | 'new'>(auth?.authenticated ? 'existing' : 'new')
  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(auth?.customer?.customer_id ?? customerId)
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '' })
  const [pickup, setPickup] = useState('10:30')
  const [payment, setPayment] = useState<'paid' | 'pending'>('paid')
  const [creditDays, setCreditDays] = useState(7)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState<Order | null>(null)
  const total = cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)

  useEffect(() => {
    if (auth?.authenticated && auth.customer) {
      setCustomers([auth.customer])
      setSelectedCustomer(auth.customer.customer_id)
      setMode('existing')
    } else {
      setCustomers([])
      setMode('new')
      setSelectedCustomer(null)
    }
  }, [auth])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!cart.length) return navigate('/')
    setSubmitting(true); setError('')
    try {
      let id = selectedCustomer
      if (mode === 'new') id = (await api.createCustomer(form)).customer_id
      if (!id) throw new Error('Please choose an account')
      setCustomerId(id)
      const tabNote = payment === 'pending' ? `[Tab: ${creditDays} days]` : ''
      const order = await api.createOrder({
        customer_id: id,
        pickup_time: pickup ? `${pickup}:00` : undefined,
        payment_status: payment,
        credit_days: payment === 'pending' ? creditDays : undefined,
        items: cart.map(item => ({ product_id: item.product_id, quantity: item.quantity, customization: [item.customization, tabNote].filter(Boolean).join(' · ') || undefined }))
      })
      if (payment === 'pending') {
        const terms = JSON.parse(localStorage.getItem('whale-tab-terms') || '{}')
        terms[order.order_id] = { days: creditDays, due: new Date(Date.now() + creditDays * 86400000).toISOString() }
        localStorage.setItem('whale-tab-terms', JSON.stringify(terms))
      }
      clearCart(); setConfirmed(order)
    } catch (err) { setError(err instanceof Error ? err.message : t.apiOffline) }
    finally { setSubmitting(false) }
  }

  if (confirmed) return <section className="page-section"><div className="container confirmation"><div className="confirmation-mark"><Check /></div><span className="eyebrow">{t.orderNumber} #{confirmed.order_id}</span><h1>{t.orderReady}</h1><p>{t.orderReadySub}</p><div className="confirmation-detail"><Clock3 /><div><span>{t.pickup}</span><strong>{confirmed.pickup_time?.slice(0, 5) ?? 'ASAP'}</strong></div><div className="detail-divider" /><CreditCard /><div><span>{t.payment}</span><strong>{payment === 'pending' ? `${t.payLater} · ${creditDays} ${t.days}` : t.payNow}</strong></div></div><button className="button button-dark" onClick={() => navigate('/account')}>{t.goAccount}<ArrowRight size={17} /></button></div></section>
  if (!cart.length) return <Navigate to="/cart" replace />
  if (auth?.credit?.locked) return <section className="page-section"><div className="container"><LockBanner t={t} /><div className="empty-state"><LockKeyhole /><h2>{t.accountLocked}</h2><p>{t.accessLocked}</p><Link className="button button-dark" to="/account">{t.settleNow}</Link></div></div></section>

  return <section className="page-section"><div className="container checkout-page"><PageTitle eyebrow="FINAL STEP" title={t.checkoutTitle} subtitle={t.checkoutSub} />
    <form className="checkout-layout" onSubmit={submit}>
      <div className="checkout-main">
        <section className="form-card"><div className="numbered-title"><span>01</span><div><h2>{t.identity}</h2><p>{t.existing} / {t.newCustomer}</p></div></div>
          {auth?.authenticated ? <div className="signed-checkout-note"><ShieldCheck />{t.useAccount}</div> : <div className="segmented"><button type="button" className="active">{t.newCustomer}</button></div>}
          {mode === 'existing' ? <div className="customer-select-list">{customers.map(customer => <label className={selectedCustomer === customer.customer_id ? 'customer-option selected' : 'customer-option'} key={customer.customer_id}><input type="radio" name="customer" checked={selectedCustomer === customer.customer_id} onChange={() => setSelectedCustomer(customer.customer_id)} /><span className="avatar">{customer.first_name[0]}{customer.last_name[0]}</span><span><strong>{customer.first_name} {customer.last_name}</strong><small>{customer.email}</small></span><Check size={17} /></label>)}{customers.length === 0 && <p className="muted">{t.noAccount}</p>}</div> : <div className="form-grid"><Field label={t.firstName} value={form.first_name} onChange={value => setForm({ ...form, first_name: value })} required /><Field label={t.lastName} value={form.last_name} onChange={value => setForm({ ...form, last_name: value })} required /><Field label={t.email} value={form.email} onChange={value => setForm({ ...form, email: value })} type="email" required /><Field label={t.phone} value={form.phone} onChange={value => setForm({ ...form, phone: value })} type="tel" required /></div>}
        </section>
        <section className="form-card"><div className="numbered-title"><span>02</span><div><h2>{t.pickup}</h2><p>{t.collectionTime}</p></div></div><label className="time-field"><Clock3 /><input type="time" value={pickup} onChange={e => setPickup(e.target.value)} required /></label></section>
        <section className="form-card"><div className="numbered-title"><span>03</span><div><h2>{t.payment}</h2><p>{t.checkoutSub}</p></div></div>
          <div className="payment-options"><button type="button" className={payment === 'paid' ? 'payment-option selected' : 'payment-option'} onClick={() => setPayment('paid')}><span className="payment-icon"><CreditCard /></span><span><strong>{t.payNow}</strong><small>{t.payNowSub}</small></span><span className="radio-dot" /></button><button type="button" disabled={!auth?.authenticated} className={payment === 'pending' ? 'payment-option selected' : 'payment-option'} onClick={() => setPayment('pending')}><span className="payment-icon"><Banknote /></span><span><strong>{t.payLater} <em>赊账</em></strong><small>{auth?.authenticated ? t.payLaterSub : t.loginRequired}</small></span><span className="radio-dot" /></button></div>
          {payment === 'pending' && <div className="credit-terms"><div><strong>{t.tabLength}</strong><span>{creditDays} {t.days}</span></div><input type="range" min="1" max="14" step="1" value={creditDays} onChange={e => setCreditDays(Number(e.target.value))} /><div className="range-labels"><span>1 {t.days}</span><span>7 {t.days}</span><span>14 {t.days}</span></div><small>{t.maxTwoWeeks}</small><p><ShieldCheck size={15} /> {t.dueOn} {new Date(Date.now() + creditDays * 86400000).toLocaleDateString()}.</p></div>}
        </section>
      </div>
      <aside className="checkout-summary order-summary"><span className="eyebrow">{t.currentOrder}</span>{cart.map(item => <div className="mini-item" key={item.product_id}><img src={productArt[item.product_name] ?? fallbackArt} alt="" /><div><strong>{item.product_name}</strong><small>{item.quantity} × ${Number(item.price).toFixed(2)}</small></div><span>${(item.quantity * Number(item.price)).toFixed(2)}</span></div>)}<div className="summary-total"><span>{t.total}</span><strong>${total.toFixed(2)}</strong></div>{error && <div className="inline-error">{error}</div>}<button className="button button-dark full" disabled={submitting}>{submitting ? <><LoaderCircle className="spin" />{t.placing}</> : <>{t.placeOrder}<ArrowRight size={17} /></>}</button><small className="secure-note"><LockKeyhole size={13} /> {t.secureCheckout}</small></aside>
    </form>
  </div></section>
}

function AccountPage({ t, customerId, setCustomerId, auth, refreshAuth }: { t: any; customerId: number | null; setCustomerId: (id: number | null) => void; auth: AuthStatus | null; refreshAuth: () => Promise<void> }) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [privacy, setPrivacy] = useStoredState('whale-privacy', { recommendations: true, marketing: false, publicProfile: false })
  const [saved, setSaved] = useState(false)
  const [settling, setSettling] = useState<number | null>(null)

  useEffect(() => { if (auth?.authenticated && auth.customer) { setCustomers([auth.customer]); setCustomerId(auth.customer.customer_id) } else { setCustomers([]); setLoading(false) } }, [auth])
  useEffect(() => {
    if (!customerId) { setLoading(false); return }
    setLoading(true)
    Promise.all([api.customer(customerId), api.customerOrders(customerId)]).then(([person, history]) => { setCustomer(person); setOrders(history) }).finally(() => setLoading(false))
  }, [customerId])
  const tabTerms = useMemo(() => JSON.parse(localStorage.getItem('whale-tab-terms') || '{}'), [orders])

  return <section className="page-section account-page"><div className="container">
    <div className="account-heading"><PageTitle eyebrow="WHALE MEMBER" title={t.accountTitle} subtitle={t.accountSub} />{auth?.authenticated && <button className="text-button" onClick={async () => { await api.logout(); setCustomerId(null); await refreshAuth() }}>{t.logout}</button>}</div>
    {!auth?.authenticated ? <div className="login-card"><div className="login-logo"><ShieldCheck /></div><h2>{t.loginSeiue}</h2><p>{t.loginRequired}</p>{auth?.configured ? <a className="button button-dark seiue-login" href="/api/v1/auth/login"><span>SEIUE</span>{t.loginSeiue}<ArrowRight /></a> : <div className="login-unconfigured">{t.loginNotConfigured}</div>}</div> : loading ? <LoadingBlock text={t.brewing} /> : !customer ? <LoadingBlock text={t.brewing} /> : <><div className="account-grid">
      <aside className="profile-card"><div className="large-avatar">{customer.first_name[0]}{customer.last_name[0]}<span><BadgeCheck /></span></div><h2>{customer.first_name} {customer.last_name}</h2><p>{customer.email}</p><div className="profile-stat"><span><Sparkles />{t.loyalty}</span><strong>{customer.loyalty_points}</strong></div><div className="profile-stat"><span><Clock3 />{t.memberSince}</span><strong>{new Date(customer.join_date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</strong></div></aside>
      <div className="account-content">{auth.credit?.locked && <LockBanner t={t} credit={auth.credit} />}<section className="account-panel"><div className="panel-heading"><div><span className="eyebrow">HISTORY</span><h2>{t.activity}</h2></div><Coffee /></div>{orders.length === 0 ? <div className="activity-empty"><Coffee /><p>{t.noActivity}</p></div> : <div className="activity-list">{orders.map(order => <article className="activity-row" key={order.order_id}><div className="activity-icon"><ShoppingBag /></div><div className="activity-copy"><div><strong>{t.orderNumber} #{order.order_id}</strong><StatusPill status={order.payment_status} t={t} /></div><p>{order.items.map(item => `${item.quantity}× ${item.product.product_name}`).join(' · ')}</p><small>{new Date(order.order_date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}{order.credit_due_at && ` · ${t.due}: ${new Date(order.credit_due_at).toLocaleDateString()}`}</small></div><div className="activity-price"><strong>${Number(order.total_amount).toFixed(2)}</strong>{order.payment_status === 'pending' && order.credit_due_at && <button disabled={settling === order.order_id} onClick={async () => { setSettling(order.order_id); await api.payOrder(order.order_id); await refreshAuth(); const history = await api.customerOrders(customer.customer_id); setOrders(history); setSettling(null) }}>{settling === order.order_id ? t.settling : t.settleNow}</button>}</div></article>)}</div>}</section>
        <section className="account-panel privacy-panel"><div className="panel-heading"><div><span className="eyebrow">CONTROL</span><h2>{t.privacy}</h2><p>{t.privacySub}</p></div><ShieldCheck /></div><PrivacyToggle icon={<Sparkles />} title={t.recommendations} text={t.recommendationsSub} checked={privacy.recommendations} onChange={checked => setPrivacy({ ...privacy, recommendations: checked })} /><PrivacyToggle icon={<Bell />} title={t.marketing} text={t.marketingSub} checked={privacy.marketing} onChange={checked => setPrivacy({ ...privacy, marketing: checked })} /><PrivacyToggle icon={<Eye />} title={t.profileVisibility} text={t.profileVisibilitySub} checked={privacy.publicProfile} onChange={checked => setPrivacy({ ...privacy, publicProfile: checked })} /><button className="button button-dark save-privacy" onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 1800) }}>{saved ? <><Check />{t.saved}</> : t.save}</button></section>
      </div>
    </div></>}
  </div></section>
}

function SettingsPanel({ open, onClose, language, setLanguage, t }: { open: boolean; onClose: () => void; language: Language; setLanguage: (value: Language) => void; t: any }) {
  return <div className={open ? 'settings-layer open' : 'settings-layer'} aria-hidden={!open}><button className="settings-backdrop" onClick={onClose} aria-label={t.close} /><aside className="settings-drawer"><div className="drawer-head"><div><span className="eyebrow">WHALE</span><h2>{t.settingsTitle}</h2></div><button className="icon-button" onClick={onClose}><X /></button></div><div className="settings-group"><div className="settings-label"><Globe2 /><div><h3>{t.language}</h3><p>{t.languageSub}</p></div></div><div className="language-options"><button className={language === 'en' ? 'selected' : ''} onClick={() => setLanguage('en')}><span>EN</span><div><strong>{t.english}</strong><small>English</small></div>{language === 'en' && <Check />}</button><button className={language === 'zh' ? 'selected' : ''} onClick={() => setLanguage('zh')}><span>中</span><div><strong>{t.chinese}</strong><small>Chinese</small></div>{language === 'zh' && <Check />}</button></div></div><div className="settings-row"><span className="settings-row-icon"><Sparkles /></span><div><strong>{t.appearance}</strong><small>{t.systemTheme}</small></div><ChevronRight /></div><div className="settings-row"><span className="settings-row-icon"><ShieldCheck /></span><div><strong>{t.privacy}</strong><small>{t.privacySub}</small></div><ChevronRight /></div><div className="settings-row"><span className="settings-row-icon"><CircleUserRound /></span><div><strong>{t.help}</strong><small>hello@whale.coffee</small></div><ChevronRight /></div><div className="drawer-footer"><Coffee /><span>Whale v1.0</span></div></aside></div>
}

function Footer({ t }: { t: any }) { return <footer><div className="container footer-inner"><Link className="brand footer-brand" to="/"><span className="brand-mark"><Coffee size={18} /></span>WHALE</Link><p>{t.thoughtfulCoffee}</p><nav><Link to="/">{t.order}</Link><Link to="/shop">{t.shop}</Link><Link to="/account">{t.account}</Link><a href="/docs">API</a></nav><span>© {new Date().getFullYear()} Whale</span></div></footer> }
function LockBanner({ t, credit }: { t: any; credit?: CreditStatus | null }) { return <div className="lock-banner"><span><LockKeyhole /></span><div><strong>{t.accountLocked}</strong><p>{t.accountLockedSub}</p></div>{credit && <div className="lock-amount"><small>{t.overdueBalance}</small><strong>${Number(credit.outstanding_amount).toFixed(2)}</strong></div>}<Link to="/account">{t.settleNow}<ArrowRight /></Link></div> }
function usePath() {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const update = () => setPath(window.location.pathname)
    window.addEventListener('popstate', update)
    return () => window.removeEventListener('popstate', update)
  }, [])
  return path
}
function go(to: string, replace = false) {
  if (window.location.pathname === to) return
  window.history[replace ? 'replaceState' : 'pushState']({}, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
function useNavigate() { return (to: string) => go(to) }
function Link({ to, onClick, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return <a {...props} href={to} onClick={event => { onClick?.(event); if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey) { event.preventDefault(); go(to) } }} />
}
function NavLink({ to, end: _end, className, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; end?: boolean }) {
  const path = usePath()
  const classes = [typeof className === 'string' ? className : '', path === to ? 'active' : ''].filter(Boolean).join(' ')
  return <Link {...props} className={classes} to={to} />
}
function Navigate({ to, replace = false }: { to: string; replace?: boolean }) {
  useEffect(() => go(to, replace), [to, replace])
  return null
}
function PageTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) { return <div className="page-title"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div> }
function Field({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) { return <label className="field"><span>{label}</span><input type={type} value={value} onChange={e => onChange(e.target.value)} required={required} /></label> }
function LoadingBlock({ text = 'Brewing…' }: { text?: string }) { return <div className="loading-block"><LoaderCircle className="spin" /><span>{text}</span></div> }
function ErrorBlock({ text, retry, t }: { text: string; retry: () => void; t: any }) { return <div className="empty-state compact"><Coffee /><h3>{t.apiOffline}</h3><p>{text}</p><button className="button button-dark" onClick={retry}>{t.retry}</button></div> }
function Value({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="value"><span>{icon}</span><div><h3>{title}</h3><p>{text}</p></div></div> }
function StatusPill({ status, t }: { status: Order['payment_status']; t: any }) { return <span className={`status-pill ${status}`}>{t[status]}</span> }
function PrivacyToggle({ icon, title, text, checked, onChange }: { icon: React.ReactNode; title: string; text: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className="privacy-row"><span className="privacy-icon">{icon}</span><span><strong>{title}</strong><small>{text}</small></span><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /><i /></label> }
function categoryName(name: string, t: any) { const key = name.toLowerCase(); return t[key] ?? name }
function availableStock(product: Product, cart: CartItem[]) {
  const reserved = cart.find(item => item.product_id === product.product_id)?.quantity ?? 0
  return Math.max(0, product.stock_quantity - reserved)
}

export default App