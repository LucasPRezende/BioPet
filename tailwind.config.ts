import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        biopet: {
          blue:       '#19202d',
          'blue-mid': '#232d3f',
          gold:       '#8a6e36',
          'gold-mid': '#c4a35a',
          'gold-light':'#d4b870',
        },
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #6b5328 0%, #c4a35a 50%, #8a6e36 100%)',
        'gold-h':        'linear-gradient(to right, #8a6e36, #c4a35a, #8a6e36)',
      },
    },
  },
  plugins: [],
}

export default config
