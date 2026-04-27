## 格式化规则的说明

为反引号提供简写：
1. 将 ;;text;; 替换为 `text` 即 为反引号提供简写;; 方便键入
2. 如果发现 ;;+ 则将当前位置到行尾使用反引号括起来
格式化为标准markdown：
1. 标准markdown解析过程中，需要在某些格式下行尾要求两个空格
    - 比如 列表语法，如果列表项末尾没有双空格可能无法正确渲染成列表

### 示例
before format: this is ;;abc;; and ;;def;; or ;; and else
after format: this is `abc` and `def` or ;; and else

before format: this is ;;+ hehehe ;;kjsdfk;;klsdjfie
after format: this is ` hehehe ;;kjsdfk;;klsdjfie`

## 格式化触发方式的说明
1. 提供右键选项 custom format进行触发
2. 如果有选中的文本对于选中的文本格式化，如果没有选中则对全文格式化
3. 关闭时触发格式化，同时弹框提醒格式化影响的内容(仅在此种情况下弹窗)