package app.zoro.aide.inspect

import org.junit.Assert.assertEquals
import org.junit.Test

class InspectTest {
    @Test
    fun flagsTheSameMarksAsTheWebInspectAndHidesSecretText() {
        val report = inspectTexts(
            listOf(
                SourceFile(
                    "App.kt",
                    "val token = \"abcd1234ef\"\nfun x(){ catch (e: Exception) {} }\n// TODO later\ndebugger\n",
                ),
                SourceFile("photo.png", "nope"),
            ),
        )
        assertEquals(listOf("App.kt"), report.files.map { it.name })
        assertEquals(listOf("secret", "empty-catch", "todo", "debugger"), report.findings.map { it.kind })
        assertEquals(listOf("photo.png"), report.skipped)
        assertEquals("Looks like a secret. It was not copied out.", report.findings.first().detail)
        assertEquals(false, report.findings.any { it.detail.contains("abcd1234ef") })
    }
}
