const { withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Ensures AppIcon has no alpha channel and SplashScreenLegacy has proper images.
// Runs automatically during `expo prebuild` so fixes persist across clean builds.
module.exports = function fixIosAssets(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      // xcassets live at ios/{ProjectName}/Images.xcassets
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

  execSync(
    `python3 -c "
from PIL import Image
img = Image.open('${iconSrc}').convert('RGBA')
bg = Image.new('RGB', img.size, (0,0,0))
bg.paste(img, mask=img.split()[3])
bg.save('${iconDst}', 'PNG')
"`,
    { stdio: 'inherit' },
  );
}

function fixSplashLegacy(projectRoot, xcassets) {
  const splashSrc = path.join(projectRoot, 'assets', 'splash-icon.png');
  const imageset = path.join(xcassets, 'SplashScreenLegacy.imageset');

  if (!fs.existsSync(splashSrc)) return;
  fs.mkdirSync(imageset, { recursive: true });

  const sizes = { 'image.png': 320, 'image@2x.png': 640, 'image@3x.png': 960 };
  for (const [fname, px] of Object.entries(sizes)) {
    const dst = path.join(imageset, fname);
    execSync(
      `python3 -c "
from PIL import Image
img = Image.open('${splashSrc}')
img = img.resize((${px}, ${px}), Image.LANCZOS)
img.save('${dst}', 'PNG')
"`,
      { stdio: 'inherit' },
    );
  }
}
