package com.skymusic.app

import android.Manifest
import android.app.UiModeManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Color
import android.media.MediaScannerConnection
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.provider.Settings
import android.speech.RecognizerIntent
import android.view.KeyEvent
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.util.Locale

class MainActivity : TauriActivity() {
  companion object {
    private const val REQ_AUDIO_PERMS = 1002
  }

  override val handleBackNavigation: Boolean = false

  private var webViewRef: WebView? = null
  private var multicastLock: WifiManager.MulticastLock? = null
  private lateinit var voiceSearchLauncher: ActivityResultLauncher<Intent>
  private lateinit var backCallback: OnBackPressedCallback

  fun isTvDevice(): Boolean {
    val uiModeManager = getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
    val isTvMode = uiModeManager?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION
    val pm = packageManager
    return isTvMode ||
      pm.hasSystemFeature("android.hardware.type.television") ||
      pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK_ONLY)
  }

  private fun emitJsEvent(name: String, detailJson: String = "null") {
    val webView = webViewRef ?: return
    val script = "window.dispatchEvent(new CustomEvent('$name',{detail:$detailJson}));"
    webView.post {
      webView.evaluateJavascript(script, null)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    if (!isTvDevice()) {
      enableEdgeToEdge()
    }
    super.onCreate(savedInstanceState)

    voiceSearchLauncher = registerForActivityResult(
      ActivityResultContracts.StartActivityForResult()
    ) { result ->
      if (result.resultCode == RESULT_OK) {
        val matches = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
        val spoken = matches?.firstOrNull()?.trim()
        if (!spoken.isNullOrEmpty()) {
          emitJsEvent("skymusic-voice-search", JSONObject.quote(spoken))
        }
      }
    }

    backCallback = object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        val wv = webViewRef
        if (wv == null) {
          isEnabled = false
          onBackPressedDispatcher.onBackPressed()
          return
        }
        wv.evaluateJavascript(
          "(function(){try{return Boolean(window.__skymusicHandleBack&&window.__skymusicHandleBack());}catch(e){return false;}})()"
        ) { raw ->
          if (raw != "true") {
            runOnUiThread {
              isEnabled = false
              onBackPressedDispatcher.onBackPressed()
              isEnabled = true
            }
          }
        }
      }
    }
    onBackPressedDispatcher.addCallback(this, backCallback)

    // Defer startup permission prompt on Android TV so cold launch renders immediately for D-pad focus
    if (!isTvDevice()) {
      ensureAudioPermissionsIfNeeded()
    }

    try {
      val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
      multicastLock = wifi?.createMulticastLock("skymusic_lan_sync")?.apply {
        setReferenceCounted(false)
        acquire()
      }
    } catch (_: Exception) {
    }
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
    webViewRef = webView
    webView.setBackgroundColor(Color.parseColor("#0f1215"))
    webView.settings.mediaPlaybackRequiresUserGesture = false
    webView.isFocusable = true
    webView.isFocusableInTouchMode = true
    webView.post { webView.requestFocus() }
    webView.addJavascriptInterface(AndroidBridge(this), "SkymusicAndroid")
    SkymusicMediaService.transportListener = { cmd ->
      emitJsEvent("skymusic-media-key", JSONObject.quote(cmd))
    }
  }

  override fun onResume() {
    super.onResume()
    webViewRef?.post { webViewRef?.requestFocus() }
  }

  override fun onPause() {
    super.onPause()
    // Keep WebView JS/audio engine active in the background when SkyMusic is playing on Home.
    if (SkymusicMediaService.hasActiveTrack) {
      webViewRef?.onResume()
      webViewRef?.resumeTimers()
    }
  }

  override fun onDestroy() {
    if (isFinishing) {
      SkymusicMediaService.transportListener = null
      SkymusicMediaService.clear(this)
    }
    try {
      if (multicastLock?.isHeld == true) {
        multicastLock?.release()
      }
      multicastLock = null
    } catch (_: Exception) {
    }
    super.onDestroy()
  }

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (event.action == KeyEvent.ACTION_DOWN) {
      val mediaAction = when (event.keyCode) {
        KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> "play_pause"
        KeyEvent.KEYCODE_MEDIA_PLAY -> "play"
        KeyEvent.KEYCODE_MEDIA_PAUSE -> "pause"
        KeyEvent.KEYCODE_MEDIA_NEXT -> "next"
        KeyEvent.KEYCODE_MEDIA_PREVIOUS -> "prev"
        KeyEvent.KEYCODE_MEDIA_STOP -> "stop"
        KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> "ff"
        KeyEvent.KEYCODE_MEDIA_REWIND -> "rw"
        else -> null
      }
      if (mediaAction != null) {
        emitJsEvent("skymusic-media-key", JSONObject.quote(mediaAction))
        return true
      }

      // Ensure WebView receives D-Pad arrow & center events cleanly on TV
      if (isTvDevice() && event.keyCode in setOf(
          KeyEvent.KEYCODE_DPAD_UP,
          KeyEvent.KEYCODE_DPAD_DOWN,
          KeyEvent.KEYCODE_DPAD_LEFT,
          KeyEvent.KEYCODE_DPAD_RIGHT,
          KeyEvent.KEYCODE_DPAD_CENTER,
          KeyEvent.KEYCODE_ENTER
        )
      ) {
        webViewRef?.let { wv ->
          if (!wv.hasFocus()) {
            wv.requestFocus()
          }
        }
      }
    }
    return super.dispatchKeyEvent(event)
  }

  private class AndroidBridge(private val activity: MainActivity) {
    @JavascriptInterface
    fun isTv(): Boolean {
      return activity.isTvDevice()
    }

    @JavascriptInterface
    fun getDeviceModel(): String {
      return try {
        val mfg = Build.MANUFACTURER.orEmpty().trim()
        val model = Build.MODEL.orEmpty().trim()
        if (model.lowercase().startsWith(mfg.lowercase())) model else "$mfg $model".trim()
      } catch (_: Exception) {
        if (activity.isTvDevice()) "Android TV" else "Android Phone"
      }
    }

    @JavascriptInterface
    fun setKeepScreenOn(keepOn: Boolean) {
      activity.runOnUiThread {
        if (keepOn) {
          activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
          activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
      }
    }

    @JavascriptInterface
    fun hasVoiceSearch(): Boolean {
      val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
      return intent.resolveActivity(activity.packageManager) != null
    }

    @JavascriptInterface
    fun startVoiceSearch(): Boolean {
      return try {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
          putExtra(
            RecognizerIntent.EXTRA_LANGUAGE_MODEL,
            RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
          )
          putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
          putExtra(RecognizerIntent.EXTRA_PROMPT, "Search songs, artists, or albums")
        }
        activity.runOnUiThread {
          try {
            activity.voiceSearchLauncher.launch(intent)
          } catch (_: Exception) {
          }
        }
        true
      } catch (_: Exception) {
        false
      }
    }

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

    @JavascriptInterface
    fun updateMediaSession(
      title: String?,
      artist: String?,
      album: String?,
      artworkUrl: String?,
      playing: Boolean,
      positionMs: Long,
      durationMs: Long
    ) {
      SkymusicMediaService.update(
        activity.applicationContext,
        title.orEmpty(),
        artist.orEmpty(),
        album.orEmpty(),
        artworkUrl.orEmpty(),
        playing,
        positionMs,
        durationMs
      )
    }

    @JavascriptInterface
    fun clearMediaSession() {
      SkymusicMediaService.clear(activity.applicationContext)
    }
  }
}
