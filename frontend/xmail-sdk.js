/**
 * XMAIL Client SDK & CRM Ingestion Engine (v1.2.0)
 * Handles autoresponder drip sequences, broadcast dispatches, and form lead capture for static GitHub Pages.
 */
(function (window) {
    'use strict';

    const STORAGE_KEY_CAMPAIGNS = 'xmail_campaigns';
    const STORAGE_KEY_SUBS = 'xmail_subscribers';

    const defaultCampaigns = [
        {
            id: 'camp_1',
            name: 'Welcome Onboarding Drip',
            type: 'drip',
            senderName: 'Xstreamflex OS',
            tag: 'xsite_leads',
            subject: '🚀 Welcome to Xstreamflex OS! Your account is active',
            body: 'Hi {NAME},\n\nThank you for opting in via XSITE! We are thrilled to welcome you. Access your suite anytime at xstreamflex.com.\n\nBest,\nThe Xstreamflex Team',
            status: 'Active',
            createdAt: new Date().toISOString()
        }
    ];

    const defaultSubscribers = [
        { id: 'sub_1', email: 'demo.lead@xstreamflex.com', name: 'Demo Lead', tag: 'xsite_leads', createdAt: new Date(Date.now() - 86400000).toISOString() },
        { id: 'sub_2', email: 'vip.user@example.com', name: 'Alex Smith', tag: 'vip', createdAt: new Date().toISOString() }
    ];

    const XMAIL = {
        getCampaigns: function() {
            try {
                const data = localStorage.getItem(STORAGE_KEY_CAMPAIGNS);
                return data ? JSON.parse(data) : defaultCampaigns;
            } catch(e) {
                return defaultCampaigns;
            }
        },

        saveCampaigns: function(arr) {
            try {
                localStorage.setItem(STORAGE_KEY_CAMPAIGNS, JSON.stringify(arr));
            } catch(e){}
        },

        getSubscribers: function() {
            try {
                const data = localStorage.getItem(STORAGE_KEY_SUBS);
                return data ? JSON.parse(data) : defaultSubscribers;
            } catch(e) {
                return defaultSubscribers;
            }
        },

        saveSubscribers: function(arr) {
            try {
                localStorage.setItem(STORAGE_KEY_SUBS, JSON.stringify(arr));
            } catch(e){}
        },

        captureLead: function(leadData) {
            const email = (leadData.email || '').trim().toLowerCase();
            if (!email || !email.includes('@')) {
                return { success: false, error: 'Valid email address is required.' };
            }

            const name = leadData.name || leadData.fullName || email.split('@')[0];
            const tag = leadData.tag || leadData.segment || 'xsite_leads';
            const source = leadData.source || 'Embedded XSITE Form';

            let subs = this.getSubscribers();
            let existingIndex = subs.findIndex(s => s.email.toLowerCase() === email);

            let newLead;
            if (existingIndex !== -1) {
                subs[existingIndex] = {
                    ...subs[existingIndex],
                    name: name || subs[existingIndex].name,
                    tag: tag,
                    updatedAt: new Date().toISOString()
                };
                newLead = subs[existingIndex];
            } else {
                newLead = {
                    id: 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                    email: email,
                    name: name,
                    tag: tag,
                    source: source,
                    createdAt: new Date().toISOString()
                };
                subs.unshift(newLead);
            }

            this.saveSubscribers(subs);

            // Check matching active campaigns for autoresponder sequence
            const camps = this.getCampaigns();
            const matchingCampaigns = camps.filter(c => c.tag === 'all' || c.tag === tag);

            // Dispatch browser event
            window.dispatchEvent(new CustomEvent('xmail:lead_captured', {
                detail: { lead: newLead, autorespondersTriggered: matchingCampaigns.length }
            }));

            return {
                success: true,
                lead: newLead,
                autoresponderCount: matchingCampaigns.length,
                message: `Lead ${email} captured successfully into XMAIL!`
            };
        },

        setupWelcomeCampaign: function(options) {
            options = options || {};
            const brandName = options.brandName || 'Xstreamflex OS';
            const leadMagnetUrl = options.leadMagnetUrl || 'https://xstreamflex.com/welcome-access';

            let camps = this.getCampaigns();

            const campaign1 = {
                id: 'camp_' + Date.now() + '_1',
                name: `${brandName} — Welcome & Free Gift (Day 0)`,
                type: 'drip',
                senderName: brandName,
                tag: 'xsite_leads',
                subject: `🚀 Welcome to ${brandName}! Here is your download link...`,
                body: `Hi {NAME},\n\nThank you for opting in to ${brandName}! We are thrilled to have you with us.\n\nHere is your immediate download / access link:\n${leadMagnetUrl}\n\nIf you have any questions, just reply directly to this email.\n\nBest regards,\nThe ${brandName} Team\n\n---\nUnsubscribe: {UNSUBSCRIBE}`,
                status: 'Active',
                createdAt: new Date().toISOString()
            };

            const campaign2 = {
                id: 'camp_' + Date.now() + '_2',
                name: `${brandName} — Brand Story & Quick Start (Day 2)`,
                type: 'drip',
                senderName: brandName,
                tag: 'xsite_leads',
                subject: `💡 Quick tips & getting the most out of ${brandName}`,
                body: `Hi {NAME},\n\nHope you had a chance to check out our initial resources!\n\nAt ${brandName}, our mission is to build ultra-fast web experiences. Here are 3 key features to explore today:\n1. XSITE Studio visual builder\n2. XMG WebP image optimization\n3. XMAIL autoresponder drip automation\n\nEnjoying the experience?\n\nWarmly,\nThe ${brandName} Team`,
                status: 'Active',
                createdAt: new Date(Date.now() + 1000).toISOString()
            };

            const campaign3 = {
                id: 'camp_' + Date.now() + '_3',
                name: `${brandName} — VIP Exclusive Discount Offer (Day 5)`,
                type: 'drip',
                senderName: brandName,
                tag: 'xsite_leads',
                subject: `🎁 Exclusive 15% VIP discount inside for ${brandName}`,
                body: `Hi {NAME},\n\nAs a valued member of the ${brandName} subscriber family, we want to give you an exclusive 15% discount code on our Pro plans!\n\nUse promo code: VIP15 at checkout.\n\nClaim your reward: ${leadMagnetUrl}\n\nCheers,\n${brandName} Team`,
                status: 'Active',
                createdAt: new Date(Date.now() + 2000).toISOString()
            };

            camps.unshift(campaign1, campaign2, campaign3);
            this.saveCampaigns(camps);

            return {
                success: true,
                campaignCount: 3,
                campaigns: [campaign1, campaign2, campaign3],
                tag: 'xsite_leads'
            };
        },

        dispatchBroadcast: function(campaignId) {
            const camps = this.getCampaigns();
            const camp = camps.find(c => c.id === campaignId);
            if (!camp) return { success: false, error: 'Campaign not found.' };

            const subs = this.getSubscribers().filter(s => camp.tag === 'all' || s.tag === camp.tag);
            
            return {
                success: true,
                recipientCount: subs.length,
                campaign: camp,
                message: `Broadcast "${camp.name}" dispatched to ${subs.length} subscriber(s)!`
            };
        },

        attachToForm: function(formEl) {
            if (typeof formEl === 'string') formEl = document.querySelector(formEl);
            if (!formEl) return;

            formEl.addEventListener('submit', (e) => {
                const emailInput = formEl.querySelector('input[type="email"]') || formEl.querySelector('input[name="email"]');
                const nameInput = formEl.querySelector('input[name="name"]') || formEl.querySelector('input[name="fname"]');

                if (emailInput && emailInput.value) {
                    const email = emailInput.value;
                    const name = nameInput ? nameInput.value : '';
                    const result = XMAIL.captureLead({ email: email, name: name, tag: 'xsite_leads' });

                    if (result.success) {
                        const successMsg = document.createElement('div');
                        successMsg.className = 'mt-3 p-3 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-xl font-mono text-xs text-center';
                        successMsg.innerHTML = '✅ Thank you! You have been subscribed successfully.';
                        formEl.appendChild(successMsg);
                    }
                }
            });
        }
    };

    if (!localStorage.getItem(STORAGE_KEY_CAMPAIGNS)) {
        XMAIL.saveCampaigns(defaultCampaigns);
    }
    if (!localStorage.getItem(STORAGE_KEY_SUBS)) {
        XMAIL.saveSubscribers(defaultSubscribers);
    }

    window.XMAIL = XMAIL;
})(window);
