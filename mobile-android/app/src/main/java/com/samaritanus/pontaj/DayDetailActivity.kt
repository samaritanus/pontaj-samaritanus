package com.samaritanus.pontaj

import android.os.Bundle
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response
import java.text.SimpleDateFormat
import java.util.*

class DayDetailActivity: AppCompatActivity() {
    private lateinit var txtDate: TextView
    private lateinit var txtWorked: TextView
    private lateinit var txtEarned: TextView
    private lateinit var imgIn: ImageView
    private lateinit var imgOut: ImageView
    private val ymdf = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
    private val tsdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_day_detail)

        txtDate = findViewById(R.id.txtDate)
        txtWorked = findViewById(R.id.txtWorked)
        txtEarned = findViewById(R.id.txtEarned)
        imgIn = findViewById(R.id.imgMapIn)
        imgOut = findViewById(R.id.imgMapOut)

        val dateStr = intent.getStringExtra("date") ?: ymdf.format(Date())
        txtDate.text = SimpleDateFormat("EEEE, MMMM d, yyyy", Locale.getDefault()).format(ymdf.parse(dateStr)!!)

        loadForDate(dateStr)
    }

    private fun staticMap(lat: Double, lon: Double): String {
        // OpenStreetMap static map (no key)
        // size in pixels; zoom 14; marker
        return "https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=14&size=600x300&markers=${lat},${lon},lightblue1"
    }

    private fun loadForDate(dateStr: String) {
        val email = Prefs.getEmail(this)
        val name = Prefs.getName(this)

        RetrofitClient.api(this).getUsers().enqueue(object: Callback<List<User>>{
            override fun onResponse(call: Call<List<User>>, respUsers: Response<List<User>>) {
                val users = respUsers.body() ?: emptyList()
                val me = users.firstOrNull { u ->
                    (email!=null && (u.email?:"").equals(email, true)) || (name!=null && (u.name?:"").equals(name, true))
                }
                val rate = me?.hourlyRate ?: 0.0

                RetrofitClient.api(this@DayDetailActivity).getPontaje().enqueue(object: Callback<List<PontajEvent>>{
                    override fun onResponse(call: Call<List<PontajEvent>>, respEv: Response<List<PontajEvent>>) {
                        val evs = respEv.body() ?: emptyList()
                        val mine = evs.filter { e ->
                            val match = (email!=null && (e.email?:"").equals(email, true)) || (name!=null && (e.user?:"").equals(name, true))
                            match && (e.timestamp?:"").startsWith(dateStr)
                        }.sortedBy { it.timestamp }

                        var totalMin = 0
                        var inLat: Double? = null
                        var inLon: Double? = null
                        var outLat: Double? = null
                        var outLon: Double? = null
                        var openTs: Long? = null

                        for (e in mine) {
                            val act = (e.action ?: "").lowercase(Locale.getDefault())
                            if (act == "sosire") {
                                if (openTs == null) {
                                    openTs = tsdf.parse(e.timestamp!!)?.time
                                    inLat = e.latitude
                                    inLon = e.longitude
                                }
                            } else if (act == "plecare") {
                                val endTs = tsdf.parse(e.timestamp!!)?.time
                                if (openTs != null && endTs != null && endTs > openTs!!) {
                                    totalMin += ((endTs - openTs!!) / 60000L).toInt()
                                }
                                outLat = e.latitude
                                outLon = e.longitude
                                openTs = null
                            }
                        }

                        val hours = totalMin / 60.0
                        val earned = hours * rate
                        txtWorked.text = String.format(Locale.getDefault(), "%.1f hours", hours)
                        txtEarned.text = String.format(Locale.getDefault(), "%.2fLei", earned)

                        // maps
                        val base = Prefs.getBaseUrl(this@DayDetailActivity)
                        if (inLat != null && inLon != null) {
                            val url = staticMap(inLat!!, inLon!!)
                            com.bumptech.glide.Glide.with(this@DayDetailActivity).load(url).into(imgIn)
                        }
                        if (outLat != null && outLon != null) {
                            val url = staticMap(outLat!!, outLon!!)
                            com.bumptech.glide.Glide.with(this@DayDetailActivity).load(url).into(imgOut)
                        }
                    }
                    override fun onFailure(call: Call<List<PontajEvent>>, t: Throwable) { }
                })
            }
            override fun onFailure(call: Call<List<User>>, t: Throwable) { }
        })
    }
}
