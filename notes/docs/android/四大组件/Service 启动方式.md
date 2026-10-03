> 两种启动方式决定了 Service 的存活条件、与调用方的耦合程度，以及双方能用什么手段通信。
> 回调顺序与销毁规则见 [[Service 生命周期]]。

## 1. 两种方式对比

| 维度 | `startService`（启动式） | `bindService`（绑定式） |
| --- | --- | --- |
| 回调路径 | `onCreate → onStartCommand` | `onCreate → onBind → onUnbind` |
| 与调用方的关系 | 无绑定，调用方退出后服务照常运行 | 有绑定，客户端全部解绑后服务销毁 |
| 能否拿到服务对象 | 不能，只能靠 Intent 单向传参 | 能，`onBind` 返回 `IBinder` 直接调方法 |
| 通信方向 | 单向（调用方 → 服务） | 双向（可以回调客户端） |
| 停止方式 | `stopService` / `stopSelf` | 全部 `unbindService` |
| 典型场景 | 下载、播放、同步 | 音乐控制、跨进程 AIDL 调用 |

## 2. 启动式：startService / startForegroundService

```kotlin
val intent = Intent(this, DownloadService::class.java).apply {
    action = DownloadService.ACTION_START
    putExtra(DownloadService.EXTRA_URL, url)
}
startService(intent)                                  // 普通后台服务
ContextCompat.startForegroundService(this, intent)     // 前台服务（内部已做版本判断）
```

```kotlin
override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
        ACTION_START -> start(intent.getStringExtra(EXTRA_URL))
        ACTION_STOP -> stopSelf(startId)
    }
    return START_REDELIVER_INTENT
}
```

要点：

- `Intent` 是唯一的传参通道，服务里通过 `onStartCommand` 接收
- 停止：`stopService(intent)` / `stopSelf()` / `stopSelf(startId)`
- 服务给自己发 `Intent` 也是常见做法（比如用它更新任务状态）
- **Android 5.0（API 21）起 Service 的 Intent 必须显式**，否则抛 `IllegalArgumentException: Service Intent must be explicit`；跨应用时用显式组件名或 `setPackage`
- **Android 8.0（API 26）起后台应用不能 `startService`**，抛 `IllegalStateException: Not allowed to start service Intent ... app is in background`
  - 允许的情况：应用处于前台、收到高优先级 FCM、正在处理广播的短暂时窗、已有可见组件等
  - 后台需要"立刻执行"就改用 `startForegroundService`，并在 5 秒内 `startForeground`（见 [[Service 前台服务]]）

## 3. 绑定式：bindService / unbindService

```kotlin
private val connection = object : ServiceConnection {
    override fun onServiceConnected(name: ComponentName, binder: IBinder) {
        // 同进程直接强转，拿到服务实例
        service = (binder as MusicService.LocalBinder).getService()
    }
    override fun onServiceDisconnected(name: ComponentName) {
        // 只在服务进程异常终止时回调；正常解绑不会走这里
        service = null
    }
}

override fun onStart() {
    super.onStart()
    bindService(Intent(this, MusicService::class.java), connection, BIND_AUTO_CREATE)
}

override fun onStop() {
    super.onStop()
    unbindService(connection)   // 忘记解绑 = ServiceConnectionLeaked + Activity 泄漏
}
```

要点：

- `bindService` 是**异步**的：返回 `true` 只代表请求被接受，拿到 `IBinder` 必须等 `onServiceConnected`
- `BIND_AUTO_CREATE`：绑定时若服务尚未创建就先创建它，最常用
- `onServiceDisconnected` 只在**服务进程异常终止**时回调；客户端自己解绑不会回调
- `onBindingDied`（API 26+）：服务所在进程的 Binder 失效；`onNullBinding`（API 28+）：`onBind` 返回了 null
- 跨进程绑定同样要求显式 Intent

### 三种 IPC 形式怎么选

| 形式 | 跨进程 | 并发 | 复杂度 | 场景 |
| --- | --- | --- | --- | --- |
| 本地 Binder（`LocalBinder`） | ❌ | 直接调用 | 最低 | 同进程 Activity ↔ Service，官方推荐 |
| `Messenger` | ✅ | 单线程串行（内部是 Handler） | 中 | 跨进程但调用不频繁、不需要并发 |
| [[AIDL]] | ✅ | 支持多线程并发 | 高 | 跨进程高频调用、需要并发（原理见 [[Binder 原理]]） |

> 同进程时**不要**用 AIDL：序列化和线程管理的开销全是白付的。

## 4. 与界面通信的几种方式

| 方式                     | 适用      | 说明                                              |
| ---------------------- | ------- | ----------------------------------------------- |
| Binder 回调接口            | 同进程、绑定式 | 服务持有接口引用回调 Activity，解绑时要置空避免泄漏                  |
| `LiveData` / `Flow`    | 同进程、绑定式 | 服务暴露数据源、界面订阅，比手写回调省心，且天然处理生命周期                  |
| 广播                     | 松耦合     | 简单但难维护；`LocalBroadcastManager` 已废弃，可用 `Flow` 替代 |
| `Messenger` / [[AIDL]] | 跨进程     | 见上表                                             |
| 文件 / Room / SP         | 无实时性要求  | 只是数据落地，不算"通信"                                   |

## 5. 怎么选

| 需求 | 方案 |
| --- | --- |
| 只在界面打开时需要，且要直接调方法 | `bindService`（简单场景甚至可以不引入 Service） |
| 界面关掉后还要继续（播放、下载） | `startService` + [[Service 前台服务]] |
| 可延迟、但必须保证执行（同步、上传） | `WorkManager` |
| 短命异步任务 | 协程（`applicationScope`）或 `WorkManager` |
| 跨进程提供服务 | `bindService` + `Messenger` / `AIDL` |

> `IntentService`（API 30 废弃）和 `JobIntentService`（已废弃）都不该再用于新代码；
> 但 **`onStartCommand` 本身并没有被废弃**，它仍然是启动式服务的唯一入口（API 36 依然如此）。

## 6. 常见坑

1. **Service 的 Intent 是隐式的** → `IllegalArgumentException`，改成显式 Intent
2. **Android 8.0 后台直接 `startService`** → `IllegalStateException`，改 `startForegroundService`
3. **`startForegroundService` 后 5 秒内没 `startForeground`** → ANR
4. **忘了 `unbindService`** → `ServiceConnectionLeaked`，匿名内部类还会把 Activity 一起泄漏
5. **`bindService` 之后立刻使用服务对象** → 还是 null，要等 `onServiceConnected`
6. **把耗时逻辑写在服务回调里** → 主线程，ANR
7. **反复 `startService` 却从不停止** → 服务一直存在，但 `onCreate` 只在第一次走
8. **用 `onServiceDisconnected` 感知"服务已停止"** → 正常解绑不回调，它只表示服务进程异常终止
9. **以为 `onStartCommand` 被废弃了** → 没有。被废弃的是 `IntentService`（含 `onHandleIntent`），后台任务改用 `WorkManager`
