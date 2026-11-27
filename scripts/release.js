import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { applyVersionBump, ROOT_DIR } from "./bump-version.js";

const GITHUB_OWNER = "shivakantyadavv";
const GITHUB_REPO = "skymusic";

function parseArgs() {
  const args = process.argv.slice(2);
  const getFlag = (names) => {
    for (const name of names) {
      const idx = args.indexOf(name);
      if (idx >= 0 && args[idx + 1]) return args[idx + 1];
    }
    return null;
  };
  return {
    notes: getFlag(["--notes", "-m"]),
    dryRun: args.includes("--dry-run"),
    skipBuild: args.includes("--skip-build"),
    skipPush: args.includes("--skip-push"),
  };
}

function promptQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function runCmd(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, {
    cwd: ROOT_DIR,
    stdio: "inherit",
    ...opts,
  });
}

function updateChangelog(shortVersion, tag, notes) {
  const changelogPath = path.join(ROOT_DIR, "CHANGELOG.md");
  const today = new Date().toISOString().slice(0, 10);
  const bulletLines = notes
    .split(/\r?\n|;/)
    .map((l) => l.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean)
    .map((l) => `- ${l}`);

  const newEntry = [
    `## [${tag}] - ${today}`,
    "",
    "### What's New",
    ...(bulletLines.length > 0
      ? bulletLines
      : [`- Skymusic ${tag} improvements and fixes`]),
    "",
  ].join("\n");

  const existing = fs.existsSync(changelogPath)
    ? fs.readFileSync(changelogPath, "utf8")
    : "# Changelog\n\nAll notable changes to **Skymusic** are documented in this file.\n\n";

  const marker = "## [";
  const firstReleaseIdx = existing.indexOf(marker);
  const updated =
    firstReleaseIdx >= 0
      ? `${existing.slice(0, firstReleaseIdx)}${newEntry}\n${existing.slice(
          firstReleaseIdx
        )}`
      : `${existing.trimEnd()}\n\n${newEntry}`;

  fs.writeFileSync(changelogPath, updated, "utf8");
}

function updateReadme(shortVersion, tag, notes) {
  const readmePath = path.join(ROOT_DIR, "README.md");
  if (!fs.existsSync(readmePath)) return;

  const today = new Date().toISOString().slice(0, 10);
  const summaryBullets = notes
    .split(/\r?\n|;/)
    .map((l) => l.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean)
    .map((l) => `- ${l}`)
    .join("\n");

  const block = [
    "<!-- LATEST_VERSION_START -->",
    `> **Latest Release:** ![Version](https://img.shields.io/badge/version-${tag}-0EA5E9?style=flat-square) — Released on **${today}**`,
    "",
    summaryBullets || `- Skymusic ${tag} release`,
    "<!-- LATEST_VERSION_END -->",
  ].join("\n");

  const raw = fs.readFileSync(readmePath, "utf8");
  const updated = raw.replace(
    /<!-- LATEST_VERSION_START -->[\s\S]*?<!-- LATEST_VERSION_END -->/,
    block
  );
  fs.writeFileSync(readmePath, updated, "utf8");
}

function resolveBuildEnv() {
  const env = { ...process.env };
  const cargoBin = path.join(os.homedir(), ".cargo", "bin");
  const keyFile = path.join(os.homedir(), ".tauri", "skymusic.key");

  if (!env.TAURI_SIGNING_PRIVATE_KEY && fs.existsSync(keyFile)) {
    env.TAURI_SIGNING_PRIVATE_KEY = fs.readFileSync(keyFile, "utf8").trim();
  }

  // Locate WinLibs MinGW-w64 if present on Windows
  if (process.platform === "win32") {
    const winGetBase = path.join(
      os.homedir(),
      "AppData",
      "Local",
      "Microsoft",
      "WinGet",
      "Packages"
    );
    let mingwBin = "";
    if (fs.existsSync(winGetBase)) {
      const pkgDir = fs
        .readdirSync(winGetBase)
        .find((d) => d.startsWith("BrechtSanders.WinLibs"));
      if (pkgDir) {
        const candidate = path.join(winGetBase, pkgDir, "mingw64", "bin");
        if (fs.existsSync(candidate)) mingwBin = candidate;
      }
    }
    const sdkRoot = path.join(os.homedir(), "AppData", "Local", "Android", "Sdk");
    const jdk17 = "C:\\Program Files\\Microsoft\\jdk-17.0.21.102-hotspot";
    if (fs.existsSync(jdk17)) env.JAVA_HOME = jdk17;
    if (fs.existsSync(sdkRoot)) {
      env.ANDROID_HOME = sdkRoot;
      env.ANDROID_SDK_ROOT = sdkRoot;
      const ndkDir = path.join(sdkRoot, "ndk", "27.0.12077973");
      if (fs.existsSync(ndkDir)) env.NDK_HOME = ndkDir;
    }

    const extraPaths = [
      env.JAVA_HOME ? path.join(env.JAVA_HOME, "bin") : "",
      mingwBin,
      cargoBin,
      env.ANDROID_HOME ? path.join(env.ANDROID_HOME, "platform-tools") : "",
    ].filter(Boolean);
    env.PATH = `${extraPaths.join(path.delimiter)}${path.delimiter}${env.PATH || ""}`;
  }

  return env;
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
  const opts = parseArgs();
  const notes =
    opts.notes ||
    (opts.dryRun
      ? "Dry run release verification"
      : await promptQuestion("Enter release notes for this update: ")) ||
    "Performance improvements and bug fixes";

  const { next } = applyVersionBump({ dryRun: opts.dryRun });
  console.log(`\nBumping Skymusic to ${next.tag} (${next.semver})`);

  if (opts.dryRun) {
    console.log("[DRY RUN] Would update CHANGELOG.md, README.md, build binaries, and publish release.");
    return;
  }

  updateChangelog(next.short, next.tag, notes);
  updateReadme(next.short, next.tag, notes);

  const releaseOut = path.join(ROOT_DIR, "dist-release");
  const winOut = path.join(releaseOut, "windows");
  const androidOut = path.join(releaseOut, "android");
  fs.mkdirSync(winOut, { recursive: true });
  fs.mkdirSync(androidOut, { recursive: true });

  const env = resolveBuildEnv();
  const targetJunction =
    process.platform === "win32" && ROOT_DIR.includes(" ")
      ? path.join(os.homedir(), ".skymusic-target")
      : null;

  if (!opts.skipBuild) {
    try {
      if (targetJunction && !fs.existsSync(targetJunction)) {
        const realTarget = path.join(ROOT_DIR, "src-tauri", "target");
        fs.mkdirSync(realTarget, { recursive: true });
        execSync(`cmd /c mklink /J "${targetJunction}" "${realTarget}"`, {
          stdio: "inherit",
        });
      }
      if (targetJunction) {
        env.CARGO_TARGET_DIR = targetJunction;
      }

      // Ensure skymusic crate rebuilds across host & cross-compile targets so new dist assets are embedded
      for (const entry of fs.readdirSync(targetBase, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const fpDir =
          entry.name === "release"
            ? path.join(targetBase, "release", ".fingerprint")
            : path.join(targetBase, entry.name, "release", ".fingerprint");
        if (fs.existsSync(fpDir)) {
          for (const fp of fs.readdirSync(fpDir)) {
            if (fp.startsWith("skymusic")) {
              fs.rmSync(path.join(fpDir, fp), { recursive: true, force: true });
            }
          }
        }
      }

      // 1. Build Windows executable + NSIS installer + .sig
      runCmd("npm run tauri build", { env });

      const targetBase = targetJunction || path.join(ROOT_DIR, "src-tauri", "target");
      const releaseDir = path.join(targetBase, "release");
      const nsisDir = path.join(releaseDir, "bundle", "nsis");

      const setupExe = findFirstFile(nsisDir, (_, name) =>
        name.endsWith("-setup.exe")
      );
      const setupSig = setupExe ? `${setupExe}.sig` : null;

      const portableExe = path.join(releaseDir, "skymusic.exe");
      const webviewDll = path.join(releaseDir, "WebView2Loader.dll");

      const versionedSetupName = `skymusic_${next.tag}_x64-setup.exe`;
      const versionedSetupDest = path.join(winOut, versionedSetupName);
      const portableZipDest = path.join(
        winOut,
        `skymusic_${next.tag}_windows_portable.zip`
      );

      if (fs.existsSync(portableExe)) {
        fs.copyFileSync(portableExe, path.join(winOut, "skymusic.exe"));
      }
      if (fs.existsSync(webviewDll)) {
        fs.copyFileSync(webviewDll, path.join(winOut, "WebView2Loader.dll"));
      }

      if (setupExe && fs.existsSync(setupExe)) {
        fs.copyFileSync(setupExe, versionedSetupDest);
        if (setupSig && fs.existsSync(setupSig)) {
          fs.copyFileSync(setupSig, `${versionedSetupDest}.sig`);
        }
      }

      // Zip portable package (skymusic.exe + WebView2Loader.dll)
      if (process.platform === "win32") {
        const filesToZip = ["skymusic.exe", "WebView2Loader.dll"]
          .map((f) => path.join(winOut, f))
          .filter((p) => fs.existsSync(p));
        if (filesToZip.length > 0) {
          const quoted = filesToZip.map((f) => `'${f}'`).join(",");
          execSync(
            `powershell -NoProfile -Command "Compress-Archive -Path ${quoted} -DestinationPath '${portableZipDest}' -Force"`,
            { stdio: "inherit" }
          );
        }
      }

      // 2. Build Android signed APK
      if (process.platform === "win32" && env.NDK_HOME) {
        const ndkBin = path.join(
          env.NDK_HOME,
          "toolchains",
          "llvm",
          "prebuilt",
          "windows-x86_64",
          "bin"
        );
        const androidEnv = {
          ...env,
          TAURI_ANDROID_PROJECT_PATH: path.join(ROOT_DIR, "src-tauri", "gen", "android"),
          WRY_ANDROID_PACKAGE: "com.skymusic.app",
          WRY_ANDROID_LIBRARY: "skymusic_lib",
          WRY_ANDROID_KOTLIN_FILES_OUT_DIR: path.join(
            ROOT_DIR,
            "src-tauri",
            "gen",
            "android",
            "app",
            "src",
            "main",
            "java",
            "com",
            "skymusic",
            "app",
            "generated"
          ),
          CC_aarch64_linux_android: path.join(ndkBin, "aarch64-linux-android24-clang.cmd"),
          CXX_aarch64_linux_android: path.join(ndkBin, "aarch64-linux-android24-clang++.cmd"),
          AR_aarch64_linux_android: path.join(ndkBin, "llvm-ar.exe"),
          CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER: path.join(ndkBin, "aarch64-linux-android24-clang.cmd"),
          CC_armv7_linux_androideabi: path.join(ndkBin, "armv7a-linux-androideabi24-clang.cmd"),
          CXX_armv7_linux_androideabi: path.join(ndkBin, "armv7a-linux-androideabi24-clang++.cmd"),
          AR_armv7_linux_androideabi: path.join(ndkBin, "llvm-ar.exe"),
          CARGO_TARGET_ARMV7_LINUX_ANDROIDEABI_LINKER: path.join(ndkBin, "armv7a-linux-androideabi24-clang.cmd"),
          CC_x86_64_linux_android: path.join(ndkBin, "x86_64-linux-android24-clang.cmd"),
          CXX_x86_64_linux_android: path.join(ndkBin, "x86_64-linux-android24-clang++.cmd"),
          AR_x86_64_linux_android: path.join(ndkBin, "llvm-ar.exe"),
          CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER: path.join(ndkBin, "x86_64-linux-android24-clang.cmd"),
        };

        const abis = [
          { rust: "aarch64-linux-android", android: "arm64-v8a" },
          { rust: "armv7-linux-androideabi", android: "armeabi-v7a" },
          { rust: "x86_64-linux-android", android: "x86_64" },
        ];
        const jniRoot = path.join(
          ROOT_DIR,
          "src-tauri",
          "gen",
          "android",
          "app",
          "src",
          "main",
          "jniLibs"
        );
        for (const abi of abis) {
          runCmd(
            `cargo build --manifest-path "src-tauri\\Cargo.toml" --lib --release --features custom-protocol --target ${abi.rust}`,
            { env: androidEnv }
          );
          const soSrc = path.join(targetBase, abi.rust, "release", "libskymusic_lib.so");
          const soDestDir = path.join(jniRoot, abi.android);
          fs.mkdirSync(soDestDir, { recursive: true });
          fs.copyFileSync(soSrc, path.join(soDestDir, "libskymusic_lib.so"));
        }

        const androidDir = path.join(ROOT_DIR, "src-tauri", "gen", "android");
        const apkOutputsDir = path.join(androidDir, "app", "build", "outputs", "apk");
        fs.rmSync(apkOutputsDir, { recursive: true, force: true });
        execSync(
          `gradlew.bat assembleUniversalRelease "-PabiList=arm64-v8a,armeabi-v7a,x86_64" -x rustBuildUniversalRelease -x rustBuildArm64Release -x rustBuildArmRelease -x rustBuildX86Release -x rustBuildX86_64Release --rerun-tasks --no-configuration-cache`,
          { cwd: androidDir, env: androidEnv, stdio: "inherit" }
        );
      } else {
        runCmd("npm run tauri android build -- --apk", { env });
      }

      const builtApk = findFirstFile(
        path.join(
          ROOT_DIR,
          "src-tauri",
          "gen",
          "android",
          "app",
          "build",
          "outputs",
          "apk"
        ),
        (_, name) =>
          name.endsWith(".apk") &&
          !name.includes("aligned") &&
          !name.includes("unsigned")
      );

      if (builtApk) {
        fs.copyFileSync(builtApk, path.join(androidOut, "skymusic.apk"));
        fs.copyFileSync(
          builtApk,
          path.join(androidOut, `skymusic_${next.tag}.apk`)
        );
      }

      // 3. Generate latest.json for Tauri Updater
      const sigContent =
        setupSig && fs.existsSync(`${versionedSetupDest}.sig`)
          ? fs.readFileSync(`${versionedSetupDest}.sig`, "utf8").trim()
          : "";

      const latestJson = {
        version: next.semver,
        notes,
        pub_date: new Date().toISOString(),
        platforms: {
          "windows-x86_64": {
            signature: sigContent,
            url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${next.tag}/${versionedSetupName}`,
          },
        },
      };

      fs.writeFileSync(
        path.join(releaseOut, "latest.json"),
        `${JSON.stringify(latestJson, null, 2)}\n`,
        "utf8"
      );
    } finally {
      if (targetJunction && fs.existsSync(targetJunction)) {
        try {
          execSync(`cmd /c rmdir "${targetJunction}"`, { stdio: "ignore" });
        } catch {}
      }
    }
  }

  if (!opts.skipPush) {
    runCmd(
      "git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/gen/android/app/tauri.properties src-tauri/gen/android/app/build.gradle.kts CHANGELOG.md README.md"
    );
    runCmd(`git commit -m "chore(release): ${next.tag}"`);
    runCmd(`git tag -a ${next.tag} -m "Release ${next.tag}"`);
    runCmd("git push origin HEAD --follow-tags");

    const assets = [
      path.join(winOut, "skymusic.exe"),
      path.join(winOut, `skymusic_${next.tag}_x64-setup.exe`),
      path.join(winOut, `skymusic_${next.tag}_x64-setup.exe.sig`),
      path.join(winOut, `skymusic_${next.tag}_windows_portable.zip`),
      path.join(androidOut, "skymusic.apk"),
      path.join(androidOut, `skymusic_${next.tag}.apk`),
      path.join(releaseOut, "latest.json"),
    ].filter((p) => fs.existsSync(p));

    if (assets.length > 0) {
      const ghArgs = [
        "release",
        "create",
        next.tag,
        ...assets,
        "--title",
        `Skymusic ${next.tag}`,
        "--notes",
        notes,
      ];
      const ghRes = spawnSync("gh", ghArgs, {
        cwd: ROOT_DIR,
        stdio: "inherit",
      });
      if (ghRes.status !== 0) {
        throw new Error(`gh release create failed with exit code ${ghRes.status}`);
      }
    }
  }

  console.log(`\nRelease ${next.tag} completed successfully.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("Release failed:", err.message || err);
    process.exit(1);
  });
}
