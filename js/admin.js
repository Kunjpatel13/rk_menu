(() => {
  const $ = id => document.getElementById(id);
  const escapeHtml = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => `₹${Number(n || 0).toFixed(0)}`;
  let adminUser, menu = [], categories = [], settings = {}, editingImageUrl = '', editingCategoryImageUrl = '';
  let activeConfigDay = 'all';
  let currentDaySlots = {
    all: [{ start: '10:30', end: '15:00' }, { start: '17:00', end: '23:00' }],
    mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: []
  };
  let categoryDiscountsMap = {};
  const modal = $('itemModal') ? bootstrap.Modal.getOrCreateInstance($('itemModal')) : null;
  const bulkModal = $('bulkItemModal') ? bootstrap.Modal.getOrCreateInstance($('bulkItemModal')) : null;
  const categoryModal = $('categoryModal') ? bootstrap.Modal.getOrCreateInstance($('categoryModal')) : null;

  const DEFAULT_CATEGORY_IMAGES = {
    'Kathiyawadi & Gujarati Food': '../img/Kathiyawadi & Gujarati Food.avif',
    'Indian Sabji & Curry': '../img/Indian Sabji & Curry.jfif',
    'Rice, Pulao & Biryani': '../img/Rice, Pulao & Biryani.avif',
    'Chinese Food': '../img/Chinese Food.jfif',
    'Starters': '../img/Starters.jpg',
    'Roti, Bhakhri & Paratha': '../img/Roti, Bhakhri & Paratha.jpeg',
    'Snacks, Fast Food & Quick Bites': '../img/Snacks, Fast Food & Quick Bites.webp',
    'Thali, Kadhi-Khichdi & Beverages': '../img/Fix Thali.jfif'
  };

  function notice(message, bad = false) {
    const el = $('adminNotice');
    if (!el) return;
    el.textContent = message;
    el.className = `admin-notice ${bad ? 'is-error' : 'is-success'}`;
    el.classList.remove('d-none');
    setTimeout(() => el.classList.add('d-none'), 4500);
  }

  const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

  function isSessionExpired() {
    const expiry = localStorage.getItem('admin_session_expiry');
    if (!expiry) return true;
    return Date.now() > Number(expiry);
  }

  function refreshSession() {
    localStorage.setItem('admin_session_expiry', String(Date.now() + SESSION_TIMEOUT_MS));
  }

  async function expireSession(reason = 'expired') {
    localStorage.removeItem('admin_session_expiry');
    if (window.db) {
      try { await db.auth.signOut(); } catch (e) { /* ignore */ }
    }
    location.href = `login.html?${reason}=1`;
  }

  function startSessionTracker() {
    refreshSession();

    // Reset inactivity timer on user interactions (throttled to every 10s)
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    let lastRefresh = Date.now();
    events.forEach(evt => {
      window.addEventListener(evt, () => {
        const now = Date.now();
        if (now - lastRefresh > 10000) {
          lastRefresh = now;
          refreshSession();
        }
      }, { passive: true });
    });

    // Check every 10 seconds if session has expired
    setInterval(() => {
      if (isSessionExpired()) {
        expireSession('expired');
      }
    }, 10000);
  }

  async function requireAdmin() {
    if (!window.db) { location.href = 'login.html'; return false; }

    // Enforce 30-minute session expiration
    if (isSessionExpired()) {
      await expireSession('expired');
      return false;
    }

    const { data: { session } } = await db.auth.getSession();
    if (!session) { location.href = 'login.html'; return false; }

    // Multi-user support: Any user authenticated via Supabase Auth is authorized as an administrator!
    // Attempt registration in admin_users for database RLS policies
    try {
      await db.from('admin_users').upsert({ user_id: session.user.id }, { onConflict: 'user_id' });
    } catch (e) {
      // Non-blocking
    }

    adminUser = session.user;
    if ($('adminEmail')) $('adminEmail').textContent = adminUser.email;

    // Start tracking 30-minute inactivity
    startSessionTracker();
    return true;
  }

  async function loadAll() {
    const [m, c, s] = await Promise.all([
      db.from('menu_items').select('*').order('created_at', { ascending: false }),
      db.from('categories').select('*').order('sort_order'),
      db.from('restaurant_settings').select('*').eq('id', 1).maybeSingle()
    ]);
    if (m.error || c.error || s.error) {
      notice((m.error || c.error || s.error).message, true);
      return;
    }
    menu = m.data || [];
    categories = c.data || [];
    settings = s.data || {};
    populateCategoryFilter();
    renderStats();
    renderMenuTable();
    renderCategories();
    fillSettings();
  }

  function renderStats() {
    if ($('statTotal')) $('statTotal').textContent = menu.length;
    if ($('statAvailable')) $('statAvailable').textContent = menu.filter(x => x.is_available).length;
    if ($('statSoldout')) $('statSoldout').textContent = menu.filter(x => !x.is_available).length;
    if ($('statCategories')) $('statCategories').textContent = categories.length;
    if ($('adminRestaurantName')) $('adminRestaurantName').textContent = settings.restaurant_name || 'Restaurant Admin';
  }

  // Hierarchical category options helper
  function buildCategoryGroupOptions(includeAllOption = false) {
    const mains = categories.filter(c => !c.parent_id);
    let html = includeAllOption ? `<option value="all">All Categories (${menu.length})</option>` : '';

    if (!mains.length) {
      return html + categories.map(c => {
        const count = menu.filter(m => m.category_id === c.id).length;
        return `<option value="${c.id}">${escapeHtml(c.name)} (${count})</option>`;
      }).join('');
    }

    mains.forEach(main => {
      const subs = categories.filter(c => c.parent_id === main.id);
      const mainDishes = menu.filter(m => m.category_id === main.id || subs.some(s => s.id === m.category_id)).length;
      html += `<optgroup label="${escapeHtml(main.name)} (${mainDishes})">`;
      if (includeAllOption) {
        html += `<option value="${main.id}">-- All ${escapeHtml(main.name)} (${mainDishes}) --</option>`;
      } else if (!subs.length) {
        html += `<option value="${main.id}">${escapeHtml(main.name)}</option>`;
      }
      subs.forEach(sub => {
        const subCount = menu.filter(m => m.category_id === sub.id).length;
        html += `<option value="${sub.id}">${escapeHtml(sub.name)} (${subCount})</option>`;
      });
      html += `</optgroup>`;
    });

    // Orphan categories (if any)
    const orphans = categories.filter(c => c.parent_id && !mains.some(m => m.id === c.parent_id));
    if (orphans.length) {
      html += `<optgroup label="Other Categories">`;
      orphans.forEach(c => {
        const cnt = menu.filter(m => m.category_id === c.id).length;
        html += `<option value="${c.id}">${escapeHtml(c.name)} (${cnt})</option>`;
      });
      html += `</optgroup>`;
    }
    return html;
  }

  function populateCategoryFilter() {
    const sel = $('adminCategoryFilter');
    if (!sel) return;
    const currentVal = sel.value || 'all';
    sel.innerHTML = buildCategoryGroupOptions(true);
    if (Array.from(sel.options).some(o => o.value === currentVal)) {
      sel.value = currentVal;
    } else {
      sel.value = 'all';
    }
  }

  function getFilteredAndSortedMenu() {
    const q = ($('adminMenuSearch')?.value || '').trim().toLowerCase();
    const selectedCat = $('adminCategoryFilter')?.value || 'all';
    const sort = $('adminSortFilter')?.value || 'category';

    let list = menu.filter(item => {
      let matchCat = false;
      if (selectedCat === 'all') {
        matchCat = true;
      } else if (item.category_id === selectedCat) {
        matchCat = true;
      } else {
        // If selectedCat is a main category, match items belonging to any of its sub-categories
        const cat = categories.find(c => c.id === item.category_id);
        if (cat && cat.parent_id === selectedCat) {
          matchCat = true;
        }
      }
      const matchQuery = !q || (item.name && item.name.toLowerCase().includes(q)) || (item.description && item.description.toLowerCase().includes(q));
      return matchCat && matchQuery;
    });

    list.sort((a, b) => {
      if (sort === 'name_asc') return a.name.localeCompare(b.name);
      if (sort === 'name_desc') return b.name.localeCompare(a.name);
      if (sort === 'price_asc') return Number(a.price) - Number(b.price);
      if (sort === 'price_desc') return Number(b.price) - Number(a.price);
      if (sort === 'available') return (b.is_available ? 1 : 0) - (a.is_available ? 1 : 0);
      const catA = categories.find(c => c.id === a.category_id);
      const catB = categories.find(c => c.id === b.category_id);
      const orderA = catA ? (catA.sort_order ?? 999) : 999;
      const orderB = catB ? (catB.sort_order ?? 999) : 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

    return list;
  }

  function resetFilters() {
    if ($('adminMenuSearch')) $('adminMenuSearch').value = '';
    if ($('adminCategoryFilter')) $('adminCategoryFilter').value = 'all';
    if ($('adminSortFilter')) $('adminSortFilter').value = 'category';
    renderMenuTable();
  }

  function renderMenuTable() {
    const items = getFilteredAndSortedMenu();
    const countEl = $('adminFilterCount');
    if (countEl) countEl.textContent = `${items.length} of ${menu.length} items`;

    const tbody = $('menuTableBody');
    if (!tbody) return;

    tbody.innerHTML = items.length ? items.map(x => {
      const cat = categories.find(c => c.id === x.category_id);
      const parentCat = cat?.parent_id ? categories.find(c => c.id === cat.parent_id) : null;
      const catBadge = parentCat
        ? `<span class="badge bg-light text-dark border">${escapeHtml(parentCat.name)} &rsaquo; <strong>${escapeHtml(cat.name)}</strong></span>`
        : `<span class="badge bg-light text-dark border">${escapeHtml(cat?.name || '—')}</span>`;

      const priceHtml = (x.half_price && Number(x.half_price) > 0)
        ? `<div><strong>Full: ${money(x.price)}</strong><br><small class="text-muted">Half: ${money(x.half_price)}</small></div>`
        : `<strong>${money(x.price)}</strong>`;

      return `<tr>
        <td>
          <div class="table-product">
            <img src="${escapeHtml(x.image_url || 'https://placehold.co/80x80?text=Food')}" alt="">
            <div>
              <strong>${escapeHtml(x.name)}</strong>
              <small>${x.is_bestseller ? '★ Bestseller' : ''}</small>
            </div>
          </div>
        </td>
        <td>${catBadge}</td>
        <td>${priceHtml}</td>
        <td><span class="status-pill ${x.is_available ? 'available' : 'soldout'}">${x.is_available ? 'Available' : 'Sold out'}</span></td>
        <td class="text-end">
          <div class="table-actions">
            <button class="btn btn-sm btn-light" data-edit="${x.id}" title="Edit"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-light text-danger" data-delete="${x.id}" title="Delete"><i class="bi bi-trash"></i></button>
          </div>
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="5" class="text-center py-5 text-muted">No dishes matching the search/filter. <button class="btn btn-sm btn-link" id="clearFilterLink">Reset filters</button></td></tr>`;

    tbody.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openEdit(b.dataset.edit)));
    tbody.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', () => deleteItem(b.dataset.delete)));
    const clearLink = document.getElementById('clearFilterLink');
    if (clearLink) clearLink.addEventListener('click', resetFilters);
  }

  function renderCategories() {
    // Populate parent dropdown in Category form
    const parentSel = $('categoryParent');
    if (parentSel) {
      const mains = categories.filter(c => !c.parent_id);
      parentSel.innerHTML = `<option value="">-- Main Category (Root) --</option>` +
        mains.map(m => `<option value="${m.id}">Sub-category of: ${escapeHtml(m.name)}</option>`).join('');
    }

    // Populate category dropdowns in Single Item modal and Bulk modal
    const itemCat = $('itemCategory');
    if (itemCat) {
      const current = itemCat.value;
      itemCat.innerHTML = buildCategoryGroupOptions(false);
      if (current) itemCat.value = current;
    }

    const bulkCat = $('bulkCategorySelect');
    if (bulkCat) {
      const current = bulkCat.value;
      bulkCat.innerHTML = `<option value="">-- Choose Category / Sub-Category --</option>` + buildCategoryGroupOptions(false);
      if (current) bulkCat.value = current;
    }

    // Render tree view in Category Management
    const listEl = $('categoryList');
    if (!listEl) return;

    const mains = categories.filter(c => !c.parent_id);
    if (!mains.length && !categories.length) {
      listEl.innerHTML = '<p class="text-muted">No categories created yet.</p>';
      return;
    }

    let treeHtml = '';
    mains.forEach(main => {
      const subs = categories.filter(c => c.parent_id === main.id);
      const mainDishCount = menu.filter(m => m.category_id === main.id || subs.some(s => s.id === m.category_id)).length;
      const displayImg = (main.image_url && main.image_url.trim()) ? main.image_url.trim() : (DEFAULT_CATEGORY_IMAGES[main.name] || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=300&q=80');

      treeHtml += `
        <div class="category-tree-main">
          <div class="category-tree-main-title">
            <div class="d-flex align-items-center gap-3">
              <img src="${escapeHtml(displayImg)}" alt="" class="category-thumb" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=300&q=80'">
              <div>
                <strong>${escapeHtml(main.name)}</strong>
                <span class="badge bg-secondary-subtle text-dark border ms-2">${mainDishCount} dishes</span>
              </div>
            </div>
            <div class="d-flex gap-1">
              <button class="btn btn-sm btn-light" data-editcat="${main.id}" title="Edit category name & image"><i class="bi bi-pencil me-1"></i>Edit</button>
              <button class="btn btn-sm btn-light text-danger" data-delcat="${main.id}" title="Delete"><i class="bi bi-trash"></i></button>
            </div>
          </div>
          ${subs.length ? `
            <div class="category-tree-sub-list">
              ${subs.map(s => {
                const subDishCount = menu.filter(m => m.category_id === s.id).length;
                return `
                  <div class="category-tree-sub-item">
                    <span>&bull; ${escapeHtml(s.name)} <small class="text-muted">(${subDishCount} dishes)</small></span>
                    <div>
                      <button class="btn btn-sm btn-light" data-editcat="${s.id}" title="Edit"><i class="bi bi-pencil"></i></button>
                      <button class="btn btn-sm btn-light text-danger" data-delcat="${s.id}" title="Delete"><i class="bi bi-trash"></i></button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : '<div class="ps-3 mt-1 small text-muted"><em>No sub-categories</em></div>'}
        </div>
      `;
    });

    // Orphan categories
    const orphans = categories.filter(c => c.parent_id && !mains.some(m => m.id === c.parent_id));
    if (orphans.length) {
      treeHtml += `<div class="mt-3 mb-1 fw-bold text-secondary small">OTHER CATEGORIES</div>`;
      orphans.forEach(o => {
        treeHtml += `
          <div class="category-row">
            <span>${escapeHtml(o.name)}</span>
            <div>
              <button class="btn btn-sm btn-light" data-editcat="${o.id}"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-sm btn-light text-danger" data-delcat="${o.id}"><i class="bi bi-trash"></i></button>
            </div>
          </div>
        `;
      });
    }

    listEl.innerHTML = treeHtml;
    listEl.querySelectorAll('[data-editcat]').forEach(b => b.addEventListener('click', () => openEditCategory(b.dataset.editcat)));
    listEl.querySelectorAll('[data-delcat]').forEach(b => b.addEventListener('click', () => deleteCategory(b.dataset.delcat)));
  }

  function formatTime12(tStr) {
    if (!tStr) return '';
    const [h, m] = tStr.split(':').map(Number);
    const ampm = (h >= 12 && h < 24) ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    const mStr = String(m || 0).padStart(2, '0');
    return `${h12}:${mStr} ${ampm}`;
  }

  function parseSlots(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function parseDaySlots(val) {
    if (!val) return {};
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) return val;
    try {
      const parsed = JSON.parse(val);
      return (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) ? parsed : {};
    } catch {
      return {};
    }
  }

  function parseCategoryDiscounts(val) {
    if (!val) return {};
    if (typeof val === 'object' && val !== null) return val;
    try {
      const p = JSON.parse(val);
      return (typeof p === 'object' && p !== null) ? p : {};
    } catch {
      return {};
    }
  }

  function initSlotData() {
    const defaultAll = [{ start: '10:30', end: '15:00' }, { start: '17:00', end: '23:00' }];
    const loadedAll = parseSlots(settings.time_slots);
    currentDaySlots.all = (loadedAll && loadedAll.length) ? loadedAll : defaultAll;

    const loadedDays = parseDaySlots(settings.day_slots);
    ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].forEach(d => {
      if (Array.isArray(loadedDays[d]) && loadedDays[d].length) {
        currentDaySlots[d] = loadedDays[d];
      } else {
        currentDaySlots[d] = JSON.parse(JSON.stringify(currentDaySlots.all));
      }
    });
  }

  function getSlotsForDay(day) {
    if (!currentDaySlots[day]) currentDaySlots[day] = [];
    return currentDaySlots[day];
  }

  function renderTimeSlots() {
    const container = $('timeSlotsContainer');
    if (!container) return;
    const slots = getSlotsForDay(activeConfigDay);
    const dayNames = {
      all: 'All Days (Default Schedule)',
      mon: 'Monday Schedule',
      tue: 'Tuesday Schedule',
      wed: 'Wednesday Schedule',
      thu: 'Thursday Schedule',
      fri: 'Friday Schedule',
      sat: 'Saturday Schedule',
      sun: 'Sunday Schedule'
    };

    if ($('currentConfiguringDayLabel')) {
      $('currentConfiguringDayLabel').textContent = dayNames[activeConfigDay] || 'Schedule';
    }

    if (!slots.length) {
      container.innerHTML = `
        <div class="text-center py-3 text-muted border border-dashed rounded bg-white">
          <i class="bi bi-clock me-1"></i>No time slots set for this day (Closed).
          <div class="mt-2">
            <button type="button" class="btn btn-sm btn-outline-primary" id="addFirstSlotBtn"><i class="bi bi-plus-lg me-1"></i>Add Slot</button>
          </div>
        </div>
      `;
      const btn = container.querySelector('#addFirstSlotBtn');
      if (btn) btn.addEventListener('click', () => addTimeSlot());
      return;
    }

    container.innerHTML = slots.map((s, idx) => `
      <div class="d-flex align-items-center gap-2 bg-white p-2 rounded border slot-row" data-index="${idx}">
        <span class="badge bg-light text-dark border">Slot ${idx + 1}</span>
        <div class="d-flex align-items-center gap-2 flex-grow-1 flex-wrap">
          <input type="time" class="form-control form-control-sm slot-start-input" style="max-width: 140px;" value="${s.start || '10:30'}" required>
          <span class="text-muted small fw-bold">to</span>
          <input type="time" class="form-control form-control-sm slot-end-input" style="max-width: 140px;" value="${s.end || '15:00'}" required>
          <span class="text-secondary small ms-2 d-none d-md-inline">(${formatTime12(s.start)} – ${formatTime12(s.end)})</span>
        </div>
        <button type="button" class="btn btn-outline-danger btn-sm remove-slot-btn" data-index="${idx}" title="Delete slot">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    `).join('');

    container.querySelectorAll('.slot-start-input').forEach((input, i) => {
      input.addEventListener('change', () => {
        if (slots[i]) slots[i].start = input.value;
      });
    });
    container.querySelectorAll('.slot-end-input').forEach((input, i) => {
      input.addEventListener('change', () => {
        if (slots[i]) slots[i].end = input.value;
      });
    });
    container.querySelectorAll('.remove-slot-btn').forEach(b => {
      b.addEventListener('click', () => {
        const index = parseInt(b.dataset.index, 10);
        slots.splice(index, 1);
        renderTimeSlots();
      });
    });
  }

  function addTimeSlot() {
    const slots = getSlotsForDay(activeConfigDay);
    let nextStart = '17:00';
    let nextEnd = '23:00';
    if (slots.length === 1 && slots[0].end <= '15:00') {
      nextStart = '17:00';
      nextEnd = '23:00';
    } else if (slots.length > 0) {
      const last = slots[slots.length - 1];
      nextStart = last.end || '12:00';
      nextEnd = '23:00';
    }
    slots.push({ start: nextStart, end: nextEnd });
    renderTimeSlots();
  }

  function copySlotsToAllDays() {
    const currentSlots = getSlotsForDay(activeConfigDay);
    const cloned = JSON.parse(JSON.stringify(currentSlots));
    currentDaySlots.all = JSON.parse(JSON.stringify(cloned));
    ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].forEach(d => {
      currentDaySlots[d] = JSON.parse(JSON.stringify(cloned));
    });
    notice('Copied slots to all days! Click "Save settings" to persist.');
  }

  function initCategoryDiscounts() {
    const fromSettings = parseCategoryDiscounts(settings.category_discounts);
    categoryDiscountsMap = { ...fromSettings };
    categories.forEach(c => {
      if (c.discount_percent !== undefined && c.discount_percent !== null) {
        if (categoryDiscountsMap[c.id] === undefined) {
          categoryDiscountsMap[c.id] = Number(c.discount_percent);
        }
      }
    });
  }

  function renderCategoryDiscountTable() {
    const tbody = $('categoryDiscountTableBody');
    if (!tbody) return;

    if (!categories.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center py-3 text-muted">No categories created yet.</td></tr>';
      return;
    }

    const mains = categories.filter(c => !c.parent_id);
    let rowsHtml = '';

    const renderRow = (cat, isSub = false, parentName = '') => {
      const dVal = (categoryDiscountsMap[cat.id] !== undefined)
        ? categoryDiscountsMap[cat.id]
        : (cat.discount_percent ? Number(cat.discount_percent) : 0);
      const isZero = Number(dVal) === 0;

      return `
        <tr data-cat-id="${cat.id}">
          <td>
            <div class="${isSub ? 'ps-3' : 'fw-bold'} d-flex align-items-center gap-2">
              ${isSub ? '<span class="text-muted">↳</span>' : '<span class="badge bg-secondary-subtle text-dark border">Main</span>'}
              <span>${escapeHtml(cat.name)}</span>
              ${isSub && parentName ? `<small class="text-muted">(${escapeHtml(parentName)})</small>` : ''}
            </div>
          </td>
          <td>
            <div class="input-group input-group-sm">
              <input type="number" min="0" max="100" step="0.5" class="form-control cat-discount-input"
                     data-cat-id="${cat.id}" value="${dVal}">
              <span class="input-group-text">%</span>
            </div>
          </td>
          <td>
            <span class="badge ${isZero ? 'bg-secondary' : 'bg-success'} status-badge">
              ${isZero ? 'Full Price (0%)' : `${dVal}% OFF`}
            </span>
          </td>
        </tr>
      `;
    };

    mains.forEach(main => {
      rowsHtml += renderRow(main, false);
      const subs = categories.filter(c => c.parent_id === main.id);
      subs.forEach(sub => {
        rowsHtml += renderRow(sub, true, main.name);
      });
    });

    const orphans = categories.filter(c => c.parent_id && !categories.some(m => m.id === c.parent_id));
    orphans.forEach(o => {
      rowsHtml += renderRow(o, true, 'Other');
    });

    tbody.innerHTML = rowsHtml;

    tbody.querySelectorAll('.cat-discount-input').forEach(input => {
      input.addEventListener('input', () => {
        const catId = input.dataset.catId;
        const val = Math.max(0, Math.min(100, Number(input.value || 0)));
        categoryDiscountsMap[catId] = val;
        const row = input.closest('tr');
        const badge = row ? row.querySelector('.status-badge') : null;
        if (badge) {
          if (val === 0) {
            badge.className = 'badge bg-secondary status-badge';
            badge.textContent = 'Full Price (0%)';
          } else {
            badge.className = 'badge bg-success status-badge';
            badge.textContent = `${val}% OFF`;
          }
        }
      });
    });
  }

  function applySabjiChinesePreset() {
    categories.forEach(c => {
      const n = (c.name || '').toLowerCase();
      if (
        n.includes('sabji') || n.includes('curry') || n.includes('paneer') ||
        n.includes('kaju') || n.includes('chinese') || n.includes('starter') ||
        n.includes('manchurian') || n.includes('noodle')
      ) {
        categoryDiscountsMap[c.id] = 10;
      } else {
        categoryDiscountsMap[c.id] = 0;
      }
    });
    renderCategoryDiscountTable();
    notice('Preset applied: 10% on Curries & Chinese, 0% on Roti & Beverages. Click "Save settings" to persist.');
  }

  function clearAllCategoryDiscounts() {
    categories.forEach(c => {
      categoryDiscountsMap[c.id] = 0;
    });
    renderCategoryDiscountTable();
    notice('All category discounts set to 0% (Full Price). Click "Save settings" to persist.');
  }

  function fillSettings() {
    $('settingName').value = settings.restaurant_name || '';
    $('settingWhatsapp').value = settings.whatsapp_number || '';
    $('settingPhone').value = settings.contact_phone || '';
    $('settingHours').value = settings.opening_hours || '';
    $('settingAddress').value = settings.address || '';
    $('settingDelivery').value = settings.delivery_charge ?? 0;
    $('settingMinimum').value = settings.minimum_order_amount ?? 0;
    if ($('settingDiscount')) $('settingDiscount').value = settings.discount_percent ?? 0;
    if ($('settingDiscountNote')) $('settingDiscountNote').value = settings.discount_note || '';
    if ($('settingUpiId')) $('settingUpiId').value = settings.upi_id || '';
    if ($('settingQrImage')) $('settingQrImage').value = settings.qr_image_url || '';
    if ($('settingStoreStatus')) $('settingStoreStatus').value = settings.store_status || 'auto';
    if ($('settingClosedMessage')) $('settingClosedMessage').value = settings.closed_message || '';

    initSlotData();
    renderTimeSlots();
    initCategoryDiscounts();
    renderCategoryDiscountTable();
  }

  function updateImagePreview(url, sourceLabel = 'Image selected') {
    const container = $('imagePreviewContainer');
    const img = $('itemImagePreview');
    const sourceText = $('previewSourceText');
    const urlText = $('previewUrlText');
    if (!container || !img) return;

    if (url && url.trim()) {
      img.src = url.trim();
      img.onerror = () => {
        img.src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=300&q=80';
        if (urlText) urlText.textContent = 'Invalid URL or could not load image';
      };
      if (sourceText) sourceText.textContent = sourceLabel;
      if (urlText) urlText.textContent = url.trim();
      container.classList.remove('d-none');
    } else {
      img.src = '';
      container.classList.add('d-none');
      if (urlText) urlText.textContent = '';
    }
  }

  function openAdd() {
    $('itemForm').reset();
    $('itemId').value = '';
    if ($('itemHalfPrice')) $('itemHalfPrice').value = '';
    if ($('itemType')) $('itemType').value = 'Veg';
    $('itemAvailable').value = 'true';
    $('itemBestseller').checked = false;
    if ($('itemIsDiscountable')) $('itemIsDiscountable').checked = true;
    if ($('itemImage')) $('itemImage').value = '';
    if ($('itemImageUrl')) $('itemImageUrl').value = '';
    editingImageUrl = '';
    updateImagePreview('');
    $('itemModalTitle').textContent = 'Add menu item';
    renderCategories();
    modal.show();
  }

  function openEdit(id) {
    const x = menu.find(i => i.id === id);
    if (!x) return;
    $('itemId').value = x.id;
    $('itemName').value = x.name;
    $('itemCategory').value = x.category_id;
    $('itemDescription').value = x.description || '';
    $('itemPrice').value = x.price;
    if ($('itemHalfPrice')) $('itemHalfPrice').value = (x.half_price && Number(x.half_price) > 0) ? x.half_price : '';
    if ($('itemType')) $('itemType').value = x.food_type || 'Veg';
    $('itemAvailable').value = String(x.is_available);
    $('itemBestseller').checked = !!x.is_bestseller;
    if ($('itemIsDiscountable')) $('itemIsDiscountable').checked = x.is_discountable !== false;
    if ($('itemImage')) $('itemImage').value = '';
    editingImageUrl = x.image_url || '';
    if ($('itemImageUrl')) $('itemImageUrl').value = editingImageUrl;
    updateImagePreview(editingImageUrl, 'Current Saved Image');
    $('itemModalTitle').textContent = 'Edit menu item';
    renderCategories();
    modal.show();
  }

  async function uploadImage(file) {
    if (!file) return null;
    if (file.size > 5 * 1024 * 1024) throw new Error('Image must be smaller than 5 MB.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use JPG, PNG or WebP images.');
    const ext = file.name.split('.').pop().toLowerCase(), path = `menu/${crypto.randomUUID()}.${ext}`;
    const { error } = await db.storage.from('menu-images').upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    const { data } = db.storage.from('menu-images').getPublicUrl(path);
    return data.publicUrl;
  }

  // Image input event listeners
  if ($('itemImageUrl')) {
    $('itemImageUrl').addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (val) {
        if ($('itemImage')) $('itemImage').value = '';
        updateImagePreview(val, 'Online Image Link');
      } else {
        updateImagePreview('');
      }
    });
  }

  if ($('itemImage')) {
    $('itemImage').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        if ($('itemImageUrl')) $('itemImageUrl').value = '';
        const localUrl = URL.createObjectURL(file);
        updateImagePreview(localUrl, `Uploaded: ${file.name}`);
      } else {
        const urlVal = $('itemImageUrl') ? $('itemImageUrl').value.trim() : '';
        updateImagePreview(urlVal, urlVal ? 'Online Image Link' : '');
      }
    });
  }

  if ($('removeImageBtn')) {
    $('removeImageBtn').addEventListener('click', () => {
      if ($('itemImageUrl')) $('itemImageUrl').value = '';
      if ($('itemImage')) $('itemImage').value = '';
      editingImageUrl = '';
      updateImagePreview('');
    });
  }

  $('itemForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('saveItemBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      let finalImage = null;
      const file = $('itemImage') ? $('itemImage').files[0] : null;
      const onlineUrl = $('itemImageUrl') ? $('itemImageUrl').value.trim() : '';

      if (file) {
        finalImage = await uploadImage(file);
      } else if (onlineUrl) {
        finalImage = onlineUrl;
      } else if (editingImageUrl) {
        finalImage = editingImageUrl;
      }

      const halfVal = $('itemHalfPrice') ? $('itemHalfPrice').value.trim() : '';
      const halfPrice = (halfVal !== '' && !isNaN(Number(halfVal)) && Number(halfVal) > 0) ? Number(halfVal) : null;
      const isDisc = $('itemIsDiscountable') ? $('itemIsDiscountable').checked : true;
      const payload = {
        name: $('itemName').value.trim(),
        category_id: $('itemCategory').value,
        description: $('itemDescription').value.trim(),
        price: Number($('itemPrice').value),
        half_price: halfPrice,
        food_type: $('itemType')?.value || 'Veg',
        is_available: $('itemAvailable').value === 'true',
        is_bestseller: $('itemBestseller').checked,
        is_discountable: isDisc,
        image_url: finalImage || null
      };
      if (!payload.category_id) throw new Error('Create a category before adding a menu item.');
      const id = $('itemId').value;
      let result = id ? await db.from('menu_items').update(payload).eq('id', id) : await db.from('menu_items').insert(payload);
      if (result.error && result.error.message && (result.error.message.includes('half_price') || result.error.message.includes('is_discountable'))) {
        if (result.error.message.includes('half_price')) delete payload.half_price;
        if (result.error.message.includes('is_discountable')) delete payload.is_discountable;
        result = id ? await db.from('menu_items').update(payload).eq('id', id) : await db.from('menu_items').insert(payload);
        if (result.error) throw result.error;
        notice('Saved! Notice: Run migration-slots-and-category-discounts.sql in Supabase to enable Half Price & Discount controls.', true);
      } else if (result.error) {
        throw result.error;
      } else {
        notice(id ? 'Menu item updated.' : 'Menu item added.');
      }
      modal.hide();
      await loadAll();
    } catch (err) {
      notice(err.message || 'Could not save item.', true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save item';
    }
  });

  async function deleteItem(id) {
    const x = menu.find(i => i.id === id);
    if (!x || !confirm(`Delete "${x.name}"? This cannot be undone.`)) return;
    const { error } = await db.from('menu_items').delete().eq('id', id);
    if (error) notice(error.message, true);
    else { await loadAll(); notice('Menu item deleted.'); }
  }

  /* ========================================================
     CATEGORY MODAL (ADD & EDIT WITH IMAGE)
  ======================================================== */
  function updateCategoryImagePreview(url, sourceLabel = 'Image selected') {
    const container = $('categoryImagePreviewContainer');
    const img = $('categoryImagePreview');
    const sourceText = $('categoryPreviewSourceText');
    const urlText = $('categoryPreviewUrlText');
    if (!container || !img) return;

    if (url && url.trim()) {
      img.src = url.trim();
      img.onerror = () => {
        img.src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=300&q=80';
        if (urlText) urlText.textContent = 'Invalid URL or could not load image';
      };
      if (sourceText) sourceText.textContent = sourceLabel;
      if (urlText) urlText.textContent = url.trim();
      container.classList.remove('d-none');
    } else {
      img.src = '';
      container.classList.add('d-none');
      if (urlText) urlText.textContent = '';
    }
  }

  function populateCategoryEditParent(currentId = null, selectedParentId = '') {
    const sel = $('categoryEditParent');
    if (!sel) return;
    const mains = categories.filter(c => !c.parent_id && c.id !== currentId);
    sel.innerHTML = `<option value="">-- Main Category (Root) --</option>` +
      mains.map(m => `<option value="${m.id}" ${m.id === selectedParentId ? 'selected' : ''}>Sub-category of: ${escapeHtml(m.name)}</option>`).join('');
    if (selectedParentId) sel.value = selectedParentId;
  }

  function openAddCategory() {
    if ($('categoryModalForm')) $('categoryModalForm').reset();
    $('categoryEditId').value = '';
    editingCategoryImageUrl = '';
    if ($('categoryEditImageUrl')) $('categoryEditImageUrl').value = '';
    if ($('categoryEditImageFile')) $('categoryEditImageFile').value = '';
    if ($('categoryEditDiscount')) $('categoryEditDiscount').value = '0';
    updateCategoryImagePreview('');
    populateCategoryEditParent(null, '');
    if ($('categoryModalTitle')) $('categoryModalTitle').textContent = 'Add new category';
    if (categoryModal) categoryModal.show();
  }

  function openEditCategory(id) {
    const c = categories.find(x => x.id === id);
    if (!c) return;
    if ($('categoryModalForm')) $('categoryModalForm').reset();
    $('categoryEditId').value = c.id;
    $('categoryEditName').value = c.name;
    editingCategoryImageUrl = c.image_url || '';
    if ($('categoryEditImageUrl')) $('categoryEditImageUrl').value = editingCategoryImageUrl;
    if ($('categoryEditImageFile')) $('categoryEditImageFile').value = '';
    if ($('categoryEditDiscount')) {
      const disc = (categoryDiscountsMap[c.id] !== undefined) ? categoryDiscountsMap[c.id] : (c.discount_percent ?? 0);
      $('categoryEditDiscount').value = disc;
    }
    updateCategoryImagePreview(editingCategoryImageUrl, editingCategoryImageUrl ? 'Current Saved Image' : '');
    populateCategoryEditParent(c.id, c.parent_id || '');
    if ($('categoryModalTitle')) $('categoryModalTitle').textContent = c.parent_id ? 'Edit sub-category' : 'Edit main category & image';
    if (categoryModal) categoryModal.show();
  }

  $('categoryModalForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('saveCategoryModalBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

    try {
      const name = $('categoryEditName').value.trim();
      if (!name) throw new Error('Category name is required.');
      const parentId = $('categoryEditParent').value || null;
      const file = $('categoryEditImageFile')?.files?.[0];
      const onlineUrl = $('categoryEditImageUrl')?.value?.trim();
      const catDiscount = $('categoryEditDiscount') ? Math.max(0, Math.min(100, Number($('categoryEditDiscount').value || 0))) : 0;

      let finalImg = null;
      if (file) {
        finalImg = await uploadImage(file);
      } else if (onlineUrl) {
        finalImg = onlineUrl;
      } else if (editingCategoryImageUrl) {
        finalImg = editingCategoryImageUrl;
      }

      const id = $('categoryEditId').value;
      const payload = {
        name,
        parent_id: parentId,
        discount_percent: catDiscount,
        image_url: finalImg || null
      };

      let result;
      if (id) {
        result = await db.from('categories').update(payload).eq('id', id);
      } else {
        payload.sort_order = categories.length + 1;
        payload.is_active = true;
        result = await db.from('categories').insert(payload);
      }

      if (result.error) {
        let changed = false;
        if (result.error.message && result.error.message.includes('image_url')) {
          delete payload.image_url;
          changed = true;
        }
        if (result.error.message && result.error.message.includes('discount_percent')) {
          delete payload.discount_percent;
          changed = true;
        }
        if (changed) {
          result = id ? await db.from('categories').update(payload).eq('id', id) : await db.from('categories').insert(payload);
          if (result.error) throw result.error;
          notice('Category saved! Notice: Run migration-slots-and-category-discounts.sql in Supabase to enable all columns.', true);
        } else {
          throw result.error;
        }
      } else {
        notice(id ? 'Category updated.' : 'Category added.');
      }

      if (categoryModal) categoryModal.hide();
      await loadAll();
    } catch (err) {
      notice(err.message || 'Could not save category.', true);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save category'; }
    }
  });

  if ($('categoryEditImageUrl')) {
    $('categoryEditImageUrl').addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (val) {
        if ($('categoryEditImageFile')) $('categoryEditImageFile').value = '';
        updateCategoryImagePreview(val, 'Online Image Link');
      } else {
        updateCategoryImagePreview('');
      }
    });
  }

  if ($('categoryEditImageFile')) {
    $('categoryEditImageFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        if ($('categoryEditImageUrl')) $('categoryEditImageUrl').value = '';
        const localUrl = URL.createObjectURL(file);
        updateCategoryImagePreview(localUrl, `Uploaded: ${file.name}`);
      } else {
        const urlVal = $('categoryEditImageUrl') ? $('categoryEditImageUrl').value.trim() : '';
        updateCategoryImagePreview(urlVal, urlVal ? 'Online Image Link' : '');
      }
    });
  }

  if ($('removeCategoryImageBtn')) {
    $('removeCategoryImageBtn').addEventListener('click', () => {
      if ($('categoryEditImageUrl')) $('categoryEditImageUrl').value = '';
      if ($('categoryEditImageFile')) $('categoryEditImageFile').value = '';
      editingCategoryImageUrl = '';
      updateCategoryImagePreview('');
    });
  }

  if ($('openAddCategoryBtn')) {
    $('openAddCategoryBtn').addEventListener('click', openAddCategory);
  }

  $('categoryForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('categoryName').value.trim();
    if (!name) return;
    const parentId = $('categoryParent')?.value || null;
    const payload = {
      name,
      sort_order: categories.length + 1,
      is_active: true
    };
    if (parentId) payload.parent_id = parentId;

    const { error } = await db.from('categories').insert(payload);
    if (error) {
      notice(error.message, true);
    } else {
      $('categoryName').value = '';
      if ($('categoryParent')) $('categoryParent').value = '';
      await loadAll();
      notice('Category added.');
    }
  });

  async function deleteCategory(id) {
    const c = categories.find(x => x.id === id);
    if (menu.some(x => x.category_id === id)) {
      return notice('Move or delete this category’s menu items before deleting the category.', true);
    }
    const hasSubs = categories.some(x => x.parent_id === id);
    if (hasSubs) {
      return notice('This main category has sub-categories. Please delete or reassign its sub-categories first.', true);
    }
    if (!confirm(`Delete category "${c.name}"?`)) return;
    const { error } = await db.from('categories').delete().eq('id', id);
    if (error) notice(error.message, true);
    else { await loadAll(); notice('Category deleted.'); }
  }

  /* ========================================================
     BULK ADD ITEMS FUNCTIONALITY
  ======================================================== */
  function updateBulkRowCount() {
    const tbody = $('bulkTableBody');
    if (!tbody) return;
    const rows = tbody.querySelectorAll('tr');
    if ($('bulkRowCount')) $('bulkRowCount').textContent = rows.length;
    rows.forEach((r, idx) => {
      const idxCell = r.querySelector('.bulk-row-idx');
      if (idxCell) idxCell.textContent = idx + 1;
    });
  }

  function addBulkRow(data = {}) {
    const tbody = $('bulkTableBody');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="text-center bulk-row-idx text-muted small fw-bold"></td>
      <td>
        <input class="form-control form-control-sm bulk-name" placeholder="e.g. Paneer Butter Masala" value="${escapeHtml(data.name || '')}" required>
      </td>
      <td>
        <input class="form-control form-control-sm bulk-price" type="number" min="0" step="0.01" placeholder="₹ Full" value="${data.price !== undefined ? data.price : ''}" required>
      </td>
      <td>
        <input class="form-control form-control-sm bulk-half" type="number" min="0" step="0.01" placeholder="₹ Half (opt)" value="${data.halfPrice !== undefined ? data.halfPrice : ''}">
      </td>
      <td>
        <input class="form-control form-control-sm bulk-desc" placeholder="Optional description" value="${escapeHtml(data.desc || '')}">
      </td>
      <td class="text-center">
        <select class="form-select form-select-sm bulk-avail">
          <option value="true" ${data.avail !== false ? 'selected' : ''}>Yes</option>
          <option value="false" ${data.avail === false ? 'selected' : ''}>No</option>
        </select>
      </td>
      <td class="text-center">
        <button type="button" class="btn btn-sm btn-outline-danger py-0 px-2 bulk-del-btn" title="Delete row"><i class="bi bi-x-lg"></i></button>
      </td>
    `;
    tr.querySelector('.bulk-del-btn').addEventListener('click', () => {
      tr.remove();
      updateBulkRowCount();
    });
    tbody.appendChild(tr);
    updateBulkRowCount();
  }

  function addBulkRows(n = 3) {
    for (let i = 0; i < n; i++) addBulkRow();
  }

  function clearBulkRows() {
    const tbody = $('bulkTableBody');
    if (tbody) tbody.innerHTML = '';
    updateBulkRowCount();
  }

  function openBulkModal() {
    clearBulkRows();
    addBulkRows(4);
    if ($('quickPasteArea')) $('quickPasteArea').classList.add('d-none');
    if ($('quickPasteText')) $('quickPasteText').value = '';
    renderCategories();
    if (bulkModal) bulkModal.show();
  }

  function toggleQuickPaste() {
    const qp = $('quickPasteArea');
    if (!qp) return;
    qp.classList.toggle('d-none');
    if (!qp.classList.contains('d-none')) {
      $('quickPasteText')?.focus();
    }
  }

  function applyQuickPaste() {
    const text = ($('quickPasteText')?.value || '').trim();
    if (!text) return notice('Please paste text first.', true);

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (!lines.length) return notice('No rows detected in pasted text.', true);

    clearBulkRows();
    let count = 0;
    lines.forEach(line => {
      let parts = [];
      if (line.includes('\t')) parts = line.split('\t');
      else if (line.includes('|')) parts = line.split('|');
      else if (line.includes(',')) parts = line.split(',');
      else parts = [line];

      parts = parts.map(p => p.trim());
      const name = parts[0] || '';
      const fullPrice = parts[1] || '';
      const halfPrice = parts[2] || '';
      const desc = parts[3] || '';

      if (name) {
        addBulkRow({
          name: name,
          price: fullPrice.replace(/[^0-9.]/g, ''),
          halfPrice: halfPrice.replace(/[^0-9.]/g, ''),
          desc: desc
        });
        count++;
      }
    });

    notice(`Populated ${count} dish rows from text.`);
    $('quickPasteArea')?.classList.add('d-none');
  }

  async function saveBulkItems() {
    const catId = $('bulkCategorySelect')?.value;
    if (!catId) return notice('Please select a target category first.', true);

    const rows = document.querySelectorAll('#bulkTableBody tr');
    const items = [];

    rows.forEach(r => {
      const name = r.querySelector('.bulk-name')?.value.trim();
      const priceVal = r.querySelector('.bulk-price')?.value.trim();
      const halfVal = r.querySelector('.bulk-half')?.value.trim();
      const desc = r.querySelector('.bulk-desc')?.value.trim() || null;
      const avail = r.querySelector('.bulk-avail')?.value === 'true';

      if (name && priceVal !== '' && !isNaN(Number(priceVal)) && Number(priceVal) >= 0) {
        const item = {
          name: name,
          category_id: catId,
          price: Number(priceVal),
          food_type: 'Veg',
          is_available: avail,
          is_bestseller: false,
          description: desc,
          image_url: null
        };
        if (halfVal !== '' && !isNaN(Number(halfVal)) && Number(halfVal) > 0) {
          item.half_price = Number(halfVal);
        }
        items.push(item);
      }
    });

    if (!items.length) {
      return notice('Please enter at least one valid dish with a name and price.', true);
    }

    const btn = $('saveBulkBtn');
    btn.disabled = true;
    btn.textContent = `Saving ${items.length} items...`;

    try {
      let result = await db.from('menu_items').insert(items);
      if (result.error && result.error.message && result.error.message.includes('half_price')) {
        const fallbackItems = items.map(it => {
          const c = { ...it };
          delete c.half_price;
          return c;
        });
        result = await db.from('menu_items').insert(fallbackItems);
        if (result.error) throw result.error;
        notice(`Saved ${items.length} dishes! Notice: Run migration-half-price-discount-qr.sql to enable Half Price.`, true);
      } else if (result.error) {
        throw result.error;
      } else {
        notice(`Successfully added ${items.length} dishes to menu!`);
      }

      if (bulkModal) bulkModal.hide();
      await loadAll();
    } catch (err) {
      notice(err.message || 'Could not save bulk items.', true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save All Items';
    }
  }

  // Hook up bulk modal events
  if ($('bulkAddBtn')) $('bulkAddBtn').addEventListener('click', openBulkModal);
  if ($('addBulkRowBtn')) $('addBulkRowBtn').addEventListener('click', () => addBulkRow());
  if ($('addBulk5RowsBtn')) $('addBulk5RowsBtn').addEventListener('click', () => addBulkRows(5));
  if ($('clearBulkRowsBtn')) $('clearBulkRowsBtn').addEventListener('click', clearBulkRows);
  if ($('toggleQuickPasteBtn')) $('toggleQuickPasteBtn').addEventListener('click', toggleQuickPaste);
  if ($('applyQuickPasteBtn')) $('applyQuickPasteBtn').addEventListener('click', applyQuickPaste);
  if ($('saveBulkBtn')) $('saveBulkBtn').addEventListener('click', saveBulkItems);

  // Settings form
  $('settingsForm').addEventListener('submit', async e => {
    e.preventDefault();

    // Ensure currently visible slot inputs are saved to state
    const container = $('timeSlotsContainer');
    if (container) {
      const activeSlots = getSlotsForDay(activeConfigDay);
      container.querySelectorAll('.slot-row').forEach((row, i) => {
        const start = row.querySelector('.slot-start-input')?.value;
        const end = row.querySelector('.slot-end-input')?.value;
        if (start && end && activeSlots[i]) {
          activeSlots[i].start = start;
          activeSlots[i].end = end;
        }
      });
    }

    // Auto-generate hours summary if empty
    let hours = $('settingHours').value.trim();
    if (!hours && currentDaySlots.all && currentDaySlots.all.length) {
      hours = 'Daily · ' + currentDaySlots.all.map(s => `${formatTime12(s.start)} – ${formatTime12(s.end)}`).join(', ');
      $('settingHours').value = hours;
    }

    const firstSlot = (currentDaySlots.all && currentDaySlots.all[0]) || { start: '10:30', end: '15:00' };
    const lastSlot = (currentDaySlots.all && currentDaySlots.all[currentDaySlots.all.length - 1]) || firstSlot;

    const payload = {
      id: 1,
      restaurant_name: $('settingName').value.trim(),
      whatsapp_number: $('settingWhatsapp').value.replace(/\D/g, ''),
      contact_phone: $('settingPhone').value.trim(),
      opening_hours: $('settingHours').value.trim(),
      address: $('settingAddress').value.trim(),
      delivery_charge: Number($('settingDelivery').value || 0),
      minimum_order_amount: Number($('settingMinimum').value || 0),
      discount_percent: $('settingDiscount') ? Number($('settingDiscount').value || 0) : 0,
      discount_note: $('settingDiscountNote') ? $('settingDiscountNote').value.trim() : '',
      upi_id: $('settingUpiId') ? $('settingUpiId').value.trim() : '',
      qr_image_url: $('settingQrImage') ? $('settingQrImage').value.trim() : '',
      store_status: $('settingStoreStatus') ? $('settingStoreStatus').value : 'auto',
      open_time: firstSlot.start,
      close_time: lastSlot.end,
      closed_message: $('settingClosedMessage') ? $('settingClosedMessage').value.trim() : '',
      time_slots: JSON.stringify(currentDaySlots.all || []),
      day_slots: JSON.stringify(currentDaySlots || {}),
      category_discounts: JSON.stringify(categoryDiscountsMap || {})
    };

    if (!/^\d{10,15}$/.test(payload.whatsapp_number)) return notice('Enter WhatsApp number with country code, e.g. 919876543210.', true);

    let { error } = await db.from('restaurant_settings').upsert(payload);
    if (error && error.message && (
      error.message.includes('time_slots') || 
      error.message.includes('day_slots') || 
      error.message.includes('category_discounts') || 
      error.message.includes('discount') || 
      error.message.includes('upi') || 
      error.message.includes('qr') || 
      error.message.includes('open_time') || 
      error.message.includes('close_time') || 
      error.message.includes('store_status') || 
      error.message.includes('closed_message')
    )) {
      const fallbackPayload = {
        id: 1,
        restaurant_name: payload.restaurant_name,
        whatsapp_number: payload.whatsapp_number,
        contact_phone: payload.contact_phone,
        opening_hours: payload.opening_hours,
        address: payload.address,
        delivery_charge: payload.delivery_charge,
        minimum_order_amount: payload.minimum_order_amount
      };
      const retry = await db.from('restaurant_settings').upsert(fallbackPayload);
      if (retry.error) return notice(retry.error.message, true);
      notice('Core settings saved! Run migration-slots-and-category-discounts.sql in Supabase to enable slot-wise timings and category discounts.', true);
      await loadAll();
      return;
    }

    // Persist individual category discounts to categories table
    const catUpdates = Object.entries(categoryDiscountsMap).map(([id, dVal]) =>
      db.from('categories').update({ discount_percent: Number(dVal || 0) }).eq('id', id)
    );
    await Promise.allSettled(catUpdates);

    if (error) notice(error.message, true); else { await loadAll(); notice('Restaurant settings, time slots, and category discounts saved.'); }
  });

  // Slot timing buttons
  const dayGroup = $('daySelectorGroup');
  if (dayGroup) {
    dayGroup.querySelectorAll('button[data-day]').forEach(btn => {
      btn.addEventListener('click', () => {
        dayGroup.querySelectorAll('button[data-day]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeConfigDay = btn.dataset.day;
        renderTimeSlots();
      });
    });
  }
  if ($('addSlotBtn')) $('addSlotBtn').addEventListener('click', addTimeSlot);
  if ($('copyToAllDaysBtn')) $('copyToAllDaysBtn').addEventListener('click', copySlotsToAllDays);

  // Category discount table preset buttons
  if ($('presetSabjiChinese10Btn')) $('presetSabjiChinese10Btn').addEventListener('click', applySabjiChinesePreset);
  if ($('clearCategoryDiscountsBtn')) $('clearCategoryDiscountsBtn').addEventListener('click', clearAllCategoryDiscounts);

  // Manage menu filter and search event listeners
  if ($('adminMenuSearch')) $('adminMenuSearch').addEventListener('input', renderMenuTable);
  if ($('adminCategoryFilter')) $('adminCategoryFilter').addEventListener('change', renderMenuTable);
  if ($('adminSortFilter')) $('adminSortFilter').addEventListener('change', renderMenuTable);
  if ($('adminResetFilterBtn')) $('adminResetFilterBtn').addEventListener('click', resetFilters);

  $('addItemBtn').addEventListener('click', openAdd);
  $('logoutBtn').addEventListener('click', async () => {
    localStorage.removeItem('admin_session_expiry');
    await db.auth.signOut();
    location.href = 'login.html';
  });
  $('sidebarToggle').addEventListener('click', () => $('adminSidebar').classList.toggle('show'));
  document.querySelectorAll('.sidebar-link').forEach(l => l.addEventListener('click', () => $('adminSidebar').classList.remove('show')));

  (async () => {
    if (await requireAdmin()) {
      await loadAll();
      db.channel('admin-menu-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, loadAll)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, loadAll)
        .subscribe();
    }
  })();
})();
