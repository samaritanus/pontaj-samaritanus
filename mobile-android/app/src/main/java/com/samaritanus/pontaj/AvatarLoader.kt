package com.samaritanus.pontaj

import android.graphics.drawable.Drawable
import android.widget.ImageView
import com.bumptech.glide.Glide
import com.bumptech.glide.load.engine.DiskCacheStrategy
import java.text.Normalizer
import java.util.Locale

object AvatarLoader {
    private val extensions = listOf(".jpg", ".jpeg", ".png", ".webp")

    private fun stripDiacritics(s: String): String {
        val norm = Normalizer.normalize(s, Normalizer.Form.NFD)
        return norm.replace("\\p{InCombiningDiacriticalMarks}+".toRegex(), "")
    }

    private fun tokensFromName(name: String): List<String> {
        val base = stripDiacritics(name).lowercase(Locale.getDefault())
            .replace("[^a-z0-9 ]".toRegex(), " ")
            .trim()
        return base.split("\\s+".toRegex()).filter { it.isNotBlank() }
    }

    private fun joins(tokens: List<String>): List<String> {
        if (tokens.isEmpty()) return emptyList()
        val base = listOf(
            tokens.joinToString("-"),
            tokens.joinToString("_"),
            tokens.joinToString(" ")
        )
        // dacă sunt exact 2, încearcă și inversarea (ex: horatiu-varga)
        val rev = if (tokens.size == 2) {
            val r = tokens.reversed()
            listOf(
                r.joinToString("-"),
                r.joinToString("_"),
                r.joinToString(" ")
            )
        } else emptyList()
        return base + rev
    }

    private fun candidatesForName(name: String): List<String> {
        val t = tokensFromName(name)
        val js = joins(t)
        val prefixed = js.flatMap { listOf(it, "photo-$it") }
        return prefixed.flatMap { j -> extensions.map { e -> "$j$e" } }
    }

    fun loadInto(baseUrl: String, displayName: String, into: ImageView, fallback: Int? = null) {
        val urlBase = baseUrl.trimEnd('/') + "/assets/avatars/"
        val paths = candidatesForName(displayName)

        // Construiește un lanț de fallback-uri cu .error(...) pentru a încerca mai multe URL-uri
        if (paths.isEmpty()) {
            if (fallback != null) into.setImageResource(fallback)
            return
        }

        var builder = Glide.with(into.context)
            .load(urlBase + paths[0])
            .diskCacheStrategy(DiskCacheStrategy.AUTOMATIC)
            .dontAnimate()

        for (i in 1 until paths.size) {
            builder = builder.error(
                Glide.with(into.context)
                    .load(urlBase + paths[i])
                    .diskCacheStrategy(DiskCacheStrategy.AUTOMATIC)
                    .dontAnimate()
            )
        }

        if (fallback != null) {
            builder = builder.error(fallback)
        }

        builder.into(into)
    }
}
