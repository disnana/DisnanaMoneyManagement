package expo.modules.deviceproof

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

class DeviceProofModule : Module() {
  private companion object {
    const val alias = "mane_device_proof_v1"
    val keyLock = Any()
    const val proofPrefix = "mane-device-proof-v1\n"
    const val base64Flags = Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP
  }

  override fun definition() = ModuleDefinition {
    Name("DeviceProof")

    AsyncFunction("getPublicIdentity") {
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
