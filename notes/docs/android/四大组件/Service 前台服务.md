> 前台服务就是明确告诉系统"用户能感知到我在工作"的服务。代价是一条常驻通知，
> 收益是进程优先级仅次于可见进程、且不被后台执行限制压制。启动与绑定方式见 [[Service 启动方式]]。

## 1. 为什么需要前台服务

| 版本 | 后台限制 |
| --- | --- |
| Android 6.0 / API 23 | Doze + App Standby：设备空闲时后台任务被推迟、网络被掐 |
| Android 8.0 / API 26 | 后台执行限制：应用进入后台后不能 `startService`，已在跑的后台服务也会被停 |
| Android 9 / API 28 | App Standby Buckets：按使用频率分桶，进一步限制后台任务 |
| Android 12 / API 31 | 禁止从后台启动前台服务 |

结论：想"在后台持续干活"，正的路径只剩**前台服务**、`WorkManager` 和精确闹钟这几条。

## 2. 三个必备步骤

```xml
<!-- 1. Manifest：声明类型（Android 14 起必填）与权限 -->
<service
    android:name=".MusicService"
    android:exported="false"
    android:foregroundServiceType="mediaPlayback" />

<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
```

```kotlin
// 2. 启动方
ContextCompat.startForegroundService(this, Intent(this, MusicService::class.java))

// 3. Service 内 5 秒内必须 startForeground
class MusicService : Service() {
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        ServiceCompat.startForeground(
            this,
            NOTIFICATION_ID,
            buildNotification(),                 // 通知必须有渠道、有小图标
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0
        )
        return START_STICKY
    }
}
```

> **5 秒是硬约束**：`startForegroundService` 之后没有及时 `startForeground`，系统会抛
> `ForegroundServiceDidNotStartInTimeException` 并 ANR。
> 所以"先初始化，再 `startForeground`"的写法必须先评估这段初始化能不能在 5 秒内跑完。

多个类型可以叠加声明，用 `|` 分隔：`android:foregroundServiceType="location|camera"`。

## 3. 通知的硬性要求

- **Android 8.0+ 必须有 `NotificationChannel`**，否则通知不显示，甚至抛 `RemoteServiceException: Bad notification for startForeground`
- 通知必须设置**小图标**（`setSmallIcon`），这是 `startForeground` 崩溃的最常见原因
- 通知内容要说明**当前在做什么**（用户据此判断要不要停掉它），点击用 `PendingIntent` 回到界面
- `setOngoing(true)` 让它不容易被误划掉
- **Android 12 起**，某些情况下系统会把前台服务通知**延迟约 10 秒**展示（短任务不必反复打扰用户）
- **Android 13（API 33）起** `POST_NOTIFICATIONS` 是运行时权限：用户拒绝后服务照样能跑，但通知不显示，用户会"看不见"这个服务 —— 最好在启动前申请并说明用途
- **Android 13 起**系统任务管理器允许用户直接停止前台服务

## 4. 权限与类型：版本演进（重点）

| 版本 | 变化 |
| --- | --- |
| Android 8.0 / API 26 | 引入 `startForegroundService`：后台启动服务必须在 5 秒内 `startForeground`，否则 ANR |
| Android 9 / API 28 | 需要声明 `FOREGROUND_SERVICE` 权限（normal 权限，声明即生效） |
| Android 10 / API 29 | 新增 `android:foregroundServiceType` 属性与 `startForeground(id, notif, type)`；`location` 类型要真正后台定位仍需 `ACCESS_BACKGROUND_LOCATION` |
| Android 11 / API 30 | `camera` / `microphone` 类型的前台服务在后台时**不能访问**摄像头和麦克风 |
| Android 12 / API 31 | 禁止从后台启动前台服务，抛 `ForegroundServiceStartNotAllowedException`；例外极少（用户交互后、精确闹钟、高优先级 FCM、开机等） |
| Android 13 / API 33 | `POST_NOTIFICATIONS` 运行时权限；任务管理器允许用户停止前台服务 |
| Android 14 / API 34 | **必须声明 `foregroundServiceType` 并申请对应的 `FOREGROUND_SERVICE_*` 权限**，否则抛 `SecurityException`；新增 `health` / `remoteMessaging` / `shortService` / `specialUse` / `systemExempted` 类型；`shortService` 约 3 分钟上限，超时回调 `onTimeout(int)` |
| Android 15 / API 35 | `dataSync`、`mediaProcessing` 类型 24 小时内累计最多运行 6 小时，超时回调 `onTimeout(int, int)`；`BOOT_COMPLETED` 不能启动部分类型 |

## 5. 前台服务超时：onTimeout（API 34 / 35）

部分前台服务类型有运行时限。到点后系统**不是静默停掉，而是回调 `onTimeout` 给你几秒钟收尾**；
超时还不停止，应用会崩溃（`shortService` 则是 ANR）。

| 回调 | 加入版本 | 触发场景 |
| --- | --- | --- |
| `onTimeout(int startId)` | API 34 / Android 14 | `shortService` 超时（约 3 分钟） |
| `onTimeout(int startId, int fgsType)` | API 35 / Android 15 | 任意有期限的类型超时，`fgsType` 指明是哪个类型（如 `dataSync` 的 6 小时） |

```kotlin
// Android 15+ 上 shortService 超时也会走这个两参版本，实现这一个就够
override fun onTimeout(startId: Int, fgsType: Int) {
    // 宽限期只有几秒，必须把服务停掉
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf(startId)
}
```

- **宽限期只有几秒**：几秒内没停掉，应用崩溃；`shortService` 超时后未结束会被判定 ANR
- 停止方式不限于 `stopSelf()`：`stopService()`、`stopForeground(int)`（降级为后台服务，随后也会被系统停掉）都算处理过
- **时限按 24 小时滚动窗口计算**：6 小时这类额度从服务启动那一刻开始计时，只有满 24 小时或应用回到前台才重置
- **低版本没有这个回调**：类型常量在旧版本也能用，但 API 34 以下**永远不会回调 `onTimeout`** —— 不能只靠它兜底，自己必须保证按时停止

## 6. 常用前台服务类型

| type | 需要的权限 | 典型场景 |
| --- | --- | --- |
| `dataSync` | `FOREGROUND_SERVICE_DATA_SYNC` | 上传 / 下载、数据同步（注意 Android 15 的时长限制） |
| `mediaPlayback` | `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | 音乐 / 视频播放 |
| `location` | `FOREGROUND_SERVICE_LOCATION` | 导航、轨迹记录 |
| `connectedDevice` | `FOREGROUND_SERVICE_CONNECTED_DEVICE` | 蓝牙、投屏等设备交互 |
| `camera` / `microphone` | `FOREGROUND_SERVICE_CAMERA` / `_MICROPHONE` | 录制、通话 |
| `phoneCall` | `FOREGROUND_SERVICE_PHONE_CALL` | 通话类应用 |
| `mediaProjection` | `FOREGROUND_SERVICE_MEDIA_PROJECTION` | 录屏（还需用户授予录屏权限） |
| `shortService` | 无额外权限 | 3 分钟内的短任务，用完即止 |
| `specialUse` | `FOREGROUND_SERVICE_SPECIAL_USE` | 兜底类型，上架需说明理由（Manifest 里配 `PROPERTY_SPECIAL_USE_FGS_SUBTYPE`） |
| `health` / `remoteMessaging` / `systemExempted` | 对应权限 | 健康数据、跨设备消息、系统豁免场景 |

> 类型必须**如实填写**：与实际用途不符会被系统抛异常，上架也可能被拒。

## 7. 停止与状态切换

| 目的 | 做法 |
| --- | --- |
| 退出前台，服务继续跑 | `stopForeground(STOP_FOREGROUND_DETACH)` —— 通知留在通知栏，服务降级为普通后台服务（随时可能被杀） |
| 彻底停止 | `stopForeground(STOP_FOREGROUND_REMOVE)` + `stopSelf()` |
| 更新通知内容 | 用同一个 id 再次 `NotificationManager.notify()` |

- 只调 `stopSelf()` 而不处理前台状态，容易留下"孤儿通知"的观感，推荐显式先移除
- `stopForeground(boolean)` 在 API 24 已废弃，用带 flags 的版本

## 8. 前台服务不是"保活神器"

- 它只提高**进程优先级**（仅次于可见进程），内存极度紧张时仍会被杀
- Android 13+ 用户可以随时从任务管理器停掉你，厂商 ROM 的省电策略还更激进
- 长期驻留但无实际用户价值 = 耗电投诉 + 应用商店政策风险
- 真正"到点必须执行"的任务用 `WorkManager`（可延迟、保证执行）或精确闹钟；"被杀后仍要触达用户"用推送

## 9. 调试

```bash
adb shell dumpsys activity services <包名>                  # 服务是否处于 foreground、类型是什么
adb shell dumpsys notification --noredact                   # 看前台服务通知
adb shell am start-foreground-service -n <包名>/<服务类>     # 手动拉起，验证 5 秒约束
```

## 10. 常见坑

1. **`startForegroundService` 后没在 5 秒内 `startForeground`** → ANR（`ForegroundServiceDidNotStartInTimeException`）
2. **忘记建 `NotificationChannel`（Android 8.0+）** → 通知不显示，或 `Bad notification for startForeground`
3. **通知没有 `setSmallIcon`** → 同上，直接崩
4. **Android 14+ 没在 Manifest 声明 `foregroundServiceType`** → `SecurityException`（`MissingForegroundServiceTypeException`）
5. **声明了类型却漏了对应的 `FOREGROUND_SERVICE_*` 权限** → `SecurityException`
6. **没实现 `onTimeout`** → 类型额度用完后应用崩溃（`shortService` 是 ANR），而宽限期只有几秒
7. **Android 12+ 从后台启动前台服务** → `ForegroundServiceStartNotAllowedException`；应先让用户看到界面，或改用 `WorkManager` / 高优先级 FCM
8. **用了 `STOP_FOREGROUND_DETACH` 却忘了 `stopSelf()`** → 服务悄悄变成普通后台服务，随时被杀
9. **类型与实际用途不符** → 系统异常或上架被拒
10. **把前台服务当万能保活** → 用户能停、厂商能杀、商店会罚
