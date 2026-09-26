package app.zoro.aide.inspect

data class Finding(
    val file: String,
    val line: Int,
    val kind: String,
    val detail: String,
)

data class InspectFile(
    val name: String,
    val bytes: Int,
    val lines: Int,
)

data class SourceFile(
    val name: String,
    val text: String,
)

data class InspectReport(
    val files: List<InspectFile>,
    val findings: List<Finding>,
    val skipped: List<String>,
    val bytes: Int,
)

private val textExt = Regex(
    "\\.(txt|md|json|ts|tsx|js|jsx|mjs|cjs|css|html|py|kt|kts|java|gradle|xml|yml|yaml|toml|rs|go|swift|sql|sh)$",
    RegexOption.IGNORE_CASE,
)
private val secret = Regex(
    "(?:api[_-]?key|secret|password|token|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY)\\s*[:=]\\s*['\"]?[A-Za-z0-9_\\-./+=]{8,}",
    RegexOption.IGNORE_CASE,
)
private val debuggerStmt = Regex("\\bdebugger\\b")
private val emptyCatch = Regex("catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}")
private val todo = Regex("\\b(?:TODO|FIXME)\\b")

fun inspectTexts(input: List<SourceFile>): InspectReport {
    val files = ArrayList<InspectFile>()
    val findings = ArrayList<Finding>()
    val skipped = ArrayList<String>()
    var bytes = 0
    val list = input.take(40)
    if (input.size > 40) skipped += "${input.size - 40} files over the 40-file cap"
    for (file in list) {
        val name = file.name.replace('\\', '/').takeLast(180)
        if (!textExt.containsMatchIn(name) && name.contains('.')) {
            skipped += name
            continue
        }
        if (file.text.indexOf('\u0000') >= 0) {
            skipped += name
            continue
        }
        val text = file.text.take(200_000)
        bytes += text.length
        val lines = text.split(Regex("\\r?\\n"))
        files += InspectFile(name, text.length, lines.size)
        for ((index, line) in lines.withIndex()) {
            if (findings.size > 80) break
            val found = when {
                secret.containsMatchIn(line) -> Finding(name, index + 1, "secret", "Looks like a secret. It was not copied out.")
                debuggerStmt.containsMatchIn(line) -> Finding(name, index + 1, "debugger", "debugger statement")
                emptyCatch.containsMatchIn(line) -> Finding(name, index + 1, "empty-catch", "Empty catch")
                todo.containsMatchIn(line) -> Finding(name, index + 1, "todo", line.trim().take(120))
                else -> null
            }
            if (found != null) findings += found
        }
    }
    return InspectReport(files, findings, skipped, bytes)
}
