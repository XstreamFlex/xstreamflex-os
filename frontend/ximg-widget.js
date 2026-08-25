/**
 * XMG / XIMG Integration SDK & Media Vault Widget (v1.2.5)
 * Dual-Mode: Remote API + Web-Optimized Client-Side Canvas WebP Compression & Quota-Safe Storage.
 */
(function (window) {
    'use strict';

    const STORAGE_KEY_XMG = 'xmg_media_catalog';
    const DEFAULT_PROD_URL = 'https://xmg.xstreamflex.com';

    function getLocalCatalog() {
        try {
            const data = localStorage.getItem(STORAGE_KEY_XMG);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    }

    function saveLocalCatalog(arr) {
        try {
            localStorage.setItem(STORAGE_KEY_XMG, JSON.stringify(arr));
        } catch (e) {
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                // Trim oldest items if quota is exceeded
                while (arr.length > 5) {
                    arr.pop();
                    try {
                        localStorage.setItem(STORAGE_KEY_XMG, JSON.stringify(arr));
                        break;
                    } catch (err) {}
                }
            }
        }

        try {
            // Sync with XSITE asset vault
            localStorage.setItem('xsites_asset_vault', JSON.stringify(arr.map(img => ({
                id: img.id,
                type: 'image',
                tag: img.tag || 'xmg',
                url: img.url,
                desc: img.title,
                createdAt: img.createdAt
            }))));
        } catch(e) {}
    }

    // High-performance image resizer & WebP encoder
    function processImageToWebP(source, maxDim = 1200, quality = 0.80) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                try {
                    let width = img.naturalWidth || img.width || 800;
                    let height = img.naturalHeight || img.height || 600;

                    if (width > maxDim || height > maxDim) {
                        if (width > height) {
                            height = Math.round((height * maxDim) / width);
                            width = maxDim;
                        } else {
                            width = Math.round((width * maxDim) / height);
                            height = maxDim;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    const webpDataUrl = canvas.toDataURL('image/webp', quality);
                    resolve(webpDataUrl);
                } catch(err) {
                    reject(err);
                }
            };

            img.onerror = () => reject(new Error('Failed to load image for WebP processing.'));

            if (source instanceof File || source instanceof Blob) {
                const reader = new FileReader();
                reader.onload = (e) => { img.src = e.target.result; };
                reader.onerror = () => reject(new Error('File reading failed.'));
                reader.readAsDataURL(source);
            } else if (typeof source === 'string') {
                img.src = source;
            } else {
                reject(new Error('Unsupported image source type.'));
            }
        });
    }

    const XImg = {
        baseUrl: (function() {
            const stored = localStorage.getItem('xmg_base_url') || localStorage.getItem('ximg_base_url');
            if (stored) return stored.replace(/\/$/, '');
            return DEFAULT_PROD_URL;
        })(),

        apiKey: '',

        init: function (options) {
            options = options || {};
            if (options.baseUrl) this.baseUrl = options.baseUrl.replace(/\/$/, '');
            if (options.apiKey) this.apiKey = options.apiKey;
            else {
                this.apiKey = localStorage.getItem('xsites_key') || 
                              localStorage.getItem('xsites_license_key') || 
                              localStorage.getItem('xmg_api_key') || '';
            }
            return this;
        },

        upload: async function (source, options) {
            options = options || {};
            const fileName = source instanceof File ? source.name : (options.title || 'Image_' + Date.now());
            const origSize = source instanceof File ? source.size : 120000;

            // Try remote PHP API if reachable
            try {
                const key = options.apiKey || this.apiKey || this.detectKey();
                const baseUrl = (options.baseUrl || this.baseUrl).replace(/\/$/, '');
                const endpoint = baseUrl + '/api/upload.php';

                let body = null;
                let headers = {};
                if (key) headers['X-API-Key'] = key;

                if (source instanceof File || source instanceof Blob) {
                    const formData = new FormData();
                    formData.append('file', source, source.name || 'image.png');
                    if (key) formData.append('api_key', key);
                    body = formData;
                } else if (typeof source === 'string') {
                    headers['Content-Type'] = 'application/json';
                    body = JSON.stringify({ base64: source, url: source, api_key: key });
                }

                const response = await fetch(endpoint, { method: 'POST', headers, body });
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.success) return data;
                }
            } catch(e) {
                // Remote API unavailable - Proceed to local client-side processing
            }

            // Fast WebP Canvas Encoding
            const webpUrl = await processImageToWebP(source);
            const webpSize = Math.round(webpUrl.length * 0.75);
            const savings = Math.max(15, Math.round(((origSize - webpSize) / Math.max(origSize, 1)) * 100)) || 65;

            const catalog = getLocalCatalog();
            const newItem = {
                id: 'xmg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                title: fileName.replace(/\.[^/.]+$/, ""),
                tag: options.tag || 'gallery',
                alt: fileName,
                url: webpUrl,
                origSize: origSize,
                webpSize: webpSize,
                savings: savings,
                createdAt: new Date().toISOString()
            };

            catalog.unshift(newItem);
            saveLocalCatalog(catalog);

            return {
                success: true,
                direct_url: webpUrl,
                url: webpUrl,
                thumb_url: webpUrl,
                original_name: fileName,
                savings_percent: savings,
                image: newItem
            };
        },

        fetchGallery: async function (options) {
            options = options || {};
            try {
                const key = options.apiKey || this.apiKey || this.detectKey();
                const baseUrl = (options.baseUrl || this.baseUrl).replace(/\/$/, '');
                const limit = options.limit || 50;
                const endpoint = `${baseUrl}/api/gallery.php?limit=${limit}${key ? '&key=' + encodeURIComponent(key) : ''}`;

                const response = await fetch(endpoint);
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.success) return data;
                }
            } catch(e) {}

            const catalog = getLocalCatalog();
            const images = catalog.map(item => ({
                id: item.id,
                original_name: item.title,
                thumb_url: item.url,
                direct_url: item.url,
                savings_percent: item.savings || 65,
                createdAt: item.createdAt
            }));

            return {
                success: true,
                images: images
            };
        },

        detectKey: function () {
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get('key') || 
                   localStorage.getItem('xsites_key') || 
                   localStorage.getItem('xmg_api_key') || '';
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
                                <p style="font-size:11px;color:#94a3b8;margin:0;">Xstreamflex OS • WebP Compression & Media Storage</p>
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
                                <p style="font-size:12px;color:#94a3b8;margin:0;">Auto-converts PNG, JPG, GIF to ultra-light WebP format</p>
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
    window.XMG = XImg;
})(window);
