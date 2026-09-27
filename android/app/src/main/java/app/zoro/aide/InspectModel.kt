package app.zoro.aide

import android.app.Application
import android.content.Intent
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.zoro.aide.data.FolderMemory
import app.zoro.aide.files.readDocuments
import app.zoro.aide.files.readTree
import app.zoro.aide.files.writeText
import app.zoro.aide.inspect.SourceFile
import app.zoro.aide.inspect.explain
import app.zoro.aide.inspect.inspectTexts
import app.zoro.aide.inspect.orderOf
import app.zoro.aide.inspect.Order
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

data class PendingEdit(
    val file: String,
    val uri: String,
    val from: String,
    val to: String,
    val count: Int,
    val next: String,
)

data class InspectUi(
    val say: String = "I'm here. Say scan a file, scan these files, or scan the folder.",
    val reading: Boolean = false,
    val ask: String? = null,
    val askId: Int = 0,
    val pending: PendingEdit? = null,
    val canAgain: Boolean = false,
    val speak: Boolean = false,
)

class InspectModel(app: Application) : AndroidViewModel(app) {
    private val memory = FolderMemory(app)
    private val _state = MutableStateFlow(InspectUi())
    val state = _state.asStateFlow()
    private var sources = emptyList<SourceFile>()

    init {
        viewModelScope.launch {
            val saved = memory.saved.first() ?: return@launch
            val uris = if (saved.mode == "files") saved.uri.split('\n') else listOf(saved.uri)
            val granted = uris.all { uri ->
                app.contentResolver.persistedUriPermissions.any { it.uri == Uri.parse(uri) && it.isReadPermission }
            }
            if (granted) _state.value = _state.value.copy(canAgain = true, say = "I'm here. Say scan again to reread ${saved.label}.")
        }
    }

    fun heard(text: String) {
        when (val order = orderOf(text)) {
            Order.PickFiles -> _state.value = _state.value.copy(ask = "files", askId = _state.value.askId + 1, speak = true, say = "Pick the files. I only read what you choose.")
            Order.PickFolder -> _state.value = _state.value.copy(ask = "folder", askId = _state.value.askId + 1, speak = true, say = "Pick the folder. I only read what you choose.")
            Order.Again -> scanAgain()
            Order.Explain -> _state.value = _state.value.copy(speak = true, say = if (sources.isEmpty()) "I have not read anything yet. Say scan a file." else explain(inspectTexts(sources)))
            Order.Write -> writePending()
            is Order.Replace -> propose(order.from, order.to, order.file)
            Order.Unknown -> _state.value = _state.value.copy(speak = true, say = "Say scan a file, scan again, what did you find, or replace old text with new text in a file. I still cannot build a project or control other apps.")
        }
    }

    fun clearAsk() {
        _state.value = _state.value.copy(ask = null)
    }

    fun openTree(uri: Uri) {
        val app = getApplication<Application>()
        val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        runCatching { app.contentResolver.takePersistableUriPermission(uri, flags) }
        read {
            val batch = readTree(app, uri)
            memory.saveTree(uri.toString(), batch.label)
            batch.files to (batch.unread)
        }
    }

    fun openFiles(uris: List<Uri>) {
        val app = getApplication<Application>()
        val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        uris.forEach { uri -> runCatching { app.contentResolver.takePersistableUriPermission(uri, flags) } }
        read {
            val batch = readDocuments(app, uris)
            memory.saveFiles(uris.map { it.toString() }, batch.label)
            batch.files to batch.unread
        }
    }

    private fun scanAgain() {
        viewModelScope.launch {
            val saved = memory.saved.first()
            if (saved == null) {
                _state.value = _state.value.copy(say = "I have nothing to reread. Say scan a file.", speak = true)
                return@launch
            }
            if (saved.mode == "tree") openTree(Uri.parse(saved.uri))
            else openFiles(saved.uri.split('\n').filter { it.isNotBlank() }.map(Uri::parse))
        }
    }

    private fun propose(from: String, to: String, file: String?) {
        val matches = sources.filter { file == null || it.name.endsWith(file, ignoreCase = true) || it.name.equals(file, ignoreCase = true) }
        val target = when {
            matches.size == 1 -> matches[0]
            file == null && sources.size == 1 -> sources[0]
            else -> null
        }
        if (target == null || target.uri.isBlank()) {
            _state.value = _state.value.copy(say = "Name one file I already read. Example: replace old with new in notes.txt.", speak = true)
            return
        }
        val count = target.text.split(from).size - 1
        if (count <= 0) {
            _state.value = _state.value.copy(say = "I did not find that text in ${target.name}.", speak = true)
            return
        }
        val pending = PendingEdit(target.name, target.uri, from, to, count, target.text.replace(from, to))
        _state.value = _state.value.copy(pending = pending, speak = true, say = "I can change $count place${if (count == 1) "" else "s"} in ${target.name}. Say write it. Nothing is changed yet.")
    }

    private fun writePending() {
        val pending = _state.value.pending
        if (pending == null) {
            _state.value = _state.value.copy(say = "There is no edit waiting. Say replace old text with new text in a file.", speak = true)
            return
        }
        viewModelScope.launch {
            val say = try {
                writeText(getApplication(), Uri.parse(pending.uri), pending.next)
                sources = sources.map { if (it.uri == pending.uri) it.copy(text = pending.next) else it }
                "Wrote ${pending.count} change${if (pending.count == 1) "" else "s"} in ${pending.file}. That is the file on this phone, not a build."
            } catch (_: Exception) {
                "Android did not let me write ${pending.file}. Pick the folder again, then say the replace once more."
            }
            _state.value = _state.value.copy(pending = null, speak = true, say = say)
        }
    }

    private fun read(block: suspend () -> Pair<List<SourceFile>, List<String>>) {
        viewModelScope.launch {
            _state.value = _state.value.copy(reading = true, ask = null, pending = null, say = "Reading on this phone.")
            val next = try {
                val (files, unread) = block()
                sources = files
                val report = inspectTexts(files)
                val extra = if (unread.isEmpty()) report else report.copy(skipped = report.skipped + unread)
                _state.value.copy(reading = false, canAgain = true, speak = true, say = explain(extra) + " Say scan again to reread, or replace text in a file.")
            } catch (cancelled: kotlinx.coroutines.CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                _state.value.copy(reading = false, speak = true, say = "Android only shares what you pick. I could not read that.")
            }
            _state.value = next
        }
    }
}
