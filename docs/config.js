/**
 * LESEDING CONNECT — CENTRAL CONFIGURATION
 * Edit this file to change branding, copy, team details and photos.
 * No other file needs to change for a rebrand.
 */
window.LESEDING_CONFIG = {
  // Paste the Apps Script production URL here (must end in /exec, never /dev).
  apiUrl: 'https://script.google.com/macros/s/AKfycbyfWbzD_dK6-DQxpsaizHztlBWYT2FE8swDXjSFYOV5ZONY8ZxuqfETgC14NQw0Vw-n/exec',

  brand: {
    projectName: 'Leseding AI Engine',
    tagline: 'Voice-first AI customer support',
    logo: 'assets/logo-placeholder.svg',          // TEMPORARY — replace with final logo (SVG or transparent PNG)
    logoAlt: 'Leseding AI Engine logo',
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    fontStylesheet: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
  },

  // TEMPORARY placeholder colours — NOT approved Leseding brand colours.
  theme: {
    '--brand-primary': '#101C2C',
    '--brand-secondary': '#2457C5',
    '--brand-accent': '#D5F36A',
    '--page-background': '#F5F7FA',
    '--surface-background': '#FFFFFF',
    '--text-primary': '#172033',
    '--text-muted': '#667085',
    '--border-colour': '#D9E0E8',
    '--button-text': '#FFFFFF',
    '--error-colour': '#B42318',
    '--card-radius': '16px',
    '--button-radius': '10px'
  },

  copy: {
    formTitle: 'Let’s connect.',
    formIntro: "Interested in what we're building? Leave your details and tell us how we can work together.",
    connectingLabel: "You're connecting with",
    genericMemberName: 'The Leseding team',
    detailsLabel: 'Your details',
    consentText: 'I agree Leseding AI Engine may use these details to contact me about this enquiry.',
    submitButton: 'Submit my details',
    submittingButton: 'Sending…',
    privacyNote: "We'll only use your details to follow up on your enquiry. Ask any team member if you'd like them corrected or removed.",
    successTitle: 'Thank you — we’ve got your details.',
    successMessage: 'A member of the Leseding team will be in touch soon.',
    anotherButton: 'Add another contact',
    networkError: "We couldn't reach our server. Your details are still here — check your connection and tap submit again.",
    serverError: 'Something went wrong on our side. Your details are still here — please try again in a moment.',
    rateLimited: 'Too many submissions from this page. Please reload the page and try again.'
  },

  // Must match INTERESTS in apps-script/Code.gs exactly.
  interests: [
    'Investment opportunities',
    'Business partnership',
    'Product demonstration / pilot',
    'Potential customer / organisation',
    'Technology collaboration',
    'General information',
    'Other'
  ],

  // `id` is what goes in the QR link (?member=id) — never change it after cards are printed.
  // Server-side attribution is checked against the Team tab in the sheet; keep IDs in sync.
  team: [
    { id: 'sylvain', name: 'Sylvain Kgosietsile Nalebomo', role: 'Founder & Project Lead', photo: 'assets/team/sylvain.png', active: true },
    { id: 'gorata',  name: 'Gorata Blair Kareng',          role: 'UX/UI Designer & PR', photo: 'assets/team/gorata.png',  active: true },
    { id: 'arabang', name: 'Arabang Benville Mothofela',   role: 'Full-Stack & AI Systems Design',          photo: 'assets/team/arabang.png', active: true }
  ]
};

// Apply theme immediately (before first paint) so colours never flash.
(function (c) {
  var root = document.documentElement;
  Object.keys(c.theme).forEach(function (k) { root.style.setProperty(k, c.theme[k]); });
  root.style.setProperty('--font-family', c.brand.fontFamily);
  if (c.brand.fontStylesheet) {
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = c.brand.fontStylesheet;
    document.head.appendChild(l);
  }
})(window.LESEDING_CONFIG);
