package com.skymusic.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.IBinder
import androidx.core.content.ContextCompat
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Keeps SkyMusic playback alive in the background on Android TV and publishes a standard system
 * MediaSession with metadata, album art bitmap, and transport controls for launchers (CleanMyTV)
 * and TV media keys.
 */
class SkymusicMediaService : Service() {

  companion object {
    private const val CHANNEL_ID = "skymusic_playback"
    private const val NOTIFICATION_ID = 4101
    private const val ACTION_UPDATE = "com.skymusic.app.action.MEDIA_UPDATE"
    private const val ACTION_CMD = "com.skymusic.app.action.MEDIA_CMD"
    private const val EXTRA_CMD = "cmd"
    private const val EXTRA_TITLE = "title"
    private const val EXTRA_ARTIST = "artist"
    private const val EXTRA_ALBUM = "album"
    private const val EXTRA_ARTWORK = "artwork"
    private const val EXTRA_PLAYING = "playing"
    private const val EXTRA_POSITION = "position_ms"
    private const val EXTRA_DURATION = "duration_ms"

    @Volatile var hasActiveTrack: Boolean = false
    @Volatile var isForegroundActive: Boolean = false
    @Volatile var transportListener: ((String) -> Unit)? = null

    fun update(
      context: Context,
      title: String,
      artist: String,
      album: String,
      artworkUrl: String,
      playing: Boolean,
      positionMs: Long,
      durationMs: Long
    ) {
      hasActiveTrack = title.isNotBlank()
      val intent = Intent(context, SkymusicMediaService::class.java).apply {
        action = ACTION_UPDATE
        putExtra(EXTRA_TITLE, title)
        putExtra(EXTRA_ARTIST, artist)
        putExtra(EXTRA_ALBUM, album)
        putExtra(EXTRA_ARTWORK, artworkUrl)
        putExtra(EXTRA_PLAYING, playing)
        putExtra(EXTRA_POSITION, positionMs)
        putExtra(EXTRA_DURATION, durationMs)
      }
      if (playing && !isForegroundActive) {
        ContextCompat.startForegroundService(context, intent)
      } else {
        try {
          context.startService(intent)
        } catch (_: Exception) {
          if (!isForegroundActive) {
            try {
              ContextCompat.startForegroundService(context, intent)
            } catch (_: Exception) {
            }
          }
        }
      }
    }

    fun clear(context: Context) {
      hasActiveTrack = false
      isForegroundActive = false
      try {
        context.stopService(Intent(context, SkymusicMediaService::class.java))
      } catch (_: Exception) {
      }
    }
  }

  private var mediaSession: MediaSession? = null
  private val artworkExecutor = Executors.newSingleThreadExecutor()

  private var curTitle: String = ""
  private var curArtist: String = ""
  private var curAlbum: String = ""
  private var curArtworkUrl: String = ""
  private var curArtworkBitmap: Bitmap? = null
  private var curPlaying: Boolean = false
  private var curPositionMs: Long = 0L
  private var curDurationMs: Long = 0L

  override fun onCreate() {
    super.onCreate()
    ensureChannel()
    val sessionIntent = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    mediaSession = MediaSession(this, "SkymusicMediaSession").apply {
      @Suppress("DEPRECATION")
      setFlags(
        MediaSession.FLAG_HANDLES_MEDIA_BUTTONS or
          MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS
      )
      setSessionActivity(sessionIntent)
      setCallback(object : MediaSession.Callback() {
        override fun onPlay() {
          transportListener?.invoke("play")
        }

        override fun onPause() {
          transportListener?.invoke("pause")
        }

        override fun onSkipToNext() {
          transportListener?.invoke("next")
        }

        override fun onSkipToPrevious() {
          transportListener?.invoke("prev")
        }

        override fun onStop() {
          transportListener?.invoke("stop")
        }

        override fun onSeekTo(pos: Long) {
          transportListener?.invoke("seek:${pos / 1000L}")
        }
      })
      isActive = true
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_CMD -> {
        val cmd = intent.getStringExtra(EXTRA_CMD)
        if (!cmd.isNullOrEmpty()) transportListener?.invoke(cmd)
        promoteOrNotify()
      }
      ACTION_UPDATE -> {
        val nextTitle = intent.getStringExtra(EXTRA_TITLE).orEmpty()
        val nextArtist = intent.getStringExtra(EXTRA_ARTIST).orEmpty()
        val nextAlbum = intent.getStringExtra(EXTRA_ALBUM).orEmpty()
        val nextArtwork = intent.getStringExtra(EXTRA_ARTWORK).orEmpty()
        val nextPlaying = intent.getBooleanExtra(EXTRA_PLAYING, false)
        val nextPos = intent.getLongExtra(EXTRA_POSITION, 0L)
        val nextDur = intent.getLongExtra(EXTRA_DURATION, 0L)

        curTitle = nextTitle
        curArtist = nextArtist
        curAlbum = nextAlbum
        curPlaying = nextPlaying
        curPositionMs = nextPos
        curDurationMs = nextDur
        hasActiveTrack = curTitle.isNotBlank()

        publishSessionState()
        promoteOrNotify()

        if (nextArtwork.isNotBlank() && nextArtwork != curArtworkUrl) {
          curArtworkUrl = nextArtwork
          fetchArtworkAsync(nextArtwork)
        } else if (nextArtwork.isBlank() && curArtworkBitmap != null) {
          curArtworkUrl = ""
          curArtworkBitmap = null
          publishSessionState()
          promoteOrNotify()
        }
      }
    }
    return START_NOT_STICKY
  }

  private fun promoteOrNotify() {
    val notification = buildNotification()
    if (isForegroundActive) {
      val nm = getSystemService(NotificationManager::class.java)
      if (nm != null) {
        nm.notify(NOTIFICATION_ID, notification)
        return
      }
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(
          NOTIFICATION_ID,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
        )
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      isForegroundActive = true
    } catch (_: Exception) {
      val nm = getSystemService(NotificationManager::class.java)
      nm?.notify(NOTIFICATION_ID, notification)
    }
  }

  private fun publishSessionState() {
    val session = mediaSession ?: return
    val actions = PlaybackState.ACTION_PLAY or
      PlaybackState.ACTION_PAUSE or
      PlaybackState.ACTION_PLAY_PAUSE or
      PlaybackState.ACTION_SKIP_TO_NEXT or
      PlaybackState.ACTION_SKIP_TO_PREVIOUS or
      PlaybackState.ACTION_STOP or
      PlaybackState.ACTION_SEEK_TO

    val stateCode = if (curPlaying) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED
    val state = PlaybackState.Builder()
      .setActions(actions)
      .setState(stateCode, curPositionMs, if (curPlaying) 1.0f else 0.0f)
      .build()
    session.setPlaybackState(state)

    val metaBuilder = MediaMetadata.Builder()
      .putString(MediaMetadata.METADATA_KEY_TITLE, curTitle.ifBlank { "Skymusic" })
      .putString(MediaMetadata.METADATA_KEY_ARTIST, curArtist.ifBlank { "Skymusic" })
      .putString(MediaMetadata.METADATA_KEY_ALBUM, curAlbum.ifBlank { "Skymusic" })
    if (curDurationMs > 0L) {
      metaBuilder.putLong(MediaMetadata.METADATA_KEY_DURATION, curDurationMs)
    }
    curArtworkBitmap?.let { bmp ->
      metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, bmp)
      metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_ART, bmp)
    }
    session.setMetadata(metaBuilder.build())
    session.isActive = true
  }

  private fun fetchArtworkAsync(urlStr: String) {
    artworkExecutor.execute {
      try {
        val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
          connectTimeout = 5000
          readTimeout = 5000
          instanceFollowRedirects = true
        }
        conn.inputStream.use { inp ->
          val raw = BitmapFactory.decodeStream(inp) ?: return@execute
          val scaled = scaleSquareMax(raw, 384)
          if (scaled != raw) raw.recycle()
          if (curArtworkUrl == urlStr) {
            curArtworkBitmap = scaled
            publishSessionState()
            promoteOrNotify()
          }
        }
      } catch (_: Exception) {
      }
    }
  }

  private fun scaleSquareMax(src: Bitmap, maxDim: Int): Bitmap {
    val w = src.width
    val h = src.height
    if (w <= maxDim && h <= maxDim) return src
    val scale = maxDim.toFloat() / maxOf(w, h)
    return Bitmap.createScaledBitmap(
      src,
      maxOf(1, (w * scale).toInt()),
      maxOf(1, (h * scale).toInt()),
      true
    )
  }

  private fun buildNotification(): Notification {
    val launchIntent = PendingIntent.getActivity(
      this,
      1,
      Intent(this, MainActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val prevPi = cmdPendingIntent(10, "prev")
    val togglePi = cmdPendingIntent(11, if (curPlaying) "pause" else "play")
    val nextPi = cmdPendingIntent(12, "next")

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

    builder
      .setContentTitle(curTitle.ifBlank { "Skymusic" })
      .setContentText(curArtist.ifBlank { "Music Player" })
      .setSubText("Skymusic")
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentIntent(launchIntent)
      .setOngoing(curPlaying)
      .setOnlyAlertOnce(true)
      .addAction(
        Notification.Action.Builder(
          android.R.drawable.ic_media_previous,
          "Previous",
          prevPi
        ).build()
      )
      .addAction(
        Notification.Action.Builder(
          if (curPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
          if (curPlaying) "Pause" else "Play",
          togglePi
        ).build()
      )
      .addAction(
        Notification.Action.Builder(
          android.R.drawable.ic_media_next,
          "Next",
          nextPi
        ).build()
      )

    curArtworkBitmap?.let { builder.setLargeIcon(it) }
    mediaSession?.let { session ->
      builder.style = Notification.MediaStyle()
        .setMediaSession(session.sessionToken)
        .setShowActionsInCompactView(0, 1, 2)
    }
    return builder.build()
  }

  private fun cmdPendingIntent(reqCode: Int, cmd: String): PendingIntent {
    val intent = Intent(this, SkymusicMediaService::class.java).apply {
      action = ACTION_CMD
      putExtra(EXTRA_CMD, cmd)
    }
    return PendingIntent.getService(
      this,
      reqCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = getSystemService(NotificationManager::class.java) ?: return
      if (nm.getNotificationChannel(CHANNEL_ID) == null) {
        val ch = NotificationChannel(
          CHANNEL_ID,
          "Playback",
          NotificationManager.IMPORTANCE_LOW
        ).apply {
          setShowBadge(false)
        }
        nm.createNotificationChannel(ch)
      }
    }
  }

  override fun onDestroy() {
    hasActiveTrack = false
    isForegroundActive = false
    mediaSession?.isActive = false
    mediaSession?.release()
    mediaSession = null
    artworkExecutor.shutdownNow()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
