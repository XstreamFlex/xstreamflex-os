# XSTREAMFLEX OS — Master Suite (v2.0)

> Autonomous multi-agent website generation, CDN image hosting & media vault, and high-deliverability email marketing engine unified into a single ecosystem.

## 🚀 Live Demo & GitHub Pages Deployment

This project is configured out-of-the-box for instant zero-config deployment to **GitHub Pages**.

### One-Click GitHub Pages Setup
1. Push this repository to GitHub (`main` or `master` branch).
2. Go to **Settings &rarr; Pages** in your GitHub repository.
3. Under **Source**, choose **GitHub Actions** (or Deploy from a branch: `/root`).
4. The workflow in `.github/workflows/deploy.yml` will automatically build and publish your live suite at:
   `https://<your-username>.github.io/<repo-name>/`

---

## 📦 Suite Applications

| Application | Path | Description |
| :--- | :--- | :--- |
| **Launchpad Hub** | `index.html` | Master OS dashboard with quick launch cards and system status. |
| **XSITE Studio** | `frontend/xsite.html` | Full-featured AI website generator (Gemini / Claude / Groq), multi-page ghost tabs, live visual inspector, DNA scraper. |
| **EZsite Wizard** | `frontend/ezsite.html` | Conversational 5-step website wizard with instant live preview and niche themes. |
| **XMG Media Vault** | `frontend/xmg.html` | Image storage vault, drag-and-drop uploader, CDN embed code generator, and asset gallery. |
| **XMAIL Engine** | `frontend/xmail.html` | Responsive newsletter builder, subscriber CRM, SMTP tester, and campaign dispatch. |
| **Account & SSO Hub** | `frontend/account.html` | Unified JWT/LocalStorage credentials manager, token shop, and saved project vault. |

---

## 🛠️ Offline & GitHub Pages Fallbacks
All frontend apps include built-in offline demo fallbacks. If the Cloudflare Worker backend is unreachable:
- Tokens & Master Admin sessions are auto-simulated locally.
- Site compilation generates full responsive preview scaffolds with DNA matching.
- XMG and XMAIL operate with local storage persistence.
- **Default Master Admin Dev Key:** `XSTREAM-ADMIN-DEV-99`

---

## ⚙️ Backend & Standalone Services

### 1. Cloudflare Worker Backend (`backend/`)
- `backend/index.js`: Serverless worker handling multi-LLM generation, GitHub Pages repo creation, and DNA extraction.
- `backend/crypto-vault.js`: Secure AES encryption for stored API keys and tokens.
- Deploy with Wrangler:
  ```bash
  cd backend
  npx wrangler deploy
  ```

### 2. Standalone XMG Service (`services/ximg/`)
- Standalone PHP / Hostinger / cPanel media uploader and storage engine.

### 3. Standalone XMAIL Service (`services/xmail/`)
- Standalone Express / Node.js & PHP mail dispatch and open/click tracking engine.

---

## 📁 Repository Structure

```
xstreamflex-hq/
├── .github/workflows/deploy.yml   <-- GitHub Actions Pages pipeline
├── .nojekyll                      <-- Jekyll bypass for GitHub Pages
├── _config.yml                    <-- Jekyll metadata config
├── .gitignore
├── index.html                     <-- Master Launchpad Hub
├── README.md
├── frontend/                      <-- GitHub Pages Frontend Suite
│   ├── index.html                 <-- Direct XSITE Studio entry
│   ├── xsite.html                 <-- XSITE Studio & DNA Engine
│   ├── ezsite.html                <-- EZsite Guided Builder
│   ├── xmg.html                   <-- XMG Media Vault
│   ├── xmail.html                 <-- XMAIL Campaign Studio
│   ├── account.html               <-- Account, Billing & Tokens
│   ├── unified-auth.js            <-- Universal SSO & Local Session SDK
│   ├── auth-guard.js              <-- Header nav & token balance guard
│   ├── ximg-widget.js             <-- Asset embedder widget
│   ├── xmail-sdk.js               <-- Embedded email SDK
│   ├── xsite-inspector.js         <-- Visual canvas inspector
│   ├── articles-data.js           <-- Content template presets
│   └── products-data.js           <-- E-commerce template presets
├── backend/                       <-- Cloudflare Worker Backend
│   ├── index.js
│   ├── crypto-vault.js
│   ├── influencersoft.js
│   └── wrangler.toml
└── services/                      <-- Standalone Service Packages
    ├── ximg/
    └── xmail/
```

---

&copy; 2026 XSTREAMFLEX OS. All rights reserved.
