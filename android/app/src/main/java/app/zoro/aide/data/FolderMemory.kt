package app.zoro.aide.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.map

private val Context.folderStore by preferencesDataStore(name = "zoro")

data class RememberedFolder(val uri: String, val label: String)

class FolderMemory(private val context: Context) {
    private val uriKey = stringPreferencesKey("tree_uri")
    private val labelKey = stringPreferencesKey("tree_label")

    val folder = context.folderStore.data.map { prefs ->
        val uri = prefs[uriKey] ?: return@map null
        RememberedFolder(uri, prefs[labelKey] ?: "Folder")
    }

    suspend fun save(uri: String, label: String) {
        context.folderStore.edit { prefs ->
            prefs[uriKey] = uri
            prefs[labelKey] = label
        }
    }
}
