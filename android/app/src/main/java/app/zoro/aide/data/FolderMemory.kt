package app.zoro.aide.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.map

private val Context.folderStore by preferencesDataStore(name = "zoro")

data class Remembered(val mode: String, val uri: String, val label: String)

class FolderMemory(private val context: Context) {
    private val modeKey = stringPreferencesKey("mode")
    private val uriKey = stringPreferencesKey("tree_uri")
    private val labelKey = stringPreferencesKey("tree_label")

    val saved = context.folderStore.data.map { prefs ->
        val uri = prefs[uriKey] ?: return@map null
        Remembered(prefs[modeKey] ?: "tree", uri, prefs[labelKey] ?: "Files")
    }

    suspend fun saveTree(uri: String, label: String) = save("tree", uri, label)

    suspend fun saveFiles(uris: List<String>, label: String) = save("files", uris.joinToString("\n"), label)

    private suspend fun save(mode: String, uri: String, label: String) {
        context.folderStore.edit { prefs ->
            prefs[modeKey] = mode
            prefs[uriKey] = uri
            prefs[labelKey] = label
        }
    }
}
