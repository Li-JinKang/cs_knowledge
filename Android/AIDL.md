AIDL（Android Interface Definition Language，即 Android 接口定义语言）是 Android 提供的一种用于实现**进程间通信（Inter-Process Communication, IPC）**的工具。

在 Android 系统中，每个应用运行在自己的进程中，且拥有独立的内存空间。出于安全和稳定性的考虑，一个进程通常无法直接访问另一个进程的内存。如果应用 A 需要调用应用 B 中的方法或传递数据，就需要通过 AIDL 来定义双方都能理解的通信协议。

以下是关于 AIDL 的系统性解析：

### 1. 核心作用
AIDL 的主要职责是**跨进程接口定义**。它允许你定义客户端与服务端达成共识的编程接口，以便通过 Binder 机制进行数据交换。

其工作原理是将复杂的对象分解为操作系统能够理解的原语（Primitives），并将其跨进程“编组”（Marshal）发送。

### 2. 工作机制
AIDL 的背后是 Android 的 **Binder** 机制。当你创建一个 `.aidl` 文件时，Android SDK 工具会自动生成对应的 Java（或 C++ / Rust）代码。

生成的代码结构通常包含以下两部分：
*   **Stub（存根）**：位于服务端。它继承自 `Binder` 并实现了 AIDL 接口。它负责接收来自客户端的调用并进行反序列化。
*   **Proxy（代理）**：位于客户端。它是服务端在客户端进程中的本地代表，负责将参数序列化并发送给 Binder 驱动。

### 3. 支持的数据类型
AIDL 并不是支持所有的 Java 类型，它仅支持以下类型：
*   Java 原生类型（如 `int`, `long`, `boolean`, `float`, `double` 等）。
*   `String` 和 `CharSequence`。
*   `List`：列表中的所有元素必须是 AIDL 支持的类型，或者是你声明的 `Parcelable` 对象。
*   `Map`：不支持泛型，Key 和 Value 必须是上述支持的类型。
*   **Parcelable**：实现了 `Parcelable` 接口的自定义类（必须显式导入）。
*   **AIDL 接口本身**：也可以在 AIDL 文件中嵌套使用。

### 4. AIDL 与 Messenger 的区别
在选择 IPC 方案时，开发者常在 AIDL 和 Messenger 之间权衡：
*   **Messenger**：底层也是基于 AIDL。但它是单线程队列处理，所有的请求都会按顺序处理，不需要处理多线程同步问题。适用于简单的、不需要并发处理的场景。
*   **AIDL**：支持高并发处理。服务端需要处理多线程同步（线程安全），适用于需要处理大量请求或执行复杂操作的场景。

### 5. 代码示例
定义一个简单的 AIDL 文件 `IRemoteService.aidl`：

```aidl
// IRemoteService.aidl
package com.example.service;

import com.example.service.Rect; // 假设有一个自定义类

interface IRemoteService {
    /** 获取服务端的进程 ID */
    int getPid();

    /** 基础类型测试 */
    void basicTypes(int anInt, long aLong, boolean aBoolean, float aFloat,
            double aDouble, String aString);

    /** 传递 Parcelable 对象 */
    void displayRect(in Rect rect);
}
```
