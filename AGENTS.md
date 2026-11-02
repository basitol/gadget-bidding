## UI Display Rules

- Never render raw enum, status, role, category, or API keys directly in user-facing UI.
- Convert machine values like `item_damaged`, `sent_to_backoffice`, or `payment_status` into readable labels before display.
- Prefer shared formatting helpers such as `label(...)` over ad-hoc string replacement in components.

## UI Copy Tone Rules

- No exclamation marks in titles, alerts, or notification headings. Use sentence case ("Bid placed", not "Bid Placed!").
- Be specific, not enthusiastic: include the item name, amount, or order number ("Outbid on iPhone 14 Pro") instead of hype ("Don't miss your chance!").
- Avoid marketing filler words: "premier", "seamless", "effortless", "ultimate", "vibrant", "stunning", "incredible", "Stay in the loop", "Happy bidding".
- Don't add helper text that restates what's already obvious from the screen (buttons, labels, or screen name).
- No emoji in UI copy or in log messages; write plain, factual sentences.
- Empty states should tell the user what will appear there, not cheerlead ("Bids you place will show up here", not "Start bidding now!").

