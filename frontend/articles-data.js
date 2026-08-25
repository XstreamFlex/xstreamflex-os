/**
 * XSITES Blog Ecosystem Sync Manifest & Runtime Engine
 * Automatically tracks, syncs, and renders dynamic blog hub listings and article recommendations.
 */
(function(window) {
  window.XSITE_BLOG_MANIFEST = window.XSITE_BLOG_MANIFEST || [
    {
      id: "post-1",
      slug: "blog-post-1.html",
      title: "10 Proven Growth Strategies for Modern Digital Products",
      category: "Growth & Strategy",
      date: "2026-08-21",
      readTime: "5 min",
      author: "Editorial Team",
      excerpt: "Explore the most effective scaling frameworks, conversion tactics, and customer acquisition channels driving growth today.",
      tags: ["growth", "marketing", "strategy"],
      featured: true
    },
    {
      id: "post-2",
      slug: "blog-post-2.html",
      title: "How to Build a High-Converting Customer Onboarding Flow",
      category: "UX & Conversion",
      date: "2026-08-20",
      readTime: "6 min",
      author: "Product Strategy",
      excerpt: "Learn how optimizing your initial onboarding touchpoints can reduce churn and boost long-term retention.",
      tags: ["ux", "conversion", "onboarding"],
      featured: false
    },
    {
      id: "post-3",
      slug: "blog-post-3.html",
      title: "The Future of AI Automation in Business Workflows",
      category: "AI & Innovation",
      date: "2026-08-19",
      readTime: "4 min",
      author: "Tech Insights",
      excerpt: "A deep dive into how modern automation platforms streamline operations and cut overhead costs.",
      tags: ["ai", "automation", "tech"],
      featured: false
    }
  ];

  window.XSITE_BLOG_TOPICS = window.XSITE_BLOG_TOPICS || [
    { id: "topic-growth", name: "Growth & Strategy", targetLocation: "growth-hub.html", description: "Scaling tactics and business frameworks." },
    { id: "topic-ux", name: "UX & Conversion", targetLocation: "ux-hub.html", description: "Customer journey and funnel optimization." },
    { id: "topic-ai", name: "AI & Innovation", targetLocation: "ai-hub.html", description: "Automation and next-gen workflows." }
  ];

  window.XSITES_BLOG_ENGINE = {
    getAllPosts() {
      return window.XSITE_BLOG_MANIFEST;
    },
    getTopics() {
      return window.XSITE_BLOG_TOPICS;
    },
    addTopic(topicObj) {
      if (!topicObj || !topicObj.name) return;
      const id = topicObj.id || `topic-${Date.now()}`;
      const targetLocation = topicObj.targetLocation || `${topicObj.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.html`;
      const newTopic = { ...topicObj, id, targetLocation };
      window.XSITE_BLOG_TOPICS.push(newTopic);
      return newTopic;
    },
    addPost(postObj) {
      if (!postObj) return;
      const id = postObj.id || `post-${Date.now()}`;
      const slug = postObj.slug || `${id}.html`;
      const post = { ...postObj, id, slug };
      const existsIdx = window.XSITE_BLOG_MANIFEST.findIndex(p => p.id === id || p.slug === slug);
      if (existsIdx >= 0) {
        window.XSITE_BLOG_MANIFEST[existsIdx] = post;
      } else {
        window.XSITE_BLOG_MANIFEST.unshift(post);
      }
      return post;
    },
    // Sequential Blog Engine Step 1: Render Main AI SEO Blog Hub FIRST
    renderSeoBlogHub(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;

      const topics = window.XSITE_BLOG_TOPICS;
      const posts = window.XSITE_BLOG_MANIFEST;

      container.innerHTML = `
        <div class="space-y-8 font-sans">
          <!-- AI SEO Hub Topic Nav Navigation Buttons -->
          <div class="flex flex-wrap items-center gap-3 border-b border-slate-800 pb-4">
            <span class="text-xs font-mono uppercase text-emerald-400 font-bold">SEO Topic Clusters:</span>
            <button type="button" onclick="XSITES_BLOG_ENGINE.filterByTopic('all')" class="px-3 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-mono font-bold hover:bg-emerald-500/30 transition">
              All Topics (${posts.length})
            </button>
            ${topics.map(t => `
              <button type="button" onclick="XSITES_BLOG_ENGINE.filterByTopic('${t.id}')" class="px-3 py-1.5 bg-slate-800/80 text-slate-300 border border-slate-700 hover:border-emerald-500/50 hover:text-emerald-400 rounded-xl text-xs font-mono font-medium transition flex items-center gap-1.5">
                <span>📂 ${t.name}</span>
              </button>
            `).join('')}
          </div>

          <!-- SEO Hub Schema & Article List Grid -->
          <div id="xsite-blog-hub-posts-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${posts.map(post => this.renderArticleCard(post)).join('')}
          </div>
        </div>
      `;
    },
    filterByTopic(topicId) {
      const grid = document.getElementById('xsite-blog-hub-posts-grid');
      if (!grid) return;
      let posts = window.XSITE_BLOG_MANIFEST;
      if (topicId !== 'all') {
        const topic = window.XSITE_BLOG_TOPICS.find(t => t.id === topicId);
        if (topic) {
          posts = posts.filter(p => p.category.toLowerCase() === topic.name.toLowerCase() || (p.tags && p.tags.includes(topicId)));
        }
      }
      grid.innerHTML = posts.map(post => this.renderArticleCard(post)).join('');
    },
    renderArticleCard(post) {
      return `
        <article class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md transition group">
          <div class="flex items-center gap-2 text-xs text-emerald-500 font-semibold mb-3">
            <span class="px-2.5 py-1 bg-emerald-500/10 rounded-full font-mono">${post.category}</span>
            <span>•</span>
            <span class="text-slate-400 font-mono">${post.readTime}</span>
          </div>
          <h3 class="text-xl font-bold text-slate-900 dark:text-white group-hover:text-emerald-400 transition mb-2">
            <a href="${post.targetLocation || post.slug}">${post.title}</a>
          </h3>
          <p class="text-sm text-slate-600 dark:text-slate-400 mb-4 line-clamp-2">${post.excerpt}</p>
          <div class="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
            <span class="text-slate-500 dark:text-slate-400 font-medium">By ${post.author || 'Editorial Team'}</span>
            <a href="${post.targetLocation || post.slug}" class="text-emerald-500 font-bold hover:underline inline-flex items-center gap-1">
              Read Article &rarr;
            </a>
          </div>
        </article>
      `;
    },
    // Sequential Blog Engine Step 2: Article Maker (Runs AFTER Main Blog Hub is Complete)
    generateArticlesFromHub(topicCount = 2) {
      const generated = [];
      window.XSITE_BLOG_TOPICS.forEach((topic, idx) => {
        for (let i = 1; i <= topicCount; i++) {
          const slug = `${topic.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-article-${i}.html`;
          const post = {
            id: `gen-${topic.id}-${i}`,
            slug,
            targetLocation: slug,
            title: `Essential ${topic.name} Guide: Chapter ${i}`,
            category: topic.name,
            date: new Date().toISOString().split('T')[0],
            readTime: `${4 + i} min`,
            author: "AI SEO Article Maker",
            excerpt: `In-depth breakdown of ${topic.name.toLowerCase()} tactics, designed to link back to the main SEO blog hub.`,
            tags: [topic.id, "seo-hub"],
            featured: false
          };
          this.addPost(post);
          generated.push(post);
        }
      });
      if (document.getElementById('xsite-blog-hub-grid')) {
        this.renderSeoBlogHub('xsite-blog-hub-grid');
      }
      return generated;
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('xsite-blog-hub-grid')) {
      window.XSITES_BLOG_ENGINE.renderSeoBlogHub('xsite-blog-hub-grid');
    }
  });
})(window);
