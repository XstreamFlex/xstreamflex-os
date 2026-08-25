/**
 * XMG / XIMG Integration SDK & Media Vault Widget (v1.1.0)
 * Seamless WebP image upload, optimization, & gallery management for XSITE, EZsite, and external apps.
 * Hosted at https://xmg.xstreamflex.com/
 */
(function (window) {
    'use strict';

    const DEFAULT_PROD_URL = 'https://xmg.xstreamflex.com';

    const XImg = {
        baseUrl: (function() {
            const stored = localStorage.getItem('xmg_base_url') || localStorage.getItem('ximg_base_url');
            if (stored) return stored.replace(/\/$/, '');

            const scripts = document.getElementsByTagName('script');
            for (let s of scripts) {
                if (s.src && (s.src.includes('ximg-widget.js') || s.src.includes('xmg-widget.js'))) {
                    const parsed = s.src.replace(/\/(ximg|xmg)-widget\.js.*$/, '');
                    if (parsed && !parsed.includes('localhost') && !parsed.includes('127.0.0.1')) {
                        return parsed;
                    }
                }
            }
            return DEFAULT_PROD_URL;
        })(),

        apiKey: '',

        init: function (options) {
            options = options || {};
            if (options.baseUrl) this.baseUrl = options.baseUrl.replace(/\/$/, '');
            if (options.apiKey) this.apiKey = options.apiKey;
            else {
                // Auto-detect XSITE key
                this.apiKey = localStorage.getItem('xsites_key') || 
                              localStorage.getItem('xsites_license_key') || 
                              localStorage.getItem('xsites_active_key') || 
                              localStorage.getItem('xmg_api_key') || '';
            }
            return this;
        },

        upload: async function (source, options) {
            options = options || {};
            const key = options.apiKey || this.apiKey || this.detectKey();
            const baseUrl = (options.baseUrl || this.baseUrl).replace(/\/$/, '');
            const endpoint = baseUrl + '/api/upload.php';

            let body = null;
            let headers = {};

            if (key) {
                headers['X-API-Key'] = key;
            }

            if (source instanceof File || source instanceof Blob) {
                const formData = new FormData();
                formData.append('file', source, source.name || 'image.png');
                if (key) formData.append('api_key', key);
                body = formData;
            } else if (typeof source === 'string') {
                headers['Content-Type'] = 'application/json';
                if (source.startsWith('data:image/')) {
                    body = JSON.stringify({ base64: source, api_key: key });
                } else {
                    body = JSON.stringify({ url: source, api_key: key });
                }
            } else {
                throw new Error('Invalid upload source provided to XMG.upload()');
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: headers,
                body: body
            });

            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to upload image to XMG.');
            }

            return data;
        },

        fetchGallery: async function (options) {
            options = options || {};
            const key = options.apiKey || this.apiKey || this.detectKey();
            const baseUrl = (options.baseUrl || this.baseUrl).replace(/\/$/, '');
            const limit = options.limit || 50;
            const offset = options.offset || 0;
            const endpoint = `${baseUrl}/api/gallery.php?limit=${limit}&offset=${offset}${key ? '&key=' + encodeURIComponent(key) : ''}`;

            const headers = {};
            if (key) headers['X-API-Key'] = key;

            const response = await fetch(endpoint, { headers });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to load XMG media gallery.');
            }

            return data;
        },

        detectKey: function () {
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get('key') || 
                   urlParams.get('licenseKey') || 
                   localStorage.getItem('xsites_key') || 
                   localStorage.getItem('xsites_license_key') || 
                   localStorage.getItem('xsites_active_key') || 
                   localStorage.getItem('xmg_api_key') || '';
        },

        attachToInput: function (targetInput, options) {
            options = options || {};
            const inputEl = typeof targetInput === 'string' ? document.querySelector(targetInput) : targetInput;
            if (!inputEl) return;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ximg-upload-btn px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow transition inline-flex items-center gap-1.5 ml-2 cursor-pointer';
            btn.innerHTML = '<span>⚡</span> Upload to XMG';

            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*,.ico,image/x-icon';
            fileInput.style.display = 'none';

            btn.addEventListener('click', () => fileInput.click());

            fileInput.addEventListener('change', async () => {
                if (!fileInput.files.length) return;
                const file = fileInput.files[0];
                btn.disabled = true;
                btn.innerHTML = '<span>⏳</span> Optimizing...';

                try {
                    const result = await XImg.upload(file, options);
                    inputEl.value = result.direct_url;
                    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                    btn.innerHTML = '<span>✅</span> Uploaded!';
                    setTimeout(() => { btn.innerHTML = '<span>⚡</span> Upload to XMG'; btn.disabled = false; }, 2000);
                    if (typeof options.onSuccess === 'function') options.onSuccess(result);
                } catch (err) {
                    alert('XMG Upload Failed: ' + err.message);
                    btn.innerHTML = '<span>❌</span> Failed';
                    setTimeout(() => { btn.innerHTML = '<span>⚡</span> Upload to XMG'; btn.disabled = false; }, 2500);
                }
            });

            inputEl.parentNode.insertBefore(btn, inputEl.nextSibling);
            document.body.appendChild(fileInput);
        },

        openPicker: function (options) {
            options = options || {};
            const existingModal = document.getElementById('ximgPickerModal');
            if (existingModal) existingModal.remove();

            const modal = document.createElement('div');
            modal.id = 'ximgPickerModal';
            modal.style.cssText = 'position:fixed;inset:0;background:rgba(9,10,15,0.85);backdrop-filter:blur(10px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:"Plus Jakarta Sans",sans-serif;';
            
            modal.innerHTML = `
                <div style="background:#11131e;border:1px solid #1e293b;border-radius:18px;max-width:680px;width:100%;max-height:90vh;display:flex;flex-direction:column;color:#fff;box-shadow:0 25px 50px -12px rgba(0,0,0,0.7);overflow:hidden;">
                    <!-- Modal Header -->
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 24px;border-bottom:1px solid #1e293b;background:#0d0f17;">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span style="font-size:22px;">⚡</span>
                            <div>
                                <h3 style="font-weight:800;font-size:16px;margin:0;color:#f8fafc;">XMG Web-Optimized Media Vault</h3>
                                <p style="font-size:11px;color:#94a3b8;margin:0;">xmg.xstreamflex.com • WebP Automatic Compression</p>
                            </div>
                        </div>
                        <button id="ximgCloseBtn" style="background:rgba(255,255,255,0.05);border:1px solid #334155;color:#94a3b8;border-radius:8px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px;transition:0.2s;">✕</button>
                    </div>

                    <!-- Modal Navigation Tabs -->
                    <div style="display:flex;gap:4px;padding:10px 24px;background:#0f111a;border-bottom:1px solid #1e293b;">
                        <button id="xmgTabUpload" style="padding:8px 16px;border-radius:8px;font-weight:700;font-size:12px;border:none;cursor:pointer;background:#10b981;color:#000;display:flex;align-items:center;gap:6px;transition:0.2s;">
                            <span>⚡</span> Upload New
                        </button>
                        <button id="xmgTabLibrary" style="padding:8px 16px;border-radius:8px;font-weight:700;font-size:12px;border:none;cursor:pointer;background:transparent;color:#94a3b8;display:flex;align-items:center;gap:6px;transition:0.2s;">
                            <span>🖼️</span> My XMG Vault
                        </button>
                    </div>

                    <!-- Tab Content Area -->
                    <div style="padding:24px;overflow-y:auto;flex:1;">
                        <!-- TAB 1: UPLOAD -->
                        <div id="xmgContentUpload">
                            <div id="ximgDropZone" style="border:2px dashed #10b981;border-radius:14px;padding:40px 20px;text-align:center;background:rgba(16,185,129,0.04);cursor:pointer;transition:0.2s;">
                                <div style="font-size:42px;margin-bottom:12px;">🖼️</div>
                                <p style="font-weight:800;font-size:15px;margin:0 0 6px 0;color:#f1f5f9;">Drop Image Here or Click to Browse</p>
                                <p style="font-size:12px;color:#94a3b8;margin:0;">Converts PNG, JPG, GIF, ICO to ultra-light WebP / ICO formats instantly</p>
                                <input type="file" id="ximgFileInput" accept="image/*,.ico,image/x-icon" style="display:none;">
                            </div>

                            <div style="margin-top:16px;display:flex;align-items:center;gap:8px;">
                                <input type="text" id="xmgUrlInput" placeholder="Or paste image URL (https://...)" style="flex:1;background:#090a0f;border:1px solid #334155;border-radius:10px;padding:10px 14px;color:#f8fafc;font-size:12px;outline:none;">
                                <button id="xmgUrlUploadBtn" style="background:#0284c7;color:#fff;font-weight:700;font-size:12px;padding:10px 18px;border-radius:10px;border:none;cursor:pointer;white-space:nowrap;">Upload URL</button>
                            </div>

                            <div id="ximgPickerStatus" style="display:none;font-size:13px;font-family:monospace;color:#10b981;text-align:center;padding:12px;margin-top:12px;background:rgba(16,185,129,0.1);border-radius:8px;">
                                Optimizing image...
                            </div>
                        </div>

                        <!-- TAB 2: LIBRARY -->
                        <div id="xmgContentLibrary" style="display:none;">
                            <div style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">
                                <span style="font-size:12px;color:#94a3b8;" id="xmgGalleryCount">Loading images...</span>
                                <button id="xmgRefreshGalleryBtn" style="background:none;border:none;color:#38bdf8;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;">🔄 Refresh</button>
                            </div>
                            <div id="xmgGalleryGrid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(130px, 1fr));gap:12px;max-height:360px;overflow-y:auto;padding-right:4px;">
                                <!-- Dynamic Gallery Items -->
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            const fileInput = modal.querySelector('#ximgFileInput');
            const dropZone = modal.querySelector('#ximgDropZone');
            const closeBtn = modal.querySelector('#ximgCloseBtn');
            const status = modal.querySelector('#ximgPickerStatus');

            const tabUpload = modal.querySelector('#xmgTabUpload');
            const tabLibrary = modal.querySelector('#xmgTabLibrary');
            const contentUpload = modal.querySelector('#xmgContentUpload');
            const contentLibrary = modal.querySelector('#xmgContentLibrary');
            const galleryGrid = modal.querySelector('#xmgGalleryGrid');
            const galleryCount = modal.querySelector('#xmgGalleryCount');
            const refreshGalleryBtn = modal.querySelector('#xmgRefreshGalleryBtn');

            closeBtn.onclick = () => modal.remove();
            dropZone.onclick = () => fileInput.click();

            // Tab Switching Logic
            const switchTab = (tab) => {
                if (tab === 'upload') {
                    tabUpload.style.background = '#10b981';
                    tabUpload.style.color = '#000';
                    tabLibrary.style.background = 'transparent';
                    tabLibrary.style.color = '#94a3b8';
                    contentUpload.style.display = 'block';
                    contentLibrary.style.display = 'none';
                } else {
                    tabLibrary.style.background = '#10b981';
                    tabLibrary.style.color = '#000';
                    tabUpload.style.background = 'transparent';
                    tabUpload.style.color = '#94a3b8';
                    contentUpload.style.display = 'none';
                    contentLibrary.style.display = 'block';
                    loadGallery();
                }
            };

            tabUpload.onclick = () => switchTab('upload');
            tabLibrary.onclick = () => switchTab('library');

            const handleFile = async (source) => {
                status.style.display = 'block';
                status.style.color = '#10b981';
                status.innerText = '⚡ Converting to WebP & optimizing via XMG...';
                try {
                    const result = await XImg.upload(source, options);
                    modal.remove();
                    if (typeof options.onSelect === 'function') {
                        options.onSelect(result);
                    }
                } catch (err) {
                    status.style.color = '#ef4444';
                    status.innerText = '❌ Error: ' + err.message;
                }
            };

            // URL Upload
            const urlInput = modal.querySelector('#xmgUrlInput');
            const urlBtn = modal.querySelector('#xmgUrlUploadBtn');
            urlBtn.onclick = () => {
                const val = urlInput.value.trim();
                if (val) handleFile(val);
            };

            fileInput.onchange = () => {
                if (fileInput.files.length) handleFile(fileInput.files[0]);
            };

            dropZone.ondragover = (e) => { e.preventDefault(); dropZone.style.borderColor = '#22c55e'; };
            dropZone.ondragleave = () => { dropZone.style.borderColor = '#10b981'; };
            dropZone.ondrop = (e) => {
                e.preventDefault();
                if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
            };

            // Load Gallery Items
            const loadGallery = async () => {
                galleryGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:24px;color:#94a3b8;font-size:12px;">⏳ Loading your XMG images...</div>';
                try {
                    const res = await XImg.fetchGallery(options);
                    if (!res.images || !res.images.length) {
                        galleryGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:24px;color:#94a3b8;font-size:12px;">No images uploaded yet. Switch to "Upload New" to add your first image!</div>';
                        galleryCount.innerText = '0 images found';
                        return;
                    }

                    galleryCount.innerText = `${res.images.length} images in vault`;
                    galleryGrid.innerHTML = '';

                    res.images.forEach(img => {
                        const item = document.createElement('div');
                        item.style.cssText = 'background:#090a0f;border:1px solid #1e293b;border-radius:10px;padding:6px;cursor:pointer;transition:0.2s;position:relative;display:flex;flex-direction:column;gap:6px;';
                        item.innerHTML = `
                            <div style="width:100%;height:90px;border-radius:6px;overflow:hidden;background:#020617;display:flex;align-items:center;justify-content:center;">
                                <img src="${img.thumb_url || img.direct_url}" alt="${img.original_name}" style="max-width:100%;max-height:100%;object-fit:cover;">
                            </div>
                            <div style="font-size:10px;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${img.original_name}">${img.original_name}</div>
                            <div style="font-size:9px;color:#10b981;font-weight:700;">-${img.savings_percent}% WebP</div>
                        `;

                        item.onmouseover = () => item.style.borderColor = '#10b981';
                        item.onmouseout = () => item.style.borderColor = '#1e293b';
                        item.onclick = () => {
                            modal.remove();
                            if (typeof options.onSelect === 'function') {
                                options.onSelect(img);
                            }
                        };

                        galleryGrid.appendChild(item);
                    });
                } catch (err) {
                    galleryGrid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:24px;color:#ef4444;font-size:12px;">❌ ${err.message}</div>`;
                }
            };

            refreshGalleryBtn.onclick = loadGallery;
        }
    };

    XImg.init();
    window.XImg = XImg;
    window.XMG = XImg; // Primary XMG alias
})(window);

