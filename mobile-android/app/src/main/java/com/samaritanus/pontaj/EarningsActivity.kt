package com.samaritanus.pontaj

import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class EarningsActivity: AppCompatActivity() {
    private lateinit var imgAvatar: ImageView
    private lateinit var txtName: TextView
    private lateinit var txtRate: TextView
    private lateinit var txtRealizat: TextView
    private lateinit var txtPlatit: TextView
    private lateinit var txtDeIncasat: TextView
    private lateinit var btnAddPayment: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_earnings)

        imgAvatar = findViewById(R.id.imgAvatar)
        txtName = findViewById(R.id.txtName)
        txtRate = findViewById(R.id.txtRate)
        txtRealizat = findViewById(R.id.txtRealizat)
        txtPlatit = findViewById(R.id.txtPlatit)
        txtDeIncasat = findViewById(R.id.txtDeIncasat)
        btnAddPayment = findViewById(R.id.btnAddPayment)

        loadData()

        btnAddPayment.setOnClickListener { showAddPaymentDialog() }
    }

    private fun loadData() {
        val email = Prefs.getEmail(this)
        val name = Prefs.getName(this)
        val ym = SimpleDateFormat("yyyy-MM", Locale.getDefault()).format(Date())

        RetrofitClient.api(this).getUsers().enqueue(object: Callback<List<User>>{
            override fun onResponse(call: Call<List<User>>, respUsers: Response<List<User>>) {
                val users = respUsers.body() ?: emptyList()
                val me = users.firstOrNull { u ->
                    (email!=null && (u.email?:"").equals(email, true)) || (name!=null && (u.name?:"").equals(name, true))
                }
                val displayName = me?.name ?: name ?: email ?: "Utilizator"
                val rate = me?.hourlyRate ?: 0.0

                txtName.text = displayName
                txtRate.text = String.format(Locale.getDefault(), "%.2f lei per hour", rate)

                AvatarLoader.loadInto(Prefs.getBaseUrl(this@EarningsActivity), displayName, imgAvatar, null)

                // calcule
                RetrofitClient.api(this@EarningsActivity).getPontaje().enqueue(object: Callback<List<PontajEvent>>{
                    override fun onResponse(call: Call<List<PontajEvent>>, respEv: Response<List<PontajEvent>>) {
                        val evs = respEv.body() ?: emptyList()
                        val mine = evs.filter { e ->
                            val match = (email!=null && (e.email?:"").equals(email, true)) || (name!=null && (e.user?:"").equals(name, true))
                            match && (e.timestamp?:"").startsWith(ym)
                        }.sortedBy { it.timestamp }

                        var totalMin = 0
                        var openTs: Long? = null
                        val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
                        for (e in mine) {
                            val act = (e.action ?: "").lowercase(Locale.getDefault())
                            if (act == "sosire") {
                                if (openTs == null) openTs = runCatching { fmt.parse(e.timestamp!!)?.time }.getOrNull()
                            } else if (act == "plecare") {
                                val endTs = runCatching { fmt.parse(e.timestamp!!)?.time }.getOrNull()
                                if (openTs != null && endTs != null && endTs > openTs!!) {
                                    totalMin += ((endTs - openTs!!) / 60000L).toInt()
                                }
                                openTs = null
                            }
                        }
                        val totalHours = totalMin / 60.0
                        val realizat = totalHours * rate

                        RetrofitClient.api(this@EarningsActivity).getAvansuri(email, name, ym).enqueue(object: Callback<List<Avans>>{
                            override fun onResponse(call: Call<List<Avans>>, respAv: Response<List<Avans>>) {
                                val av = respAv.body() ?: emptyList()
                                val platit = av.sumOf { it.suma }
                                val rest = realizat - platit
                                txtRealizat.text = String.format(Locale.getDefault(), "%.2flei", realizat)
                                txtPlatit.text = String.format(Locale.getDefault(), "%.2fLei", platit)
                                txtDeIncasat.text = String.format(Locale.getDefault(), "%.2fLei", rest)
                            }
                            override fun onFailure(call: Call<List<Avans>>, t: Throwable) {
                                txtRealizat.text = String.format(Locale.getDefault(), "%.2flei", realizat)
                                txtPlatit.text = "-"
                                txtDeIncasat.text = "-"
                            }
                        })
                    }
                    override fun onFailure(call: Call<List<PontajEvent>>, t: Throwable) {
                        Toast.makeText(this@EarningsActivity, "Nu pot încărca evenimentele", Toast.LENGTH_SHORT).show()
                    }
                })
            }
            override fun onFailure(call: Call<List<User>>, t: Throwable) {
                Toast.makeText(this@EarningsActivity, "Nu pot încărca utilizatorii", Toast.LENGTH_SHORT).show()
            }
        })
    }

    private fun showAddPaymentDialog() {
        val email = Prefs.getEmail(this)
        val name = Prefs.getName(this)
        val ym = SimpleDateFormat("yyyy-MM", Locale.getDefault()).format(Date())
        val input = EditText(this)
        input.hint = "Suma (Lei)"
        AlertDialog.Builder(this)
            .setTitle("Adaugă plată")
            .setView(input)
            .setPositiveButton("Salvează") { d, _ ->
                val suma = input.text.toString().replace(",", ".").toDoubleOrNull()
                if (suma == null || suma <= 0) {
                    Toast.makeText(this, "Sumă invalidă", Toast.LENGTH_SHORT).show()
                } else {
                    val body = Avans(user = name, email = email, month = ym, suma = suma)
                    RetrofitClient.api(this).postAvans(body).enqueue(object: Callback<BasicResp>{
                        override fun onResponse(call: Call<BasicResp>, response: Response<BasicResp>) {
                            if (response.isSuccessful) {
                                Toast.makeText(this@EarningsActivity, "Plată adăugată", Toast.LENGTH_SHORT).show()
                                loadData()
                            } else {
                                Toast.makeText(this@EarningsActivity, "Eroare: ${response.code()}", Toast.LENGTH_SHORT).show()
                            }
                        }
                        override fun onFailure(call: Call<BasicResp>, t: Throwable) {
                            Toast.makeText(this@EarningsActivity, "Nu pot salva plata", Toast.LENGTH_SHORT).show()
                        }
                    })
                }
                d.dismiss()
            }
            .setNegativeButton("Anulează", null)
            .show()
    }
}
