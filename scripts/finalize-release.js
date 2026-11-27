/**
 * finalize-release.js — Run AFTER `npm run tauri build` and Android APK build succeed.
 * Copies artifacts to dist-release/, generates latest.json, commits, tags, and pushes GitHub Release.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: ROOT_DIR, stdio: "inherit", ...opts });
}

function findFirstFile(dir, predicate) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findFirstFile(full, predicate);
      if (nested) return nested;
    } else if (predicate(full, entry.name)) {
      return full;
    }
  }
  return null;
}

async function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
  const version = pkg.version; // e.g. "1.2.0"
  const shortVer = version.replace(/\.0$/, ""); // "1.2"
  const tag = `v${shortVer}`; // "v1.2"

  console.log(`\n=== Finalizing Skymusic ${tag} (${version}) ===`);

  const targetBase =
    process.platform === "win32" && ROOT_DIR.includes(" ")
      ? path.join(os.homedir(), ".skymusic-target")
      : path.join(ROOT_DIR, "src-tauri", "target");

  const releaseDir = path.join(targetBase, "release");
  const nsisDir = path.join(releaseDir, "bundle", "nsis");

  const winOut = path.join(ROOT_DIR, "dist-release", "windows");
  const androidOut = path.join(ROOT_DIR, "dist-release", "android");
  fs.mkdirSync(winOut, { recursive: true });
  fs.mkdirSync(androidOut, { recursive: true });

  // ── Windows artifacts ─────────────────────────────────────────────────────
  const portableExe = path.join(releaseDir, "skymusic.exe");
  const webviewDll = path.join(releaseDir, "WebView2Loader.dll");
  const setupExe =
    findFirstFile(nsisDir, (_, n) => n.includes(version) && n.endsWith("-setup.exe")) ||
    findFirstFile(nsisDir, (_, n) => n.endsWith("-setup.exe"));
  const setupSig = setupExe ? `${setupExe}.sig` : null;

  const versionedSetup = path.join(winOut, `skymusic_${tag}_x64-setup.exe`);
  const portableZip = path.join(winOut, `skymusic_${tag}_windows_portable.zip`);

  if (fs.existsSync(portableExe)) {
    fs.copyFileSync(portableExe, path.join(winOut, "skymusic.exe"));
    console.log("✓ Copied skymusic.exe");
  }
  if (fs.existsSync(webviewDll)) {
    fs.copyFileSync(webviewDll, path.join(winOut, "WebView2Loader.dll"));
    console.log("✓ Copied WebView2Loader.dll");
  }
  if (setupExe && fs.existsSync(setupExe)) {
    fs.copyFileSync(setupExe, versionedSetup);
    console.log(`✓ Copied ${path.basename(versionedSetup)}`);
  }
  if (setupSig && fs.existsSync(setupSig)) {
    fs.copyFileSync(setupSig, `${versionedSetup}.sig`);
    console.log(`✓ Copied ${path.basename(versionedSetup)}.sig`);
  }

  // Create portable zip
  const filesToZip = ["skymusic.exe", "WebView2Loader.dll"]
    .map((f) => path.join(winOut, f))
    .filter((p) => fs.existsSync(p));
  if (filesToZip.length > 0) {
    const quoted = filesToZip.map((f) => `'${f}'`).join(",");
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path ${quoted} -DestinationPath '${portableZip}' -Force"`,
      { stdio: "inherit" }
    );
    console.log(`✓ Created ${path.basename(portableZip)}`);
  }

  // ── Android APK ───────────────────────────────────────────────────────────
  // Look for APK in common Tauri Android output paths
  const apkSearch = [
    path.join(ROOT_DIR, "src-tauri", "gen", "android", "app", "build", "outputs", "apk", "universal", "release"),
    path.join(ROOT_DIR, "src-tauri", "gen", "android", "app", "build", "outputs", "apk", "release"),
  ];
  let foundApk = null;
  for (const dir of apkSearch) {
    const apk = findFirstFile(dir, (_, n) => n.endsWith(".apk"));
    if (apk) { foundApk = apk; break; }
  }
  if (foundApk) {
    fs.copyFileSync(foundApk, path.join(androidOut, "skymusic.apk"));
    fs.copyFileSync(foundApk, path.join(androidOut, `skymusic_${tag}.apk`));
    console.log(`✓ Copied Android APK → skymusic_${tag}.apk`);
  } else {
    console.warn("⚠ Android APK not found — skipping. Run Android build separately.");
  }

  // ── Generate latest.json ──────────────────────────────────────────────────
  const sigPath = `${versionedSetup}.sig`;
  let signature = "";
  if (fs.existsSync(sigPath)) {
    signature = fs.readFileSync(sigPath, "utf8").trim();
  } else {
    console.warn("⚠ .sig file not found — latest.json will have empty signature");
  }

  const pubDate = new Date().toISOString();
  const baseUrl = `https://github.com/shivakantyadavv/skymusic/releases/download/${tag}`;
  const latestJson = {
    version: version,
    notes: `Skymusic ${tag} — Dolby Atmos spatial audio, HQ downloader, audio quality badges, recently played shelf. See CHANGELOG for full details.`,
    pub_date: pubDate,
    platforms: {
      "windows-x86_64": {
        signature,
        url: `${baseUrl}/skymusic_${tag}_x64-setup.exe`,
      },
    },
  };
  const latestJsonPath = path.join(ROOT_DIR, "dist-release", "latest.json");
  fs.writeFileSync(latestJsonPath, JSON.stringify(latestJson, null, 2) + "\n", "utf8");
  console.log(`✓ Generated dist-release/latest.json (version: ${version})`);

  // ── Git commit, tag, push ─────────────────────────────────────────────────
  const filesToAdd = [
    "package.json",
    "src-tauri/tauri.conf.json",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
    "src-tauri/gen/android/app/build.gradle.kts",
    "CHANGELOG.md",
    "README.md",
    "src/",
    "src-tauri/src/",
    "src-tauri/gen/android/app/src/main/AndroidManifest.xml",
    "src-tauri/gen/android/app/src/main/java/com/skymusic/app/MainActivity.kt",
    "src-tauri/gen/schemas/acl-manifests.json",
    "scripts/",
    "dist-release/latest.json",
  ];

  run(`git add ${filesToAdd.map((f) => `"${f}"`).join(" ")}`);
  run(`git commit -m "chore(release): ${tag}"`);
  run(`git tag -a ${tag} -m "Release ${tag}"`);
  run(`git push origin HEAD --follow-tags`);

  // ── GitHub Release ────────────────────────────────────────────────────────
  const assets = [
    path.join(ROOT_DIR, "dist-release", "latest.json"),
    path.join(winOut, "skymusic.exe"),
    versionedSetup,
    `${versionedSetup}.sig`,
    portableZip,
  ];
  if (foundApk) {
    assets.push(path.join(androidOut, "skymusic.apk"));
    assets.push(path.join(androidOut, `skymusic_${tag}.apk`));
  }

  const existingAssets = assets.filter((a) => fs.existsSync(a));
  const assetArgs = existingAssets.map((a) => `"${a}"`).join(" ");

  const releaseNotes = [
    `## Skymusic ${tag}`,
    "",
    "### What's New",
    "- **Dolby Atmos / Spatial 3D Audio** — 4 DSP presets with binaural widener, Haas delay, multi-band EQ",
    "- **HQ Song Downloader** — Full-bitrate M4A via InnerTube, real-time progress, embedded metadata, offline library tab",
    "- **Audio Quality Badges** — Rust symphonia+lofty for local files; HQ/ATMOS/Preview pills for streams",
    "- **Recently Played** — Horizontal shelf on Home (top 20, with Clear button)",
  ].join("\n");

  run(
    `gh release create ${tag} ${assetArgs} --title "Skymusic ${tag}" --notes "${releaseNotes.replace(/"/g, '\\"')}"`
  );

  console.log(`\n✅ Skymusic ${tag} released successfully!`);
  console.log(`   https://github.com/shivakantyadavv/skymusic/releases/tag/${tag}`);
}

main().catch((err) => {
  console.error("Release failed:", err.message || err);
  process.exit(1);
});
