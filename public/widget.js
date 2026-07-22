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

    // Inject Responsive CSS Styles (Pre-load iframe with visibility: hidden to prevent iOS WebKit throttling)
    const styleId = 'abbla-widget-styles';
    if (!document.getElementById(styleId)) {
      const styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.textContent = `
        #abbla-widget-launcher {
          position: fixed;
          bottom: 20px;
          ${isRight ? 'right: 20px;' : 'left: 20px;'}
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background-color: ${primaryColor};
          box-shadow: 0 4px 16px rgba(0,0,0,0.24);
          cursor: pointer;
          z-index: 999998;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s ease, opacity 0.2s ease;
          -webkit-tap-highlight-color: transparent;
        }

        #abbla-widget-launcher:hover {
          transform: scale(1.05);
        }

        #abbla-widget-iframe {
          position: fixed;
          bottom: 90px;
          ${isRight ? 'right: 20px;' : 'left: 20px;'}
          width: 380px;
          max-width: calc(100vw - 40px);
          height: 600px;
          max-height: calc(100vh - 120px);
          max-height: calc(100dvh - 120px);
          border: none;
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          z-index: 999999;
          visibility: hidden;
          opacity: 0;
          pointer-events: none;
          transform: translateY(12px) scale(0.96);
          background: transparent;
          overflow: hidden;
          transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.2s;
        }

        #abbla-widget-iframe.abbla-widget-open {
          visibility: visible !important;
          opacity: 1 !important;
          pointer-events: auto !important;
          transform: translateY(0) scale(1) !important;
        }

        @media (max-width: 640px) {
          #abbla-widget-iframe {
            position: fixed !important;
            top: 0 !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            height: 100dvh !important;
            max-width: 100% !important;
            max-height: 100% !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
        }
      `;
      document.head.appendChild(styleEl);
    }

    // Launcher Button
    const launcher = document.createElement('div');
    launcher.id = 'abbla-widget-launcher';

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

    document.body.appendChild(launcher);
    document.body.appendChild(iframe);

    let isOpen = false;

    function toggleWidget(openState) {
      isOpen = typeof openState === 'boolean' ? openState : !isOpen;
      const isMobile = window.innerWidth <= 640;

      if (isOpen) {
        iframe.classList.add('abbla-widget-open');
      } else {
        iframe.classList.remove('abbla-widget-open');
      }

      document.getElementById('abbla-icon-chat').style.display = isOpen ? 'none' : 'block';
      document.getElementById('abbla-icon-close').style.display = isOpen ? 'block' : 'none';

      // On mobile, hide launcher when widget is open for zero overlap
      if (isMobile) {
        launcher.style.display = isOpen ? 'none' : 'flex';
        document.body.style.overflow = isOpen ? 'hidden' : '';
      } else {
        launcher.style.display = 'flex';
        document.body.style.overflow = '';
      }

      // Send instant message to iframe on open so it re-triggers immediate fetch and layout paint
      if (isOpen && iframe.contentWindow) {
        try {
          iframe.contentWindow.postMessage({ type: 'ABBLA_WIDGET_OPENED' }, '*');
        } catch (e) {
          // ignore cross-origin error if any
        }
      }
    }

    launcher.addEventListener('click', () => toggleWidget());

    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'ABBLA_WIDGET_CLOSE') {
        toggleWidget(false);
      }
    });

    // Handle resize/orientation changes
    window.addEventListener('resize', () => {
      if (isOpen) {
        const isMobile = window.innerWidth <= 640;
        launcher.style.display = isMobile ? 'none' : 'flex';
      }
    });
  }
})();
