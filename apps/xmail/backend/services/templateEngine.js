/**
 * Template Engine for personalizing email subjects & HTML bodies.
 * Replaces placeholders like {{first_name}}, {{last_name}}, {{email}}, {{unsubscribe_url}}, etc.
 */

function renderTemplate(templateStr, data = {}) {
  if (!templateStr) return '';

  return templateStr.replace(/\{\{\s*([a-zA-Z0-9_\.]+)\s*\}\}/g, (match, key) => {
    const keys = key.split('.');
    let value = data;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        value = null;
        break;
      }
    }

    return value !== null && value !== undefined ? String(value) : '';
  });
}

/**
 * Injects Open Tracking pixel and Link Click Tracking into HTML body
 */
function injectTracking(htmlBody, trackingToken, appUrl) {
  if (!htmlBody) return '';

  const openPixelUrl = `${appUrl}/t/o/${trackingToken}.png`;
  const trackingPixel = `<img src="${openPixelUrl}" width="1" height="1" style="display:none;" alt="" />`;

  // Inject tracking pixel before </body> or at the end
  let trackedHtml = htmlBody;
  if (trackedHtml.includes('</body>')) {
    trackedHtml = trackedHtml.replace('</body>', `${trackingPixel}</body>`);
  } else {
    trackedHtml += trackingPixel;
  }

  // Rewrite links for click tracking: href="http..." -> href="http://appUrl/t/c/trackingToken?url=http..."
  trackedHtml = trackedHtml.replace(/href=["'](https?:\/\/[^"']+)["']/gi, (match, originalUrl) => {
    if (originalUrl.includes('/t/c/') || originalUrl.includes('/unsubscribe')) {
      return match; // Don't double rewrite
    }
    const encodedUrl = encodeURIComponent(originalUrl);
    const clickTrackUrl = `${appUrl}/t/c/${trackingToken}?url=${encodedUrl}`;
    return `href="${clickTrackUrl}"`;
  });

  return trackedHtml;
}

module.exports = {
  renderTemplate,
  injectTracking
};
