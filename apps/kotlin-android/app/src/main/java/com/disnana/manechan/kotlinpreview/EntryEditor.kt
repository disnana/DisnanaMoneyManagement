package com.disnana.manechan.kotlinpreview

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusManager
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneOffset

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun EntryEditor(
    entry: Entry?,
    selectedMonth: YearMonth,
    busy: Boolean,
    onSave: (Entry) -> Unit,
    onDelete: (Long) -> Unit,
) {
    var kind by rememberSaveable { mutableStateOf(entry?.kind ?: Kind.Expense) }
    var amount by rememberSaveable { mutableStateOf(entry?.amount?.toString().orEmpty()) }
    var category by rememberSaveable { mutableStateOf(entry?.category ?: expenseCategories.first()) }
    var note by rememberSaveable { mutableStateOf(entry?.note.orEmpty()) }
    val initialDate = entry?.date ?: if (selectedMonth == YearMonth.now()) LocalDate.now() else selectedMonth.atDay(1)
    var day by rememberSaveable { mutableLongStateOf(initialDate.toEpochDay()) }
    val date = LocalDate.ofEpochDay(day)
    var selectingDate by rememberSaveable { mutableStateOf(false) }
    var confirmDelete by rememberSaveable { mutableStateOf(false) }
    val categories = if (kind == Kind.Expense) expenseCategories else incomeCategories
    val yen = amount.toLongOrNull()
    val canSave = yen != null && yen > 0 && !busy
    val focus: FocusManager = LocalFocusManager.current

    Column(
        Modifier.fillMaxSize().imePadding().padding(horizontal = 20.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                Kind.entries.forEachIndexed { index, option ->
                    SegmentedButton(
                        selected = kind == option,
                        onClick = {
                            if (kind != option) {
                                kind = option
                                category = if (kind == Kind.Expense) expenseCategories.first() else incomeCategories.first()
                            }
                        },
                        shape = SegmentedButtonDefaults.itemShape(index = index, count = Kind.entries.size),
                    ) { Text(option.label) }
                }
            }
            OutlinedTextField(
                value = amount,
                onValueChange = { value -> amount = value.mapNotNull { it.digitToIntOrNull() }.joinToString("").take(9) },
                modifier = Modifier.fillMaxWidth(),
                leadingIcon = { Text("¥", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) },
                label = { Text("金額") },
                textStyle = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            )
            OutlinedButton(onClick = { focus.clearFocus(); selectingDate = true }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Default.DateRange, null)
                Spacer(Modifier.width(8.dp))
                Text("${date.year}年${date.monthValue}月${date.dayOfMonth}日")
            }
            Text("カテゴリ", style = MaterialTheme.typography.titleSmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                categories.forEach { item ->
                    FilterChip(selected = category == item, onClick = { category = item }, label = { Text(item) })
                }
            }
            OutlinedTextField(
                value = note,
                onValueChange = { note = it.take(120) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("メモ（任意）") },
                minLines = 2,
                maxLines = 3,
            )
            if (entry != null) {
                TextButton(enabled = !busy, onClick = { confirmDelete = true }) {
                    Text("取引を削除", color = MaterialTheme.colorScheme.error)
                }
            }
        }
        Button(
            modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
            enabled = canSave,
            onClick = {
                if (yen != null && yen > 0) {
                    focus.clearFocus()
                    onSave(Entry(entry?.id ?: 0, date, yen, kind, category, note.trim()))
                }
            },
        ) { Text(if (entry == null) "${kind.label}を記録" else "変更を保存") }
    }

    if (selectingDate) {
        val dateState = rememberDatePickerState(
            initialSelectedDateMillis = date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { selectingDate = false },
            confirmButton = {
                TextButton(enabled = dateState.selectedDateMillis != null, onClick = {
                    dateState.selectedDateMillis?.let {
                        day = Instant.ofEpochMilli(it).atOffset(ZoneOffset.UTC).toLocalDate().toEpochDay()
                    }
                    selectingDate = false
                }) { Text("適用") }
            },
            dismissButton = { TextButton(onClick = { selectingDate = false }) { Text("キャンセル") } },
        ) { DatePicker(state = dateState) }
    }
    if (confirmDelete && entry != null) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("取引を削除しますか？") },
            confirmButton = {
                TextButton(onClick = { confirmDelete = false; onDelete(entry.id) }) {
                    Text("削除", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("キャンセル") } },
        )
    }
}
