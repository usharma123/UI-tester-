import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'UI QA',
  description: 'AI-powered UI/UX testing CLI',
  
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#6366f1' }],
  ],

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'UI QA',
    
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'Configuration', link: '/configuration' },
      { text: 'Usage', link: '/usage' },
      { text: 'Advanced', link: '/advanced-features' },
      { text: 'Validation', link: '/validation' },
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Getting Started', link: '/getting-started' },
        ]
      },
      {
        text: 'Reference',
        items: [
          { text: 'Configuration', link: '/configuration' },
          { text: 'Usage', link: '/usage' },
          { text: 'Advanced Features', link: '/advanced-features' },
          { text: 'Validation', link: '/validation' },
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/usharma123/UI-tester-' },
      { icon: 'linkedin', link: 'https://www.linkedin.com/in/usharma124/' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/@usharma124/ui-qa' }
    ],

    footer: {
      message: 'Released under the MIT License.',
    },

    search: {
      provider: 'local'
    },

    outline: {
      level: [2, 3]
    }
  }
})
