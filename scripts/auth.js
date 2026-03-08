/* =====================================================
   AUTH.JS — signup / login page
   Handles: tab switching, form validation,
   fake auth with localStorage persistence
   ===================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // ── Element references ─────────────────────────────────
  const tabLogin    = document.getElementById('tab-login');
  const tabSignup   = document.getElementById('tab-signup');
  const formLogin   = document.getElementById('form-login');
  const formSignup  = document.getElementById('form-signup');
  const goSignup    = document.getElementById('go-signup');
  const goLogin     = document.getElementById('go-login');
  const messageEl   = document.getElementById('auth-message');

  // Login form fields
  const loginEmail  = document.getElementById('login-email');
  const loginPw     = document.getElementById('login-password');
  const loginBtn    = document.getElementById('login-submit');

  // Signup form fields
  const signupFirst   = document.getElementById('signup-first');
  const signupLast    = document.getElementById('signup-last');
  const signupEmail   = document.getElementById('signup-email');
  const signupBadge   = document.getElementById('signup-badge');
  const signupDept    = document.getElementById('signup-dept');
  const signupPw      = document.getElementById('signup-password');
  const signupConfirm = document.getElementById('signup-confirm');
  const termsAgree    = document.getElementById('terms-agree');
  const signupBtn     = document.getElementById('signup-submit');

  // Password strength elements
  const pwStrengthBar   = document.getElementById('pw-strength-bar');
  const pwStrengthLabel = document.getElementById('pw-strength-label');


  // ── Redirect if already logged in ─────────────────────
  // If a user session already exists, skip straight to the dashboard
  const existingUser = localStorage.getItem('clearpath_currentUser');
  if (existingUser) {
    window.location.href = 'dashboard.html';
    return;
  }


  // ── Tab switching ──────────────────────────────────────

  function showTab(tab) {
    const isLogin = tab === 'login';
    tabLogin.classList.toggle('auth-tab--active', isLogin);
    tabSignup.classList.toggle('auth-tab--active', !isLogin);
    formLogin.classList.toggle('auth-form-wrap--hidden', !isLogin);
    formSignup.classList.toggle('auth-form-wrap--hidden', isLogin);
    clearMessage();
  }

  tabLogin.addEventListener('click', () => showTab('login'));
  tabSignup.addEventListener('click', () => showTab('signup'));

  // inline "switch to signup/login" buttons within the forms
  goSignup.addEventListener('click', () => showTab('signup'));
  goLogin.addEventListener('click', () => showTab('login'));


  // ── Password show/hide toggles ─────────────────────────
  document.querySelectorAll('.pw-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });


  // ── Password strength meter ────────────────────────────
  // Rates the password on a 0–4 scale and updates the colored bar

  function ratePassword(pw) {
    let score = 0;
    if (pw.length >= 8)  score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[!@#$%^&*]/.test(pw)) score++;
    return Math.min(score, 4);
  }

  const strengthColors = ['', '#e84545', '#f5d623', '#f5a623', '#3dd68c'];
  const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong'];

  signupPw.addEventListener('input', () => {
    const score = ratePassword(signupPw.value);
    const pct = signupPw.value.length === 0 ? 0 : (score / 4) * 100;
    pwStrengthBar.style.width  = `${pct}%`;
    pwStrengthBar.style.background = strengthColors[score] || '';
    pwStrengthLabel.textContent = signupPw.value.length ? strengthLabels[score] : '';
  });


  // ── Message helpers ────────────────────────────────────

  function showMessage(text, type = 'error') {
    messageEl.textContent = text;
    messageEl.className = `auth-message auth-message--${type}`;
  }

  function clearMessage() {
    messageEl.textContent = '';
    messageEl.className = 'auth-message';
  }


  // ── Login handler ──────────────────────────────────────

  loginBtn.addEventListener('click', () => {
    clearMessage();

    const email = loginEmail.value.trim();
    const pw    = loginPw.value;

    // Basic validation
    if (!email || !pw) {
      showMessage('Please enter your email and password.');
      return;
    }

    // Look up user in localStorage (registered via signup)
    const users = JSON.parse(localStorage.getItem('clearpath_users') || '[]');
    const match = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === pw
    );

    if (!match) {
      // Check the demo account so first-time users can log in without signing up
      if (email === 'demo@occo.ems' && pw === 'Demo1234!') {
        const demoUser = {
          firstName: 'James',
          lastName:  'Carter',
          email:     'demo@occo.ems',
          unit:      'Unit 14',
          department:'Chicago Fire Department EMS'
        };
        localStorage.setItem('clearpath_currentUser', JSON.stringify(demoUser));
        window.location.href = 'dashboard.html';
        return;
      }

      showMessage('Incorrect email or password.');
      return;
    }

    // Store session
    localStorage.setItem('clearpath_currentUser', JSON.stringify(match));
    window.location.href = 'dashboard.html';
  });

  // Allow pressing Enter in the password field to submit
  loginPw.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loginBtn.click();
  });


  // ── Signup handler ─────────────────────────────────────

  signupBtn.addEventListener('click', () => {
    clearMessage();

    const first  = signupFirst.value.trim();
    const last   = signupLast.value.trim();
    const email  = signupEmail.value.trim();
    const badge  = signupBadge.value.trim();
    const dept   = signupDept.value.trim();
    const pw     = signupPw.value;
    const conf   = signupConfirm.value;
    const agreed = termsAgree.checked;

    // Required field checks
    if (!first || !last || !email || !badge || !dept) {
      showMessage('Please fill in all required fields.');
      return;
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showMessage('Please enter a valid email address.');
      return;
    }

    if (pw.length < 8) {
      showMessage('Password must be at least 8 characters.');
      return;
    }

    if (pw !== conf) {
      showMessage('Passwords do not match.');
      return;
    }

    if (!agreed) {
      showMessage('You must agree to the Terms of Use to continue.');
      return;
    }

    // Check for duplicate email
    const users = JSON.parse(localStorage.getItem('clearpath_users') || '[]');
    if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
      showMessage('An account with this email already exists.');
      return;
    }

    // Save the new user
    const newUser = { firstName: first, lastName: last, email, password: pw, unit: badge, department: dept };
    users.push(newUser);
    localStorage.setItem('clearpath_users', JSON.stringify(users));

    // Auto-login after successful signup
    const sessionUser = { ...newUser };
    delete sessionUser.password; // don't store plain pw in session
    localStorage.setItem('clearpath_currentUser', JSON.stringify(sessionUser));

    showMessage('Account created! Taking you to your dashboard...', 'success');
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
  });

});
