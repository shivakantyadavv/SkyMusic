package com.skymusic.app

import android.Manifest
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileInputStream

class MainActivity : TauriActivity() {
  companion object {
    private const val REQ_AUDIO_PERMS = 1002
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    ensureAudioPermissionsIfNeeded()
  }

  fun ensureAudioPermissionsIfNeeded() {
    val perms = mutableListOf<String>()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_AUDIO)
        != PackageManager.PERMISSION_GRANTED
      ) {
        perms.add(Manifest.permission.READ_MEDIA_AUDIO)
      }
    } else {
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE)
        != PackageManager.PERMISSION_GRANTED
      ) {
        perms.add(Manifest.permission.READ_EXTERNAL_STORAGE)
      }
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P &&
        ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE)
        != PackageManager.PERMISSION_GRANTED
      ) {
        perms.add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
      }
    }
    if (perms.isNotEmpty()) {
      ActivityCompat.requestPermissions(this, perms.toTypedArray(), REQ_AUDIO_PERMS)
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webView.addJavascriptInterface(AndroidBridge(this), "SkymusicAndroid")
  }

  private class AndroidBridge(private val activity: MainActivity) {
    @JavascriptInterface
    fun ensureStoragePermissions() {
      activity.runOnUiThread {
        activity.ensureAudioPermissionsIfNeeded()
      }
    }

    @JavascriptInterface
    fun exportToMusicFolder(
      sourcePath: String,
      displayName: String,
      mimeType: String,
      title: String,
      artist: String,
      album: String
    ): Boolean {
      return try {
        val sourceFile = File(sourcePath)
        if (!sourceFile.exists()) return false

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          val resolver = activity.contentResolver
          val values = ContentValues().apply {
            put(MediaStore.Audio.Media.DISPLAY_NAME, displayName)
            put(MediaStore.Audio.Media.MIME_TYPE, mimeType)
            put(MediaStore.Audio.Media.TITLE, title)
            put(MediaStore.Audio.Media.ARTIST, artist)
            put(MediaStore.Audio.Media.ALBUM, album)
            put(MediaStore.Audio.Media.IS_MUSIC, 1)
            put(
              MediaStore.Audio.Media.RELATIVE_PATH,
              "${Environment.DIRECTORY_MUSIC}/Skymusic"
            )
            put(MediaStore.Audio.Media.IS_PENDING, 1)
          }

          val uri = resolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values)
            ?: return false

          resolver.openOutputStream(uri)?.use { out ->
            FileInputStream(sourceFile).use { inp ->
              inp.copyTo(out)
            }
          } ?: return false

          val publishValues = ContentValues().apply {
            put(MediaStore.Audio.Media.IS_PENDING, 0)
          }
          resolver.update(uri, publishValues, null, null)
          true
        } else {
          if (ContextCompat.checkSelfPermission(
              activity,
              Manifest.permission.WRITE_EXTERNAL_STORAGE
            ) != PackageManager.PERMISSION_GRANTED
          ) {
            activity.runOnUiThread { activity.ensureAudioPermissionsIfNeeded() }
            return false
          }
          val musicDir = File(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC),
            "Skymusic"
          )
          if (!musicDir.exists()) musicDir.mkdirs()
          val destFile = File(musicDir, displayName)
          sourceFile.copyTo(destFile, overwrite = true)
          MediaScannerConnection.scanFile(
            activity,
            arrayOf(destFile.absolutePath),
            arrayOf(mimeType),
            null
          )
          true
        }
      } catch (_: Exception) {
        false
      }
    }

    @JavascriptInterface
    fun installApk(filePath: String): Boolean {
      return try {
        val file = File(filePath)
        if (!file.exists()) return false

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
          !activity.packageManager.canRequestPackageInstalls()
        ) {
          val settingsIntent = Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:${activity.packageName}")
          ).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          activity.startActivity(settingsIntent)
          return false
        }

        val uri = FileProvider.getUriForFile(
          activity,
          "${activity.packageName}.fileprovider",
          file
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
          setDataAndType(uri, "application/vnd.android.package-archive")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        activity.startActivity(intent)
        true
      } catch (_: Exception) {
        false
      }
    }

    @JavascriptInterface
    fun openUrl(url: String) {
      try {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        activity.startActivity(intent)
      } catch (_: Exception) {
      }
    }
  }
}
