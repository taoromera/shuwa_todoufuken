import { authClient } from './auth-client.js';

const NAV_LINKS = [
  ['/', '復習'],
  ['/deck', '単語帳'],
  ['/library', 'ライブラリ'],
  ['/account', 'アカウント'],
];

export function bindLogoutButton(button) {
  button.addEventListener('click', async () => {
    button.disabled = true;
    await authClient.signOut().catch((error) => console.error(error));
    window.location.assign('/login');
  });
}

function isCurrent(href) {
  const path = window.location.pathname;
  return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
}

/** Insert the shared navigation bar at the top of the page (signed-in pages only). */
export function mountAppHeader() {
  const header = document.createElement('header');
  header.className = 'app-bar';
  const inner = document.createElement('div');
  inner.className = 'app-bar-inner';

  const brand = document.createElement('a');
  brand.className = 'app-bar-brand';
  brand.href = '/';
  brand.textContent = '手話単語帳';

  const nav = document.createElement('nav');
  nav.className = 'app-bar-nav';
  nav.setAttribute('aria-label', 'メインメニュー');
  for (const [href, label] of NAV_LINKS) {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = label;
    if (isCurrent(href)) link.setAttribute('aria-current', 'page');
    nav.append(link);
  }

  inner.append(brand, nav);
  header.append(inner);
  document.body.prepend(header);
}

export async function getCurrentUser() {
  const { data } = await authClient.getSession();
  return data?.user ?? null;
}
