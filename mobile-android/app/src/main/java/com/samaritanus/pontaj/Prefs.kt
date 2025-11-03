package com.samaritanus.pontaj

import android.content.Context

object Prefs {
    private const val NAME = "pontaj_prefs"
    private const val KEY_URL = "base_url"
    private const val KEY_EMAIL = "email"
    private const val KEY_NAME = "name"

    fun setBaseUrl(ctx: Context, url: String) =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE).edit().putString(KEY_URL, url).apply()

    fun getBaseUrl(ctx: Context): String =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_URL, "http://192.168.1.200:5000") ?: "http://192.168.1.200:5000"

    fun setIdentity(ctx: Context, email: String?, name: String?) =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE).edit()
            .putString(KEY_EMAIL, email).putString(KEY_NAME, name).apply()

    fun getEmail(ctx: Context): String? =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_EMAIL, null)

    fun getName(ctx: Context): String? =
        ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE).getString(KEY_NAME, null)
}
