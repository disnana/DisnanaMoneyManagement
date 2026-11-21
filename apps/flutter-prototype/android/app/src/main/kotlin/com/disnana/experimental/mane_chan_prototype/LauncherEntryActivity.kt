package com.disnana.experimental.mane_chan_prototype

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/** The open task stays attached to MainActivity when a launcher alias is disabled. */
class LauncherEntryActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        finish()
    }
}
