# 文子的 LifeOS

40岁征程 AI 工作台：把长期愿景连接到月度成果、每周行动、今日重点和复盘调整。

当前版本提供今日任务、愿景征程、计划、独立记录、英语生词复习、自媒体内容、财务和复盘。

## 本地运行

```bash
npm install
npm run dev
```

数据由 Sites D1 保存；本地预览使用项目内的开发数据库。

## 日常工作管理

- [工作管理入口](workbench/README.md)：每日单词、英语日记、小红书、海外账号与 Kinikini 项目。
- [项目执行 Plan](plans/wen-path-work-management.md)：网站接入阶段、优先级与验收标准。

已建立本地归档规范与模板。记录只含读书笔记、灵感、日记，独立于任务；生词与自媒体内容存入网站数据库。首页不展示“今天的工作台”。图片划线识别与 Kinikini 本地执行进度自动同步仍待实现。

- [最新网站更新 Plan](plans/wen-path-content-and-vocabulary-update.md)：独立三类记录、英语生词复习、自媒体归档及聊天写入。

## 从对话归档内容

在 Codex 中打开并登录网站，可通过浏览器提供的 `save_wen_path_document`、`save_wen_path_vocabulary`、`read_wen_path_entry` 保存并核验用户明确指定的内容；使用稳定 requestId 防止重复创建。网站无需聊天界面。此方式依赖支持 WebMCP 的连接浏览器，不等同于普通 ChatGPT 对话的远程连接。后者尚未接通，不能宣称自动同步已启用。

站内也可直接新增记录、保存词表和文案。旧备忘录、工具和任务关联记录接口返回 410，定时提醒已停用；历史表保留用于回滚。

验证：`npx tsc --noEmit`；`node --test tests/content-hub.test.mjs tests/work-routines.test.mjs`；构建后执行 `node --test tests/rendered-html.test.mjs`。
