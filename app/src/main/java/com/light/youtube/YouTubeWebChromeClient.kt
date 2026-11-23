package com.light.youtube

import android.app.Activity
import android.content.pm.ActivityInfo
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.widget.FrameLayout

class YouTubeWebChromeClient(
    private val activity: Activity,
    private val webView: View,
    private val customViewContainer: FrameLayout
) : WebChromeClient() {

    private var customView: View? = null
    private var customViewCallback: CustomViewCallback? = null
    private var originalOrientation: Int = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
    private var originalSystemUiVisibility: Int = 0

    val isCustomViewShowing: Boolean
        get() = customView != null

    override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
        if (customView != null) {
            onHideCustomView()
            return
        }

        customView = view
        customViewCallback = callback
        originalOrientation = activity.requestedOrientation
        originalSystemUiVisibility = activity.window.decorView.systemUiVisibility

        webView.visibility = View.GONE
        customViewContainer.visibility = View.VISIBLE
        customViewContainer.addView(
            view,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )

        // Enter immersive fullscreen
        activity.window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        )

        activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
    }

    override fun onHideCustomView() {
        if (customView == null) return

        customViewContainer.removeView(customView)
        customView = null
        customViewContainer.visibility = View.GONE
        webView.visibility = View.VISIBLE

        customViewCallback?.onCustomViewHidden()
        customViewCallback = null

        activity.window.decorView.systemUiVisibility = originalSystemUiVisibility
        activity.requestedOrientation = originalOrientation
    }
}
