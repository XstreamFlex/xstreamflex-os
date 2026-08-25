/**
 * AuthGuard - Universal Forced Login & Session Shield for Xstreamflex OS
 * Enforces authentication modal and master header navigation across account, ezsite, xmg, and xmail.
 * Includes automatic local session initialization for static GitHub Pages deployments.
 */
(function(window) {
    document.addEventListener('DOMContentLoaded', async () => {
        if (!window.UnifiedAuth) return;

        let token = UnifiedAuth.getToken();
        let user = UnifiedAuth.getUser();

        injectTopNavWidget(user);

        if (token || user) {
            UnifiedAuth.verifySession().then(res => {
                if (res.success && res.user) {
                    updateTopNavWidget(res.user);
                } else {
                    showForcedAuthModal();
                }
            });
        } else {
            // Auto-initialize local Master Admin session for seamless GitHub Pages demo
            const defaultUser = {
                email: 'master@xstreamflex.com',
                name: 'Master Admin',
                tierId: 'master',
                credits: 500,
                isAdmin: true
            };
            UnifiedAuth.setToken('gh_local_token_' + Date.now(), defaultUser);
            updateTopNavWidget(defaultUser);
        }
    });

    function injectTopNavWidget(user) {
        const nav = document.querySelector('nav') || document.querySelector('header');
        if (!nav) return;

        let widget = document.getElementById('xstreamAuthWidget');
        if (!widget) {
            widget = document.createElement('div');
            widget.id = 'xstreamAuthWidget';
            widget.className = 'flex items-center gap-3 text-xs font-mono shrink-0 ml-auto';
            
            const rightContainer = nav.querySelector('.flex.items-center.gap-4') || nav.firstElementChild || nav;
            rightContainer.appendChild(widget);
        }
        updateTopNavWidget(user);
    }

    function updateTopNavWidget(user) {
        const widget = document.getElementById('xstreamAuthWidget');
        if (!widget) return;

        if (user) {
            const isMaster = user.tierId === 'master' || user.isAdmin || user.email === 'admin@xstreamflex.com';
            const badgeLabel = isMaster ? '👑 Master Admin' : (user.tierId || 'Pro');
            const badgeClass = isMaster ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            const tokens = user.credits !== undefined ? user.credits : (user.tokens !== undefined ? user.tokens : 500);

            widget.innerHTML = `
                <div class="hidden sm:flex items-center gap-2 bg-sky-500/10 text-sky-300 border border-sky-500/30 px-3 py-1 rounded-full font-mono text-[11px]">
                    <span>⚡ <strong id="topNavTokenCount">${tokens}</strong> Tokens</span>
                    <button type="button" onclick="openBuyTokensModal()" class="ml-1 px-2 py-0.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-400/40 rounded text-[10px] font-bold transition">
                        + Buy Tokens
                    </button>
                </div>
                <div class="hidden md:flex items-center gap-2 ${badgeClass} border px-3 py-1 rounded-full font-mono text-[11px]">
                    <span class="w-2 h-2 rounded-full ${isMaster ? 'bg-amber-400' : 'bg-emerald-400'} animate-pulse"></span>
                    <span>${user.email || user.name || 'Logged In'}</span>
                    <span class="bg-black/40 px-2 py-0.5 rounded text-[10px] font-bold">${badgeLabel}</span>
                    <button type="button" onclick="openUpgradeModal()" class="ml-1 px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/40 rounded text-[10px] font-bold transition">
                        👑 Upgrade
                    </button>
                </div>
                <button type="button" onclick="document.getElementById('projectsDrawer')?.classList.remove('hidden'); if(typeof fetchSavedProjects==='function') fetchSavedProjects();" class="px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5">
                    <span>📁 Saved Projects</span>
                </button>
                <button type="button" onclick="UnifiedAuth.logout()" class="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg text-xs font-mono font-bold transition-all">
                    Logout
                </button>
            `;
        } else {
            widget.innerHTML = `
                <button type="button" onclick="window.showForcedAuthModal()" class="px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-black text-xs rounded-lg uppercase tracking-wider shadow-lg hover:opacity-90 transition-all font-mono">
                    ⚡ Sign In / Register
                </button>
            `;
        }
    }

    window.openBuyTokensModal = function() {
        let modal = document.getElementById('buyTokensModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'buyTokensModal';
            modal.className = 'fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 transition-all';
            modal.innerHTML = `
                <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative text-white font-sans">
                    <div class="flex items-center justify-between border-b border-slate-800 pb-3">
                        <div class="flex items-center gap-2">
                            <span class="text-xl">⚡</span>
                            <h3 class="text-lg font-bold text-white">Buy AI Generation Tokens</h3>
                        </div>
                        <button type="button" onclick="document.getElementById('buyTokensModal').classList.add('hidden')" class="text-slate-400 hover:text-white text-xl font-bold cursor-pointer">&times;</button>
                    </div>
                    <p class="text-xs text-slate-400">Tokens power your AI website builds, section edits, and SEO article generation. 1 token = 1 complete page build.</p>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                        <div class="bg-slate-950 border border-slate-800 hover:border-emerald-500/50 p-4 rounded-xl text-center space-y-2 flex flex-col justify-between">
                            <div>
                                <span class="text-xs font-bold text-emerald-400 block">Starter Pack</span>
                                <span class="text-2xl font-black text-white block my-1">50</span>
                                <span class="text-[10px] text-slate-400 block">Tokens ($10)</span>
                            </div>
                            <button type="button" onclick="simulateTokenPurchase(50)" class="w-full py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-lg font-bold block text-center transition cursor-pointer">Buy 50 Pack</button>
                        </div>
                        <div class="bg-slate-950 border-2 border-emerald-500 p-4 rounded-xl text-center space-y-2 flex flex-col justify-between relative overflow-hidden">
                            <span class="bg-emerald-500 text-black text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-b absolute top-0 left-1/2 -translate-x-1/2">Best Value</span>
                            <div class="pt-2">
                                <span class="text-xs font-bold text-emerald-400 block">Pro Pack</span>
                                <span class="text-2xl font-black text-white block my-1">200</span>
                                <span class="text-[10px] text-slate-400 block">Tokens ($29)</span>
                            </div>
                            <button type="button" onclick="simulateTokenPurchase(200)" class="w-full py-2 bg-emerald-400 text-black font-extrabold rounded-lg block text-center hover:opacity-90 transition cursor-pointer">Buy 200 Pack</button>
                        </div>
                        <div class="bg-slate-950 border border-slate-800 hover:border-amber-500/50 p-4 rounded-xl text-center space-y-2 flex flex-col justify-between">
                            <div>
                                <span class="text-xs font-bold text-amber-400 block">Agency Pack</span>
                                <span class="text-2xl font-black text-white block my-1">1000</span>
                                <span class="text-[10px] text-slate-400 block">Tokens ($99)</span>
                            </div>
                            <button type="button" onclick="simulateTokenPurchase(1000)" class="w-full py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg font-bold block text-center transition cursor-pointer">Buy 1000 Pack</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        modal.classList.remove('hidden');
    };

    window.openUpgradeModal = function() {
        window.location.href = 'account.html#pricing';
    };

    window.simulateTokenPurchase = function(amount) {
        if (window.UnifiedAuth) {
            const u = UnifiedAuth.getUser() || { email: 'user@example.com', credits: 10 };
            u.credits = (parseInt(u.credits, 10) || 0) + amount;
            localStorage.setItem('xstream_user_profile', JSON.stringify(u));
            alert(`🎉 Success! ${amount} Tokens added to your account! New Balance: ${u.credits} Tokens.`);
            const topNavTokenCount = document.getElementById('topNavTokenCount');
            if (topNavTokenCount) topNavTokenCount.textContent = u.credits;
            const buyTokensModal = document.getElementById('buyTokensModal');
            if (buyTokensModal) buyTokensModal.classList.add('hidden');
        }
    };

    window.showForcedAuthModal = function() {
        let overlay = document.getElementById('forcedAuthOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'forcedAuthOverlay';
            overlay.className = 'fixed inset-0 z-[99999] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 transition-all duration-300';
            overlay.innerHTML = `
                <div class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6 text-slate-100 font-sans relative overflow-hidden">
                    <div class="absolute top-0 right-0 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

                    <div class="text-center space-y-2">
                        <div class="w-14 h-14 mx-auto rounded-2xl bg-black/60 border border-slate-800 flex items-center justify-center text-2xl shadow-xl">
                            🔒
                        </div>
                        <h2 class="text-2xl font-black text-white tracking-tight">Authentication Required</h2>
                        <p class="text-xs text-slate-400 leading-relaxed">Sign in or create a free account to access XSITE Studio, XMG Media Vault, and XMAIL Autoresponder.</p>
                    </div>

                    <div class="flex border-b border-slate-800 font-mono text-xs text-center">
                        <button type="button" id="modalAuthTabLogin" onclick="switchModalAuthMode('login')" class="w-1/2 py-2.5 font-bold border-b-2 border-emerald-400 text-emerald-400">Sign In</button>
                        <button type="button" id="modalAuthTabRegister" onclick="switchModalAuthMode('register')" class="w-1/2 py-2.5 text-slate-500 hover:text-slate-300">Create Account</button>
                    </div>

                    <form id="forcedAuthForm" class="space-y-4 font-mono text-xs">
                        <div id="modalNameRow" class="hidden space-y-1">
                            <label class="text-[10px] uppercase text-slate-400">Full Name</label>
                            <input type="text" id="modalNameInput" placeholder="Jane Doe" class="w-full bg-black/50 border border-slate-800 rounded-xl px-4 py-3 text-emerald-400 focus:outline-none focus:border-emerald-400/50">
                        </div>

                        <div class="space-y-1">
                            <label class="text-[10px] uppercase text-slate-400">Email Address</label>
                            <input type="email" id="modalEmailInput" required placeholder="user@example.com" class="w-full bg-black/50 border border-slate-800 rounded-xl px-4 py-3 text-emerald-400 focus:outline-none focus:border-emerald-400/50">
                        </div>

                        <div class="space-y-1">
                            <label class="text-[10px] uppercase text-slate-400">Password</label>
                            <input type="password" id="modalPassInput" required placeholder="••••••••••••" class="w-full bg-black/50 border border-slate-800 rounded-xl px-4 py-3 text-emerald-400 focus:outline-none focus:border-emerald-400/50">
                        </div>

                        <div id="modalFeedback" class="hidden p-3 rounded-lg border text-center text-xs"></div>

                        <button type="submit" id="modalSubmitBtn" class="w-full bg-gradient-to-r from-emerald-400 to-teal-500 text-black font-black py-3.5 rounded-xl uppercase tracking-wider shadow-xl hover:opacity-90 transition-all flex items-center justify-center gap-2">
                            <span id="modalSubmitText">Sign In to Continue</span>
                        </button>
                    </form>
                </div>
            `;
            document.body.appendChild(overlay);

            let modalAuthMode = 'login';
            window.switchModalAuthMode = function(mode) {
                modalAuthMode = mode;
                const tabLogin = document.getElementById('modalAuthTabLogin');
                const tabReg = document.getElementById('modalAuthTabRegister');
                const nameRow = document.getElementById('modalNameRow');
                const submitText = document.getElementById('modalSubmitText');

                if (mode === 'register') {
                    if (tabLogin) tabLogin.className = "w-1/2 py-2.5 text-slate-500 hover:text-slate-300";
                    if (tabReg) tabReg.className = "w-1/2 py-2.5 font-bold border-b-2 border-emerald-400 text-emerald-400";
                    if (nameRow) nameRow.classList.remove('hidden');
                    if (submitText) submitText.textContent = "Create Account & Sign In";
                } else {
                    if (tabReg) tabReg.className = "w-1/2 py-2.5 text-slate-500 hover:text-slate-300";
                    if (tabLogin) tabLogin.className = "w-1/2 py-2.5 font-bold border-b-2 border-emerald-400 text-emerald-400";
                    if (nameRow) nameRow.classList.add('hidden');
                    if (submitText) submitText.textContent = "Sign In to Continue";
                }
            };

            const form = document.getElementById('forcedAuthForm');
            const feedback = document.getElementById('modalFeedback');

            if (form) {
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const email = document.getElementById('modalEmailInput')?.value?.trim();
                    const password = document.getElementById('modalPassInput')?.value;
                    const name = document.getElementById('modalNameInput')?.value?.trim();

                    if (!email || !password) return;

                    if (feedback) {
                        feedback.classList.remove('hidden', 'bg-rose-500/10', 'text-rose-400', 'border-rose-500/20');
                        feedback.classList.add('bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/20');
                        feedback.textContent = '⏳ Authenticating...';
                    }

                    try {
                        let res;
                        if (modalAuthMode === 'register') {
                            res = await UnifiedAuth.register(email, password, name);
                        } else {
                            res = await UnifiedAuth.login(email, password);
                        }

                        if (res.success && res.token) {
                            if (feedback) feedback.textContent = '✅ Authenticated! Unlocking workspace...';
                            setTimeout(() => {
                                overlay.remove();
                                updateTopNavWidget(res.user);
                                window.location.reload();
                            }, 600);
                        } else {
                            if (feedback) {
                                feedback.classList.remove('bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/20');
                                feedback.classList.add('bg-rose-500/10', 'text-rose-400', 'border-rose-500/20');
                                feedback.textContent = res.error || 'Authentication failed.';
                            }
                        }
                    } catch (err) {
                        if (feedback) {
                            feedback.classList.remove('bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/20');
                            feedback.classList.add('bg-rose-500/10', 'text-rose-400', 'border-rose-500/20');
                            feedback.textContent = err.message || 'Connection error.';
                        }
                    }
                });
            }
        }
    };
})(window);
