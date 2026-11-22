package com.disnana.manechan.kotlinpreview

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.LocalDate
import java.time.YearMonth

class MainActivity : ComponentActivity() {
    private val ledger: LedgerModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { ManeTheme { LedgerApp(ledger) } }
    }
}

private val light = lightColorScheme(
    primary = Color(0xFF145D4C), onPrimary = Color.White,
    primaryContainer = Color(0xFFC1EDDC), onPrimaryContainer = Color(0xFF113C30),
    surface = Color(0xFFFAF9F4), background = Color(0xFFFAF9F4),
    surfaceContainer = Color(0xFFECEEE6), onSurface = Color(0xFF1A211C),
    onSurfaceVariant = Color(0xFF48544D), outlineVariant = Color(0xFFD4DCD2),
)
private val dark = darkColorScheme(
    primary = Color(0xFFA3DECA), onPrimary = Color(0xFF10362A),
    primaryContainer = Color(0xFF245448), onPrimaryContainer = Color(0xFFC1EDDC),
    surface = Color(0xFF181F1C), background = Color(0xFF181F1C),
    surfaceContainer = Color(0xFF252E29), onSurface = Color(0xFFE7EEE7),
    onSurfaceVariant = Color(0xFFB9C6BD), outlineVariant = Color(0xFF415147),
)

@Composable
private fun ManeTheme(content: @Composable () -> Unit) {
    val context = LocalContext.current
    val colors = when {
        isSystemInDarkTheme() -> dark
        else -> light
    }
    val responsiveColors = if (android.os.Build.VERSION.SDK_INT >= 31) {
        val system = if (isSystemInDarkTheme()) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        colors.copy(secondaryContainer = system.secondaryContainer, onSecondaryContainer = system.onSecondaryContainer)
    } else colors.copy(secondaryContainer = colors.primaryContainer, onSecondaryContainer = colors.onPrimaryContainer)
    MaterialTheme(colorScheme = responsiveColors, content = content)
}

private enum class Destination(val label: String) { Home("ホーム"), Transactions("取引"), Analytics("分析") }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LedgerApp(model: LedgerModel) {
    val state by model.state.collectAsStateWithLifecycle()
    val selectedMonth by model.month.collectAsStateWithLifecycle()
    val saving by model.saving.collectAsStateWithLifecycle()
    val message by model.message.collectAsStateWithLifecycle()
    var destination by rememberSaveable { mutableStateOf(Destination.Home) }
    var editorId by rememberSaveable { mutableStateOf<Long?>(null) }
    var settings by rememberSaveable { mutableStateOf(false) }
    val hideBalance by model.hideBalance.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val data = state.data
    val showingEditor = editorId != null
    val title = when {
        showingEditor -> if (editorId == 0L) "取引を記録" else "取引を編集"
        settings -> "設定"
        destination == Destination.Home -> "マネーちゃん"
        else -> destination.label
    }

    LaunchedEffect(message) {
        message?.let { snackbar.showSnackbar(it); model.message.value = null }
    }

    BackHandler(showingEditor || settings || destination != Destination.Home) {
        if (!saving) when {
            showingEditor -> editorId = null
            settings -> settings = false
            else -> destination = Destination.Home
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title, fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    if (showingEditor || settings) {
                        IconButton(enabled = !saving, onClick = { if (showingEditor) editorId = null else settings = false }) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "戻る")
                        }
                    }
                },
                actions = {
                    if (!showingEditor && !settings) {
                        IconButton(onClick = { settings = true }) {
                            Icon(Icons.Default.Settings, contentDescription = "設定")
                        }
                    }
                },
            )
        },
        bottomBar = {
            if (!showingEditor && !settings) {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainer) {
                    Destination.entries.forEach { item ->
                        NavigationBarItem(
                            selected = destination == item,
                            onClick = { destination = item },
                            label = { Text(item.label) },
                            icon = {
                                when (item) {
                                    Destination.Home -> Icon(Icons.Default.Home, null)
                                    Destination.Transactions -> Icon(Icons.AutoMirrored.Filled.List, null)
                                    Destination.Analytics -> AnalysisIcon()
                                }
                            },
                        )
                    }
                }
            }
        },
        floatingActionButton = {
            if (!showingEditor && !settings) {
                ExtendedFloatingActionButton(
                    modifier = Modifier.semantics { contentDescription = "取引を記録" },
                    text = { Text("記録", fontWeight = FontWeight.Bold) },
                    icon = { Icon(Icons.Default.Add, null) },
                    onClick = { if (!saving) editorId = 0L },
                )
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { insets ->
        Box(
            Modifier.fillMaxSize().padding(insets).consumeWindowInsets(insets),
            contentAlignment = Alignment.TopCenter,
        ) {
            Box(Modifier.widthIn(max = 640.dp).fillMaxWidth()) {
                when {
                    showingEditor -> {
                        val entry = data?.entries?.find { it.id == editorId }
                        if (editorId == 0L || entry != null) key(editorId) {
                            EntryEditor(
                                entry = entry,
                                selectedMonth = selectedMonth,
                                busy = saving,
                                onSave = { edited ->
                                    model.save(edited) {
                                        model.month.value = YearMonth.from(edited.date)
                                        editorId = null
                                        destination = Destination.Transactions
                                    }
                                },
                                onDelete = { id -> model.delete(id) { editorId = null } },
                            )
                        }
                    }
                    settings -> SettingsPage(
                        hideBalance = hideBalance != false,
                        onHideBalance = model::setHideBalance,
                        canSeed = data?.hasEntries == false && !saving,
                        onSeed = { model.seed(); settings = false; destination = Destination.Home },
                    )
                    state.failed -> Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("取引データを読み込めませんでした")
                        Button(onClick = model::retry) { Text("再試行") }
                    }
                    data == null -> Box(Modifier.fillMaxWidth().padding(28.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(Modifier.size(28.dp))
                    }
                    else -> key(destination) {
                        LedgerPage(
                            data = data,
                            destination = destination,
                            hideBalance = hideBalance != false,
                            onToggleBalance = { model.setHideBalance(hideBalance == false) },
                            onMonth = { model.month.value = it },
                            onTransactions = { destination = Destination.Transactions },
                            onNew = { editorId = 0L },
                            onEdit = { editorId = it.id },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AnalysisIcon() {
    val color = LocalContentColor.current
    Canvas(Modifier.size(24.dp)) {
        val width = 4.dp.toPx()
        for ((index, fraction) in listOf(.42f, .75f, .58f).withIndex()) {
            val height = size.height * fraction
            drawRoundRect(color, Offset((4 + index * 6).dp.toPx(), size.height - height - 2.dp.toPx()),
                Size(width, height), androidx.compose.ui.geometry.CornerRadius(width / 2))
        }
    }
}

@Composable
private fun LedgerPage(
    data: MonthData,
    destination: Destination,
    hideBalance: Boolean,
    onToggleBalance: () -> Unit,
    onMonth: (YearMonth) -> Unit,
    onTransactions: () -> Unit,
    onNew: () -> Unit,
    onEdit: (Entry) -> Unit,
) {
    var filter by rememberSaveable { mutableStateOf<Kind?>(null) }
    var breakdown by rememberSaveable { mutableStateOf(Kind.Expense) }
    val visible = remember(data, filter, destination) {
        when {
            destination == Destination.Home -> data.entries.take(4)
            filter == null -> data.entries
            else -> data.entries.filter { it.kind == filter }
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp),
        contentPadding = PaddingValues(top = 4.dp, bottom = 94.dp),
    ) {
        item("period") { MonthControl(data.month, onMonth) }
        when (destination) {
            Destination.Home -> {
                item("overview") { HomeSummary(data, hideBalance, onToggleBalance) }
                item("recent") {
                    Row(Modifier.fillMaxWidth().padding(top = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("最近の取引", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                        TextButton(onClick = onTransactions) { Text("すべて見る") }
                    }
                }
            }
            Destination.Transactions -> item("filters") {
                Row(Modifier.fillMaxWidth().padding(bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(null, Kind.Expense, Kind.Income).forEach { kind ->
                        FilterChip(selected = filter == kind, onClick = { filter = kind }, label = { Text(kind?.label ?: "すべて") })
                    }
                }
            }
            Destination.Analytics -> {
                val rows = data.breakdown[breakdown].orEmpty()
                val total = if (breakdown == Kind.Expense) data.expense else data.income
                item("analysis-selector") {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Kind.entries.forEach { kind ->
                            FilterChip(selected = kind == breakdown, onClick = { breakdown = kind }, label = { Text("${kind.label}内訳") })
                        }
                    }
                }
                if (rows.isEmpty()) item("analysis-empty") {
                    EmptyEntries("この月の${breakdown.label}はありません", onNew)
                } else {
                    item("donut") { BreakdownChart(breakdown, rows, total) }
                    itemsIndexed(rows, key = { _, row -> row.name }) { index, row ->
                        val color = chartColors[index % chartColors.size]
                        CategoryRow(row, total, color)
                    }
                }
            }
        }
        if (destination != Destination.Analytics) {
            if (visible.isEmpty()) item("empty") {
                EmptyEntries("表示する取引がありません", onNew)
            }
            items(visible, key = { it.id }, contentType = { "entry" }) { entry -> EntryRow(entry, onEdit) }
        }
    }
}

@Composable
private fun MonthControl(month: YearMonth, change: (YearMonth) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = { change(month.minusMonths(1)) }) { Text("‹ 前月") }
        Text("${month.year}年${month.monthValue}月", modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        TextButton(onClick = { change(month.plusMonths(1)) }) { Text("翌月 ›") }
    }
}

@Composable
private fun HomeSummary(data: MonthData, hidden: Boolean, toggle: () -> Unit) {
    Column {
        Column(
            Modifier.fillMaxWidth().background(
                Brush.linearGradient(listOf(Color(0xFF153C32), Color(0xFF296650))),
                RoundedCornerShape(26.dp),
            ).padding(horizontal = 22.dp, vertical = 16.dp),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("記録上の残高", Modifier.weight(1f), style = MaterialTheme.typography.titleSmall, color = Color(0xFFD8EFE1))
                TextButton(onClick = toggle, colors = ButtonDefaults.textButtonColors(contentColor = Color(0xFFD8EFE1))) {
                    Text(if (hidden) "表示" else "非表示")
                }
            }
            Text(if (hidden) "¥・・・・・・" else yen(data.balance), color = Color.White,
                style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(10.dp))
        }
        Text("今月の収支", Modifier.padding(top = 20.dp, bottom = 10.dp),
            style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CashAmount("収入", data.income, Modifier.weight(1f))
            CashAmount("支出", data.expense, Modifier.weight(1f))
            CashAmount("差引", data.income - data.expense, Modifier.weight(1f))
        }
        HorizontalDivider(Modifier.padding(top = 18.dp))
    }
}

@Composable
private fun CashAmount(label: String, amount: Long, modifier: Modifier) {
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(yen(amount), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun EntryRow(entry: Entry, open: (Entry) -> Unit) {
    Column(Modifier.fillMaxWidth().clickable { open(entry) }) {
        Row(Modifier.fillMaxWidth().heightIn(min = 62.dp), verticalAlignment = Alignment.CenterVertically) {
            val palette = MaterialTheme.colorScheme
            Box(
                Modifier.size(40.dp).background(palette.surfaceContainer, RoundedCornerShape(14.dp)),
                contentAlignment = Alignment.Center,
            ) { Text(if (entry.kind == Kind.Income) "↗" else "↘", color = palette.primary, fontWeight = FontWeight.Bold) }
            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                Text(entry.note.ifBlank { entry.category }, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.SemiBold)
                Text("${entry.date.monthValue}/${entry.date.dayOfMonth} · ${entry.category}", style = MaterialTheme.typography.bodySmall,
                    color = palette.onSurfaceVariant)
            }
            Text((if (entry.kind == Kind.Income) "+" else "−") + yen(entry.amount),
                style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
        }
        HorizontalDivider()
    }
}

@Composable
private fun EmptyEntries(message: String, onNew: () -> Unit) {
    Column(Modifier.padding(vertical = 22.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant)
        TextButton(onClick = onNew) { Text("取引を記録") }
    }
}

private val chartColors = listOf(Color(0xFF43A389), Color(0xFFE78261), Color(0xFF608BC4), Color(0xFFAB77AB), Color(0xFFC69A49), Color(0xFF82B2B2))

@Composable
private fun BreakdownChart(kind: Kind, rows: List<CategoryTotal>, total: Long) {
    Box(Modifier.fillMaxWidth().padding(vertical = 18.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(172.dp)) {
            val thickness = 22.dp.toPx()
            val bounds = Size(size.width - thickness, size.height - thickness)
            var start = -90f
            rows.forEachIndexed { index, row ->
                val sweep = (360.0 * row.amount / total).toFloat()
                val gap = if (rows.size == 1) 0f else minOf(sweep / 5f, 2f)
                drawArc(chartColors[index % chartColors.size], start + gap / 2, sweep - gap, false,
                    Offset(thickness / 2, thickness / 2), bounds, style = Stroke(thickness))
                start += sweep
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("${kind.label}合計", style = MaterialTheme.typography.labelMedium)
            Text(yen(total), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun CategoryRow(row: CategoryTotal, total: Long, color: Color) {
    val fraction = row.amount.toDouble() / total
    Column(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(9.dp).background(color, RoundedCornerShape(5.dp)))
            Text(row.name, Modifier.weight(1f).padding(start = 8.dp), fontWeight = FontWeight.SemiBold)
            Text(yen(row.amount), fontWeight = FontWeight.SemiBold)
            Text("${(fraction * 100 + 0.5).toInt()}%", Modifier.width(50.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End,
                style = MaterialTheme.typography.labelMedium)
        }
        LinearProgressIndicator(progress = { fraction.toFloat() }, modifier = Modifier.fillMaxWidth().height(6.dp),
            color = color, trackColor = MaterialTheme.colorScheme.surfaceContainer, gapSize = 0.dp,
            drawStopIndicator = {})
    }
}

@Composable
private fun SettingsPage(hideBalance: Boolean, onHideBalance: (Boolean) -> Unit, canSeed: Boolean, onSeed: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp)) {
        Text("表示", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        ListItem(headlineContent = { Text("ホームの残高を隠す") },
            trailingContent = { Switch(checked = hideBalance, onCheckedChange = onHideBalance,
                modifier = Modifier.padding(start = 8.dp)) })
        HorizontalDivider(Modifier.padding(vertical = 10.dp))
        Text("データ", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        ListItem(
            headlineContent = { Text("端末内保存") },
            supportingContent = { Text("取引はこの試作アプリに保存されます") },
        )
        if (canSeed) OutlinedButton(onClick = onSeed) { Text("サンプルデータを読み込む") }
    }
}
