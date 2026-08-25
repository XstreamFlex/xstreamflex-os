/**
 * XMail Client SDK for Xsites, EZsites & XMG Ecosystem (PHP Edition)
 * Seamlessly captures lead signups, order completions, XMG events, and ecosystem identity sync.
 */

(function () {
  'use strict';

  const currentScript = document.currentScript || (function () {
    const scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  const SITE_KEY = currentScript ? (currentScript.getAttribute('data-site-key') || currentScript.getAttribute('data-ecosystem-key') || currentScript.getAttribute('data-xmg-key')) : null;
  const API_ENDPOINT = currentScript ? currentScript.getAttribute('data-api-url') || currentScript.src.replace('/sdk/xmail.js', '/api/ingest.php') : '/api/ingest.php';
  const ECOSYSTEM_ENDPOINT = API_ENDPOINT.replace('/ingest.php', '/ecosystem.php');

  window.XMail = {
    siteKey: SITE_KEY,
    endpoint: API_ENDPOINT,
    ecosystemEndpoint: ECOSYSTEM_ENDPOINT,

    /**
     * Sends an event to XMail Autoresponder
     */
    track: function (eventType, payload) {
      if (!this.siteKey) {
        console.error('[XMail SDK] Missing site API key. Set data-site-key or data-ecosystem-key on script tag.');
        return Promise.reject('Missing site key');
      }

      if (!payload || !payload.email) {
        console.error('[XMail SDK] Event payload must contain an "email" field.');
        return Promise.reject('Missing email');
      }

      const bodyData = Object.assign({}, payload, {
        event_type: eventType
      });

      return fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Site-Key': this.siteKey,
          'X-Ecosystem-Key': this.siteKey,
          'X-XMG-Key': this.siteKey
        },
        body: JSON.stringify(bodyData)
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          console.log('[XMail SDK] Event tracked successfully:', data);
          return data;
        })
        .catch(function (err) {
          console.error('[XMail SDK] Tracking failed:', err);
          throw err;
        });
    },

    /**
     * Track XMG specific media/marketing event
     */
    trackXMG: function (eventType, payload) {
      const xmgEventType = eventType.startsWith('xmg.') ? eventType : ('xmg.' + eventType);
      return this.track(xmgEventType, payload);
    },

    /**
     * Resolves the full Ecosystem Identity (site, connected emails, active sequences)
     */
    getIdentity: function () {
      if (!this.siteKey) return Promise.reject('Missing site key');
      const url = this.ecosystemEndpoint + '?action=identity&key=' + encodeURIComponent(this.siteKey);
      return fetch(url)
        .then(function (res) { return res.json(); })
        .then(function (data) { return data.ecosystemIdentity; });
    },

    /**
     * Automatically binds to HTML forms with data-xmail-event attributes
     */
    initFormListener: function () {
      const self = this;
      document.addEventListener('submit', function (e) {
        const form = e.target;
        const eventType = form.getAttribute('data-xmail-event') || 'lead.signup';

        const emailInput = form.querySelector('input[type="email"], input[name="email"], input[name="email_address"]');
        if (!emailInput || !emailInput.value) return;

        const firstNameInput = form.querySelector('input[name="first_name"], input[name="fname"], input[name="name"]');
        const lastNameInput = form.querySelector('input[name="last_name"], input[name="lname"]');
        const phoneInput = form.querySelector('input[type="tel"], input[name="phone"]');

        const payload = {
          email: emailInput.value.trim(),
          first_name: firstNameInput ? firstNameInput.value.trim() : '',
          last_name: lastNameInput ? lastNameInput.value.trim() : '',
          phone: phoneInput ? phoneInput.value.trim() : ''
        };

        self.track(eventType, payload);
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { window.XMail.initFormListener(); });
  } else {
    window.XMail.initFormListener();
  }
})();
