<?php
/**
 * XIMG - Imgur-Style Dedicated Image Viewer Page
 * Displays web-optimized image with stats, embed options, and social meta tags
 */

require_once __DIR__ . '/config.php';

$dbFile = file_exists(__DIR__ . '/lib/Database.php') ? __DIR__ . '/lib/Database.php' : __DIR__ . '/Database.php';
$authFile = file_exists(__DIR__ . '/lib/Auth.php') ? __DIR__ . '/lib/Auth.php' : __DIR__ . '/Auth.php';

require_once $dbFile;
require_once $authFile;

$code = $_GET['code'] ?? $_GET['id'] ?? $_GET['v'] ?? null;
if (!$code) {
    header("Location: " . BASE_URL);
    exit;
}

$shortCode = pathinfo($code, PATHINFO_FILENAME);
$img = Database::getImageByCode($shortCode);

if (!$img) {
    http_response_code(404);
    $title = "404 - Image Not Found";
} else {
    Database::incrementViewCount($shortCode);
    $title = htmlspecialchars($img['original_name']) . " — XIMG Media Vault";
}

$userKey = Auth::getUserKey();
$directUrl = BASE_URL . '/i/' . $shortCode;
$viewUrl = BASE_URL . '/v/' . $shortCode;

function fmtSize($b) {
    $u = ['B','KB','MB','GB'];
    $i = floor(($b ? log($b) : 0)/log(1024));
    return round($b/pow(1024,$i),2).' '.$u[$i];
}
?>
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= $title ?></title>

    <?php if ($img): ?>
    <!-- OpenGraph & Social Media Meta Tags -->
    <meta property="og:title" content="<?= htmlspecialchars($img['original_name']) ?> — XIMG">
    <meta property="og:description" content="View web-optimized media hosted on XIMG Media Vault (XSTREAM FLEX Ecosystem)">
    <meta property="og:image" content="<?= $directUrl ?>">
    <meta property="og:url" content="<?= $viewUrl ?>">
    <meta property="og:type" content="website">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="<?= $directUrl ?>">
    <?php endif; ?>

    <!-- Fonts & Tailwind -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com/3.4.17"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        brand: {
                            glow: '#22c55e',
                            darkBg: '#090a0f',
                            darkCard: '#11131e',
                            darkBorder: '#1e293b',
                            panel: '#11131e'
                        }
                    }
                }
            }
        }
    </script>
    <style>
        body { font-family: 'Plus Jakarta Sans', sans-serif; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
    </style>
</head>
<body class="bg-brand-darkBg text-gray-100 min-h-screen flex flex-col font-sans selection:bg-brand-glow selection:text-black">

    <!-- Header / Nav bar (XSITE DNA) -->
    <nav class="border-b border-gray-800/60 backdrop-blur-md bg-brand-darkBg/70 sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
            <div class="flex items-center gap-3">
                <a href="<?= BASE_URL ?>" class="flex items-center gap-2">
                    <img src="https://drive.google.com/thumbnail?id=1Kx_7yk4oMoHRWAn9WcRYD39qjLMkvMx7&sz=w1000" alt="XIMG Logo" class="h-8 md:h-10 w-auto object-contain">
                    <span class="text-sm tracking-[0.25em] font-black uppercase text-white bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">XIMG VAULT</span>
                </a>
                <span class="text-[9px] uppercase tracking-widest font-mono px-2 py-0.5 rounded border border-brand-glow/30 text-brand-glow bg-brand-glow/5 hidden md:inline-block">Web-Optimized Engine</span>
            </div>
            
            <div class="flex items-center gap-4 text-xs font-mono">
                <a href="<?= BASE_URL ?>" class="px-3 py-1.5 rounded-lg border border-brand-glow/40 bg-brand-glow/10 text-brand-glow hover:bg-brand-glow/20 font-bold transition">Upload Image</a>
            </div>
        </div>
    </nav>

    <!-- Main Content -->
    <main class="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        <?php if (!$img): ?>
            <div class="text-center py-24 bg-brand-darkCard border border-brand-darkBorder rounded-2xl">
                <div class="text-6xl mb-4">🖼️</div>
                <h1 class="text-2xl font-bold text-white mb-2">Image Not Found</h1>
                <p class="text-gray-400 text-sm mb-6">The requested image code does not exist or has been removed.</p>
                <a href="<?= BASE_URL ?>" class="px-6 py-2.5 bg-brand-glow text-black font-bold rounded-lg text-sm hover:opacity-90 transition inline-block">Return to XIMG Home</a>
            </div>
        <?php else: 
            $origSize = (int)$img['orig_size'];
            $webSize = (int)$img['web_size'];
            $savings = round((1 - ($webSize / max(1, $origSize))) * 100, 1);
            if ($savings < 0) $savings = 0;
        ?>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                <!-- Main Image Stage -->
                <div class="lg:col-span-2 space-y-6">
                    <div class="bg-brand-darkCard border border-brand-darkBorder rounded-2xl p-4 overflow-hidden flex items-center justify-center min-h-[400px] shadow-2xl relative group">
                        <img src="<?= $directUrl ?>" alt="<?= htmlspecialchars($img['original_name']) ?>" class="max-h-[75vh] w-auto max-w-full rounded-lg object-contain shadow-lg">
                    </div>

                    <!-- Image Information Footer -->
                    <div class="bg-brand-darkCard border border-brand-darkBorder rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <h1 class="text-lg font-bold text-white truncate max-w-md"><?= htmlspecialchars($img['original_name']) ?></h1>
                            <p class="text-xs text-gray-400 font-mono mt-1">Uploaded <?= date('M j, Y — H:i', $img['created_at']) ?> • <?= (int)$img['view_count'] ?> views</p>
                        </div>
                        <div class="flex items-center gap-3">
                            <a href="<?= $directUrl ?>" download="<?= htmlspecialchars($img['original_name']) ?>" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition flex items-center gap-2">
                                <span>⬇️</span> Download WebP
                            </a>
                        </div>
                    </div>
                </div>

                <!-- Metadata & Embed Codes Drawer -->
                <div class="space-y-6">
                    
                    <!-- Web Optimization Stats Badge -->
                    <div class="bg-brand-darkCard border border-brand-darkBorder rounded-2xl p-5 space-y-4">
                        <h2 class="text-sm font-bold uppercase tracking-wider text-gray-300 flex items-center gap-2">
                            <span>⚡</span> Optimization Performance
                        </h2>

                        <div class="bg-slate-950 border border-emerald-500/20 rounded-xl p-4 text-center">
                            <span class="text-3xl font-extrabold text-brand-glow font-mono"><?= $savings ?>%</span>
                            <p class="text-xs text-gray-400 font-mono mt-1">Bandwidth Saved for Web</p>
                        </div>

                        <div class="grid grid-cols-2 gap-3 text-xs font-mono">
                            <div class="bg-slate-900/80 p-3 rounded-lg border border-gray-800">
                                <span class="text-gray-400 block text-[10px] uppercase">Original Size</span>
                                <span class="text-gray-200 font-bold"><?= fmtSize($origSize) ?></span>
                            </div>
                            <div class="bg-slate-900/80 p-3 rounded-lg border border-gray-800">
                                <span class="text-brand-glow block text-[10px] uppercase">WebP Size</span>
                                <span class="text-brand-glow font-bold"><?= fmtSize($webSize) ?></span>
                            </div>
                            <div class="bg-slate-900/80 p-3 rounded-lg border border-gray-800">
                                <span class="text-gray-400 block text-[10px] uppercase">Dimensions</span>
                                <span class="text-gray-200 font-bold"><?= (int)$img['width'] ?> x <?= (int)$img['height'] ?></span>
                            </div>
                            <div class="bg-slate-900/80 p-3 rounded-lg border border-gray-800">
                                <span class="text-gray-400 block text-[10px] uppercase">Format</span>
                                <span class="text-emerald-400 font-bold">WEBP / Optimized</span>
                            </div>
                        </div>
                    </div>

                    <!-- Embed & Share Code Generator -->
                    <div class="bg-brand-darkCard border border-brand-darkBorder rounded-2xl p-5 space-y-4">
                        <h2 class="text-sm font-bold uppercase tracking-wider text-gray-300 flex items-center gap-2">
                            <span>🔗</span> Embed Links
                        </h2>

                        <div class="space-y-3 text-xs">
                            <div>
                                <label class="text-gray-400 text-[11px] font-mono block mb-1">Direct Image URL</label>
                                <div class="flex gap-2">
                                    <input type="text" readonly value="<?= $directUrl ?>" id="linkDirect" class="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-2 text-emerald-400 font-mono text-xs focus:outline-none">
                                    <button onclick="copyField('linkDirect')" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition">Copy</button>
                                </div>
                            </div>

                            <div>
                                <label class="text-gray-400 text-[11px] font-mono block mb-1">HTML Embed Code</label>
                                <div class="flex gap-2">
                                    <input type="text" readonly value="&lt;img src=&quot;<?= $directUrl ?>&quot; alt=&quot;<?= htmlspecialchars($img['original_name']) ?>&quot; /&gt;" id="linkHtml" class="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-2 text-gray-300 font-mono text-xs focus:outline-none">
                                    <button onclick="copyField('linkHtml')" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition">Copy</button>
                                </div>
                            </div>

                            <div>
                                <label class="text-gray-400 text-[11px] font-mono block mb-1">Markdown (GitHub / Discord)</label>
                                <div class="flex gap-2">
                                    <input type="text" readonly value="![<?= htmlspecialchars($img['original_name']) ?>](<?= $directUrl ?>)" id="linkMarkdown" class="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-2 text-gray-300 font-mono text-xs focus:outline-none">
                                    <button onclick="copyField('linkMarkdown')" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition">Copy</button>
                                </div>
                            </div>

                            <div>
                                <label class="text-gray-400 text-[11px] font-mono block mb-1">Viewer Page URL</label>
                                <div class="flex gap-2">
                                    <input type="text" readonly value="<?= $viewUrl ?>" id="linkViewer" class="w-full bg-slate-950 border border-gray-800 rounded-lg px-3 py-2 text-gray-300 font-mono text-xs focus:outline-none">
                                    <button onclick="copyField('linkViewer')" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition">Copy</button>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

            </div>
        <?php endif; ?>
    </main>

    <!-- Toast Notice -->
    <div id="toast" class="fixed bottom-6 right-6 bg-brand-glow text-black font-extrabold px-5 py-3 rounded-xl shadow-2xl transition-all duration-300 opacity-0 pointer-events-none transform translate-y-4 flex items-center gap-2">
        <span>✅</span> <span id="toastMsg">Copied to clipboard!</span>
    </div>

    <script>
        function copyField(fieldId) {
            const input = document.getElementById(fieldId);
            if (!input) return;
            input.select();
            navigator.clipboard.writeText(input.value);
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
    </script>
</body>
</html>
