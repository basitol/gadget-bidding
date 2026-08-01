## UI Display Rules

- Never render raw enum, status, role, category, or API keys directly in user-facing UI.
- Convert machine values like `item_damaged`, `sent_to_backoffice`, or `payment_status` into readable labels before display.
- Prefer shared formatting helpers such as `label(...)` over ad-hoc string replacement in components.
