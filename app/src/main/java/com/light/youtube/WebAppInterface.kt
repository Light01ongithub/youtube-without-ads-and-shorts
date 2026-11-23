package com.light.youtube

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast

class WebAppInterface(
    private val context: Context,
    private val webView: WebView
) {
    private val handler = Handler(Looper.getMainLooper())
    private var sleepRunnable: Runnable? = null

    @JavascriptInterface
    fun share(title: String, url: String) {
        val sendIntent = Intent().apply {
            action = Intent.ACTION_SEND
            putExtra(Intent.EXTRA_TEXT, "$title\n$url")
            type = "text/plain"
        }
        val shareIntent = Intent.createChooser(sendIntent, "Share Video").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(shareIntent)
    }

    @JavascriptInterface
    fun showToast(message: String) {
        handler.post {
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
        }
    }

    @JavascriptInterface
    fun setSleepTimer(minutes: Int) {
        sleepRunnable?.let { handler.removeCallbacks(it) }

        if (minutes <= 0) {
            handler.post {
                Toast.makeText(context, "Sleep timer cancelled", Toast.LENGTH_SHORT).show()
            }
            return
        }

        sleepRunnable = Runnable {
            webView.evaluateJavascript(
                "(function(){ var v = document.querySelector('video'); if(v) v.pause(); })()",
                null
            )
            Toast.makeText(context, "Sleep timer: Playback paused", Toast.LENGTH_LONG).show()
        }

        handler.postDelayed(sleepRunnable!!, minutes * 60 * 1000L)
        handler.post {
            Toast.makeText(context, "Sleep timer set for $minutes minutes", Toast.LENGTH_SHORT).show()
        }
    }
}
