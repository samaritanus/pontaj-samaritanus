package com.samaritanus.pontaj

import retrofit2.Call
import retrofit2.http.*

// Data models

data class User(val name: String?, val email: String?, val hourlyRate: Double?)
data class PontajEvent(
    val user: String?,
    val email: String?,
    val punct: String?,
    val action: String?,
    val timestamp: String?,
    val latitude: Double? = null,
    val longitude: Double? = null
)
data class Avans(val user: String?, val email: String?, val month: String, val suma: Double)

data class PostPontajReq(
    val user: String? = null,
    val email: String? = null,
    val punct: String,
    val action: String,
    val latitude: Double? = null,
    val longitude: Double? = null
)

data class BasicResp(val success: Boolean?, val error: String?)

interface ApiService {
    @GET("/api/users")
    fun getUsers(): Call<List<User>>

    @GET("/api/pontaje")
    fun getPontaje(): Call<List<PontajEvent>>

    @POST("/api/pontaj")
    fun postPontaj(@Body body: PostPontajReq): Call<BasicResp>

    @GET("/api/avansuri")
    fun getAvansuri(@Query("email") email: String? = null, @Query("name") name: String? = null, @Query("month") month: String? = null): Call<List<Avans>>

    @GET("/assets/puncte_lucru.json")
    fun getPuncteLucru(): Call<List<String>>

    @POST("/api/avans")
    fun postAvans(@Body body: Avans): Call<BasicResp>
}
