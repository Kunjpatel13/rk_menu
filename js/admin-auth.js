(() => {
  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');
  const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

  function showMessage(msg, isWarning = false) {
    if (!errorEl) return;
    errorEl.className = isWarning ? 'alert alert-warning' : 'alert alert-danger';
    errorEl.innerHTML = isWarning ? `<i class="bi bi-clock-history me-2"></i>${msg}` : msg;
    errorEl.classList.remove('d-none');
  }

  // Check URL query parameters for session expiration notice
  const params = new URLSearchParams(window.location.search);
  if (params.get('expired')) {
    showMessage('Your session expired after 30 minutes of inactivity. Please sign in again.', true);
  }

  if (!window.db) {
    showMessage('Configure Supabase URL and anon key in js/config.js first.');
    return;
  }

  // Auto-redirect if an active, unexpired session exists
  db.auth.getSession().then(async ({ data }) => {
    if (data && data.session) {
      const expiry = localStorage.getItem('admin_session_expiry');
      const isExpired = !expiry || Date.now() > Number(expiry);
      if (!isExpired) {
        localStorage.setItem('admin_session_expiry', String(Date.now() + SESSION_TIMEOUT_MS));
        location.href = 'index.html';
      } else {
        localStorage.removeItem('admin_session_expiry');
        await db.auth.signOut();
        showMessage('Your session expired after 30 minutes of inactivity. Please sign in again.', true);
      }
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    btn.disabled = true;
    btn.textContent = 'Signing in...';
    if (errorEl) errorEl.classList.add('d-none');

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      showMessage(error.message);
      btn.disabled = false;
      btn.innerHTML = 'Sign in <i class="bi bi-arrow-right ms-2"></i>';
      return;
    }

    // Authenticated user created in Supabase Auth is authorized as an administrator
    // Attempt registration in admin_users for database RLS compatibility
    try {
      await db.from('admin_users').upsert({ user_id: data.user.id }, { onConflict: 'user_id' });
    } catch (err) {
      // Non-blocking
    }

    // Initialize 30-minute session expiry
    localStorage.setItem('admin_session_expiry', String(Date.now() + SESSION_TIMEOUT_MS));
    localStorage.setItem('admin_login_time', String(Date.now()));

    location.href = 'index.html';
  });
})();
