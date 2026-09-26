# wen-path 日常工作管理入口

从这里安排今天、归档成果、推进项目。网站是目标主入口；本目录先提供可立即使用的记录体系。当前文件不会自动出现在网站上，接入工作见 [执行计划](../plans/wen-path-work-management.md)。

## 五条工作线

| 工作 | 节奏 | 记录位置 | 完成标准 |
| --- | --- | --- | --- |
| 每日单词 | 每天 | [每日单词](english/daily-words/README.md) | 保存原图，核对划线词，加入统一生词表 |
| 英语日记 | 每天 | [英语日记](english/diary/README.md) | 保存英文定稿，核对重点词，关联生词表 |
| 小红书 | 每天 | [小红书](content/xiaohongshu/README.md) | 保存最终文案；发布后补链接与时间 |
| 海外账号 | 每周 | [海外账号](content/overseas/README.md) | 确定选题和最终文案；按账号记录发布结果 |
| Kinikini | 按执行计划 | [项目入口](projects/kinikini/README.md) | 有验收证据后更新任务及进度 |

共享资料：[统一生词表](english/vocabulary/README.md)、[每日安排](daily/TEMPLATE.md)、[每周复盘](weekly/TEMPLATE.md)、[生活记录](life/TEMPLATE.md)、[同步规则](sync/README.md)。

## 每天怎么用

1. 复制每日模板为 `daily/YYYY-MM-DD.md`，确定今天重点及 Kinikini 下一步。
2. 将学习原图存入对应模块的 `assets/YYYY-MM-DD/`，按模块模板整理记录。
3. 与 ChatGPT 讨论后，将确认的日记、选题或文案粘贴归档；保留必要讨论摘要和来源链接。
4. 汇总两类英语材料里的划线词。同一个词合并到一个词条，但保留每次出现的原句和来源。
5. 晚间补充完成情况、发布链接、阻塞和明日第一步；未完成事项明确顺延或取消。

每周安排一次海外选题与文案，并做周复盘；具体星期和每日时间由实际安排填写，不预设提醒。

## 文件与状态约定

- 每日记录：`YYYY-MM-DD-主题.md`；每周记录：以周一日期命名 `YYYY-MM-DD-week.md`。
- 复制模板后填写唯一 `record_id`，例如 `diary-2026-09-26-01`；后续编辑保持 ID 不变。
- 内容状态：`draft` 草稿 → `final` 定稿 → `published` 已发布（仅发布类内容）。定稿不等于已发布。
- 同步状态独立记录：`local_only`、`pending`、`synced`、`failed`、`conflict`。目前新记录均为 `local_only`。
- 日期使用实际发生日期，跨日补录保留补录时间。时区暂按 `Asia/Makassar`，可调整。
- 本地记录不放在 `public/`，避免作为网站静态资源公开；提交或分享仓库前检查日记、图片和聊天链接的范围。
- 本目录是归档规范，不代表已创建日常任务、已设置提醒或已打通自动同步。
