/**
 * XSITES Products Ecosystem Sync Manifest & Runtime Engine
 * Automatically tracks, syncs, and renders dynamic product catalog listings and related product recommendations.
 */
(function(window) {
  window.XSITE_PRODUCT_MANIFEST = window.XSITE_PRODUCT_MANIFEST || [
    {
      id: "product-1",
      slug: "product-1.html",
      title: "Starter Growth Package",
      category: "Services",
      price: "$99",
      rating: "4.9/5",
      features: ["Full Core Setup", "Standard Support", "Mobile Responsive Layout"],
      description: "Everything you need to launch your core digital presence quickly.",
      featured: true
    },
    {
      id: "product-2",
      slug: "product-2.html",
      title: "Professional Business Suite",
      category: "Software & Tools",
      price: "$299",
      rating: "5.0/5",
      features: ["Advanced Multi-Page Ecosystem", "Priority 24/7 Support", "Stripe & XMAIL Automated Integrations"],
      description: "Complete turnkey business platform designed for rapidly growing brands.",
      featured: true
    },
    {
      id: "product-3",
      slug: "product-3.html",
      title: "Enterprise Custom Accelerator",
      category: "Enterprise",
      price: "$799",
      rating: "5.0/5",
      features: ["Unlimited Subpages", "Dedicated Solution Architect", "Custom White-Label Branding"],
      description: "Bespoke high-touch solution for scaling organizations.",
      featured: false
    }
  ];

  window.XSITES_PRODUCTS_ENGINE = {
    getAllProducts() {
      return window.XSITE_PRODUCT_MANIFEST;
    },
    addProduct(productObj) {
      if (!productObj) return;
      const id = productObj.id || `product-${Date.now()}`;
      const slug = productObj.slug || `${id}.html`;
      const prod = { ...productObj, id, slug };
      const existsIdx = window.XSITE_PRODUCT_MANIFEST.findIndex(p => p.id === id || p.slug === slug);
      if (existsIdx >= 0) {
        window.XSITE_PRODUCT_MANIFEST[existsIdx] = prod;
      } else {
        window.XSITE_PRODUCT_MANIFEST.unshift(prod);
      }
      // Auto-trigger XMAIL Sync & AI Order Confirmation Spawner
      this.syncWithXmail();
      this.spawnAiOrderConfirmation(prod);
      return prod;
    },
    async syncWithXmail() {
      try {
        const backendUrl = window.XSTREAM_BACKEND_URL || 'https://xsites-backend-worker.xstreamflex.workers.dev';
        const user = window.UnifiedAuth ? window.UnifiedAuth.getUser() : null;
        const res = await fetch(`${backendUrl}/api/xmail/products/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userEmail: user ? user.email : 'guest@xstreamflex.com',
            products: window.XSITE_PRODUCT_MANIFEST
          })
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.syncedProducts)) {
          window.XSITE_PRODUCT_MANIFEST = data.syncedProducts;
          if (document.getElementById('xsite-products-catalog-grid')) {
            this.renderProductCatalog('xsite-products-catalog-grid');
          }
        }
        return data;
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
    async spawnAiOrderConfirmation(productObj) {
      if (!productObj) return;
      try {
        const backendUrl = window.XSTREAM_BACKEND_URL || 'https://xsites-backend-worker.xstreamflex.workers.dev';
        const user = window.UnifiedAuth ? window.UnifiedAuth.getUser() : null;
        const res = await fetch(`${backendUrl}/api/xmail/order-confirmation/spawn`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userEmail: user ? user.email : 'guest@xstreamflex.com',
            product: productObj
          })
        });
        const data = await res.json();
        return data;
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
    getRelatedProducts(currentSlug, limit = 3) {
      return window.XSITE_PRODUCT_MANIFEST.filter(p => p.slug !== currentSlug).slice(0, limit);
    },
    async syncPaymentCatalog(provider, credentials = {}) {
      try {
        const backendUrl = window.XSTREAM_BACKEND_URL || 'https://xsites-backend-worker.xstreamflex.workers.dev';
        const res = await fetch(`${backendUrl}/payment/sync-catalog`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            stripeApiKey: credentials.stripeApiKey,
            paypalClientId: credentials.paypalClientId,
            paypalSecret: credentials.paypalSecret,
            products: window.XSITE_PRODUCT_MANIFEST
          })
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.syncedProducts)) {
          window.XSITE_PRODUCT_MANIFEST = data.syncedProducts;
          if (document.getElementById('xsite-products-catalog-grid')) {
            this.renderProductCatalog('xsite-products-catalog-grid');
          }
        }
        return data;
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
    renderProductCatalog(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;
      
      const products = window.XSITE_PRODUCT_MANIFEST;
      container.innerHTML = products.map(prod => `
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between group">
          <div>
            <div class="flex items-center justify-between gap-2 text-xs font-semibold mb-3">
              <span class="px-2.5 py-1 bg-sky-500/10 text-sky-400 rounded-full font-mono">${prod.category || 'Product'}</span>
              <span class="text-amber-400 font-mono font-bold">★ ${prod.rating || '5.0'}</span>
            </div>
            <h3 class="text-xl font-bold text-slate-900 dark:text-white group-hover:text-sky-400 transition mb-2">
              <a href="${prod.buyUrl || prod.slug}" target="${prod.buyUrl ? '_blank' : '_self'}">${prod.title}</a>
            </h3>
            <p class="text-sm text-slate-600 dark:text-slate-400 mb-4 line-clamp-2">${prod.description || ''}</p>
            <ul class="space-y-1 text-xs text-slate-500 dark:text-slate-400 mb-6">
              ${(prod.features || []).map(f => `<li class="flex items-center gap-1.5"><span class="text-emerald-400">✓</span> ${f}</li>`).join('')}
            </ul>
          </div>
          <div class="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
            <span class="text-2xl font-black text-slate-900 dark:text-white">${prod.price || '$0.00'}</span>
            <a href="${prod.buyUrl || prod.slug}" target="${prod.buyUrl ? '_blank' : '_self'}" class="px-4 py-2 bg-gradient-to-r from-sky-500 to-indigo-500 text-white text-xs font-bold rounded-xl hover:opacity-90 transition">
              ${prod.buyUrl ? '💳 Buy Now' : 'View Product &rarr;'}
            </a>
          </div>
        </div>
      `).join('');
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('xsite-products-catalog-grid')) {
      window.XSITES_PRODUCTS_ENGINE.renderProductCatalog('xsite-products-catalog-grid');
    }
  });
})(window);
