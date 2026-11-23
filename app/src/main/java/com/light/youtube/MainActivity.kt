package com.light.youtube

import android.annotation.SuppressLint
import android.app.PictureInPictureParams
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.util.Rational
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

class MainActivity : AppCompatActivity() {

    private lateinit var swipeRefreshLayout: SwipeRefreshLayout
    private lateinit var webView: WebView
    private lateinit var customViewContainer: FrameLayout
    private lateinit var chromeClient: YouTubeWebChromeClient
    private lateinit var webViewClient: YouTubeWebViewClient

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

        // 4. Configure WebView Settings
        configureWebViewSettings(webView.settings)

        // 5. Cookies & Local Storage
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        // 6. Back Navigation Handling
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

        // 7. Restore state or load YouTube Mobile Home
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
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            cacheMode = WebSettings.LOAD_DEFAULT

            // Smooth hardware accelerated rendering
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }
    }

    /**
     * Native Picture-in-Picture (PiP) Trigger
     * Minimizes to floating video window when user exits to home screen
     */
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Check if playing or in custom fullscreen view
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
