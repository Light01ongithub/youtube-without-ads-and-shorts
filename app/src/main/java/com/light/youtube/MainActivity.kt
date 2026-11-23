package com.light.youtube

import android.Manifest
import android.annotation.SuppressLint
import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.util.Rational
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

class MainActivity : AppCompatActivity() {

    private lateinit var swipeRefreshLayout: SwipeRefreshLayout
    private lateinit var webView: WebView
    private lateinit var customViewContainer: FrameLayout
    private lateinit var chromeClient: YouTubeWebChromeClient
    private lateinit var webViewClient: YouTubeWebViewClient

    companion object {
        private const val PERMISSION_REQUEST_AUDIO = 101
        // Clean Chrome Mobile UA that bypasses Google OAuth "disallowed_useragent" restriction
        private const val CHROME_MOBILE_UA =
            "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.179 Mobile Safari/537.36"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // 1. Initialize AdBlocker domain list
        AdBlocker.init(applicationContext)

        swipeRefreshLayout = findViewById(R.id.swipeRefreshLayout)
        webView = findViewById(R.id.webView)
        customViewContainer = findViewById(R.id.customViewContainer)

        // 2. Configure Swipe-to-Refresh with YouTube Accent
        swipeRefreshLayout.setColorSchemeColors(
            0xFFFF0000.toInt(), // YouTube Red
            0xFFFFFFFF.toInt(),
            0xFF212121.toInt()
        )
        swipeRefreshLayout.setProgressBackgroundColorSchemeColor(0xFF1E1E24.toInt())
        swipeRefreshLayout.setOnRefreshListener {
            webView.reload()
        }

        // Only allow pull-to-refresh when scrolled to top
        webView.viewTreeObserver.addOnScrollChangedListener {
            swipeRefreshLayout.isEnabled = (webView.scrollY == 0)
        }

        // 3. Configure Chrome and Web Clients
        chromeClient = YouTubeWebChromeClient(this, webView, customViewContainer)
        webViewClient = YouTubeWebViewClient(applicationContext) {
            swipeRefreshLayout.isRefreshing = false
        }
        webView.webChromeClient = chromeClient
        webView.webViewClient = webViewClient

        // 4. Configure WebView Settings & Google Login UA
        configureWebViewSettings(webView.settings)

        // 5. Register Native Android JavaScript Bridge
        webView.addJavascriptInterface(WebAppInterface(this, webView), "AndroidBridge")

        // 6. Cookies & Local Storage
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        // 7. Request Mic Permission for Voice Search if needed
        checkVoiceSearchPermission()

        // 8. Back Navigation Handling
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (chromeClient.isCustomViewShowing) {
                    chromeClient.onHideCustomView()
                } else if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        // 9. Restore state or load YouTube Mobile Home
        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            val targetUrl = intent?.dataString ?: "https://m.youtube.com"
            webView.loadUrl(targetUrl)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebViewSettings(settings: WebSettings) {
        settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            loadsImagesAutomatically = true
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(true)
            builtInZoomControls = true
            displayZoomControls = false
            cacheMode = WebSettings.LOAD_DEFAULT

            // Clean User Agent ensures Google Sign-in works smoothly
            userAgentString = CHROME_MOBILE_UA
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }
    }

    private fun checkVoiceSearchPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.RECORD_AUDIO),
                PERMISSION_REQUEST_AUDIO
            )
        }
    }

    /**
     * Native Picture-in-Picture (PiP) Trigger
     * Minimizes to floating video window when user exits to home screen
     */
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                val aspectRatio = Rational(16, 9)
                val pipBuilder = PictureInPictureParams.Builder()
                    .setAspectRatio(aspectRatio)
                enterPictureInPictureMode(pipBuilder.build())
            } catch (e: Exception) {
                // Ignore if device does not support PiP
            }
        }
    }

    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: Configuration
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        if (isInPictureInPictureMode) {
            swipeRefreshLayout.isEnabled = false
        } else {
            swipeRefreshLayout.isEnabled = (webView.scrollY == 0)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState)
        webView.restoreState(savedInstanceState)
    }

    override fun onDestroy() {
        super.onDestroy()
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
    }
}
