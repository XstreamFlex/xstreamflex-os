<?php
/**
 * XIMG - Imgur-Style Image Hosting Web Application
 * Web-Optimized Image Processor & Ecosystem Sync for XSTREAM FLEX / XSITE / EZsite
 */

require_once __DIR__ . '/config.php';

$authFile = file_exists(__DIR__ . '/lib/Auth.php') ? __DIR__ . '/lib/Auth.php' : __DIR__ . '/Auth.php';
require_once $authFile;

$userKey = Auth::getUserKey();
$keyInfo = Auth::validateKey($userKey);
?>
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>XIMG — Web-Optimized Media Vault for XSITE & XSTREAM FLEX</title>

    <!-- Fonts: Plus Jakarta Sans, JetBrains Mono & Orbitron -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;800;900&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
    
    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com/3.4.17"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        brand: {
                            glow: '#22c55e',
                            xbox: '#107C10',
                            xboxHover: '#0e6b0e',
                            darkBg: '#090a0f',
                            darkCard: '#11131e',
                            darkBorder: '#1e293b',
                            panel: '#11131e'
                        }
                    },
                    animation: {
                        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                        'float': 'float 6s ease-in-out infinite',
                    },
                    keyframes: {
                        float: {
                            '0%, 100%': { transform: 'translateY(0)' },
                            '50%': { transform: 'translateY(-8px)' },
                        }
                    }
                }
            }
        }
    </script>
    <style>
        body { font-family: 'Plus Jakarta Sans', sans-serif; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
        
        .glass-card {
            backdrop-filter: blur(12px);
            background: rgba(255, 255, 255, 0.05);
        }
        .font-orbitron {
            font-family: 'Orbitron', sans-serif;
        }

        .glow-effect:focus {
            box-shadow: 0 0 20px rgba(34, 197, 94, 0.2);
        }
        
        .dropzone-active {
            border-color: #22c55e !important;
            background-color: rgba(34, 197, 94, 0.08) !important;
            transform: scale(1.01);
        }
    </style>
</head>
<body class="bg-brand-darkBg text-gray-100 min-h-screen flex flex-col font-sans selection:bg-brand-glow selection:text-black relative overflow-x-hidden">

    <!-- Background Ambient Glows -->
    <div class="absolute top-0 left-1/4 w-[500px] h-[500px] bg-brand-glow/5 rounded-full blur-[140px] pointer-events-none animate-pulse-slow"></div>
    <div class="absolute bottom-10 right-1/4 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[140px] pointer-events-none animate-pulse-slow" style="animation-delay: 2s;"></div>

    <!-- Header / Nav bar (XSITE DNA) -->
    <nav class="border-b border-gray-800/60 backdrop-blur-md bg-brand-darkBg/70 sticky top-0 z-50 transition-colors duration-200">
        <div class="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
            <div class="flex items-center gap-3">
                <a href="index.php" class="flex items-center gap-2">
                    <img src="https://drive.google.com/thumbnail?id=1Kx_7yk4oMoHRWAn9WcRYD39qjLMkvMx7&sz=w1000" alt="XIMG Logo" class="h-8 md:h-10 w-auto object-contain inline-block">
                    <span class="text-sm tracking-[0.25em] font-black uppercase text-white bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent hidden sm:inline-block">XSTREAM FLEX</span>
                </a>
                <span class="text-[9px] uppercase tracking-widest font-mono px-2 py-0.5 rounded border border-brand-glow/30 text-brand-glow bg-brand-glow/5 hidden md:inline-block">XIMG Media Engine v1.0</span>
            </div>
            
            <!-- Ecosystem Navigation Links -->
            <div class="hidden lg:flex items-center gap-8 text-sm font-semibold tracking-wide">
                <a href="https://xstreamflex.com/" class="text-slate-300 hover:text-brand-glow transition-all">Home</a>
                <a href="https://xstreamflex.com/#products" class="text-slate-300 hover:text-brand-glow transition-all">Products</a>
                <a href="xsite" class="text-slate-300 hover:text-brand-glow transition-all">XSITE Studio</a>
                <a href="ezsite" class="text-slate-300 hover:text-brand-glow transition-all">EZsite</a>
                <a href="ximg" class="text-brand-glow font-bold">XIMG Vault</a>
                <a href="account" class="text-slate-300 hover:text-brand-glow transition-all">Account</a>
            </div>

            <!-- Identity Key Badge -->
            <div class="flex items-center gap-3 text-xs font-mono">
                <div class="bg-brand-darkCard border border-brand-darkBorder px-3 py-1.5 rounded-lg flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-brand-glow animate-pulse"></span>
                    <span class="text-gray-400">Key:</span>
                    <span id="displayKeyText" class="text-brand-glow font-bold truncate max-w-[120px]"><?= htmlspecialchars($userKey) ?></span>
                    <button onclick="promptKeyChange()" class="text-gray-500 hover:text-white transition" title="Set XSITE Key">✏️</button>
                </div>
            </div>
        </div>
    </nav>

    <!-- Hero Header -->
    <header class="max-w-4xl mx-auto px-4 pt-12 pb-6 text-center space-y-4">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-brand-glow/30 bg-brand-glow/10 text-brand-glow text-xs font-mono font-semibold">
            <span>⚡</span> WebP Image Conversion & CDN Link Generator
        </div>
        <h1 class="text-3xl md:text-5xl font-black text-white tracking-tight">
            Upload Once. <span class="text-transparent bg-clip-text bg-gradient-to-r from-brand-glow via-emerald-300 to-teal-400">Embed Anywhere.</span>
        </h1>
        <p class="text-gray-400 text-sm md:text-base max-w-2xl mx-auto">
            Drop images to auto-convert them into lightweight WebP format. Get instant direct URLs, HTML embeds, and markdown codes synced directly with your XSITE key identity.
        </p>
    </header>

    <!-- Navigation Tabs (Upload vs My Gallery vs Favicon Maker) -->
    <div class="max-w-4xl mx-auto px-4 mb-6">
        <div class="flex items-center justify-center gap-3 sm:gap-4 border-b border-brand-darkBorder pb-4 flex-wrap">
            <button id="tabBtnUpload" onclick="switchTab('upload')" class="px-6 py-2.5 rounded-xl font-bold text-sm bg-brand-glow text-black shadow-lg transition flex items-center gap-2">
                <span>📤</span> Upload New Image
            </button>
            <button id="tabBtnGallery" onclick="switchTab('gallery')" class="px-6 py-2.5 rounded-xl font-bold text-sm bg-brand-darkCard text-gray-300 hover:text-white border border-brand-darkBorder transition flex items-center gap-2">
                <span>🖼️</span> My Gallery (<span id="galleryCountBadge">0</span>)
            </button>
            <button id="tabBtnFavicon" onclick="switchTab('favicon')" class="px-6 py-2.5 rounded-xl font-bold text-sm bg-brand-darkCard text-gray-300 hover:text-white border border-brand-darkBorder transition flex items-center gap-2">
                <span>✨</span> Favicon Maker
            </button>
        </div>
    </div>

    <!-- Main Workspace -->
    <main class="flex-1 max-w-4xl w-full mx-auto px-4 pb-16">
        
        <!-- SECTION 1: UPLOAD SECTION -->
        <section id="sectionUpload" class="space-y-6">
            
            <!-- Upload Mode Switcher (File vs URL) -->
            <div class="bg-brand-darkCard border border-brand-darkBorder rounded-2xl p-6 shadow-2xl space-y-6">
                
                <div class="flex items-center justify-between border-b border-gray-800 pb-4">
                    <div class="flex items-center gap-4 text-xs font-mono font-bold">
                        <button id="subTabFile" onclick="setUploadMode('file')" class="text-brand-glow border-b-2 border-brand-glow pb-1 transition">File / Drag & Drop</button>
                        <button id="subTabUrl" onclick="setUploadMode('url')" class="text-gray-400 hover:text-white pb-1 transition">Fetch from URL</button>
                    </div>
                    <span class="text-xs text-gray-500 font-mono hidden sm:inline">Tip: Press <kbd class="px-1.5 py-0.5 bg-slate-900 border border-gray-700 rounded text-gray-300">Ctrl + V</kbd> anywhere to paste image</span>
                </div>

                <!-- Dropzone Area -->
                <div id="dropzone" class="border-2 border-dashed border-emerald-500/40 rounded-2xl p-10 text-center bg-slate-950/50 hover:bg-slate-950/80 transition-all cursor-pointer relative group space-y-4">
                    <input type="file" id="fileInput" accept="image/*,.ico,image/x-icon" class="hidden">
                    
                    <div class="w-16 h-16 mx-auto rounded-full bg-brand-glow/10 border border-brand-glow/30 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">
                        📸
                    </div>

                    <div>
                        <h3 class="text-lg font-bold text-white mb-1">Drag & Drop Image Here</h3>
                        <p class="text-xs text-gray-400 font-mono">Supports PNG, JPG, GIF, WEBP, BMP, ICO up to 25MB</p>
                    </div>

                    <button type="button" class="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-gray-700 transition">
                        Browse Computer
                    </button>
                </div>

                <!-- URL Input Area (Hidden by default) -->
                <div id="urlUploadArea" class="hidden space-y-4">
                    <label class="block text-xs font-mono text-gray-400">Enter Public Image Web URL:</label>
                    <div class="flex gap-2">
                        <input type="url" id="imageUrlInput" placeholder="https://example.com/photo.jpg" class="w-full bg-slate-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-brand-glow">
                        <button onclick="uploadFromUrl()" class="px-6 py-3 bg-brand-glow text-black font-bold text-xs rounded-xl hover:opacity-90 transition whitespace-nowrap">
                            Fetch & Convert
                        </button>
                    </div>
                </div>

                <!-- Progress Loading Indicator -->
                <div id="uploadProgress" class="hidden space-y-3 p-4 bg-slate-950 border border-emerald-500/30 rounded-xl">
                    <div class="flex items-center justify-between text-xs font-mono">
                        <span class="text-brand-glow font-bold flex items-center gap-2">
                            <span class="animate-spin">⚡</span> Optimizing image & converting to WebP...
                        </span>
                        <span id="progressPercent" class="text-gray-400">0%</span>
                    </div>
                    <div class="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                        <div id="progressBar" class="h-full bg-brand-glow w-0 transition-all duration-300"></div>
                    </div>
                </div>

            </div>

            <!-- RESULT CARD (Displayed after upload) -->
            <div id="resultCard" class="hidden bg-brand-darkCard border border-brand-darkBorder rounded-2xl p-6 shadow-2xl space-y-6 animate-fade-in">
                
                <div class="flex flex-wrap items-center justify-between gap-4 border-b border-gray-800 pb-4">
                    <div class="flex items-center gap-3">
                        <span class="w-3 h-3 rounded-full bg-brand-glow"></span>
                        <h2 class="text-lg font-bold text-white">Upload Successful & Optimized!</h2>
                    </div>
                    <div class="bg-emerald-500/10 border border-emerald-500/30 text-brand-glow px-4 py-1.5 rounded-full font-mono text-xs font-bold">
                        <span>⚡</span> Saved <span id="resSavings">0</span>% Web Size
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    
                    <!-- Thumbnail Preview -->
                    <div class="md:col-span-1 flex flex-col items-center justify-center bg-slate-950 border border-gray-800 rounded-xl p-4">
                        <img id="resPreviewImg" src="" alt="Uploaded image" class="max-h-48 w-auto max-w-full rounded-lg object-contain mb-3">
                        <span id="resDimensions" class="text-[11px] font-mono text-gray-400">0 x 0 px</span>
                    </div>

                    <!-- Size Metrics & Links -->
                    <div class="md:col-span-2 space-y-4">
                        
                        <div class="grid grid-cols-2 gap-3 text-xs font-mono">
                            <div class="bg-slate-900 p-3 rounded-lg border border-gray-800">
                                <span class="text-gray-400 block text-[10px]">Original Size</span>
                                <span id="resOrigSize" class="text-gray-200 font-bold">0 KB</span>
                            </div>
                            <div class="bg-slate-900 p-3 rounded-lg border border-gray-800">
                                <span class="text-brand-glow block text-[10px]">WebP Size</span>
                                <span id="resWebSize" class="text-brand-glow font-bold">0 KB</span>
                            </div>
                        </div>

                        <!-- Embed Link Fields -->
                        <div class="space-y-3 text-xs">
                            <div>
                                <label class="text-gray-400 text-[11px] font-mono block mb-1">Direct Image URL</label>
                                <div class="flex gap-2">
                                    <input type="text" readonly id="resDirectUrl" class="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-2 text-brand-glow font-mono text-xs focus:outline-none">
                                    <button onclick="copyId('resDirectUrl')" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition">Copy</button>
                                </div>
                            </div>

                            <div>
                                <label class="text-gray-400 text-[11px] font-mono block mb-1">⚡ .ICO Favicon URL (XSITE Compatible)</label>
                                <div class="flex gap-2">
                                    <input type="text" readonly id="resIcoUrl" class="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-2 text-emerald-400 font-mono text-xs focus:outline-none">
                                    <button onclick="copyId('resIcoUrl')" class="px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-bold transition">Copy .ICO</button>
                                </div>
                            </div>

                            <div>
                                <label class="text-gray-400 text-[11px] font-mono block mb-1">HTML Embed Code</label>
                                <div class="flex gap-2">
                                    <input type="text" readonly id="resHtmlEmbed" class="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-2 text-gray-300 font-mono text-xs focus:outline-none">
                                    <button onclick="copyId('resHtmlEmbed')" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition">Copy</button>
                                </div>
                            </div>

                            <div>
                                <label class="text-gray-400 text-[11px] font-mono block mb-1">Markdown (GitHub / Discord)</label>
                                <div class="flex gap-2">
                                    <input type="text" readonly id="resMarkdownEmbed" class="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-2 text-gray-300 font-mono text-xs focus:outline-none">
                                    <button onclick="copyId('resMarkdownEmbed')" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition">Copy</button>
                                </div>
                            </div>

                            <div>
                                <label class="text-gray-400 text-[11px] font-mono block mb-1">Viewer Page Link</label>
                                <div class="flex gap-2">
                                    <input type="text" readonly id="resViewUrl" class="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-2 text-gray-300 font-mono text-xs focus:outline-none">
                                    <button onclick="copyId('resViewUrl')" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition">Copy</button>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

            </div>

        </section>

        <!-- SECTION 2: GALLERY SECTION -->
        <section id="sectionGallery" class="hidden space-y-6">
            <div class="bg-brand-darkCard border border-brand-darkBorder rounded-2xl p-6 shadow-2xl">
                <div class="flex items-center justify-between mb-6 pb-4 border-b border-gray-800">
                    <div>
                        <h2 class="text-lg font-bold text-white">Your Uploaded Media</h2>
                        <p class="text-xs text-gray-400 font-mono">Linked with Key Identity: <span class="text-brand-glow font-bold"><?= htmlspecialchars($userKey) ?></span></p>
                    </div>
                    <button onclick="loadUserGallery()" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-mono text-white rounded-lg transition">
                        🔄 Refresh
                    </button>
                </div>

                <div id="galleryGrid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    <!-- Loaded dynamically via JS -->
                </div>

                <div id="galleryEmpty" class="hidden text-center py-12 text-gray-500 font-mono text-xs">
                    No uploaded images found under this key identity yet.
                </div>
            </div>
        </section>

        <!-- SECTION 3: FAVICON MAKER SECTION -->
        <section id="sectionFavicon" class="hidden space-y-6">
            <div class="max-w-3xl mx-auto">
                
                <h1 class="text-3xl md:text-4xl font-bold mb-6 text-center font-orbitron text-white">
                    XstreamFlex Favicon Maker
                </h1>

                <div class="glass-card p-6 rounded-xl shadow-xl border border-white/10">
                  
                  <label class="block mb-4 text-lg font-semibold text-white">
                    Upload an image (PNG, JPG, SVG)
                  </label>

                  <input id="faviconInput" type="file" accept="image/*"
                    class="w-full p-3 bg-black/40 border border-white/10 rounded-lg cursor-pointer text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-brand-glow file:text-black hover:file:bg-emerald-400">

                  <div id="previewContainer" class="mt-6 hidden">
                    <h2 class="text-xl font-semibold mb-2 text-white">Preview</h2>
                    <canvas id="faviconCanvas" width="256" height="256"
                      class="border border-white/10 rounded-lg max-w-full bg-slate-950/50"></canvas>
                  </div>

                  <button id="generateBtn"
                    class="mt-6 w-full py-3 bg-green-500 hover:bg-green-600 text-black font-bold rounded-lg transition cursor-pointer">
                    Generate Favicon Files
                  </button>

                  <div id="downloadSection" class="mt-6 hidden">
                    <h2 class="text-xl font-semibold mb-3 text-white">Save & Host .ICO for XSITE</h2>

                    <button id="saveVaultIcoBtn" type="button"
                      class="block w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black text-center font-extrabold rounded-lg mb-3 cursor-pointer transition shadow-lg">
                      ⚡ Save & Host .ICO to XMG Vault (For XSITE)
                    </button>

                    <a id="downloadICO"
                      class="block w-full py-3 bg-purple-500 hover:bg-purple-600 text-white text-center font-bold rounded-lg mb-3 cursor-pointer transition">
                      Download favicon.ico
                    </a>

                    <a id="downloadPNG"
                      class="block w-full py-3 bg-blue-500 hover:bg-blue-600 text-white text-center font-bold rounded-lg cursor-pointer transition">
                      Download favicon.png
                    </a>

                    <h3 class="text-lg font-semibold mt-6 mb-2 text-white">XSITES Snippet</h3>
                    <div class="relative group">
                        <pre id="faviconSnippet" class="bg-black/40 p-4 rounded-lg text-green-300 text-sm overflow-x-auto font-mono border border-white/5">&lt;link rel="icon" type="image/png" href="/favicon.png"&gt;
&lt;link rel="icon" type="image/x-icon" href="/favicon.ico"&gt;</pre>
                        <button onclick="copyId('faviconSnippet')" class="absolute top-2 right-2 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs text-white rounded font-mono transition">Copy</button>
                    </div>
                  </div>

                </div>
            </div>
        </section>

    </main>

    <!-- Footer -->
    <footer class="border-t border-gray-800/60 py-8 bg-brand-darkBg/90 text-center text-xs font-mono text-gray-500">
        <p>XIMG Media Vault &copy; <?= date('Y') ?> XSTREAM FLEX Ecosystem. All rights reserved.</p>
    </footer>

    <!-- Toast Notice -->
    <div id="toast" class="fixed bottom-6 right-6 bg-brand-glow text-black font-extrabold px-5 py-3 rounded-xl shadow-2xl transition-all duration-300 opacity-0 pointer-events-none transform translate-y-4 flex items-center gap-2 z-50">
        <span>✅</span> <span id="toastMsg">Copied link to clipboard!</span>
    </div>

    <!-- Application Script -->
    <script>
        let currentKey = <?= json_encode($userKey) ?>;

        document.addEventListener('DOMContentLoaded', () => {
            setupDropzone();
            setupPasteHandler();
            loadUserGallery();
            setupFaviconMaker();
        });

        function switchTab(tab) {
            const uploadSec = document.getElementById('sectionUpload');
            const gallerySec = document.getElementById('sectionGallery');
            const faviconSec = document.getElementById('sectionFavicon');
            const btnUpload = document.getElementById('tabBtnUpload');
            const btnGallery = document.getElementById('tabBtnGallery');
            const btnFavicon = document.getElementById('tabBtnFavicon');

            const activeClass = 'px-6 py-2.5 rounded-xl font-bold text-sm bg-brand-glow text-black shadow-lg transition flex items-center gap-2';
            const inactiveClass = 'px-6 py-2.5 rounded-xl font-bold text-sm bg-brand-darkCard text-gray-300 hover:text-white border border-brand-darkBorder transition flex items-center gap-2';

            uploadSec.classList.add('hidden');
            gallerySec.classList.add('hidden');
            faviconSec.classList.add('hidden');

            btnUpload.className = inactiveClass;
            btnGallery.className = inactiveClass;
            btnFavicon.className = inactiveClass;

            if (tab === 'upload') {
                uploadSec.classList.remove('hidden');
                btnUpload.className = activeClass;
            } else if (tab === 'gallery') {
                gallerySec.classList.remove('hidden');
                btnGallery.className = activeClass;
                loadUserGallery();
            } else if (tab === 'favicon') {
                faviconSec.classList.remove('hidden');
                btnFavicon.className = activeClass;
            }
        }

        function setUploadMode(mode) {
            const subFile = document.getElementById('subTabFile');
            const subUrl = document.getElementById('subTabUrl');
            const dropzone = document.getElementById('dropzone');
            const urlArea = document.getElementById('urlUploadArea');

            if (mode === 'file') {
                subFile.className = 'text-brand-glow border-b-2 border-brand-glow pb-1 transition';
                subUrl.className = 'text-gray-400 hover:text-white pb-1 transition';
                dropzone.classList.remove('hidden');
                urlArea.classList.add('hidden');
            } else {
                subUrl.className = 'text-brand-glow border-b-2 border-brand-glow pb-1 transition';
                subFile.className = 'text-gray-400 hover:text-white pb-1 transition';
                urlArea.classList.remove('hidden');
                dropzone.classList.add('hidden');
            }
        }

        function setupDropzone() {
            const dz = document.getElementById('dropzone');
            const fileInput = document.getElementById('fileInput');

            dz.addEventListener('click', () => fileInput.click());

            fileInput.addEventListener('change', () => {
                if (fileInput.files.length) uploadFile(fileInput.files[0]);
            });

            ['dragenter', 'dragover'].forEach(eventName => {
                dz.addEventListener(eventName, (e) => { e.preventDefault(); dz.classList.add('dropzone-active'); });
            });

            ['dragleave', 'drop'].forEach(eventName => {
                dz.addEventListener(eventName, (e) => { e.preventDefault(); dz.classList.remove('dropzone-active'); });
            });

            dz.addEventListener('drop', (e) => {
                if (e.dataTransfer.files.length) {
                    uploadFile(e.dataTransfer.files[0]);
                }
            });
        }

        function setupPasteHandler() {
            document.addEventListener('paste', (e) => {
                const items = (e.clipboardData || e.originalEvent.clipboardData).items;
                for (let item of items) {
                    if (item.type.indexOf('image') === 0) {
                        const blob = item.getAsFile();
                        uploadFile(blob);
                        break;
                    }
                }
            });
        }

        async function uploadFile(file) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('api_key', currentKey);

            showProgress(true);

            try {
                const res = await fetch('api/upload.php', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                showProgress(false);

                if (data.success) {
                    displayResult(data);
                    loadUserGallery();
                } else {
                    alert('Upload Failed: ' + data.error);
                }
            } catch (err) {
                showProgress(false);
                alert('Upload Error: ' + err.message);
            }
        }

        async function uploadFromUrl() {
            const urlInput = document.getElementById('imageUrlInput');
            const url = urlInput.value.trim();
            if (!url) return alert('Please enter a valid image URL.');

            showProgress(true);

            try {
                const res = await fetch('api/upload.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: url, api_key: currentKey })
                });
                const data = await res.json();
                showProgress(false);

                if (data.success) {
                    displayResult(data);
                    urlInput.value = '';
                    loadUserGallery();
                } else {
                    alert('Fetch Failed: ' + data.error);
                }
            } catch (err) {
                showProgress(false);
                alert('Error: ' + err.message);
            }
        }

        function showProgress(show) {
            const p = document.getElementById('uploadProgress');
            const bar = document.getElementById('progressBar');
            p.classList.toggle('hidden', !show);
            if (show) {
                bar.style.width = '30%';
                setTimeout(() => bar.style.width = '70%', 300);
            } else {
                bar.style.width = '100%';
                setTimeout(() => p.classList.add('hidden'), 500);
            }
        }

        function displayResult(data) {
            const card = document.getElementById('resultCard');
            card.classList.remove('hidden');

            document.getElementById('resSavings').innerText = data.savings_percent;
            document.getElementById('resPreviewImg').src = data.direct_url;
            document.getElementById('resDimensions').innerText = `${data.width} x ${data.height} px`;
            document.getElementById('resOrigSize').innerText = data.orig_size_fmt;
            document.getElementById('resWebSize').innerText = data.web_size_fmt;

            document.getElementById('resDirectUrl').value = data.embeds.direct;
            const resIco = document.getElementById('resIcoUrl');
            if (resIco) resIco.value = data.ico_url || (data.embeds ? data.embeds.ico : '');
            document.getElementById('resHtmlEmbed').value = data.embeds.html;
            document.getElementById('resMarkdownEmbed').value = data.embeds.markdown;
            document.getElementById('resViewUrl').value = data.embeds.viewer;

            card.scrollIntoView({ behavior: 'smooth' });
        }

        async function loadUserGallery() {
            try {
                const res = await fetch(`api/gallery.php?key=${encodeURIComponent(currentKey)}`);
                const data = await res.json();

                const grid = document.getElementById('galleryGrid');
                const empty = document.getElementById('galleryEmpty');
                const badge = document.getElementById('galleryCountBadge');

                badge.innerText = data.count || 0;

                if (!data.success || !data.images || data.images.length === 0) {
                    grid.innerHTML = '';
                    empty.classList.remove('hidden');
                    return;
                }

                empty.classList.add('hidden');
                grid.innerHTML = data.images.map(img => `
                    <div class="bg-slate-950 border border-gray-800 rounded-xl overflow-hidden group hover:border-brand-glow/40 transition">
                        <div class="h-32 bg-slate-900 flex items-center justify-center p-2 relative overflow-hidden">
                            <img src="${img.thumb_url}" alt="${img.original_name}" class="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-200">
                            <span class="absolute top-2 right-2 bg-black/80 text-brand-glow text-[10px] font-mono font-bold px-1.5 py-0.5 rounded">
                                -${img.savings_percent}%
                            </span>
                        </div>
                        <div class="p-3 space-y-2">
                            <p class="text-xs font-bold text-white truncate" title="${img.original_name}">${img.original_name}</p>
                            <div class="flex items-center justify-between text-[10px] font-mono text-gray-400">
                                <span>${img.created_at_fmt.split(' ')[0]}</span>
                                <span>${img.view_count} views</span>
                            </div>
                            <div class="flex gap-1 pt-1 flex-wrap">
                                <button onclick="copyText('${img.direct_url}')" class="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-white font-mono text-[10px] font-bold rounded transition">
                                    Copy URL
                                </button>
                                <button onclick="copyText('${img.ico_url || (img.direct_url + '.ico')}')" class="px-2 py-1 bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300 font-mono text-[10px] font-bold rounded transition" title="Copy XSITE .ICO URL">
                                    .ICO
                                </button>
                                <a href="${img.view_url}" target="_blank" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-gray-300 text-[10px] font-bold rounded transition">
                                    View
                                </a>
                            </div>
                        </div>
                    </div>
                `).join('');

            } catch (err) {
                console.error('Gallery load error:', err);
            }
        }

        function promptKeyChange() {
            const key = prompt('Enter your XSITE / EZsite License or API Key:', currentKey);
            if (key !== null) {
                currentKey = key.trim() || 'anonymous';
                localStorage.setItem('xsites_key', currentKey);
                document.getElementById('displayKeyText').innerText = currentKey;
                loadUserGallery();
                showToast('XSITE Key updated!');
            }
        }

        function copyId(id) {
            const el = document.getElementById(id);
            if (el) copyText(el.value || el.innerText);
        }

        function copyText(text) {
            navigator.clipboard.writeText(text);
            showToast('Copied link to clipboard!');
        }

        function showToast(msg) {
            const toast = document.getElementById('toast');
            const toastMsg = document.getElementById('toastMsg');
            toastMsg.innerText = msg;
            toast.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-4');
            setTimeout(() => {
                toast.classList.add('opacity-0', 'pointer-events-none', 'translate-y-4');
            }, 2500);
        }

        // --- Favicon Maker Logic ---
        function setupFaviconMaker() {
            const input = document.getElementById("faviconInput");
            const canvas = document.getElementById("faviconCanvas");
            if (!input || !canvas) return;

            const ctx = canvas.getContext("2d");
            const previewContainer = document.getElementById("previewContainer");
            const generateBtn = document.getElementById("generateBtn");
            const downloadSection = document.getElementById("downloadSection");
            const downloadICO = document.getElementById("downloadICO");
            const downloadPNG = document.getElementById("downloadPNG");

            let img = new Image();

            input.addEventListener("change", function () {
                const file = this.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = function (e) {
                    img = new Image();
                    img.onload = function () {
                        previewContainer.classList.remove("hidden");
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            });

            const saveVaultBtn = document.getElementById("saveVaultIcoBtn");
            let lastIcoBlob = null;

            generateBtn.addEventListener("click", async function () {
                if (!img.src) return alert("Upload an image first.");

                // Generate PNG Blob
                canvas.toBlob(blob => {
                    if (downloadPNG.href && downloadPNG.href.startsWith('blob:')) {
                        URL.revokeObjectURL(downloadPNG.href);
                    }
                    const pngUrl = URL.createObjectURL(blob);
                    downloadPNG.href = pngUrl;
                    downloadPNG.download = "favicon.png";
                }, "image/png");

                // Generate ICO Blob (Multi-size binary ICO)
                try {
                    lastIcoBlob = await createIcoBlob(img, [16, 32, 48]);
                    if (downloadICO.href && downloadICO.href.startsWith('blob:')) {
                        URL.revokeObjectURL(downloadICO.href);
                    }
                    const icoURL = URL.createObjectURL(lastIcoBlob);
                    downloadICO.href = icoURL;
                    downloadICO.download = "favicon.ico";
                } catch (err) {
                    console.error("ICO generation error, falling back to basic blob:", err);
                    const sizes = [16, 32, 48];
                    const icoCanvas = document.createElement("canvas");
                    const icoCtx = icoCanvas.getContext("2d");
                    const icoParts = [];
                    sizes.forEach(size => {
                        icoCanvas.width = size;
                        icoCanvas.height = size;
                        icoCtx.clearRect(0, 0, size, size);
                        icoCtx.drawImage(img, 0, 0, size, size);
                        icoParts.push(icoCanvas.toDataURL("image/png"));
                    });
                    lastIcoBlob = new Blob(icoParts, { type: "image/x-icon" });
                    const icoURL = URL.createObjectURL(lastIcoBlob);
                    downloadICO.href = icoURL;
                    downloadICO.download = "favicon.ico";
                }

                downloadSection.classList.remove("hidden");
            });

            if (saveVaultBtn) {
                saveVaultBtn.addEventListener("click", async function () {
                    if (!img.src) return alert("Upload an image first.");
                    if (!lastIcoBlob) {
                        try {
                            lastIcoBlob = await createIcoBlob(img, [16, 32, 48]);
                        } catch (e) {
                            return alert("Please generate favicon files first.");
                        }
                    }

                    saveVaultBtn.disabled = true;
                    saveVaultBtn.innerText = "⏳ Saving .ICO to XMG Vault...";

                    try {
                        const file = new File([lastIcoBlob], "favicon.ico", { type: "image/x-icon" });
                        const formData = new FormData();
                        formData.append('file', file);
                        formData.append('api_key', currentKey);

                        const res = await fetch('api/upload.php', {
                            method: 'POST',
                            body: formData
                        });
                        const data = await res.json();

                        saveVaultBtn.disabled = false;
                        saveVaultBtn.innerText = "⚡ Save & Host .ICO to XMG Vault (For XSITE)";

                        if (data.success) {
                            const icoUrl = data.ico_url || data.direct_url;
                            const snippetEl = document.getElementById("faviconSnippet");
                            if (snippetEl) {
                                snippetEl.innerText = `<link rel="icon" type="image/x-icon" href="${icoUrl}">`;
                            }
                            showToast("Saved & Hosted .ICO to XMG Vault!");
                            loadUserGallery();
                        } else {
                            alert("Upload Failed: " + data.error);
                        }
                    } catch (err) {
                        saveVaultBtn.disabled = false;
                        saveVaultBtn.innerText = "⚡ Save & Host .ICO to XMG Vault (For XSITE)";
                        alert("Error: " + err.message);
                    }
                });
            }
        }

        async function createIcoBlob(img, sizes = [16, 32, 48]) {
            const pngBuffers = [];
            for (const size of sizes) {
                const c = document.createElement('canvas');
                c.width = size;
                c.height = size;
                const ctx = c.getContext('2d');
                ctx.clearRect(0, 0, size, size);
                ctx.drawImage(img, 0, 0, size, size);
                const blob = await new Promise(resolve => c.toBlob(resolve, 'image/png'));
                const arrayBuffer = await blob.arrayBuffer();
                pngBuffers.push({
                    width: size >= 256 ? 0 : size,
                    height: size >= 256 ? 0 : size,
                    data: new Uint8Array(arrayBuffer)
                });
            }

            const numImages = pngBuffers.length;
            const headerSize = 6;
            const dirEntrySize = 16;
            let offset = headerSize + (dirEntrySize * numImages);

            let totalSize = offset;
            for (const imgBuf of pngBuffers) {
                totalSize += imgBuf.data.length;
            }

            const buffer = new ArrayBuffer(totalSize);
            const view = new DataView(buffer);
            const uint8 = new Uint8Array(buffer);

            // ICO Header
            view.setUint16(0, 0, true); // Reserved
            view.setUint16(2, 1, true); // Type: 1 = Icon
            view.setUint16(4, numImages, true); // Number of images

            let currentOffset = offset;
            for (let i = 0; i < numImages; i++) {
                const entryOffset = headerSize + (i * dirEntrySize);
                const imgBuf = pngBuffers[i];

                view.setUint8(entryOffset + 0, imgBuf.width);
                view.setUint8(entryOffset + 1, imgBuf.height);
                view.setUint8(entryOffset + 2, 0); // Palette
                view.setUint8(entryOffset + 3, 0); // Reserved
                view.setUint16(entryOffset + 4, 1, true); // Planes
                view.setUint16(entryOffset + 6, 32, true); // Bits per pixel
                view.setUint32(entryOffset + 8, imgBuf.data.length, true); // Size
                view.setUint32(entryOffset + 12, currentOffset, true); // Offset

                uint8.set(imgBuf.data, currentOffset);
                currentOffset += imgBuf.data.length;
            }

            return new Blob([buffer], { type: 'image/x-icon' });
        }
    </script>
</body>
</html>
