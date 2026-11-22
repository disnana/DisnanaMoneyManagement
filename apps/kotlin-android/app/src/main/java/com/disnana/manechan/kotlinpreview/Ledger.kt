package com.disnana.manechan.kotlinpreview

import android.app.Application
import android.content.ContentValues
import android.content.Context
import android.database.SQLException
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import java.text.NumberFormat
import java.time.LocalDate
import java.time.YearMonth
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.mapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class Kind(val label: String) { Expense("支出"), Income("収入") }

val expenseCategories = listOf("食費", "住居費", "交通費", "日用品", "娯楽", "その他")
val incomeCategories = listOf("給与", "副収入", "その他")

data class Entry(
    val id: Long = 0,
    val date: LocalDate,
    val amount: Long,
    val kind: Kind,
    val category: String,
    val note: String,
)

data class CategoryTotal(val name: String, val amount: Long)

data class MonthData(val month: YearMonth, val entries: List<Entry>, val balance: Long, val hasEntries: Boolean) {
    val breakdown = entries.groupingBy(Entry::kind).fold(
        initialValueSelector = { _, _ -> mutableMapOf<String, Long>() },
        operation = { _, categories, entry ->
            categories.apply { merge(entry.category, entry.amount, Long::plus) }
        },
    ).mapValues { (_, categories) ->
        categories.map { (name, value) -> CategoryTotal(name, value) }
            .sortedWith(compareByDescending<CategoryTotal> { it.amount }.thenBy { it.name })
    }
    val income = breakdown[Kind.Income].orEmpty().sumOf(CategoryTotal::amount)
    val expense = breakdown[Kind.Expense].orEmpty().sumOf(CategoryTotal::amount)
}

fun yen(amount: Long): String =
    (if (amount < 0) "−¥" else "¥") + NumberFormat.getIntegerInstance(Locale.JAPAN)
        .format(if (amount < 0) -amount else amount)

private class LedgerDatabase(context: Context) : SQLiteOpenHelper(context, "mane-kotlin.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE entries (
            id INTEGER PRIMARY KEY, date TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0),
            kind TEXT NOT NULL, category TEXT NOT NULL, note TEXT NOT NULL
            )""",
        )
        db.execSQL("CREATE INDEX entries_date_id ON entries(date DESC, id DESC)")
        db.execSQL("CREATE TABLE totals (balance INTEGER NOT NULL, entry_count INTEGER NOT NULL)")
        db.execSQL("INSERT INTO totals VALUES(0,0)")
        val added = "CASE WHEN new.kind = 'Income' THEN new.amount ELSE -new.amount END"
        val removed = "CASE WHEN old.kind = 'Income' THEN old.amount ELSE -old.amount END"
        db.execSQL("CREATE TRIGGER entry_insert AFTER INSERT ON entries BEGIN UPDATE totals SET balance = balance + ($added), entry_count = entry_count + 1; END")
        db.execSQL("CREATE TRIGGER entry_update AFTER UPDATE ON entries BEGIN UPDATE totals SET balance = balance + ($added) - ($removed); END")
        db.execSQL("CREATE TRIGGER entry_delete AFTER DELETE ON entries BEGIN UPDATE totals SET balance = balance - ($removed), entry_count = entry_count - 1; END")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) =
        error("Database migration is missing")

    fun read(month: YearMonth): MonthData {
        val db = readableDatabase
        val start = month.atDay(1).toString()
        val end = month.plusMonths(1).atDay(1).toString()
        val entries = db.rawQuery(
            "SELECT id,date,amount,kind,category,note FROM entries WHERE date >= ? AND date < ? ORDER BY date DESC, id DESC",
            arrayOf(start, end),
        ).use { rows ->
            buildList {
                while (rows.moveToNext()) {
                    add(Entry(rows.getLong(0), LocalDate.parse(rows.getString(1)), rows.getLong(2),
                        Kind.valueOf(rows.getString(3)), rows.getString(4), rows.getString(5)))
                }
            }
        }
        return db.rawQuery("SELECT balance, entry_count FROM totals", null).use { totals ->
            check(totals.moveToFirst())
            MonthData(month, entries, totals.getLong(0), totals.getInt(1) > 0)
        }
    }

    fun write(entry: Entry) {
        val db = writableDatabase
        val values = ContentValues().apply {
            put("date", entry.date.toString())
            put("amount", entry.amount)
            put("kind", entry.kind.name)
            put("category", entry.category)
            put("note", entry.note)
        }
        if (entry.id == 0L) db.insertOrThrow("entries", null, values)
        else check(db.update("entries", values, "id = ?", arrayOf(entry.id.toString())) == 1)
    }

    fun delete(id: Long) {
        check(writableDatabase.delete("entries", "id = ?", arrayOf(id.toString())) == 1)
    }

    fun seed(month: YearMonth) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            val empty = db.rawQuery("SELECT 1 FROM entries LIMIT 1", null).use { !it.moveToFirst() }
            check(empty)
            val entries = listOf(
                Entry(date = month.atDay(18), kind = Kind.Expense, amount = 4280, category = "食費", note = "週末の買い出し"),
                Entry(date = month.atDay(17), kind = Kind.Expense, amount = 780, category = "交通費", note = "電車"),
                Entry(date = month.atDay(16), kind = Kind.Expense, amount = 3200, category = "娯楽", note = "本と映画"),
                Entry(date = month.atDay(15), kind = Kind.Income, amount = 328400, category = "給与", note = "給与"),
                Entry(date = month.atDay(11), kind = Kind.Expense, amount = 8600, category = "食費", note = "食品・飲料"),
                Entry(date = month.atDay(10), kind = Kind.Income, amount = 42000, category = "副収入", note = "制作費"),
                Entry(date = month.atDay(5), kind = Kind.Expense, amount = 88000, category = "住居費", note = "家賃"),
                Entry(date = month.atDay(4), kind = Kind.Expense, amount = 3950, category = "日用品", note = "日用品"),
            )
            entries.forEach(::write)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }
}

data class LedgerState(val data: MonthData? = null, val failed: Boolean = false)

@OptIn(ExperimentalCoroutinesApi::class)
class LedgerModel(application: Application) : AndroidViewModel(application) {
    private val db = LedgerDatabase(application)
    private val preferences = application.getSharedPreferences("display", Context.MODE_PRIVATE)
    val hideBalance = MutableStateFlow<Boolean?>(null)
    private val revision = MutableStateFlow(0L)
    val month = MutableStateFlow(YearMonth.now())
    val saving = MutableStateFlow(false)
    val message = MutableStateFlow<String?>(null)
    val state = combine(month, revision) { selection, _ -> selection }
        .mapLatest { selection ->
            try {
                LedgerState(withContext(Dispatchers.IO) { db.read(selection) })
            } catch (_: SQLException) {
                LedgerState(failed = true)
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), LedgerState())

    init {
        viewModelScope.launch {
            hideBalance.value = withContext(Dispatchers.IO) {
                preferences.getBoolean("hide_balance", false)
            }
        }
    }

    fun setHideBalance(hidden: Boolean) {
        if (hideBalance.value == null) return
        preferences.edit().putBoolean("hide_balance", hidden).apply()
        hideBalance.value = hidden
    }

    fun retry() {
        revision.update { it + 1 }
    }

    fun save(entry: Entry, onSaved: () -> Unit) = mutate({ db.write(entry) }, onSaved)
    fun delete(id: Long, onSaved: () -> Unit) = mutate({ db.delete(id) }, onSaved)
    fun seed() {
        val selected = month.value
        mutate({ db.seed(selected) }, {})
    }

    private fun mutate(action: () -> Unit, onSaved: () -> Unit) {
        if (saving.value) return
        saving.value = true
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { action() }
                retry()
                onSaved()
            } catch (_: SQLException) {
                message.value = "保存できませんでした"
            } catch (_: IllegalStateException) {
                message.value = "データが変更されたため操作を完了できませんでした"
            } finally {
                saving.value = false
            }
        }
    }

    override fun onCleared() {
        db.close()
        super.onCleared()
    }
}
