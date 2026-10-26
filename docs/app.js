(function () {
  'use strict';

  var C = window.LESEDING_CONFIG;
  var $ = function (id) { return document.getElementById(id); };
  var FIELDS = ['fullName', 'organisation', 'email', 'phone', 'interest', 'message', 'consent'];

  // ---------- Resolve member from the QR link ----------
  var params = new URLSearchParams(location.search);
  var memberParam = (params.get('member') || '').trim().toLowerCase();
  var member = C.team.filter(function (m) { return m.id === memberParam && m.active !== false; })[0] || null;

  // ---------- Render branding + copy ----------
  $('logo').src = C.brand.logo;
  $('logo').alt = C.brand.logoAlt;
  $('logo').onerror = function () { this.remove(); };
  $('projectName').textContent = C.brand.projectName;
  $('tagline').textContent = C.brand.tagline;
  $('formTitle').textContent = C.copy.formTitle;
  $('formIntro').textContent = C.copy.formIntro;
  $('connectingLabel').textContent = C.copy.connectingLabel;
  $('detailsLabel').textContent = C.copy.detailsLabel;
  $('consentText').textContent = C.copy.consentText;
  $('privacyNote').textContent = C.copy.privacyNote;
  $('successTitle').textContent = C.copy.successTitle;
  $('successMessage').textContent = C.copy.successMessage;
  $('anotherBtn').textContent = C.copy.anotherButton;
  setButton(false);

  // ---------- "You're connecting with" ----------
  var displayName = member ? member.name : C.copy.genericMemberName;
  $('memberName').textContent = displayName;
  $('memberProject').textContent = C.brand.projectName;
  $('memberRole').textContent = member ? member.role : '';
  $('memberRole').hidden = !member;
  $('memberInitials').textContent = initials(member ? member.name : C.brand.projectName);
  if (member && member.photo) {
    var img = $('memberPhoto');
    img.alt = 'Profile photo of ' + member.name;
    img.onload = function () { img.hidden = false; $('memberInitials').hidden = true; };
    img.onerror = function () { img.remove(); };
    img.src = member.photo;
  }

  // ---------- Interest options ----------
  var opts = $('interestOptions');
  C.interests.forEach(function (label, i) {
    var l = document.createElement('label');
    l.className = 'option';
    var r = document.createElement('input');
    r.type = 'radio'; r.name = 'interest'; r.value = label; r.id = 'interest-' + i; r.required = true;
    l.appendChild(r);
    l.appendChild(document.createTextNode(label));
    opts.appendChild(l);
  });

  // ---------- Visit + token ----------
  var tokenPromise = null;

  function startVisit() {
    tokenPromise = whenVisible().then(function () {
      return fetch(C.apiUrl + '?action=visit&member=' + encodeURIComponent(memberParam), { method: 'GET', cache: 'no-store' });
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (!res || !res.ok || !res.token) throw new Error('visit_failed');
      return res.token;
    });
    tokenPromise.catch(function () { tokenPromise = null; }); // retry on submit
    return tokenPromise;
  }

  // Only count a visit when a real browser shows the page (skips prerender & most preview bots).
  function whenVisible() {
    return new Promise(function (resolve, reject) {
      if (navigator.webdriver) return reject(new Error('automation'));
      if (document.visibilityState === 'visible') return resolve();
      document.addEventListener('visibilitychange', function h() {
        if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', h); resolve(); }
      });
    });
  }

  if (!/PASTE_DEPLOYMENT_ID/.test(C.apiUrl)) startVisit();

  // ---------- Form ----------
  var form = $('leadForm');
  var submissionId = newId();
  var busy = false;

  $('message').addEventListener('input', function () { $('messageCount').textContent = this.value.length; });
  form.addEventListener('input', function (e) {
    var f = e.target.closest('[data-field]');
    if (f && f.classList.contains('invalid')) setError(f.dataset.field, '');
  });
  form.addEventListener('change', function (e) {
    var f = e.target.closest('[data-field]');
    if (f && f.classList.contains('invalid')) setError(f.dataset.field, '');
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    hideStatus();

    var data = readForm();
    var errors = validate(data);
    FIELDS.forEach(function (k) { setError(k, errors[k] || ''); });
    var firstBad = FIELDS.filter(function (k) { return errors[k]; })[0];
    if (firstBad) { focusField(firstBad); return; }

    busy = true; setButton(true);
    submit(data, false).finally(function () { busy = false; setButton(false); });
  });

  function submit(data, isRetry) {
    var tp = tokenPromise || startVisit();
    return tp.then(function (token) {
      var payload = Object.assign({ action: 'submit', token: token, submissionId: submissionId, website: $('website').value }, data);
      return fetch(C.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // simple request → no CORS preflight
        body: JSON.stringify(payload)
      });
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res.ok) return showSuccess();
      if (res.error === 'session_expired' && !isRetry) { tokenPromise = null; return submit(data, true); }
      if (res.error === 'validation' && res.fields) {
        Object.keys(res.fields).forEach(function (k) { setError(k, res.fields[k]); });
        focusField(Object.keys(res.fields)[0]);
        return;
      }
      showStatus(res.error === 'rate_limited' ? C.copy.rateLimited : C.copy.serverError);
    }).catch(function () {
      showStatus(C.copy.networkError);
    });
  }

  function readForm() {
    var checked = form.querySelector('input[name=interest]:checked');
    return {
      fullName: $('fullName').value.trim(),
      organisation: $('organisation').value.trim(),
      email: $('email').value.trim(),
      phone: $('phone').value.trim(),
      interest: checked ? checked.value : '',
      message: $('message').value.trim(),
      consent: $('consent').checked
    };
  }

  function validate(d) {
    var e = {};
    if (!d.fullName) e.fullName = 'Please enter your full name.';
    if (!d.email) e.email = 'Please enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) e.email = 'Please enter a valid email address.';
    if (d.phone && !/^[+()\d\s.-]{5,}$/.test(d.phone)) e.phone = 'Please enter a valid phone number.';
    if (!d.interest) e.interest = 'Please choose what you are interested in.';
    if (!d.consent) e.consent = 'Please confirm we may contact you.';
    return e;
  }

  function setError(field, msg) {
    var wrap = form.querySelector('[data-field="' + field + '"]');
    var el = $(field + '-err');
    if (!wrap || !el) return;
    el.textContent = msg;
    wrap.classList.toggle('invalid', !!msg);
    var input = field === 'interest' ? null : $(field);
    if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  function focusField(field) {
    var el = field === 'interest' ? form.querySelector('input[name=interest]') : $(field);
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }

  function showStatus(msg) { var s = $('formStatus'); s.textContent = msg; s.hidden = false; }
  function hideStatus() { $('formStatus').hidden = true; }

  function setButton(loading) {
    var b = $('submitBtn');
    b.disabled = loading;
    b.classList.toggle('loading', loading);
    b.querySelector('.btn-label').textContent = loading ? C.copy.submittingButton : C.copy.submitButton;
  }

  function showSuccess() {
    $('formView').hidden = true;
    var s = $('successView');
    s.hidden = false;
    window.scrollTo(0, 0);
    s.focus();
  }

  $('anotherBtn').addEventListener('click', function () {
    form.reset();
    FIELDS.forEach(function (k) { setError(k, ''); });
    $('messageCount').textContent = '0';
    submissionId = newId();
    $('successView').hidden = true;
    $('formView').hidden = false;
    window.scrollTo(0, 0);
    $('fullName').focus();
  });

  // ---------- Helpers ----------
  function initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
  }

  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var a = new Uint8Array(16); crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
})();
