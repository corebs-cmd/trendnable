const { withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

// Ensures AppIcon has no alpha channel and SplashScreenLegacy has proper images.
// Runs automatically during `expo prebuild` so fixes persist across clean builds.
module.exports = function fixIosAssets(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const projectName = cfg.modRequest.projectName;
      const xcassets = path.join(
        cfg.modRequest.platformProjectRoot,
        projectName,
        'Images.xcassets',
      );

      fixAppIcon(projectRoot, xcassets);
      fixSplashLegacy(projectRoot, xcassets);

      return cfg;
    },
  ]);
};

function fixAppIcon(projectRoot, xcassets) {
  const iconSrc = path.join(projectRoot, 'assets', 'icon.png');
  const iconDir = path.join(xcassets, 'AppIcon.appiconset');
  const iconDst = path.join(iconDir, 'App-Icon-1024x1024@1x.png');

  if (!fs.existsSync(iconSrc)) return;
  fs.mkdirSync(iconDir, { recursive: true });

  // Copy icon directly - Expo's asset processing already handles format
  fs.copyFileSync(iconSrc, iconDst);
}

function fixSplashLegacy(projectRoot, xcassets) {
  const splashSrc = path.join(projectRoot, 'assets', 'splash-icon.png');
  const imageset = path.join(xcassets, 'SplashScreenLegacy.imageset');

  if (!fs.existsSync(splashSrc)) return;
  fs.mkdirSync(imageset, { recursive: true });

  // Copy splash image for all sizes - iOS will scale as needed
  const sizes = { 'image.png': true, 'image@2x.png': true, 'image@3x.png': true };
  for (const fname of Object.keys(sizes)) {
    const dst = path.join(imageset, fname);
    fs.copyFileSync(splashSrc, dst);
  }
}
