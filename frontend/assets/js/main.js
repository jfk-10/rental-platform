(() => {
  const existingLoader = document.querySelector('[data-page-loader]');
  const loader = existingLoader || document.createElement('div');

  if (!existingLoader) {
    loader.className = 'page-loader';
    loader.setAttribute('data-page-loader', '');
    loader.setAttribute('aria-hidden', 'true');
    loader.innerHTML = '<div class="page-loader__spinner"></div>';
    document.body.prepend(loader);
  }

  let hidden = false;
  const hideLoader = () => {
    if (hidden) return;
    hidden = true;
    loader.setAttribute('hidden', 'hidden');
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    hideLoader();
  } else {
    document.addEventListener('DOMContentLoaded', hideLoader, { once: true });
    window.addEventListener('load', hideLoader, { once: true });
  }

  window.setTimeout(hideLoader, 2500);

  const prefetched = new Set();
  const addPrefetch = (href) => {
    if (!href || prefetched.has(href)) return;
    prefetched.add(href);
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = href;
    link.as = 'document';
    document.head.append(link);
  };

  document.querySelectorAll('a[href]').forEach((anchor) => {
    anchor.addEventListener('mouseenter', () => {
      const url = new URL(anchor.href, window.location.origin);
      if (url.origin === window.location.origin) addPrefetch(url.pathname + url.search);
    }, { once: true });
  });
})();
