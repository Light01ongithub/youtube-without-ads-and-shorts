package com.light.youtube

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.util.Base64
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream
import java.io.InputStreamReader

class YouTubeWebViewClient(
    private val context: Context,
    private val onPageFinishedCallback: (() -> Unit)? = null
) : WebViewClient() {

    private val cachedCss: String by lazy {
        try {
            context.assets.open("shorts-blocker.css").use {
                InputStreamReader(it).readText()
            }
        } catch (e: Exception) {
            ""
        }
    }

    private val cachedJs: String by lazy {
        try {
            context.assets.open("shorts-blocker.js").use {
                InputStreamReader(it).readText()
            }
        } catch (e: Exception) {
            ""
        }
    }

    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
        val uri = request?.url ?: return false
        val uriString = uri.toString().lowercase()
        val path = uri.path ?: ""

        // 1. Block "Open in App" and Play Store market redirects
        if (uriString.startsWith("market://") ||
            uriString.contains("play.google.com/store/apps/details?id=com.google.android.youtube") ||
            uriString.startsWith("vnd.youtube:")
        ) {
            // Drop it - stay inside our Pure app!
            return true
        }

        // 2. Intercept any Shorts link and rewrite to standard watch URL
        if (path.startsWith("/shorts/")) {
            val parts = path.split("/")
            val videoId = parts.getOrNull(2) ?: parts.getOrNull(1)
            if (!videoId.isNullOrEmpty()) {
                val cleanId = videoId.substringBefore("?").substringBefore("&")
                val normalWatchUrl = "https://m.youtube.com/watch?v=$cleanId"
                view?.loadUrl(normalWatchUrl)
                return true
            }
        }

        return false
    }

    override fun shouldInterceptRequest(
        view: WebView?,
        request: WebResourceRequest?
    ): WebResourceResponse? {
        val uri = request?.url
        if (AdBlocker.isAd(uri)) {
            // Return empty response to drop the ad request completely
            return WebResourceResponse(
                "text/plain",
                "UTF-8",
                ByteArrayInputStream(ByteArray(0))
            )
        }
        return super.shouldInterceptRequest(view, request)
    }

    override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
        super.onPageStarted(view, url, favicon)
        injectCleaners(view)
    }

    override fun onPageFinished(view: WebView?, url: String?) {
        super.onPageFinished(view, url)
        injectCleaners(view)
        onPageFinishedCallback?.invoke()
    }

    private fun injectCleaners(view: WebView?) {
        if (view == null) return

        // 1. Inject Liquid Glass & Purge Stylesheet
        if (cachedCss.isNotEmpty()) {
            val encodedCss = Base64.encodeToString(cachedCss.toByteArray(), Base64.NO_WRAP)
            val cssInjection = """
                (function() {
                    var styleId = 'yt-pure-style';
                    var existing = document.getElementById(styleId);
                    if (!existing) {
                        var style = document.createElement('style');
                        style.id = styleId;
                        style.type = 'text/css';
                        style.innerHTML = window.atob('$encodedCss');
                        (document.head || document.documentElement).appendChild(style);
                    }
                })();
            """.trimIndent()
            view.evaluateJavascript(cssInjection, null)
        }

        // 2. Inject JS Engine (MutationObserver, SPA router, ad-skipper, double-tap seek)
        if (cachedJs.isNotEmpty()) {
            view.evaluateJavascript(cachedJs, null)
        }
    }
}
