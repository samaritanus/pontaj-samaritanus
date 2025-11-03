@file:Suppress("SpellCheckingInspection", "GrazieInspection")
package com.samaritanus.pontaj

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import com.google.android.gms.location.LocationServices
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response
import java.text.ParseException
import java.text.SimpleDateFormat
import java.util.*

class MainActivity: AppCompatActivity() {
    private lateinit var spinnerPunct: Spinner
    private lateinit var btnSosire: Button
    private lateinit var btnPlecare: Button
    private lateinit var txtStatus: TextView
    private lateinit var txtTotals: TextView
    private lateinit var txtMonth: TextView
    private lateinit var btnEarnings: Button
    private lateinit var btnDayDetail: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        spinnerPunct = findViewById(R.id.spinnerPunct)
        btnSosire = findViewById(R.id.btnSosire)
        btnPlecare = findViewById(R.id.btnPlecare)
        txtStatus = findViewById(R.id.txtStatus)
        txtTotals = findViewById(R.id.txtTotals)
        txtMonth = findViewById(R.id.txtMonth)
        btnEarnings = findViewById(R.id.btnEarnings)
        btnDayDetail = findViewById(R.id.btnDayDetail)

        loadPuncte()

        btnSosire.setOnClickListener { postAction("sosire") }
        btnPlecare.setOnClickListener { postAction("plecare") }
        btnEarnings.setOnClickListener { startActivity(Intent(this, EarningsActivity::class.java)) }
        btnDayDetail.setOnClickListener {
            val ymd = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
            val i = Intent(this, DayDetailActivity::class.java)
            i.putExtra("date", ymd)
            startActivity(i)
        }

        refreshSummary()
    }

    private fun loadPuncte() {
        // Încearcă să iei lista din server, altfel fallback local
        RetrofitClient.api(this).getPuncteLucru().enqueue(object: Callback<List<String>>{
            override fun onResponse(call: Call<List<String>>, response: Response<List<String>>) {
                val items = response.body()?.ifEmpty { null }
                setSpinner(items ?: listOf("DISPECERAT SAMARITANUS", "WEEKEND", "CABINET AEROPORT", "PATINOAR"))
            }
            override fun onFailure(call: Call<List<String>>, t: Throwable) {
                setSpinner(listOf("DISPECERAT SAMARITANUS", "WEEKEND", "CABINET AEROPORT", "PATINOAR"))
            }
        })
    }

    private fun setSpinner(items: List<String>) {
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, items)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerPunct.adapter = adapter
    }

    private fun postAction(action: String) {
        val email = Prefs.getEmail(this)
        val name = Prefs.getName(this)
        val punct = spinnerPunct.selectedItem?.toString() ?: "DISPECERAT SAMARITANUS"
        val fused = LocationServices.getFusedLocationProviderClient(this)

        fun send(lat: Double? = null, lon: Double? = null) {
            val req = PostPontajReq(user = name, email = email, punct = punct, action = action, latitude = lat, longitude = lon)
            RetrofitClient.api(this).postPontaj(req).enqueue(object: Callback<BasicResp>{
                override fun onResponse(call: Call<BasicResp>, response: Response<BasicResp>) {
                    if (response.isSuccessful) {
                        Toast.makeText(this@MainActivity, "$action înregistrat", Toast.LENGTH_SHORT).show()
                        txtStatus.text = getString(R.string.last_event, action, Date())
                        refreshSummary()
                    } else {
                        Toast.makeText(this@MainActivity, "Eroare: ${response.code()}", Toast.LENGTH_SHORT).show()
                    }
                }
                override fun onFailure(call: Call<BasicResp>, t: Throwable) {
                    Toast.makeText(this@MainActivity, "Nu pot trimite: ${t.message}", Toast.LENGTH_SHORT).show()
                }
            })
        }

        val hasFine = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val hasCoarse = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (hasFine || hasCoarse) {
            fused.lastLocation.addOnSuccessListener { loc ->
                if (loc != null) send(loc.latitude, loc.longitude) else send()
            }.addOnFailureListener { send() }
        } else {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.ACCESS_FINE_LOCATION), 2001)
            send()
        }
    }

    private fun parseIso(ts: String?): Long? {
        if (ts.isNullOrBlank()) return null
        val patterns = listOf(
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSS",
            "yyyy-MM-dd'T'HH:mm:ss"
        )
        for (p in patterns) {
            try {
                val sdf = SimpleDateFormat(p, Locale.getDefault())
                sdf.timeZone = TimeZone.getTimeZone("UTC")
                return sdf.parse(ts)?.time
            } catch (_: ParseException) {}
        }
        return null
    }

    private fun refreshSummary() {
        val email = Prefs.getEmail(this)
        val name = Prefs.getName(this)
        val ym = SimpleDateFormat("yyyy-MM", Locale.getDefault()).format(Date())
    txtMonth.text = getString(R.string.month_label_value, ym)

        RetrofitClient.api(this).getUsers().enqueue(object: Callback<List<User>>{
            override fun onResponse(call: Call<List<User>>, respUsers: Response<List<User>>) {
                val users = respUsers.body() ?: emptyList()
                val me = users.firstOrNull { u ->
                    (email!=null && (u.email?:"").equals(email, true)) || (name!=null && (u.name?:"").equals(name, true))
                }
                val rate = me?.hourlyRate ?: 0.0

                RetrofitClient.api(this@MainActivity).getPontaje().enqueue(object: Callback<List<PontajEvent>>{
                    override fun onResponse(call: Call<List<PontajEvent>>, respEv: Response<List<PontajEvent>>) {
                        val evs = respEv.body() ?: emptyList()
                        val mine = evs.filter { e ->
                            val match = (email!=null && (e.email?:"").equals(email, true)) || (name!=null && (e.user?:"").equals(name, true))
                            match && ((e.timestamp?:"").startsWith(ym))
                        }.sortedBy { it.timestamp }

                        var totalMin = 0
                        var openTs: Long? = null
                        mine.forEach { e ->
                            val act = (e.action ?: "").lowercase(Locale.getDefault())
                            if (act == "sosire") {
                                if (openTs == null) openTs = parseIso(e.timestamp)
                            } else if (act == "plecare") {
                                val endTs = parseIso(e.timestamp)
                                openTs?.let { start ->
                                    if (endTs != null && endTs > start) {
                                        totalMin += ((endTs - start) / 60000L).toInt()
                                    }
                                }
                                openTs = null
                            }
                        }

                        val totalHours = totalMin / 60.0

                        RetrofitClient.api(this@MainActivity).getAvansuri(email, name, ym).enqueue(object: Callback<List<Avans>>{
                            override fun onResponse(call: Call<List<Avans>>, respAv: Response<List<Avans>>) {
                                val av = respAv.body() ?: emptyList()
                                val totalAvans = av.sumOf { it.suma }
                                val venit = totalHours * rate
                                val rest = venit - totalAvans
                                txtTotals.text = getString(R.string.summary_full, totalHours, venit, totalAvans, rest)
                            }
                            override fun onFailure(call: Call<List<Avans>>, t: Throwable) {
                                val venit = totalHours * rate
                                txtTotals.text = getString(R.string.summary_partial, totalHours, venit)
                            }
                        })
                    }
                    override fun onFailure(call: Call<List<PontajEvent>>, t: Throwable) {
                        txtTotals.text = getString(R.string.err_load_summary)
                    }
                })
            }
            override fun onFailure(call: Call<List<User>>, t: Throwable) {
                txtTotals.text = getString(R.string.err_load_users)
            }
        })
    }
}
