import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "GOMAC",
  description: "TODO: Replace with your project description.",
  base: '/GOMAC/',
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Reference', link: '/reference/mqtt-topics' },
      { text: 'GitHub', link: 'https://github.com/ScottKirvan/GOMAC' }
    ],
    sidebar: {
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'MQTT Topics', link: '/reference/mqtt-topics' }
          ]
        }
      ]
    },
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
