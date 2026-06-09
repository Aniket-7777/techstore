const state = {
  products: [],
  cart: JSON.parse(localStorage.getItem('nt_cart')) || [],
  token: localStorage.getItem('nt_token') || null,
  user: JSON.parse(localStorage.getItem('nt_user')) || null,
  activeView: 'view-shop',
  filters: { category: 'All', search: '', sortBy: 'default' }
};

async function apiRequest(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  
  try {
    const response = await fetch(endpoint, { ...options, headers });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Server error.');
    return data;
  } catch (error) {
    showToast(error.message, 'error');
    throw error;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupEventListeners();
  checkAuthStatus();
  updateCartBadge();
  loadProducts();
});

function switchView(viewId) {
  document.querySelectorAll('.app-view').forEach(view => view.classList.remove('active'));
  const targetView = document.getElementById(viewId);
  if (targetView) targetView.classList.add('active');
  
  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.getAttribute('data-target') === viewId) link.classList.add('active');
    else link.classList.remove('active');
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (viewId === 'view-shop') loadProducts();
  else if (viewId === 'view-orders') loadOrdersHistory();
  else if (viewId === 'view-checkout') renderCheckoutSummary();
}

function setupNavigation() {
  document.querySelectorAll('[data-target]').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(trigger.getAttribute('data-target'));
    });
  });
  document.getElementById('nav-logo').addEventListener('click', () => switchView('view-shop'));
  document.getElementById('hero-shop-btn').addEventListener('click', () => {
    document.querySelector('.shop-toolbar').scrollIntoView({ behavior: 'smooth' });
  });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  let icon = '<i class="fa-solid fa-circle-info" style="color:var(--primary)"></i>';
  if (type === 'success') icon = '<i class="fa-solid fa-circle-check" style="color:var(--success)"></i>';
  else if (type === 'error') icon = '<i class="fa-solid fa-triangle-exclamation" style="color:var(--danger)"></i>';
  
  toast.innerHTML = `${icon} <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-fadeout');
    toast.addEventListener('animationend', () => toast.remove());
  }, 4000);
}

function checkAuthStatus() {
  const authContainer = document.getElementById('auth-status-container');
  const navOrdersLink = document.getElementById('nav-orders-link');

  if (state.token && state.user) {
    authContainer.innerHTML = `
      <div class="profile-dropdown-wrapper">
        <button class="profile-dropdown-trigger glass" id="profile-dropdown-btn">
          <i class="fa-solid fa-user-astronaut"></i> ${state.user.username} <i class="fa-solid fa-chevron-down" style="font-size:0.65rem"></i>
        </button>
        <div class="profile-dropdown-menu glass hidden" id="profile-menu">
          <a href="#" class="dropdown-item" id="btn-goto-orders"><i class="fa-solid fa-box"></i> View Orders</a>
          <hr class="dropdown-divider">
          <a href="#" class="dropdown-item text-danger" id="btn-logout"><i class="fa-solid fa-power-off"></i> Logout</a>
        </div>
      </div>
    `;
    navOrdersLink.classList.remove('hidden');

    const profileBtn = document.getElementById('profile-dropdown-btn');
    const profileMenu = document.getElementById('profile-menu');
    profileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      profileMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', () => profileMenu.classList.add('hidden'));
    document.getElementById('btn-goto-orders').addEventListener('click', () => switchView('view-orders'));
    document.getElementById('btn-logout').addEventListener('click', () => logoutUser());
  } else {
    authContainer.innerHTML = `<button class="btn btn-primary btn-sm glass" id="btn-login-trigger">Login</button>`;
    navOrdersLink.classList.add('hidden');
    document.getElementById('btn-login-trigger').addEventListener('click', () => switchView('view-auth'));
  }
}

function logoutUser() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('nt_token');
  localStorage.removeItem('nt_user');
  checkAuthStatus();
  showToast('Logged out securely.', 'info');
  switchView('view-shop');
}

// Auth Tabs Toggle
document.getElementById('tab-login').addEventListener('click', () => {
  document.getElementById('tab-login').classList.add('active');
  document.getElementById('tab-register').classList.remove('active');
  document.getElementById('form-login').classList.add('active');
  document.getElementById('form-register').classList.remove('active');
});

document.getElementById('tab-register').addEventListener('click', () => {
  document.getElementById('tab-register').classList.add('active');
  document.getElementById('tab-login').classList.remove('active');
  document.getElementById('form-register').classList.add('active');
  document.getElementById('form-login').classList.remove('active');
});

// Auth form submissions
document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const data = await apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('nt_token', data.token);
    localStorage.setItem('nt_user', JSON.stringify(data.user));

    showToast('Secure credentials authenticated.', 'success');
    checkAuthStatus();
    if (state.cart.length > 0) switchView('view-checkout');
    else switchView('view-shop');
    document.getElementById('form-login').reset();
  } catch (err) {}
});

document.getElementById('form-register').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('register-username').value;
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;

  try {
    await apiRequest('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) });
    showToast('Profile created. Please log in.', 'success');
    document.getElementById('tab-login').click();
    document.getElementById('form-register').reset();
  } catch (err) {}
});

// Catalog loader
async function loadProducts() {
  const container = document.getElementById('product-list-container');
  try {
    let url = `/api/products?category=${state.filters.category}`;
    if (state.filters.search) url += `&search=${encodeURIComponent(state.filters.search)}`;
    const products = await apiRequest(url);
    state.products = products;
    sortProducts();
    renderProductsList();
  } catch (error) {
    container.innerHTML = `<div class="view-loader"><p>Telemetry sync failed.</p></div>`;
  }
}

function sortProducts() {
  if (state.filters.sortBy === 'price-low') state.products.sort((a,b)=>a.price-b.price);
  else if (state.filters.sortBy === 'price-high') state.products.sort((a,b)=>b.price-a.price);
  else if (state.filters.sortBy === 'rating') state.products.sort((a,b)=>b.rating-a.rating);
}

function renderProductsList() {
  const container = document.getElementById('product-list-container');
  if (state.products.length === 0) {
    container.innerHTML = `<div class="view-loader"><p>No neural systems match search query.</p></div>`;
    return;
  }

  container.innerHTML = state.products.map(p => `
    <div class="product-card glass">
      <div class="card-image-container"><img src="${p.image}" alt="${p.name}"><span class="card-category">${p.category}</span></div>
      <div class="card-body">
        <div class="card-rating"><i class="fa-solid fa-star"></i><span class="rating-val">${p.rating}</span></div>
        <h3 class="card-title">${p.name}</h3>
        <p class="card-desc">${p.description}</p>
        <div class="card-footer">
          <span class="card-price">$${p.price.toFixed(2)}</span>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="showProductDetails(${p.id})">Details</button>
            <button class="btn btn-primary btn-sm" onclick="handleAddToCartClick(event, ${p.id})">Add</button>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

function setupEventListeners() {
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.filters.category = chip.getAttribute('data-category');
      loadProducts();
    });
  });

  document.getElementById('sort-select').addEventListener('change', (e) => {
    state.filters.sortBy = e.target.value;
    sortProducts();
    renderProductsList();
  });

  let searchTimeout;
  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.filters.search = e.target.value;
      loadProducts();
    }, 400);
  });

  document.getElementById('btn-back-to-shop').addEventListener('click', () => switchView('view-shop'));
  document.getElementById('btn-back-to-shop-from-checkout').addEventListener('click', () => switchView('view-shop'));
  document.getElementById('form-checkout').addEventListener('submit', handleCheckoutSubmit);
}

// Details Page
async function showProductDetails(productId) {
  switchView('view-detail');
  const container = document.getElementById('product-detail-container');
  container.innerHTML = `<div class="view-loader"><div class="spinner"></div><p>Retrieving specs...</p></div>`;

  try {
    const product = await apiRequest(`/api/products/${productId}`);
    let stockHTML = product.stock > 10 ? `<span class="stock-status status-in">Optimal Sync (${product.stock} units)</span>` : product.stock > 0 ? `<span class="stock-status status-low">Restricted (${product.stock} units)</span>` : `<span class="stock-status status-out">Offline</span>`;

    container.innerHTML = `
      <div class="detail-img-container"><img src="${product.image}" alt="${product.name}"></div>
      <div class="detail-content">
        <span class="detail-category">${product.category}</span>
        <h2 class="detail-title">${product.name}</h2>
        <div class="detail-meta"><div class="detail-rating"><i class="fa-solid fa-star"></i> <span>${product.rating}</span></div><div>${stockHTML}</div></div>
        <div class="detail-price">$${product.price.toFixed(2)}</div>
        <p class="detail-desc">${product.description}</p>
        <div class="detail-actions-panel">
          <div class="quantity-selector">
            <button class="qty-btn" onclick="updateDetailQty(-1)"><i class="fa-solid fa-minus"></i></button>
            <input type="text" id="detail-qty-input" class="qty-input" value="1" readonly>
            <button class="qty-btn" onclick="updateDetailQty(1)"><i class="fa-solid fa-plus"></i></button>
          </div>
          <button class="btn btn-primary" style="flex:1" onclick="addProductToCart(${product.id}, parseInt(document.getElementById('detail-qty-input').value))" ${product.stock === 0 ? 'disabled' : ''}>Add Device to Cart</button>
        </div>
      </div>
    `;
  } catch (error) {}
}

function updateDetailQty(delta) {
  const input = document.getElementById('detail-qty-input');
  if (!input) return;
  let val = parseInt(input.value) + delta;
  if (val < 1) val = 1;
  input.value = val;
}

// Cart UI Panel controls
const cartPanel = document.getElementById('cart-panel');
const cartBackdrop = document.getElementById('cart-backdrop');
document.getElementById('cart-toggle-btn').addEventListener('click', toggleCartPanel);
document.getElementById('btn-close-cart').addEventListener('click', toggleCartPanel);
document.getElementById('cart-backdrop').addEventListener('click', toggleCartPanel);
document.getElementById('btn-cart-continue').addEventListener('click', toggleCartPanel);

function toggleCartPanel() {
  cartPanel.classList.toggle('active');
  cartBackdrop.classList.toggle('active');
  if (cartPanel.classList.contains('active')) renderCart();
}

function handleAddToCartClick(event, productId) {
  event.stopPropagation();
  addProductToCart(productId, 1);
}

function addProductToCart(productId, quantity) {
  const product = state.products.find(p => p.id === productId);
  if (!product) return;
  if (product.stock < quantity) {
    showToast(`Insufficient stock (${product.stock} available).`, 'error');
    return;
  }

  const cartItem = state.cart.find(item => item.productId === productId);
  if (cartItem) {
    if (cartItem.quantity + quantity > product.stock) {
      showToast(`Stock limit reached.`, 'error');
      return;
    }
    cartItem.quantity += quantity;
  } else {
    state.cart.push({ productId: product.id, name: product.name, price: product.price, image: product.image, quantity });
  }

  saveCart();
  updateCartBadge();
  showToast(`Added '${product.name}' to cart.`, 'success');
}

function updateCartItemQty(productId, delta) {
  const item = state.cart.find(i => i.productId === productId);
  if (!item) return;
  const product = state.products.find(p => p.id === productId);
  let newQty = item.quantity + delta;
  if (newQty < 1) newQty = 1;

  if (product && newQty > product.stock) {
    showToast(`Maximum stock limit reached.`, 'error');
    return;
  }

  item.quantity = newQty;
  saveCart();
  updateCartBadge();
  renderCart();
}

function removeCartItem(productId) {
  state.cart = state.cart.filter(item => item.productId !== productId);
  saveCart();
  updateCartBadge();
  renderCart();
  showToast('Item removed.', 'info');
}

function saveCart() { localStorage.setItem('nt_cart', JSON.stringify(state.cart)); }
function updateCartBadge() {
  document.getElementById('cart-badge-count').textContent = state.cart.reduce((sum, item) => sum + item.quantity, 0);
}

function renderCart() {
  const container = document.getElementById('cart-items-container');
  const totalPriceEl = document.getElementById('cart-total-price');

  if (state.cart.length === 0) {
    container.innerHTML = `<div class="cart-empty-message"><i class="fa-solid fa-cart-flatbed-suitcase"></i><p>Cart is empty.</p></div>`;
    totalPriceEl.textContent = '$0.00';
    return;
  }

  container.innerHTML = state.cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-img"><img src="${item.image}"></div>
      <div class="cart-item-info">
        <h4 class="cart-item-title">${item.name}</h4>
        <span class="cart-item-price">$${item.price.toFixed(2)}</span>
        <div class="cart-item-qty-control">
          <button onclick="updateCartItemQty(${item.productId}, -1)"><i class="fa-solid fa-minus"></i></button>
          <span>${item.quantity}</span>
          <button onclick="updateCartItemQty(${item.productId}, 1)"><i class="fa-solid fa-plus"></i></button>
        </div>
      </div>
      <button class="btn-remove-item" onclick="removeCartItem(${item.productId})"><i class="fa-solid fa-trash-can"></i></button>
    </div>
  `).join('');

  totalPriceEl.textContent = `$${state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2)}`;
}

document.getElementById('btn-cart-checkout').addEventListener('click', () => {
  if (state.cart.length === 0) return showToast('Cart is empty.', 'error');
  toggleCartPanel();
  if (!state.token) {
    showToast('Login required to checkout.', 'info');
    switchView('view-auth');
  } else {
    switchView('view-checkout');
  }
});

// Checkout Invoice Render
function renderCheckoutSummary() {
  const container = document.getElementById('checkout-items-list');
  const subtotalEl = document.getElementById('checkout-subtotal');
  const taxEl = document.getElementById('checkout-tax');
  const grandTotalEl = document.getElementById('checkout-grand-total');

  if (state.cart.length === 0) {
    container.innerHTML = `<p>No items.</p>`;
    return;
  }

  container.innerHTML = state.cart.map(item => `
    <div class="checkout-sum-item">
      <span class="checkout-sum-item-name">${item.name} <span class="text-success">x${item.quantity}</span></span>
      <span class="checkout-sum-item-val">$${(item.price * item.quantity).toFixed(2)}</span>
    </div>
  `).join('');

  const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const tax = subtotal * 0.08;
  subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
  taxEl.textContent = `$${tax.toFixed(2)}`;
  grandTotalEl.textContent = `$${(subtotal + tax).toFixed(2)}`;
}

async function handleCheckoutSubmit(e) {
  e.preventDefault();
  const address = document.getElementById('checkout-address').value;
  const placeBtn = document.getElementById('place-order-btn');

  if (state.cart.length === 0) return showToast('Cart is empty.', 'error');
  placeBtn.disabled = true;
  placeBtn.innerHTML = 'Processing... <i class="fa-solid fa-spinner fa-spin"></i>';

  try {
    const orderData = { items: state.cart.map(i => ({ productId: i.productId, quantity: i.quantity })), shippingAddress: address };
    const response = await apiRequest('/api/orders', { method: 'POST', body: JSON.stringify(orderData) });

    showToast(response.message, 'success');
    state.cart = [];
    saveCart();
    updateCartBadge();
    document.getElementById('form-checkout').reset();
    switchView('view-orders');
  } catch (error) {
  } finally {
    placeBtn.disabled = false;
    placeBtn.innerHTML = 'Complete Payment & Sync <i class="fa-solid fa-fingerprint"></i>';
  }
}

// Order History
async function loadOrdersHistory() {
  const container = document.getElementById('orders-list-container');
  container.innerHTML = `<div class="view-loader"><div class="spinner"></div><p>Synchronizing past logs...</p></div>`;

  try {
    const orders = await apiRequest('/api/orders');
    if (orders.length === 0) {
      container.innerHTML = `<div class="no-orders-msg"><i class="fa-solid fa-inbox"></i><p>No transactions logged.</p></div>`;
      return;
    }

    container.innerHTML = orders.map(order => {
      const dateStr = new Date(order.created_at).toLocaleString();
      return `
        <div class="order-card glass">
          <div class="order-card-header">
            <div class="order-id-date"><h3>Order ID: #${order.id}</h3><span>Logged: ${dateStr}</span></div>
            <div class="order-meta-info"><span class="stock-status status-in">${order.status}</span><span class="order-total-price">$${order.total_amount.toFixed(2)}</span></div>
          </div>
          <div class="order-card-body">
            ${order.items.map(item => `
              <div class="order-item-row">
                <div class="order-item-left"><span>${item.name}</span><span style="color:var(--text-muted)">x${item.quantity}</span></div>
                <span class="order-item-subtotal">$${item.total.toFixed(2)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    container.innerHTML = `<div class="view-loader"><p>Error retrieving order history.</p></div>`;
  }
}