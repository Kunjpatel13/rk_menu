(() => {
  const cfg = window.RESTAURANT_CONFIG;
  const $ = (id) => document.getElementById(id);
  const money = (n) => `${cfg.currencySymbol}${Number(n || 0).toFixed(0)}`;
  const escapeHtml = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const MAIN_CATEGORY_IMAGES = {
    'Kathiyawadi & Gujarati Food': 'img/Kathiyawadi & Gujarati Food.avif',
    'Indian Sabji & Curry': 'img/Indian Sabji & Curry.jfif',
    'Rice, Pulao & Biryani': 'img/Rice, Pulao & Biryani.avif',
    'Chinese Food': 'img/Chinese Food.jfif',
    'Starters': 'img/Starters.jpg',
    'Roti, Bhakhri & Paratha': 'img/Roti, Bhakhri & Paratha.jpeg',
    'Snacks, Fast Food & Quick Bites': 'img/Snacks, Fast Food & Quick Bites.webp',
    'Thali, Kadhi-Khichdi & Beverages': 'img/Fix Thali.jfif'
  };

  let menu = [], categories = [], settings = {}, cart = JSON.parse(localStorage.getItem('restaurant_cart') || '{}');
  let selectedMainCategory = null; // null = landing page view with main category cards
  let selectedSubCategory = 'all';

  const cartCanvas = bootstrap.Offcanvas.getOrCreateInstance($('cartCanvas'));
  const checkoutModal = bootstrap.Modal.getOrCreateInstance($('checkoutModal'));
  const storeClosedModal = $('storeClosedModal') ? bootstrap.Modal.getOrCreateInstance($('storeClosedModal')) : null;
  const toast = bootstrap.Toast.getOrCreateInstance($('siteToast'), { delay: 1600 });

  function notify(message) {
    const el = $('toastMessage');
    if (el) el.textContent = message;
    toast.show();
  }

  function saveCart() {
    localStorage.setItem('restaurant_cart', JSON.stringify(cart));
    renderCart();
    updateCardControls();
  }

  function cartRows() {
    return Object.values(cart).filter(x => x && x.quantity > 0);
  }

  function subtotal() {
    return cartRows().reduce((sum, x) => sum + Number(x.price) * x.quantity, 0);
  }

  function discountPercent() {
    return Math.max(0, Math.min(100, Number(settings.discount_percent || 0)));
  }

  function discountAmount() {
    const p = discountPercent();
    if (p <= 0) return 0;
    return Math.round((subtotal() * p) / 100);
  }

  function delivery() {
    return cartRows().length ? Number(settings.delivery_charge || 0) : 0;
  }

  function total() {
    return Math.max(0, subtotal() - discountAmount() + delivery());
  }

  function cartCount() {
    return cartRows().reduce((sum, x) => sum + x.quantity, 0);
  }

  function getMainCategories() {
    const mains = categories.filter(c => !c.parent_id);
    return mains.length ? mains : categories;
  }

  function getCategoryItemCount(catId) {
    return menu.filter(item => {
      if (item.category_id === catId) return true;
      const c = categories.find(cat => cat.id === item.category_id);
      return c && c.parent_id === catId;
    }).length;
  }

  // Renders the 8 Main Category Cards on Landing Page
  function renderMainCategoryCards() {
    const grid = $('categoryCardsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const mains = getMainCategories();
    mains.forEach(main => {
      const subs = categories.filter(c => c.parent_id === main.id);
      const subNames = subs.map(s => s.name).join(' · ');
      const count = getCategoryItemCount(main.id);
      const img = (main.image_url && main.image_url.trim()) ? main.image_url.trim() : (MAIN_CATEGORY_IMAGES[main.name] || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=700&q=80');

      const col = document.createElement('div');
      col.className = 'col-6 col-md-4 col-xl-3';
      col.innerHTML = `
        <article class="category-card" data-main="${main.id}">
          <div class="category-card-img-wrap">
            <img src="${escapeHtml(img)}" alt="${escapeHtml(main.name)}" loading="lazy">
            <span class="category-card-badge">${count} items</span>
          </div>
          <div class="category-card-body">
            <div>
              <h3 class="category-card-title">${escapeHtml(main.name)}</h3>
              <p class="category-card-subs">${escapeHtml(subNames || 'Freshly prepared dishes')}</p>
            </div>
            <div class="category-card-action">
              <span>Explore menu</span>
              <i class="bi bi-arrow-right"></i>
            </div>
          </div>
        </article>
      `;

      col.querySelector('.category-card').addEventListener('click', () => {
        selectCategory(main.id);
      });

      grid.appendChild(col);
    });
  }

  function selectCategory(mainId) {
    selectedMainCategory = mainId;
    selectedSubCategory = 'all';

    const mainCat = categories.find(c => c.id === mainId);
    const count = getCategoryItemCount(mainId);

    $('mainCategoriesView')?.classList.add('d-none');
    $('categoryItemsView')?.classList.remove('d-none');

    if ($('activeCategoryBadge')) $('activeCategoryBadge').textContent = mainCat ? mainCat.name : 'Category';
    if ($('activeCategoryItemCount')) $('activeCategoryItemCount').textContent = `${count} dish${count === 1 ? '' : 'es'}`;
    if ($('menuSectionSubtitle')) $('menuSectionSubtitle').textContent = `Showing dishes in ${mainCat ? mainCat.name : 'selected category'}.`;

    renderSubCategories();
    renderMenu();

    $('menu')?.scrollIntoView({ behavior: 'smooth' });
  }

  function backToCategories() {
    selectedMainCategory = null;
    selectedSubCategory = 'all';
    if ($('searchInput')) $('searchInput').value = '';

    $('mainCategoriesView')?.classList.remove('d-none');
    $('categoryItemsView')?.classList.add('d-none');

    if ($('menuSectionSubtitle')) $('menuSectionSubtitle').textContent = 'Select a category to view dishes.';
    renderMainCategoryCards();
    $('menu')?.scrollIntoView({ behavior: 'smooth' });
  }

  function renderSubCategories() {
    const subHolder = $('subCategoryFilters');
    if (!subHolder) return;

    if (!selectedMainCategory) {
      subHolder.classList.add('d-none');
      subHolder.innerHTML = '';
      return;
    }

    const subs = categories.filter(c => c.parent_id === selectedMainCategory);
    if (!subs.length) {
      subHolder.classList.add('d-none');
      subHolder.innerHTML = '';
      return;
    }

    const activeMain = categories.find(c => c.id === selectedMainCategory);
    const mainLabel = activeMain ? activeMain.name : 'Category';

    subHolder.classList.remove('d-none');
    subHolder.innerHTML = `<button class="sub-filter-chip ${selectedSubCategory === 'all' ? 'active' : ''}" data-sub="all">All ${escapeHtml(mainLabel)}</button>` +
      subs.map(s => {
        const count = menu.filter(m => m.category_id === s.id).length;
        return `<button class="sub-filter-chip ${selectedSubCategory === s.id ? 'active' : ''}" data-sub="${s.id}">${escapeHtml(s.name)} (${count})</button>`;
      }).join('');

    subHolder.querySelectorAll('[data-sub]').forEach(btn => btn.addEventListener('click', () => {
      selectedSubCategory = btn.dataset.sub;
      renderSubCategories();
      renderMenu();
    }));
  }

  function filteredMenu() {
    const q = ($('searchInput')?.value || '').trim().toLowerCase();
    return menu.filter(item => {
      let categoryOK = false;
      if (q) {
        if (selectedMainCategory) {
          const itemCat = categories.find(c => c.id === item.category_id);
          categoryOK = item.category_id === selectedMainCategory || (itemCat && itemCat.parent_id === selectedMainCategory);
        } else {
          categoryOK = true;
        }
      } else if (!selectedMainCategory) {
        categoryOK = false;
      } else {
        const itemCat = categories.find(c => c.id === item.category_id);
        if (selectedSubCategory !== 'all') {
          categoryOK = item.category_id === selectedSubCategory;
        } else {
          categoryOK = item.category_id === selectedMainCategory || (itemCat && itemCat.parent_id === selectedMainCategory);
        }
      }

      const isVeg = !item.food_type || item.food_type === 'Veg';
      const queryOK = !q || `${item.name} ${item.description || ''}`.toLowerCase().includes(q);
      return categoryOK && isVeg && queryOK && item.is_available;
    });
  }

  function getCardPortion(card) {
    if (!card) return 'Full';
    const activePill = card.querySelector('.portion-pill.active');
    return activePill ? activePill.dataset.portion : 'Full';
  }

  function getCardCartKey(itemId, portion) {
    const item = menu.find(m => m.id === itemId);
    if (!item) return itemId;
    const hasHalf = item.half_price && Number(item.half_price) > 0;
    return hasHalf ? `${item.id}_${portion || 'Full'}` : item.id;
  }

  function updateSingleCardControl(card) {
    if (!card) return;
    const itemId = card.dataset.id;
    const item = menu.find(m => m.id === itemId);
    if (!item) return;

    const hasHalf = item.half_price && Number(item.half_price) > 0;
    const activePortion = getCardPortion(card);
    const cartKey = hasHalf ? `${item.id}_${activePortion}` : item.id;
    const qty = cart[cartKey] ? cart[cartKey].quantity : 0;

    const addBtn = card.querySelector('.btn-add');
    const stepper = card.querySelector('.card-stepper');
    const countEl = card.querySelector('.stepper-count');

    if (addBtn && stepper) {
      if (qty > 0) {
        addBtn.classList.add('d-none');
        stepper.classList.remove('d-none');
        if (countEl) countEl.textContent = qty;
        stepper.dataset.portion = activePortion;
      } else {
        addBtn.classList.remove('d-none');
        stepper.classList.add('d-none');
        addBtn.dataset.portion = activePortion;
        if (countEl) countEl.textContent = '0';
        stepper.dataset.portion = activePortion;
      }
    }
  }

  function updateCardControls() {
    const grid = $('menuGrid');
    if (!grid) return;
    grid.querySelectorAll('.food-card').forEach(updateSingleCardControl);
  }

  function setupMenuGridEvents() {
    const grid = $('menuGrid');
    if (!grid || grid.dataset.eventsBound) return;
    grid.dataset.eventsBound = 'true';

    grid.addEventListener('click', (e) => {
      // 1. Portion pill click (toggle Full / Half)
      const pill = e.target.closest('.portion-pill');
      if (pill) {
        e.stopPropagation();
        const selector = pill.closest('.portion-selector');
        const card = pill.closest('.food-card');
        if (!selector || !card) return;

        selector.querySelectorAll('.portion-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');

        const portion = pill.dataset.portion;
        const price = pill.dataset.price;
        const itemId = card.dataset.id;

        const priceEl = document.getElementById(`price-${itemId}`);
        if (priceEl) priceEl.textContent = money(price);

        const addBtn = card.querySelector('.btn-add');
        if (addBtn) addBtn.dataset.portion = portion;

        const stepper = card.querySelector('.card-stepper');
        if (stepper) stepper.dataset.portion = portion;

        updateSingleCardControl(card);
        return;
      }

      // 2. Add to Cart button click
      const addBtn = e.target.closest('.btn-add');
      if (addBtn) {
        e.stopPropagation();
        const card = addBtn.closest('.food-card');
        if (!card) return;
        const itemId = card.dataset.id;
        const portion = getCardPortion(card);
        addToCart(itemId, portion);
        return;
      }

      // 3. Stepper Plus (+) click
      const plusBtn = e.target.closest('.stepper-plus');
      if (plusBtn) {
        e.stopPropagation();
        const card = plusBtn.closest('.food-card');
        if (!card) return;
        const itemId = card.dataset.id;
        const item = menu.find(m => m.id === itemId);
        if (!item) return;
        const hasHalf = item.half_price && Number(item.half_price) > 0;
        const portion = getCardPortion(card);
        const cartKey = hasHalf ? `${item.id}_${portion}` : item.id;

        if (cart[cartKey]) {
          changeQty(cartKey, 1);
        } else {
          addToCart(itemId, portion);
        }
        return;
      }

      // 4. Stepper Minus (-) click
      const minusBtn = e.target.closest('.stepper-minus');
      if (minusBtn) {
        e.stopPropagation();
        const card = minusBtn.closest('.food-card');
        if (!card) return;
        const itemId = card.dataset.id;
        const item = menu.find(m => m.id === itemId);
        if (!item) return;
        const hasHalf = item.half_price && Number(item.half_price) > 0;
        const portion = getCardPortion(card);
        const cartKey = hasHalf ? `${item.id}_${portion}` : item.id;

        if (cart[cartKey]) {
          changeQty(cartKey, -1);
        }
        return;
      }
    });
  }

  function renderMenu() {
    const items = filteredMenu(), grid = $('menuGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const emptyEl = $('menuEmpty');
    if (emptyEl) emptyEl.classList.toggle('d-none', items.length !== 0);

    items.forEach(item => {
      const col = document.createElement('div');
      col.className = 'col-12 col-md-6 col-xl-4';
      const image = item.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80';
      const hasHalf = item.half_price && Number(item.half_price) > 0;
      const initialPortion = 'Full';
      const initialKey = hasHalf ? `${item.id}_Full` : item.id;
      const initialQty = cart[initialKey] ? cart[initialKey].quantity : 0;

      col.innerHTML = `<article class="food-card" data-id="${item.id}">
        <div class="food-image-wrap"><img src="${escapeHtml(image)}" alt="${escapeHtml(item.name)}" loading="lazy">
          ${item.is_bestseller ? '<span class="food-badge">Bestseller</span>' : ''}
        </div>
        <div class="food-card-body">
          <div class="food-card-info">
            <h3 class="food-title">${escapeHtml(item.name)}</h3>
            <p class="food-desc">${escapeHtml(item.description || '')}</p>
          </div>
          <div class="food-card-action">
            <div class="d-flex align-items-center gap-1 flex-wrap">
              <strong class="food-price" id="price-${item.id}">${money(item.price)}</strong>
              ${hasHalf ? `<div class="portion-selector" id="portion-${item.id}">
                <button type="button" class="portion-pill active" data-portion="Full" data-price="${item.price}">Full</button>
                <button type="button" class="portion-pill" data-portion="Half" data-price="${item.half_price}">Half</button>
              </div>` : ''}
            </div>
            <div class="card-action-ctrl" id="action-ctrl-${item.id}">
              <button type="button" class="btn btn-add ${initialQty > 0 ? 'd-none' : ''}" data-add="${item.id}" data-portion="Full">+ Cart</button>
              <div class="card-stepper ${initialQty > 0 ? '' : 'd-none'}" data-item="${item.id}" data-portion="Full">
                <button type="button" class="stepper-btn stepper-minus" aria-label="Decrease quantity" title="Decrease">
                  <i class="bi bi-dash-lg"></i>
                </button>
                <span class="stepper-count" id="count-${item.id}">${initialQty}</span>
                <button type="button" class="stepper-btn stepper-plus" aria-label="Increase quantity" title="Increase">
                  <i class="bi bi-plus-lg"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </article>`;
      grid.appendChild(col);
    });

    setupMenuGridEvents();
  }

  function addToCart(id, portion = 'Full') {
    const item = menu.find(x => x.id === id);
    if (!item || !item.is_available) return notify('This item is currently unavailable.');

    const hasHalf = item.half_price && Number(item.half_price) > 0;
    const chosenPortion = hasHalf ? portion : '';
    const cartKey = hasHalf ? `${item.id}_${chosenPortion}` : item.id;
    const itemPrice = chosenPortion === 'Half' ? Number(item.half_price) : Number(item.price);
    const displayName = chosenPortion ? `${item.name} (${chosenPortion})` : item.name;

    const existing = cart[cartKey];
    cart[cartKey] = {
      id: item.id,
      cartKey: cartKey,
      name: displayName,
      baseName: item.name,
      portion: chosenPortion,
      price: itemPrice,
      image_url: item.image_url,
      quantity: existing ? existing.quantity + 1 : 1
    };

    saveCart();
    notify(`Added ${displayName} to cart`);
  }

  function changeQty(key, delta) {
    if (!cart[key]) return;
    cart[key].quantity += delta;
    if (cart[key].quantity <= 0) delete cart[key];
    saveCart();
  }

  function isStoreOpen() {
    const status = settings.store_status || 'auto';
    if (status === 'open') return { open: true };
    if (status === 'closed') {
      return {
        open: false,
        message: (settings.closed_message || '').trim() || 'Restaurant is currently closed for orders.'
      };
    }

    const openTime = (settings.open_time || '11:00').trim();
    const closeTime = (settings.close_time || '23:00').trim();

    const [oH, oM] = openTime.split(':').map(Number);
    const [cH, cM] = closeTime.split(':').map(Number);
    const openMinutes = (isNaN(oH) ? 11 : oH) * 60 + (isNaN(oM) ? 0 : oM);
    const closeMinutes = (isNaN(cH) ? 23 : cH) * 60 + (isNaN(cM) ? 0 : cM);

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let isOpen = false;
    if (closeMinutes > openMinutes) {
      isOpen = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
    } else {
      isOpen = currentMinutes >= openMinutes || currentMinutes < closeMinutes;
    }

    const formatTime12 = (tStr) => {
      if (!tStr) return '';
      const [h, m] = tStr.split(':').map(Number);
      const ampm = (h >= 12 && h < 24) ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      const mStr = String(m || 0).padStart(2, '0');
      return `${h12}:${mStr} ${ampm}`;
    };

    const hoursText = settings.opening_hours && settings.opening_hours.trim()
      ? settings.opening_hours.trim()
      : `${formatTime12(openTime)} – ${formatTime12(closeTime)}`;
    const defaultMsg = `Restaurant is closed now. We accept orders from ${hoursText}.`;
    const message = (settings.closed_message || '').trim() || defaultMsg;

    return { open: isOpen, message, openTime, closeTime, hoursText };
  }

  function updateLiveStatus() {
    const storeState = isStoreOpen();
    const navPill = $('navLivePill') || document.querySelector('.live-pill');
    const navText = $('navLiveText');
    const closedBanner = $('storeClosedBanner');
    const closedBannerText = $('storeClosedBannerText');
    const cartClosedNotice = $('cartClosedNotice');
    const cartClosedMsg = $('cartClosedMessage');
    const checkoutBtn = $('checkoutBtn');

    if (storeState.open) {
      if (navPill) {
        navPill.classList.remove('closed');
        navPill.title = 'Kitchen Open · Accepting WhatsApp orders';
      }
      if (navText) navText.textContent = 'LIVE';
      if (closedBanner) closedBanner.classList.add('d-none');
      if (cartClosedNotice) cartClosedNotice.classList.add('d-none');
      if (checkoutBtn && cartCount() > 0) {
        checkoutBtn.classList.remove('btn-secondary');
        checkoutBtn.classList.add('btn-brand');
        checkoutBtn.innerHTML = 'Continue to checkout <i class="bi bi-arrow-right ms-2"></i>';
      }
    } else {
      if (navPill) {
        navPill.classList.add('closed');
        navPill.title = storeState.message;
      }
      if (navText) navText.textContent = 'CLOSED';
      if (closedBanner) {
        closedBanner.classList.remove('d-none');
        if (closedBannerText) closedBannerText.textContent = storeState.message;
      }
      if (cartClosedNotice) {
        cartClosedNotice.classList.remove('d-none');
        if (cartClosedMsg) cartClosedMsg.textContent = storeState.message;
      }
      if (checkoutBtn) {
        checkoutBtn.classList.remove('btn-brand');
        checkoutBtn.classList.add('btn-secondary');
        checkoutBtn.innerHTML = '<i class="bi bi-door-closed me-2"></i>Restaurant is Closed';
      }
    }
  }

  function renderCart() {
    const rows = cartRows(), holder = $('cartItems');
    const count = cartCount();
    const sub = subtotal();
    const disc = discountAmount();
    const tot = total();

    const cb = $('cartCount');
    if (cb) {
      const prev = parseInt(cb.textContent || '0', 10);
      cb.textContent = count;
      if (count !== prev) {
        cb.classList.remove('cart-bump');
        void cb.offsetWidth;
        cb.classList.add('cart-bump');
      }
    }
    if ($('mobileCartItems')) $('mobileCartItems').textContent = `${count} item${count === 1 ? '' : 's'}`;
    if ($('mobileCartTotal')) $('mobileCartTotal').textContent = money(tot);

    const hasItems = count > 0;
    const mobileCartBar = $('mobileCartBar');
    if (mobileCartBar) mobileCartBar.classList.toggle('d-none', !hasItems);

    const tc = $('siteToastContainer') || document.querySelector('.toast-container');
    if (tc) tc.classList.toggle('above-cart-bar', hasItems);

    if ($('cartSubtotal')) $('cartSubtotal').textContent = money(sub);

    // Discount Row in Cart Panel
    const discRow = $('cartDiscountRow');
    if (discRow) {
      if (disc > 0) {
        discRow.classList.remove('d-none');
        if ($('cartDiscountLabel')) $('cartDiscountLabel').textContent = `Discount (${discountPercent()}%)`;
        if ($('cartDiscount')) $('cartDiscount').textContent = `-${money(disc)}`;
      } else {
        discRow.classList.add('d-none');
      }
    }

    // Discount Note in Cart Panel
    const discNote = $('cartDiscountNote');
    if (discNote) {
      const note = (settings.discount_note || '').trim();
      if (note) {
        discNote.classList.remove('d-none');
        discNote.innerHTML = `<i class="bi bi-info-circle me-1"></i>${escapeHtml(note)}`;
      } else {
        discNote.classList.add('d-none');
      }
    }

    if ($('cartDelivery')) $('cartDelivery').textContent = money(delivery());
    if ($('cartTotal')) $('cartTotal').textContent = money(tot);

    if (!holder) return;

    if (!rows.length) {
      holder.innerHTML = '<div class="cart-empty"><i class="bi bi-bag"></i><h5>Your cart is empty</h5><p>Add something delicious from the menu.</p></div>';
      if ($('checkoutBtn')) $('checkoutBtn').disabled = true;
      return;
    }

    if ($('checkoutBtn')) $('checkoutBtn').disabled = false;
    holder.innerHTML = rows.map(x => {
      const key = x.cartKey || x.id;
      return `<div class="cart-item">
        <img src="${escapeHtml(x.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=300&q=80')}" alt="">
        <div class="flex-grow-1">
          <strong>${escapeHtml(x.name)}</strong>
          <div class="text-muted small">${money(x.price)} each</div>
          <div class="qty-control mt-2">
            <button data-minus="${escapeHtml(key)}" aria-label="Decrease quantity">−</button>
            <span>${x.quantity}</span>
            <button data-plus="${escapeHtml(key)}" aria-label="Increase quantity">+</button>
          </div>
        </div>
        <div class="text-end">
          <strong>${money(x.price * x.quantity)}</strong>
          <button class="remove-item" data-remove="${escapeHtml(key)}" aria-label="Remove item"><i class="bi bi-trash"></i></button>
        </div>
      </div>`;
    }).join('');

    holder.querySelectorAll('[data-minus]').forEach(b => b.addEventListener('click', () => changeQty(b.dataset.minus, -1)));
    holder.querySelectorAll('[data-plus]').forEach(b => b.addEventListener('click', () => changeQty(b.dataset.plus, 1)));
    holder.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => {
      delete cart[b.dataset.remove];
      saveCart();
    }));
    updateLiveStatus();
  }

  function showCheckout() {
    if (!cartCount()) return;

    const storeState = isStoreOpen();
    if (!storeState.open) {
      if (storeClosedModal) {
        if ($('storeClosedModalText')) $('storeClosedModalText').textContent = storeState.message;
        storeClosedModal.show();
      } else {
        notify(storeState.message);
      }
      return;
    }

    if (total() < Number(settings.minimum_order_amount || 0)) {
      notify(`Minimum order is ${money(settings.minimum_order_amount)}.`);
      return;
    }

    const disc = discountAmount();
    const rows = [
      `<div class="d-flex justify-content-between mb-1"><span>${cartCount()} item(s)</span><strong>${money(subtotal())}</strong></div>`
    ];
    if (disc > 0) {
      rows.push(`<div class="d-flex justify-content-between text-success mb-1"><span>Discount (${discountPercent()}%)</span><strong>-${money(disc)}</strong></div>`);
    }
    rows.push(
      `<div class="d-flex justify-content-between mb-2"><span>Delivery</span><strong>${money(delivery())}</strong></div>`,
      `<hr class="my-2">`,
      `<div class="d-flex justify-content-between fs-5"><strong>Total</strong><strong class="text-orange">${money(total())}</strong></div>`
    );
    if ($('checkoutReview')) $('checkoutReview').innerHTML = rows.join('');

    const upiId = (settings.upi_id || '7069300077@upi').trim();
    const restName = (settings.restaurant_name || cfg.defaultRestaurantName || 'Radhe Krushna Food Zone').trim();
    const amount = total();

    if ($('checkoutUpiIdText')) $('checkoutUpiIdText').textContent = upiId;
    if ($('checkoutQrAmount')) $('checkoutQrAmount').textContent = `Total to Pay: ${money(amount)}`;

    const qrImg = $('checkoutQrImg');
    if (qrImg) {
      if (settings.qr_image_url && settings.qr_image_url.trim()) {
        qrImg.src = settings.qr_image_url.trim();
      } else {
        const upiString = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(restName)}&am=${amount}&cu=INR&tn=${encodeURIComponent('Restaurant Order')}`;
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiString)}`;
      }
    }

    checkoutModal.show();
  }

  // Daily Sequential Order ID: DATE(DDMMYY)-(0001)
  function getDailyOrderId() {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    const ddmmyy = `${dd}${mm}${yy}`;

    const savedDate = localStorage.getItem('last_order_date');
    let seq = parseInt(localStorage.getItem('daily_order_seq') || '0', 10);

    if (savedDate === ddmmyy) {
      seq += 1;
    } else {
      seq = 1;
    }

    localStorage.setItem('last_order_date', ddmmyy);
    localStorage.setItem('daily_order_seq', String(seq));

    const seqFormatted = String(seq).padStart(4, '0');
    const orderId = `DATE(${ddmmyy})-(${seqFormatted})`;
    const displayDate = `${dd}/${mm}/${now.getFullYear()}`;

    return { orderId, displayDate, ddmmyy, seqFormatted };
  }

  // WhatsApp checkout form submission
  $('checkoutForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const storeState = isStoreOpen();
    if (!storeState.open) {
      checkoutModal.hide();
      if (storeClosedModal) {
        if ($('storeClosedModalText')) $('storeClosedModalText').textContent = storeState.message;
        storeClosedModal.show();
      } else {
        notify(storeState.message);
      }
      return;
    }
    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }
    if (!cartCount()) {
      checkoutModal.hide();
      return notify('Your cart is empty.');
    }

    const phone = $('customerPhone').value.trim();
    if (!/^[6-9]\d{9}$/.test(phone)) {
      $('customerPhone').setCustomValidity('Invalid');
      form.classList.add('was-validated');
      $('customerPhone').reportValidity();
      $('customerPhone').setCustomValidity('');
      return;
    }

    const number = String(settings.whatsapp_number || cfg.defaultWhatsAppNumber).replace(/\D/g, '');
    if (!/^\d{10,15}$/.test(number)) {
      notify('Restaurant WhatsApp number is not configured. Ask the admin to update settings.');
      return;
    }

    const { orderId, displayDate } = getDailyOrderId();
    const upiId = (settings.upi_id || '7069300077@upi').trim();
    const restName = (settings.restaurant_name || cfg.defaultRestaurantName || 'Radhe Krushna Food Zone').trim();
    const disc = discountAmount();
    const amount = total();
    const qrLink = (settings.qr_image_url && settings.qr_image_url.trim()) ||
      `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`upi://pay?pa=${upiId}&pn=${encodeURIComponent(restName)}&am=${amount}&cu=INR&tn=Order`)}`;

    const lines = cartRows().map((x, i) => `${i + 1}. ${x.name}\n   ${x.quantity} x ${money(x.price)} = ${money(x.price * x.quantity)}`).join('\n\n');
    const address = [$('customerAddress').value.trim(), $('customerArea').value.trim(), $('customerCity').value.trim()].filter(Boolean).join(', ');
    const notes = $('customerNotes').value.trim();

    const messageLines = [
      `*NEW RESTAURANT ORDER*`,
      `Order ID: ${orderId}`,
      `Date: ${displayDate}`,
      '',
      '*CUSTOMER DETAILS*',
      `Name: ${$('customerName').value.trim()}`,
      `Phone: ${phone}`,
      `Address: ${address}`
    ];

    if (notes) {
      messageLines.push(`Notes: ${notes}`);
    }

    messageLines.push(
      '',
      '*ORDER ITEMS*',
      lines,
      '',
      '*PAYMENT SUMMARY*',
      `Subtotal: ${money(subtotal())}`
    );

    if (disc > 0) {
      messageLines.push(`Discount (${discountPercent()}%): -${money(disc)}`);
    }

    messageLines.push(
      `Delivery: ${money(delivery())}`,
      `*GRAND TOTAL: ${money(amount)}*`,
      '',
      '*PAYMENT & DELIVERY*',
      `*CASH ON DELIVERY (COD) IS AVAILABLE!*`,
      `Pay via UPI: ${upiId}`,
      `UPI Payment QR Code: ${qrLink}`,
      '',
      'Please confirm this order.'
    );

    const message = messageLines.join('\n');
    const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) window.location.href = url;

    checkoutModal.hide();
    cartCanvas.hide();
    notify(`Order ${orderId} is ready in WhatsApp. Please press Send there.`);
  });

  async function loadData() {
    if (!window.db) {
      $('categoryCardsGrid').innerHTML = '';
      $('menuError').classList.remove('d-none');
      $('menuError').textContent = 'Supabase is not configured yet. Add your project URL and anon key in js/config.js, then run the SQL setup.';
      return;
    }

    const [catRes, menuRes, settingsRes] = await Promise.all([
      db.from('categories').select('*').eq('is_active', true).order('sort_order'),
      db.from('menu_items').select('*').order('created_at', { ascending: false }),
      db.from('restaurant_settings').select('*').eq('id', 1).maybeSingle()
    ]);

    if (catRes.error || menuRes.error) {
      $('menuError').classList.remove('d-none');
      console.error(catRes.error || menuRes.error);
      return;
    }

    categories = catRes.data || [];
    menu = menuRes.data || [];
    settings = settingsRes.data || {};
    $('menuError').classList.add('d-none');

    const name = settings.restaurant_name || cfg.defaultRestaurantName;
    if ($('restaurantName')) $('restaurantName').textContent = name;
    if ($('footerRestaurantName')) $('footerRestaurantName').textContent = name;
    if ($('footerNameBottom')) $('footerNameBottom').textContent = name;
    if ($('footerAddress')) $('footerAddress').textContent = settings.address || 'AB-3, Mile Stone, Anand Vidhyanagar Road, Anand - 388 001';
    if ($('footerHours')) $('footerHours').textContent = settings.opening_hours || 'Daily · 11:00 AM – 11:00 PM';
    if ($('footerPhone')) $('footerPhone').textContent = settings.contact_phone || '7069300077 / 9979678889';
    if ($('footerWhatsapp')) $('footerWhatsapp').textContent = settings.whatsapp_number || '9979678889';
    if ($('year')) $('year').textContent = new Date().getFullYear();
    updateLiveStatus();

    // Offer banner
    const discBanner = $('discountBanner');
    const discBannerText = $('discountBannerText');
    if (discBanner && discBannerText) {
      const p = discountPercent();
      const note = (settings.discount_note || '').trim();
      if (p > 0 || note) {
        discBanner.classList.remove('d-none');
        let bannerText = '';
        if (p > 0 && note) {
          bannerText = `Special Offer: Flat ${p}% OFF on your entire order! — ${note}`;
        } else if (p > 0) {
          bannerText = `Special Offer: Flat ${p}% OFF on your entire order!`;
        } else {
          bannerText = note;
        }
        discBannerText.textContent = bannerText;
      } else {
        discBanner.classList.add('d-none');
      }
    }

    // Render landing page category cards
    renderMainCategoryCards();

    // If already inside a category, stay there, else show landing page cards
    if (selectedMainCategory) {
      selectCategory(selectedMainCategory);
    } else {
      $('mainCategoriesView')?.classList.remove('d-none');
      $('categoryItemsView')?.classList.add('d-none');
    }

    renderCart();
  }

  // Search input handler
  $('searchInput')?.addEventListener('input', (e) => {
    const q = e.target.value.trim();
    if (q) {
      $('mainCategoriesView')?.classList.add('d-none');
      $('categoryItemsView')?.classList.remove('d-none');
      if ($('activeCategoryBadge')) $('activeCategoryBadge').textContent = selectedMainCategory ? 'Search in Category' : 'Search All Dishes';
      renderMenu();
    } else {
      if (!selectedMainCategory) {
        backToCategories();
      } else {
        selectCategory(selectedMainCategory);
      }
    }
  });

  // Back button listeners
  $('backToCategoriesBtn')?.addEventListener('click', backToCategories);
  $('emptyBackBtn')?.addEventListener('click', backToCategories);

  ['navCartBtn', 'mobileCartBtn'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('click', () => cartCanvas.show());
  });

  $('checkoutBtn').addEventListener('click', showCheckout);

  renderCart();
  updateLiveStatus();
  setInterval(updateLiveStatus, 30000);

  loadData().then(() => {
    if (window.db) {
      db.channel('public-menu-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => {
          loadData();
          updateLiveStatus();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
          loadData();
          updateLiveStatus();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_settings' }, () => {
          loadData();
          updateLiveStatus();
        })
        .subscribe();
    }
  });
})();
