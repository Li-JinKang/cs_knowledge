在 Android 开发中，`requestLayout()` 和 `invalidate()` 是两个用于刷新 UI 的核心方法。理解它们的区别在于理解 Android View 的绘制流程：**Measure（测量）** -> **Layout（布局）** -> **Draw（绘制）**。

以下是它们的详细对比和工作原理：

### 1. `invalidate()`：请求重绘
`invalidate()` 主要用于通知系统：当前 View 的内容发生了变化，需要重新调用 `onDraw()` 方法。

*   **触发流程**：它只会触发 **Draw** 阶段。它不会导致重新测量（Measure）或重新布局（Layout）。
*   **适用场景**：
    *   修改了 View 的背景颜色。
    *   修改了文字内容（如果文字大小没变）。
    *   属性动画执行过程中，每一帧的重绘。
    *   自定义 View 中通过 `Canvas` 绘制的内容发生了改变。
*   **特性**：
    *   如果 View 的可见性为 `GONE`，调用 `invalidate()` 通常不会产生任何效果。
    *   必须在 UI 线程调用。如果在非 UI 线程，需要使用 `postInvalidate()`。

### 2. `requestLayout()`：请求重新布局
`requestLayout()` 用于通知系统：View 的边界、大小或位置发生了变化，需要重新走一遍完整的生命周期。

*   **触发流程**：它会触发 **Measure** 和 **Layout** 阶段。
*   **后续行为**：在执行完 `onMeasure()` 和 `onLayout()` 后，系统通常会自动触发 `invalidate()`，从而导致 `onDraw()`。也就是说，`requestLayout()` 往往会导致全套流程的重新执行。
*   **适用场景**：
    *   改变了 View 的宽度或高度（例如 `LayoutParams` 修改）。
    *   修改了 Margin 或 Padding。
    *   改变了 View 的对齐方式。
    *   任何可能影响到父容器或其他兄弟 View 位置的操作。
*   **特性**：
    *   它具有传递性。当一个子 View 调用 `requestLayout()` 时，这个请求会向上传递到父容器（Parent），直到到达 `ViewRootImpl`。这会导致整个 View 树进行重新遍历，因此开销比 `invalidate()` 大得多。

---

### 3. 核心区别对比

| 特性 | `invalidate()` | `requestLayout()` |
| :--- | :--- | :--- |
| **触发阶段** | 仅 `onDraw()` | `onMeasure()` 和 `onLayout()` (通常接着 `onDraw()`) |
| **开销** | 较小 | 较大（涉及整个 View 树的计算） |
| **用途** | 内容更新（颜色、图像、文本内容） | 结构更新（大小、位置、可见性导致的布局变动） |
| **线程限制** | 必须在主线程 (或用 `postInvalidate`) | 必须在主线程 |

---

### 4. 协同工作与优化

在 Android 的源码中，很多方法会同时调用这两个函数。例如：
*   **`View.setVisibility(int visibility)`**：
    *   如果你将 View 设置为 `INVISIBLE`，通常只会触发 `invalidate()`（位置还在，只是不画了）。
    *   如果你设置为 `GONE`，则会触发 `requestLayout()`（因为位置没了，后面的 View 要挪过来）。

**性能建议：**
1.  **尽量少用 `requestLayout()`**：频繁的布局计算会导致掉帧（Jank）。如果只是改变颜色或简单的图形变化，绝对不要调用 `requestLayout()`。
2.  **避免在 `onDraw()` 中调用**：绝对不要在 `onDraw()` 方法中调用 `invalidate()` 或 `requestLayout()`，这会导致无限循环，迅速消耗 CPU 资源。
3.  **批量修改**：如果你需要同时修改多个布局参数，尽量一次性设置完毕，系统会将多次请求合并在下一个绘图信号（Vsync）到达时处理。

### 总结思路
你可以把 View 想象成一张贴在墙上的海报：
*   **`invalidate()`** 就像是你在海报上涂鸦。墙的大小和海报的位置都没变，你只需要重新画一遍海报上的内容。
*   **`requestLayout()`** 就像是你换了一张更大的海报。你必须重新测量这张海报的大小，并看看墙上还有没有地方放它，这可能会导致墙上的其他海报也要跟着挪位置。


> 需要自己调用吗？


这是一个非常敏锐且直击本质的好问题！你的直觉完全正确。

直接回答你的疑问：**绝大多数情况下，当你调用系统现成的 API（比如 `addView()`、`removeView()` 或者 `setText()`）时，系统底层已经自动帮你调用了，你完全不需要手动去加。** 我之前提到的“最稳妥的做法是同时调用 `requestLayout()` 和 `invalidate()`”，其实是针对**“自定义 View 开发”**（也就是你自己写一个全新的 View 并定义新属性）这个特定场景而言的。

为了让你彻底弄透这个机制，我们从“系统 API 的封装”到“自定义 View 的职责”，再到一个冷门的“ViewGroup 绘制陷阱”进行深度拆解。

---

### 一、 为什么 `addView()` / `removeView()` 不需要手动调用？

安卓的 UI 框架采用了高度封装的面向对象设计。当你操作 ViewGroup 时，系统不仅修改了数据结构，还负责了视图树状态的同步。

以 `ViewGroup.addView()` 为例，如果你去翻看安卓底层的源码，它的调用链路大致如下：

1. `addView(View child)`
    
2. `addViewInner(View child, ...)`
    
3. 在 `addViewInner` 的核心逻辑中，系统会自动做两件事：
    
    - 调用 `child.requestLayout()` 和 `this.requestLayout()`：因为新增了子 View，父容器通常需要重新分配空间，子 View 也需要被测量。
        
    - 调用 `this.invalidate(true)`：因为视图层级里多了一个东西，画面肯定变了，必须触发重绘。
        

**结论：** 官方提供的标准 API，内部已经极其严谨地处理了重绘和重排的逻辑。类似的操作还有：

- `TextView.setText()`：底层会判断新文字是否改变了原本的尺寸。如果变了，自动 `requestLayout()` + `invalidate()`；如果尺寸没变只是文字内容变了（比如 "A" 变成 "B"），只调用 `invalidate()`。
    
- `View.setVisibility(View.GONE)`：自动触发父容器的 `requestLayout()`，因为该 View 腾出了空间，其他 View 可能需要重新排列。
    

---

### 二、 那么，什么时候“必须”自己手动调用？

这就回到了我之前那个结论的适用场景：**当你作为“规则的制定者”去编写自定义 View 时。**

假设你正在开发一个自定义的 `PieChartView`（饼状图），你为它提供了一个向外暴露的方法 `setPieRadius(int radius)` 来改变饼图的半径。

Java

```
public class PieChartView extends View {
    private int mRadius = 100;

    // 你提供给外部开发者调用的方法
    public void setPieRadius(int radius) {
        this.mRadius = radius;
        
        // 【关键点就在这里】
        // 对于你自定义的 mRadius 变量，安卓系统是完全不知情的！
        // 系统不知道这个变量的改变会导致 View 的体积变大，也不知道会导致画面改变。
        
        requestLayout(); // 你必须手动告诉系统：我的尺寸要变了，请重新走 onMeasure
        invalidate();    // 你必须手动告诉系统：我的长相变了，请重新走 onDraw
    }
    
    @Override
    protected void onMeasure(...) { ...根据 mRadius 计算宽高... }
    
    @Override
    protected void onDraw(Canvas canvas) { ...根据 mRadius 画圆... }
}
```

**结论：** 当你修改了**自定义属性**，且这个属性在数学逻辑上会影响 View 的大小和外观时，你必须手动承担起通知系统刷新的责任。

---

### 三、 深度延展：ViewGroup 的 `setWillNotDraw()` 陷阱

既然提到了 `addView()` 和绘制，这里必须要补充一个极其重要、且在复杂 UI 开发中经常让人踩坑的底层机制。

假设你写了一个自定义的 `LinearLayout`，你想在 `onDraw(Canvas canvas)` 里面给这个 Layout 画一个红色的网格背景，然后你往里面 `addView()`。你会发现一个诡异的现象：**子 View 都显示出来了，但是你的红色网格背景根本没有执行绘制，`onDraw()` 完全没被调用！**

**为什么会这样？**

这是安卓系统为了极端压榨性能而做的一个优化机制。

1. 系统认为，`ViewGroup`（如 LinearLayout, FrameLayout）天生就是一个“容器”，它的宿命是装载子 View，它自己通常是没有视觉内容的（除非你给它设置了 `android:background`）。
    
2. 因此，在 `ViewGroup` 的源码初始化时，系统默认给它打上了一个标志位：`WILL_NOT_DRAW` (意为：我不需要自己绘制)。
    
3. 当这个标志位为 `true` 时，即使你调用了 `invalidate()`，或者你通过 `addView()` 触发了底层的刷新，系统遍历到这个 ViewGroup 时，会**直接跳过它自己的 `onDraw()` 方法**，仅仅去执行 `dispatchDraw()` 来通知它的子 View 去画。
    

**如何破局？**

如果你确实需要在一个 ViewGroup 自己的 `onDraw()` 里画东西，你必须在它的构造函数中，强行关闭这个性能优化开关：

Java

```
public MyCustomLayout(Context context) {
    super(context);
    // 明确告诉系统：别跳过我，我自己有东西要画！
    setWillNotDraw(false); 
}
```

总结来说：作为 API 的使用者，你可以放心依赖系统原生的 `addView` 等方法；但作为底层控件的缔造者，深刻理解 `requestLayout`、`invalidate` 以及 `WILL_NOT_DRAW` 等机制的互相博弈，是写出高性能 UI 的必经之路。
