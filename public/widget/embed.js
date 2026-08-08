// ponytail: minimal embed launcher script for booking widget
(function () {
  const script = document.currentScript;
  if (!script) return;

  const slug = script.getAttribute('data-slug') || 'agenda';
  const targetId = script.getAttribute('data-target') || 'abbla-booking-widget';
  
  const scriptSrc = script.src;
  const baseUrl = scriptSrc.substring(0, scriptSrc.indexOf('/widget/'));

  function init() {
    let container = document.getElementById(targetId);
    if (!container) {
      container = document.createElement('div');
      container.id = targetId;
      if (script.parentNode) {
        script.parentNode.insertBefore(container, script);
      }
    }

    if (!container) return;

    const iframe = document.createElement('iframe');
    iframe.src = `${baseUrl}/book/${encodeURIComponent(slug)}?embed=true`;
    iframe.style.width = '100%';
    iframe.style.height = '700px';
    iframe.style.minHeight = '500px';
    iframe.style.border = 'none';
    iframe.style.borderRadius = '16px';
    iframe.style.overflow = 'hidden';
    iframe.setAttribute('allow', 'payment');

    container.appendChild(iframe);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
