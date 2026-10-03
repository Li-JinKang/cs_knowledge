> `startActivityForResult()` + `onActivityResult()` 的替代方案：先用 `registerForActivityResult()` 注册一个
> **`ActivityResultLauncher`**，再用 `launcher.launch(输入)` 启动系统相机 / 相册 / 权限弹窗，结果回到注册时绑定的回调。
> 注意它来自 **AndroidX Activity（Jetpack）**
## 1. 新旧对比

| 维度 | 旧：`startActivityForResult` | 新：Activity Result API |
| --- | --- | --- |
| 启动 | `startActivityForResult(intent, requestCode)` | `launcher.launch(输入)` |
| 接收结果 | `onActivityResult(requestCode, resultCode, data)` 里 switch | 注册时绑定的回调，一个 launcher 对应一个结果 |
| 请求码 | 手写常量，容易撞 / 忘回收 | 不需要 |
| 类型 | 全是 `int` + `Intent`，强转靠自己 | `contract` 定义了输入输出类型 |
| 可测试性 | 只能挂在 Activity 上 | 可以注入自己的 `ActivityResultRegistry`，脱离 Activity 单测 |
| 权限申请 | `requestPermissions()` + `onRequestPermissionsResult()` | `RequestPermission()` 等 contract，同一套模型 |

废弃发生在 **AndroidX 侧**：`Fragment.startActivityForResult`、`ComponentActivity` 的同名方法都标了 `@Deprecated`，原文理由是"类型安全（`ActivityResultContract`）+ 提供测试钩子 + 结果处理可以独立成可测试的类"。
平台侧的 `android.app.Activity.startActivityForResult` / `onActivityResult` 我查到的文档里**没有** `@Deprecated` 标记（Android 15 还给它加了带 `ComponentCaller` 的重载），但官方推荐口径同样是迁到 Activity Result API。

## 2. 三步用法

```kotlin
class MainActivity : AppCompatActivity() {

    // 1) 注册：必须发生在 STARTED 之前（属性初始化 / onCreate 里）
    private val pickImage = registerForActivityResult(
        ActivityResultContracts.PickVisualMedia()          // 系统照片选择器
    ) { uri: Uri? ->                                       // 3) 结果回调，取消时为 null
        uri?.let { imageView.setImageURI(it) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.main)

        findViewById<Button>(R.id.btn).setOnClickListener {
            // 2) 启动
            pickImage.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
        }
    }
}
```

要点：

- `registerForActivityResult(contract, callback)` 返回 `ActivityResultLauncher<I>`，`launch(I)` 就是"启动"那一步，"事件处理"就是注册时那个回调
- **注册时机是硬约束**：必须早于 `STARTED`。写在 `onResume` 或点击回调里会抛 `IllegalStateException`（`LifecycleOwners must call register before they are STARTED`）
- 一个 launcher 绑定一个 contract + 一份回调，不再需要 requestCode，也不要拿一个 launcher 兼顾多种结果
- 配置变更 / 重建后会重新绑定，未投递的结果仍会送到回调，不用担心"结果丢了"

## 3. 常用 contract（相机 / 相册 / 权限）

| contract | 输入 → 输出 | 用途 |
| --- | --- | --- |
| `StartActivityForResult()` | `Intent` → `ActivityResult` | 通用：启动任意 Activity 拿结果（`resultCode` + `data`） |
| `TakePicture()` | `Uri` → `Boolean` | 系统相机拍照，**必须给一个可写的 content URI** |
| `TakePicturePreview()` | 无 → `Bitmap?` | 只要一张缩略图，不回写文件 |
| `PickVisualMedia()` | `PickVisualMediaRequest` → `Uri?` | 选**一张**图片/视频（系统照片选择器，无需读存储权限） |
| `PickMultipleVisualMedia(n)` | `PickVisualMediaRequest` → `List<Uri>` | 选多张，`n` 为上限 |
| `GetContent()` | `String`(mime) → `Uri?` | 旧的 `ACTION_GET_CONTENT` |
| `GetMultipleContents()` | `Array<String>`(mime) → `List<Uri>` | 多选内容 |
| `OpenDocument()` / `OpenMultipleDocuments()` | `Array<String>`(mime) → `Uri?` / `List<Uri>` | SAF 打开文档，拿到的 URI 可长期持有 |
| `CreateDocument()` | `String`(建议文件名) → `Uri?` | SAF 新建文档（mime 在构造时给） |
| `OpenDocumentTree()` | `Uri?` → `Uri?` | 选择整个目录 |
| `RequestPermission()` | `String` → `Boolean` | 单个运行时权限 |
| `RequestMultiplePermissions()` | `Array<String>` → `Map<String, Boolean>` | 多个权限，逐个给结果 |
| `StartIntentSenderForResult()` | `IntentSenderRequest` → `ActivityResult` | 需要 `IntentSender` 的系统流程 |

## 4. 相机 / 相册的几个坑

- **拍照必须自己准备 URI**：`TakePicture()` 要的是 `FileProvider.getUriForFile(...)` 生成的 content URI，需要在 Manifest 配 `<provider>` + `file_paths.xml`。直接传 `file://` 会在 Android 7+ 抛 `FileUriExposedException`
- **相册优先用 `PickVisualMedia`**：Android 13 起是系统内置选择器，Android 11 / 12 通过 Google Play 系统更新回移；不可用时 contract 会**自动回退**到 `ACTION_OPEN_DOCUMENT`。可用 `PickVisualMedia.isPhotoPickerAvailable()` 判断
- **用它选中的图片不需要 `READ_MEDIA_IMAGES`**：选择器只把用户选中的那一项授权给你。Android 14 起如果仍然声明 `READ_MEDIA_IMAGES`，还要处理"部分授权"（`READ_MEDIA_VISUAL_USER_SELECTED`）；只用照片选择器就可以完全不声明
- **选中的 URI 是临时授权**：要长期访问，改用 `OpenDocument()`（SAF 持久化授权）或自己 copy 到应用目录
- 用 `StartActivityForResult()` 传自定义隐式 Intent 时，先 `resolveActivity` 或 try/catch `ActivityNotFoundException`（设备上可能没有对应 App）

## 5. 权限申请的迁移

```kotlin
private val requestCamera = registerForActivityResult(
    ActivityResultContracts.RequestPermission()
) { granted: Boolean ->
    if (granted) openCamera() else showRationale()
}

requestCamera.launch(Manifest.permission.CAMERA)
```

- 结果直接回到这个回调，不用靠 requestCode 分辨是哪个权限（多权限用 `RequestMultiplePermissions()`，拿 `Map`）
- 仍然是异步的；用户勾了"不再询问"后 `granted` 会是 false，要继续引导只能去设置页
- 权限相关的节点见 [[权限]]

## 6. 进阶：脱离 Activity 注册

- `registerForActivityResult(contract, registry, callback)` 的第二种形态允许传入自己的 `ActivityResultRegistry`，这样"启动 + 处理结果"的逻辑可以放进独立类里单测 —— 这正是官方废弃旧 API 的理由之一
- **没有 Activity / Fragment 就没有 `launch` 的机会**：`ActivityResultLauncher` 必须由 `ActivityResultCaller` 注册获得。纯 Service 场景里要拉起相机，只能走 `PendingIntent` / 通知交互，让用户点进界面再处理

## 7. 常见坑

1. **在 `onResume` / 点击事件里注册** → `IllegalStateException`，必须在 `STARTED` 之前
2. **想用一个 launcher 处理多种结果** → 没有 requestCode 了，需要几种结果就注册几个 launcher
3. **拍照传 `file://`** → `FileUriExposedException`，用 `FileProvider`
4. **以为 `PickVisualMedia` 需要 `READ_MEDIA_IMAGES`** → 不需要，选择器自带授权
5. **`launch` 了不存在的系统 App** → `ActivityNotFoundException`，隐式 Intent 要先判断
6. **在 `Fragment` 里注册却指望 Activity 的 `onActivityResult`** → 旧回调已废弃，统一用 launcher
7. **把长生命周期对象塞进回调** → 回调会活到组件销毁，注意别捕获 Activity 造成泄漏
