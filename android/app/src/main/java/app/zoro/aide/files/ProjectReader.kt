package app.zoro.aide.files

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import app.zoro.aide.inspect.SourceFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class ReadBatch(
    val label: String,
    val files: List<SourceFile>,
    val unread: List<String>,
)

private const val cap = 40
private const val byteCap = 200_000

suspend fun readTree(context: Context, tree: Uri): ReadBatch = withContext(Dispatchers.IO) {
    val root = DocumentsContract.getTreeDocumentId(tree)
    val label = displayName(context, DocumentsContract.buildDocumentUriUsingTree(tree, root)) ?: "Folder"
    val files = ArrayList<SourceFile>()
    val unread = ArrayList<String>()
    fun visit(docId: String, relative: String, depth: Int) {
        if (depth > 8) return
        val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, docId)
        context.contentResolver.query(
            children,
            arrayOf(
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE,
                DocumentsContract.Document.COLUMN_SIZE,
            ),
            null,
            null,
            null,
        )?.use { cursor ->
            val idCol = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
            val nameCol = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
            val mimeCol = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_MIME_TYPE)
            val sizeCol = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_SIZE)
            while (cursor.moveToNext()) {
                val id = cursor.getString(idCol) ?: continue
                val name = cursor.getString(nameCol) ?: id
                val path = if (relative.isEmpty()) name else "$relative/$name"
                val mime = cursor.getString(mimeCol) ?: ""
                if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
                    visit(id, path, depth + 1)
                    continue
                }
                if (files.size >= cap) {
                    unread += path
                    continue
                }
                val size = if (cursor.isNull(sizeCol)) 0L else cursor.getLong(sizeCol)
                if (size > byteCap) {
                    unread += "$path (over 200 KB)"
                    continue
                }
                val uri = DocumentsContract.buildDocumentUriUsingTree(tree, id)
                val text = readText(context, uri)
                if (text == null) unread += path else files += SourceFile(path, text, uri.toString())
            }
        }
    }
    visit(root, "", 0)
    ReadBatch(label, files, unread)
}

suspend fun readDocuments(context: Context, uris: List<Uri>): ReadBatch = withContext(Dispatchers.IO) {
    val files = ArrayList<SourceFile>()
    val unread = ArrayList<String>()
    for (uri in uris.take(cap)) {
        val name = displayName(context, uri) ?: "file"
        val text = readText(context, uri)
        if (text == null) unread += name else files += SourceFile(name, text, uri.toString())
    }
    if (uris.size > cap) unread += "${uris.size - cap} files over the 40-file cap"
    ReadBatch(if (files.size == 1) files[0].name else "Selected files", files, unread)
}

private fun displayName(context: Context, uri: Uri): String? {
    context.contentResolver.query(uri, arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) return cursor.getString(0)
    }
    return null
}

private fun readText(context: Context, uri: Uri): String? {
    val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
    if (bytes.size > byteCap) return null
    if (bytes.any { it == 0.toByte() }) return null
    return bytes.toString(Charsets.UTF_8)
}

fun writeText(context: Context, uri: Uri, text: String) {
    val stream = context.contentResolver.openOutputStream(uri, "wt") ?: error("Android did not open this file for writing.")
    stream.use { it.write(text.toByteArray(Charsets.UTF_8)) }
}
