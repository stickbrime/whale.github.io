import type { Language } from './types'

export const copy = {
  en: {
    order: 'Order', shop: 'Shop', cart: 'Cart', checkout: 'Checkout', account: 'Account', settings: 'Settings',
    greeting: 'Good morning', heroTitle: 'Start your day with\nsomething exceptional.',
    heroBody: 'Thoughtfully sourced. Expertly roasted. Made just for you.', orderNow: 'Order now',
    menu: 'Our menu', menuSub: 'Every cup, crafted with intention.', all: 'All', search: 'Search the menu',
    add: 'Add', soldOut: 'Sold out', items: 'items', yourCart: 'Your cart', cartSub: 'Good choices. Let’s make them yours.',
    emptyCart: 'Your cart is waiting', emptyCartSub: 'Browse the menu and add something you’ll love.', browse: 'Browse coffee',
    subtotal: 'Subtotal', service: 'Service', total: 'Total', continueCheckout: 'Continue to checkout',
    checkoutTitle: 'Checkout', checkoutSub: 'Almost yours. Choose how you’d like to settle up.',
    identity: 'Your details', existing: 'Returning customer', newCustomer: 'New customer',
    firstName: 'First name', lastName: 'Last name', email: 'Email', phone: 'Phone', pickup: 'Pickup time',
    payment: 'Payment', payNow: 'Pay now', payLater: 'Open a tab', payNowSub: 'Settle today at pickup.',
    payLaterSub: 'Choose when you’d like to settle your tab.', tabLength: 'Tab duration', days: 'days',
    placeOrder: 'Place order', placing: 'Placing your order…', orderReady: 'Order confirmed', orderReadySub: 'We’ll start preparing it right away.',
    goAccount: 'View activity', accountTitle: 'Your account', accountSub: 'Your coffee story, all in one place.',
    loyalty: 'Loyalty points', memberSince: 'Member since', activity: 'Recent activity', noActivity: 'No orders yet.',
    privacy: 'Privacy', privacySub: 'Choose how your information is used.', recommendations: 'Personalized recommendations',
    recommendationsSub: 'Use order history to make your menu more relevant.', marketing: 'Coffee notes & offers',
    marketingSub: 'Receive occasional news and seasonal releases.', profileVisibility: 'Public coffee profile',
    profileVisibilitySub: 'Let friends see your favorites and achievements.', save: 'Save changes', saved: 'Saved',
    settingsTitle: 'Settings', language: 'Language', languageSub: 'Choose the language used throughout Whale.',
    english: 'English', chinese: '简体中文', appearance: 'Appearance', systemTheme: 'Warm light',
    help: 'Help & support', apiOffline: 'We couldn’t reach the café. Please try again.', retry: 'Try again',
    coffee: 'Coffee', tea: 'Tea', bakery: 'Bakery', cartUpdated: 'Added to your cart', remove: 'Remove', each: 'each',
    orderNumber: 'Order', paid: 'Paid', pending: 'Tab open', failed: 'Failed', refunded: 'Refunded', cancelled: 'Cancelled',
    menuButton: 'Open settings', close: 'Close', currentOrder: 'Current order', editOrder: 'Edit order',
    quantity: 'Quantity', customization: 'Preferences', optional: 'Optional', useAccount: 'Use this account'
    ,collectionTime: 'Choose a convenient collection time.', noAccount: 'No account found. Choose “New customer”.',
    dueOn: 'Your tab will be due on', secureCheckout: 'Secure checkout · your details stay private',
    createAtCheckout: 'Create an account when you check out.', thoughtfulCoffee: 'Thoughtful coffee for considered moments.',
    responsibleTitle: 'Responsibly sourced', responsibleText: 'Traceable beans from trusted farms.',
    roastedTitle: 'Roasted in small batches', roastedText: 'For exceptional clarity and character.',
    readyTitle: 'Ready when you are', readyText: 'Order ahead and skip the wait.',
    noMatches: 'No matches', noMatchesSub: 'Try another search or collection.', left: 'left', brewing: 'Brewing…'
    ,clearCart: 'Clear cart', clearCartConfirm: 'Remove every item from your cart?', commodities: 'Shop all',
    commoditiesSub: 'Browse every item, sorted your way.', sortBy: 'Sort by', featured: 'Featured',
    priceLow: 'Price: low to high', priceHigh: 'Price: high to low', nameAZ: 'Name: A–Z',
    stockHigh: 'Availability', showing: 'Showing', loginSeiue: 'Continue with SEIUE', logout: 'Sign out',
    loginRequired: 'Sign in to see your personal account and activity.', loginNotConfigured: 'SEIUE login is awaiting administrator setup.',
    accountLocked: 'Account temporarily locked', accountLockedSub: 'An overdue tab must be settled before you can place another order.',
    overdueBalance: 'Overdue balance', settleNow: 'Settle now', settling: 'Settling…', due: 'Due',
    accessLocked: 'Ordering is paused until your overdue tab is settled.', maxTwoWeeks: 'Choose 1–14 days.'
    ,available: 'available', inYourCart: 'in your cart', catalogNote: 'Freshly roasted and ready for pickup.',
    soldOutNote: 'Back on the bar soon', viewCart: 'View cart', inventory: 'Inventory', shopAll: 'Shop all'
  },
  zh: {
    order: '点单', shop: '商品', cart: '购物车', checkout: '结账', account: '账户', settings: '设置',
    greeting: '早上好', heroTitle: '用一杯非凡咖啡，\n开启美好一天。', heroBody: '用心选豆，专业烘焙，为你制作。', orderNow: '立即点单',
    menu: '我们的菜单', menuSub: '每一杯，都用心制作。', all: '全部', search: '搜索菜单',
    add: '加入', soldOut: '已售罄', items: '件', yourCart: '你的购物车', cartSub: '选得不错。马上把它们带走吧。',
    emptyCart: '购物车还是空的', emptyCartSub: '逛逛菜单，挑选你喜欢的咖啡。', browse: '浏览咖啡',
    subtotal: '小计', service: '服务费', total: '合计', continueCheckout: '去结账',
    checkoutTitle: '结账', checkoutSub: '马上就好，请选择付款方式。', identity: '你的资料', existing: '已有账户', newCustomer: '新顾客',
    firstName: '名字', lastName: '姓氏', email: '邮箱', phone: '电话', pickup: '取餐时间',
    payment: '付款方式', payNow: '现在付款', payLater: '赊账', payNowSub: '取餐时结清本次订单。',
    payLaterSub: '选择多长时间后结清赊账。', tabLength: '赊账期限', days: '天', placeOrder: '提交订单', placing: '正在提交…',
    orderReady: '订单已确认', orderReadySub: '我们马上开始制作。', goAccount: '查看活动',
    accountTitle: '你的账户', accountSub: '你的咖啡故事，都在这里。', loyalty: '积分', memberSince: '加入时间',
    activity: '最近活动', noActivity: '还没有订单。', privacy: '隐私', privacySub: '选择我们如何使用你的信息。',
    recommendations: '个性化推荐', recommendationsSub: '根据订单记录推荐更合适的饮品。', marketing: '咖啡资讯与优惠',
    marketingSub: '接收新品和季节限定资讯。', profileVisibility: '公开咖啡档案', profileVisibilitySub: '让好友看到你的偏好和成就。',
    save: '保存更改', saved: '已保存', settingsTitle: '设置', language: '语言', languageSub: '选择 Whale 的显示语言。',
    english: 'English', chinese: '简体中文', appearance: '外观', systemTheme: '暖色浅色', help: '帮助与支持',
    apiOffline: '暂时无法连接咖啡店，请重试。', retry: '重试', coffee: '咖啡', tea: '茶饮', bakery: '烘焙',
    cartUpdated: '已加入购物车', remove: '移除', each: '每件', orderNumber: '订单', paid: '已付款', pending: '赊账中',
    failed: '失败', refunded: '已退款', cancelled: '已取消', menuButton: '打开设置', close: '关闭',
    currentOrder: '当前订单', editOrder: '修改订单', quantity: '数量', customization: '口味偏好', optional: '可选', useAccount: '使用此账户'
    ,collectionTime: '选择方便的取餐时间。', noAccount: '没有找到账户，请选择“新顾客”。', dueOn: '赊账到期日：',
    secureCheckout: '安全结账 · 你的资料将受到保护', createAtCheckout: '结账时即可创建账户。', thoughtfulCoffee: '为每个用心的时刻，献上一杯好咖啡。',
    responsibleTitle: '负责任采购', responsibleText: '咖啡豆来源可追溯，来自值得信赖的农场。', roastedTitle: '小批量烘焙',
    roastedText: '呈现清晰、独特的咖啡风味。', readyTitle: '随时为你准备', readyText: '提前点单，无需排队等候。',
    noMatches: '没有找到结果', noMatchesSub: '请尝试其他关键词或分类。', left: '剩余', brewing: '正在冲煮…'
    ,clearCart: '清空购物车', clearCartConfirm: '确定移除购物车中的全部商品吗？', commodities: '全部商品',
    commoditiesSub: '浏览所有商品，并按你的方式排序。', sortBy: '排序方式', featured: '推荐顺序',
    priceLow: '价格：从低到高', priceHigh: '价格：从高到低', nameAZ: '名称：A–Z', stockHigh: '库存优先',
    showing: '显示', loginSeiue: '使用 SEIUE 登录', logout: '退出登录', loginRequired: '登录后查看你的账户与活动记录。',
    loginNotConfigured: 'SEIUE 登录正在等待管理员配置。', accountLocked: '账户暂时锁定',
    accountLockedSub: '逾期赊账结清前，无法提交新订单。', overdueBalance: '逾期金额', settleNow: '立即结清',
    settling: '正在结清…', due: '到期', accessLocked: '结清逾期赊账后即可继续点单。', maxTwoWeeks: '请选择 1–14 天。'
    ,available: '可购买', inYourCart: '已在购物车', catalogNote: '新鲜烘焙，可到店取餐。',
    soldOutNote: '即将重新供应', viewCart: '查看购物车', inventory: '库存', shopAll: '查看全部'
  }
} as const

export type Copy = typeof copy.en