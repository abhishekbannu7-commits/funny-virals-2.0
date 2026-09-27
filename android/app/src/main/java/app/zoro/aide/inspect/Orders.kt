package app.zoro.aide.inspect

sealed class Order {
    data object PickFiles : Order()
    data object PickFolder : Order()
    data object Again : Order()
    data object Explain : Order()
    data object Write : Order()
    data class Replace(val from: String, val to: String, val file: String?) : Order()
    data object Unknown : Order()
}

fun orderOf(text: String): Order {
    val t = text.trim().trimEnd('.', '!')
    if (t.isEmpty()) return Order.Unknown
    if (Regex("^(?:write it|yes,? write|save it|do it)$", RegexOption.IGNORE_CASE).matches(t)) return Order.Write
    if (Regex("^(?:what did you (?:find|read)|explain|understand|summarize)(?: this| that| it)?$", RegexOption.IGNORE_CASE).matches(t)) {
        return Order.Explain
    }
    if (Regex("(?:scan|read|inspect).*(?:again|once more)|^(?:again|scan again|read again)$", RegexOption.IGNORE_CASE).containsMatchIn(t)) {
        return Order.Again
    }
    val replace = Regex("^(?:replace|change)\\s+(.+?)\\s+(?:with|to)\\s+(.+?)(?:\\s+in\\s+(.+))?$", RegexOption.IGNORE_CASE).matchEntire(t)
    if (replace != null) {
        return Order.Replace(replace.groupValues[1].trim(), replace.groupValues[2].trim(), replace.groupValues[3].trim().ifEmpty { null })
    }
    if (Regex("\\b(?:folder|directory|project)\\b", RegexOption.IGNORE_CASE).containsMatchIn(t) &&
        Regex("\\b(?:scan|read|open|inspect|choose)\\b", RegexOption.IGNORE_CASE).containsMatchIn(t)
    ) {
        return Order.PickFolder
    }
    if (Regex("\\b(?:scan|read|inspect|open)\\b", RegexOption.IGNORE_CASE).containsMatchIn(t) &&
        Regex("\\b(?:file|files)\\b", RegexOption.IGNORE_CASE).containsMatchIn(t)
    ) {
        return Order.PickFiles
    }
    if (Regex("^(?:scan|read|inspect)(?:\\s+(?:it|that|this|them))?$", RegexOption.IGNORE_CASE).matches(t)) return Order.PickFiles
    return Order.Unknown
}
