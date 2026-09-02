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
  Eye,
  Globe2,
  Heart,
  ImagePlus,
  Leaf,
  LoaderCircle,
  LockKeyhole,
  Menu,
  Minus,
  Plus,
  Printer,
  QrCode,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Tag,
  Trash2,
  X
} from 'lucide-react'
import { api } from './api'
import { copy } from './i18n'
import type { AuthStatus, CartItem, Category, ClaimedCoupon, Coupon, CreditStatus, Customer, Language, Order, Product } from './types'

const productArt: Record<string, string> = {
  Espresso: 'https://images.unsplash.com/photo-1510707577719-ae7c14805e3a?auto=format&fit=crop&w=900&q=82',
  Cappuccino: 'https://images.unsplash.com/photo-1534778101976-62847782c213?auto=format&fit=crop&w=900&q=82',
  'Cold Brew': 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=900&q=82',
  'Chai Latte': 'https://images.unsplash.com/photo-1571934811356-5cc061b6821f?auto=format&fit=crop&w=900&q=82',
  'Butter Croissant': 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=900&q=82'
}

const fallbackArt = 'https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=900&q=82'

// Round a discounted price DOWN to the nearest hundredth (2 decimal places).
// e.g. 5.999 -> 5.99, 4.50 -> 4.50, 3.001 -> 3.00
function discountedPrice(price: string | number, discountPercent: number): number {
  const original = Number(price)
  if (!Number.isFinite(original) || discountPercent <= 0) return Math.floor(original * 100) / 100
  const reduced = original * (1 - discountPercent / 100)
  return Math.floor(reduced * 100) / 100
}

// Read an image File, downscale it to fit within ~1000px on the long edge, and
// return a compact JPEG data URL so it can be stored in the product's image_url
// column without bloating the JSON payload or the database row.
function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('Please choose an image file')); return }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the selected file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('That image could not be decoded'))
      img.onload = () => {
        const maxEdge = 1000
        let { width, height } = img
        if (width > maxEdge || height > maxEdge) {
          const scale = maxEdge / Math.max(width, height)
          width = Math.round(width * scale)
          height = Math.round(height * scale)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Canvas not supported')); return }
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

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
  const [claimedCoupon, setClaimedCoupon] = useStoredState<ClaimedCoupon | null>('whale-coupon', null)
  const [couponPopupSeen, setCouponPopupSeen] = useStoredState<boolean>('whale-coupon-seen', false)
  const [couponPopupOpen, setCouponPopupOpen] = useState(false)
  const [couponCatalog, setCouponCatalog] = useState<Coupon[]>([])
  const [couponsLoading, setCouponsLoading] = useState(false)
  const [claimingId, setClaimingId] = useState<number | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const t = copy[language]

  const refreshAuth = useCallback(() => api.authStatus().then(status => {
    setAuth(status)
    if (status.customer) setCustomerId(status.customer.customer_id)
  }).catch(() => setAuth(null)), [setCustomerId])
  useEffect(() => { void refreshAuth() }, [refreshAuth])

  // Fetch the active coupon catalogue from the database whenever the popup opens.
  const refreshCoupons = useCallback(() => {
    setCouponsLoading(true)
    api.coupons().then(setCouponCatalog).catch(() => setCouponCatalog([])).finally(() => setCouponsLoading(false))
  }, [])
  useEffect(() => { if (couponPopupOpen) refreshCoupons() }, [couponPopupOpen, refreshCoupons])

  // Auto-open the coupon popup once, the first time a visitor lands on the site.
  useEffect(() => {
    if (!couponPopupSeen) {
      const id = window.setTimeout(() => setCouponPopupOpen(true), 900)
      return () => window.clearTimeout(id)
    }
  }, [couponPopupSeen])

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

  const claimCoupon = (coupon: Coupon) => {
    if (claimingId !== null) return
    if (claimedCoupon && claimedCoupon.coupon_id === coupon.coupon_id) {
      setToast(t.couponAlreadyClaimed)
      window.setTimeout(() => setToast(''), 2200)
      setCouponPopupOpen(false)
      setCouponPopupSeen(true)
      return
    }
    setClaimingId(coupon.coupon_id)
    api.claimCoupon(coupon.coupon_id)
      .then(() => {
        setClaimedCoupon({
          coupon_id: coupon.coupon_id,
          code: coupon.code,
          title: coupon.title,
          description: coupon.description,
          discount_percent: coupon.discount_percent,
          claimed_at: new Date().toISOString()
        })
        setCouponPopupOpen(false)
        setCouponPopupSeen(true)
        setToast(t.couponClaimedToast)
        window.setTimeout(() => setToast(''), 2600)
      })
      .catch(() => {
        setToast(t.couponClaimFailed)
        window.setTimeout(() => setToast(''), 2600)
      })
      .finally(() => {
        setClaimingId(null)
        refreshCoupons()
      })
  }

  const removeCoupon = () => {
    setClaimedCoupon(null)
    setToast(t.couponBannerRemove)
    window.setTimeout(() => setToast(''), 1800)
  }

  const locked = Boolean(auth?.credit?.locked)
  const page = path === '/shop'
    ? <ShopPage t={t} addToCart={addToCart} locked={locked} cart={cart} coupon={claimedCoupon} onRemoveCoupon={removeCoupon} />
    : path === '/cart'
    ? <CartPage t={t} cart={cart} setCart={setCart} />
    : path === '/settle'
    ? <SettlePage t={t} customer={auth?.customer ?? null} customerId={customerId} auth={auth} refreshAuth={refreshAuth} />
    : path === '/checkout'
      ? <CheckoutPage t={t} cart={cart} clearCart={() => setCart([])} customerId={customerId} setCustomerId={setCustomerId} auth={auth} claimedCoupon={claimedCoupon} />
      : path === '/pay'
        ? <PaymentPage t={t} />
        : path === '/account'
          ? <AccountPage t={t} customerId={customerId} setCustomerId={setCustomerId} auth={auth} refreshAuth={refreshAuth} />
          : path === '/admin'
            ? <AdminPage t={t} />
            : <OrderPage t={t} addToCart={addToCart} locked={locked} cart={cart} coupon={claimedCoupon} onOpenCoupon={() => setCouponPopupOpen(true)} />

  return (
    <div className="app-shell" lang={language === 'zh' ? 'zh-CN' : 'en'}>
      <Header
        t={t}
        itemCount={itemCount}
        onSettings={() => setSettingsOpen(true)}
      />
      <main>{page}</main>
      <Footer t={t} />
      {!claimedCoupon && (
        <button
          type="button"
          className="coupon-fab"
          onClick={() => setCouponPopupOpen(true)}
          aria-label={t.couponFloating}
        >
          <Tag size={18} />
          <span>{t.couponFloating}</span>
        </button>
      )}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        language={language}
        setLanguage={setLanguage}
        t={t}
      />
      <CouponPopup
        open={couponPopupOpen}
        t={t}
        coupons={couponCatalog}
        loading={couponsLoading}
        claimingId={claimingId}
        claimedCoupon={claimedCoupon}
        onClaim={claimCoupon}
        onDecline={() => { setCouponPopupOpen(false); setCouponPopupSeen(true) }}
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
    { to: '/settle', label: t.settle },
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

function OrderPage({ t, addToCart, locked, cart, coupon, onOpenCoupon }: { t: any; addToCart: (product: Product) => void; locked: boolean; cart: CartItem[]; coupon: ClaimedCoupon | null; onOpenCoupon: () => void }) {
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
  const couponActive = Boolean(coupon)

  return (
    <>
      <section className="hero">
        <div className="hero-overlay" />
        <div className="container hero-content">
          <span className="eyebrow light"><Sparkles size={13} /> {t.greeting}</span>
          <h1>{t.heroTitle}</h1>
          <p>{t.heroBody}</p>
          <div className="hero-actions">
            <Link className="button button-light" to="/shop">{t.orderNow}<ArrowRight size={17} /></Link>
            <button type="button" className="hero-coupon-link" onClick={onOpenCoupon}>
              <Tag size={15} />
              {couponActive ? <><Check size={14} />{t.couponActiveHome}</> : <span>{t.couponLinkHome}</span>}
              {!couponActive && <span className="hero-coupon-badge">15%</span>}
            </button>
          </div>
        </div>
        <div className="hero-note"><Leaf size={16} /> 100% arabica</div>
      </section>

      <section className="menu-section" id="menu">
        <div className="container">
          {locked && <LockBanner t={t} />}
          <button type="button" className="home-coupon-strip" onClick={onOpenCoupon}>
            <span className="home-coupon-strip-icon"><Tag size={18} /></span>
            <span className="home-coupon-strip-copy">
              <strong>{couponActive ? t.couponActiveHome : t.couponStripTitle}</strong>
              <small>{couponActive ? t.couponStripActiveSub : t.couponStripSub}</small>
            </span>
            {!couponActive && <span className="home-coupon-strip-badge">UP TO 25% OFF</span>}
            <ArrowRight size={16} />
          </button>
          <div className="section-heading-row">
            <div><span className="eyebrow">WHALE COLLECTION</span><h2>{t.menu}</h2><p>{t.menuSub}</p></div>
            <Link className="shop-all-link" to="/shop">{t.shopAll}<ArrowRight /></Link>
          </div>
          {loading ? <LoadingBlock /> : error ? <ErrorBlock text={error || t.apiOffline} retry={loadMenu} t={t} /> : (
            <div className="product-grid home-preview-grid">
              {featured.map((product, index) => (
                <article className="product-card" key={product.product_id} style={{ '--delay': `${index * 55}ms` } as React.CSSProperties}>
                  <div className="product-image-wrap">
                    <img src={product.image_url ?? productArt[product.product_name] ?? fallbackArt} alt={product.product_name} className="product-image" />
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

function ShopPage({ t, addToCart, locked, cart, coupon, onRemoveCoupon }: { t: any; addToCart: (product: Product) => void; locked: boolean; cart: CartItem[]; coupon: ClaimedCoupon | null; onRemoveCoupon: () => void }) {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [category, setCategory] = useState<number | 'all'>('all')
  const [sort, setSort] = useState('featured')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => { Promise.all([api.products(), api.categories()]).then(([items, groups]) => { setProducts(items); setCategories(groups) }).finally(() => setLoading(false)) }, [])
  const discountPercent = coupon?.discount_percent ?? 0
  const listed = products.filter(item => (category === 'all' || item.category_id === category) && item.product_name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => {
    const pa = discountPercent > 0 ? discountedPrice(a.price, discountPercent) : Number(a.price)
    const pb = discountPercent > 0 ? discountedPrice(b.price, discountPercent) : Number(b.price)
    if (sort === 'priceLow') return pa - pb
    if (sort === 'priceHigh') return pb - pa
    if (sort === 'nameAZ') return a.product_name.localeCompare(b.product_name)
    if (sort === 'stockHigh') return b.stock_quantity - a.stock_quantity
    return a.product_id - b.product_id
  })
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  return <section className="page-section shop-page"><div className="container">
    <div className="shop-hero"><div><span className="eyebrow">WHALE MARKET</span><h1>{t.commodities}</h1><p>{t.commoditiesSub}</p></div><div className="shop-hero-mark"><Coffee /><span>{t.catalogNote}</span></div></div>
    {coupon && <div className="coupon-banner">
      <div className="coupon-banner-icon"><Tag size={20} /></div>
      <div className="coupon-banner-copy">
        <strong>{coupon.title}</strong>
        <span>{t.couponBannerCode}: <em>{coupon.code}</em> · {Number(coupon.discount_percent)}% {t.couponBannerOff}</span>
      </div>
      <button type="button" className="text-button coupon-banner-remove" onClick={onRemoveCoupon}><Trash2 size={15} />{t.couponBannerRemoveLabel}</button>
    </div>}
    {locked && <LockBanner t={t} />}
    <div className="shop-toolbar"><label className="search-box"><Search /><input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.search} /></label><div className="filter-tabs shop-tabs"><button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>{t.all}</button>{categories.map(group => <button className={category === group.category_id ? 'active' : ''} onClick={() => setCategory(group.category_id)} key={group.category_id}>{categoryName(group.category_name, t)}</button>)}</div><label className="sort-control"><span>{t.sortBy}</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="featured">{t.featured}</option><option value="priceLow">{t.priceLow}</option><option value="priceHigh">{t.priceHigh}</option><option value="nameAZ">{t.nameAZ}</option><option value="stockHigh">{t.stockHigh}</option></select></label></div>
    <div className="shop-meta"><span>{t.showing} <strong>{listed.length}</strong> / {products.length}</span>{cartCount > 0 && <Link to="/cart"><ShoppingBag />{cartCount} {t.inYourCart}<ArrowRight /></Link>}</div>
    {loading ? <LoadingBlock text={t.brewing} /> : <div className="catalog-grid">{listed.map((item, index) => {
      const available = availableStock(item, cart)
      const reserved = cart.find(cartItem => cartItem.product_id === item.product_id)?.quantity ?? 0
      const soldOut = available === 0
      const original = Number(item.price)
      const finalPrice = discountPercent > 0 ? discountedPrice(original, discountPercent) : original
      return <article className={soldOut ? 'catalog-card is-sold-out' : 'catalog-card'} key={item.product_id} style={{ '--delay': `${index * 45}ms` } as React.CSSProperties}>
        <div className="catalog-image"><img src={item.image_url ?? productArt[item.product_name] ?? fallbackArt} alt={item.product_name} />{soldOut && <div className="sold-out-overlay"><span>{t.soldOut}</span><small>{t.soldOutNote}</small></div>}<span className="catalog-category">{categoryName(categories.find(c => c.category_id === item.category_id)?.category_name ?? '', t)}</span></div>
        <div className="catalog-copy"><div className="catalog-title"><h2>{item.product_name}</h2><div className="catalog-price">{discountPercent > 0 && <span className="price-original" aria-label={t.couponOriginalPrice}>${original.toFixed(2)}</span>}<strong>${finalPrice.toFixed(2)}</strong></div></div><p>{item.description}</p><div className="inventory-row"><div><span>{t.inventory}</span><strong className={soldOut ? 'inventory-zero' : ''}>{soldOut ? t.soldOut : `${available} ${t.available}`}</strong></div>{reserved > 0 && <div className="reserved-count"><ShoppingBag />{reserved} {t.inYourCart}</div>}</div><button className="catalog-add" disabled={locked || soldOut} onClick={() => addToCart(item)}>{soldOut ? t.soldOut : <><Plus />{t.add}<span>·</span>${finalPrice.toFixed(2)}</>}</button></div>
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
            <img src={item.image_url ?? productArt[item.product_name] ?? fallbackArt} alt="" />
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

function CheckoutPage({ t, cart, clearCart, customerId, setCustomerId, auth, claimedCoupon }: { t: any; cart: CartItem[]; clearCart: () => void; customerId: number | null; setCustomerId: (id: number | null) => void; auth: AuthStatus | null; claimedCoupon: ClaimedCoupon | null }) {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [mode, setMode] = useState<'existing' | 'new'>(auth?.authenticated ? 'existing' : 'new')
  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(auth?.customer?.customer_id ?? customerId)
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '' })
  const [pickup, setPickup] = useState('10:30')
  const [payment, setPayment] = useState<'paid' | 'pending'>('paid')
  const [paymentMethod, setPaymentMethod] = useState<BackendPayMethod>('cash')
  const [creditDays, setCreditDays] = useState(7)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState<Order | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)
  const discountPercent = claimedCoupon?.discount_percent ?? 0
  const total = discountPercent > 0
    ? Math.floor(subtotal * (1 - discountPercent / 100) * 100) / 100
    : subtotal

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

  const createCustomerIfNeeded = async () => {
    let id = selectedCustomer
    if (mode === 'new') id = (await api.createCustomer(form)).customer_id
    if (!id) throw new Error('Please choose an account')
    setCustomerId(id)
    return id
  }

  const createOrder = async (id: number, method: BackendPayMethod) => {
    const tabNote = payment === 'pending' ? `[Tab: ${creditDays} days]` : ''
    // Merge duplicate product_ids — the backend rejects orders with dupes.
    const merged: Record<number, { product_id: number; quantity: number; customization: string | undefined }> = {}
    for (const item of cart) {
      const note = [item.customization, tabNote].filter(Boolean).join(' · ') || undefined
      if (merged[item.product_id]) {
        merged[item.product_id].quantity += item.quantity
        if (note) merged[item.product_id].customization = [merged[item.product_id].customization, note].filter(Boolean).join(' · ') || undefined
      } else {
        merged[item.product_id] = { product_id: item.product_id, quantity: item.quantity, customization: note }
      }
    }
    const order = await api.createOrder({
      customer_id: id,
      pickup_time: pickup ? `${pickup}:00` : undefined,
      payment_method: method,
      payment_status: payment,
      credit_days: payment === 'pending' ? creditDays : undefined,
      items: Object.values(merged)
    })
    if (payment === 'pending') {
      const terms = JSON.parse(localStorage.getItem('whale-tab-terms') || '{}')
      terms[order.order_id] = { days: creditDays, due: new Date(Date.now() + creditDays * 86400000).toISOString() }
      localStorage.setItem('whale-tab-terms', JSON.stringify(terms))
    }
    clearCart(); setConfirmed(order)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!cart.length) return navigate('/')
    setError('')
    if (payment === 'paid') {
      setShowPayment(true)
      return
    }
    setSubmitting(true)
    try {
      const id = await createCustomerIfNeeded()
      await createOrder(id, 'cash')
    } catch (err) { setError(err instanceof Error ? err.message : t.apiOffline) }
    finally { setSubmitting(false) }
  }

  const handlePaid = async (method: BackendPayMethod) => {
    setShowPayment(false); setSubmitting(true); setError('')
    try {
      const id = await createCustomerIfNeeded()
      if (method === 'wechat' || method === 'alipay') {
        // Make payment obligatory: create the order as pending and redirect to
        // the dedicated /pay page, which shows the QR and polls until the
        // backend reports the order paid.
        const couponNote = claimedCoupon ? `[Coupon: ${claimedCoupon.code} -${Number(claimedCoupon.discount_percent)}%]` : ''
        const merged: Record<number, { product_id: number; quantity: number; customization: string | undefined }> = {}
        for (const item of cart) {
          const note = [item.customization, couponNote].filter(Boolean).join(' · ') || undefined
          if (merged[item.product_id]) {
            merged[item.product_id].quantity += item.quantity
            if (note) merged[item.product_id].customization = [merged[item.product_id].customization, note].filter(Boolean).join(' · ') || undefined
          } else {
            merged[item.product_id] = { product_id: item.product_id, quantity: item.quantity, customization: note }
          }
        }
        const order = await api.createOrder({
          customer_id: id,
          pickup_time: pickup ? `${pickup}:00` : undefined,
          payment_method: method,
          payment_status: 'pending',
          items: Object.values(merged)
        })
        clearCart()
        navigate(`/pay?order=${order.order_id}&method=${method}`)
        return
      }
      await createOrder(id, method)
    } catch (err) { setError(err instanceof Error ? err.message : t.apiOffline) }
    finally { setSubmitting(false) }
  }

  if (confirmed) return <section className="page-section"><div className="container confirmation"><div className="confirmation-mark"><Check /></div><span className="eyebrow">{t.orderNumber} #{confirmed.order_id}</span><h1>{t.orderReady}</h1><p>{t.orderReadySub}</p>{confirmed.pickup_code && <div className="confirmation-pickup"><span>{t.pickupCode ?? 'Pickup code'}</span><strong>{confirmed.pickup_code}</strong></div>}<div className="confirmation-detail"><Clock3 /><div><span>{t.pickup}</span><strong>{confirmed.pickup_time?.slice(0, 5) ?? 'ASAP'}</strong></div><div className="detail-divider" /><Banknote /><div><span>{t.payment}</span><strong>{payment === 'pending' ? `${t.payLater} · ${creditDays} ${t.days}` : t.payNow}</strong></div></div>{confirmed.print_status && <div className={`receipt-status receipt-status--${confirmed.print_status}`}><Printer size={18} /><span>{confirmed.print_status === 'printed' ? t.receiptPrinted : confirmed.print_status === 'no_printer' ? t.receiptNoPrinter : t.receiptDisabled}</span></div>}{confirmed.receipt_preview && <div className="receipt-preview"><button type="button" className="receipt-preview-toggle" onClick={() => setShowReceipt(!showReceipt)}><span>{t.receiptPreview}</span><ChevronRight size={16} className={showReceipt ? 'chevron-rotated' : ''} /></button>{showReceipt && <div className="receipt-preview-content">{confirmed.receipt_preview!.split('\n').map((line, i) => {const trimmed = line.trimStart();const lead = line.length - trimmed.length;const isSep = /^[=\-]+$/.test(trimmed);const isCenter = (lead >= 5 && trimmed.length > 0) || isSep || trimmed === '';return <div key={i} className={isCenter ? 'receipt-line-center' : 'receipt-line-left'}>{isCenter ? (trimmed || '\u00A0') : line}</div>})}</div>}</div>}<button className="button button-dark" onClick={() => navigate('/account')}>{t.goAccount}<ArrowRight size={17} /></button></div></section>
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
          <div className="payment-options"><button type="button" className={payment === 'paid' ? 'payment-option selected' : 'payment-option'} onClick={() => setPayment('paid')}><span className="payment-icon"><Banknote /></span><span><strong>{t.payNow}</strong><small>{t.payNowSub}</small></span><span className="radio-dot" /></button><button type="button" disabled={!auth?.authenticated} className={payment === 'pending' ? 'payment-option selected' : 'payment-option'} onClick={() => setPayment('pending')}><span className="payment-icon"><Banknote /></span><span><strong>{t.payLater} <em>赊账</em></strong><small>{auth?.authenticated ? t.payLaterSub : t.loginRequired}</small></span><span className="radio-dot" /></button></div>
          {payment === 'pending' && <div className="credit-terms"><div><strong>{t.tabLength}</strong><span>{creditDays} {t.days}</span></div><input type="range" min="1" max="14" step="1" value={creditDays} onChange={e => setCreditDays(Number(e.target.value))} /><div className="range-labels"><span>1 {t.days}</span><span>7 {t.days}</span><span>14 {t.days}</span></div><small>{t.maxTwoWeeks}</small><p><ShieldCheck size={15} /> {t.dueOn} {new Date(Date.now() + creditDays * 86400000).toLocaleDateString()}.</p></div>}
        </section>
      </div>
      <aside className="checkout-summary order-summary"><span className="eyebrow">{t.currentOrder}</span>{cart.map(item => <div className="mini-item" key={item.product_id}><img src={item.image_url ?? productArt[item.product_name] ?? fallbackArt} alt="" /><div><strong>{item.product_name}</strong><small>{item.quantity} × ${Number(item.price).toFixed(2)}</small></div><span>${(item.quantity * Number(item.price)).toFixed(2)}</span></div>)}{claimedCoupon && <div className="summary-coupon"><div className="summary-coupon-line"><Tag size={14} /><span><strong>{claimedCoupon.code}</strong> · {Number(claimedCoupon.discount_percent)}% {t.couponBannerOff}</span></div><div className="summary-line"><span>{t.subtotal}</span><span>${subtotal.toFixed(2)}</span></div><div className="summary-line discount"><span>{t.couponBannerTitle}</span><span>−${(subtotal - total).toFixed(2)}</span></div></div>}<div className="summary-total"><span>{t.total}</span><strong>${total.toFixed(2)}</strong></div>{error && <div className="inline-error">{error}</div>}<button className="button button-dark full" disabled={submitting}>{submitting ? <><LoaderCircle className="spin" />{t.placing}</> : <>{t.placeOrder}<ArrowRight size={17} /></>}</button><small className="secure-note"><LockKeyhole size={13} /> {t.secureCheckout}</small></aside>
    </form>
    <PaymentModal open={showPayment} onClose={() => setShowPayment(false)} onSuccess={handlePaid} amount={total} t={t} />
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
  const [settlingAll, setSettlingAll] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginFirst, setLoginFirst] = useState('')
  const [loginLast, setLoginLast] = useState('')
  const [loginErr, setLoginErr] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setLoginErr('')
    if (!loginEmail.trim()) { setLoginErr(t.loginEmailHint ?? 'Enter your email'); return }
    setLoggingIn(true)
    try {
      await api.manualLogin({ email: loginEmail.trim(), first_name: loginFirst.trim() || undefined, last_name: loginLast.trim() || undefined })
      await refreshAuth()
    } catch (err) {
      setLoginErr(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoggingIn(false)
    }
  }

  const handleSettleAll = useCallback(async () => {
    if (!customer) return
    setSettlingAll(true)
    try {
      await api.settleAll(customer.customer_id)
      await refreshAuth()
      const history = await api.customerOrders(customer.customer_id)
      setOrders(history)
    } finally {
      setSettlingAll(false)
    }
  }, [customer, refreshAuth])

  useEffect(() => { if (auth?.authenticated && auth.customer) { setCustomers([auth.customer]); setCustomerId(auth.customer.customer_id) } else { setCustomers([]); setLoading(false) } }, [auth])
  useEffect(() => {
    if (!customerId) { setLoading(false); return }
    setLoading(true)
    Promise.all([api.customer(customerId), api.customerOrders(customerId)]).then(([person, history]) => { setCustomer(person); setOrders(history) }).finally(() => setLoading(false))
  }, [customerId])
  const tabTerms = useMemo(() => JSON.parse(localStorage.getItem('whale-tab-terms') || '{}'), [orders])

  return <section className="page-section account-page"><div className="container">
    <div className="account-heading"><PageTitle eyebrow="WHALE MEMBER" title={t.accountTitle} subtitle={t.accountSub} />{auth?.authenticated && <button className="text-button" onClick={async () => { await api.logout(); setCustomerId(null); await refreshAuth() }}>{t.logout}</button>}</div>
    {!auth?.authenticated ? <div className="login-card"><div className="login-hero"><div className="login-logo"><ShieldCheck size={28} /></div><div><h2>{t.loginSeiue}</h2><p>{t.loginRequired}</p></div></div>{auth === null ? <div className="login-unconfigured"><LoaderCircle className="spin" /> Loading…</div> : auth.configured ? <form className="manual-login" onSubmit={handleLogin}><label className="login-field"><span>{t.email}</span><input type="email" placeholder="you@whale.coffee" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} /></label><div className="login-name-grid"><label className="login-field"><span>{t.firstName}</span><input type="text" placeholder={t.firstName} value={loginFirst} onChange={e => setLoginFirst(e.target.value)} /></label><label className="login-field"><span>{t.lastName}</span><input type="text" placeholder={t.lastName} value={loginLast} onChange={e => setLoginLast(e.target.value)} /></label></div>{t.loginNewHint && <small className="login-hint">{t.loginNewHint}</small>}{loginErr && <div className="login-error">{loginErr}</div>}<button type="submit" className="button button-dark login-submit" disabled={loggingIn}>{loggingIn ? <><LoaderCircle className="spin" />{t.placing}</> : <>{t.loginSeiue}<ArrowRight /></>}</button></form> : <div className="login-unconfigured">{t.loginNotConfigured}</div>}</div> : loading ? <LoadingBlock text={t.brewing} /> : !customer ? <LoadingBlock text={t.brewing} /> : <><div className="account-grid">
      <aside className="profile-card"><div className="large-avatar">{customer.first_name[0]}{customer.last_name[0]}<span><BadgeCheck /></span></div><h2>{customer.first_name} {customer.last_name}</h2><p>{customer.email}</p><div className="profile-stat"><span><Sparkles />{t.loyalty}</span><strong>{customer.loyalty_points}</strong></div><div className="profile-stat"><span><Clock3 />{t.memberSince}</span><strong>{new Date(customer.join_date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</strong></div><div className="profile-stat"><span><Banknote />{t.tabTotal ?? 'Tab total'}</span><strong className={auth.credit?.locked ? 'locked-amount' : ''}>${Number(auth.credit?.outstanding_amount ?? 0).toFixed(2)}</strong></div>{auth.credit?.locked && <div className="profile-lock-hint"><LockKeyhole size={14} />{t.tabLocked ?? 'Locked: tab over $100'}</div>}{auth.credit?.outstanding_amount ? <button className="button button-dark profile-settle-btn" disabled={settlingAll} onClick={handleSettleAll}>{settlingAll ? <><LoaderCircle className="spin" />{t.settlingAll}</> : <><Banknote />{t.settleAll}</>}</button> : null}</aside>
      <div className="account-content">{auth.credit?.locked && <LockBanner t={t} credit={auth.credit} settleAll={handleSettleAll} settling={settlingAll} />}<section className="account-panel"><div className="panel-heading"><div><span className="eyebrow">HISTORY</span><h2>{t.activity}</h2></div><Coffee /></div>{orders.length === 0 ? <div className="activity-empty"><Coffee /><p>{t.noActivity}</p></div> : <div className="activity-list">{orders.map(order => <article className="activity-row" key={order.order_id}><div className="activity-icon"><ShoppingBag /></div><div className="activity-copy"><div><strong>{t.orderNumber} #{order.order_id}</strong><StatusPill status={order.payment_status} t={t} />{order.pickup_code && <span className="pickup-chip">{t.pickupCode ?? 'Pickup'} · {order.pickup_code}</span>}</div><p>{order.items.map(item => `${item.quantity}× ${item.product.product_name}`).join(' · ')}</p><small>{new Date(order.order_date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}{order.credit_due_at && ` · ${t.due}: ${new Date(order.credit_due_at).toLocaleDateString()}`}</small></div><div className="activity-price"><strong>${Number(order.total_amount).toFixed(2)}</strong>{order.payment_status === 'pending' && order.credit_due_at && <button disabled={settling === order.order_id} onClick={async () => { setSettling(order.order_id); await api.payOrder(order.order_id); await refreshAuth(); const history = await api.customerOrders(customer.customer_id); setOrders(history); setSettling(null) }}>{settling === order.order_id ? t.settling : t.settleNow}</button>}</div></article>)}</div>}</section>
        <section className="account-panel privacy-panel"><div className="panel-heading"><div><span className="eyebrow">CONTROL</span><h2>{t.privacy}</h2><p>{t.privacySub}</p></div><ShieldCheck /></div><PrivacyToggle icon={<Sparkles />} title={t.recommendations} text={t.recommendationsSub} checked={privacy.recommendations} onChange={checked => setPrivacy({ ...privacy, recommendations: checked })} /><PrivacyToggle icon={<Bell />} title={t.marketing} text={t.marketingSub} checked={privacy.marketing} onChange={checked => setPrivacy({ ...privacy, marketing: checked })} /><PrivacyToggle icon={<Eye />} title={t.profileVisibility} text={t.profileVisibilitySub} checked={privacy.publicProfile} onChange={checked => setPrivacy({ ...privacy, publicProfile: checked })} /><button className="button button-dark save-privacy" onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 1800) }}>{saved ? <><Check />{t.saved}</> : t.save}</button></section>
      </div>
    </div></>}
  </div></section>
}

function SettingsPanel({ open, onClose, language, setLanguage, t }: { open: boolean; onClose: () => void; language: Language; setLanguage: (value: Language) => void; t: any }) {
  return <div className={open ? 'settings-layer open' : 'settings-layer'} aria-hidden={!open}><button className="settings-backdrop" onClick={onClose} aria-label={t.close} /><aside className="settings-drawer"><div className="drawer-head"><div><span className="eyebrow">WHALE</span><h2>{t.settingsTitle}</h2></div><button className="icon-button" onClick={onClose}><X /></button></div><div className="settings-group"><div className="settings-label"><Globe2 /><div><h3>{t.language}</h3><p>{t.languageSub}</p></div></div><div className="language-options"><button className={language === 'en' ? 'selected' : ''} onClick={() => setLanguage('en')}><span>EN</span><div><strong>{t.english}</strong><small>English</small></div>{language === 'en' && <Check />}</button><button className={language === 'zh' ? 'selected' : ''} onClick={() => setLanguage('zh')}><span>中</span><div><strong>{t.chinese}</strong><small>Chinese</small></div>{language === 'zh' && <Check />}</button></div></div><div className="settings-row"><span className="settings-row-icon"><Sparkles /></span><div><strong>{t.appearance}</strong><small>{t.systemTheme}</small></div><ChevronRight /></div><div className="settings-row"><span className="settings-row-icon"><ShieldCheck /></span><div><strong>{t.privacy}</strong><small>{t.privacySub}</small></div><ChevronRight /></div><div className="settings-row"><span className="settings-row-icon"><CircleUserRound /></span><div><strong>{t.help}</strong><small>hello@whale.coffee</small></div><ChevronRight /></div><div className="drawer-footer"><Coffee /><span>Whale v1.0</span></div></aside></div>
}

function Footer({ t }: { t: any }) { return <footer><div className="container footer-inner"><Link className="brand footer-brand" to="/"><span className="brand-mark"><Coffee size={18} /></span>WHALE</Link><p>{t.thoughtfulCoffee}</p><nav><Link to="/">{t.order}</Link><Link to="/shop">{t.shop}</Link><Link to="/settle">{t.settle}</Link><Link to="/account">{t.account}</Link><a href="/docs">API</a></nav><span>© {new Date().getFullYear()} Whale</span></div></footer> }
function LockBanner({ t, credit, settleAll, settling }: { t: any; credit?: CreditStatus | null; settleAll?: () => Promise<void>; settling?: boolean }) { return <div className="lock-banner"><span><LockKeyhole /></span><div><strong>{t.accountLocked}</strong><p>{t.accountLockedSub}</p></div>{credit && <div className="lock-amount"><small>{t.overdueBalance}</small><strong>${Number(credit.outstanding_amount).toFixed(2)}</strong></div>}{settleAll ? <button className="button button-dark" disabled={settling} onClick={settleAll}>{settling ? <><LoaderCircle className="spin" />{t.settlingAll}</> : <>{t.settleAll}<ArrowRight /></>}</button> : <Link to="/account">{t.settleNow}<ArrowRight /></Link>}</div> }

function SettlePage({ t, customer, customerId, auth, refreshAuth }: { t: any; customer: Customer | null; customerId: number | null; auth: AuthStatus | null; refreshAuth: () => Promise<void> }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [settlingOne, setSettlingOne] = useState<number | null>(null)
  const [settlingAll, setSettlingAll] = useState(false)

  useEffect(() => {
    if (!customerId) { setOrders([]); setLoading(false); return }
    let alive = true
    api.customerOrders(customerId).then(list => { if (alive) setOrders(list) }).finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [customerId])

  const pending = orders.filter(o => o.payment_status === 'pending')
  const locked = Boolean(auth?.credit?.locked)
  const outstanding = Number(auth?.credit?.outstanding_amount ?? pending.reduce((s, o) => s + Number(o.total_amount), 0))

  const settleOne = useCallback(async (id: number) => {
    setSettlingOne(id)
    try {
      await api.payOrder(id)
      const list = customerId ? await api.customerOrders(customerId) : []
      setOrders(list)
      await refreshAuth()
    } finally {
      setSettlingOne(null)
    }
  }, [customerId, refreshAuth])

  const settleAll = useCallback(async () => {
    if (!customerId) return
    setSettlingAll(true)
    try {
      await api.settleAll(customerId)
      const list = await api.customerOrders(customerId)
      setOrders(list)
      await refreshAuth()
    } finally {
      setSettlingAll(false)
    }
  }, [customerId, refreshAuth])

  if (!customer) return <div className="page-section"><div className="container narrow-page settle-empty"><CircleUserRound size={40} /><h1>{t.settleTitle}</h1><p>{t.settleSignInHint ?? 'Sign in to view and settle your tab.'}</p><Link to="/account" className="button button-dark">{t.signIn ?? 'Sign in'}<ArrowRight /></Link></div></div>

  return <div className="page-section"><div className="container narrow-page"><div className="page-title"><span className="eyebrow">SETTLE</span><h1>{t.settleTitle}</h1><p>{t.settleSubtitle ?? 'Pay off your tab and unlock ordering.'}</p></div>
  {locked && <LockBanner t={t} credit={auth?.credit} settleAll={settleAll} settling={settlingAll} />}
  <div className="settle-layout">
    <section className="settle-panel">
      <div className="settle-summary">
        <div className="settle-summary-row"><span>{t.settleOutstanding ?? 'Outstanding balance'}</span><strong className={locked ? 'locked-amount' : ''}>${outstanding.toFixed(2)}</strong></div>
        <div className="settle-summary-row muted"><span>{t.settlePendingCount ?? 'Pending orders'}</span><strong>{pending.length}</strong></div>
        {auth?.credit?.overdue_orders?.length ? <div className="settle-summary-row muted"><span><Clock3 size={14} />{t.settleOverdue ?? 'Overdue'}</span><strong className="locked-amount">{auth.credit.overdue_orders.length}</strong></div> : null}
      </div>
      {loading ? <div className="settle-empty-mini"><LoaderCircle className="spin" /></div> : pending.length === 0 ? <div className="settle-clear"><Check size={28} /><strong>{t.settleAllClear ?? 'All settled'}</strong><p>{t.settleAllClearSub ?? 'No pending orders on your tab.'}</p></div> :
      <div className="settle-list">
        {pending.map(o => (
          <div key={o.order_id} className="settle-row">
            <div className="settle-row-copy">
              <strong>#{o.order_id} · {o.items.reduce((s, it) => s + it.quantity, 0)} {t.items}</strong>
              <small>{new Date(o.order_date).toLocaleDateString()}{o.items.length > 0 && ` · ${o.items.map(i => i.product.product_name).join(', ')}`}</small>
            </div>
            <strong className="settle-row-price">${Number(o.total_amount).toFixed(2)}</strong>
            <button className="button button-dark button-mini" disabled={settlingOne === o.order_id} onClick={() => settleOne(o.order_id)}>{settlingOne === o.order_id ? <LoaderCircle className="spin" /> : t.settleOne ?? 'Settle'}</button>
          </div>
        ))}
      </div>}
    </section>
    <aside className="settle-total-card">
      <div className="settle-total-amount"><span>{t.settleTotalLabel ?? 'Total to pay'}</span><strong>${outstanding.toFixed(2)}</strong></div>
      <button className="button button-dark settle-all-btn" disabled={settlingAll || pending.length === 0} onClick={settleAll}>
        {settlingAll ? <><LoaderCircle className="spin" />{t.settlingAll}</> : <><Banknote />{t.settleAll}</>}
      </button>
      <p className="settle-note">{t.settleNote ?? 'Click to record cash payment. Orders will be marked paid and you\'ll receive pickup codes.'}</p>
    </aside>
  </div></div></div>
}

function AdminPage({ t }: { t: any }) {
  const [adminAuthed, setAdminAuthed] = useState(false)
  const [adminChecking, setAdminChecking] = useState(true)
  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginErr, setLoginErr] = useState('')
  const [tab, setTab] = useState<'orders' | 'products'>('orders')
  const [orders, setOrders] = useState<Order[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [orderBusy, setOrderBusy] = useState<number | null>(null)
  const [productBusy, setProductBusy] = useState<number | null>(null)
  const [newProduct, setNewProduct] = useState({ product_name: '', description: '', price: '', stock_quantity: '0', category_id: '', image_url: '' })
  const [creating, setCreating] = useState(false)
  const [processingImage, setProcessingImage] = useState(false)

  useEffect(() => {
    api.adminStatus().then(s => setAdminAuthed(s.authenticated)).catch(() => setAdminAuthed(false)).finally(() => setAdminChecking(false))
  }, [])

  const handleAdminLogin = async (e: FormEvent) => {
    e.preventDefault()
    setLoginErr('')
    try {
      await api.adminLogin(loginUser, loginPass)
      setAdminAuthed(true)
      setLoginUser(''); setLoginPass('')
    } catch (err: any) {
      setLoginErr(err.message || 'Login failed')
    }
  }
  const handleAdminLogout = async () => {
    await api.adminLogout()
    setAdminAuthed(false)
    setOrders([]); setProducts([])
  }

  const refreshOrders = useCallback(async (filter = statusFilter) => {
    const list = filter === 'all' ? await api.allOrders() : await api.allOrders(filter)
    setOrders(list)
  }, [statusFilter])

  const refreshProducts = useCallback(async () => {
    const [plist, clist] = await Promise.all([api.products(), api.categories()])
    setProducts(plist)
    setCategories(clist)
  }, [])

  useEffect(() => {
    if (!adminAuthed) return
    setLoading(true)
    Promise.all([refreshOrders(), refreshProducts()]).finally(() => setLoading(false))
  }, [adminAuthed])

  useEffect(() => { if (adminAuthed) refreshOrders() }, [statusFilter])

  const totalRevenue = orders.filter(o => o.payment_status === 'paid').reduce((s, o) => s + Number(o.total_amount), 0)
  const pendingCount = orders.filter(o => o.payment_status === 'pending').length
  const lowStock = products.filter(p => p.stock_quantity < 10).length

  const handleSettle = async (id: number) => {
    setOrderBusy(id)
    try { await api.updateOrderStatus(id, 'paid'); await refreshOrders() }
    finally { setOrderBusy(null) }
  }
  const handleRefund = async (id: number) => {
    setOrderBusy(id)
    try { await api.updateOrderStatus(id, 'refunded'); await refreshOrders() }
    finally { setOrderBusy(null) }
  }
  const handleSettleAllPending = async () => {
    const pendingIds = orders.filter(o => o.payment_status === 'pending').map(o => o.order_id)
    for (const id of pendingIds) {
      await api.updateOrderStatus(id, 'paid')
    }
    await refreshOrders()
  }
  const handleAdjustStock = async (id: number, delta: number) => {
    setProductBusy(id)
    try { await api.adjustStock(id, delta); await refreshProducts() }
    finally { setProductBusy(null) }
  }
  const handleDeleteProduct = async (id: number) => {
    setProductBusy(id)
    try { await api.deleteProduct(id); await refreshProducts() }
    finally { setProductBusy(null) }
  }
  const handleImageChange = async (e: FormEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0]
    e.currentTarget.value = ''
    if (!file) return
    setProcessingImage(true)
    try {
      const dataUrl = await readImageAsDataUrl(file)
      setNewProduct(prev => ({ ...prev, image_url: dataUrl }))
    } finally { setProcessingImage(false) }
  }

  const handleCreateProduct = async (e: FormEvent) => {
    e.preventDefault()
    if (!newProduct.product_name || !newProduct.price || !newProduct.category_id) return
    setCreating(true)
    try {
      await api.createProduct({
        product_name: newProduct.product_name,
        description: newProduct.description || null,
        price: newProduct.price,
        stock_quantity: Number(newProduct.stock_quantity) || 0,
        image_url: newProduct.image_url || null,
        category_id: Number(newProduct.category_id)
      })
      setNewProduct({ product_name: '', description: '', price: '', stock_quantity: '0', category_id: '', image_url: '' })
      await refreshProducts()
    } finally { setCreating(false) }
  }

  const statusBadge = (s: string) => {
    const cls = s === 'paid' ? 'badge-paid' : s === 'pending' ? 'badge-pending' : s === 'refunded' ? 'badge-refunded' : 'badge-cancelled'
    const label = (t[s] ?? s).toUpperCase()
    return <span className={`status-badge ${cls}`}>{label}</span>
  }
  const methodBadge = (m: string) => <span className={`method-badge method-${m}`}>{m}</span>

  if (adminChecking) return <div className="page-section"><div className="container"><p>Checking admin access…</p></div></div>
  if (!adminAuthed) return (
    <div className="page-section"><div className="container" style={{maxWidth: 380}}>
      <div className="page-title"><span className="eyebrow">ADMIN</span><h1>Admin Login</h1><p>Hidden staff entry — ask your manager for credentials.</p></div>
      <form className="login-card" onSubmit={handleAdminLogin}>
        <label>Username <input value={loginUser} onChange={e => setLoginUser(e.target.value)} placeholder="admin" required autoComplete="username" /></label>
        <label>Password <input type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)} placeholder="••••" required autoComplete="current-password" /></label>
        {loginErr && <p className="login-error">{loginErr}</p>}
        <button type="submit" className="button button-primary" style={{width: '100%'}}>Sign in</button>
      </form>
    </div></div>
  )

  return (
    <div className="page-section admin-page">
      <div className="container">
        <div className="page-title">
          <span className="eyebrow">ADMIN</span>
          <h1>{t.adminTitle}</h1>
          <p>{t.adminSubtitle}</p>
          <button className="button button-ghost button-mini" style={{marginTop: 8}} onClick={handleAdminLogout}>Log out</button>
        </div>

        <div className="admin-stats">
          <div className="admin-stat"><strong>{orders.length}</strong><span>{t.adminOrdersCount ?? 'orders'}</span></div>
          <div className="admin-stat"><strong>${totalRevenue.toFixed(2)}</strong><span>{t.adminRevenue ?? 'Revenue'}</span></div>
          <div className="admin-stat"><strong>{pendingCount}</strong><span>{t.adminOpenTab ?? 'Open tabs'}</span></div>
          <div className="admin-stat low-stock"><strong>{lowStock}</strong><span>{t.adminLowStock ?? 'Low stock'}</span></div>
        </div>

        <div className="admin-tabs">
          <button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}>{t.adminOrders}</button>
          <button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}>{t.adminProducts}</button>
        </div>

        {loading ? <div className="settle-empty-mini"><LoaderCircle className="spin" /></div> :
        tab === 'orders' ? (
          <section className="admin-section">
            <div className="admin-toolbar">
              <div className="admin-filters">
                <button className={statusFilter === 'all' ? 'active' : ''} onClick={() => setStatusFilter('all')}>{t.adminAll}</button>
                <button className={statusFilter === 'pending' ? 'active' : ''} onClick={() => setStatusFilter('pending')}>{t.adminPending}</button>
                <button className={statusFilter === 'paid' ? 'active' : ''} onClick={() => setStatusFilter('paid')}>{t.adminPaid}</button>
              </div>
              <button
                className="button button-dark button-mini"
                disabled={!orders.some(o => o.payment_status === 'pending')}
                onClick={handleSettleAllPending}
              >{t.adminSettleAll ?? 'Settle all pending'}</button>
            </div>
            {orders.length === 0 ? <div className="admin-empty">{t.adminNoOrders ?? 'No orders match this filter.'}</div> :
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>#{t.orderNumber}</th>
                    <th>{t.adminCustomer}</th>
                    <th>{t.adminItems}</th>
                    <th>{t.adminTotal}</th>
                    <th>{t.adminMethod}</th>
                    <th>{t.adminStatus}</th>
                    <th>{t.adminOrderActions ?? 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.order_id}>
                      <td><strong>#{o.order_id}</strong><small>{new Date(o.order_date).toLocaleDateString()}</small>
                        {o.pickup_code && <span className="pickup-chip" style={{ marginLeft: 6 }}>{o.pickup_code}</span>}
                      </td>
                      <td>{o.customer_name ?? `#${o.customer_id}`}</td>
                      <td>{o.items.reduce((s, it) => s + it.quantity, 0)} · {o.items.map(i => i.product.product_name).join(', ')}</td>
                      <td className="num"><strong>${Number(o.total_amount).toFixed(2)}</strong></td>
                      <td>{methodBadge(o.payment_method)}</td>
                      <td>{statusBadge(o.payment_status)}</td>
                      <td>
                        {o.payment_status === 'pending' && (
                          <>
                            <button className="button button-dark button-mini" disabled={orderBusy === o.order_id} onClick={() => handleSettle(o.order_id)}>
                              {orderBusy === o.order_id ? <LoaderCircle className="spin" /> : <><Banknote size={14} />{t.adminSettled ?? 'Mark as paid'}</>}
                            </button>
                            <button className="button button-ghost button-mini" disabled={orderBusy === o.order_id} onClick={() => handleRefund(o.order_id)}>{t.adminRefund ?? 'Refund'}</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
          </section>
        ) : (
          <section className="admin-section">
            <form className="admin-form" onSubmit={handleCreateProduct}>
              <h3>{t.adminNewProduct ?? 'New product'}</h3>
              <div className="admin-form-row">
                <input value={newProduct.product_name} onChange={e => setNewProduct({ ...newProduct, product_name: e.target.value })} placeholder={t.adminProductName ?? 'Name'} required />
                <input type="number" step="0.01" min="0" value={newProduct.price} onChange={e => setNewProduct({ ...newProduct, price: e.target.value })} placeholder={t.adminProductPrice ?? 'Price'} required />
                <input type="number" min="0" value={newProduct.stock_quantity} onChange={e => setNewProduct({ ...newProduct, stock_quantity: e.target.value })} placeholder={t.adminProductStock ?? 'Stock'} />
                <select value={newProduct.category_id} onChange={e => setNewProduct({ ...newProduct, category_id: e.target.value })} required>
                  <option value="">{t.adminProductCategory ?? 'Category'}</option>
                  {categories.map(c => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
                </select>
              </div>
              <input value={newProduct.description} onChange={e => setNewProduct({ ...newProduct, description: e.target.value })} placeholder={t.adminProductDesc ?? 'Description'} />
              <div className="admin-image-field">
                <label className="admin-image-label">{t.adminProductImage}</label>
                <small className="admin-image-hint">{t.adminProductImageHint}</small>
                {newProduct.image_url ? (
                  <div className="admin-image-preview">
                    <img src={newProduct.image_url} alt={t.adminProductImage} />
                    <div className="admin-image-actions">
                      <label className="text-button"><ImagePlus size={14} />{t.adminChangeImage}<input type="file" accept="image/*" hidden onChange={handleImageChange} disabled={processingImage} /></label>
                      <button type="button" className="text-button danger" disabled={processingImage} onClick={() => setNewProduct({ ...newProduct, image_url: '' })}><Trash2 size={14} />{t.adminRemoveImage}</button>
                    </div>
                  </div>
                ) : (
                  <label className={`admin-image-drop${processingImage ? ' is-busy' : ''}`}>
                    {processingImage ? <LoaderCircle className="spin" size={20} /> : <ImagePlus size={20} />}
                    <span>{processingImage ? t.adminImageProcessing : t.adminAddImage}</span>
                    <input type="file" accept="image/*" hidden onChange={handleImageChange} disabled={processingImage} />
                  </label>
                )}
              </div>
              <button className="button button-dark" type="submit" disabled={creating}>
                {creating ? <LoaderCircle className="spin" /> : <><Plus size={16} />{t.adminCreateProduct ?? 'Add product'}</>}
              </button>
            </form>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>{t.adminProductName ?? 'Name'}</th>
                    <th>{t.adminProductCategory ?? 'Category'}</th>
                    <th>{t.adminProductPrice ?? 'Price'}</th>
                    <th>{t.adminProductStock ?? 'Stock'}</th>
                    <th>{t.adminOrderActions ?? 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => {
                    const catName = categories.find(c => c.category_id === p.category_id)?.category_name ?? `#${p.category_id}`
                    return (
                      <tr key={p.product_id} className={p.stock_quantity < 10 ? 'row-low-stock' : ''}>
                        <td>#{p.product_id}</td>
                        <td className="product-cell">
                          {p.image_url && <img className="admin-product-thumb" src={p.image_url} alt="" />}
                          <div><strong>{p.product_name}</strong>{p.description && <small>{p.description}</small>}</div>
                        </td>
                        <td>{catName}</td>
                        <td className="num"><strong>${Number(p.price).toFixed(2)}</strong></td>
                        <td className="num">
                          <span className={p.stock_quantity === 0 ? 'badge-out' : p.stock_quantity < 10 ? 'badge-low' : 'badge-ok'}>{p.stock_quantity}</span>
                        </td>
                        <td>
                          <button className="button button-ghost button-mini" disabled={productBusy === p.product_id} onClick={() => handleAdjustStock(p.product_id, -1)}><Minus size={14} /></button>
                          <button className="button button-ghost button-mini" disabled={productBusy === p.product_id} onClick={() => handleAdjustStock(p.product_id, 1)}><Plus size={14} /></button>
                          <button className="button button-danger button-mini" disabled={productBusy === p.product_id} onClick={() => handleDeleteProduct(p.product_id)}>
                            {productBusy === p.product_id ? <LoaderCircle className="spin" /> : <Trash2 size={14} />}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

type PayMethod = 'cash' | 'wechat' | 'alipay'
type PayState = 'selecting' | 'paying' | 'success' | 'failed'

type BackendPayMethod = 'cash' | 'wechat' | 'alipay'

const PAYMENT_QR: Record<Exclude<PayMethod, 'cash'>, string> = {
  wechat: '/qrcode-wechat.jpg',
  alipay: '/qrcode-wechat.jpg'
}

const TO_BACKEND_METHOD: Record<PayMethod, BackendPayMethod> = {
  cash: 'cash',
  wechat: 'wechat',
  alipay: 'alipay'
}

function PaymentModal({ open, onClose, onSuccess, amount, t }: { open: boolean; onClose: () => void; onSuccess: (method: BackendPayMethod) => void; amount: number; t: any }) {
  const [method, setMethod] = useState<PayMethod>('cash')
  const [state, setState] = useState<PayState>('selecting')

  useEffect(() => {
    if (!open) {
      setMethod('cash'); setState('selecting')
    }
  }, [open])

  const handleCashConfirm = () => {
    const resolved: BackendPayMethod = TO_BACKEND_METHOD[method]
    setState('paying')
    window.setTimeout(() => { setState('success'); window.setTimeout(() => onSuccess(resolved), 600) }, 400)
  }

  if (!open) return null

  return <div className="payment-layer"><button className="payment-backdrop" onClick={onClose} aria-label={t.payCancel} />
    <div className="payment-modal">
      <button className="payment-close" onClick={onClose} aria-label={t.close}><X size={18} /></button>

      {state === 'selecting' && <>
        <div className="payment-header">
          <span className="eyebrow">PAYMENT</span>
          <h2>{t.payNowTitle}</h2>
          <p>{t.paymentMethodSub}</p>
          <div className="payment-amount"><span>{t.payAmount}</span><strong>${amount.toFixed(2)}</strong></div>
        </div>

        <div className="payment-methods">
          <button type="button" className={method === 'cash' ? 'payment-method selected' : 'payment-method'} onClick={() => setMethod('cash')}>
            <Banknote size={20} /><span><strong>{t.payWithCash ?? 'Cash'}</strong><small>{t.payWithCashSub ?? 'Take the cash'}</small></span>
          </button>
          <button type="button" className={method === 'wechat' ? 'payment-method selected' : 'payment-method'} onClick={() => setMethod('wechat')}>
            <span className="pay-badge wechat">微</span><span><strong>{t.payWithWechat}</strong><small>{t.payWithWechatSub}</small></span>
          </button>
          <button type="button" className={method === 'alipay' ? 'payment-method selected' : 'payment-method'} onClick={() => setMethod('alipay')}>
            <span className="pay-badge alipay">支</span><span><strong>{t.payWithAlipay}</strong><small>{t.payWithAlipaySub}</small></span>
          </button>
        </div>

        {method === 'cash' && <div className="payment-cash-confirm">
          <button type="button" className="cash-amount-btn" onClick={handleCashConfirm}>
            <small>{t.tapToConfirm ?? 'Tap to confirm received'}</small>
            <strong>${amount.toFixed(2)}</strong>
            <Banknote size={28} />
          </button>
          <button type="button" className="text-button" onClick={() => onClose()}><ArrowLeft size={14} />{t.backToMenu}</button>
        </div>}

        {method !== 'cash' && <div className="payment-redirect-cta">
          <div className="payment-redirect-icon"><QrCode size={40} /></div>
          <p>{t.paymentPageSub}</p>
          <button className="button button-dark full pay-submit" onClick={() => onSuccess(TO_BACKEND_METHOD[method])}>
            <QrCode size={16} />{t.payNow}
          </button>
          <button type="button" className="text-button" onClick={() => onClose()}><ArrowLeft size={14} />{t.backToMenu}</button>
        </div>}
      </>}

      {state === 'paying' && <div className="payment-status"><LoaderCircle className="spin" size={48} /><p>{t.payProcessing}</p></div>}
      {state === 'success' && <div className="payment-status success"><Check size={48} /><h3>{t.paySuccess}</h3><p>{t.paySuccessSub}</p></div>}
      {state === 'failed' && <div className="payment-status failed"><X size={48} /><h3>{t.payFailed}</h3><p>{t.payFailedSub}</p><button className="button button-dark" onClick={() => setState('selecting')}>{t.retry}</button></div>}
    </div>
  </div>
}

function CouponPopup({ open, t, coupons, loading, claimingId, claimedCoupon, onClaim, onDecline }: {
  open: boolean
  t: any
  coupons: Coupon[]
  loading: boolean
  claimingId: number | null
  claimedCoupon: ClaimedCoupon | null
  onClaim: (coupon: Coupon) => void
  onDecline: () => void
}) {
  if (!open) return null
  return (
    <div className="coupon-layer" role="dialog" aria-modal="true">
      <button className="coupon-backdrop" onClick={onDecline} aria-label={t.close} />
      <div className="coupon-modal">
        <button className="coupon-close" onClick={onDecline} aria-label={t.close}><X size={18} /></button>
        <div className="coupon-modal-head">
          <span className="eyebrow">{t.couponPopupEyebrow}</span>
          <div className="coupon-modal-icon"><Tag size={26} /></div>
          <h2>{t.couponPopupTitle}</h2>
          <p>{t.couponPopupBody}</p>
        </div>
        <div className="coupon-list">
          {loading ? (
            <div className="coupon-list-empty"><LoaderCircle size={22} className="spin" /><span>{t.brewing}</span></div>
          ) : coupons.length === 0 ? (
            <div className="coupon-list-empty"><Tag size={22} /><span>{t.couponListEmpty}</span></div>
          ) : coupons.map(coupon => {
            const isClaimed = claimedCoupon?.coupon_id === coupon.coupon_id
            const isClaiming = claimingId === coupon.coupon_id
            const soldOut = coupon.remaining_claims !== null && coupon.remaining_claims <= 0 && !isClaimed
            return (
              <article key={coupon.coupon_id} className={isClaimed ? 'coupon-item is-claimed' : soldOut ? 'coupon-item is-sold-out' : 'coupon-item'}>
                <div className="coupon-item-notch left" /><div className="coupon-item-notch right" />
                <div className="coupon-item-head">
                  <span className="coupon-item-code">{coupon.code}</span>
                  <strong className="coupon-item-percent">{Number(coupon.discount_percent)}% OFF</strong>
                </div>
                <div className="coupon-item-body">
                  <h3>{coupon.title}</h3>
                  {coupon.description && <p>{coupon.description}</p>}
                </div>
                <div className="coupon-item-foot">
                  {coupon.remaining_claims !== null && (
                    <small className="coupon-item-remaining">
                      {soldOut ? t.couponSoldOut : t.couponRemaining.replace('{n}', String(coupon.remaining_claims))}
                    </small>
                  )}
                  {isClaimed ? (
                    <span className="coupon-item-claimed-badge"><Check size={14} />{t.couponActiveBadge}</span>
                  ) : (
                    <button
                      type="button"
                      className="button button-dark button-mini"
                      disabled={isClaiming || soldOut}
                      onClick={() => onClaim(coupon)}
                    >
                      {isClaiming ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}
                      {soldOut ? t.couponSoldOut : t.couponClaimCta}
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
        <div className="coupon-actions">
          <button type="button" className="text-button coupon-decline" onClick={onDecline}>{t.couponDeclineCta}</button>
        </div>
      </div>
    </div>
  )
}

function PaymentPage({ t }: { t: any }) {
  const navigate = useNavigate()
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const orderId = Number(params.get('order'))
  const method = (params.get('method') as 'wechat' | 'alipay') || 'wechat'

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [paid, setPaid] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [minutesLeft, setMinutesLeft] = useState(15)

  // Fetch the order and keep polling until the backend reports it paid.
  useEffect(() => {
    if (!orderId) { setLoading(false); return }
    let alive = true
    const fetchOrder = async (): Promise<Order | null> => {
      try {
        const o = await api.getOrder(orderId)
        if (!alive) return null
        setOrder(o)
        setLoading(false)
        if (o.payment_status === 'paid') setPaid(true)
        return o
      } catch (err) {
        if (alive) { setError(err instanceof Error ? err.message : t.apiOffline); setLoading(false) }
        return null
      }
    }
    void fetchOrder()
    const id = window.setInterval(async () => {
      const o = await fetchOrder()
      if (o && o.payment_status === 'paid') window.clearInterval(id)
    }, 1500)
    return () => { alive = false; window.clearInterval(id) }
  }, [orderId, t.apiOffline])

  // Countdown the held order window.
  useEffect(() => {
    if (paid || !orderId) return
    const id = window.setInterval(() => setMinutesLeft(m => (m > 0 ? m - 1 : 0)), 60000)
    return () => window.clearInterval(id)
  }, [paid, orderId])

  // When the backend detects payment (via Admin "Mark as Paid" action or
  // payment webhook), polling above flips paid → success UI auto-shows.


  // Redirect to the account page once payment is confirmed.
  useEffect(() => {
    if (!paid) return
    const id = window.setTimeout(() => navigate('/account'), 1800)
    return () => window.clearTimeout(id)
  }, [paid, navigate])

  const confirmPaid = async () => {
    setConfirming(true)
    try {
      const o = await api.payOrder(orderId)
      setOrder(o)
      if (o.payment_status === 'paid') setPaid(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.apiOffline)
    } finally {
      setConfirming(false)
    }
  }

  if (!orderId) return (
    <section className="page-section"><div className="container narrow-page"><div className="empty-state compact"><QrCode size={32} /><h2>{t.paymentPageMissingOrder}</h2><button className="button button-dark" onClick={() => navigate('/')}>{t.paymentPageBack}</button></div></div></section>
  )

  const amount = order ? Number(order.total_amount) : 0

  return (
    <section className="page-section payment-page"><div className="container narrow-page">
      <div className="page-title"><span className="eyebrow">PAYMENT</span><h1>{t.paymentPageTitle}</h1><p>{t.paymentPageSub}</p></div>
      {loading ? <LoadingBlock text={t.brewing} /> : paid ? (
        <div className="payment-status success"><Check size={56} /><h2>{t.paymentPagePaidTitle}</h2><p>{t.paymentPagePaidSub}</p><p className="payment-redirect"><LoaderCircle className="spin" size={15} />{t.paymentPageRedirecting}</p></div>
      ) : (
        <div className="payment-page-card">
          <div className="payment-page-summary">
            <div className="payment-page-row"><span>{t.paymentPageOrderLabel}</span><strong>#{orderId}</strong></div>
            <div className="payment-page-row"><span>{t.paymentPageAmount}</span><strong>${amount.toFixed(2)}</strong></div>
            <div className="payment-page-row"><span>{t.paymentPageExpiresIn}</span><strong>{minutesLeft} {t.paymentPageMinutes}</strong></div>
          </div>
          <div className="payment-qr">
            <div className="qr-box"><img src={PAYMENT_QR[method]} alt={method === 'wechat' ? t.payWithWechat : t.payWithAlipay} /></div>
            <p className="qr-method-name">{method === 'wechat' ? t.payWithWechat : t.payWithAlipay}</p>
            <p>{t.qrCodeTip}</p>
          </div>
          <div className="payment-monitor">
            <LoaderCircle className="spin pulse" size={14} />
            <span>{t.paymentPageMonitoring}</span>
          </div>
          <div className="payment-page-actions">
            <button className="button button-dark full" disabled={confirming} onClick={confirmPaid}>
              {confirming ? <><LoaderCircle className="spin" size={15} />{t.paymentPageConfirming}</> : <><Check size={16} />{t.paymentPageConfirm}</>}
            </button>
            <button type="button" className="text-button" onClick={() => navigate('/')}><ArrowLeft size={14} />{t.paymentPageBack}</button>
          </div>
          {error && <div className="inline-error">{error}</div>}
        </div>
      )}
    </div></section>
  )
}

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