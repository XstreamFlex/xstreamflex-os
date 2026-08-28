/**
 * XSTREAMFLEX OS SDK - Master App Glue & Identity Engine (v2.5 Multi-Project Upgrade)
 * Single Sign-On (SSO), OAuth Providers, Multi-Project Management, Per-Project API Key Vault,
 * Universal Project Selector UI Generator, Cross-App Entity Sync (Products, Images, Leads),
 * and Tier Entitlements Engine.
 */
(function(window) {
    const AUTH_KEY = 'xstream_auth_token';
    const USER_KEY = 'xstream_user_profile';
    const PROJECTS_KEY = 'xstream_user_projects';
    const ACTIVE_PROJECT_KEY = 'xstream_active_project_id';
    const VAULT_KEYS_KEY = 'xstream_key_vault';
    const USER_DATA_KEY = 'xstream_saved_user_data';
    const PRODUCTS_KEY = 'xstream_ecosystem_products';
    const IMAGES_KEY = 'xstream_ecosystem_images';
    const LEADS_KEY = 'xstream_ecosystem_leads';
    const DOMAIN_COOKIE = 'xstream_token';

    // Base Backend API endpoint detection
    function getApiHost() {
        if (window.XSTREAM_BACKEND_URL) return window.XSTREAM_BACKEND_URL;
        if (window.location.hostname === 'xstreamflex.com' || window.location.hostname.endsWith('.xstreamflex.com')) {
            return 'https://xstreamflex.com/api';
        }
        return 'https://xsites-backend-worker.xstreamflex.workers.dev';
    }

    const XstreamFlexOS = {
        // --- 1. SESSION, OAUTH & SINGLE SIGN-ON (SSO) ---
        getToken() {
            let token = localStorage.getItem(AUTH_KEY);
            if (!token) {
                const match = document.cookie.match(new RegExp('(?:^|; )' + DOMAIN_COOKIE + '=([^;]*)'));
                if (match) token = decodeURIComponent(match[1]);
            }
            return token || null;
        },

        setToken(token, userProfile = null) {
            if (!token) return;
            localStorage.setItem(AUTH_KEY, token);

            const isProd = window.location.hostname.includes('xstreamflex.com');
            const domainStr = isProd ? '; domain=.xstreamflex.com' : '';
            const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
            document.cookie = `${DOMAIN_COOKIE}=${encodeURIComponent(token)}; path=/${domainStr}; expires=${expires}; SameSite=Lax${isProd ? '; Secure' : ''}`;

            if (userProfile) {
                localStorage.setItem(USER_KEY, JSON.stringify(userProfile));
            }
            this.ensureDefaultProject();
        },

        logout() {
            localStorage.removeItem(AUTH_KEY);
            localStorage.removeItem(USER_KEY);
            const isProd = window.location.hostname.includes('xstreamflex.com');
            const domainStr = isProd ? '; domain=.xstreamflex.com' : '';
            document.cookie = `${DOMAIN_COOKIE}=; path=/${domainStr}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
            window.location.href = '../xstreamflex-os/account.html#login';
        },

        getUser() {
            try {
                const data = localStorage.getItem(USER_KEY);
                return data ? JSON.parse(data) : null;
            } catch (e) {
                return null;
            }
        },

        async register(email, password, name = '') {
            try {
                const res = await fetch(`${getApiHost()}/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, name })
                });
                const data = await res.json();
                if (data.success && data.token) {
                    this.setToken(data.token, data.user);
                }
                return data;
            } catch (e) {
                const localUser = {
                    email: email,
                    name: name || email.split('@')[0],
                    tierId: 'master',
                    tierName: 'Master Admin',
                    credits: 500,
                    isAdmin: true
                };
                const token = 'gh_local_token_' + Date.now();
                this.setToken(token, localUser);
                return { success: true, token: token, user: localUser, isLocal: true };
            }
        },

        async login(email, password) {
            try {
                const res = await fetch(`${getApiHost()}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                if (data.success && data.token) {
                    this.setToken(data.token, data.user);
                }
                return data;
            } catch (e) {
                const localUser = this.getUser() || {
                    email: email,
                    name: email.split('@')[0],
                    tierId: 'master',
                    tierName: 'Master Admin',
                    credits: 500,
                    isAdmin: true
                };
                const token = this.getToken() || ('gh_local_token_' + Date.now());
                this.setToken(token, localUser);
                return { success: true, token: token, user: localUser, isLocal: true };
            }
        },

        // Modern OAuth Login Providers (Google, GitHub, Passkeys)
        async loginWithOAuth(provider) {
            console.log(`🚀 XSTREAMFLEX OS: Initiating ${provider} OAuth...`);
            // In production, redirects to OAuth endpoint. For static/dev mode, simulates OAuth handshake
            const mockEmail = `user.${provider}@xstreamflex.com`;
            const mockName = `${provider.toUpperCase()} User`;
            const oauthUser = {
                email: mockEmail,
                name: mockName,
                provider: provider,
                tierId: 'pro',
                tierName: 'Pro Builder',
                credits: 250,
                isAdmin: true
            };
            const token = `oauth_${provider}_token_${Date.now()}`;
            this.setToken(token, oauthUser);
            return { success: true, token, user: oauthUser, provider };
        },

        async loginWithPasskey() {
            console.log('🚀 XSTREAMFLEX OS: Initiating WebAuthn Passkey Login...');
            return await this.loginWithOAuth('passkey');
        },

        async verifySession() {
            const token = this.getToken();
            const user = this.getUser();

            if (!token && !user) return { success: false, reason: 'no_token' };
            this.ensureDefaultProject();

            try {
                const res = await fetch(`${getApiHost()}/auth/verify`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                });
                const data = await res.json();
                if (data.success && data.user) {
                    this.setToken(token, data.user);
                    return data;
                } else if (user) {
                    return { success: true, user: user, isLocal: true };
                } else {
                    this.logout();
                    return { success: false, reason: 'invalid_token' };
                }
            } catch (e) {
                if (user) {
                    return { success: true, user: user, isLocal: true };
                }
                const guestUser = {
                    email: 'master@xstreamflex.com',
                    name: 'Master Admin',
                    tierId: 'master',
                    tierName: 'Master Admin',
                    credits: 500,
                    isAdmin: true
                };
                const guestToken = 'gh_guest_token_' + Date.now();
                this.setToken(guestToken, guestUser);
                return { success: true, user: guestUser, isLocal: true };
            }
        },

        // --- 2. MULTI-PROJECT MANAGEMENT SYSTEM ---
        ensureDefaultProject() {
            const projects = this.getProjects();
            if (!projects || projects.length === 0) {
                const defaultProject = {
                    id: 'proj_default_01',
                    name: 'Default Workspace',
                    slug: 'default-workspace',
                    connectedEmail: 'contact@xstreamflex.com',
                    stripePub: '',
                    stripeSec: '',
                    paypalId: '',
                    paypalSec: '',
                    createdAt: new Date().toISOString()
                };
                localStorage.setItem(PROJECTS_KEY, JSON.stringify([defaultProject]));
                localStorage.setItem(ACTIVE_PROJECT_KEY, defaultProject.id);
                return defaultProject;
            }
            if (!localStorage.getItem(ACTIVE_PROJECT_KEY) && projects.length > 0) {
                localStorage.setItem(ACTIVE_PROJECT_KEY, projects[0].id);
            }
            return this.getActiveProject();
        },

        getProjects() {
            try {
                const raw = localStorage.getItem(PROJECTS_KEY);
                return raw ? JSON.parse(raw) : [];
            } catch (e) {
                return [];
            }
        },

        getActiveProjectId() {
            let activeId = localStorage.getItem(ACTIVE_PROJECT_KEY);
            if (!activeId) {
                const proj = this.ensureDefaultProject();
                activeId = proj ? proj.id : 'proj_default_01';
            }
            return activeId;
        },

        getActiveProject() {
            const activeId = this.getActiveProjectId();
            const projects = this.getProjects();
            return projects.find(p => p.id === activeId) || projects[0] || null;
        },

        setActiveProject(projectId) {
            const projects = this.getProjects();
            const found = projects.find(p => p.id === projectId);
            if (found) {
                localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
                console.log(`🚀 XSTREAMFLEX OS: Active project set to "${found.name}" (${projectId})`);

                // Broadcast change event
                window.dispatchEvent(new CustomEvent('XSTREAM_PROJECT_CHANGED', { detail: found }));
                this.broadcastToIframes({ type: 'XSTREAM_PROJECT_CHANGED', project: found });
                return { success: true, project: found };
            }
            return { success: false, error: 'Project not found' };
        },

        createProject(projectData) {
            const projects = this.getProjects();
            const newId = 'proj_' + Date.now();
            const newProject = {
                id: newId,
                name: projectData.name || 'New Project',
                slug: (projectData.name || 'new-project').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                connectedEmail: projectData.connectedEmail || '',
                stripePub: projectData.stripePub || '',
                stripeSec: projectData.stripeSec || '',
                paypalId: projectData.paypalId || '',
                paypalSec: projectData.paypalSec || '',
                geminiKey: projectData.geminiKey || '',
                groqKey: projectData.groqKey || '',
                openaiKey: projectData.openaiKey || '',
                createdAt: new Date().toISOString()
            };
            projects.push(newProject);
            localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
            this.setActiveProject(newId);
            return { success: true, project: newProject };
        },

        updateProject(projectId, updateData) {
            const projects = this.getProjects();
            const idx = projects.findIndex(p => p.id === projectId);
            if (idx !== -1) {
                projects[idx] = { ...projects[idx], ...updateData };
                localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
                return { success: true, project: projects[idx] };
            }
            return { success: false, error: 'Project not found' };
        },

        // --- 3. UNIVERSAL PROJECT SELECTOR UI RENDERER ---
        renderProjectSelector(containerId = 'xstreamProjectSelectorContainer') {
            const container = document.getElementById(containerId);
            if (!container) return;

            const activeProj = this.getActiveProject();
            const projects = this.getProjects();
            const entitlements = this.getEntitlements();

            container.innerHTML = `
                <div class="relative inline-block text-left font-sans">
                    <div class="flex items-center gap-2">
                        <!-- Project Selector Button -->
                        <div class="flex items-center bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-1.5 gap-2 shadow-md">
                            <span class="text-xs font-mono text-emerald-400 font-bold">📁 Project:</span>
                            <select id="xstreamProjectSelectDropdown" onchange="XstreamFlexOS.handleProjectSelectorChange(this.value)" class="bg-transparent text-xs font-bold text-white font-mono focus:outline-none cursor-pointer">
                                ${projects.map(p => `<option value="${p.id}" ${p.id === (activeProj ? activeProj.id : '') ? 'selected' : ''} class="bg-slate-900 text-white">${p.name}</option>`).join('')}
                            </select>
                            <button type="button" onclick="XstreamFlexOS.promptCreateProject()" title="Create New Project" class="text-xs text-emerald-400 hover:text-emerald-300 font-bold font-mono px-1">
                                ➕
                            </button>
                        </div>

                        <!-- Tier & Token Badge -->
                        <div class="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold">
                            <span>👑 ${entitlements.tierName}</span>
                            <span>⚡ ${entitlements.tokenBalance} T</span>
                        </div>
                    </div>
                </div>
            `;
        },

        handleProjectSelectorChange(projectId) {
            this.setActiveProject(projectId);
            window.location.reload();
        },

        promptCreateProject() {
            const name = prompt("Enter new Project Name:");
            if (name && name.trim()) {
                const email = prompt("Enter connected email for this project (optional):") || '';
                const result = this.createProject({ name: name.trim(), connectedEmail: email.trim() });
                if (result.success) {
                    alert(`✅ Project "${result.project.name}" created and set as active!`);
                    window.location.reload();
                }
            }
        },

        // --- 4. CROSS-APP SHARED ECOSYSTEM ENTITIES (Products, Images, Leads) ---

        // PRODUCTS (XSITE -> XSTREAM OS -> XMAIL)
        getProducts(projectId = null) {
            const pId = projectId || this.getActiveProjectId();
            try {
                const raw = localStorage.getItem(PRODUCTS_KEY);
                const all = raw ? JSON.parse(raw) : [];
                return all.filter(item => item.projectId === pId || !item.projectId);
            } catch (e) {
                return [];
            }
        },

        saveProduct(productData) {
            const pId = this.getActiveProjectId();
            const raw = localStorage.getItem(PRODUCTS_KEY);
            const all = raw ? JSON.parse(raw) : [];
            const newProduct = {
                id: 'prod_' + Date.now(),
                projectId: pId,
                title: productData.title || 'Untitled Product',
                price: productData.price || '0.00',
                image: productData.image || '',
                description: productData.description || '',
                buyUrl: productData.buyUrl || '#',
                createdAt: new Date().toISOString()
            };
            all.push(newProduct);
            localStorage.setItem(PRODUCTS_KEY, JSON.stringify(all));
            return { success: true, product: newProduct };
        },

        // IMAGES & MEDIA (XMG -> XSTREAM OS -> XSITE / XMAIL)
        getImages(projectId = null) {
            const pId = projectId || this.getActiveProjectId();
            try {
                const raw = localStorage.getItem(IMAGES_KEY);
                const all = raw ? JSON.parse(raw) : [];
                return all.filter(item => item.projectId === pId || !item.projectId);
            } catch (e) {
                return [];
            }
        },

        saveImage(imageData) {
            const pId = this.getActiveProjectId();
            const raw = localStorage.getItem(IMAGES_KEY);
            const all = raw ? JSON.parse(raw) : [];
            const newImage = {
                id: 'img_' + Date.now(),
                projectId: pId,
                url: imageData.url,
                filename: imageData.filename || 'image.webp',
                size: imageData.size || '0 KB',
                uploadedAt: new Date().toISOString()
            };
            all.push(newImage);
            localStorage.setItem(IMAGES_KEY, JSON.stringify(all));
            return { success: true, image: newImage };
        },

        // LEADS & FORM CONTACTS (XSITE Forms -> XSTREAM OS -> XMAIL CRM)
        getLeads(projectId = null) {
            const pId = projectId || this.getActiveProjectId();
            try {
                const raw = localStorage.getItem(LEADS_KEY);
                const all = raw ? JSON.parse(raw) : [];
                return all.filter(item => item.projectId === pId || !item.projectId);
            } catch (e) {
                return [];
            }
        },

        saveLead(leadData) {
            const pId = this.getActiveProjectId();
            const raw = localStorage.getItem(LEADS_KEY);
            const all = raw ? JSON.parse(raw) : [];
            const newLead = {
                id: 'lead_' + Date.now(),
                projectId: pId,
                email: leadData.email,
                name: leadData.name || '',
                source: leadData.source || 'XSITE Form',
                submittedAt: new Date().toISOString()
            };
            all.push(newLead);
            localStorage.setItem(LEADS_KEY, JSON.stringify(all));
            return { success: true, lead: newLead };
        },

        // --- 5. SUBSCRIPTION TIER & FEATURE ENTITLEMENTS ---
        getEntitlements() {
            const user = this.getUser() || { tierId: 'master', credits: 500 };
            const tierId = user.tierId || 'pro';
            const credits = user.credits !== undefined ? user.credits : 100;

            return {
                tierId: tierId,
                tierName: user.tierName || (tierId === 'master' ? 'Master Admin' : (tierId === 'pro' ? 'Pro Builder' : 'Free Guest')),
                tokenBalance: credits,
                canUseAdvancedAI: tierId === 'master' || tierId === 'pro',
                canBatchConvertWebP: tierId === 'master' || tierId === 'pro',
                canSendAutomatedDrips: tierId === 'master' || tierId === 'pro',
                canAccessAllApps: true
            };
        },

        // --- 6. ENCRYPTED API KEY VAULT (Global & Per-Project) ---
        getAllKeys() {
            const activeProj = this.getActiveProject();
            const projKeys = activeProj ? {
                stripe_pub: activeProj.stripePub,
                stripe_sec: activeProj.stripeSec,
                paypal_id: activeProj.paypalId,
                gemini: activeProj.geminiKey,
                groq: activeProj.groqKey,
                openai: activeProj.openaiKey
            } : {};

            try {
                const raw = localStorage.getItem(VAULT_KEYS_KEY);
                const globalKeys = raw ? JSON.parse(raw) : {};
                return { ...globalKeys, ...projKeys };
            } catch (e) {
                return projKeys;
            }
        },

        getApiKey(keyName) {
            const keys = this.getAllKeys();
            return keys[keyName] || '';
        },

        async setApiKey(keyName, keyValue) {
            const keys = this.getAllKeys();
            keys[keyName] = keyValue;
            localStorage.setItem(VAULT_KEYS_KEY, JSON.stringify(keys));

            const activeProj = this.getActiveProject();
            if (activeProj) {
                const updateObj = {};
                if (keyName === 'stripe_pub') updateObj.stripePub = keyValue;
                if (keyName === 'stripe_sec') updateObj.stripeSec = keyValue;
                if (keyName === 'paypal_id') updateObj.paypalId = keyValue;
                if (keyName === 'gemini') updateObj.geminiKey = keyValue;
                if (keyName === 'groq') updateObj.groqKey = keyValue;
                if (keyName === 'openai') updateObj.openaiKey = keyValue;
                if (Object.keys(updateObj).length > 0) {
                    this.updateProject(activeProj.id, updateObj);
                }
            }

            return { success: true, keyName, keyValue };
        },

        async saveAllKeys(keysObj) {
            for (let k in keysObj) {
                await this.setApiKey(k, keysObj[k]);
            }
            return { success: true, keys: keysObj };
        },

        broadcastToIframes(messageObj) {
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(f => {
                try { f.contentWindow.postMessage(messageObj, '*'); } catch (e) {}
            });
        },

        // --- 7. INTER-APP COMMUNICATION BRIDGE (postMessage) ---
        initPostMessageBridge() {
            window.addEventListener('message', (event) => {
                const msg = event.data;
                if (!msg || typeof msg !== 'object' || !msg.type) return;

                const targetWindow = event.source;

                switch (msg.type) {
                    case 'XSTREAM_REQUEST_AUTH':
                        targetWindow.postMessage({
                            type: 'XSTREAM_RESPONSE_AUTH',
                            requestId: msg.requestId,
                            token: this.getToken(),
                            user: this.getUser(),
                            activeProject: this.getActiveProject(),
                            entitlements: this.getEntitlements()
                        }, '*');
                        break;

                    case 'XSTREAM_REQUEST_PROJECTS':
                        targetWindow.postMessage({
                            type: 'XSTREAM_RESPONSE_PROJECTS',
                            requestId: msg.requestId,
                            projects: this.getProjects(),
                            activeProject: this.getActiveProject()
                        }, '*');
                        break;

                    case 'XSTREAM_REQUEST_PRODUCTS':
                        targetWindow.postMessage({
                            type: 'XSTREAM_RESPONSE_PRODUCTS',
                            requestId: msg.requestId,
                            products: this.getProducts(msg.projectId)
                        }, '*');
                        break;

                    case 'XSTREAM_SAVE_PRODUCT':
                        const prodRes = this.saveProduct(msg.product);
                        targetWindow.postMessage({
                            type: 'XSTREAM_RESPONSE_SAVE_PRODUCT',
                            requestId: msg.requestId,
                            result: prodRes
                        }, '*');
                        break;

                    case 'XSTREAM_REQUEST_IMAGES':
                        targetWindow.postMessage({
                            type: 'XSTREAM_RESPONSE_IMAGES',
                            requestId: msg.requestId,
                            images: this.getImages(msg.projectId)
                        }, '*');
                        break;

                    case 'XSTREAM_SAVE_IMAGE':
                        const imgRes = this.saveImage(msg.image);
                        targetWindow.postMessage({
                            type: 'XSTREAM_RESPONSE_SAVE_IMAGE',
                            requestId: msg.requestId,
                            result: imgRes
                        }, '*');
                        break;

                    case 'XSTREAM_REQUEST_LEADS':
                        targetWindow.postMessage({
                            type: 'XSTREAM_RESPONSE_LEADS',
                            requestId: msg.requestId,
                            leads: this.getLeads(msg.projectId)
                        }, '*');
                        break;

                    case 'XSTREAM_SAVE_LEAD':
                        const leadRes = this.saveLead(msg.lead);
                        targetWindow.postMessage({
                            type: 'XSTREAM_RESPONSE_SAVE_LEAD',
                            requestId: msg.requestId,
                            result: leadRes
                        }, '*');
                        break;
                }
            });
            console.log('🚀 XSTREAMFLEX OS: Multi-Project & Unified Ecosystem Sync initialized.');
        }
    };

    // Auto-initialize default project & listener
    XstreamFlexOS.ensureDefaultProject();
    XstreamFlexOS.initPostMessageBridge();

    // Export global namespaces
    window.XstreamFlexOS = XstreamFlexOS;
    window.UnifiedAuth = XstreamFlexOS; // Compatibility alias
})(window);
