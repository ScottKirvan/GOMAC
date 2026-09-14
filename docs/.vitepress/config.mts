import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "GOMAC",
  description: "TODO: Replace with your project description.",
  base: '/GOMAC/',
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Data Sources', link: '/data-sources' },
      { text: 'GitHub', link: 'https://github.com/ScottKirvan/GOMAC' }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/ScottKirvan/GOMAC' },
      { icon: 'discord', link: 'https://discord.gg/TN6XJSNK5Y' }
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © Scott Kirvan'
    }
  }
})
