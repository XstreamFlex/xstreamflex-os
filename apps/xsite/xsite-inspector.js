/* XSITE Visual Block Inspector & Variable Editor Engine */
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
                    style.innerHTML = `
                        .xsite-hover-target { outline: 2px dashed #38bdf8 !important; outline-offset: 2px !important; cursor: pointer !important; }
                        .xsite-selected-target { outline: 3px solid #10b981 !important; outline-offset: 3px !important; box-shadow: 0 0 16px rgba(16, 185, 129, 0.5) !important; }
                    `;
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
        const matches = rgbStr.match(/\d+/g);
        if (!matches || matches.length < 3) return '#ffffff';
        const r = parseInt(matches[0], 10).toString(16).padStart(2, '0');
        const g = parseInt(matches[1], 10).toString(16).padStart(2, '0');
        const b = parseInt(matches[2], 10).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
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
        const idStr = targetEl.id ? `#${targetEl.id}` : '';
        const classStr = targetEl.className ? `.${targetEl.className.split(' ').filter(Boolean).slice(0, 2).join('.')}` : '';
        const displayName = getFriendlyName(targetEl);

        if (badgeLabel) badgeLabel.innerText = `🎯 Selected: ${displayName}`;
        if (pathLabel) pathLabel.innerText = `<${tagName}${idStr}${classStr}>`;

        if (!formContainer) return;
        formContainer.innerHTML = '';

        // Form Fields Container
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono';

        // 1. CONTENT VARIABLES (Text, Link, Image Src/Alt)
        const contentBox = document.createElement('div');
        contentBox.className = 'bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-3';
        contentBox.innerHTML = `<h4 class="text-emerald-400 font-bold border-b border-slate-800 pb-1.5 flex items-center gap-1">📝 Content & Text Variables</h4>`;

        let hasContentVar = false;

        // Editable Text / Headline
        if (['h1','h2','h3','h4','h5','h6','p','span','button','a','li','label'].includes(tagName) || targetEl.children.length === 0) {
            hasContentVar = true;
            const textGroup = document.createElement('div');
            textGroup.className = 'space-y-1';
            textGroup.innerHTML = `
                <label class="block text-[10px] text-slate-400 font-bold uppercase">Text / Headline Content</label>
                <textarea rows="2" class="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg p-2 text-xs focus:outline-none focus:border-emerald-500">${targetEl.innerText ? targetEl.innerText.trim() : (targetEl.textContent ? targetEl.textContent.trim() : '')}</textarea>
            `;
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
            linkGroup.innerHTML = `
                <label class="block text-[10px] text-sky-400 font-bold uppercase">🔗 Link Target URL (href)</label>
                <input type="text" value="${hrefVal}" placeholder="e.g. #contact, about.html, https://..." class="w-full bg-slate-950 border border-slate-700 text-sky-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-sky-400" />
            `;
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
            imgGroup.className = 'space-y-2.5';
            imgGroup.innerHTML = `
                <div>
                    <div class="flex items-center justify-between mb-1">
                        <label class="block text-[10px] text-amber-400 font-bold uppercase">🖼️ Image Source URL (src)</label>
                        <button type="button" class="xmg-picker-btn text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-0.5 rounded transition flex items-center gap-1 cursor-pointer shadow-sm">
                            <span>⚡</span> Pick / Upload via XMG
                        </button>
                    </div>
                    <input type="text" value="${img.getAttribute('src') || ''}" class="w-full bg-slate-950 border border-slate-700 text-amber-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-amber-400" />
                </div>
                <div>
                    <label class="block text-[10px] text-slate-400 font-bold uppercase mb-1">Image Alt Description</label>
                    <input type="text" value="${img.getAttribute('alt') || ''}" class="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-slate-400" />
                </div>
            `;
            const srcInput = imgGroup.querySelectorAll('input')[0];
            const altInput = imgGroup.querySelectorAll('input')[1];
            const xmgBtn = imgGroup.querySelector('.xmg-picker-btn');

            if (xmgBtn) {
                xmgBtn.addEventListener('click', () => {
                    const xmgSdk = window.XMG || window.XImg;
                    if (xmgSdk && typeof xmgSdk.openPicker === 'function') {
                        xmgSdk.openPicker({
                            onSelect: (selected) => {
                                pushUndoState();
                                const url = selected.direct_url || selected.url || '';
                                if (url) {
                                    img.setAttribute('src', url);
                                    srcInput.value = url;
                                }
                                if (selected.original_name) {
                                    img.setAttribute('alt', selected.original_name);
                                    altInput.value = selected.original_name;
                                }
                                syncToPagesTree();
                            }
                        });
                    } else {
                        alert('XMG Media SDK not found. Please ensure xmg-widget.js is loaded.');
                    }
                });
            }

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
        styleBox.innerHTML = `<h4 class="text-sky-400 font-bold border-b border-slate-800 pb-1.5 flex items-center gap-1">🎨 Style & Typography Variables</h4>`;

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
        fontRow.innerHTML = `
            <div>
                <label class="block text-[10px] text-slate-400 font-bold uppercase">Font Size</label>
                <select id="inspFontSize" class="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded-lg p-1.5 text-xs focus:outline-none">
                    <option value="">Default (${curFontSize || 'auto'})</option>
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
                    <option value="">Default (${curFontWeight || 'auto'})</option>
                    <option value="400">Normal (400)</option>
                    <option value="500">Medium (500)</option>
                    <option value="600">Semibold (600)</option>
                    <option value="700">Bold (700)</option>
                    <option value="800">Extrabold (800)</option>
                </select>
            </div>
        `;
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
        colorRow.innerHTML = `
            <div>
                <label class="block text-[10px] text-slate-400 font-bold uppercase">Text Color</label>
                <input type="color" id="inspTextColor" value="${curTextColor}" class="w-full h-8 bg-slate-950 border border-slate-700 rounded cursor-pointer p-0.5" />
            </div>
            <div>
                <label class="block text-[10px] text-slate-400 font-bold uppercase">BG Color</label>
                <input type="color" id="inspBgColor" value="${curBgColor}" class="w-full h-8 bg-slate-950 border border-slate-700 rounded cursor-pointer p-0.5" />
            </div>
            <div>
                <label class="block text-[10px] text-slate-400 font-bold uppercase">Align</label>
                <div class="flex gap-1 pt-1">
                    <button type="button" data-align="left" class="align-btn flex-1 bg-slate-950 border border-slate-700 py-1 text-[10px] text-slate-300 rounded hover:bg-slate-800 ${curTextAlign === 'left' ? 'border-emerald-500 text-emerald-400 font-bold' : ''}">Left</button>
                    <button type="button" data-align="center" class="align-btn flex-1 bg-slate-950 border border-slate-700 py-1 text-[10px] text-slate-300 rounded hover:bg-slate-800 ${curTextAlign === 'center' ? 'border-emerald-500 text-emerald-400 font-bold' : ''}">Center</button>
                    <button type="button" data-align="right" class="align-btn flex-1 bg-slate-950 border border-slate-700 py-1 text-[10px] text-slate-300 rounded hover:bg-slate-800 ${curTextAlign === 'right' ? 'border-emerald-500 text-emerald-400 font-bold' : ''}">Right</button>
                </div>
            </div>
        `;
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
            subBox.innerHTML = `
                <div class="flex items-center justify-between border-b border-slate-800 pb-1.5">
                    <h4 class="text-amber-400 font-bold flex items-center gap-1">🧩 Editable Section Variables & Sub-Items (${childElements.length})</h4>
                    <span class="text-[10px] text-slate-400">Click 🗑️ to remove element</span>
                </div>
            `;
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
                    childItem.innerHTML = `
                        <div class="flex items-center justify-between">
                            <span class="text-amber-400 font-bold text-[10px] uppercase">🖼️ IMG (${altVal || 'Image'})</span>
                            <button type="button" class="del-child-btn px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded hover:bg-rose-500/30 text-[10px] font-bold cursor-pointer">🗑️</button>
                        </div>
                        <input type="text" value="${srcVal}" placeholder="Image src URL" class="child-src bg-slate-900 border border-slate-700 text-amber-300 rounded px-2 py-1 text-xs focus:outline-none" />
                        <input type="text" value="${altVal}" placeholder="Image alt description" class="child-alt bg-slate-900 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:outline-none" />
                    `;
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
                    childItem.innerHTML = `
                        <div class="flex items-center justify-between">
                            <span class="text-sky-400 font-bold text-[10px] uppercase">🔗 LINK (A)</span>
                            <button type="button" class="del-child-btn px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded hover:bg-rose-500/30 text-[10px] font-bold cursor-pointer">🗑️</button>
                        </div>
                        <div class="flex gap-1.5">
                            <input type="text" value="${textVal}" placeholder="Link label text" class="child-text flex-1 bg-slate-900 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:outline-none" />
                            <input type="text" value="${hrefVal}" placeholder="href target" class="child-href w-36 bg-slate-900 border border-slate-700 text-sky-300 rounded px-2 py-1 text-xs focus:outline-none" />
                        </div>
                    `;
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
                    childItem.innerHTML = `
                        <div class="flex items-center justify-between">
                            <span class="text-emerald-400 font-bold text-[10px] uppercase">📝 ${tagLabel}</span>
                            <button type="button" class="del-child-btn px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded hover:bg-rose-500/30 text-[10px] font-bold cursor-pointer">🗑️</button>
                        </div>
                        <textarea rows="1" class="child-text w-full bg-slate-900 border border-slate-700 text-slate-200 rounded p-1.5 text-xs focus:outline-none">${textVal}</textarea>
                    `;
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
        if (tag === 'section') return el.id ? `Section #${el.id}` : 'Web Section';
        if (tag === 'h1' || tag === 'h2' || tag === 'h3') return `Headline (${tag.toUpperCase()})`;
        if (tag === 'p') return 'Paragraph Text';
        if (tag === 'button') return `Button: "${el.innerText.slice(0, 15)}"`;
        if (tag === 'a') return `Nav Link: "${el.innerText.slice(0, 15)}"`;
        if (tag === 'img') return 'Image Asset';
        return `${tag.toUpperCase()} Component`;
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
                window.sitePagesTree[window.activeTabKey] = "<!DOCTYPE html>\n" + clone.outerHTML;
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
                    const backendUrl = window.BACKEND_WORKER_URL || "https://xsites-backend-worker.xstreamflex.workers.dev";
                    const res = await fetch(`${backendUrl}/api/ai-section-edit`, {
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

    // Automated QC Diagnostic Engine
    async function runQCChecks() {
        const backendUrl = window.XSTREAM_BACKEND_URL || 'https://xsites-backend-worker.xstreamflex.workers.dev';
        try {
            const res = await fetch(`${backendUrl}/qc/check`);
            const data = await res.json();
            console.log('[XSITE QC DIAGNOSTICS LOG]', data);
            return data;
        } catch (e) {
            console.warn('[XSITE QC DIAGNOSTICS WARNING]', e.message);
            return { success: false, error: e.message };
        }
    }

    // Export module global API
    window.XsiteInspector = {
        setupIframeInspector,
        setupInspectorControls,
        pushUndoState,
        renderVariableInspector,
        runQCChecks
    };

    document.addEventListener('DOMContentLoaded', () => {
        setupInspectorControls();
    });

})(window);
