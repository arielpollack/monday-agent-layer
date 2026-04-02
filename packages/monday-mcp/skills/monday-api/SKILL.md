---
name: monday-api
description: Use this skill for all monday.com API interactions. Routes traffic through the monday Agent Layer proxy for permission enforcement and audit logging.
---

# monday.com API Access

All monday.com API access MUST go through the monday Agent Layer proxy. This plugin handles it automatically.

## Rules

1. **Never call api.monday.com directly.** Always use the monday.com tools provided by this plugin.
2. **Authentication is handled automatically.** Your agent token is pre-configured — do not set or override authorization headers.
3. **Permissions are enforced server-side.** If your token is read-only, mutations will be rejected with a 403 error. Do not attempt to bypass this.
4. **All requests are logged.** Every API call is recorded for audit purposes.

## Available Tools

Use the tools registered by this plugin to interact with monday.com:

| Category | Tools |
|----------|-------|
| Boards | `list_boards`, `get_board_info`, `create_board`, `archive_board` |
| Items | `create_item`, `get_board_items_page`, `change_item_column_values`, `delete_item` |
| Updates | `create_update`, `get_updates` |
| Structure | `create_group`, `create_column`, `get_column_type_info` |
| Workspace | `list_workspaces`, `workspace_info` |
| Advanced | `explore_api`, `execute_code` |

## Error Handling

- **401:** Your agent token is invalid or revoked. Contact the token owner.
- **403:** You attempted a mutation with a read-only token. Check your permissions.
- **502:** The proxy could not reach monday.com. Retry after a moment.
