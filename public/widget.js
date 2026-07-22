(function () {
  const script = document.currentScript;
  const widgetKey = script ? script.getAttribute('data-widget-id') : null;
  if (!widgetKey) return;

  const scriptSrc = script.src;
  const baseUrl = scriptSrc.substring(0, scriptSrc.lastIndexOf('/'));

  // Get or create visitor token
  let visitorToken = localStorage.getItem('abbla_widget_vtoken');
  if (!visitorToken) {
    visitorToken = 'vt_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    localStorage.setItem('abbla_widget_vtoken', visitorToken);
  }

  // Fetch widget config
  fetch(`${baseUrl}/api/widget/${widgetKey}/config`)
    .then((res) => res.json())
    .then((config) => {
      if (!config || !config.is_active) return;
      initWidget(config);
    })
    .catch((err) => console.error('Widget load error:', err));

  function initWidget(config) {
    const isRight = config.position !== 'bottom_left';
    const primaryColor = config.primary_color || '#0F172A';

    // Launcher Button
    const launcher = document.createElement('div');
    launcher.id = 'abbla-widget-launcher';
    launcher.style.cssText = `
      position: fixed;
      bottom: 20px;
      ${isRight ? 'right: 20px;' : 'left: 20px;'}
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background-color: ${primaryColor};
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      cursor: pointer;
      z-index: 999998;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s ease;
    `;

    launcher.innerHTML = `
      <svg id="abbla-icon-chat" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      <svg id="abbla-icon-close" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;

    // Iframe Container
    const iframe = document.createElement('iframe');
    iframe.id = 'abbla-widget-iframe';
    const iframeUrl = new URL(`${baseUrl}/widget/${widgetKey}`);
    iframeUrl.searchParams.set('visitorToken', visitorToken);
    iframeUrl.searchParams.set('pageUrl', window.location.href);
    iframe.src = iframeUrl.toString();

    iframe.style.cssText = `
      position: fixed;
      bottom: 90px;
      ${isRight ? 'right: 20px;' : 'left: 20px;'}
      width: 380px;
      max-width: calc(100vw - 40px);
      height: 600px;
      max-height: calc(100vh - 120px);
      border: none;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.16);
      z-index: 999999;
      display: none;
      background: transparent;
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(iframe);

    let isOpen = false;
    launcher.addEventListener('click', () => {
      isOpen = !isOpen;
      iframe.style.display = isOpen ? 'block' : 'none';
      document.getElementById('abbla-icon-chat').style.display = isOpen ? 'none' : 'block';
      document.getElementById('abbla-icon-close').style.display = isOpen ? 'block' : 'none';
    });

    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'ABBLA_WIDGET_CLOSE') {
        isOpen = false;
        iframe.style.display = 'none';
        document.getElementById('abbla-icon-chat').style.display = 'block';
        document.getElementById('abbla-icon-close').style.display = 'none';
      }
    });
  }
})();
