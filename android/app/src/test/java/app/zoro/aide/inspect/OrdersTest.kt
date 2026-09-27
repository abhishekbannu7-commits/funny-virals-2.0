package app.zoro.aide.inspect

import org.junit.Assert.assertEquals
import org.junit.Test

class OrdersTest {
    @Test
    fun hearsScanReadAndEdit() {
        assertEquals(Order.PickFiles, orderOf("scan that file"))
        assertEquals(Order.PickFiles, orderOf("scan these files"))
        assertEquals(Order.PickFolder, orderOf("scan the folder"))
        assertEquals(Order.Again, orderOf("scan again"))
        assertEquals(Order.Explain, orderOf("what did you find"))
        assertEquals(Order.Write, orderOf("write it"))
        assertEquals(Order.Replace("foo", "bar", "App.kt"), orderOf("replace foo with bar in App.kt"))
    }
}
