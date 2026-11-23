package expo.modules.deviceproof

import android.content.Context
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import com.google.android.gms.tasks.Task
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.StandardIntegrityManager.PrepareIntegrityTokenRequest
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityTokenRequest
import expo.modules.kotlin.functions.Coroutine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.security.SecureRandom

class DeviceProofModule : Module() {
  private val context: Context
    get() = checkNotNull(appContext.reactContext)

  private companion object {
    const val alias = "mane_device_proof_v1"
    val keyLock = Any()
    const val proofPrefix = "mane-device-proof-v1\n"
    const val base64Flags = Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP
  }

  override fun definition() = ModuleDefinition {
    Name("DeviceProof")

    AsyncFunction("getPublicIdentity") { ->
      synchronized(keyLock) {
        val store = keyStore()
        if (!store.containsAlias(alias)) {
          val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .build()
          KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore").apply {
            initialize(spec)
            generateKeyPair()
          }
        }
        val der = store.getCertificate(alias).publicKey.encoded
        val digest = MessageDigest.getInstance("SHA-256").digest(der)
        mapOf(
          "publicKey" to Base64.encodeToString(der, base64Flags),
          "fingerprint" to digest.joinToString("") { "%02x".format(it.toInt() and 0xff) }
        )
      }
    }

    AsyncFunction("googleIdToken") Coroutine { clientId: String, fingerprint: String ->
      val activity = checkNotNull(appContext.currentActivity)
      val random = ByteArray(16).also { SecureRandom().nextBytes(it) }
      val nonce = fingerprint + "." + random.joinToString("") { "%02x".format(it.toInt() and 0xff) }
      val option = GetSignInWithGoogleOption.Builder(clientId).setNonce(nonce).build()
      val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
      try {
        withContext(Dispatchers.Main) {
          val credential = CredentialManager.create(activity).getCredential(activity, request).credential
          check(credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL)
          GoogleIdTokenCredential.createFrom(credential.data).idToken
        }
      } catch (_: GetCredentialCancellationException) {
        null
      }
    }

    AsyncFunction("integrityToken") Coroutine { projectNumber: String, requestHash: String ->
      val provider = IntegrityManagerFactory.createStandard(context).prepareIntegrityToken(
        PrepareIntegrityTokenRequest.builder().setCloudProjectNumber(projectNumber.toLong()).build()
      ).awaitResult()
      provider.request(StandardIntegrityTokenRequest.builder().setRequestHash(requestHash).build()).awaitResult().token()
    }

    AsyncFunction("loadSession") { -> synchronized(keyLock) { SavedSession(context).read() } }
    AsyncFunction("saveSession") { value: String? -> synchronized(keyLock) { SavedSession(context).write(value) } }

    AsyncFunction("clearGoogleState") Coroutine { ->
      CredentialManager.create(context).clearCredentialState(ClearCredentialStateRequest())
    }

    AsyncFunction("signChallenge") { challenge: String ->
      require(challenge.length in 1..4096 && challenge.matches(Regex("[A-Za-z0-9_.-]+")))
      val privateKey = (keyStore().getEntry(alias, null) as KeyStore.PrivateKeyEntry).privateKey
      val signer = Signature.getInstance("SHA256withECDSA")
      signer.initSign(privateKey)
      signer.update((proofPrefix + challenge).toByteArray(Charsets.UTF_8))
      Base64.encodeToString(signer.sign(), base64Flags)
    }
  }

  private fun keyStore() = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
}


private suspend fun <T> Task<T>.awaitResult(): T = suspendCancellableCoroutine { continuation ->
  addOnCompleteListener { task ->
    when {
      task.isCanceled -> continuation.cancel()
      task.isSuccessful -> continuation.resume(task.result)
      else -> continuation.resumeWithException(task.exception ?: IllegalStateException("Play Integrity request failed"))
    }
  }
}
