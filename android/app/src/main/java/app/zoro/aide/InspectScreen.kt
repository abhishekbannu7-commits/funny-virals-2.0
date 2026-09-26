package app.zoro.aide

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel

@Composable
fun InspectScreen(model: InspectModel = viewModel()) {
    val state by model.state.collectAsState()
    var query by remember { mutableStateOf("") }
    val tree = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri: Uri? ->
        if (uri != null) model.openTree(uri)
    }
    val files = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) model.openFiles(uris)
    }
    val q = query.trim().lowercase()
    val shownFiles = state.files.filter { q.isEmpty() || it.name.lowercase().contains(q) }
    val shownFindings = state.findings.filter { q.isEmpty() || "${it.file} ${it.detail}".lowercase().contains(q) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp, vertical = 28.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("AIDE", fontSize = 12.sp, letterSpacing = 2.sp, color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Zoro", fontFamily = FontFamily.Serif, fontSize = 36.sp)
        Text("No external request.", color = androidx.compose.material3.MaterialTheme.colorScheme.onSurface)
        Text(
            "Pick a folder or files. Zoro reads them on this device. This app has no network permission, no terminal, and no control of other apps.",
            color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { tree.launch(null) }, colors = ButtonDefaults.buttonColors()) {
                Text("Choose folder")
            }
            OutlinedButton(onClick = { files.launch(arrayOf("*/*")) }) {
                Text("Choose files")
            }
        }
        if (state.remembered != null && state.files.isEmpty() && !state.reading) {
            OutlinedButton(onClick = { model.openLast() }) {
                Text("Open ${state.remembered}")
            }
        }
        Text(if (state.reading) "Reading on this device." else state.note)
        state.error?.let { Text(it) }
        if (state.files.isNotEmpty() || state.findings.isNotEmpty() || state.skipped.isNotEmpty()) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Search these files") },
                singleLine = true,
            )
            BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
                if (maxWidth > 600.dp) {
                    Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        FileList(shownFiles, Modifier.weight(1f))
                        FindingList(shownFindings, state.skipped, Modifier.weight(1f))
                    }
                } else {
                    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        FileList(shownFiles, Modifier.weight(1f))
                        FindingList(shownFindings, state.skipped, Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun FileList(files: List<app.zoro.aide.inspect.InspectFile>, modifier: Modifier) {
    Column(modifier.fillMaxSize()) {
        Text("Files")
        LazyColumn(Modifier.weight(1f)) {
            itemsIndexed(files) { _, file ->
                Text("${file.name} · ${file.lines} lines", modifier = Modifier.padding(vertical = 6.dp))
            }
            if (files.isEmpty()) {
                item { Text("No text files in that pick.") }
            }
        }
    }
}

@Composable
private fun FindingList(findings: List<app.zoro.aide.inspect.Finding>, skipped: List<String>, modifier: Modifier) {
    Column(modifier.fillMaxSize()) {
        Text("Notes")
        LazyColumn(Modifier.weight(1f)) {
            itemsIndexed(findings) { _, item ->
                Text("${item.kind} · ${item.file}:${item.line} · ${item.detail}", modifier = Modifier.padding(vertical = 6.dp))
            }
            if (findings.isEmpty()) {
                item { Text("No secret-like lines, debugger statements, empty catches, or TODO marks in the text that was read. This is not a build or a test run.") }
            }
            if (skipped.isNotEmpty()) {
                item { Text("Skipped: ${skipped.take(8).joinToString(", ")}", modifier = Modifier.padding(top = 8.dp)) }
            }
        }
    }
}
