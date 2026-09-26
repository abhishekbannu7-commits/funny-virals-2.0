package app.zoro.aide

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Ink = Color(0xFF0C0C0B)
private val Paper = Color(0xFFF3F1EA)
private val Muted = Color(0xFF9A968C)
private val Surface = Color(0xFF141413)
private val Surface2 = Color(0xFF1C1C1A)
private val Ice = Color(0xFFD5E4EE)
private val InkText = Color(0xFF141310)
private val Line = Color(0xFF2E2D2A)

private val colors = darkColorScheme(
    primary = Ice,
    onPrimary = InkText,
    background = Ink,
    onBackground = Paper,
    surface = Surface,
    onSurface = Paper,
    surfaceVariant = Surface2,
    onSurfaceVariant = Muted,
    outline = Line,
)

@Composable
fun ZoroTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, content = content)
}
