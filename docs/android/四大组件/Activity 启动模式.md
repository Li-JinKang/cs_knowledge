> 启动模式决定了 Activity 实例的创建方式及其在任务栈（Task）中的位置。

## 1. 四种启动模式

### standard (标准模式)
- **行为**：每次启动都会创建一个新实例。
- **栈情况**：谁启动了它，它就运行在谁的栈里。

### singleTop (栈顶复用)
- **行为**：如果 Activity 已在栈顶，则复用，调用 `onNewIntent()`；否则创建新实例。
- **场景**：推送通知点击跳转、搜索结果页。

### singleTask (栈内复用)
- **行为**：如果栈内已存在实例，则将其上方的所有 Activity 出栈（Clear Top），使其位于栈顶，并调用 `onNewIntent()`。
- **场景**：App 主页（MainActivity）。

### singleInstance (单实例模式)
- **行为**：Activity 独占一个任务栈。
- **场景**：系统来电界面、闹钟提醒。

## 2. Intent Flags
除了在 Manifest 中设置，还可以通过代码动态设置：
- `FLAG_ACTIVITY_NEW_TASK`：对应 singleTask（通常需要配合 taskAffinity）。
- `FLAG_ACTIVITY_SINGLE_TOP`：对应 singleTop。
- `FLAG_ACTIVITY_CLEAR_TOP`：清除目标 Activity 之上的所有实例。

## 3. 任务栈 (TaskStack)
- **TaskAffinity**：Activity 的倾向性，决定了它属于哪个栈。默认是包名。
- **AMS 的角色**：[[AMS与系统调度机制|AMS]] 内部维护着 `ActivityStack` 和 `TaskRecord`，负责管理这些复杂的跳转逻辑。