package com.samaritanus.pontaj

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import android.widget.ImageView
import com.bumptech.glide.Glide
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response

class LoginActivity: AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)

        val url = findViewById<EditText>(R.id.inputUrl)
        val email = findViewById<EditText>(R.id.inputEmail)
        val name = findViewById<EditText>(R.id.inputName)
        val btn = findViewById<Button>(R.id.btnLogin)
        val img = findViewById<ImageView>(R.id.imgAmbulance)

        url.setText(Prefs.getBaseUrl(this))

        // load ambulance image from server assets if available
        runCatching {
            val base = url.text.toString().trim().ifEmpty { Prefs.getBaseUrl(this) }
            if (base.isNotEmpty()) {
                Glide.with(this)
                    .load(base.trimEnd('/') + "/assets/ambulanta.jpg")
                    .centerCrop()
                    .into(img)
            }
        }

        btn.setOnClickListener {
            val baseUrl = url.text.toString().trim()
            if (baseUrl.isEmpty()) { Toast.makeText(this, "Introdu URL server", Toast.LENGTH_SHORT).show(); return@setOnClickListener }
            Prefs.setBaseUrl(this, baseUrl)
            // refresh image using the new base URL
            runCatching {
                Glide.with(this)
                    .load(baseUrl.trimEnd('/') + "/assets/ambulanta.jpg")
                    .centerCrop()
                    .into(img)
            }

            val em = email.text.toString().trim().ifEmpty { null }
            val nm = name.text.toString().trim().ifEmpty { null }
            if (em==null && nm==null) { Toast.makeText(this, "Introdu email sau nume", Toast.LENGTH_SHORT).show(); return@setOnClickListener }

            // validare simplă: să existe utilizator în /api/users
            RetrofitClient.api(this).getUsers().enqueue(object: Callback<List<User>>{
                override fun onResponse(call: Call<List<User>>, response: Response<List<User>>) {
                    val list = response.body() ?: emptyList()
                    val ok = list.any { u ->
                        val byEmail = em!=null && (u.email?:"").equals(em, ignoreCase = true)
                        val byName = nm!=null && (u.name?:"").equals(nm, ignoreCase = true)
                        byEmail || byName
                    }
                    if (!ok && list.isNotEmpty()) {
                        Toast.makeText(this@LoginActivity, "Utilizator negăsit în listă", Toast.LENGTH_SHORT).show()
                        return
                    }
                    Prefs.setIdentity(this@LoginActivity, em, nm)
                    startActivity(Intent(this@LoginActivity, MainActivity::class.java))
                    finish()
                }
                override fun onFailure(call: Call<List<User>>, t: Throwable) {
                    Toast.makeText(this@LoginActivity, "Nu pot contacta serverul", Toast.LENGTH_SHORT).show()
                }
            })
        }
    }
}
