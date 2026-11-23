const navigation = document.querySelector('.shop-navigation');
const toggle = navigation.querySelector('.shop-menu-toggle');
const menu = document.getElementById('shop-menu');
const activity = new URLSearchParams(location.search).get('type') === 'activity';
const path = location.pathname === '/shop/history/' ? '/shop/history/' : '/shop/';
const current = path === '/shop/history/' && activity ? path + '?type=activity' : path;

menu.querySelector(`a[href="${current}"]`)?.setAttribute('aria-current', 'page');
navigation.dataset.ready = '';

function closeMenu(event) {
  if (toggle.getAttribute('aria-expanded') !== 'true') return;
  toggle.setAttribute('aria-expanded', 'false');
  if (event?.key === 'Escape') toggle.focus();
}

toggle.addEventListener('click', () => {
  toggle.setAttribute('aria-expanded', String(toggle.getAttribute('aria-expanded') !== 'true'));
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeMenu(event);
});
for (const eventType of ['pointerdown', 'focusin']) {
  document.addEventListener(eventType, event => {
    if (!navigation.contains(event.target)) closeMenu();
  });
}
window.addEventListener('pageshow', event => {
  if (event.persisted) closeMenu();
});
