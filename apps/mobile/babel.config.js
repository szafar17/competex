// babel-preset-expo (SDK 54) auto-configures the worklets/reanimated plugin.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
