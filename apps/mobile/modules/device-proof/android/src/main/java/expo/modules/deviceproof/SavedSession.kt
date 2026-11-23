package expo.modules.deviceproof

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import java.io.File
import java.io.FileNotFoundException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal class SavedSession(context: Context) {
  private val file = AtomicFile(File(context.noBackupFilesDir, "mane-account-session"))
  private val alias = "mane_session_aes_v1"
  private val transformation = "AES/GCM/NoPadding"
  private val ivLength = 12

  fun read(): String? {
    val bytes = try { file.readFully() } catch (_: FileNotFoundException) { return null }
    require(bytes.size > ivLength + 16)
    val cipher = Cipher.getInstance(transformation)
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, ivLength))
    return cipher.doFinal(bytes, ivLength, bytes.size - ivLength).toString(Charsets.UTF_8)
  }

  fun write(value: String?) {
    if (value == null) {
      file.delete()
      check(!file.baseFile.exists())
      return
    }
    val cipher = Cipher.getInstance(transformation)
    cipher.init(Cipher.ENCRYPT_MODE, key())
    check(cipher.iv.size == ivLength)
    val bytes = cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8))
    val output = file.startWrite()
    try {
      output.write(bytes)
      file.finishWrite(output)
    } catch (error: Exception) {
      file.failWrite(output)
      throw error
    }
  }

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val existing = store.getKey(alias, null) as? SecretKey
    if (existing != null) return existing
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
}
