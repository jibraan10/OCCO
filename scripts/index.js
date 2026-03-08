/* =====================================================
   INDEX.JS — landing page interactions
   Handles: live unit counter, scroll reveal, mobile nav
   ===================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // ── Live unit counter in the hero stats ────────────────
  // Simulates the live network updating every few seconds
  const liveUnitsEl = document.getElementById('live-units');
  if (liveUnitsEl) {
    let count = 47;
    setInterval(() => {
      const delta = Math.floor(Math.random() * 5) - 2;
      count = Math.max(30, Math.min(65, count + delta));
      liveUnitsEl.textContent = count;
    }, 5000);
  }

  // ── Intersection Observer for scroll-reveal animations ─
  // Each element with data-reveal gets faded in as it enters viewport
  const revealEls = document.querySelectorAll(
    '.step-card, .feature-card, .stat-item'
  );

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          // stagger each card slightly
          entry.target.style.animationDelay = `${i * 0.07}s`;
          entry.target.classList.add('revealed');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );

  revealEls.forEach((el) => {
    // start invisible; CSS .revealed kicks in the animation
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    revealObserver.observe(el);
  });

  // ── Mobile nav hamburger ───────────────────────────────
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.querySelector('.nav-links');

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      navLinks.classList.toggle('nav-links--open');
    });
  }

  // ── Smooth active nav link highlight on scroll ─────────
  // Highlights nav links as the corresponding section is scrolled to
  const sections = document.querySelectorAll('section[id]');
  const navAnchors = document.querySelectorAll('.nav-links a[href^="#"]');

  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          navAnchors.forEach((a) => {
            a.classList.toggle(
              'nav-link--active',
              a.getAttribute('href') === `#${entry.target.id}`
            );
          });
        }
      });
    },
    { rootMargin: '-40% 0px -55% 0px' }
  );

  sections.forEach((s) => sectionObserver.observe(s));

});

// Tiny helper used by the IntersectionObserver callback above —
// set opacity/transform back to visible values
document.addEventListener('animationstart', (e) => {
  if (e.target.classList.contains('revealed')) {
    e.target.style.opacity = '1';
    e.target.style.transform = 'translateY(0)';
  }
});