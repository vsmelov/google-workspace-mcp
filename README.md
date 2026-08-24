# google-workspace-mcp

MCP-сервер (stdio) для Google Docs и Slides через сервисный аккаунт.
Инструменты: `docs_read`, `docs_append`, `docs_replace_text`, `docs_batch_update`,
`slides_get`, `slides_add_slide`, `slides_replace_text`, `slides_batch_update`.

Доступ — только к файлам, расшаренным на сервисный аккаунт (или лежащим в расшаренной на него папке Drive).

## Запуск

```bash
npm install
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node index.js
```

## Регистрация в Claude Code

```bash
claude mcp add gworkspace -e GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json -- node /path/to/google-workspace-mcp/index.js
```

Ключ сервисного аккаунта в репо не хранится — только через env.
