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
  TrendingUp,
  Wallet,
  X
} from 'lucide-react'
import { api } from './api'
import { copy } from './i18n'
import { LoginPage } from './LoginPage'
import { StaffPage, UsersTab, SettingsTab, LogsTab } from './StaffPage'
import type { AuthStatus, BalanceTransaction, CartItem, Category, ClaimedCoupon, Coupon, CreditStatus, Customer, Language, MarketOverview, MarketProductStat, Order, OverviewTimeseriesPoint, Product, ProductMarketDetail, ProductSaleRecord, ProductTimeseriesPoint, ProductVariant, StoreStatus, WalletSummary } from './types'

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
  const [store, setStore] = useState<StoreStatus | null>(null)
  const t = copy[language]

  const refreshAuth = useCallback(() => api.authStatus().then(status => {
    setAuth(status)
    if (status.customer) setCustomerId(status.customer.customer_id)
  }).catch(() => setAuth(null)), [setCustomerId])
  useEffect(() => { void refreshAuth() }, [refreshAuth])

  const refreshStore = useCallback(() => {
    api.storeStatus().then(setStore).catch(() => setStore(null))
  }, [])
  useEffect(() => { void refreshStore() }, [refreshStore])

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
  const addToCart = (product: Product, variant?: ProductVariant | null, temperature?: ProductVariant | null) => {
    const variantId = variant?.variant_id
    const temperatureId = temperature?.variant_id
    const stock = variant?.stock_quantity ?? product.stock_quantity
    const price = Number(product.price)
      + (variant ? Number(variant.price_delta) : 0)
      + (temperature ? Number(temperature.price_delta) : 0)
    setCart(current => {
      const isSameLine = (item: CartItem) =>
        item.product_id === product.product_id
        && item.variant_id === variantId
        && item.temperature_variant_id === temperatureId
      const found = current.find(isSameLine)
      return found
        ? current.map(item => isSameLine(item)
          ? { ...item, quantity: Math.min(item.quantity + 1, stock) }
          : item)
        : [...current, {
            ...product,
            price: price.toFixed(2),
            stock_quantity: stock,
            quantity: 1,
            variant_id: variantId,
            variant_name: variant?.name,
            temperature_variant_id: temperatureId,
            temperature_name: temperature?.name
          }]
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
  const marketMatch = path.match(/^\/market\/(\d+)$/)
  const marketProductId = marketMatch ? Number(marketMatch[1]) : null
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
        : path === '/login'
          ? <LoginRoute t={t} onDone={refreshAuth} />
          : path === '/staff'
            ? <StaffPage t={t} onLogin={refreshAuth} />
            : path === '/account'
              ? <AccountPage t={t} customerId={customerId} setCustomerId={setCustomerId} auth={auth} refreshAuth={refreshAuth} />
              : path === '/admin'
                ? <AdminPage t={t} />
                : path === '/market'
                  ? <Navigate to="/admin" replace />
                  : marketProductId !== null
                    ? <ProductMarketPage t={t} productId={marketProductId} />
                    : <OrderPage t={t} addToCart={addToCart} locked={locked} cart={cart} coupon={claimedCoupon} onOpenCoupon={() => setCouponPopupOpen(true)} />

  return (
    <div className="app-shell" lang={language === 'zh' ? 'zh-CN' : 'en'}>
      <Header
        t={t}
        itemCount={itemCount}
        signedIn={Boolean(auth?.authenticated)}
        onSettings={() => setSettingsOpen(true)}
      />
      {store && path !== '/staff' && (!store.open || store.settings.announcement) && (
        <StoreBanner t={t} store={store} />
      )}
      <main>{page}</main>
      <Footer t={t} />
      {!claimedCoupon && !path.startsWith('/admin') && (
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

function Header({ t, itemCount, onSettings, signedIn }: { t: any; itemCount: number; onSettings: () => void; signedIn: boolean }) {
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
          <Link className="header-login" to="/staff">{t.staff}</Link>
          {!signedIn && <Link className="header-login" to="/login">{t.loginSeiue}</Link>}
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
                <HomeProductCard
                  key={product.product_id}
                  product={product}
                  index={index}
                  t={t}
                  cart={cart}
                  locked={locked}
                  addToCart={addToCart}
                  categoryLabel={categoryName(categories.find(c => c.category_id === product.category_id)?.category_name ?? 'Coffee', t)}
                />
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

function ShopPage({ t, addToCart, locked, cart, coupon, onRemoveCoupon }: { t: any; addToCart: (product: Product, variant?: ProductVariant | null) => void; locked: boolean; cart: CartItem[]; coupon: ClaimedCoupon | null; onRemoveCoupon: () => void }) {
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
    {loading ? <LoadingBlock text={t.brewing} /> : <div className="catalog-grid">{listed.map((item, index) => (
      <CatalogCard
        key={item.product_id}
        item={item}
        index={index}
        t={t}
        cart={cart}
        locked={locked}
        addToCart={addToCart}
        discountPercent={discountPercent}
        categoryLabel={categoryName(categories.find(c => c.category_id === item.category_id)?.category_name ?? '', t)}
      />
    ))}</div>}
    {!loading && listed.length === 0 && <div className="empty-state compact"><Search /><h3>{t.noMatches}</h3><p>{t.noMatchesSub}</p></div>}
  </div></section>
}

function CartPage({ t, cart, setCart }: { t: any; cart: CartItem[]; setCart: (value: CartItem[] | ((current: CartItem[]) => CartItem[])) => void }) {
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)
  const updateQuantity = (key: string, delta: number) => setCart(current => current.map(item => lineKey(item) === key ? { ...item, quantity: Math.max(0, Math.min(item.stock_quantity, item.quantity + delta)) } : item).filter(item => item.quantity > 0))
  const customize = (key: string, value: string) => setCart(current => current.map(item => lineKey(item) === key ? { ...item, customization: value } : item))
  const removeLine = (key: string) => setCart(current => current.filter(x => lineKey(x) !== key))

  return <section className="page-section"><div className="container narrow-page">
    <div className="cart-title-row"><PageTitle eyebrow="YOUR SELECTION" title={t.yourCart} subtitle={t.cartSub} />{cart.length > 0 && <button className="clear-cart" onClick={() => { if (window.confirm(t.clearCartConfirm)) setCart([]) }}><Trash2 />{t.clearCart}</button>}</div>
    {cart.length === 0 ? <div className="empty-state"><div className="empty-icon"><ShoppingBag /></div><h2>{t.emptyCart}</h2><p>{t.emptyCartSub}</p><Link className="button button-dark" to="/">{t.browse}<ArrowRight size={17} /></Link></div> : (
      <div className="cart-layout">
        <div className="cart-list">
          {cart.map(item => <article className="cart-item" key={lineKey(item)}>
            <img src={item.image_url ?? productArt[item.product_name] ?? fallbackArt} alt="" />
            <div className="cart-item-main"><div className="cart-item-title"><div><span>{item.variant_name ?? t.coffee}</span><h3>{item.product_name}</h3></div><strong>¥{(Number(item.price) * item.quantity).toFixed(2)}</strong></div>
              <p>¥{Number(item.price).toFixed(2)} {t.each}{item.variant_name && <> · {item.variant_name}</>}{item.temperature_name && <> · {item.temperature_name}</>}</p>
              <input className="customization-input" placeholder={`${t.customization} (${t.optional})`} value={item.customization ?? ''} onChange={e => customize(lineKey(item), e.target.value)} />
              <div className="cart-item-actions"><div className="stepper"><button onClick={() => updateQuantity(lineKey(item), -1)}><Minus size={15} /></button><span>{item.quantity}</span><button onClick={() => updateQuantity(lineKey(item), 1)}><Plus size={15} /></button></div><button className="text-button danger" onClick={() => removeLine(lineKey(item))}><Trash2 size={15} />{t.remove}</button></div>
            </div>
          </article>)}
        </div>
        <aside className="order-summary"><span className="eyebrow">{t.currentOrder}</span><h2>{t.total}</h2><div className="summary-line"><span>{t.subtotal}</span><span>¥{subtotal.toFixed(2)}</span></div><div className="summary-line"><span>{t.service}</span><span>—</span></div><div className="summary-total"><span>{t.total}</span><strong>¥{subtotal.toFixed(2)}</strong></div><Link className="button button-dark full" to="/checkout">{t.continueCheckout}<ArrowRight size={17} /></Link><Link className="continue-link" to="/"><ArrowLeft size={14} />{t.editOrder}</Link></aside>
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
  const [payWithBalance, setPayWithBalance] = useState(false)
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
    // Merge identical product+variant lines — the backend rejects duplicate lines.
    const merged: Record<string, { product_id: number; variant_id?: number; temperature_variant_id?: number; quantity: number; customization: string | undefined }> = {}
    for (const item of cart) {
      const key = lineKey(item)
      const note = [item.customization, tabNote].filter(Boolean).join(' · ') || undefined
      if (merged[key]) {
        merged[key].quantity += item.quantity
        if (note) merged[key].customization = [merged[key].customization, note].filter(Boolean).join(' · ') || undefined
      } else {
        merged[key] = { product_id: item.product_id, variant_id: item.variant_id, temperature_variant_id: item.temperature_variant_id, quantity: item.quantity, customization: note }
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
    if (payWithBalance) {
      setSubmitting(true)
      try {
        const id = await createCustomerIfNeeded()
        await createOrder(id, 'balance')
      } catch (err) { setError(err instanceof Error ? err.message : t.apiOffline) }
      finally { setSubmitting(false) }
      return
    }
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
        const merged: Record<string, { product_id: number; variant_id?: number; temperature_variant_id?: number; quantity: number; customization: string | undefined }> = {}
        for (const item of cart) {
          const key = lineKey(item)
          const note = [item.customization, couponNote].filter(Boolean).join(' · ') || undefined
          if (merged[key]) {
            merged[key].quantity += item.quantity
            if (note) merged[key].customization = [merged[key].customization, note].filter(Boolean).join(' · ') || undefined
          } else {
            merged[key] = { product_id: item.product_id, variant_id: item.variant_id, temperature_variant_id: item.temperature_variant_id, quantity: item.quantity, customization: note }
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
          <div className="payment-options"><button type="button" className={payment === 'paid' && !payWithBalance ? 'payment-option selected' : 'payment-option'} onClick={() => { setPayWithBalance(false); setPayment('paid') }}><span className="payment-icon"><Banknote /></span><span><strong>{t.payNow}</strong><small>{t.payNowSub}</small></span><span className="radio-dot" /></button><button type="button" disabled={!auth?.authenticated} className={payment === 'pending' ? 'payment-option selected' : 'payment-option'} onClick={() => { setPayWithBalance(false); setPayment('pending') }}><span className="payment-icon"><Banknote /></span><span><strong>{t.payLater} <em>赊账</em></strong><small>{auth?.authenticated ? t.payLaterSub : t.loginRequired}</small></span><span className="radio-dot" /></button>{auth?.authenticated && auth.customer && <button type="button" disabled={Number(auth.customer.balance) < total} className={payWithBalance ? 'payment-option selected' : 'payment-option'} onClick={() => { setPayWithBalance(true); setPayment('paid') }}><span className="payment-icon"><Wallet /></span><span><strong>{t.balanceOrder}</strong><small>{t.balance} ¥{Number(auth.customer.balance).toFixed(2)}{Number(auth.customer.balance) < total ? ` · ${t.balanceInsufficient}` : ''}</small></span><span className="radio-dot" /></button>}</div>
          {payment === 'pending' && <div className="credit-terms"><div><strong>{t.tabLength}</strong><span>{creditDays} {t.days}</span></div><input type="range" min="1" max="14" step="1" value={creditDays} onChange={e => setCreditDays(Number(e.target.value))} /><div className="range-labels"><span>1 {t.days}</span><span>7 {t.days}</span><span>14 {t.days}</span></div><small>{t.maxTwoWeeks}</small><p><ShieldCheck size={15} /> {t.dueOn} {new Date(Date.now() + creditDays * 86400000).toLocaleDateString()}.</p></div>}
        </section>
      </div>
      <aside className="checkout-summary order-summary"><span className="eyebrow">{t.currentOrder}</span>{cart.map(item => <div className="mini-item" key={lineKey(item)}><img src={item.image_url ?? productArt[item.product_name] ?? fallbackArt} alt="" /><div><strong>{item.product_name}{item.variant_name && <span className="cart-variant">{item.variant_name}</span>}</strong><small>{item.quantity} × ¥{Number(item.price).toFixed(2)}</small></div><span>¥{(item.quantity * Number(item.price)).toFixed(2)}</span></div>)}{claimedCoupon && <div className="summary-coupon"><div className="summary-coupon-line"><Tag size={14} /><span><strong>{claimedCoupon.code}</strong> · {Number(claimedCoupon.discount_percent)}% {t.couponBannerOff}</span></div><div className="summary-line"><span>{t.subtotal}</span><span>¥{subtotal.toFixed(2)}</span></div><div className="summary-line discount"><span>{t.couponBannerTitle}</span><span>−¥{(subtotal - total).toFixed(2)}</span></div></div>}<div className="summary-total"><span>{t.total}</span><strong>¥{total.toFixed(2)}</strong></div>{error && <div className="inline-error">{error}</div>}<button className="button button-dark full" disabled={submitting}>{submitting ? <><LoaderCircle className="spin" />{t.placing}</> : <>{t.placeOrder}<ArrowRight size={17} /></>}</button><small className="secure-note"><LockKeyhole size={13} /> {t.secureCheckout}</small></aside>
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
  const [wallet, setWallet] = useState<WalletSummary | null>(null)
  const [topUpAmount, setTopUpAmount] = useState('50')
  const [topUpBusy, setTopUpBusy] = useState(false)
  const [walletMsg, setWalletMsg] = useState('')

  const loadWallet = useCallback(() => {
    api.wallet().then(setWallet).catch(() => setWallet(null))
  }, [])
  useEffect(() => { if (auth?.authenticated) loadWallet() }, [auth, loadWallet])

  const handleTopUp = async () => {
    setWalletMsg('')
    setTopUpBusy(true)
    try {
      const updated = await api.topUp(Number(topUpAmount).toFixed(2))
      setWallet(updated)
      setTopUpAmount('50')
      setWalletMsg(t.topUpSuccess)
      await refreshAuth()
      window.setTimeout(() => setWalletMsg(''), 2200)
    } catch (err) {
      setWalletMsg(err instanceof Error ? err.message : t.apiOffline)
    } finally {
      setTopUpBusy(false)
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
    {!auth?.authenticated ? <>{auth === null ? <div className="login-unconfigured"><LoaderCircle className="spin" /> Loading…</div> : <><p className="staff-login-hint"><ShieldCheck size={16} />{t.loginRequired}</p><LoginPage t={t} onDone={refreshAuth} /></>}</> : loading ? <LoadingBlock text={t.brewing} /> : !customer ? <LoadingBlock text={t.brewing} /> : <><div className="account-grid">
      <aside className="profile-card"><div className="large-avatar">{customer.first_name[0]}{customer.last_name[0]}<span><BadgeCheck /></span></div><h2>{customer.first_name} {customer.last_name}</h2><p>{customer.email}</p><div className="profile-stat"><span><Wallet />{t.balance}</span><strong>¥{Number(customer.balance).toFixed(2)}</strong></div><div className="profile-stat"><span><Sparkles />{t.loyalty}</span><strong>{customer.loyalty_points}</strong></div><div className="profile-stat"><span><Clock3 />{t.memberSince}</span><strong>{new Date(customer.join_date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</strong></div><div className="profile-stat"><span><Banknote />{t.tabTotal ?? 'Tab total'}</span><strong className={auth.credit?.locked ? 'locked-amount' : ''}>¥{Number(auth.credit?.outstanding_amount ?? 0).toFixed(2)}</strong></div>{auth.credit?.locked && <div className="profile-lock-hint"><LockKeyhole size={14} />{t.tabLocked ?? 'Locked: tab over ¥100'}</div>}{auth.credit?.outstanding_amount ? <button className="button button-dark profile-settle-btn" disabled={settlingAll} onClick={handleSettleAll}>{settlingAll ? <><LoaderCircle className="spin" />{t.settlingAll}</> : <><Banknote />{t.settleAll}</>}</button> : null}</aside>
      <div className="account-content">{auth.credit?.locked && <LockBanner t={t} credit={auth.credit} settleAll={handleSettleAll} settling={settlingAll} />}<section className="account-panel"><div className="panel-heading"><div><span className="eyebrow">HISTORY</span><h2>{t.activity}</h2></div><Coffee /></div>{orders.length === 0 ? <div className="activity-empty"><Coffee /><p>{t.noActivity}</p></div> : <div className="activity-list">{orders.map(order => <article className="activity-row" key={order.order_id}><div className="activity-icon"><ShoppingBag /></div><div className="activity-copy"><div><strong>{t.orderNumber} #{order.order_id}</strong><StatusPill status={order.payment_status} t={t} />{order.pickup_code && <span className="pickup-chip">{t.pickupCode ?? 'Pickup'} · {order.pickup_code}</span>}</div><p>{order.items.map(item => `${item.quantity}× ${item.product.product_name}`).join(' · ')}</p><small>{new Date(order.order_date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}{order.credit_due_at && ` · ${t.due}: ${new Date(order.credit_due_at).toLocaleDateString()}`}</small></div><div className="activity-price"><strong>¥{Number(order.total_amount).toFixed(2)}</strong>{order.payment_status === 'pending' && order.credit_due_at && <button disabled={settling === order.order_id} onClick={async () => { setSettling(order.order_id); await api.payOrder(order.order_id); await refreshAuth(); const history = await api.customerOrders(customer.customer_id); setOrders(history); setSettling(null) }}>{settling === order.order_id ? t.settling : t.settleNow}</button>}</div></article>)}</div>}</section>
        <section className="account-panel wallet-panel"><div className="panel-heading"><div><span className="eyebrow">WALLET</span><h2>{t.balance}</h2><p>{t.balanceSub}</p></div><Wallet /></div><div className="wallet-balance"><strong>¥{Number(wallet?.balance ?? customer.balance ?? 0).toFixed(2)}</strong><small>{t.topUpMax} ¥{Number(wallet?.max_balance ?? 0).toFixed(2)}</small></div><div className="wallet-presets">{[20, 50, 100, 200].map(value => <button key={value} type="button" onClick={() => setTopUpAmount(String(value))}>¥{value}</button>)}</div><div className="wallet-topup"><label><span>{t.topUpAmount}</span><input type="number" min="0" step="0.01" value={topUpAmount} onChange={event => setTopUpAmount(event.target.value)} /></label><button type="button" className="button button-dark" disabled={topUpBusy} onClick={handleTopUp}>{topUpBusy ? <LoaderCircle className="spin" size={15} /> : <><Plus size={15} />{t.topUpSubmit}</>}</button></div><small className="wallet-note">{t.topUpMin} ¥{Number(wallet?.recharge_minimum ?? 0).toFixed(2)}{walletMsg ? ` · ${walletMsg}` : ''}</small><div className="wallet-transactions">{!wallet || wallet.transactions.length === 0 ? <p className="muted">{t.noTransactions}</p> : wallet.transactions.map((tx: BalanceTransaction) => <div className="wallet-row" key={tx.balance_transaction_id}><div><strong>{tx.kind}{tx.order_id ? ` #${tx.order_id}` : ''}</strong><small>{new Date(tx.created_at).toLocaleString()}{tx.note ? ` · ${tx.note}` : ''}</small></div><strong className={Number(tx.amount) >= 0 ? 'positive' : 'negative'}>{Number(tx.amount) >= 0 ? '+' : ''}¥{Number(tx.amount).toFixed(2)}</strong></div>)}</div></section>
        <section className="account-panel privacy-panel"><div className="panel-heading"><div><span className="eyebrow">CONTROL</span><h2>{t.privacy}</h2><p>{t.privacySub}</p></div><ShieldCheck /></div><PrivacyToggle icon={<Sparkles />} title={t.recommendations} text={t.recommendationsSub} checked={privacy.recommendations} onChange={checked => setPrivacy({ ...privacy, recommendations: checked })} /><PrivacyToggle icon={<Bell />} title={t.marketing} text={t.marketingSub} checked={privacy.marketing} onChange={checked => setPrivacy({ ...privacy, marketing: checked })} /><PrivacyToggle icon={<Eye />} title={t.profileVisibility} text={t.profileVisibilitySub} checked={privacy.publicProfile} onChange={checked => setPrivacy({ ...privacy, publicProfile: checked })} /><button className="button button-dark save-privacy" onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 1800) }}>{saved ? <><Check />{t.saved}</> : t.save}</button></section>
      </div>
    </div></>}
  </div></section>
}

function SettingsPanel({ open, onClose, language, setLanguage, t }: { open: boolean; onClose: () => void; language: Language; setLanguage: (value: Language) => void; t: any }) {
  return <div className={open ? 'settings-layer open' : 'settings-layer'} aria-hidden={!open}><button className="settings-backdrop" onClick={onClose} aria-label={t.close} /><aside className="settings-drawer"><div className="drawer-head"><div><span className="eyebrow">WHALE</span><h2>{t.settingsTitle}</h2></div><button className="icon-button" onClick={onClose}><X /></button></div><div className="settings-group"><div className="settings-label"><Globe2 /><div><h3>{t.language}</h3><p>{t.languageSub}</p></div></div><div className="language-options"><button className={language === 'en' ? 'selected' : ''} onClick={() => setLanguage('en')}><span>EN</span><div><strong>{t.english}</strong><small>English</small></div>{language === 'en' && <Check />}</button><button className={language === 'zh' ? 'selected' : ''} onClick={() => setLanguage('zh')}><span>中</span><div><strong>{t.chinese}</strong><small>Chinese</small></div>{language === 'zh' && <Check />}</button></div></div><div className="settings-row"><span className="settings-row-icon"><Sparkles /></span><div><strong>{t.appearance}</strong><small>{t.systemTheme}</small></div><ChevronRight /></div><div className="settings-row"><span className="settings-row-icon"><ShieldCheck /></span><div><strong>{t.privacy}</strong><small>{t.privacySub}</small></div><ChevronRight /></div><div className="settings-row"><span className="settings-row-icon"><CircleUserRound /></span><div><strong>{t.help}</strong><small>hello@whale.coffee</small></div><ChevronRight /></div><div className="drawer-footer"><Coffee /><span>Whale v1.0</span></div></aside></div>
}

function Footer({ t }: { t: any }) { return <footer><div className="container footer-inner"><Link className="brand footer-brand" to="/"><span className="brand-mark"><Coffee size={18} /></span>WHALE</Link><p>{t.thoughtfulCoffee}</p><nav><Link to="/">{t.order}</Link><Link to="/shop">{t.shop}</Link><Link to="/settle">{t.settle}</Link><Link to="/account">{t.account}</Link><a href="/docs">API</a></nav><span>© {new Date().getFullYear()} Whale · <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>京ICP备2026054406号-1</a></span></div></footer> }

function LoginRoute({ t, onDone }: { t: any; onDone: () => Promise<void> }) {
  const navigate = useNavigate()
  return <section className="page-section"><div className="container"><LoginPage t={t} onDone={async () => { await onDone(); navigate('/account') }} /></div></section>
}

function StoreBanner({ t, store }: { t: any; store: StoreStatus }) {
  return <div className={store.open ? 'store-banner' : 'store-banner closed'}><div className="container"><span><Clock3 size={15} /></span><div><strong>{store.open ? t.storeOpenNow : t.storeClosed}</strong><p>{t.storeHours}: {store.settings.open_time}–{store.settings.close_time}{store.settings.announcement ? ` · ${store.settings.announcement}` : ''}</p></div></div></div>
}
function LockBanner({ t, credit, settleAll, settling }: { t: any; credit?: CreditStatus | null; settleAll?: () => Promise<void>; settling?: boolean }) { return <div className="lock-banner"><span><LockKeyhole /></span><div><strong>{t.accountLocked}</strong><p>{t.accountLockedSub}</p></div>{credit && <div className="lock-amount"><small>{t.overdueBalance}</small><strong>¥{Number(credit.outstanding_amount).toFixed(2)}</strong></div>}{settleAll ? <button className="button button-dark" disabled={settling} onClick={settleAll}>{settling ? <><LoaderCircle className="spin" />{t.settlingAll}</> : <>{t.settleAll}<ArrowRight /></>}</button> : <Link to="/account">{t.settleNow}<ArrowRight /></Link>}</div> }

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
        <div className="settle-summary-row"><span>{t.settleOutstanding ?? 'Outstanding balance'}</span><strong className={locked ? 'locked-amount' : ''}>¥{outstanding.toFixed(2)}</strong></div>
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
            <strong className="settle-row-price">¥{Number(o.total_amount).toFixed(2)}</strong>
            <button className="button button-dark button-mini" disabled={settlingOne === o.order_id} onClick={() => settleOne(o.order_id)}>{settlingOne === o.order_id ? <LoaderCircle className="spin" /> : t.settleOne ?? 'Settle'}</button>
          </div>
        ))}
      </div>}
    </section>
    <aside className="settle-total-card">
      <div className="settle-total-amount"><span>{t.settleTotalLabel ?? 'Total to pay'}</span><strong>¥{outstanding.toFixed(2)}</strong></div>
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
  const [tab, setTab] = useState<'orders' | 'products' | 'market' | 'customers' | 'settings' | 'logs' | 'coupons'>('orders')
  const [orders, setOrders] = useState<Order[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [orderBusy, setOrderBusy] = useState<number | null>(null)
  const [productBusy, setProductBusy] = useState<number | null>(null)
  const [newProduct, setNewProduct] = useState({ product_name: '', description: '', price: '', stock_quantity: '', category_id: '', image_url: '' })
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [newProductSizes, setNewProductSizes] = useState({
    regularPrice: '',
    bigPrice: '',
    temps: { Iced: true, Warm: true, Hot: false } as Record<string, boolean>
  })
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
      const created = await api.createProduct({
        product_name: newProduct.product_name,
        description: newProduct.description || null,
        price: newProduct.price,
        stock_quantity: Number(newProduct.stock_quantity) || 0,
        image_url: newProduct.image_url || null,
        category_id: Number(newProduct.category_id)
      })
      const base = Number(newProduct.price)
      const regular = newProductSizes.regularPrice ? Number(newProductSizes.regularPrice) : base
      const big = newProductSizes.bigPrice ? Number(newProductSizes.bigPrice) : base + 1
      let order = 0
      for (const preset of [
        { name: 'Regular', price_delta: (regular - base).toFixed(2) },
        { name: 'Big', price_delta: (big - base).toFixed(2) }
      ]) {
        await api.createVariant(created.product_id, { ...preset, group_name: 'Size', stock_quantity: null, sort_order: order++ })
      }
      for (const [name, enabled] of Object.entries(newProductSizes.temps)) {
        if (!enabled) continue
        await api.createVariant(created.product_id, { name, group_name: 'Temperature', price_delta: '0.00', stock_quantity: null, sort_order: order++ })
      }
      setNewProduct({ product_name: '', description: '', price: '', stock_quantity: '', category_id: '', image_url: '' })
      setNewProductSizes({ regularPrice: '', bigPrice: '', temps: { Iced: true, Hot: true, Warm: false } })
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
          <div className="admin-stat"><strong>¥{totalRevenue.toFixed(2)}</strong><span>{t.adminRevenue ?? 'Revenue'}</span></div>
          <div className="admin-stat"><strong>{pendingCount}</strong><span>{t.adminOpenTab ?? 'Open tabs'}</span></div>
          <div className="admin-stat low-stock"><strong>{lowStock}</strong><span>{t.adminLowStock ?? 'Low stock'}</span></div>
        </div>

        <div className="admin-tabs">
          <button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}>{t.adminOrders}</button>
          <button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}>{t.adminProducts}</button>
          <button className={tab === 'market' ? 'active' : ''} onClick={() => setTab('market')}>{t.marketNav}</button>
          <button className={tab === 'customers' ? 'active' : ''} onClick={() => setTab('customers')}>{t.staffUsers}</button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>{t.staffSettings}</button>
          <button className={tab === 'logs' ? 'active' : ''} onClick={() => setTab('logs')}>{t.staffLogs}</button>
          <button className={tab === 'coupons' ? 'active' : ''} onClick={() => setTab('coupons')}>{t.adminCoupons ?? 'Coupons'}</button>
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
                      <td className="num"><strong>¥{Number(o.total_amount).toFixed(2)}</strong></td>
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
        ) : tab === 'products' ? (
          <section className="admin-section">
            <form className="admin-form" onSubmit={handleCreateProduct}>
              <h3>{t.adminNewProduct ?? 'New product'}</h3>
              <div className="admin-form-row">
                <input value={newProduct.product_name} onChange={e => setNewProduct({ ...newProduct, product_name: e.target.value })} placeholder={t.adminProductName ?? 'Name'} required />
                <input type="number" step="0.01" min="0" value={newProduct.price} onChange={e => setNewProduct({ ...newProduct, price: e.target.value })} placeholder={t.adminProductPrice ?? 'Price'} required />
                <input type="number" min="0" value={newProduct.stock_quantity} onChange={e => setNewProduct({ ...newProduct, stock_quantity: e.target.value })} placeholder={t.adminProductQuantity ?? 'Quantity'} />
                <select value={newProduct.category_id} onChange={e => setNewProduct({ ...newProduct, category_id: e.target.value })} required>
                  <option value="">{t.adminProductCategory ?? 'Category'}</option>
                  {categories.map(c => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
                </select>
              </div>
              <input value={newProduct.description} onChange={e => setNewProduct({ ...newProduct, description: e.target.value })} placeholder={t.adminProductDesc ?? 'Description'} />
              <div className="admin-size-presets">
                <span className="admin-image-label">{t.adminSizes ?? 'Sizes'}</span>
                <div className="admin-size-row">
                  <label className="admin-size-price">
                    <span>Regular</span>
                    <input type="number" step="0.01" min="0" value={newProductSizes.regularPrice} onChange={e => setNewProductSizes({ ...newProductSizes, regularPrice: e.target.value })} placeholder={newProduct.price || 'Price'} />
                  </label>
                  <label className="admin-size-price">
                    <span>Big</span>
                    <input type="number" step="0.01" min="0" value={newProductSizes.bigPrice} onChange={e => setNewProductSizes({ ...newProductSizes, bigPrice: e.target.value })} placeholder={newProduct.price || 'Price'} />
                  </label>
                </div>
                <small className="admin-image-hint">{t.adminSizePriceHint ?? 'Set the price customers pay for each size. Blank uses the price above (Big adds ¥1.00).'}</small>
              </div>
              <div className="admin-size-presets">
                <span className="admin-image-label">{t.temperature ?? 'Temperature'}</span>
                <div className="admin-temp-options">
                  {Object.keys(newProductSizes.temps).map(name => <label key={name} className="admin-temp-option">
                    <input type="checkbox" checked={newProductSizes.temps[name]} onChange={e => setNewProductSizes({ ...newProductSizes, temps: { ...newProductSizes.temps, [name]: e.target.checked } })} />
                    {name}
                  </label>)}
                </div>
                <small className="admin-image-hint">{t.adminTempHint ?? 'Temperatures customers can choose on the product page.'}</small>
              </div>
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
                    <th>{t.adminSizes ?? 'Sizes'}</th>
                    <th>{t.adminProductPrice ?? 'Price'}</th>
                    <th>{t.adminProductStock ?? 'Stock'}</th>
                    <th>{t.adminOrderActions ?? 'Actions'}</th>
                  </tr>
                </thead>
                  {products.map(p => {
                    const catName = categories.find(c => c.category_id === p.category_id)?.category_name ?? `#${p.category_id}`
                    return (
                      <tbody key={p.product_id}>
                      <tr className={p.stock_quantity < 10 ? 'row-low-stock' : ''}>
                        <td>#{p.product_id}</td>
                        <td className="product-cell">
                          {p.image_url && <img className="admin-product-thumb" src={p.image_url} alt="" />}
                          <div><strong>{p.product_name}</strong>{p.description && <small>{p.description}</small>}</div>
                        </td>
                        <td>{catName}</td>
                        <td className="admin-sizes">
                          {p.variants.length > 0
                            ? p.variants.map(v => <span className="admin-size-chip" key={v.variant_id}>{v.name}{Number(v.price_delta) !== 0 && <small>{Number(v.price_delta) > 0 ? '+' : '−'}¥{Math.abs(Number(v.price_delta)).toFixed(2)}</small>}</span>)
                            : <small className="admin-no-sizes">{t.adminNoSizes ?? 'None'}</small>}
                          <button className="button button-ghost button-mini" onClick={() => setEditingProduct(editingProduct?.product_id === p.product_id ? null : p)}>{t.adminEdit ?? 'Edit'}</button>
                        </td>
                        <td className="num"><strong>¥{Number(p.price).toFixed(2)}</strong></td>
                        <td className="num">
                          <span className={p.stock_quantity === 0 ? 'badge-out' : p.stock_quantity < 10 ? 'badge-low' : 'badge-ok'}>{p.stock_quantity}</span>
                        </td>
                        <td>
                          <button className="button button-ghost button-mini" onClick={() => setEditingProduct(editingProduct?.product_id === p.product_id ? null : p)}><Settings size={14} />{t.adminEditProduct ?? 'Edit'}</button>
                          <button className="button button-ghost button-mini" disabled={productBusy === p.product_id} onClick={() => handleAdjustStock(p.product_id, -1)}><Minus size={14} /></button>
                          <button className="button button-ghost button-mini" disabled={productBusy === p.product_id} onClick={() => handleAdjustStock(p.product_id, 1)}><Plus size={14} /></button>
                          <button className="button button-danger button-mini" disabled={productBusy === p.product_id} onClick={() => handleDeleteProduct(p.product_id)}>
                            {productBusy === p.product_id ? <LoaderCircle className="spin" /> : <Trash2 size={14} />}
                          </button>
                        </td>
                      </tr>
                      {editingProduct?.product_id === p.product_id && (
                        <tr className="admin-editor-row"><td colSpan={7}>
                          <ProductEditor product={p} categories={categories} t={t} onClose={() => setEditingProduct(null)} onSaved={refreshProducts} />
                        </td></tr>
                      )}
                      </tbody>
                    )
                  })}
              </table>
            </div>
          </section>
        ) : tab === 'customers' ? (
          <UsersTab t={t} canManage />
        ) : tab === 'settings' ? (
          <SettingsTab t={t} />
        ) : tab === 'logs' ? (
          <LogsTab t={t} />
        ) : tab === 'coupons' ? (
          <CouponsTab t={t} />
        ) : (
          <MarketPage t={t} />
        )}
      </div>
    </div>
  )
}

function ProductEditor({ product, categories, t, onClose, onSaved }: {
  product: Product; categories: Category[]; t: any; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    product_name: product.product_name,
    description: product.description ?? '',
    price: product.price,
    stock_quantity: String(product.stock_quantity),
    category_id: String(product.category_id),
    image_url: product.image_url ?? ''
  })
  const [variants, setVariants] = useState<ProductVariant[]>(product.variants ?? [])
  const [draft, setDraft] = useState({ name: '', group_name: 'Size', price_delta: '0.00', stock_quantity: '' })
  const [saving, setSaving] = useState(false)
  const [processingImage, setProcessingImage] = useState(false)
  const [error, setError] = useState('')

  const handleImage = async (event: FormEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setProcessingImage(true)
    try {
      const dataUrl = await readImageAsDataUrl(file)
      setForm(current => ({ ...current, image_url: dataUrl }))
    } catch (err) {
      setError(err instanceof Error ? err.message : t.apiOffline)
    } finally { setProcessingImage(false) }
  }

  const saveProduct = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true); setError('')
    try {
      await api.updateProduct(product.product_id, {
        product_name: form.product_name,
        description: form.description || null,
        price: form.price,
        stock_quantity: Number(form.stock_quantity) || 0,
        image_url: form.image_url || null,
        category_id: Number(form.category_id)
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.apiOffline)
    } finally { setSaving(false) }
  }

  const patchVariant = (variantId: number, patch: Partial<ProductVariant>) =>
    setVariants(current => current.map(v => v.variant_id === variantId ? { ...v, ...patch } : v))

  const addVariant = async () => {
    if (!draft.name.trim()) return
    setSaving(true); setError('')
    try {
      const created = await api.createVariant(product.product_id, {
        name: draft.name.trim(),
        group_name: draft.group_name,
        price_delta: draft.price_delta || '0.00',
        stock_quantity: draft.stock_quantity === '' ? null : Number(draft.stock_quantity),
        sort_order: variants.length
      })
      setVariants(current => [...current, created])
      setDraft({ name: '', group_name: draft.group_name, price_delta: '0.00', stock_quantity: '' })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.apiOffline)
    } finally { setSaving(false) }
  }

  const saveVariant = async (variant: ProductVariant) => {
    setSaving(true); setError('')
    try {
      const updated = await api.updateVariant(product.product_id, variant.variant_id, {
        name: variant.name,
        group_name: variant.group_name,
        price_delta: variant.price_delta,
        stock_quantity: variant.stock_quantity,
        sort_order: variant.sort_order
      })
      setVariants(current => current.map(v => v.variant_id === updated.variant_id ? updated : v))
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.apiOffline)
    } finally { setSaving(false) }
  }

  const removeVariant = async (variantId: number) => {
    if (!window.confirm(t.adminDeleteVariantConfirm ?? 'Delete this option?')) return
    setSaving(true); setError('')
    try {
      await api.deleteVariant(product.product_id, variantId)
      setVariants(current => current.filter(v => v.variant_id !== variantId))
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.apiOffline)
    } finally { setSaving(false) }
  }

  return <div className="product-editor">
    <form className="admin-form product-editor-form" onSubmit={saveProduct}>
      <div className="product-editor-head">
        <h3>{t.adminEditProduct ?? 'Edit'} · {product.product_name}</h3>
        <button type="button" className="text-button" onClick={onClose}><X size={14} />{t.adminCancel ?? 'Cancel'}</button>
      </div>
      <div className="admin-form-row">
        <input value={form.product_name} onChange={e => setForm({ ...form, product_name: e.target.value })} placeholder={t.adminProductName ?? 'Name'} required />
        <input type="number" step="0.01" min="0" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder={t.adminProductPrice ?? 'Price'} required />
        <input type="number" min="0" value={form.stock_quantity} onChange={e => setForm({ ...form, stock_quantity: e.target.value })} placeholder={t.adminProductStock ?? 'Stock'} />
        <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} required>
          {categories.map(c => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
        </select>
      </div>
      <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder={t.adminProductDesc ?? 'Description'} />
      <div className="product-editor-image">
        <img src={form.image_url || fallbackArt} alt="" />
        <div className="admin-image-actions">
          <label className="text-button"><ImagePlus size={14} />{t.adminChangeImage}<input type="file" accept="image/*" hidden onChange={handleImage} disabled={processingImage} /></label>
          {form.image_url && <button type="button" className="text-button danger" onClick={() => setForm({ ...form, image_url: '' })}><Trash2 size={14} />{t.adminRemoveImage}</button>}
          {processingImage && <span className="admin-image-hint">{t.adminImageProcessing}</span>}
        </div>
      </div>
      {error && <div className="inline-error">{error}</div>}
      <button className="button button-dark" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <><Check size={16} />{t.adminSaveProduct ?? 'Save changes'}</>}</button>
    </form>

    <div className="admin-form variant-editor">
      <h3>{t.adminVariants ?? 'Sizes / options'}</h3>
      <small className="admin-image-hint">{t.adminVariantHint ?? 'Leave stock blank to share the product stock. Price adjust is added to the base price.'}</small>
      {variants.map(variant => <div className="variant-editor-row" key={variant.variant_id}>
        <select value={variant.group_name} onChange={e => patchVariant(variant.variant_id, { group_name: e.target.value })} aria-label={t.adminVariantGroup ?? 'Group'}>
          <option value="Size">{t.size}</option>
          <option value="Temperature">{t.temperature}</option>
        </select>
        <input value={variant.name} onChange={e => patchVariant(variant.variant_id, { name: e.target.value })} placeholder={t.adminVariantName ?? 'Option'} />
        <input type="number" step="0.01" value={variant.price_delta} onChange={e => patchVariant(variant.variant_id, { price_delta: e.target.value })} placeholder={t.adminVariantDelta ?? 'Price ±'} />
        <input type="number" min="0" value={variant.stock_quantity ?? ''} onChange={e => patchVariant(variant.variant_id, { stock_quantity: e.target.value === '' ? null : Number(e.target.value) })} placeholder={t.adminVariantInherit ?? 'Shared stock'} />
        <button type="button" className="button button-ghost button-mini" disabled={saving} onClick={() => saveVariant(variant)}><Check size={14} /></button>
        <button type="button" className="button button-danger button-mini" disabled={saving} onClick={() => removeVariant(variant.variant_id)}><Trash2 size={14} /></button>
      </div>)}
      <div className="variant-editor-row is-new">
        <select value={draft.group_name} onChange={e => setDraft({ ...draft, group_name: e.target.value })} aria-label={t.adminVariantGroup ?? 'Group'}>
          <option value="Size">{t.size}</option>
          <option value="Temperature">{t.temperature}</option>
        </select>
        <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder={t.adminVariantName ?? 'Option'} />
        <input type="number" step="0.01" value={draft.price_delta} onChange={e => setDraft({ ...draft, price_delta: e.target.value })} placeholder={t.adminVariantDelta ?? 'Price ±'} />
        <input type="number" min="0" value={draft.stock_quantity} onChange={e => setDraft({ ...draft, stock_quantity: e.target.value })} placeholder={t.adminVariantInherit ?? 'Shared stock'} />
        <button type="button" className="button button-dark button-mini" disabled={saving || !draft.name.trim()} onClick={addVariant}><Plus size={14} />{t.adminAddVariant ?? 'Add option'}</button>
      </div>
    </div>
  </div>
}

type PayMethod = 'cash' | 'wechat' | 'alipay'
type PayState = 'selecting' | 'paying' | 'success' | 'failed'

type BackendPayMethod = 'cash' | 'wechat' | 'alipay' | 'balance'

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
          <div className="payment-amount"><span>{t.payAmount}</span><strong>¥{amount.toFixed(2)}</strong></div>
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
            <strong>¥{amount.toFixed(2)}</strong>
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
            <div className="payment-page-row"><span>{t.paymentPageAmount}</span><strong>¥{amount.toFixed(2)}</strong></div>
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

function MarketPage({ t }: { t: any }) {
  const [overview, setOverview] = useState<MarketOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const [metric, setMetric] = useState<'revenue' | 'units' | 'orders'>('revenue')
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [range, setRange] = useState<string>('7d')

  const RANGE_LABELS: Record<string, string> = {
    '1d': t.marketRange1d, '7d': t.marketRange7d, '30d': t.marketRange30d,
    '90d': t.marketRange90d, '365d': t.marketRange365d, 'all': t.marketRangeAll,
  }
  const RANGE_KEYS = ['1d', '7d', '30d', '90d', '365d', 'all']

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true) } else { setRefreshing(true) }
    setError('')
    try {
      const data = await api.marketOverview(range)
      setOverview(data)
      setRefreshedAt(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : t.apiOffline)
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [t.apiOffline, range])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const id = window.setInterval(() => { void load(true) }, 8000)
    return () => window.clearInterval(id)
  }, [load])

  const fmtMoney = (n: string | number) => `¥${Number(n).toFixed(2)}`
  const fmtDate = (s: string | null) => {
    if (!s) return t.marketNever
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return t.marketNever
    return d.toLocaleString()
  }

  if (loading && !overview) return <div className="settle-empty-mini"><LoaderCircle className="spin" /></div>

  return (
    <div className="market-tab-content">
      {refreshedAt && (
        <div className="market-refreshed">
          <span className={`market-refreshed-dot ${refreshing ? 'pulse' : ''}`} />
          {refreshing ? t.marketRefreshing : `${t.marketRefreshed} ${refreshedAt.toLocaleTimeString()}`}
        </div>
      )}

      {error && !overview ? (
        <ErrorBlock text={error} retry={() => load()} t={t} />
      ) : overview ? (
        <>
          <div className="admin-stats">
            <div className="admin-stat"><strong>{fmtMoney(overview.total_revenue)}</strong><span>{t.marketRevenue}</span></div>
            <div className="admin-stat"><strong>{overview.total_units}</strong><span>{t.marketUnits}</span></div>
            <div className="admin-stat"><strong>{overview.paid_orders}</strong><span>{t.marketOrders}</span></div>
            <div className="admin-stat"><strong>{overview.product_count}</strong><span>{t.marketProducts}</span></div>
          </div>

          <section className="admin-section market-chart-card">
            <div className="market-chart-head">
              <h3 className="market-card-title">{t.marketTimeseries}</h3>
              <div className="market-chart-controls">
                <div className="market-range-toggle">
                  {RANGE_KEYS.map(k => (
                    <button key={k} className={range === k ? 'active' : ''} onClick={() => setRange(k)}>
                      {RANGE_LABELS[k]}
                    </button>
                  ))}
                </div>
                <div className="market-metric-toggle">
                  {(['revenue', 'units', 'orders'] as const).map(m => (
                    <button key={m} className={metric === m ? 'active' : ''} onClick={() => setMetric(m)}>
                      {m === 'revenue' ? t.marketRevenue : m === 'units' ? t.marketUnits : t.marketOrders}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="market-chart-range-label">{RANGE_LABELS[range]}</div>
            <OverviewChart points={overview.timeseries} metric={metric} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} t={t} fmtMoney={fmtMoney} />
          </section>

          {overview.products.length === 0 ? (
            <div className="empty-state compact">
              <Coffee />
              <h2>{t.marketEmpty}</h2>
              <p>{t.marketEmptySub}</p>
            </div>
          ) : (
            <section className="admin-section">
              <div className="admin-table-wrap">
                <table className="admin-table market-table">
                  <thead>
                    <tr>
                      <th>{t.marketProductCol}</th>
                      <th>{t.marketCategoryCol}</th>
                      <th className="num">{t.marketPrice}</th>
                      <th className="num">{t.marketStock}</th>
                      <th className="num">{t.marketUnitsCol}</th>
                      <th className="num">{t.marketRevenueCol}</th>
                      <th className="num">{t.marketOrdersCol}</th>
                      <th>{t.marketLastSold}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.products.map(p => (
                      <tr key={p.product_id} className={p.stock_quantity < 10 ? 'row-low-stock' : ''}>
                        <td>
                          <div className="market-product-cell">
                            {p.image_url ? <img src={p.image_url} alt="" /> : <span className="market-thumb-fallback"><Coffee size={14} /></span>}
                            <strong>{p.product_name}</strong>
                          </div>
                        </td>
                        <td>{p.category_name ?? '—'}</td>
                        <td className="num">{fmtMoney(p.price)}</td>
                        <td className="num">{p.stock_quantity}</td>
                        <td className="num">{p.units_sold}</td>
                        <td className="num">{fmtMoney(p.revenue)}</td>
                        <td className="num">{p.order_count}</td>
                        <td><small>{fmtDate(p.last_sold_at)}</small></td>
                        <td><Link className="button button-ghost button-mini" to={`/market/${p.product_id}`}>{t.marketViewDetail}<ArrowRight size={12} /></Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      ) : null}
    </div>
  )
}

function ProductMarketPage({ t, productId }: { t: any; productId: number }) {
  const [detail, setDetail] = useState<ProductMarketDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const navigate = useNavigate()
  const [adminAuthed, setAdminAuthed] = useState(false)
  const [adminChecking, setAdminChecking] = useState(true)

  // Gate the standalone /market/:id route behind admin auth so market data
  // is never exposed to ordinary storefront visitors.
  useEffect(() => {
    api.adminStatus()
      .then(s => { setAdminAuthed(s.authenticated); setAdminChecking(false) })
      .catch(() => { setAdminAuthed(false); setAdminChecking(false) })
  }, [])

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true) } else { setRefreshing(true) }
    setError('')
    try {
      const data = await api.productMarketDetail(productId)
      setDetail(data)
      setRefreshedAt(new Date())
    } catch (err: any) {
      if (/404|not found/i.test(err.message || '')) {
        setError(t.marketProductMissing)
      } else {
        setError(err?.message || t.apiOffline)
      }
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [productId, t.apiOffline, t.marketProductMissing])

  useEffect(() => { if (adminAuthed) void load() }, [load, adminAuthed])
  useEffect(() => {
    if (!adminAuthed) return
    const id = window.setInterval(() => { void load(true) }, 5000)
    return () => window.clearInterval(id)
  }, [load, adminAuthed])

  const fmtMoney = (n: string | number) => `¥${Number(n).toFixed(2)}`
  const fmtDateTime = (s: string | null) => {
    if (!s) return t.marketNever
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return t.marketNever
    return d.toLocaleString()
  }

  const chart = detail ? buildTimeseriesChart(detail.timeseries) : null
  const avgPerOrder = detail && detail.order_count > 0 ? detail.units_sold / detail.order_count : 0

  if (adminChecking) return <div className="page-section"><div className="container"><LoadingBlock text={t.brewing} /></div></div>
  if (!adminAuthed) return (
    <div className="page-section">
      <div className="container" style={{ maxWidth: 420 }}>
        <div className="page-title">
          <span className="eyebrow"><LockKeyhole size={13} /> {t.admin}</span>
          <h1>{t.marketDetailTitle}</h1>
          <p>{t.loginRequired}</p>
        </div>
        <button className="button button-dark" onClick={() => navigate('/admin')}>{t.admin}</button>
      </div>
    </div>
  )
  if (loading && !detail) return <div className="page-section"><div className="container"><LoadingBlock text={t.brewing} /></div></div>

  return (
    <div className="page-section market-page">
      <div className="container">
        <div className="page-title">
          <span className="eyebrow"><TrendingUp size={13} /> {t.marketNav}</span>
          <h1>{detail?.product_name ?? t.marketDetailTitle}</h1>
          <p>{t.marketDetailSubtitle}</p>
          <button type="button" className="button button-ghost button-mini" style={{ marginTop: 8 }} onClick={() => navigate('/admin')}>
            <ArrowLeft size={12} /> {t.marketBack}
          </button>
          {refreshedAt && (
            <div className="market-refreshed">
              <span className={`market-refreshed-dot ${refreshing ? 'pulse' : ''}`} />
              {refreshing ? t.marketRefreshing : `${t.marketRefreshed} ${refreshedAt.toLocaleTimeString()}`}
            </div>
          )}
        </div>

        {error && !detail ? (
          <ErrorBlock text={error} retry={() => load()} t={t} />
        ) : detail ? (
          <>
            <div className="admin-stats">
              <div className="admin-stat"><strong>{fmtMoney(detail.revenue)}</strong><span>{t.marketRevenue}</span></div>
              <div className="admin-stat"><strong>{detail.units_sold}</strong><span>{t.marketUnitsSold}</span></div>
              <div className="admin-stat"><strong>{detail.order_count}</strong><span>{t.marketOrders}</span></div>
              <div className="admin-stat"><strong>{avgPerOrder.toFixed(1)}</strong><span>{t.marketPerOrder}</span></div>
            </div>

            <div className="market-detail-grid">
              <section className="admin-section market-chart-card">
                <h3 className="market-card-title">{t.marketTimeseries}</h3>
                {chart ? (
                  <svg className="market-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} preserveAspectRatio="none">
                    {chart.bars.map((b, i) => (
                      <rect key={`b-${i}`} x={b.x} y={b.y} width={b.w} height={b.h} fill="var(--gold)" rx="1" />
                    ))}
                    {chart.bars.map((b, i) => (
                      <text key={`l-${i}`} x={b.x + b.w / 2} y={chart.height - 4} textAnchor="middle" className="market-chart-label">{b.label}</text>
                    ))}
                  </svg>
                ) : (
                  <p className="market-chart-empty">{t.marketNoRecent}</p>
                )}
              </section>

              <section className="admin-section market-info-card">
                <h3 className="market-card-title">{t.marketProductCol}</h3>
                <dl className="market-info-list">
                  <div><dt>{t.marketPrice}</dt><dd>{fmtMoney(detail.price)}</dd></div>
                  <div><dt>{t.marketStock}</dt><dd>{detail.stock_quantity}</dd></div>
                  <div><dt>{t.marketCategoryCol}</dt><dd>{detail.category_name ?? '—'}</dd></div>
                  <div><dt>{t.marketLastSold}</dt><dd>{fmtDateTime(detail.last_sold_at)}</dd></div>
                </dl>
              </section>
            </div>

            <section className="admin-section" style={{ marginTop: 24 }}>
              <h3 className="market-card-title">{t.marketRecentSales}</h3>
              {detail.recent_sales.length === 0 ? (
                <p className="market-chart-empty">{t.marketNoRecent}</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>{t.marketDateCol}</th>
                        <th className="num">#{t.marketOrdersCol}</th>
                        <th>{t.marketCustomerCol}</th>
                        <th className="num">{t.marketQtyCol}</th>
                        <th className="num">{t.marketSubtotalCol}</th>
                        <th>{t.marketStatusCol}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.recent_sales.map(s => (
                        <tr key={s.order_id}>
                          <td><small>{new Date(s.order_date).toLocaleString()}</small></td>
                          <td className="num">{s.order_id}</td>
                          <td>{s.customer_name ?? '—'}</td>
                          <td className="num">{s.quantity}</td>
                          <td className="num">{fmtMoney(s.subtotal)}</td>
                          <td><StatusPill status={s.payment_status} t={t} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}

function OverviewChart({ points, metric, hoverIdx, setHoverIdx, t, fmtMoney }: {
  points: OverviewTimeseriesPoint[]
  metric: 'revenue' | 'units' | 'orders'
  hoverIdx: number | null
  setHoverIdx: (i: number | null) => void
  t: any
  fmtMoney: (n: string | number) => string
}) {
  if (points.length === 0) return <p className="market-chart-empty">{t.marketNoRecent}</p>

  const width = 720
  const height = 230
  const padL = 46
  const padR = 16
  const padT = 14
  const padB = 30
  const innerW = width - padL - padR
  const innerH = height - padT - padB

  const val = (p: OverviewTimeseriesPoint) => metric === 'revenue' ? Number(p.revenue) : metric === 'units' ? p.units : p.orders
  const rawMax = Math.max(1, ...points.map(val))
  const niceMax = niceCeil(rawMax)
  const slot = innerW / points.length
  const xAt = (i: number) => padL + i * slot + slot / 2
  const yAt = (v: number) => padT + innerH - (v / niceMax) * innerH

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(2)} ${yAt(val(p)).toFixed(2)}`).join(' ')
  const areaPath = `${linePath} L ${xAt(points.length - 1).toFixed(2)} ${padT + innerH} L ${xAt(0).toFixed(2)} ${padT + innerH} Z`

  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => ({ y: padT + innerH - f * innerH, v: niceMax * f }))
  const labelStep = Math.max(1, Math.floor(points.length / 6))
  const hovered = hoverIdx !== null ? points[hoverIdx] : null
  const hv = hovered ? val(hovered) : 0
  const hx = hoverIdx !== null ? xAt(hoverIdx) : 0
  const hy = hovered ? yAt(hv) : 0
  const tipX = Math.min(Math.max(hx - 55, padL), width - padR - 110)
  const tipY = Math.max(hy - 46, padT)

  return (
    <svg className="market-chart market-overview-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" onMouseLeave={() => setHoverIdx(null)} role="img" aria-label={t.marketTimeseries}>
      <defs>
        <linearGradient id="market-area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b3864b" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#b3864b" stopOpacity="0.03" />
        </linearGradient>
      </defs>
      {ticks.map((tk, i) => (
        <g key={i}>
          <line x1={padL} y1={tk.y} x2={width - padR} y2={tk.y} stroke="rgba(31,45,37,.12)" strokeWidth="1" />
          <text x={padL - 8} y={tk.y + 3} textAnchor="end" className="market-chart-axis">{formatAxis(tk.v, metric)}</text>
        </g>
      ))}
      <path d={areaPath} fill="url(#market-area-grad)" />
      <path d={linePath} fill="none" stroke="#b3864b" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {hovered && hoverIdx !== null && (
        <g>
          <line x1={hx} y1={padT} x2={hx} y2={padT + innerH} stroke="#263d32" strokeWidth="1" strokeDasharray="3 3" />
          <circle cx={hx} cy={hy} r="4" fill="#263d32" stroke="#fbf9f4" strokeWidth="1.5" />
          <rect x={tipX} y={tipY} width="110" height="38" rx="4" fill="#263d32" />
          <text x={tipX + 55} y={tipY + 16} textAnchor="middle" className="market-chart-tooltip-val">
            {metric === 'revenue' ? fmtMoney(hovered.revenue) : metric === 'units' ? `${hovered.units} ${t.marketCups}` : hovered.orders}
          </text>
          <text x={tipX + 55} y={tipY + 30} textAnchor="middle" className="market-chart-tooltip-day">{hovered.day}</text>
        </g>
      )}
      {points.map((p, i) => (i % labelStep === 0 || i === points.length - 1 ? (
        <text key={i} x={xAt(i)} y={height - 8} textAnchor="middle" className="market-chart-label">{p.day.slice(5)}</text>
      ) : null))}
      {points.map((_p, i) => (
        <rect key={i} x={padL + i * slot} y={padT} width={slot} height={innerH} fill="transparent" onMouseEnter={() => setHoverIdx(i)} />
      ))}
    </svg>
  )
}

function niceCeil(n: number): number {
  if (n <= 0) return 1
  const pow = Math.pow(10, Math.floor(Math.log10(n)))
  const f = n / pow
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return nice * pow
}

function formatAxis(v: number, metric: string): string {
  if (metric === 'revenue') return v >= 1000 ? `¥${(v / 1000).toFixed(1)}k` : `¥${v.toFixed(0)}`
  return String(Math.round(v))
}

function buildTimeseriesChart(points: ProductTimeseriesPoint[]): { width: number; height: number; bars: { x: number; y: number; w: number; h: number; label: string }[] } | null {
  if (points.length === 0) return null
  const width = 600
  const height = 170
  const padX = 18
  const padTop = 12
  const labelH = 18
  const innerW = width - padX * 2
  const innerH = height - padTop - labelH
  const max = Math.max(1, ...points.map(p => p.units))
  const slot = innerW / points.length
  const barW = Math.max(2, slot * 0.62)
  const bars = points.map((p, i) => {
    const h = (p.units / max) * innerH
    return {
      x: padX + i * slot + (slot - barW) / 2,
      y: padTop + (innerH - h),
      w: barW,
      h,
      label: p.day.slice(5),
    }
  })
  return { width, height, bars }
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
// Cart lines are unique per product + size + temperature, so all three are in the key.
function lineKey(item: { product_id: number; variant_id?: number; temperature_variant_id?: number }) {
  return `${item.product_id}:${item.variant_id ?? 0}:${item.temperature_variant_id ?? 0}`
}
function variantPrice(product: Product, variant?: ProductVariant | null, temperature?: ProductVariant | null) {
  return Number(product.price)
    + (variant ? Number(variant.price_delta) : 0)
    + (temperature ? Number(temperature.price_delta) : 0)
}
function variantStock(product: Product, variant?: ProductVariant | null) {
  return variant?.stock_quantity ?? product.stock_quantity
}
function availableStock(product: Product, cart: CartItem[], variant?: ProductVariant | null) {
  const variantId = variant?.variant_id ?? null
  const reserved = cart
    .filter(item => item.product_id === product.product_id && (item.variant_id ?? null) === variantId)
    .reduce((sum, item) => sum + item.quantity, 0)
  return Math.max(0, variantStock(product, variant) - reserved)
}

function OptionTabs({ variants, selected, onSelect, label }: { variants: ProductVariant[]; selected: number | null; onSelect: (id: number) => void; label: string }) {
  if (!variants.length) return null
  return <div className="variant-picker">
    <span className="variant-label">{label}</span>
    <div className="filter-tabs size-tabs">
      {variants.map(variant => {
        const delta = Number(variant.price_delta)
        return <button
          type="button"
          key={variant.variant_id}
          className={selected === variant.variant_id ? 'active' : ''}
          onClick={() => onSelect(variant.variant_id)}
        >
          {variant.name}
          {delta !== 0 && <small>{delta > 0 ? '+' : '−'}¥{Math.abs(delta).toFixed(2)}</small>}
        </button>
      })}
    </div>
  </div>
}

function HomeProductCard({ product, index, t, cart, locked, addToCart, categoryLabel }: {
  product: Product; index: number; t: any; cart: CartItem[]; locked: boolean
  addToCart: (product: Product, variant?: ProductVariant | null, temperature?: ProductVariant | null) => void; categoryLabel: string
}) {
  const sizeVariants = product.variants?.filter(v => v.group_name !== 'Temperature') ?? []
  const tempVariants = product.variants?.filter(v => v.group_name === 'Temperature') ?? []
  const [variantId, setVariantId] = useState<number | null>(sizeVariants[0]?.variant_id ?? null)
  const [temperatureId, setTemperatureId] = useState<number | null>(tempVariants[0]?.variant_id ?? null)
  const variant = sizeVariants.find(v => v.variant_id === variantId) ?? null
  const temperature = tempVariants.find(v => v.variant_id === temperatureId) ?? null
  const available = availableStock(product, cart, variant)
  const price = variantPrice(product, variant, temperature)

  return <article className="product-card" style={{ '--delay': `${index * 55}ms` } as React.CSSProperties}>
    <div className="product-image-wrap">
      <img src={product.image_url ?? productArt[product.product_name] ?? fallbackArt} alt={product.product_name} className="product-image" />
      <span className={available > 0 ? 'stock-pill' : 'stock-pill sold-out'}>{available > 0 ? `${available} ${t.left}` : t.soldOut}</span>
      <button className="heart-button" aria-label="Add to favorites"><Heart size={18} /></button>
    </div>
    <div className="product-info">
      <div><span className="product-kind">{categoryLabel}</span><h3>{product.product_name}</h3></div>
      <p>{product.description}</p>
      <OptionTabs variants={sizeVariants} selected={variantId} onSelect={setVariantId} label={t.size} />
      <OptionTabs variants={tempVariants} selected={temperatureId} onSelect={setTemperatureId} label={t.temperature} />
      <div className="product-bottom"><strong>¥{price.toFixed(2)}</strong><button disabled={available === 0 || locked} onClick={() => addToCart(product, variant, temperature)}>{available === 0 ? t.soldOut : <><Plus size={16} /> {t.add}</>}</button></div>
    </div>
  </article>
}

function CatalogCard({ item, index, t, cart, locked, addToCart, discountPercent, categoryLabel }: {
  item: Product; index: number; t: any; cart: CartItem[]; locked: boolean
  addToCart: (product: Product, variant?: ProductVariant | null, temperature?: ProductVariant | null) => void; discountPercent: number; categoryLabel: string
}) {
  const sizeVariants = item.variants?.filter(v => v.group_name !== 'Temperature') ?? []
  const tempVariants = item.variants?.filter(v => v.group_name === 'Temperature') ?? []
  const [variantId, setVariantId] = useState<number | null>(sizeVariants[0]?.variant_id ?? null)
  const [temperatureId, setTemperatureId] = useState<number | null>(tempVariants[0]?.variant_id ?? null)
  const variant = sizeVariants.find(v => v.variant_id === variantId) ?? null
  const temperature = tempVariants.find(v => v.variant_id === temperatureId) ?? null
  const available = availableStock(item, cart, variant)
  const reserved = cart
    .filter(line => line.product_id === item.product_id && (line.variant_id ?? null) === (variant?.variant_id ?? null))
    .reduce((sum, line) => sum + line.quantity, 0)
  const soldOut = available === 0
  const original = variantPrice(item, variant, temperature)
  const finalPrice = discountPercent > 0 ? discountedPrice(original, discountPercent) : original

  return <article className={soldOut ? 'catalog-card is-sold-out' : 'catalog-card'} style={{ '--delay': `${index * 45}ms` } as React.CSSProperties}>
    <div className="catalog-image"><img src={item.image_url ?? productArt[item.product_name] ?? fallbackArt} alt={item.product_name} />{soldOut && <div className="sold-out-overlay"><span>{t.soldOut}</span><small>{t.soldOutNote}</small></div>}<span className="catalog-category">{categoryLabel}</span></div>
    <div className="catalog-copy">
      <div className="catalog-title"><h2>{item.product_name}</h2><div className="catalog-price">{discountPercent > 0 && <span className="price-original" aria-label={t.couponOriginalPrice}>¥{original.toFixed(2)}</span>}<strong>¥{finalPrice.toFixed(2)}</strong></div></div>
      <p>{item.description}</p>
      <OptionTabs variants={sizeVariants} selected={variantId} onSelect={setVariantId} label={t.size} />
      <OptionTabs variants={tempVariants} selected={temperatureId} onSelect={setTemperatureId} label={t.temperature} />
      <div className="inventory-row"><div><span>{t.inventory}</span><strong className={soldOut ? 'inventory-zero' : ''}>{soldOut ? t.soldOut : `${available} ${t.available}`}</strong></div>{reserved > 0 && <div className="reserved-count"><ShoppingBag />{reserved} {t.inYourCart}</div>}</div>
      <button className="catalog-add" disabled={locked || soldOut} onClick={() => addToCart(item, variant, temperature)}>{soldOut ? t.soldOut : <><Plus />{t.add}<span>·</span>¥{finalPrice.toFixed(2)}</>}</button>
    </div>
  </article>
}

function CouponsTab({ t }: { t: any }) {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Coupon | null>(null)
  const [form, setForm] = useState({
    code: '', title: '', description: '', discount_percent: '',
    is_active: true, valid_from: '', valid_until: '', max_claims: '', sort_order: '0'
  })

  const refresh = () => {
    api.couponsAll().then(setCoupons).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(refresh, [])

  const openNew = () => {
    setEditing(null)
    setForm({ code: '', title: '', description: '', discount_percent: '', is_active: true, valid_from: '', valid_until: '', max_claims: '', sort_order: '0' })
  }
  const openEdit = (c: Coupon) => {
    setEditing(c)
    setForm({
      code: c.code, title: c.title, description: c.description ?? '',
      discount_percent: String(c.discount_percent), is_active: c.is_active,
      valid_from: c.valid_from ?? '', valid_until: c.valid_until ?? '',
      max_claims: c.max_claims !== null ? String(c.max_claims) : '',
      sort_order: String(c.sort_order)
    })
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const body = {
      code: form.code,
      title: form.title,
      description: form.description || null,
      discount_percent: Number(form.discount_percent),
      is_active: form.is_active,
      valid_from: form.valid_from || null,
      valid_until: form.valid_until || null,
      max_claims: form.max_claims ? Number(form.max_claims) : null,
      sort_order: Number(form.sort_order || 0)
    }
    try {
      if (editing) {
        await api.updateCoupon(editing.coupon_id, body)
      } else {
        await api.createCoupon(body)
      }
      setEditing(null)
      refresh()
    } catch (err: any) {
      console.error(err)
      alert(err?.message || 'Failed to save coupon')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (c: Coupon) => {
    if (!confirm(`Delete coupon "${c.title}"? This cannot be undone.`)) return
    try { await api.deleteCoupon(c.coupon_id); refresh() } catch {}
  }

  return <section className="admin-section">
    <div className="admin-toolbar">
      <h3 style={{ margin: 0 }}>Coupons</h3>
      <button className="button button-dark button-mini" onClick={openNew}>+ New coupon</button>
    </div>

    {editing !== null || (form.code === '' && form.title === '') ? null : null}
    {(editing !== null || form.code !== '' || form.title !== '') && (
      <form className="admin-form" onSubmit={submit} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
          <h4 style={{ margin: 0 }}>{editing ? `Edit · ${editing.title}` : 'New coupon'}</h4>
          <button type="button" className="text-button" onClick={() => { setEditing(null); openNew() }}>Cancel</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
          <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Code (e.g. SAVE10)" required />
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Title" required />
          <input type="number" step="0.01" min="0" max="100" value={form.discount_percent} onChange={e => setForm({ ...form, discount_percent: e.target.value })} placeholder="Discount %" required />
        </div>
        <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" style={{ marginBottom: 10 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
          <input type="date" value={form.valid_from} onChange={e => setForm({ ...form, valid_from: e.target.value })} />
          <input type="date" value={form.valid_until} onChange={e => setForm({ ...form, valid_until: e.target.value })} />
          <input type="number" min="0" value={form.max_claims} onChange={e => setForm({ ...form, max_claims: e.target.value })} placeholder="Max claims" />
          <input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })} placeholder="Sort order" />
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 12 }}>
          <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Active
        </label>
        <div>
          <button type="submit" className="button button-dark button-mini" disabled={saving}>{saving ? 'Saving…' : (editing ? 'Save changes' : 'Create coupon')}</button>
        </div>
      </form>
    )}

    {loading ? <div className="admin-empty"><LoaderCircle className="spin" /> Loading…</div> :
    coupons.length === 0 ? <div className="admin-empty">No coupons yet. Click "New coupon" to create one.</div> :
    <table className="admin-table">
      <thead>
        <tr>
          <th>Code</th><th>Title</th><th>Discount</th><th>Claimed</th><th>Valid</th><th>Status</th><th></th>
        </tr>
      </thead>
      <tbody>
        {coupons.map(c => (
          <tr key={c.coupon_id}>
            <td><strong>{c.code}</strong></td>
            <td>{c.title}{c.description && <small style={{ display: 'block', color: 'var(--coffee-3)' }}>{c.description}</small>}</td>
            <td><strong>{Number(c.discount_percent).toFixed(0)}%</strong></td>
            <td>{c.claimed_count}{c.max_claims !== null ? ` / ${c.max_claims}` : ''}</td>
            <td style={{ fontSize: 11, color: 'var(--coffee-3)' }}>
              {c.valid_from ?? '—'} → {c.valid_until ?? '∞'}
            </td>
            <td>{c.is_active ? <span className="badge-ok">Active</span> : <span className="badge-out">Inactive</span>}</td>
            <td>
              <button className="button button-ghost button-mini" onClick={() => openEdit(c)}>Edit</button>{' '}
              <button className="button button-danger button-mini" onClick={() => remove(c)}>Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>}
  </section>
}

export default App