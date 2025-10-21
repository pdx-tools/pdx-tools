#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir, access, mkdir, writeFile, copyFile, readFile, stat } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..', '..');

// Helper functions
const exists = async (path: string) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const execCommand = async (command: string, options = {}) => {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: projectRoot,
      encoding: 'utf-8',
      ...options
    });
    if (stderr) {
      console.warn(`Warning from command "${command}": ${stderr}`);
    }
    return stdout;
  } catch (error) {
    console.error(`Command failed: ${command}`);
    console.error(`Error: ${(error as Error).message}`);
    throw error;
  }
};

const createFileIfEmpty = async (filePath: string, content: string) => {
  const fileExists = await exists(filePath);
  if (!fileExists) {
    await writeFile(filePath, content);
    console.log(`Created placeholder: ${filePath}`);
    return;
  }

  try {
    const stats = await stat(filePath);
    if (stats.size === 0) {
      await writeFile(filePath, content);
      console.log(`Created placeholder: ${filePath}`);
    }
  } catch (error) {
    console.warn(`Could not check file size for ${filePath}: ${(error as Error).message}`);
    await writeFile(filePath, content);
  }
};

const touchFile = async (filePath: string) => {
  if (!await exists(filePath)) {
    await writeFile(filePath, '');
  }
};

const hasCommand = async (command: string) => {
  try {
    await execAsync(`command -v ${command}`);
    return true;
  } catch {
    try {
      // Windows fallback
      await execAsync(`where ${command}`);
      return true;
    } catch {
      return false;
    }
  }
};

const findLatestBundle = async () => {
  const eu4AssetsDir = join(projectRoot, 'assets/game/eu4');
  
  if (!await exists(eu4AssetsDir)) {
    return null;
  }

  const contents = await readdir(eu4AssetsDir);
  const versions = contents
    .filter(item => item !== 'common' && /^\d+\.\d+$/.test(item))
    .sort((a, b) => {
      const [aMajor, aMinor] = a.split('.').map(Number);
      const [bMajor, bMinor] = b.split('.').map(Number);
      return bMajor === aMajor ? bMinor! - aMinor! : bMajor! - aMajor!;
    });

  // Find the latest version that has common/images directory
  for (const version of versions) {
    const commonImagesDir = join(eu4AssetsDir, version, 'common', 'images');
    if (await exists(commonImagesDir)) {
      return { version, path: commonImagesDir };
    }
  }

  return null;
};

const copyDirectoryRecursive = async (src: string, dest: string) => {
  try {
    await mkdir(dest, { recursive: true });
    const entries = await readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);

      if (entry.isDirectory()) {
        await copyDirectoryRecursive(srcPath, destPath);
      } else {
        await copyFile(srcPath, destPath);
      }
    }
  } catch (error) {
    console.warn(`Failed to copy directory ${src} to ${dest}: ${(error as Error).message}`);
  }
};

const updateCommonImages = async () => {
  console.log('🖼️  Updating common images from latest bundle...');
  
  const latestBundle = await findLatestBundle();
  if (!latestBundle) {
    console.log('  ⚠️  No compiled game bundle with images found, skipping image update');
    return;
  }

  console.log(`  📦 Found latest bundle: ${latestBundle.version}`);

  const commonImagesDir = join(projectRoot, 'assets/game/eu4/common/images');

  // Copy subdirectories from latest bundle
  const bundleImagesDir = latestBundle.path;
  const bundleEntries = await readdir(bundleImagesDir, { withFileTypes: true });

  for (const entry of bundleEntries) {
    if (entry.isDirectory()) {
      const srcPath = join(bundleImagesDir, entry.name);
      const destPath = join(commonImagesDir, entry.name);
      await copyDirectoryRecursive(srcPath, destPath);
      console.log(`  📁 Copied directory: ${entry.name}`);
    }
  }

  console.log('  ✅ Common images updated successfully');
};

// Main script
async function setupAssets() {
  // Update common images from latest bundle first
  await updateCommonImages();

  const gitignoreContent = await readFile(join(projectRoot, '.gitignore'), 'utf-8');
  const eu4ImagePaths = gitignoreContent
    .split('\n')
    .filter(line => line.startsWith('assets/game/eu4/common/images') && !line.includes('*'))
    .map(line => line.trim())
    .filter(Boolean);

  for (const imagePath of eu4ImagePaths) {
    const fullPath = join(projectRoot, imagePath);
    await mkdir(fullPath, { recursive: true });
  }

  // Copy over the REB flag which is the only one that is statically imported
  const rebSource = join(projectRoot, 'assets/game/eu4/common/images/REB.png');
  const rebDest = join(projectRoot, 'assets/game/eu4/common/images/flags/REB.png');
  if (await exists(rebSource)) {
    await mkdir(dirname(rebDest), { recursive: true });
    await copyFile(rebSource, rebDest);
  }

  // Create empty token files for devs without them (touch equivalent)
  console.log('🔑 Creating token placeholders...');
  await mkdir(join(projectRoot, 'assets/tokens'), { recursive: true });
  const games = ['eu4', 'eu5', 'ck3', 'hoi4', 'imperator', 'vic3'];
  for (const game of games) {
    const binFile = join(projectRoot, 'assets/tokens', `${game}.bin`);
    const txtFile = join(projectRoot, 'assets/tokens', `${game}.txt`);

    await touchFile(binFile);
    await touchFile(txtFile);
  }

  // Create DLC spritesheet (with ImageMagick fallback)
  console.log('🎨 Creating DLC spritesheet...');
  const dlcDir = join(projectRoot, 'src/app/app/features/eu4/components/dlc-list');
  const dlcImagesDir = join(dlcDir, 'dlc-images');

  if (await exists(dlcImagesDir)) {
    const dlcImages = await readdir(dlcImagesDir);
    const numImages = dlcImages.length;
    const cols = Math.ceil(Math.sqrt(numImages - 0.5));

    if (await hasCommand('montage')) {
      console.log('  ✅ Using ImageMagick for DLC spritesheet');
      await execCommand(
        `montage -tile ${cols}x -background transparent -define webp:lossless=true -mode concatenate "dlc-images/*" dlc-sprites.webp`,
        { cwd: dlcDir }
      );
    } else {
      console.log('  ⚠️  ImageMagick not found, creating empty DLC spritesheet placeholder');
      await writeFile(join(dlcDir, 'dlc-sprites.webp'), '');
    }

    // Generate DLC sprites JSON
    const dlcData = Object.fromEntries(dlcImages.map((image, index) => {
      const name = image.replace(/\.[^/.]+$/, ''); // Remove extension
      return [name, index]
    }));
    await writeFile(join(dlcDir, 'dlc-sprites.json'), JSON.stringify(dlcData));
  }

  // Create icons spritesheet (with ImageMagick fallback)
  console.log('🎯 Creating icons spritesheet...');
  const iconsDir = join(projectRoot, 'src/app/app/features/eu4/components/icons');

  if (await exists(iconsDir)) {
    const iconFiles = (await readdir(iconsDir)).filter(file => file.endsWith('.png'));
    const numIcons = iconFiles.length;
    const cols = Math.ceil(Math.sqrt(numIcons - 0.5));

    if (await hasCommand('montage')) {
      console.log('  ✅ Using ImageMagick for icons spritesheet');
      const iconArgs = iconFiles.join(' ');
      await execCommand(
        `montage -tile ${cols}x -mode concatenate -geometry '32x32>' -background transparent ${iconArgs} icons.webp`,
        { cwd: iconsDir }
      );
    } else {
      console.log('  ⚠️  ImageMagick not found, creating empty icons spritesheet placeholder');
      await writeFile(join(iconsDir, 'icons.webp'), '');
    }

    // Generate icons JSON
    const iconsData = Object.fromEntries(iconFiles.map((icon, index) => {
      const name = icon.replace(/\.[^/.]+$/, '').replace('icon_', ''); // Remove extension and 'icon_' prefix
      return [name, index];
    }));
    await writeFile(join(iconsDir, 'icons.json'), JSON.stringify(iconsData));
  }

  // Create asset directories and placeholder files for development
  console.log('📦 Creating EU4 asset placeholders for development...');

  // Ensure directories exist
  const imageDirectories = [
    'achievements', 'advisors', 'buildings', 'flags', 'personalities', 'tc-investments'
  ];

  for (const dir of imageDirectories) {
    await mkdir(join(projectRoot, 'assets/game/eu4/common/images', dir), { recursive: true });
  }

  // Create empty webp placeholder files (touch -a equivalent)
  const webpFiles = [
    'assets/game/eu4/common/images/achievements/achievements.webp',
    'assets/game/eu4/common/images/advisors/advisors_x48.webp',
    'assets/game/eu4/common/images/advisors/advisors_x64.webp',
    'assets/game/eu4/common/images/advisors/advisors_x77.webp',
    'assets/game/eu4/common/images/buildings/global.webp',
    'assets/game/eu4/common/images/buildings/westerngfx.webp',
    'assets/game/eu4/common/images/flags/flags_x8.webp',
    'assets/game/eu4/common/images/flags/flags_x48.webp',
    'assets/game/eu4/common/images/flags/flags_x64.webp',
    'assets/game/eu4/common/images/flags/flags_x128.webp',
    'assets/game/eu4/common/images/personalities/personalities.webp',
    'assets/game/eu4/common/images/tc-investments/investments.webp'
  ];

  for (const webpFile of webpFiles) {
    const fullPath = join(projectRoot, webpFile);
    await touchFile(fullPath);
  }

  // Create JSON placeholder files with empty object
  const jsonFiles = [
    'assets/game/eu4/common/images/achievements/achievements.json',
    'assets/game/eu4/common/images/advisors/advisors.json',
    'assets/game/eu4/common/images/buildings/global.json',
    'assets/game/eu4/common/images/buildings/westerngfx.json',
    'assets/game/eu4/common/images/flags/flags.json',
    'assets/game/eu4/common/images/personalities/personalities.json',
    'assets/game/eu4/common/images/tc-investments/investments.json'
  ];

  for (const jsonFile of jsonFiles) {
    await createFileIfEmpty(join(projectRoot, jsonFile), '{}');
  }

  // Generate EU4 game asset hooks
  const outputFile = join(projectRoot, 'src/app/app/lib/game_gen.ts');
  await writeFile(outputFile, '');

  // Check for EU4 asset versions
  const eu4AssetsDir = join(projectRoot, 'assets/game/eu4');
  let versions: string[] = [];

  if (await exists(eu4AssetsDir)) {
    const eu4Contents = await readdir(eu4AssetsDir);
    versions = eu4Contents
      .filter(item => item !== 'common' && /^\d+\.\d+$/.test(item))
      .sort((a, b) => {
        const [aMajor, aMinor] = a.split('.').map(Number);
        const [bMajor, bMinor] = b.split('.').map(Number);
        return aMajor === bMajor ? aMinor! - bMinor! : aMajor! - bMajor!;
      });
  }

  // If no EU4 assets available, create error handlers (matching original bash)
  if (versions.length === 0) {
    console.log('  📝 No EU4 assets found, creating error handlers');

    const errorContent = `const msg = 'EU4 assets not found, have you forgot to compile assets';
export const gameVersion = (x: string): any => { throw new Error(msg); } 
export const resources = (x: any): any => { throw new Error(msg); }
export const dataUrls = (x: any): any => { throw new Error(msg); }
`;

    await writeFile(outputFile, errorContent);
    return;
  }

  console.log(`  📝 Found ${versions.length} EU4 asset versions, generating static imports`);

  // Generate static imports (keep existing logic)
  let content = '';

  // Generate imports for each version (matching original bash format)
  for (const version of versions) {
    const minor = version.split('.')[1];
    content += `      import provinces1${minor} from "../../../../assets/game/eu4/${version}/map/provinces-1.webp";
      import provinces2${minor} from "../../../../assets/game/eu4/${version}/map/provinces-2.webp";
      import colorMap${minor} from "../../../../assets/game/eu4/${version}/map/colormap_summer.webp";
      import sea${minor} from "../../../../assets/game/eu4/${version}/map/colormap_water.webp";
      import normal${minor} from "../../../../assets/game/eu4/${version}/map/world_normal.webp";
      import terrain1${minor} from "../../../../assets/game/eu4/${version}/map/terrain-1.webp";
      import terrain2${minor} from "../../../../assets/game/eu4/${version}/map/terrain-2.webp";
      import rivers1${minor} from "../../../../assets/game/eu4/${version}/map/rivers-1.webp";
      import rivers2${minor} from "../../../../assets/game/eu4/${version}/map/rivers-2.webp";
      import stripes${minor} from "../../../../assets/game/eu4/${version}/map/occupation.webp";
      import water${minor} from "../../../../assets/game/eu4/${version}/map/noise-2d.webp";
      import surfaceRock${minor} from "../../../../assets/game/eu4/${version}/map/atlas0_rock.webp";
      import surfaceGreen${minor} from "../../../../assets/game/eu4/${version}/map/atlas0_green.webp";
      import surfaceNormalRock${minor} from "../../../../assets/game/eu4/${version}/map/atlas_normal0_rock.webp";
      import surfaceNormalGreen${minor} from "../../../../assets/game/eu4/${version}/map/atlas_normal0_green.webp";
      import heightmap${minor} from "../../../../assets/game/eu4/${version}/map/heightmap.webp";
      import provincesUniqueColor${minor} from "../../../../assets/game/eu4/${version}/map/color-order.bin?url";
      import provincesUniqueIndex${minor} from "../../../../assets/game/eu4/${version}/map/color-index.bin?url";
      import data${minor} from "../../../../assets/game/eu4/${version}/data.bin?url";
`;
  }

  // Add type definitions and exports (matching original bash format)
  content += 'import type { ResourceUrls } from "./url_types"\n';
  content += `export type GameVersion = "${versions[0]}"`;
  for (const version of versions.slice(1)) {
    content += ` | "${version}"`;
  }
  content += ';\n';

  content += 'export function gameVersion(x: string): GameVersion {\n';
  content += '  switch (x) {\n';
  for (const version of versions) {
    content += `    case "${version}":\n`;
  }
  content += '      return x;\n';
  content += '    default: return defaultVersion\n';
  content += '  }\n';
  content += '}\n';

  // Generate resources function
  content += 'export const resources = (x: GameVersion): ResourceUrls => {\n';
  content += '  switch(x) {\n';
  for (const version of versions) {
    const minor = version.split('.')[1];
    content += `    case "${version}": return {\n`;
    content += `      provinces1: provinces1${minor},\n`;
    content += `      provinces2: provinces2${minor},\n`;
    content += `      colorMap: colorMap${minor},\n`;
    content += `      sea: sea${minor},\n`;
    content += `      normal: normal${minor},\n`;
    content += `      terrain1: terrain1${minor},\n`;
    content += `      terrain2: terrain2${minor},\n`;
    content += `      rivers1: rivers1${minor},\n`;
    content += `      rivers2: rivers2${minor},\n`;
    content += `      stripes: stripes${minor},\n`;
    content += `      water: water${minor},\n`;
    content += `      surfaceRock: surfaceRock${minor},\n`;
    content += `      surfaceGreen: surfaceGreen${minor},\n`;
    content += `      surfaceNormalRock: surfaceNormalRock${minor},\n`;
    content += `      surfaceNormalGreen: surfaceNormalGreen${minor},\n`;
    content += `      heightmap: heightmap${minor},\n`;
    content += `      provincesUniqueColor: provincesUniqueColor${minor},\n`;
    content += `      provincesUniqueIndex: provincesUniqueIndex${minor},\n`;
    content += '    }\n';
  }
  content += '}}\n';

  // Add default version and dataUrls
  const lastVersion = versions[versions.length - 1];
  content += `export const defaultVersion = "${lastVersion}"\n`;

  content += 'export const dataUrls = (x: GameVersion): string => {\n';
  content += '  switch(x) {\n';
  for (const version of versions) {
    const minor = version.split('.')[1];
    content += `    case "${version}": return data${minor}\n`;
  }
  content += '}}\n';

  await writeFile(outputFile, content);
}

async function setupAssetEu5() {
  await mkdir(join(projectRoot, 'assets', 'game', 'eu5'), { recursive: true });
  await touchFile(join(projectRoot, 'assets', 'game', 'eu5', 'eu5-1.0.zip'));
}

await setupAssets()
await setupAssetEu5();