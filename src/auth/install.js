const ANDROID_TEXT = 'アプリのようにホーム画面から開けます。';
const IOS_TEXT =
  'Safari の共有ボタン（□に↑のアイコン）をタップし、「ホーム画面に追加」を選んでください。';
const INSTALLED_TEXT = 'ホーム画面に追加しました。ホーム画面のアイコンから開けます。';

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function isIos() {
  // iPadOS reports itself as a Mac, so check for touch support too.
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * Show how to add the app to the home screen: a button where the browser offers
 * an install prompt (Android Chrome), instructions on iPhone/iPad, nothing otherwise.
 */
export function mountInstallCard({ card, text, button }) {
  if (isStandalone()) return;

  if (isIos()) {
    text.textContent = IOS_TEXT;
    card.hidden = false;
    return;
  }

  let installPrompt = null;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    text.textContent = ANDROID_TEXT;
    button.hidden = false;
    card.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    text.textContent = INSTALLED_TEXT;
    button.hidden = true;
  });

  button.addEventListener('click', async () => {
    if (!installPrompt) return;
    button.disabled = true;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    button.disabled = false;
    if (outcome === 'accepted') {
      installPrompt = null;
      button.hidden = true;
    }
  });
}
