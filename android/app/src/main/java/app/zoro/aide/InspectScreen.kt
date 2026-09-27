package app.zoro.aide

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import java.util.Locale

private class Pick(private val tree: Boolean) : ActivityResultContract<Unit, List<Uri>>() {
    override fun createIntent(context: Context, input: Unit): Intent {
        val intent = if (tree) {
            Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
        } else {
            Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*").putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        }
        return intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION or
                Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION,
        )
    }

    override fun parseResult(resultCode: Int, intent: Intent?): List<Uri> {
        if (resultCode != Activity.RESULT_OK || intent == null) return emptyList()
        intent.data?.let { return listOf(it) }
        val clip = intent.clipData ?: return emptyList()
        return (0 until clip.itemCount).map { clip.getItemAt(it).uri }
    }
}

@Composable
fun InspectScreen(model: InspectModel = viewModel()) {
    val state by model.state.collectAsState()
    val context = LocalContext.current
    var command by remember { mutableStateOf("") }
    var listening by remember { mutableStateOf(false) }
    val files = rememberLauncherForActivityResult(Pick(false)) { uris ->
        model.clearAsk()
        if (uris.isNotEmpty()) model.openFiles(uris)
    }
    val folder = rememberLauncherForActivityResult(Pick(true)) { uris ->
        model.clearAsk()
        uris.firstOrNull()?.let(model::openTree)
    }
    val mic = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) listening = true
    }
    val recognizer = remember {
        if (SpeechRecognizer.isRecognitionAvailable(context)) SpeechRecognizer.createSpeechRecognizer(context) else null
    }
    val speaker = remember { TextToSpeech(context) { } }
    DisposableEffect(recognizer) {
        onDispose {
            recognizer?.destroy()
            speaker.shutdown()
        }
    }
    LaunchedEffect(state.askId) {
        when (state.ask) {
            "files" -> files.launch(Unit)
            "folder" -> folder.launch(Unit)
        }
    }
    LaunchedEffect(state.say, state.speak) {
        if (state.speak && !state.reading) speaker.speak(state.say, TextToSpeech.QUEUE_FLUSH, null, "zoro")
    }
    DisposableEffect(listening, recognizer) {
        if (listening && recognizer != null) {
            recognizer.setRecognitionListener(object : RecognitionListener {
                override fun onResults(bundle: Bundle?) {
                    listening = false
                    val said = bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                    if (said.isNotBlank()) model.heard(said)
                }
                override fun onError(error: Int) { listening = false }
                override fun onReadyForSpeech(params: Bundle?) = Unit
                override fun onBeginningOfSpeech() = Unit
                override fun onRmsChanged(rmsdB: Float) = Unit
                override fun onBufferReceived(buffer: ByteArray?) = Unit
                override fun onEndOfSpeech() = Unit
                override fun onPartialResults(partialResults: Bundle?) = Unit
                override fun onEvent(eventType: Int, params: Bundle?) = Unit
            })
            recognizer.startListening(
                Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).putExtra(
                    RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
                ).putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault()),
            )
        }
        onDispose { recognizer?.stopListening() }
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp, vertical = 28.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("AIDE", fontSize = 12.sp, letterSpacing = 2.sp, color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Zoro", fontFamily = FontFamily.Serif, fontSize = 36.sp)
        Text(if (listening) "Listening." else if (state.reading) "Reading." else state.say)
        Button(onClick = { mic.launch(Manifest.permission.RECORD_AUDIO) }, modifier = Modifier.fillMaxWidth()) {
            Text(if (listening) "Listening" else "Speak")
        }
        OutlinedTextField(
            value = command,
            onValueChange = { command = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Or type") },
            minLines = 2,
        )
        Button(
            onClick = {
                val text = command.trim()
                if (text.length >= 2) {
                    command = ""
                    model.heard(text)
                }
            },
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Ask Zoro") }
        Text("No external request. A scan only reads files you pick.", color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
