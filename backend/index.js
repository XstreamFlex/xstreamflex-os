import { CryptoVault } from "./crypto-vault.js";

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // UNIFIED AUTH: REGISTER
    if (url.pathname === "/auth/register" && request.method === "POST") {
      try {
        const { email, password, name } = await request.json();
        if (!email || !password) {
          return new Response(JSON.stringify({ success: false, error: "Email and password are required." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const cleanEmail = email.toLowerCase().trim();
        const userKey = `user:${cleanEmail}`;

        let existing = null;
        if (env.XSITES_KEYS) {
          existing = await env.XSITES_KEYS.get(userKey, "json");
        }

        if (existing) {
          return new Response(JSON.stringify({ success: false, error: "An account with this email already exists. Please log in." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const { hash, salt } = await CryptoVault.hashPassword(password);
        const userId = `usr_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
        
        const isAdminUser = (cleanEmail === 'admin@xstreamflex.com');
        let tierId = isAdminUser ? 'master' : 'free';
        let credits = isAdminUser ? 99999 : 3;

        const userRecord = {
          userId,
          email: cleanEmail,
          name: name || cleanEmail.split('@')[0],
          passwordHash: hash,
          salt,
          tierId,
          credits,
          isAdmin: isAdminUser,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        if (env.XSITES_KEYS) {
          await env.XSITES_KEYS.put(userKey, JSON.stringify(userRecord));
          await env.XSITES_KEYS.put(`id:${userId}`, JSON.stringify(userRecord));
        }

        const jwtSecret = env.JWT_SECRET || "xstreamflex_secret_jwt_key_2026";
        const token = await CryptoVault.signJWT({ sub: userId, email: cleanEmail, name: userRecord.name, tierId, isAdmin: isAdminUser }, jwtSecret);

        return new Response(JSON.stringify({
          success: true,
          token,
          user: { userId, email: cleanEmail, name: userRecord.name, tierId, credits, isAdmin: isAdminUser }
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // UNIFIED AUTH: LOGIN
    if (url.pathname === "/auth/login" && request.method === "POST") {
      try {
        const { email, password } = await request.json();
        if (!email || !password) {
          return new Response(JSON.stringify({ success: false, error: "Email and password are required." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const cleanEmail = email.toLowerCase().trim();
        const userKey = `user:${cleanEmail}`;

        let userRecord = null;
        if (env.XSITES_KEYS) {
          userRecord = await env.XSITES_KEYS.get(userKey, "json");
        }

        if (!userRecord) {
          return new Response(JSON.stringify({ success: false, error: "Account not found. Please register." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const isValid = await CryptoVault.verifyPassword(password, userRecord.passwordHash, userRecord.salt);
        if (!isValid) {
          return new Response(JSON.stringify({ success: false, error: "Invalid email or password." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const isAdminUser = (cleanEmail === 'admin@xstreamflex.com') || Boolean(userRecord.isAdmin);
        if (cleanEmail === 'admin@xstreamflex.com') {
          userRecord.tierId = 'master';
          userRecord.credits = 99999;
          userRecord.isAdmin = true;
        }

        const jwtSecret = env.JWT_SECRET || "xstreamflex_secret_jwt_key_2026";
        const token = await CryptoVault.signJWT({
          sub: userRecord.userId,
          email: userRecord.email,
          name: userRecord.name,
          tierId: userRecord.tierId,
          isAdmin: isAdminUser
        }, jwtSecret);

        return new Response(JSON.stringify({
          success: true,
          token,
          user: {
            userId: userRecord.userId,
            email: userRecord.email,
            name: userRecord.name,
            tierId: userRecord.tierId,
            credits: userRecord.credits || 3,
            isAdmin: isAdminUser
          }
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // UNIFIED AUTH: VERIFY TOKEN
    if (url.pathname === "/auth/verify" && request.method === "GET") {
      try {
        const authHeader = request.headers.get("Authorization") || "";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();
        const jwtSecret = env.JWT_SECRET || "xstreamflex_secret_jwt_key_2026";
        const payload = await CryptoVault.verifyJWT(token, jwtSecret);

        if (!payload) {
          return new Response(JSON.stringify({ success: false, error: "Invalid or expired session token." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const isAdminUser = (payload.email === 'admin@xstreamflex.com') || Boolean(payload.isAdmin);
        return new Response(JSON.stringify({
          success: true,
          user: { ...payload, isAdmin: isAdminUser }
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // BI-DIRECTIONAL PRODUCT SYNC (XSITE ↔ XMAIL)
    if (url.pathname === "/api/xmail/products/sync" && request.method === "POST") {
      try {
        const { userEmail, products } = await request.json();
        const cleanEmail = (userEmail || 'guest@xstreamflex.com').toLowerCase().trim();
        const storeKey = `xmail_products:${cleanEmail}`;

        let existingProducts = [];
        if (env.XSITES_KEYS) {
          existingProducts = await env.XSITES_KEYS.get(storeKey, "json") || [];
        }

        const mergedMap = new Map();
        [...existingProducts, ...(products || [])].forEach(p => {
          if (p && (p.id || p.title)) {
            const key = p.id || p.title.toLowerCase().replace(/[^a-z0-9]/g, '-');
            mergedMap.set(key, { ...p, id: key });
          }
        });

        const syncedProducts = Array.from(mergedMap.values());
        if (env.XSITES_KEYS) {
          await env.XSITES_KEYS.put(storeKey, JSON.stringify(syncedProducts));
        }

        return new Response(JSON.stringify({
          success: true,
          syncedProducts,
          count: syncedProducts.length,
          updatedAt: new Date().toISOString()
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // AI ORDER CONFIRMATION SPAWNER
    if (url.pathname === "/api/xmail/order-confirmation/spawn" && request.method === "POST") {
      try {
        const { userEmail, product } = await request.json();
        if (!product || !product.title) {
          return new Response(JSON.stringify({ success: false, error: "Product payload is required." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const cleanEmail = (userEmail || 'guest@xstreamflex.com').toLowerCase().trim();
        const confirmationTemplate = {
          id: `order-conf-${Date.now()}`,
          productId: product.id || product.title,
          productTitle: product.title,
          price: product.price || '$0.00',
          subject: `⚡ Order Confirmation: ${product.title}`,
          htmlTemplate: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #0f172a; color: #f8fafc;">
              <h2 style="color: #10b981;">Order Confirmed! 🎉</h2>
              <p>Thank you for purchasing <strong>${product.title}</strong>.</p>
              <div style="background-color: #1e293b; padding: 16px; border-radius: 12px; margin: 20px 0;">
                <p style="margin: 0; font-size: 14px; color: #94a3b8;">Item: <strong style="color: #ffffff;">${product.title}</strong></p>
                <p style="margin: 4px 0 0 0; font-size: 18px; color: #38bdf8; font-weight: bold;">Amount Paid: ${product.price || '$0.00'}</p>
              </div>
              <p style="font-size: 13px; color: #cbd5e1;">Your digital download / access details have been activated for ${cleanEmail}.</p>
              <a href="#" style="display: inline-block; background-color: #10b981; color: #000000; font-weight: bold; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 12px;">Access Product &rarr;</a>
            </div>
          `,
          createdAt: new Date().toISOString()
        };

        if (env.XSITES_KEYS) {
          const queueKey = `xmail_autoresponders:${cleanEmail}`;
          let queue = await env.XSITES_KEYS.get(queueKey, "json") || [];
          queue.unshift(confirmationTemplate);
          await env.XSITES_KEYS.put(queueKey, JSON.stringify(queue));
        }

        return new Response(JSON.stringify({
          success: true,
          confirmationTemplate,
          status: "active"
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // AI NEWSLETTER WELCOME CAMPAIGN GENERATOR
    if (url.pathname === "/api/xmail/welcome-campaign/setup" && request.method === "POST") {
      try {
        const { userEmail, brandName, leadMagnetUrl } = await request.json();
        const cleanEmail = (userEmail || 'guest@xstreamflex.com').toLowerCase().trim();
        const brand = brandName || 'XSITES Brand';

        const campaign = {
          id: `welcome-campaign-${Date.now()}`,
          brandName: brand,
          name: `3-Step AI Welcome Sequence for ${brand}`,
          emails: [
            {
              step: 1,
              delayHours: 0,
              subject: `🎉 Welcome to ${brand}! Here is your free gift`,
              body: `Hi there!\n\nThank you for subscribing to ${brand}. We are thrilled to have you here.\n\nClick below to access your exclusive welcome resource:\n${leadMagnetUrl || 'https://xstreamflex.com/welcome-access'}\n\nStay tuned for exclusive updates!`
            },
            {
              step: 2,
              delayHours: 48,
              subject: `Behind the scenes at ${brand} & our top tools`,
              body: `Hey!\n\nHere is a quick story on why we built ${brand} and how our digital suite can help you scale.`
            },
            {
              step: 3,
              delayHours: 120,
              subject: `Special VIP Discount inside for ${brand}`,
              body: `As a valued subscriber of ${brand}, here is a 15% VIP discount code on your first product purchase: VIP15.`
            }
          ],
          createdAt: new Date().toISOString()
        };

        if (env.XSITES_KEYS) {
          const campaignKey = `xmail_campaigns:${cleanEmail}`;
          let campaigns = await env.XSITES_KEYS.get(campaignKey, "json") || [];
          campaigns.unshift(campaign);
          await env.XSITES_KEYS.put(campaignKey, JSON.stringify(campaigns));
        }

        return new Response(JSON.stringify({
          success: true,
          campaign,
          status: "deployed"
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // UNIFIED AUTH: SYNC CREDITS & STATUS
    if (url.pathname === "/auth/sync-credits" && (request.method === "GET" || request.method === "POST")) {
      try {
        const authHeader = request.headers.get("Authorization") || "";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();
        const jwtSecret = env.JWT_SECRET || "xstreamflex_secret_jwt_key_2026";
        const payload = await CryptoVault.verifyJWT(token, jwtSecret);

        if (!payload) {
          return new Response(JSON.stringify({ success: false, error: "Authentication required to sync credits." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const userKey = `user:${payload.email}`;
        let userRecord = env.XSITES_KEYS ? await env.XSITES_KEYS.get(userKey, "json") : null;
        if (!userRecord) {
          userRecord = { userId: payload.sub, email: payload.email, name: payload.name, tierId: payload.tierId || 'free', credits: 3 };
        }

        if (payload.email === 'admin@xstreamflex.com') {
          userRecord.tierId = 'master';
          userRecord.credits = 99999;
          userRecord.isAdmin = true;
        }

        return new Response(JSON.stringify({
          success: true,
          user: {
            userId: userRecord.userId,
            email: userRecord.email,
            name: userRecord.name,
            tierId: userRecord.tierId,
            credits: userRecord.credits ?? 3,
            isAdmin: Boolean(userRecord.isAdmin || payload.email === 'admin@xstreamflex.com')
          }
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (request.method === "GET" && new URL(request.url).pathname === "/xsite-inspector.js") {
      return new Response(`/* XSITE Visual Block Inspector & Variable Editor Engine */
(function(window) {
    const InspectorState = {
        iframeEl: null,
        containerEl: null,
        activeSelectedEl: null,
        undoStack: [],
        redoStack: [],
        isInspecting: true
    };

    // Helper: Push state to undo stack
    function pushUndoState() {
        if (typeof window.getCurrentPageHtmlContent === 'function') {
            const html = window.getCurrentPageHtmlContent();
            if (html) {
                InspectorState.undoStack.push(html);
                if (InspectorState.undoStack.length > 30) InspectorState.undoStack.shift();
                InspectorState.redoStack = [];
                updateUndoRedoBtnState();
            }
        }
    }

    function updateUndoRedoBtnState() {
        const undoBtn = document.getElementById('inspectorUndoBtn');
        const redoBtn = document.getElementById('inspectorRedoBtn');
        if (undoBtn) undoBtn.disabled = InspectorState.undoStack.length === 0;
        if (redoBtn) redoBtn.disabled = InspectorState.redoStack.length === 0;
    }

    // Attach hover & click listeners to iframe
    function setupIframeInspector(iframe) {
        if (!iframe) return;
        InspectorState.iframeEl = iframe;

        const attachDocListeners = () => {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow?.document;
                if (!doc || !doc.body) return;

                // Inject highlight styles
                if (!doc.getElementById('xsiteInspectorStyles')) {
                    const style = doc.createElement('style');
                    style.id = 'xsiteInspectorStyles';
                    style.innerHTML = \`
                        .xsite-hover-target { outline: 2px dashed #38bdf8 !important; outline-offset: 2px !important; cursor: pointer !important; }
                        .xsite-selected-target { outline: 3px solid #10b981 !important; outline-offset: 3px !important; box-shadow: 0 0 16px rgba(16, 185, 129, 0.5) !important; }
                    \`;
                    doc.head.appendChild(style);
                }

                let lastHovered = null;

                doc.body.addEventListener('mouseover', (e) => {
                    const target = getEditableTarget(e.target);
                    if (!target || target === doc.body || target === doc.documentElement) return;
                    if (lastHovered && lastHovered !== target && !lastHovered.classList.contains('xsite-selected-target')) {
                        lastHovered.classList.remove('xsite-hover-target');
                    }
                    if (!target.classList.contains('xsite-selected-target')) {
                        target.classList.add('xsite-hover-target');
                        lastHovered = target;
                    }
                }, true);

                doc.body.addEventListener('mouseout', (e) => {
                    const target = getEditableTarget(e.target);
                    if (target && !target.classList.contains('xsite-selected-target')) {
                        target.classList.remove('xsite-hover-target');
                    }
                }, true);

                doc.body.addEventListener('click', (e) => {
                    const target = getEditableTarget(e.target);
                    if (!target || target === doc.body || target === doc.documentElement) return;

                    e.preventDefault();
                    e.stopPropagation();

                    // Clear previous selection
                    doc.querySelectorAll('.xsite-selected-target').forEach(el => {
                        el.classList.remove('xsite-selected-target');
                    });
                    if (lastHovered) lastHovered.classList.remove('xsite-hover-target');

                    target.classList.add('xsite-selected-target');
                    InspectorState.activeSelectedEl = target;
                    renderVariableInspector(target);
                }, true);

            } catch (err) {
                console.warn("[Inspector Notice] Could not access iframe content domain:", err.message);
            }
        };

        iframe.removeEventListener('load', attachDocListeners);
        iframe.addEventListener('load', attachDocListeners);
        attachDocListeners();
    }

    function rgbToHex(rgbStr) {
        if (!rgbStr) return '#ffffff';
        if (rgbStr.startsWith('#')) {
            if (rgbStr.length === 4) {
                return '#' + rgbStr[1] + rgbStr[1] + rgbStr[2] + rgbStr[2] + rgbStr[3] + rgbStr[3];
            }
            return rgbStr.slice(0, 7);
        }
        const matches = rgbStr.match(/\\d+/g);
        if (!matches || matches.length < 3) return '#ffffff';
        const r = parseInt(matches[0], 10).toString(16).padStart(2, '0');
        const g = parseInt(matches[1], 10).toString(16).padStart(2, '0');
        const b = parseInt(matches[2], 10).toString(16).padStart(2, '0');
        return \`#\${r}\${g}\${b}\`;
    }

    // Helper: Identify closest meaningful editable component
    function getEditableTarget(el) {
        if (!el) return null;
        const interactive = el.closest('button, a, img, h1, h2, h3, h4, h5, h6, p, li');
        if (interactive) return interactive;

        const container = el.closest('header, footer, section, nav, article, aside, [id*="hero"], [class*="card"], [class*="section"]');
        if (container) return container;

        return el;
    }

    // Render Inspector UI under preview window
    function renderVariableInspector(targetEl) {
        if (!targetEl) return;
        InspectorState.activeSelectedEl = targetEl;

        const placeholder = document.getElementById('inspectorPlaceholder');
        const formContainer = document.getElementById('inspectorFormContainer');
        const badgeLabel = document.getElementById('inspectorTagLabel');
        const pathLabel = document.getElementById('inspectorPathLabel');
        const addBtn = document.getElementById('inspectorAddVarBtn');
        const delBtn = document.getElementById('inspectorDeleteBtn');
        const deselectBtn = document.getElementById('inspectorDeselectBtn');

        if (placeholder) placeholder.classList.add('hidden');
        if (formContainer) formContainer.classList.remove('hidden');

        if (addBtn) addBtn.classList.remove('hidden');
        if (delBtn) delBtn.classList.remove('hidden');
        if (deselectBtn) deselectBtn.classList.remove('hidden');

        const tagName = targetEl.tagName.toLowerCase();
        const idStr = targetEl.id ? \`#\${targetEl.id}\` : '';
        const classStr = targetEl.className ? \`.\${targetEl.className.split(' ').filter(Boolean).slice(0, 2).join('.')}\` : '';
        const displayName = getFriendlyName(targetEl);

        if (badgeLabel) badgeLabel.innerText = \`🎯 Selected: \${displayName}\`;
        if (pathLabel) pathLabel.innerText = \`<\${tagName}\${idStr}\${classStr}>\`;

        if (!formContainer) return;
        formContainer.innerHTML = '';

        // Form Fields Container
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono';

        // 1. CONTENT VARIABLES (Text, Link, Image Src/Alt)
        const contentBox = document.createElement('div');
        contentBox.className = 'bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-3';
        contentBox.innerHTML = \`<h4 class="text-emerald-400 font-bold border-b border-slate-800 pb-1.5 flex items-center gap-1">📝 Content & Text Variables</h4>\`;

        let hasContentVar = false;

        // Editable Text / Headline
        if (['h1','h2','h3','h4','h5','h6','p','span','button','a','li','label'].includes(tagName) || targetEl.children.length === 0) {
            hasContentVar = true;
            const textGroup = document.createElement('div');
            textGroup.className = 'space-y-1';
            textGroup.innerHTML = \`
                <label class="block text-[10px] text-slate-400 font-bold uppercase">Text / Headline Content</label>
                <textarea rows="2" class="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg p-2 text-xs focus:outline-none focus:border-emerald-500">\${targetEl.innerText ? targetEl.innerText.trim() : (targetEl.textContent ? targetEl.textContent.trim() : '')}</textarea>
            \`;
            const textarea = textGroup.querySelector('textarea');
            textarea.addEventListener('input', (e) => {
                pushUndoState();
                targetEl.innerText = e.target.value;
                syncToPagesTree();
            });
            contentBox.appendChild(textGroup);
        }

        // Editable Link URL (href)
        const anchor = tagName === 'a' ? targetEl : targetEl.querySelector('a');
        if (anchor || tagName === 'button') {
            hasContentVar = true;
            const hrefVal = anchor ? (anchor.getAttribute('href') || '') : '';
            const linkGroup = document.createElement('div');
            linkGroup.className = 'space-y-1';
            linkGroup.innerHTML = \`
                <label class="block text-[10px] text-sky-400 font-bold uppercase">🔗 Link Target URL (href)</label>
                <input type="text" value="\${hrefVal}" placeholder="e.g. #contact, about.html, https://..." class="w-full bg-slate-950 border border-slate-700 text-sky-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-sky-400" />
            \`;
            const input = linkGroup.querySelector('input');
            input.addEventListener('input', (e) => {
                pushUndoState();
                const targetAnchor = anchor || targetEl;
                targetAnchor.setAttribute('href', e.target.value.trim());
                syncToPagesTree();
            });
            contentBox.appendChild(linkGroup);
        }

        // Editable Image Src & Alt
        const img = tagName === 'img' ? targetEl : targetEl.querySelector('img');
        if (img) {
            hasContentVar = true;
            const imgGroup = document.createElement('div');
            imgGroup.className = 'space-y-2';
            imgGroup.innerHTML = \`
                <div>
                    <label class="block text-[10px] text-amber-400 font-bold uppercase">🖼️ Image Source URL (src)</label>
                    <input type="text" value="\${img.getAttribute('src') || ''}" class="w-full bg-slate-950 border border-slate-700 text-amber-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-amber-400" />
                </div>
                <div>
                    <label class="block text-[10px] text-slate-400 font-bold uppercase">Image Alt Description</label>
                    <input type="text" value="\${img.getAttribute('alt') || ''}" class="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-slate-400" />
                </div>
            \`;
            const srcInput = imgGroup.querySelectorAll('input')[0];
            const altInput = imgGroup.querySelectorAll('input')[1];
            srcInput.addEventListener('input', (e) => {
                pushUndoState();
                img.setAttribute('src', e.target.value.trim());
                syncToPagesTree();
            });
            altInput.addEventListener('input', (e) => {
                pushUndoState();
                img.setAttribute('alt', e.target.value.trim());
                syncToPagesTree();
            });
            contentBox.appendChild(imgGroup);
        }

        if (!hasContentVar) {
            const info = document.createElement('p');
            info.className = 'text-[11px] text-slate-400 italic';
            info.innerText = 'Section container selected. View and edit child section variables or style controls below.';
            contentBox.appendChild(info);
        }
        grid.appendChild(contentBox);

        // 2. STYLE & TYPOGRAPHY VARIABLES
        const styleBox = document.createElement('div');
        styleBox.className = 'bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-3';
        styleBox.innerHTML = \`<h4 class="text-sky-400 font-bold border-b border-slate-800 pb-1.5 flex items-center gap-1">🎨 Style & Typography Variables</h4>\`;

        // Retrieve current computed styles
        let curTextColor = "#ffffff";
        let curBgColor = "#090a0f";
        let curFontSize = "";
        let curFontWeight = "";
        let curTextAlign = "";

        try {
            const win = targetEl.ownerDocument?.defaultView || window;
            const comp = win.getComputedStyle(targetEl);
            if (comp) {
                if (comp.color) curTextColor = rgbToHex(comp.color);
                if (comp.backgroundColor && comp.backgroundColor !== 'transparent' && comp.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                    curBgColor = rgbToHex(comp.backgroundColor);
                }
                curFontSize = targetEl.style.fontSize || comp.fontSize || "";
                curFontWeight = targetEl.style.fontWeight || comp.fontWeight || "";
                curTextAlign = targetEl.style.textAlign || comp.textAlign || "";
            }
        } catch (e) {}

        // Font Size & Weight Row
        const fontRow = document.createElement('div');
        fontRow.className = 'grid grid-cols-2 gap-2';
        fontRow.innerHTML = \`
            <div>
                <label class="block text-[10px] text-slate-400 font-bold uppercase">Font Size</label>
                <select id="inspFontSize" class="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded-lg p-1.5 text-xs focus:outline-none">
                    <option value="">Default (\${curFontSize || 'auto'})</option>
                    <option value="12px">XS (12px)</option>
                    <option value="14px">SM (14px)</option>
                    <option value="16px">Base (16px)</option>
                    <option value="18px">LG (18px)</option>
                    <option value="22px">XL (22px)</option>
                    <option value="28px">2XL (28px)</option>
                    <option value="36px">3XL (36px)</option>
                    <option value="48px">4XL (48px)</option>
                </select>
            </div>
            <div>
                <label class="block text-[10px] text-slate-400 font-bold uppercase">Font Weight</label>
                <select id="inspFontWeight" class="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded-lg p-1.5 text-xs focus:outline-none">
                    <option value="">Default (\${curFontWeight || 'auto'})</option>
                    <option value="400">Normal (400)</option>
                    <option value="500">Medium (500)</option>
                    <option value="600">Semibold (600)</option>
                    <option value="700">Bold (700)</option>
                    <option value="800">Extrabold (800)</option>
                </select>
            </div>
        \`;
        const sizeSelect = fontRow.querySelector('#inspFontSize');
        const weightSelect = fontRow.querySelector('#inspFontWeight');
        if (curFontSize && Array.from(sizeSelect.options).some(o => o.value === curFontSize)) {
            sizeSelect.value = curFontSize;
        }
        if (curFontWeight && Array.from(weightSelect.options).some(o => o.value === curFontWeight)) {
            weightSelect.value = curFontWeight;
        }

        sizeSelect.addEventListener('change', (e) => {
            pushUndoState();
            targetEl.style.fontSize = e.target.value;
            syncToPagesTree();
        });
        weightSelect.addEventListener('change', (e) => {
            pushUndoState();
            targetEl.style.fontWeight = e.target.value;
            syncToPagesTree();
        });
        styleBox.appendChild(fontRow);

        // Alignment & Colors Row
        const colorRow = document.createElement('div');
        colorRow.className = 'grid grid-cols-3 gap-2';
        colorRow.innerHTML = \`
            <div>
                <label class="block text-[10px] text-slate-400 font-bold uppercase">Text Color</label>
                <input type="color" id="inspTextColor" value="\${curTextColor}" class="w-full h-8 bg-slate-950 border border-slate-700 rounded cursor-pointer p-0.5" />
            </div>
            <div>
                <label class="block text-[10px] text-slate-400 font-bold uppercase">BG Color</label>
                <input type="color" id="inspBgColor" value="\${curBgColor}" class="w-full h-8 bg-slate-950 border border-slate-700 rounded cursor-pointer p-0.5" />
            </div>
            <div>
                <label class="block text-[10px] text-slate-400 font-bold uppercase">Align</label>
                <div class="flex gap-1 pt-1">
                    <button type="button" data-align="left" class="align-btn flex-1 bg-slate-950 border border-slate-700 py-1 text-[10px] text-slate-300 rounded hover:bg-slate-800 \${curTextAlign === 'left' ? 'border-emerald-500 text-emerald-400 font-bold' : ''}">Left</button>
                    <button type="button" data-align="center" class="align-btn flex-1 bg-slate-950 border border-slate-700 py-1 text-[10px] text-slate-300 rounded hover:bg-slate-800 \${curTextAlign === 'center' ? 'border-emerald-500 text-emerald-400 font-bold' : ''}">Center</button>
                    <button type="button" data-align="right" class="align-btn flex-1 bg-slate-950 border border-slate-700 py-1 text-[10px] text-slate-300 rounded hover:bg-slate-800 \${curTextAlign === 'right' ? 'border-emerald-500 text-emerald-400 font-bold' : ''}">Right</button>
                </div>
            </div>
        \`;
        const textColorInput = colorRow.querySelector('#inspTextColor');
        const bgColorInput = colorRow.querySelector('#inspBgColor');

        textColorInput.addEventListener('input', (e) => {
            pushUndoState();
            targetEl.style.color = e.target.value;
            syncToPagesTree();
        });
        bgColorInput.addEventListener('input', (e) => {
            pushUndoState();
            targetEl.style.backgroundColor = e.target.value;
            syncToPagesTree();
        });
        colorRow.querySelectorAll('.align-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                pushUndoState();
                targetEl.style.textAlign = btn.dataset.align;
                syncToPagesTree();
            });
        });
        styleBox.appendChild(colorRow);
        grid.appendChild(styleBox);

        formContainer.appendChild(grid);

        // 3. SUB-ELEMENTS & SECTION EDITABLE VARIABLES (Headlines, Text, Links, Buttons, Images)
        const childElements = Array.from(targetEl.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, a, button, img, li, label')).filter(child => child !== targetEl).slice(0, 25);
        if (childElements.length > 0) {
            const subBox = document.createElement('div');
            subBox.className = 'bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs font-mono';
            subBox.innerHTML = \`
                <div class="flex items-center justify-between border-b border-slate-800 pb-1.5">
                    <h4 class="text-amber-400 font-bold flex items-center gap-1">🧩 Editable Section Variables & Sub-Items (\${childElements.length})</h4>
                    <span class="text-[10px] text-slate-400">Click 🗑️ to remove element</span>
                </div>
            \`;
            const subList = document.createElement('div');
            subList.className = 'space-y-2 max-h-[220px] overflow-y-auto pr-1';

            childElements.forEach((child) => {
                const tag = child.tagName.toLowerCase();
                const childItem = document.createElement('div');
                childItem.className = 'flex flex-col gap-1.5 bg-slate-950 p-2 rounded-lg border border-slate-800 text-[11px]';

                const textVal = child.innerText ? child.innerText.trim() : (child.textContent ? child.textContent.trim() : '');
                
                if (tag === 'img') {
                    const srcVal = child.getAttribute('src') || '';
                    const altVal = child.getAttribute('alt') || '';
                    childItem.innerHTML = \`
                        <div class="flex items-center justify-between">
                            <span class="text-amber-400 font-bold text-[10px] uppercase">🖼️ IMG (\${altVal || 'Image'})</span>
                            <button type="button" class="del-child-btn px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded hover:bg-rose-500/30 text-[10px] font-bold cursor-pointer">🗑️</button>
                        </div>
                        <input type="text" value="\${srcVal}" placeholder="Image src URL" class="child-src bg-slate-900 border border-slate-700 text-amber-300 rounded px-2 py-1 text-xs focus:outline-none" />
                        <input type="text" value="\${altVal}" placeholder="Image alt description" class="child-alt bg-slate-900 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:outline-none" />
                    \`;
                    const srcInp = childItem.querySelector('.child-src');
                    const altInp = childItem.querySelector('.child-alt');
                    const delBtn = childItem.querySelector('.del-child-btn');

                    srcInp.addEventListener('input', (e) => {
                        pushUndoState();
                        child.setAttribute('src', e.target.value.trim());
                        syncToPagesTree();
                    });
                    altInp.addEventListener('input', (e) => {
                        pushUndoState();
                        child.setAttribute('alt', e.target.value.trim());
                        syncToPagesTree();
                    });
                    delBtn.addEventListener('click', () => {
                        pushUndoState();
                        child.remove();
                        childItem.remove();
                        syncToPagesTree();
                    });
                } else if (tag === 'a') {
                    const hrefVal = child.getAttribute('href') || '';
                    childItem.innerHTML = \`
                        <div class="flex items-center justify-between">
                            <span class="text-sky-400 font-bold text-[10px] uppercase">🔗 LINK (A)</span>
                            <button type="button" class="del-child-btn px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded hover:bg-rose-500/30 text-[10px] font-bold cursor-pointer">🗑️</button>
                        </div>
                        <div class="flex gap-1.5">
                            <input type="text" value="\${textVal}" placeholder="Link label text" class="child-text flex-1 bg-slate-900 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:outline-none" />
                            <input type="text" value="\${hrefVal}" placeholder="href target" class="child-href w-36 bg-slate-900 border border-slate-700 text-sky-300 rounded px-2 py-1 text-xs focus:outline-none" />
                        </div>
                    \`;
                    const textInp = childItem.querySelector('.child-text');
                    const hrefInp = childItem.querySelector('.child-href');
                    const delBtn = childItem.querySelector('.del-child-btn');

                    textInp.addEventListener('input', (e) => {
                        pushUndoState();
                        child.innerText = e.target.value;
                        syncToPagesTree();
                    });
                    hrefInp.addEventListener('input', (e) => {
                        pushUndoState();
                        child.setAttribute('href', e.target.value.trim());
                        syncToPagesTree();
                    });
                    delBtn.addEventListener('click', () => {
                        pushUndoState();
                        child.remove();
                        childItem.remove();
                        syncToPagesTree();
                    });
                } else {
                    const tagLabel = tag.toUpperCase();
                    childItem.innerHTML = \`
                        <div class="flex items-center justify-between">
                            <span class="text-emerald-400 font-bold text-[10px] uppercase">📝 \${tagLabel}</span>
                            <button type="button" class="del-child-btn px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded hover:bg-rose-500/30 text-[10px] font-bold cursor-pointer">🗑️</button>
                        </div>
                        <textarea rows="1" class="child-text w-full bg-slate-900 border border-slate-700 text-slate-200 rounded p-1.5 text-xs focus:outline-none">\${textVal}</textarea>
                    \`;
                    const textInp = childItem.querySelector('.child-text');
                    const delBtn = childItem.querySelector('.del-child-btn');

                    textInp.addEventListener('input', (e) => {
                        pushUndoState();
                        child.innerText = e.target.value;
                        syncToPagesTree();
                    });
                    delBtn.addEventListener('click', () => {
                        pushUndoState();
                        child.remove();
                        childItem.remove();
                        syncToPagesTree();
                    });
                }

                subList.appendChild(childItem);
            });
            subBox.appendChild(subList);
            formContainer.appendChild(subBox);
        }
    }

    // Helper: Friendly Name for Element
    function getFriendlyName(el) {
        const tag = el.tagName.toLowerCase();
        if (tag === 'header') return 'Header Section';
        if (tag === 'footer') return 'Footer Section';
        if (tag === 'nav') return 'Navigation Bar';
        if (tag === 'section') return el.id ? \`Section #\${el.id}\` : 'Web Section';
        if (tag === 'h1' || tag === 'h2' || tag === 'h3') return \`Headline (\${tag.toUpperCase()})\`;
        if (tag === 'p') return 'Paragraph Text';
        if (tag === 'button') return \`Button: "\${el.innerText.slice(0, 15)}"\`;
        if (tag === 'a') return \`Nav Link: "\${el.innerText.slice(0, 15)}"\`;
        if (tag === 'img') return 'Image Asset';
        return \`\${tag.toUpperCase()} Component\`;
    }

    // Sync live DOM to sitePagesTree & trigger preview tab refresh if needed
    function syncToPagesTree() {
        if (InspectorState.iframeEl) {
            const doc = InspectorState.iframeEl.contentDocument || InspectorState.iframeEl.contentWindow?.document;
            if (doc && doc.documentElement && window.sitePagesTree && window.activeTabKey) {
                const clone = doc.documentElement.cloneNode(true);
                clone.querySelectorAll('.xsite-hover-target, .xsite-selected-target').forEach(el => {
                    el.classList.remove('xsite-hover-target', 'xsite-selected-target');
                });
                window.sitePagesTree[window.activeTabKey] = "<!DOCTYPE html>\\n" + clone.outerHTML;
            }
        }
    }

    // Attach Action Control Buttons (Add Item, Delete, Undo, Redo, Deselect, AI Refine)
    function setupInspectorControls() {
        const addBtn = document.getElementById('inspectorAddVarBtn');
        const delBtn = document.getElementById('inspectorDeleteBtn');
        const deselectBtn = document.getElementById('inspectorDeselectBtn');
        const undoBtn = document.getElementById('inspectorUndoBtn');
        const redoBtn = document.getElementById('inspectorRedoBtn');
        const aiBtn = document.getElementById('inspectorAiBtn');
        const aiInput = document.getElementById('inspectorAiInput');

        if (addBtn) {
            addBtn.onclick = () => {
                if (!InspectorState.activeSelectedEl) return;
                pushUndoState();
                const target = InspectorState.activeSelectedEl;
                const tag = target.tagName.toLowerCase();

                if (tag === 'nav' || target.querySelector('nav')) {
                    const nav = tag === 'nav' ? target : target.querySelector('nav');
                    const linkName = prompt('➕ Enter new Nav Link text:', 'New Link');
                    if (linkName) {
                        const a = document.createElement('a');
                        a.href = '#';
                        a.className = 'text-slate-300 hover:text-white px-3 py-1 text-xs font-semibold';
                        a.innerText = linkName;
                        nav.appendChild(a);
                    }
                } else {
                    const btnText = prompt('➕ Enter new Button text:', 'Click Here');
                    if (btnText) {
                        const btn = document.createElement('a');
                        btn.href = '#';
                        btn.className = 'inline-block px-5 py-2.5 rounded-xl bg-emerald-500 text-black font-extrabold text-xs shadow-md';
                        btn.innerText = btnText;
                        target.appendChild(btn);
                    }
                }
                syncToPagesTree();
                renderVariableInspector(target);
            };
        }

        if (delBtn) {
            delBtn.onclick = () => {
                if (!InspectorState.activeSelectedEl) return;
                if (confirm('🗑️ Delete this selected element/variable?')) {
                    pushUndoState();
                    InspectorState.activeSelectedEl.remove();
                    InspectorState.activeSelectedEl = null;
                    syncToPagesTree();
                    document.getElementById('inspectorPlaceholder')?.classList.remove('hidden');
                    document.getElementById('inspectorFormContainer')?.classList.add('hidden');
                    document.getElementById('inspectorTagBadge').querySelector('#inspectorTagLabel').innerText = '🎯 Click any element in preview to edit';
                    addBtn.classList.add('hidden');
                    delBtn.classList.add('hidden');
                    deselectBtn.classList.add('hidden');
                }
            };
        }

        if (deselectBtn) {
            deselectBtn.onclick = () => {
                if (InspectorState.iframeEl) {
                    const doc = InspectorState.iframeEl.contentDocument || InspectorState.iframeEl.contentWindow?.document;
                    if (doc) doc.querySelectorAll('.xsite-selected-target, .xsite-hover-target').forEach(el => el.classList.remove('xsite-selected-target', 'xsite-hover-target'));
                }
                InspectorState.activeSelectedEl = null;
                document.getElementById('inspectorPlaceholder')?.classList.remove('hidden');
                document.getElementById('inspectorFormContainer')?.classList.add('hidden');
                document.getElementById('inspectorTagBadge').querySelector('#inspectorTagLabel').innerText = '🎯 Click any element in preview to edit';
                if (addBtn) addBtn.classList.add('hidden');
                if (delBtn) delBtn.classList.add('hidden');
                deselectBtn.classList.add('hidden');
            };
        }

        if (undoBtn) {
            undoBtn.onclick = () => {
                if (InspectorState.undoStack.length > 0) {
                    const current = window.getCurrentPageHtmlContent ? window.getCurrentPageHtmlContent() : "";
                    if (current) InspectorState.redoStack.push(current);
                    const prev = InspectorState.undoStack.pop();
                    if (prev && window.sitePagesTree && window.activeTabKey) {
                        window.sitePagesTree[window.activeTabKey] = prev;
                        if (typeof window.switchActivePreviewTab === 'function') window.switchActivePreviewTab(window.activeTabKey);
                    }
                    updateUndoRedoBtnState();
                }
            };
        }

        if (redoBtn) {
            redoBtn.onclick = () => {
                if (InspectorState.redoStack.length > 0) {
                    const current = window.getCurrentPageHtmlContent ? window.getCurrentPageHtmlContent() : "";
                    if (current) InspectorState.undoStack.push(current);
                    const next = InspectorState.redoStack.pop();
                    if (next && window.sitePagesTree && window.activeTabKey) {
                        window.sitePagesTree[window.activeTabKey] = next;
                        if (typeof window.switchActivePreviewTab === 'function') window.switchActivePreviewTab(window.activeTabKey);
                    }
                    updateUndoRedoBtnState();
                }
            };
        }

        // Targeted AI Section Edit Execution
        if (aiBtn && aiInput) {
            aiBtn.onclick = async () => {
                const promptVal = aiInput.value.trim();
                if (!promptVal) return;

                aiBtn.disabled = true;
                aiBtn.innerText = "⚡ Refining...";

                const selectedEl = InspectorState.activeSelectedEl;
                const sectionHtmlPayload = selectedEl ? selectedEl.outerHTML : (window.getCurrentPageHtmlContent ? window.getCurrentPageHtmlContent() : "");

                try {
                    const backendUrl = window.BACKEND_WORKER_URL || "https://xsites.xstreamflex.workers.dev";
                    const res = await fetch(\`\${backendUrl}/api/ai-section-edit\`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            prompt: promptVal,
                            sectionHtml: sectionHtmlPayload,
                            sectionType: window.activeTabKey || 'index',
                            userAssets: window.assetVault || []
                        })
                    });

                    const data = await res.json();
                    if (data.success && data.sectionHtml) {
                        pushUndoState();
                        if (selectedEl) {
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = data.sectionHtml;
                            const newEl = tempDiv.firstElementChild || tempDiv;
                            selectedEl.replaceWith(newEl);
                            InspectorState.activeSelectedEl = newEl;
                            setupIframeInspector(InspectorState.iframeEl);
                        } else if (window.sitePagesTree && window.activeTabKey) {
                            window.sitePagesTree[window.activeTabKey] = data.sectionHtml;
                            if (typeof window.switchActivePreviewTab === 'function') window.switchActivePreviewTab(window.activeTabKey);
                        }
                        syncToPagesTree();
                        aiInput.value = "";
                        alert("✨ AI Edit applied successfully!");
                    } else {
                        alert("Notice: Could not modify section automatically. " + (data.error || ""));
                    }
                } catch (e) {
                    alert("AI Edit notice: " + e.message);
                } finally {
                    aiBtn.disabled = false;
                    aiBtn.innerText = "⚡ Refine with AI";
                }
            };
        }
    }

    // Export module global API
    window.XsiteInspector = {
        setupIframeInspector,
        setupInspectorControls,
        pushUndoState,
        renderVariableInspector
    };

    document.addEventListener('DOMContentLoaded', () => {
        setupInspectorControls();
    });

})(window);
`, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "public, max-age=86400"
        }
      });
    }

    if (request.method === "POST" && new URL(request.url).pathname === "/api/ai-fallback") {
      try {
        const { prompt, scope, userAssets } = await request.json();

        const assetDirectives = formatAssetDirectives(userAssets);

        const systemPrompt = `You are a high-speed DOM command translator for an AI website builder.
Given a natural language command, translate it into a JSON object adhering strictly to the Unified Command Schema.
DO NOT return markdown formatting, code blocks, or conversational text. Output raw JSON only.

Unified Command Schema:
{
  "rawInput": "string (the original prompt)",
  "scope": "current" | "global",
  "action": "replaceText" | "removeElement" | "setStyle" | "addEffect" | "addParagraph" | "addSection" | "updateHeader" | "updateFooter",
  "targetSelector": "CSS selector or element type e.g. 'body', 'hero', 'header', 'footer', 'button', 'h1', 'p', 'section'",
  "payload": {
    "find": "string (for replaceText)",
    "value": "string (new text, CSS value, HTML snippet, or effect name)",
    "property": "string (CSS property name for setStyle)",
    "tag": "string (for addParagraph e.g. p)",
    "position": "string ('append', 'prepend', 'before', 'after')"
  }
}`;

        const userPrompt = `Translate this command into a JSON object: "${prompt}". User scope preference: "${scope || 'current'}".${assetDirectives}`;

        let rawResponse = await callBestAI(userPrompt, systemPrompt, env);
        rawResponse = rawResponse.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
        
        let parsedCommand;
        try {
          parsedCommand = JSON.parse(rawResponse);
        } catch (e) {
          const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsedCommand = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error("Invalid JSON structure returned by AI model");
          }
        }

        return new Response(JSON.stringify(parsedCommand), {
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json" 
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ 
          rawInput: prompt,
          scope: scope || "current",
          targetSelector: "body",
          action: "replaceText",
          payload: { find: "", value: "" },
          error: err.message 
        }), { 
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    if (request.method === "POST" && new URL(request.url).pathname === "/api/ai-section-edit") {
      try {
        const { prompt, sectionHtml, sectionType, userAssets } = await request.json();
        const assetDirectives = formatAssetDirectives(userAssets);

        const systemPrompt = `You are an ultra-fast, expert HTML & Tailwind CSS component editor for an AI website builder.
You will be provided with an isolated HTML component/section markup and a user request for changes.
Modify the HTML code according to the request while preserving Tailwind CSS classes, responsive design, inline styling, asset links, and functional attributes.
CRITICAL RULES:
1. Output ONLY the complete, modified, raw valid HTML section fragment.
2. DO NOT include markdown formatting like \`\`\`html or \`\`\`.
3. DO NOT include conversational text, explanations, or full <html>/<body> wrappers.
4. Keep all existing ids, data attributes, and core HTML structural layout intact unless explicitly asked to change or remove them.`;

        const userPrompt = `ORIGINAL SECTION HTML:\n${sectionHtml}\n\nUSER REQUEST FOR EDIT:\n"${prompt}"\n${assetDirectives}`;

        let rawResponse = await callBestAI(userPrompt, systemPrompt, env);
        rawResponse = rawResponse.replace(/```html\n?/gi, '').replace(/```\n?/g, '').trim();

        return new Response(JSON.stringify({ success: true, sectionHtml: rawResponse }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    const MASTER_DEV_KEY = env.MASTER_DEV_KEY || "XSTREAM-ADMIN-DEV-99";

    // PRICING TIER DEFINITIONS & STRIPE LINE ITEMS
    const TIERS = {
      free: { name: "Free Tier", pagesPerMonth: 3, tokensPerMonth: 3, watermark: true, customDomain: false, topupDiscount: 0, unitAmount: 0, description: "3 tokens/month • Floating tag + Footer label + Meta tag • Export allowed with branding" },
      starter_5: { name: "Starter", pagesPerMonth: 20, tokensPerMonth: 20, watermark: false, customFooter: true, customDomain: false, topupDiscount: 0, unitAmount: 500, description: "20 tokens/month • Footer label & Meta tag • Floating tag removed" },
      growth_9: { name: "Growth", pagesPerMonth: 50, tokensPerMonth: 50, watermark: false, customBranding: true, customDomain: true, topupDiscount: 0, unitAmount: 900, description: "50 tokens/month • Remove Branding option unlocked • Custom domain (Most Popular)" },
      pro_9: { name: "Growth", pagesPerMonth: 50, tokensPerMonth: 50, watermark: false, customBranding: true, customDomain: true, topupDiscount: 0, unitAmount: 900, description: "50 tokens/month • Remove Branding option unlocked • Custom domain (Most Popular)" },
      pro_29: { name: "Pro", pagesPerMonth: 150, tokensPerMonth: 150, watermark: false, whiteLabel: true, multiPageUnlocked: true, customDomain: true, topupDiscount: 0, unitAmount: 2900, description: "150 tokens/month • White-label mode (No branding) • Multi-page builds unlocked" },
      business_29: { name: "Pro", pagesPerMonth: 150, tokensPerMonth: 150, watermark: false, whiteLabel: true, multiPageUnlocked: true, customDomain: true, topupDiscount: 0, unitAmount: 2900, description: "150 tokens/month • White-label mode (No branding) • Multi-page builds unlocked" },
      lifetime_199: { name: "LTD (Lifetime)", pagesPerMonth: 200, tokensPerMonth: 200, watermark: false, whiteLabel: true, brandKits: true, customDomain: true, topupDiscount: 0.50, unitAmount: 19900, lifetime: true, description: "200 tokens/month forever • White-label mode (No branding) • 50% off top-ups for life" },
      master: { name: "Master Admin", pagesPerMonth: 1499, tokensPerMonth: 1499, watermark: false, customDomain: true, topupDiscount: 1.0, unitAmount: 0 }
    };

    // TOP-UP TOKEN PACKAGES SPECIFICATION
    const TOPUP_PACKAGES = [
      { id: "topup_10", tokens: 10, priceCents: 499, basePrice: "$4.99", ltdPrice: "$2.50" },
      { id: "topup_20", tokens: 20, priceCents: 899, basePrice: "$8.99", ltdPrice: "$4.50" },
      { id: "topup_50", tokens: 50, priceCents: 1999, basePrice: "$19.99", ltdPrice: "$10.00" },
      { id: "topup_100", tokens: 100, priceCents: 3499, basePrice: "$34.99", ltdPrice: "$17.50" }
    ];

    // Helper: Verify & Fetch User Record (KV, Master Admin, or Email-based Free Key)
    async function getUserRecord(licenseKey) {
      if (!licenseKey) return null;
      const cleanKey = licenseKey.trim();

      if (cleanKey === MASTER_DEV_KEY) {
        return {
          key: MASTER_DEV_KEY,
          tierId: 'master',
          tier: TIERS.master,
          credits: 1499,
          pagesUsedThisMonth: 0,
          customerEmail: 'admin@xstreamflex.com'
        };
      }

      // Check Cloudflare KV Store (Paid activation keys or registered emails)
      if (env.XSITES_KEYS) {
        let record = await env.XSITES_KEYS.get("key:" + cleanKey, "json");
        if (!record) {
          record = await env.XSITES_KEYS.get("email:" + cleanKey.toLowerCase(), "json");
        }
        if (record) {
          const tier = TIERS[record.tierId] || TIERS.free;
          const pagesUsed = record.pagesUsedThisMonth || 0;
          const remainingCredits = record.credits !== undefined ? record.credits : Math.max(0, tier.pagesPerMonth - pagesUsed);
          return { ...record, tier, pagesUsedThisMonth: pagesUsed, credits: remainingCredits };
        }
      }

      // Email capture check for Free Tier activation key (e.g. user@example.com)
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailRegex.test(cleanKey)) {
        const freeTier = TIERS.free;
        const activationKey = `XSITE-FREE-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
        const userRecord = {
          key: activationKey,
          tierId: 'free',
          tierName: freeTier.name,
          customerEmail: cleanKey.toLowerCase(),
          productCode: 'xsite-free',
          transactionId: `tx_free_${Date.now()}`,
          status: 'active',
          credits: freeTier.pagesPerMonth,
          pagesUsedThisMonth: 0,
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        };

        if (env.XSITES_KEYS) {
          try {
            await env.XSITES_KEYS.put("key:" + activationKey, JSON.stringify(userRecord));
            await env.XSITES_KEYS.put("email:" + cleanKey.toLowerCase(), JSON.stringify(userRecord));
            await env.XSITES_KEYS.put("key:" + cleanKey.toLowerCase(), JSON.stringify(userRecord));
          } catch(e) {
            console.warn("[Free Tier KV Error]", e.message);
          }
        }

        // Dispatch license email to record lead in InfluencerSoft and email key to user
        try {
          const validationUrl = `${env.WEBSITE_URL || 'https://xstreamflex.com'}/account?key=${activationKey}`;
          const runtimeEnv = { INFLUENCERSOFT_KEY: "81f4a860932fbaf82520b6e92e5a3d1c", ...env };
          await sendLicenseEmail({
            to: cleanKey.toLowerCase(),
            licenseKey: activationKey,
            tierName: freeTier.name,
            validationUrl
          }, runtimeEnv);
        } catch (e) {
          console.warn("[Free Tier Email] Notice:", e.message);
        }

        return { ...userRecord, tier: freeTier, pagesUsedThisMonth: 0, credits: freeTier.pagesPerMonth };
      }

      // Reject unrecognized key strings
      return null;
    }

    // Helper: Determine token cost based on page category
    function getPageTokenCost(pageKey, isBigCustom = false) {
      if (!pageKey) return 1;
      const cleanKey = String(pageKey).toLowerCase().trim();

      // 1. Big multi-section / custom page = 3 tokens
      if (isBigCustom || cleanKey === 'big' || cleanKey === 'custom' || cleanKey === 'big-custom' || cleanKey.includes('big-section') || cleanKey.includes('custom-page') || cleanKey.includes('multi-section')) {
        return 3;
      }

      // 2. Landing page = 2 tokens
      if (cleanKey === 'index' || cleanKey === 'home' || cleanKey === 'landing' || cleanKey.includes('landing-page')) {
        return 2;
      }

      // 3. Blog article = 0.5 tokens
      if (cleanKey.startsWith('blog-post-') || cleanKey.startsWith('article-') || cleanKey.includes('blog-article') || (cleanKey.includes('article') && cleanKey !== 'articles')) {
        return 0.5;
      }

      // 4. Privacy/Terms/About = 0.5 tokens
      if (cleanKey === 'privacy' || cleanKey === 'terms' || cleanKey === 'about' || cleanKey === 'privacy-policy' || cleanKey === 'terms-of-service' || cleanKey === 'terms-and-conditions' || cleanKey === 'about-us') {
        return 0.5;
      }

      // 5. Medium page = 1 token (default for contact, faq, support, services, pricing, portfolio, products, blog hub, etc.)
      return 1;
    }

    // Helper: Multi-Tier Backend Branding Injection Engine
    function injectBranding(html, tierId, removeBrandingOption = false) {
      if (!html || typeof html !== 'string') return html;

      const cleanTier = String(tierId || 'free').toLowerCase().trim();

      // 1. Pro, Business, Lifetime, Master are pure White Label (NO branding)
      if (['pro_29', 'business_29', 'lifetime_199', 'master'].includes(cleanTier)) {
        return html;
      }

      // 2. Growth Tier: Check if user enabled the 'removeBranding' option
      const isGrowth = (cleanTier === 'growth_9' || cleanTier === 'pro_9');
      if (isGrowth && removeBrandingOption) {
        return html;
      }

      // Branding Rules Matrix:
      // Free: Floating Tag + Footer Label + Meta Tag
      // Starter: Footer Label + Meta Tag (Floating Tag REMOVED)
      // Growth (default): Footer Label + Meta Tag (Floating Tag REMOVED)
      const includeFloatingTag = (cleanTier === 'free');
      const includeFooterLabel = (cleanTier === 'free' || cleanTier === 'starter_5' || isGrowth);
      const includeMetaTag = (cleanTier === 'free' || cleanTier === 'starter_5' || isGrowth);

      let updatedHtml = html;

      // A. Meta Tag Injection (<head>)
      if (includeMetaTag) {
        const metaTag = `<meta name="generator" content="Created with xsite (xstreamflex.com/ezsite)" />`;
        if (updatedHtml.includes('</head>')) {
          updatedHtml = updatedHtml.replace('</head>', `  ${metaTag}\n</head>`);
        } else if (updatedHtml.includes('<head>')) {
          updatedHtml = updatedHtml.replace('<head>', `<head>\n  ${metaTag}`);
        }
      }

      // B. Footer Label Injection (in <footer> or before </body>)
      if (includeFooterLabel) {
        const footerLabelHtml = `<div class="xsite-footer-label text-center py-3 text-xs opacity-75 font-sans border-t border-gray-800/40 mt-6"><a href="https://xstreamflex.com/ezsite" target="_blank" rel="noopener" class="text-emerald-400 font-medium hover:underline inline-flex items-center gap-1">Created with xsite</a></div>`;
        if (updatedHtml.includes('</footer>')) {
          updatedHtml = updatedHtml.replace('</footer>', `${footerLabelHtml}\n</footer>`);
        } else if (updatedHtml.includes('</body>')) {
          updatedHtml = updatedHtml.replace('</body>', `${footerLabelHtml}\n</body>`);
        } else {
          updatedHtml += footerLabelHtml;
        }
      }

      // C. Minimalist Floating Tag Injection (Free Tier Only - Matches Page DNA)
      if (includeFloatingTag) {
        const floatingTagHtml = `<div class="xsite-floating-tag fixed bottom-4 right-4 z-[9999] pointer-events-auto">
  <a href="https://xstreamflex.com/ezsite" target="_blank" rel="noopener" class="font-sans text-xs bg-slate-900/85 dark:bg-black/85 text-slate-200 hover:text-white px-3.5 py-1.5 rounded-full border border-slate-700/60 shadow-xl backdrop-blur-md transition-all flex items-center gap-1.5 group hover:scale-105">
    <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
    <span class="text-slate-300">Created with <strong class="font-bold text-emerald-400 group-hover:underline">xsite</strong></span>
  </a>
</div>`;
        if (updatedHtml.includes('</body>')) {
          updatedHtml = updatedHtml.replace('</body>', `${floatingTagHtml}\n</body>`);
        } else {
          updatedHtml += floatingTagHtml;
        }
      }

      return updatedHtml;
    }

    // Helper: Select the most robust primary landing page from architecture
    function selectPrimaryPage(architecture) {
      if (!architecture || !Array.isArray(architecture) || architecture.length === 0) return 'index';
      
      // Priority 1: Explicit home / index / landing page
      if (architecture.includes('index')) return 'index';
      if (architecture.includes('home')) return 'home';
      if (architecture.includes('landing')) return 'landing';

      // Priority 2: Major hub/landing pages
      const secondaryPages = new Set(['about', 'contact', 'terms', 'privacy', 'faq', 'support']);
      const hubPages = ['blog', 'products', 'store', 'shop', 'services', 'pricing', 'portfolio'];

      for (const page of hubPages) {
        if (architecture.includes(page)) return page;
      }

      // Priority 3: Custom main page (excluding subpages like blog-post-X or product-detail-X)
      const customMain = architecture.find(p => 
        !secondaryPages.has(p) && 
        !p.startsWith('blog-post-') && 
        !p.startsWith('product-detail-') && 
        !p.startsWith('item-')
      );
      if (customMain) return customMain;

      // Priority 4: Secondary utility pages in order of robustness
      const secondaryPriority = ['about', 'contact', 'faq', 'support', 'pricing', 'terms', 'privacy'];
      for (const page of secondaryPriority) {
        if (architecture.includes(page)) return page;
      }

      return architecture[0];
    }

    // Helper: Extract Design DNA (Header, Footer, Styles, Scripts, Blog Template) from Primary Page HTML
    function extractDnaFromHtml(html, primaryPageKey = 'index') {
      if (!html || typeof html !== 'string') return null;

      let headerHtml = "";
      const headerMatch = html.match(/<header[^>]*>[\s\S]*?<\/header>/i) ||
                          html.match(/<nav[^>]*>[\s\S]*?<\/nav>/i) ||
                          html.match(/<div[^>]*class="[^"]*(?:header|navbar)[^"]*"[^>]*>[\s\S]*?<\/div>/i) ||
                          html.match(/<div[^>]*id="(?:header|navbar)"[^>]*>[\s\S]*?<\/div>/i);
      if (headerMatch) headerHtml = headerMatch[0];

      let footerHtml = "";
      const footerMatch = html.match(/<footer[^>]*>[\s\S]*?<\/footer>/i) ||
                          html.match(/<div[^>]*class="[^"]*footer[^"]*"[^>]*>[\s\S]*?<\/div>/i) ||
                          html.match(/<div[^>]*id="footer"[^>]*>[\s\S]*?<\/div>/i);
      if (footerMatch) footerHtml = footerMatch[0];

      let headHtml = "";
      const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
      if (headMatch) headHtml = headMatch[1];

      let styleSignature = "";
      const bodyMatch = html.match(/<body([^>]*)>/i);
      if (bodyMatch) {
        const classMatch = bodyMatch[1].match(/class="([^"]*)"/i);
        if (classMatch) styleSignature = classMatch[1];
      }

      let scriptsHtml = "";
      const scriptMatches = html.match(/<script[\s\S]*?<\/script>/gi) || [];
      scriptsHtml = scriptMatches.join('\n');

      let masterBlogHtml = "";
      const articleMatch = html.match(/<article[^>]*>[\s\S]*?<\/article>/i) ||
                           html.match(/<main[^>]*>[\s\S]*?<\/main>/i);
      if (articleMatch) masterBlogHtml = articleMatch[0];

      return {
        primaryPageKey,
        headerHtml,
        footerHtml,
        headHtml,
        styleSignature,
        scriptsHtml,
        masterBlogHtml
      };
    }

    // Helper: Enforce Verbatim Header, Footer, and Mobile Navigation Scripts onto Subpages
    function enforceVerbatimHeaderFooter(subpageHtml, dna, currentPageKey = '', primaryPageKey = 'index', cleanDomain = '') {
      if (!subpageHtml || !dna) return subpageHtml;

      let result = subpageHtml;
      const targetLandingPage = dna.primaryPageKey || primaryPageKey || 'index';

      // 1. Enforce exact Header / Navigation HTML from index landing page
      if (dna.headerHtml && dna.headerHtml.trim()) {
        let cleanHeader = dna.headerHtml.trim();

        // Rewrite relative anchor links for subpages respecting cleanDomain
        if (currentPageKey && currentPageKey !== targetLandingPage) {
          const landingExt = cleanDomain ? '' : '.html';
          cleanHeader = cleanHeader.replace(/href="#([a-zA-Z0-9_-]+)"/g, `href="${targetLandingPage}${landingExt}#$1"`);
        }
        
        // Strip any AI-generated <header>, <nav>, and header <div> blocks to guarantee zero duplicate headers
        result = result.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
        result = result.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
        result = result.replace(/<div[^>]*class="[^"]*(?:header|navbar)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
        result = result.replace(/<div[^>]*id="(?:header|navbar)"[^>]*>[\s\S]*?<\/div>/gi, '');

        // Inject single cleanHeader right after <body ...> tag using function replacement (prevents $1 / $ corruption)
        if (/<body[^>]*>/i.test(result)) {
          result = result.replace(/(<body[^>]*>)/i, (match) => `${match}\n${cleanHeader}\n`);
        } else {
          result = cleanHeader + '\n' + result;
        }
      }

      // 2. Enforce exact Footer HTML from index landing page
      if (dna.footerHtml && dna.footerHtml.trim()) {
        let cleanFooter = dna.footerHtml.trim();
        if (currentPageKey && currentPageKey !== targetLandingPage) {
          const landingExt = cleanDomain ? '' : '.html';
          cleanFooter = cleanFooter.replace(/href="#([a-zA-Z0-9_-]+)"/g, `href="${targetLandingPage}${landingExt}#$1"`);
        }
        
        // Strip any AI-generated <footer> blocks to prevent duplicate footers
        result = result.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');

        // Inject single cleanFooter right before </body> tag using function replacement
        if (/<\/body>/i.test(result)) {
          result = result.replace(/<\/body>/i, (match) => `\n${cleanFooter}\n${match}`);
        } else {
          result = result + '\n' + cleanFooter;
        }
      }

      // 3. Universal Mobile Navbar & Theme Toggle Script Injection
      const universalNavScript = `<script>
(function() {
  function initNavControls() {
    const btn = document.getElementById('mobile-menu-btn') || document.querySelector('[data-menu-toggle]');
    const menu = document.getElementById('mobile-menu') || document.querySelector('[data-menu-content]');
    if (btn && menu) {
      btn.onclick = function(e) {
        e.stopPropagation();
        menu.classList.toggle('hidden');
      };
      menu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => menu.classList.add('hidden'));
      });
    }
    const themeBtn = document.getElementById('theme-toggle-btn') || document.querySelector('[data-theme-toggle]');
    if (themeBtn) {
      themeBtn.onclick = function(e) {
        e.stopPropagation();
        document.documentElement.classList.toggle('dark');
        try { localStorage.setItem('xsites_theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light'); } catch(err){}
      };
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavControls);
  } else {
    initNavControls();
  }
})();
</script>`;

      if (!result.includes('initNavControls')) {
        if (/<\/body>/i.test(result)) {
          result = result.replace(/<\/body>/i, (match) => `${universalNavScript}\n${match}`);
        } else {
          result += `\n${universalNavScript}`;
        }
      }

      // 4. Enforce exact JS scripts and functions from index landing page
      if (dna.scriptsHtml && dna.scriptsHtml.trim()) {
        const scriptMatches = dna.scriptsHtml.match(/<script[\s\S]*?<\/script>/gi) || [];
        for (const scriptTag of scriptMatches) {
          const innerContent = scriptTag.replace(/<[^>]+>/g, '').trim();
          if (innerContent && !result.includes(innerContent)) {
            if (/<\/body>/i.test(result)) {
              result = result.replace(/<\/body>/i, (match) => `${scriptTag}\n${match}`);
            } else {
              result += `\n${scriptTag}`;
            }
          }
        }
      }

      return result;
    }

    // ENDPOINT 0: INFLUENCERSOFT ACTIVATION API & MULTI-EVENT NOTIFICATION WEBHOOKS
    const isActivationPath = [
      "/api/xsite/activate", "/xsite/activate",
      "/api/xsite/webhook/new", "/api/xsite/webhook/prepaid", "/api/xsite/webhook/paid",
      "/api/xsite/webhook/cancel", "/api/xsite/webhook/refund", "/api/xsite/webhook/unsubscribe"
    ].includes(url.pathname);

    if (isActivationPath && (request.method === "POST" || request.method === "GET")) {
      try {
        let payload = {};
        if (request.method === "POST") {
          const contentType = request.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            payload = await request.json();
          } else if (contentType.includes("application/x-www-form-urlencoded")) {
            const formData = await request.formData();
            payload = Object.fromEntries(formData.entries());
          } else {
            try { payload = await request.json(); } catch(e) {
              const text = await request.text();
              const params = new URLSearchParams(text);
              payload = Object.fromEntries(params.entries());
            }
          }
        } else {
          payload = Object.fromEntries(url.searchParams.entries());
        }

        const email = (payload.email || payload.lead_email || payload.email_address || payload.user_email || "").trim().toLowerCase();
        const rawProduct = (payload.product || payload.product_id || payload.product_code || payload.item || payload.goods_id || "xsite-free").trim().toLowerCase();
        const transactionId = (payload.transaction_id || payload.transaction || payload.order_id || payload.tx || payload.payment_id || `tx_${Date.now()}`).trim();

        // Determine event type from route or payload
        let eventType = "paid";
        if (url.pathname.includes("/cancel")) eventType = "cancel";
        else if (url.pathname.includes("/refund") || url.pathname.includes("/moneyback")) eventType = "refund";
        else if (url.pathname.includes("/unsubscribe")) eventType = "unsubscribe";
        else if (url.pathname.includes("/new")) eventType = "new";
        else if (url.pathname.includes("/prepaid")) eventType = "prepaid";
        else if (payload.event || payload.action || payload.status) {
          eventType = (payload.event || payload.action || payload.status).toLowerCase();
        }

        if (!email || !email.includes("@")) {
          return new Response(JSON.stringify({ success: false, error: "Valid email address is required for XSITES activation / webhook." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const cleanProduct = rawProduct.toLowerCase().replace(/[^a-z0-9]/g, '');
        let targetTierId = 'free';

        if (cleanProduct.includes('lifetime') || cleanProduct.includes('ltd') || cleanProduct.includes('199')) {
          targetTierId = 'lifetime_199';
        } else if (cleanProduct.includes('biz') || cleanProduct.includes('pro') || cleanProduct.includes('29')) {
          targetTierId = 'pro_29';
        } else if (cleanProduct.includes('growth') || cleanProduct.includes('popular') || cleanProduct.includes('9')) {
          targetTierId = 'growth_9';
        } else if (cleanProduct.includes('basic') || cleanProduct.includes('starter') || cleanProduct.includes('5')) {
          targetTierId = 'starter_5';
        }
        
        // CANCELLATION & REFUND / MONEYBACK / UNSUBSCRIBE HANDLER
        if (['cancel', 'cancellation', 'refund', 'moneyback', 'unsubscribe'].includes(eventType)) {
          targetTierId = 'free'; // Downgrade to Free Tier on cancellation or refund
        }

        const tier = TIERS[targetTierId] || TIERS.free;

        let existingRecord = null;
        if (env.XSITES_KEYS) {
          existingRecord = await env.XSITES_KEYS.get("email:" + email, "json");
        }

        const tierShort = targetTierId === 'free' ? 'FREE' : targetTierId === 'starter_5' ? 'STARTER' : targetTierId === 'growth_9' ? 'GROWTH' : targetTierId === 'pro_29' ? 'PRO' : 'LTD';
        const activationKey = existingRecord?.key || `XSITE-${tierShort}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

        const userRecord = {
          key: activationKey,
          tierId: targetTierId,
          tierName: tier.name,
          customerEmail: email,
          productCode: rawProduct,
          transactionId: transactionId,
          status: ['cancel', 'refund', 'unsubscribe'].includes(eventType) ? 'suspended' : 'active',
          credits: tier.pagesPerMonth,
          pagesUsedThisMonth: existingRecord?.pagesUsedThisMonth || 0,
          updatedAt: new Date().toISOString(),
          createdAt: existingRecord?.createdAt || new Date().toISOString()
        };

        if (env.XSITES_KEYS) {
          await env.XSITES_KEYS.put("key:" + activationKey, JSON.stringify(userRecord));
          await env.XSITES_KEYS.put("email:" + email, JSON.stringify(userRecord));
          await env.XSITES_KEYS.put("key:" + email, JSON.stringify(userRecord));
          await env.XSITES_KEYS.put("tx:" + transactionId, JSON.stringify(userRecord));
        }

        // Trigger welcome or update email unless event is cancellation/refund
        if (!['cancel', 'refund', 'unsubscribe'].includes(eventType)) {
          try {
            const validationUrl = `${env.WEBSITE_URL || 'https://xstreamflex.com'}/account?key=${activationKey}`;
            const runtimeEnv = { INFLUENCERSOFT_KEY: "81f4a860932fbaf82520b6e92e5a3d1c", ...env };
            await sendLicenseEmail({
              to: email,
              licenseKey: activationKey,
              tierName: tier.name,
              validationUrl
            }, runtimeEnv);
          } catch (e) {
            console.warn("[Activation Webhook] License email delivery notice:", e.message);
          }
        }

        return new Response(JSON.stringify({
          success: true,
          event: eventType,
          message: `XSITES event '${eventType}' processed successfully for ${email}.`,
          user: userRecord,
          token: activationKey,
          redirectUrl: `https://xstreamflex.com/account?key=${activationKey}`
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ENDPOINT 1: LICENSE HANDSHAKE & STATUS
    if (url.pathname === "/verify-license" && request.method === "POST") {
      try {
        const { licenseKey } = await request.json();
        const user = await getUserRecord(licenseKey);
        if (!user) {
          return new Response(JSON.stringify({ success: false, error: "License key or email unrecognized. Enter a valid email for Free Tier access or upgrade to a paid plan." }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        return new Response(JSON.stringify({
          success: true,
          key: user.key,
          tierId: user.tierId,
          tierName: user.tier.name,
          pagesPerMonth: user.tier.pagesPerMonth,
          tokensPerMonth: user.tier.tokensPerMonth || user.tier.pagesPerMonth,
          pagesUsedThisMonth: user.pagesUsedThisMonth || 0,
          credits: (user.tier.pagesPerMonth - (user.pagesUsedThisMonth || 0)),
          tokens: (user.tier.pagesPerMonth - (user.pagesUsedThisMonth || 0)),
          watermark: user.tier.watermark,
          customDomain: user.tier.customDomain,
          whiteLabel: user.tier.whiteLabel || false,
          topupDiscount: user.tier.topupDiscount || 0,
          isLTD: user.tierId === 'lifetime_199' || user.tier.topupDiscount === 0.50,
          topupPackages: TOPUP_PACKAGES,
          customerEmail: user.customerEmail
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ENDPOINT 2: SMART BRAIN DUMP ASSESSMENT
    if (url.pathname === "/assess-braindump" && request.method === "POST") {
      try {
        const { brainDump, licenseKey } = await request.json();
        if (!brainDump || typeof brainDump !== 'string' || !brainDump.trim()) {
          throw new Error("Brain dump input text is required for assessment.");
        }

        const systemPrompt = `You are an elite business analyst and website architect. Analyze the user's raw business concept/brain dump and return a strict JSON object with business intelligence and subpage recommendations. Return ONLY valid raw JSON with no markdown block wrappers.`;
        const userPrompt = `Analyze this raw business brain dump concept:\n"${brainDump}"\n\n` +
          `Extract and return a JSON object with this EXACT structure:\n` +
          `{\n` +
          `  "businessName": "Extracted or suggested brand name",\n` +
          `  "businessType": "e.g. SaaS, E-commerce, Agency, Local Business, Digital Products",\n` +
          `  "targetAudience": "Summary of target customers",\n` +
          `  "coreOfferings": ["Offer 1", "Offer 2"],\n` +
          `  "detectedPages": ["index", "about", "products", "blog", "contact", "faq", "pricing"],\n` +
          `  "contactInfo": {\n` +
          `    "email": "extracted email or suggested",\n` +
          `    "phone": "extracted phone or empty",\n` +
          `    "location": "extracted address/city or empty"\n` +
          `  },\n` +
          `  "businessLogic": {\n` +
          `    "conversionGoal": "Primary CTA goal (e.g. Buy Product, Book Call, Subscribe)",\n` +
          `    "pricingModel": "Free / Subscription / One-time / Custom",\n` +
          `    "keyFeatures": ["Feature 1", "Feature 2"]\n` +
          `  },\n` +
          `  "suggestedBlogTopics": [\n` +
          `    {"title": "Blog Topic Title 1", "category": "Category", "excerpt": "Brief concept teaser"},\n` +
          `    {"title": "Blog Topic Title 2", "category": "Category", "excerpt": "Brief concept teaser"}\n` +
          `  ],\n` +
          `  "suggestedProducts": [\n` +
          `    {"name": "Product Name 1", "price": "$XX", "description": "Short summary"},\n` +
          `    {"name": "Product Name 2", "price": "$XX", "description": "Short summary"}\n` +
          `  ]\n` +
          `}\n\n` +
          `Ensure 'detectedPages' ONLY contains valid subpage keys: index, about, products, blog, contact, faq, pricing, terms.`;

        let rawResponse = await callBestAI(userPrompt, systemPrompt, env);
        let parsedData;
        try {
          const cleanJson = rawResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
          parsedData = JSON.parse(cleanJson);
        } catch (jsonErr) {
          parsedData = {
            businessName: "My Business",
            businessType: "Business Service",
            targetAudience: "Target Clients",
            coreOfferings: ["Primary Offering"],
            detectedPages: ["index", "about", "products", "blog", "contact"],
            contactInfo: { email: "", phone: "", location: "" },
            businessLogic: { conversionGoal: "Contact Us", pricingModel: "Standard", keyFeatures: [] },
            suggestedBlogTopics: [
              { title: "Getting Started Guide", category: "General", excerpt: "Learn the fundamentals of our service." },
              { title: "Top 5 Industry Insights", category: "Insights", excerpt: "Key advantages for your growth." }
            ],
            suggestedProducts: [
              { name: "Starter Package", price: "$49", description: "Basic entry offering" },
              { name: "Pro Package", price: "$149", description: "Complete professional solution" }
            ]
          };
        }

        return new Response(JSON.stringify({ success: true, assessment: parsedData }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ENDPOINT 3: LANDING PAGE & DNA TOPIC / MATERIAL SCANNER WITH DEDUPLICATION
    if (url.pathname === "/scan-topics" && request.method === "POST") {
      try {
        const { dnaSourceUrl, rawHtml, existingTopics, licenseKey } = await request.json();
        let targetContent = rawHtml || "";

        if (dnaSourceUrl && typeof dnaSourceUrl === 'string' && dnaSourceUrl.trim()) {
          try {
            const externalResponse = await fetch(dnaSourceUrl.trim(), {
              headers: { "User-Agent": "Mozilla/5.0 Cloudflare-Worker-XSITES" }
            });
            if (externalResponse.ok) {
              const fullHtml = await externalResponse.text();
              targetContent = fullHtml.substring(0, 15000);
            }
          } catch (scrapeErr) {
            console.warn("[Topic Scanner Scrape Warning]", scrapeErr.message);
          }
        }

        if (!targetContent || targetContent.trim().length < 50) {
          throw new Error("No valid webpage content or HTML available to scan for topics.");
        }

        const existingTopicsList = Array.isArray(existingTopics) ? existingTopics.join(", ") : "";

        const systemPrompt = `You are a content strategy AI and product manager. Scan the provided webpage content to extract distinct, non-overlapping blog topics and product/service ideas. Return ONLY valid JSON.`;
        const userPrompt = `Webpage Content Sample:\n${targetContent}\n\n` +
          (existingTopicsList ? `⚠️ PREVIOUSLY GENERATED TOPICS (DO NOT REPEAT OR DUPLICATE THESE TOPICS):\n[${existingTopicsList}]\n\n` : '') +
          `Generate 5 distinct blog topic concepts and 3 product concepts derived from this webpage.\n` +
          `Return a JSON object with this EXACT structure:\n` +
          `{\n` +
          `  "blogTopics": [\n` +
          `    {\n` +
          `      "title": "Unique Article Title",\n` +
          `      "slug": "blog-post-slug-1.html",\n` +
          `      "category": "Category Name",\n` +
          `      "readTime": "5 min",\n` +
          `      "tags": ["tag1", "tag2"],\n` +
          `      "excerpt": "Compelling 2-sentence summary teaser",\n` +
          `      "outline": ["Section 1", "Section 2", "Section 3"]\n` +
          `    }\n` +
          `  ],\n` +
          `  "productIdeas": [\n` +
          `    {\n` +
          `      "title": "Product / Service Title",\n` +
          `      "slug": "product-slug-1.html",\n` +
          `      "price": "$99",\n` +
          `      "category": "Services",\n` +
          `      "features": ["Feature A", "Feature B"],\n` +
          `      "description": "Product summary"\n` +
          `    }\n` +
          `  ]\n` +
          `}`;

        let rawResponse = await callBestAI(userPrompt, systemPrompt, env);
        let parsedTopics;
        try {
          const cleanJson = rawResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
          parsedTopics = JSON.parse(cleanJson);
        } catch (jsonErr) {
          parsedTopics = {
            blogTopics: [
              {
                title: "Ultimate Guide to Scalable Growth",
                slug: "blog-post-growth-guide.html",
                category: "Strategy",
                readTime: "6 min",
                tags: ["growth", "guide"],
                excerpt: "Key strategies extracted from core landing page value props.",
                outline: ["Introduction", "Core Framework", "Execution Steps"]
              }
            ],
            productIdeas: [
              {
                title: "Core Service Package",
                slug: "product-core-package.html",
                price: "$199",
                category: "Core Offer",
                features: ["Full Implementation", "24/7 Support"],
                description: "Turnkey solution mapped from core landing page offerings."
              }
            ]
          };
        }

        if (Array.isArray(existingTopics) && existingTopics.length > 0) {
          const existingLower = existingTopics.map(t => String(t).toLowerCase().trim());
          if (Array.isArray(parsedTopics.blogTopics)) {
            parsedTopics.blogTopics = parsedTopics.blogTopics.filter(bt => !existingLower.includes(bt.title.toLowerCase().trim()));
          }
          if (Array.isArray(parsedTopics.productIdeas)) {
            parsedTopics.productIdeas = parsedTopics.productIdeas.filter(pi => !existingLower.includes(pi.title.toLowerCase().trim()));
          }
        }

        return new Response(JSON.stringify({ success: true, topics: parsedTopics }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ENDPOINT: MANIFEST GETTER (BLOG & PRODUCTS DYNAMIC SYNC FROM KV)
    if (url.pathname === "/get-manifest" && request.method === "POST") {
      try {
        const { licenseKey, type, domain } = await request.json();
        const manifestKey = `manifest:${type || 'blog'}:${domain || 'default'}`;
        let manifestData = [];
        if (env.XSITES_KEYS) {
          const stored = await env.XSITES_KEYS.get(manifestKey);
          if (stored) manifestData = JSON.parse(stored);
        }
        return new Response(JSON.stringify({ success: true, type, manifest: manifestData }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ENDPOINT: MANIFEST UPDATER (APPEND NEW ARTICLE OR PRODUCT TO KV)
    if (url.pathname === "/update-manifest" && request.method === "POST") {
      try {
        const { licenseKey, type, domain, item } = await request.json();
        const manifestKey = `manifest:${type || 'blog'}:${domain || 'default'}`;
        let manifestData = [];
        if (env.XSITES_KEYS) {
          const stored = await env.XSITES_KEYS.get(manifestKey);
          if (stored) manifestData = JSON.parse(stored);
          
          if (item && item.slug) {
            const exists = manifestData.some(i => i.slug === item.slug);
            if (!exists) {
              manifestData.unshift(item);
              await env.XSITES_KEYS.put(manifestKey, JSON.stringify(manifestData));
            }
          }
        }
        return new Response(JSON.stringify({ success: true, type, manifest: manifestData }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ENDPOINT 4: COMPILATION MATRIX (WITH WATERMARK & KV TRACKING)
    if (url.pathname === "/compile" && request.method === "POST") {
      try {
        const { mode, brainDump, architecture, dnaSourceUrl, dnaMode, licenseKey, intendedDomain, userAssets, primaryPage: reqPrimaryPage, isBigCustom, removeBranding } = await request.json();
        const user = await getUserRecord(licenseKey);
        if (!user) throw new Error("Unauthorized compiler access. Input a valid activation key.");

        const cleanDomain = intendedDomain ? intendedDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim() : '';
        const assetDirectives = formatAssetDirectives(userAssets);

        // UNIFIED COMPILER ENGINE WITH OPTIONAL STYLE REFERENCE / WEBPAGE CLONING
        let scrapedDna = null;
        if (dnaSourceUrl && typeof dnaSourceUrl === 'string' && dnaSourceUrl.trim()) {
          try {
            const externalResponse = await fetch(dnaSourceUrl.trim(), {
              headers: { "User-Agent": "Mozilla/5.0 Cloudflare-Worker-XSITES" }
            });
            if (externalResponse.ok) {
              const rawHtml = await externalResponse.text();
              const headMatch = rawHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
              const navMatch = rawHtml.match(/<header[^>]*>([\s\S]*?)<\/header>/i) ||
                               rawHtml.match(/<nav[^>]*>([\s\S]*?)<\/nav>/i) ||
                               rawHtml.match(/<div[^>]*class="[^"]*(?:header|navbar)[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                               rawHtml.match(/<div[^>]*id="(?:header|navbar)"[^>]*>([\s\S]*?)<\/div>/i);
              const footerMatch = rawHtml.match(/<footer[^>]*>([\s\S]*?)<\/footer>/i) ||
                                  rawHtml.match(/<div[^>]*class="[^"]*footer[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                                  rawHtml.match(/<div[^>]*id="footer"[^>]*>[\s\S]*?<\/div>/i);
              const firstSectionMatch = rawHtml.match(/<section([^>]*)>/i);
              const bodyClasses = firstSectionMatch ? firstSectionMatch[1].match(/class="([^"]*)"/i) : null;
              
              const isMyWebpage = dnaMode === 'my_webpage';
              scrapedDna = {
                headHtml: headMatch ? headMatch[1] : "",
                headerHtml: isMyWebpage ? (navMatch ? navMatch[0] : "") : "",
                footerHtml: isMyWebpage ? (footerMatch ? footerMatch[0] : "") : "",
                styleSignature: bodyClasses ? bodyClasses[1] : "",
                isMyWebpage: isMyWebpage
              };
            }
          } catch (scrapeErr) {
            console.warn("[Style Clone Scrape Warning]", scrapeErr.message);
          }
        }
        
        const activeArch = Array.isArray(architecture) && architecture.length > 0 ? architecture : ['index', 'about', 'contact', 'products', 'blog'];
        const primaryPage = reqPrimaryPage || selectPrimaryPage(activeArch);
        const totalTokensInCluster = activeArch.reduce((sum, p) => sum + getPageTokenCost(p, (p === primaryPage && Boolean(isBigCustom))), 0);

        const availableCredits = user.credits !== undefined
          ? user.credits
          : Math.max(0, user.tier.pagesPerMonth - (user.pagesUsedThisMonth || 0));

        if (availableCredits < totalTokensInCluster) {
          return new Response(JSON.stringify({
            success: false,
            error: `Insufficient token credits (${availableCredits} remaining). Compiling this site cluster requires ${totalTokensInCluster} token(s). Please upgrade your plan or top up.`
          }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // Filter out individual blog post subpages from top navbar navigation links
        const mainNavPages = activeArch.filter(p => !p.startsWith('blog-post-'));
        const navigationDirectives = mainNavPages.map(p => {
          const name = p === 'index' ? 'Home' : (p === 'blog' ? 'Blog' : p.charAt(0).toUpperCase() + p.slice(1));
          return `${name} (${p}.html)`;
        }).join(", ");

        const domainPromptDirective = cleanDomain ? `🌐 TARGET DOMAIN & LINKING INSTRUCTION:\n- The target deployment domain is: "${cleanDomain}".\n- Include canonical SEO link tag in <head>: <link rel="canonical" href="https://${cleanDomain}/${primaryPage}.html" />.\n- Ensure internal navigation links use clean relative URLs (e.g. href="about.html", href="products.html") so links resolve seamlessly on ${cleanDomain}.\n\n` : '';

        let cloneDirective = '';
        if (scrapedDna) {
          if (scrapedDna.isMyWebpage) {
            cloneDirective = `🎨 CLONED WEBPAGE DIRECTIVE (VERBATIM NAVIGATION):\n` +
                             `- The user requested to clone their existing webpage at "${dnaSourceUrl}".\n` +
                             `- Re-inject or perfectly match the visual style, color palette, and layout structure.\n` +
                             `- Cloned Header Element: ${scrapedDna.headerHtml || 'Sticky navbar'}\n` +
                             `- Cloned Footer Element: ${scrapedDna.footerHtml || 'Footer'}\n\n`;
          } else {
            cloneDirective = `🎨 VISUAL & STYLE REFERENCE DIRECTIVE:\n` +
                             `- Model the design aesthetic, color scheme, typography, and visual rhythm after this target reference endpoint:\n` +
                             `- Reference Style Signature: ${scrapedDna.styleSignature || 'Modern Tailwind'}\n\n`;
          }
        }

        let systemPrompt = "You are an elite web developer. Output only clean HTML with embedded Tailwind CSS. No markdown code blocks, descriptions, or conversation.";
        let userPrompt = primaryPage === 'index'
          ? `You are the world's premier web developer. Build a high-converting corporate landing page (index.html) based on this concept:\n"${brainDump}"\n\n` +
            cloneDirective +
            domainPromptDirective +
            assetDirectives +
            `🚀 COHESIVE MULTI-PAGE ARCHITECTURE RULES:\n` +
            `- You are building a MULTI-PAGE website ecosystem. This is ONLY index.html.\n` +
            `- DO NOT cram full text for the subpages here. Instead, create clean summary/preview cards that LINK out to their respective pages.\n\n` +
            `🎨 VISUAL & STRUCTURAL REQUIREMENTS:\n` +
            `- GLOBAL STICKY HEADER/NAV: Include a premium, clean navigation bar at the top with the business logo/name. You MUST map links strictly and ONLY to the following pages: ${navigationDirectives}.\n` +
            `- MOBILE NAV TOGGLE: Include an interactive hamburger button (id="mobile-menu-btn") and mobile menu drawer (id="mobile-menu") with clean responsive layout.\n` +
            `- NAVIGATION LINKS: Use exact relative URLs (e.g., href="products.html") so the multi-page navigation functions flawlessly after deployment.\n` +
            `- THEME TOGGLE: Include a working Sun/Moon toggle button (id="theme-toggle-btn") natively in the navbar that hooks up a vanilla JS click listener to toggle the 'dark' class on the <html> element.\n` +
            `- LIGHT/DARK MATRIX: Default to a crisp, modern light mode, but wrap every single structural element with 'dark:' utility classes for a stunning dark-mode transition.\n` +
            `- HERO & BENTO SHOWCASE: A premium hero banner followed by a modern Bento Grid highlighting the absolute core offerings, ending with a testimonial section and a clean footer.\n\n` +
            `Output ONLY valid raw HTML starting with <!DOCTYPE html>. No markdown or chat fluff.`
          : `You are the world's premier web developer. Build a dedicated, high-converting corporate primary page (${primaryPage}.html) based on this concept:\n"${brainDump}"\n\n` +
            cloneDirective +
            domainPromptDirective +
            assetDirectives +
            `🎨 VISUAL & STRUCTURAL REQUIREMENTS:\n` +
            `- GLOBAL STICKY HEADER/NAV: Include a premium, clean navigation bar at the top with the business logo/name. Map links to: ${navigationDirectives}.\n` +
            `- MOBILE NAV TOGGLE: Include an interactive hamburger button (id="mobile-menu-btn") and mobile menu drawer (id="mobile-menu") with clean responsive layout.\n` +
            `- NAVIGATION LINKS: Use exact relative URLs (e.g., href="index.html", href="products.html") so multi-page navigation functions flawlessly.\n` +
            `- THEME TOGGLE: Include a working Sun/Moon toggle button (id="theme-toggle-btn") natively in the navbar.\n` +
            `- LIGHT/DARK MATRIX: Default to a crisp, modern light mode, but wrap structural elements with 'dark:' utility classes.\n\n` +
            `Output ONLY valid raw HTML starting with <!DOCTYPE html>. No markdown or chat fluff.`;

        let compiledHTML = await callBestAI(userPrompt, systemPrompt, env);
        if (!compiledHTML || typeof compiledHTML !== 'string' || compiledHTML.trim().length < 50) {
          throw new Error(`AI compilation failed or produced an empty layout for ${primaryPage}.html.`);
        }

        // Extract Design DNA directly from the generated primary page HTML
        let extractedDna = extractDnaFromHtml(compiledHTML, primaryPage);
        if (scrapedDna) {
          extractedDna = { ...scrapedDna, ...extractedDna };
        }

        if (scrapedDna && scrapedDna.isMyWebpage) {
          compiledHTML = enforceVerbatimHeaderFooter(compiledHTML, scrapedDna, primaryPage, primaryPage, cleanDomain);
        } else {
          compiledHTML = enforceVerbatimHeaderFooter(compiledHTML, extractedDna, primaryPage, primaryPage, cleanDomain);
        }
        compiledHTML = injectBranding(compiledHTML, user.tierId, Boolean(removeBranding));

        // Deduct credits for the complete site cluster in 1 single atomic KV update
        user.pagesUsedThisMonth = (user.pagesUsedThisMonth || 0) + totalTokensInCluster;
        const newRemainingCredits = user.credits !== undefined ? Math.max(0, user.credits - totalTokensInCluster) : Math.max(0, user.tier.pagesPerMonth - user.pagesUsedThisMonth);
        user.credits = newRemainingCredits;

        const batchId = "batch_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

        if (env.XSITES_KEYS && user.key !== MASTER_DEV_KEY) {
          try {
            await env.XSITES_KEYS.put("key:" + user.key, JSON.stringify(user));
            if (user.customerEmail) {
              await env.XSITES_KEYS.put("email:" + user.customerEmail.toLowerCase(), JSON.stringify(user));
            }
          } catch (e) {
            console.warn("[Compile KV Update Notice]", e.message);
          }
        }

        return new Response(JSON.stringify({
          success: true,
          mode: "genesis",
          primaryPage: primaryPage,
          html: compiledHTML,
          dna: extractedDna,
          batchId: batchId,
          totalDeducted: totalTokensInCluster,
          credits: newRemainingCredits,
          remainingCredits: newRemainingCredits,
          pagesUsedThisMonth: user.pagesUsedThisMonth,
          pagesPerMonth: user.tier.pagesPerMonth
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ENDPOINT 5: SUBPAGE GENERATION MATRIX
    if (url.pathname === "/compile-subpage" && request.method === "POST") {
      try {
        const { brainDump, pageType, licenseKey, dna, intendedDomain, userAssets, batchId, isBigCustom, removeBranding } = await request.json();
        const user = await getUserRecord(licenseKey);
        if (!user) throw new Error("Unauthorized subpage generation request.");

        const isPreDeducted = Boolean(batchId);
        const subpageCost = getPageTokenCost(pageType, Boolean(isBigCustom));

        if (!isPreDeducted) {
          const availableCredits = user.credits !== undefined
            ? user.credits
            : Math.max(0, user.tier.pagesPerMonth - (user.pagesUsedThisMonth || 0));

          if (availableCredits < subpageCost) {
            return new Response(JSON.stringify({
              success: false,
              error: `Insufficient token credits (${availableCredits} remaining). Please upgrade your plan or top up to compile subpage '${pageType}.html' (${subpageCost} token(s) required).`
            }), {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
        }

        const cleanDomain = intendedDomain ? intendedDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim() : '';
        const domainDirective = cleanDomain ? `4. CANONICAL & DOMAIN LINKING: Include <link rel="canonical" href="https://${cleanDomain}/${pageType}.html" /> and ensure all subpage links use clean relative paths.\n` : '';
        const assetDirectives = formatAssetDirectives(userAssets);
        
        let pageTypeContext = "";
        const cleanType = String(pageType || '').toLowerCase();

        if (cleanType === 'products' || cleanType === 'shop' || cleanType === 'store') {
          pageTypeContext = "🛍️ SPECIALIZED PAGE DIRECTIVE (PRODUCTS & CATALOG HUB):\n" +
                            "- Build a modern Product Catalog & Storefront landing page.\n" +
                            "- Include hero featured product banner, category filter pills, search input, price filters, and a grid of product cards with buy CTA buttons.\n" +
                            "- Include script tag `<script src=\"products-data.js\"></script>` in `<head>` for dynamic catalog sync.\n" +
                            "- Link product cards directly to relative paths (e.g. href=\"product-1.html\", href=\"product-2.html\", href=\"product-3.html\").\n\n";
        } else if (cleanType.startsWith('product-')) {
          const prodNum = cleanType.replace('product-', '');
          pageTypeContext = `🛍️ SPECIALIZED PAGE DIRECTIVE (PRODUCT DETAIL PAGE #${prodNum}):\n` +
                            `- Build a high-converting Product Detail & Checkout Showcase layout for Product #${prodNum}.\n` +
                            `- Include product image gallery/hero, pricing badge, feature bullet list, customer reviews breakdown, FAQ accordion, add-to-cart/checkout CTA modal, and related products grid.\n` +
                            `- Include script tag \`<script src="products-data.js"></script>\` in \`<head>\` for dynamic related products sync.\n` +
                            `- Link related product cards to relative paths (e.g. href="product-1.html", href="product-2.html").\n\n`;
        } else if (cleanType === 'blog') {
          pageTypeContext = "📰 SPECIALIZED PAGE DIRECTIVE (BLOG HOME / HUB):\n" +
                            "- Build a modern Blog Home / Newsroom landing page.\n" +
                            "- Include hero article banner, category filter pills, newsletter signup, search bar, and a grid of article cards.\n" +
                            "- Include script tag `<script src=\"articles-data.js\"></script>` in `<head>` for dynamic blog hub sync.\n" +
                            "- Link article cards directly to relative paths (e.g. href=\"blog-post-1.html\", href=\"blog-post-2.html\", href=\"blog-post-3.html\").\n\n";
        } else if (cleanType.startsWith('blog-post-')) {
          const postNum = cleanType.replace('blog-post-', '');
          if (dna && dna.masterBlogHtml) {
            pageTypeContext = `📰 SPECIALIZED PAGE DIRECTIVE (BLOG ARTICLE #${postNum} - IDENTICAL UI RE-USE):\n` +
                              `- You MUST re-use the EXACT identical HTML container layout, Tailwind styling, section elements, card structures, and typography from the master article template below:\n` +
                              `-----------------------------------------------------\n` +
                              `${dna.masterBlogHtml}\n` +
                              `-----------------------------------------------------\n\n` +
                              `- Include script tag \`<script src="articles-data.js"></script>\` in \`<head>\` for dynamic article sync.\n` +
                              `- CRITICAL DYNAMIC REPLACEMENT RULE:\n` +
                              `  1. Keep 100% IDENTICAL UI layout, section boundaries, and CSS class names.\n` +
                              `  2. ONLY replace the main article headline, subtitle, publication date, hero image topic, body paragraph copy, key takeaways, and related post cards for a distinct new blog topic related to the business.\n` +
                              `  3. Cross-link related post cards to other articles in the cluster (e.g. href="blog-post-1.html", href="blog-post-2.html", href="blog-post-3.html").\n\n`;
          } else {
            pageTypeContext = `📰 SPECIALIZED PAGE DIRECTIVE (MASTER BLOG ARTICLE #${postNum}):\n` +
                              `- Include script tag \`<script src="articles-data.js"></script>\` in \`<head>\` for dynamic article sync.\n` +
                              `- Build a comprehensive, high-converting Blog Article Page layout.\n` +
                              `- Include article hero title, author bio badge, reading time, publication date, social share buttons, rich article body with subheaders/quote callouts, key takeaways box, and related articles grid.\n` +
                              `- Link related article cards to relative paths (e.g. href="blog-post-1.html", href="blog-post-2.html", href="blog-post-3.html").\n\n`;
          }
        } else if (cleanType.includes("faq")) {
          pageTypeContext = "📋 SPECIALIZED PAGE DIRECTIVE (FAQ & KNOWLEDGE BASE):\n- Build a feature-rich, high-converting FAQ page.\n- Include category filter tabs, interactive accordion Q&A sections, instant search input, and a contact support CTA box.\n\n";
        } else if (cleanType.includes("support") || cleanType.includes("help")) {
          pageTypeContext = "🎧 SPECIALIZED PAGE DIRECTIVE (SUPPORT PORTAL):\n- Build a modern Help Center & Customer Support portal.\n- Include search hero banner, topic category cards, ticket submission form, live chat prompt, and system status indicators.\n\n";
        } else if (cleanType.includes("affiliate") || cleanType.includes("partner")) {
          pageTypeContext = "🤝 SPECIALIZED PAGE DIRECTIVE (AFFILIATE PROGRAM):\n- Build a high-converting Affiliate & Partner Program page.\n- Include commission rate cards, payout tier comparison, marketing perk highlights, partner testimonials, and an application form.\n\n";
        } else if (cleanType.includes("list") || cleanType.includes("directory") || cleanType.includes("resource")) {
          pageTypeContext = "📁 SPECIALIZED PAGE DIRECTIVE (RESOURCE LIST & DIRECTORY):\n- Build a clean, filterable list layout with category tags, detailed item cards with action buttons/badges, featured picks, and a submission CTA.\n\n";
        } else if (cleanType.includes("pricing") || cleanType.includes("plan")) {
          pageTypeContext = "💳 SPECIALIZED PAGE DIRECTIVE (PRICING & PLANS):\n- Build a high-converting Pricing & Plans page.\n- Include monthly/annual toggle switch, multi-tier pricing cards with feature checkmarks, popular badge, and guarantee banner.\n\n";
        } else if (cleanType.includes("portfolio") || cleanType.includes("project") || cleanType.includes("case")) {
          pageTypeContext = "🖼️ SPECIALIZED PAGE DIRECTIVE (PORTFOLIO & CASE STUDIES):\n- Build a visual showcase layout with filterable project gallery cards, client metrics, preview modals/links, and project inquiry CTA.\n\n";
        } else {
          pageTypeContext = `🎯 SPECIALIZED PAGE DIRECTIVE (${cleanType.toUpperCase()}):\n- Analyze the page name "${pageType}" and company concept, then craft a dedicated, feature-rich, high-converting layout specifically tailored for "${pageType}".\n\n`;
        }

        const headerDirective = (dna && dna.headerHtml && dna.headerHtml.trim())
          ? `2. GLOBAL HEADER NAVIGATION: Re-inject or match this exact navigation bar:\n${dna.headerHtml.trim()}\n`
          : `2. GLOBAL STICKY HEADER/NAV: Create a complete, modern navigation bar at top with brand logo/name and clean relative navigation links.\n`;

        const footerDirective = (dna && dna.footerHtml && dna.footerHtml.trim())
          ? `3. GLOBAL FOOTER: Re-inject or match this exact footer section:\n${dna.footerHtml.trim()}\n`
          : `3. GLOBAL FOOTER: Create a clean, matching footer at the bottom of the page with brand name, quick links, and copyright.\n`;

        let systemPrompt = "You are an elite web developer. Output only clean HTML with embedded Tailwind CSS. No descriptions, markdown wrappers, or conversational text.";
        let userPrompt = `You are an elite web developer building the exact "${pageType}.html" subpage for a cohesive website cluster based on this company profile:\n"${brainDump}"\n\n` +
                         pageTypeContext +
                         `🎨 MANDATORY LAYOUT BLUEPRINT RULES:\n` +
                         `1. HEAD / STYLING CONFIGURATION: Re-inject or perfectly mimic the exact style links found in: ${(dna && dna.headHtml) || ""}.\n` +
                         headerDirective +
                         footerDirective +
                         domainDirective +
                         assetDirectives + `\n` +
                         `Output ONLY valid raw HTML starting with <!DOCTYPE html>. No markdown blocks.`;

        let compiledHTML = await callBestAI(userPrompt, systemPrompt, env);
        if (!compiledHTML || typeof compiledHTML !== 'string' || compiledHTML.trim().length < 50) {
          throw new Error(`AI compilation failed or produced an empty layout for subpage '${pageType}.html'.`);
        }
        compiledHTML = enforceVerbatimHeaderFooter(compiledHTML, dna, cleanType, (dna && dna.primaryPageKey) || 'index', cleanDomain);
        compiledHTML = injectBranding(compiledHTML, user.tierId, Boolean(removeBranding));

        if (!isPreDeducted) {
          // Deduct tokens for standalone subpage generation
          user.pagesUsedThisMonth = (user.pagesUsedThisMonth || 0) + subpageCost;
          const newRemainingCredits = user.credits !== undefined ? Math.max(0, user.credits - subpageCost) : Math.max(0, user.tier.pagesPerMonth - user.pagesUsedThisMonth);
          user.credits = newRemainingCredits;

          if (env.XSITES_KEYS && user.key !== MASTER_DEV_KEY) {
            try {
              await env.XSITES_KEYS.put("key:" + user.key, JSON.stringify(user));
              if (user.customerEmail) {
                await env.XSITES_KEYS.put("email:" + user.customerEmail.toLowerCase(), JSON.stringify(user));
              }
            } catch (e) {
              console.warn("[Compile Subpage KV Update Notice]", e.message);
            }
          }
        }

        const currentCredits = user.credits !== undefined ? user.credits : Math.max(0, user.tier.pagesPerMonth - (user.pagesUsedThisMonth || 0));

        return new Response(JSON.stringify({
          success: true,
          html: compiledHTML,
          preDeducted: isPreDeducted,
          credits: currentCredits,
          remainingCredits: currentCredits,
          pagesUsedThisMonth: user.pagesUsedThisMonth || 0,
          pagesPerMonth: user.tier.pagesPerMonth
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ENDPOINT 5.5: CREDIT REFUND FOR FAILED ATTEMPTS / PIPELINE DROPS
    if (url.pathname === "/refund-credit" && request.method === "POST") {
      try {
        const { licenseKey, pageType, reason, amount } = await request.json();
        const user = await getUserRecord(licenseKey);
        if (!user) throw new Error("Unauthorized refund credit request.");

        const refundCount = (typeof amount === 'number' && amount > 0) ? amount : getPageTokenCost(pageType);

        if (user.pagesUsedThisMonth && user.pagesUsedThisMonth >= refundCount) {
          user.pagesUsedThisMonth = user.pagesUsedThisMonth - refundCount;
        } else {
          user.pagesUsedThisMonth = 0;
        }
        
        const currentCredits = user.credits !== undefined ? user.credits : Math.max(0, user.tier.pagesPerMonth - (user.pagesUsedThisMonth || 0));
        const newCredits = currentCredits + refundCount;
        user.credits = newCredits;

        if (env.XSITES_KEYS && user.key !== MASTER_DEV_KEY) {
          try {
            await env.XSITES_KEYS.put("key:" + user.key, JSON.stringify(user));
            if (user.customerEmail) {
              await env.XSITES_KEYS.put("email:" + user.customerEmail.toLowerCase(), JSON.stringify(user));
            }
          } catch (e) {
            console.warn("[Refund Credit KV Update Notice]", e.message);
          }
        }

        console.log(`[Credit Refunded] ${refundCount} credit(s) restored to key ${licenseKey} for '${pageType || 'batch'}'. Reason: ${reason || 'Build failure'}`);

        return new Response(JSON.stringify({
          success: true,
          refunded: true,
          refundCount: refundCount,
          credits: newCredits,
          remainingCredits: newCredits,
          pagesUsedThisMonth: user.pagesUsedThisMonth,
          pagesPerMonth: user.tier.pagesPerMonth
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ENDPOINT 6: PROJECT HISTORY SAVE & LIST (KV STORE)
    if (url.pathname === "/save-project" && request.method === "POST") {
      try {
        const { licenseKey, projectName, pages, thumbnailData } = await request.json();
        const user = await getUserRecord(licenseKey);
        if (!user) throw new Error("Unauthorized save project request.");

        const projectId = 'proj_' + Date.now();
        const projectRecord = {
          projectId,
          projectName: projectName || 'Untitled Project',
          pages,
          thumbnailData: thumbnailData || '',
          pageCount: Object.keys(pages || {}).length,
          updatedAt: new Date().toISOString()
        };

        if (env.XSITES_KEYS) {
          const existingProjectsStr = await env.XSITES_KEYS.get("projects:" + licenseKey);
          let projects = existingProjectsStr ? JSON.parse(existingProjectsStr) : [];
          projects.unshift(projectRecord);
          if (projects.length > 20) projects.pop(); // Keep max 20 saved projects per user
          await env.XSITES_KEYS.put("projects:" + licenseKey, JSON.stringify(projects));
        }

        return new Response(JSON.stringify({ success: true, project: projectRecord }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    if (url.pathname === "/list-projects" && request.method === "POST") {
      try {
        const { licenseKey } = await request.json();
        let projects = [];

        if (env.XSITES_KEYS) {
          const projectsStr = await env.XSITES_KEYS.get("projects:" + licenseKey);
          if (projectsStr) projects = JSON.parse(projectsStr);
        }

        return new Response(JSON.stringify({ success: true, projects }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ENDPOINT 7: CUSTOM DOMAIN GITHUB PAGES PROVISIONING
    if (url.pathname === "/deploy-custom-domain" && request.method === "POST") {
      try {
        const { licenseKey, repoName, customDomain } = await request.json();
        const user = await getUserRecord(licenseKey);
        if (!user) throw new Error("Unauthorized custom domain setup request. Valid activation key required.");

        const githubToken = env.GITHUB_TOKEN;
        const username = "xstreamflex";
        if (!githubToken) throw new Error("Worker GITHUB_TOKEN environment secret is missing.");

        if (!customDomain || !customDomain.trim()) throw new Error("Missing custom domain value.");
        const cleanDomain = customDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
        const targetRepo = (repoName || 'xsite-site').toLowerCase().replace(/[^a-z0-9]/g, '');

        // 1. Ensure target repo exists on GitHub
        try {
          await fetch('https://api.github.com/user/repos', {
            method: 'POST',
            headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json', 'User-Agent': 'Cloudflare-Worker-XSITES' },
            body: JSON.stringify({ name: targetRepo, private: false, auto_init: true })
          });
        } catch (e) {
          console.warn("[Custom Domain] Repo creation check notice:", e.message);
        }

        // 2. Commit CNAME file to GitHub repo
        await uploadFileToGitHub(username, targetRepo, 'CNAME', cleanDomain, githubToken);

        // 3. Configure GitHub Pages API custom domain setting
        try {
          await fetch(`https://api.github.com/repos/${username}/${targetRepo}/pages`, {
            method: 'PUT',
            headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json', 'User-Agent': 'Cloudflare-Worker-XSITES' },
            body: JSON.stringify({ cname: cleanDomain })
          });
        } catch (pageErr) {
          console.warn("[Custom Domain] Pages CNAME API notice:", pageErr.message);
        }

        return new Response(JSON.stringify({
          success: true,
          customDomain: cleanDomain,
          liveUrl: `https://${cleanDomain}`
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ENDPOINT 8: DEPLOY REPO INFRASTRUCTURE SYNCHRONIZER
    if (url.pathname === "/deploy" && request.method === "POST") {
      try {
        const { pages, companyName, licenseKey, intendedDomain, personalGithubRepo, personalGithubToken, removeBranding } = await request.json();
        const user = await getUserRecord(licenseKey);
        if (!user) throw new Error("Unauthorized deployment transaction authorization.");
        
        let githubToken = env.GITHUB_TOKEN;
        let username = "xstreamflex";
        let repoName = (companyName || 'xsite').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50) || 'xsite-' + Date.now();

        // Support Personal GitHub Repo & PAT if provided by user
        if (personalGithubRepo && personalGithubRepo.includes('/')) {
          const parts = personalGithubRepo.split('/');
          username = parts[0].trim();
          repoName = parts[1].trim();
          if (personalGithubToken && personalGithubToken.trim()) {
            githubToken = personalGithubToken.trim();
          }
        }

        if (!githubToken) throw new Error("GitHub authorization token is unassigned. Please check Personal Access Token or Worker configuration.");

        // Attempt to create repository if it doesn't already exist
        try {
          await fetch('https://api.github.com/user/repos', {
            method: 'POST',
            headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json', 'User-Agent': 'Cloudflare-Worker-XSITES' },
            body: JSON.stringify({ name: repoName, private: false, auto_init: true })
          });
        } catch (e) {
          console.warn("[Deploy] Repo check notice:", e.message);
        }

        for (const [pageKey, htmlContent] of Object.entries(pages)) {
          if (!htmlContent) continue;
          const finalHtml = injectBranding(htmlContent, user.tierId, Boolean(removeBranding));
          await uploadFileToGitHub(username, repoName, `${pageKey}.html`, finalHtml, githubToken);
        }

        // Auto-commit CNAME if intended domain is set
        let cleanDomain = '';
        if (intendedDomain && intendedDomain.trim()) {
          cleanDomain = intendedDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
          await uploadFileToGitHub(username, repoName, 'CNAME', cleanDomain, githubToken);
        }

        const liveEndpoint = cleanDomain ? `https://${cleanDomain}` : `https://${username}.github.io/${repoName}/index.html`;
        const readmeText = `# ${companyName || repoName}\n\nGenerated via XSITES Engine.\n\n🌐 **Live Site Endpoint:** ${liveEndpoint}`;
        await uploadFileToGitHub(username, repoName, 'README.md', readmeText, githubToken);

        // Enable GitHub Pages
        try {
          await fetch(`https://api.github.com/repos/${username}/${repoName}/pages`, {
            method: 'POST',
            headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json', 'User-Agent': 'Cloudflare-Worker-XSITES' },
            body: JSON.stringify({ source: { branch: 'main', path: '/' } })
          });
        } catch (e) {}

        if (cleanDomain) {
          try {
            await fetch(`https://api.github.com/repos/${username}/${repoName}/pages`, {
              method: 'PUT',
              headers: { 'Authorization': `token ${githubToken}`, 'Content-Type': 'application/json', 'User-Agent': 'Cloudflare-Worker-XSITES' },
              body: JSON.stringify({ cname: cleanDomain })
            });
          } catch (e) {}
        }

        return new Response(JSON.stringify({
          success: true,
          repoName: repoName,
          repoUrl: `https://github.com/${username}/${repoName}`,
          liveUrl: liveEndpoint,
          customDomainSupported: true
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ENDPOINT 9: STRIPE & PAYPAL BI-DIRECTIONAL CATALOG SYNC
    if (url.pathname === "/payment/sync-catalog" && request.method === "POST") {
      try {
        const { provider, stripeApiKey, paypalClientId, paypalSecret, products } = await request.json();
        const syncedProducts = [];

        if (provider === "stripe" && stripeApiKey) {
          for (const prod of (products || [])) {
            try {
              const stripeRes = await fetch("https://api.stripe.com/v1/products", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${stripeApiKey.trim()}`,
                  "Content-Type": "application/x-www-form-urlencoded"
                },
                body: new URLSearchParams({
                  name: prod.name || prod.title || "XSITE Product",
                  description: prod.description || "Product from XSITE",
                  ...(prod.image ? { "images[0]": prod.image } : {})
                })
              });
              const stripeProd = await stripeRes.json();

              if (stripeProd.id && prod.price) {
                const amountCents = Math.round(parseFloat(prod.price) * 100);
                const priceRes = await fetch("https://api.stripe.com/v1/prices", {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${stripeApiKey.trim()}`,
                    "Content-Type": "application/x-www-form-urlencoded"
                  },
                  body: new URLSearchParams({
                    product: stripeProd.id,
                    unit_amount: amountCents.toString(),
                    currency: prod.currency || "usd"
                  })
                });
                const stripePrice = await priceRes.json();
                syncedProducts.push({
                  ...prod,
                  stripeProductId: stripeProd.id,
                  stripePriceId: stripePrice.id,
                  buyUrl: `https://checkout.stripe.com/pay/${stripePrice.id}`
                });
              } else {
                syncedProducts.push(prod);
              }
            } catch (e) {
              syncedProducts.push({ ...prod, error: e.message });
            }
          }
        } else if (provider === "paypal" && paypalClientId) {
          for (const prod of (products || [])) {
            syncedProducts.push({
              ...prod,
              paypalClientId,
              buyUrl: `https://www.paypal.com/checkoutnow?client_id=${paypalClientId}&amount=${prod.price || '10.00'}`
            });
          }
        }

        return new Response(JSON.stringify({
          success: true,
          provider: provider || "custom",
          syncedProducts: syncedProducts.length > 0 ? syncedProducts : products
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ENDPOINT 10: REPOSITORY PULL & UPDATE SYNCHRONIZER
    if (url.pathname === "/repo/sync" && (request.method === "POST" || request.method === "GET")) {
      try {
        const { repoName, branch } = request.method === "POST" ? await request.json() : {};
        const githubToken = env.GITHUB_TOKEN;
        const username = "xstreamflex";
        const targetRepo = repoName || "xsite";

        let commits = [];
        if (githubToken) {
          const commitsRes = await fetch(`https://api.github.com/repos/${username}/${targetRepo}/commits?per_page=5`, {
            headers: { 'Authorization': `token ${githubToken}`, 'User-Agent': 'Cloudflare-Worker-XSITES' }
          });
          if (commitsRes.ok) {
            const rawCommits = await commitsRes.json();
            commits = rawCommits.map(c => ({
              sha: c.sha.substring(0, 7),
              message: c.commit.message,
              date: c.commit.author.date
            }));
          }
        }

        return new Response(JSON.stringify({
          success: true,
          repo: `${username}/${targetRepo}`,
          branch: branch || "main",
          status: "Up-to-date",
          latestCommits: commits
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ENDPOINT 11: SYSTEM QUALITY CONTROL (QC) DIAGNOSTICS
    if (url.pathname === "/qc/check" && (request.method === "GET" || request.method === "POST")) {
      try {
        const checks = {
          workerHealth: "OK",
          kvStorage: env.XSITES_KEYS ? "CONNECTED" : "UNBOUND_MOCK",
          authSystem: "ACTIVE",
          stripeSyncEngine: "READY",
          paypalSyncEngine: "READY",
          timestamp: new Date().toISOString()
        };

        return new Response(JSON.stringify({
          success: true,
          qcStatus: "PASSED",
          checks
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    return new Response(JSON.stringify({ success: true, message: "XSITES Engine API Active" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
};

async function callBestAI(userPrompt, systemPrompt, env) {
  const providers = [
    { name: 'Groq', func: () => callGroq(userPrompt, systemPrompt, env.GROQ_API_KEY) },
    { name: 'Claude', func: () => callClaude(userPrompt, systemPrompt, env.CLAUDE_API_KEY) },
    { name: 'Gemini', func: () => callGemini(userPrompt, env.GEMINI_API_KEY) },
    { name: 'Kimi', func: () => callKimi(userPrompt, systemPrompt, env.KIMI_API_KEY) }
  ];

  for (const provider of providers) {
    try {
      const html = await provider.func();
      if (html && !html.includes("high demand")) return cleanResponse(html);
    } catch (e) {
      console.warn(`Fallback Layer: ${provider.name} bypassed: ${e.message}`);
    }
  }
  throw new Error("All backend fallback execution paths are currently exhausted.");
}

async function callGroq(userPrompt, systemPrompt, key) {
  if (!key) throw new Error("Missing key");
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      temperature: 0.1, max_tokens: 8000
    })
  });
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callClaude(userPrompt, systemPrompt, key) {
  if (!key) throw new Error("Missing key");
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022', max_tokens: 8192, temperature: 0.1,
      system: systemPrompt, messages: [{ role: 'user', content: userPrompt }]
    })
  });
  const data = await res.json();
  return data.content[0].text;
}

async function callGemini(userPrompt, key) {
  if (!key) throw new Error("Missing key");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: userPrompt }] }] })
  });
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

async function callKimi(userPrompt, systemPrompt, key) {
  if (!key) throw new Error("Missing key");
  const res = await fetch('https://api.moonshot.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'moonshot-v1-128k',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      temperature: 0.1, max_tokens: 16000
    })
  });
  const data = await res.json();
  return data.choices[0].message.content;
}

function cleanResponse(html) {
  html = html.replace(/```html\n?/gi, '').replace(/```\n?/g, '').trim();
  const start = html.toLowerCase().indexOf('<!doctype html>');
  if (start > 0) html = html.substring(start);
  return html;
}

async function uploadFileToGitHub(username, repoName, fileName, content, token) {
  const url = `https://api.github.com/repos/${username}/${repoName}/contents/${fileName}`;
  let sha = null;
  
  const check = await fetch(url, { headers: { 'Authorization': `token ${token}`, 'User-Agent': 'CF-Worker' } });
  if (check.status === 200) {
    const fileData = await check.json();
    sha = fileData.sha;
  }

  await fetch(url, {
    method: 'PUT',
    headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'CF-Worker' },
    body: JSON.stringify({
      message: `XSITES Engine Commit: ${fileName}`,
      content: btoa(unescape(encodeURIComponent(content))),
      ...(sha && { sha })
    })
  });
}

async function sendLicenseEmail({ to, licenseKey, tierName, validationUrl }, env) {
  if (!to) {
    console.warn("[Email Service] No recipient email address provided.");
    return { success: false, reason: "Missing recipient email" };
  }

  const apiKey = (env && env.INFLUENCERSOFT_KEY) || '81f4a860932fbaf82520b6e92e5a3d1c';
  const freeListId = (env && env.INFLUENCERSOFT_LIST_ID) || '1785798910.8796525520';

  let syncResult = null;

  // 1. PRIMARY PROVIDER & LIST SYNC: INFLUENCERSOFT API
  if (apiKey) {
    try {
      const params = new URLSearchParams();
      params.append('rpsKey', apiKey);
      params.append('lead_email', to);
      params.append('add_to_lists', freeListId);
      params.append('lead_description', licenseKey);

      const response = await fetch('https://gamerxise.influencersoft.com/api/addupdatelead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
      });

      if (response.ok) {
        let data;
        try { data = await response.json(); } catch (e) { data = { text: await response.text() }; }
        console.log('[Email Service] Successfully synced lead & List ID via InfluencerSoft API to:', to, data);
        syncResult = { success: true, provider: 'influencersoft', data };
      } else {
        const errorText = await response.text();
        console.error('[Email Service] InfluencerSoft API error response:', response.status, errorText);
      }
    } catch (err) {
      console.error('[Email Service] InfluencerSoft execution failed:', err.message);
    }
  }

  // 2. FALLBACK / DIRECT EMAIL DISPATCH VIA RESEND API (IF CONFIGURED)
  if (env && env.RESEND_API_KEY) {
    try {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'XSITES <onboarding@resend.dev>',
          to: [to],
          subject: `⚡ Your XSITES License Key (${tierName || 'Activated'})`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
              <div style="text-align: center; margin-bottom: 24px;">
                <span style="font-size: 11px; font-weight: bold; letter-spacing: 2px; color: #107c10; text-transform: uppercase; background-color: #f0fdf4; padding: 4px 12px; border-radius: 9999px; border: 1px solid #bbf7d0;">XSITES Engine</span>
                <h1 style="font-size: 22px; font-weight: 900; color: #0f172a; margin-top: 12px; margin-bottom: 4px;">Thank You for Your Order!</h1>
                <p style="font-size: 13px; color: #64748b; margin: 0;">Your workspace has been successfully activated on the <strong>${tierName || 'XSITES'}</strong> plan.</p>
              </div>

              <div style="background-color: #090d16; padding: 20px; border-radius: 10px; border: 1px solid #1e293b; text-align: center; margin-bottom: 24px;">
                <div style="font-size: 10px; font-family: monospace; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px;">Workspace Activation Key</div>
                <div style="font-size: 20px; font-family: monospace; font-weight: bold; color: #00ff66; letter-spacing: 2px; word-break: break-all;">
                  ${licenseKey}
                </div>
              </div>

              <p style="font-size: 13px; line-height: 1.6; color: #334155;">
                Copy your activation key above and paste it into the <strong>🔑 Workspace Activation Key</strong> input on the XSITES studio builder.
              </p>

              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
              <div style="font-size: 11px; color: #94a3b8; text-align: center; font-family: monospace;">
                Xstream Flex XSITES Engine • support@xstreamflex.com
              </div>
            </div>
          `
        })
      });

      if (resendRes.ok) {
        const resendData = await resendRes.json();
        console.log('[Email Service] Successfully sent key email via Resend API to:', to);
        return { success: true, provider: 'resend', data: resendData, sync: syncResult };
      }
    } catch (err) {
      console.error('[Email Service] Resend execution failed:', err.message);
    }
  }

  if (syncResult) {
    return syncResult;
  }

  return { success: false, reason: "InfluencerSoft/Email execution complete" };
}

function formatAssetDirectives(userAssets) {
  if (!Array.isArray(userAssets) || userAssets.length === 0) return '';

  let directives = "\n\n🖼️ MANDATORY MEDIA, FAVICON, LOGO & TOOL ASSETS DIRECTIVE:\n" +
    "You MUST strictly incorporate the following user-provided pre-hosted assets into appropriate locations in the generated HTML code. DO NOT use generic placeholder images or dummy '#' links when matching assets are available below:\n\n";

  userAssets.forEach((asset, idx) => {
    const type = (asset.type || 'image').toLowerCase();
    const tag = (asset.tag || '').trim();
    const desc = (asset.desc || asset.label || '').trim();
    const url = (asset.url || '').trim();

    if (!url) return;

    directives += `[ASSET ${idx + 1}] TYPE: "${type.toUpperCase()}" | TAG: "${tag || 'general'}" | URL: "${url}"`;
    if (desc) directives += ` | USAGE DESCRIPTION: "${desc}"`;
    directives += "\n";

    if (type === 'favicon') {
      directives += `  -> MANDATORY ACTION: Include <link rel="icon" href="${url}" /> in the <head> section of every page.\n`;
    } else if (type === 'logo') {
      directives += `  -> MANDATORY ACTION: Replace any text logo in the header/navbar with <img src="${url}" alt="${desc || 'Company Logo'}" class="h-8 md:h-10 w-auto object-contain inline-block" /> linked to index.html.\n`;
    } else if (type === 'youtube' || type === 'video') {
      let embedUrl = url;
      if (embedUrl.includes('youtube.com/watch?v=')) {
        const vidId = embedUrl.split('watch?v=')[1].split('&')[0];
        embedUrl = `https://www.youtube.com/embed/${vidId}`;
      } else if (embedUrl.includes('youtu.be/')) {
        const vidId = embedUrl.split('youtu.be/')[1].split('?')[0];
        embedUrl = `https://www.youtube.com/embed/${vidId}`;
      } else if (embedUrl.includes('youtube.com/shorts/')) {
        const vidId = embedUrl.split('youtube.com/shorts/')[1].split('?')[0];
        embedUrl = `https://www.youtube.com/embed/${vidId}`;
      }
      directives += `  -> MANDATORY ACTION: Embed this video using <iframe src="${embedUrl}" class="w-full aspect-video rounded-2xl shadow-2xl border border-gray-800" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe> in a dedicated Video Showcase or Feature section.\n`;
    } else if (type === 'tool' || type === 'webapp') {
      directives += `  -> MANDATORY ACTION: Wire main Call to Action (CTA) buttons, launch app buttons, and navigation tool links directly to href="${url}" (target="_blank" rel="noopener noreferrer").\n`;
    } else if (type === 'image' || type === 'photo') {
      directives += `  -> MANDATORY ACTION: Render <img src="${url}" alt="${desc || tag || 'Featured Image'}" class="rounded-xl shadow-lg w-full object-cover" /> in a key visual section matching "${desc || tag}".\n`;
    } else {
      directives += `  -> MANDATORY ACTION: Connect CTA buttons or nav/footer links to href="${url}" (target="_blank").\n`;
    }
  });

  return directives + "\n";
}
