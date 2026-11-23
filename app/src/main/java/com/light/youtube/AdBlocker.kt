package com.light.youtube

import android.content.Context
import android.net.Uri
import org.json.JSONArray
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.concurrent.ConcurrentHashMap

object AdBlocker {
    private val adHosts = ConcurrentHashMap.newKeySet<String>()
    private val adPathKeywords = listOf("/api/stats/ads", "/pagead/", "/ptracking", "adformat=")

    fun init(context: Context) {
        if (adHosts.isNotEmpty()) return

        try {
            context.assets.open("ad-domains.json").use { stream ->
                val reader = BufferedReader(InputStreamReader(stream))
                val jsonString = reader.readText()
                val jsonArray = JSONArray(jsonString)
                for (i in 0 until jsonArray.length()) {
                    val entry = jsonArray.getString(i).trim().lowercase()
                    if (entry.isNotEmpty()) {
                        adHosts.add(entry)
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
            // Fallback essential hosts
            adHosts.addAll(listOf(
                "googleads.g.doubleclick.net",
                "pagead2.googlesyndication.com",
                "static.doubleclick.net",
                "pubads.g.doubleclick.net"
            ))
        }
    }

    fun isAd(uri: Uri?): Boolean {
        if (uri == null) return false
        val host = uri.host?.lowercase() ?: return false
        val urlString = uri.toString().lowercase()

        // 1. Direct host match or subdomain match
        for (adHost in adHosts) {
            if (host == adHost || host.endsWith(".$adHost")) {
                return true
            }
        }

        // 2. Path pattern match
        for (keyword in adPathKeywords) {
            if (urlString.contains(keyword)) {
                return true
            }
        }

        return false
    }
}
