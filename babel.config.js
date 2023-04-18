// babel.config.js
module.exports = {
  presets: [
    "@babel/preset-env",
    "@babel/preset-react",
    "@babel/preset-typescript",
  ],
  plugins: [
    "@babel/plugin-transform-react-jsx", // Add the plugin for React/JSX support
  ],
};
