package app.zoro.aide

import android.app.Application
import android.content.Intent
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.zoro.aide.data.FolderMemory
import app.zoro.aide.files.readDocuments
import app.zoro.aide.files.readTree
import app.zoro.aide.inspect.Finding
import app.zoro.aide.inspect.InspectFile
import app.zoro.aide.inspect.inspectTexts
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

data class InspectUi(
    val folderLabel: String? = null,
    val files: List<InspectFile> = emptyList(),
    val findings: List<Finding> = emptyList(),
    val skipped: List<String> = emptyList(),
    val bytes: Int = 0,
    val reading: Boolean = false,
    val note: String = "No files read. Nothing has left this device.",
    val remembered: String? = null,
    val error: String? = null,
)

class InspectModel(app: Application) : AndroidViewModel(app) {
    private val memory = FolderMemory(app)
    private val _state = MutableStateFlow(InspectUi())
    val state = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val saved = memory.folder.first() ?: return@launch
            val uri = Uri.parse(saved.uri)
            val stillGranted = app.contentResolver.persistedUriPermissions.any { it.uri == uri && it.isReadPermission }
            if (stillGranted) {
                _state.value = _state.value.copy(remembered = saved.label)
            }
        }
    }

    fun openTree(uri: Uri) {
        val app = getApplication<Application>()
        val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION
        runCatching { app.contentResolver.takePersistableUriPermission(uri, flags) }
        read("Reading the folder on this device.") {
            val batch = readTree(app, uri)
            memory.save(uri.toString(), batch.label)
            batch
        }
    }

    fun openLast() {
        viewModelScope.launch {
            val saved = memory.folder.first() ?: return@launch
            openTree(Uri.parse(saved.uri))
        }
    }

    fun openFiles(uris: List<Uri>) {
        val app = getApplication<Application>()
        read("Reading the files on this device.") {
            readDocuments(app, uris)
        }
    }

    private fun read(start: String, block: suspend () -> app.zoro.aide.files.ReadBatch) {
        viewModelScope.launch {
            _state.value = _state.value.copy(reading = true, note = start, error = null)
            val next = try {
                val batch = block()
                val report = inspectTexts(batch.files)
                _state.value.copy(
                    folderLabel = batch.label,
                    files = report.files,
                    findings = report.findings,
                    skipped = report.skipped + batch.unread,
                    bytes = report.bytes,
                    reading = false,
                    remembered = batch.label,
                    note = "Read ${report.files.size} files, ${report.bytes} characters, on this device. Sent 0 bytes. No app was opened. No compiler ran.",
                )
            } catch (cancelled: kotlinx.coroutines.CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                _state.value.copy(
                    reading = false,
                    error = "This folder could not be read. Android only shares what you pick.",
                    note = "No external request.",
                )
            }
            _state.value = next
        }
    }
}
