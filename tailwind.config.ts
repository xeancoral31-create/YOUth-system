import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f0f4f8',
          100: '#d9e2ec',
          700: '#1e3a5f',
          800: '#152c48',
          900: '#0f2035',
        },
      },
    },
  },
  plugins: [],
};

export default config;
