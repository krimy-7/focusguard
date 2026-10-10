/** @type {import('tailwindcss').Config} */
// Layout utilities only. Colour and type come from src/theme (light/dark tokens), not from Tailwind.
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  // 'media' makes react-native-css-interop's web runtime throw in dev when its late-loaded flag fires colorScheme.set().
  darkMode: 'class',
  theme: { extend: {} },
  plugins: [],
};
