# Script Properties

Google Apps Script properties configure the deployed automation without a code change. In the Apps Script editor, open **Project Settings**, then add or edit entries under **Script properties**. Changes apply to the next execution.

Do not store secrets in source files or commit them to this repository.

## AI Email Sorter

| Property                    | Required | Default             | Accepted value                                              | Effect                                                                                                                                        |
| --------------------------- | -------- | ------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `SORTER_DAILY_LIMIT`        | No       | `30`                | Positive whole number                                       | Maximum threads processed in one sorter run. Invalid values use the default. Start conservatively to avoid Apps Script execution-time limits. |
| `SORTER_INBOX_PERCENT`      | No       | `50`                | Number from `0` through `100`                               | Percentage of the run capacity reserved for unread inbox mail. Invalid values use the default.                                                |
| `SORTER_LARGE_MAIL_PERCENT` | No       | `17`                | Number from `0` through `100`                               | Percentage of the run capacity reserved for large non-inbox mail. Invalid values use the default.                                             |
| `SORTER_SIZE_THRESHOLDS`    | No       | `10M,5M,2M,1M,500K` | Comma-separated positive integer sizes ending in `K` or `M` | Large-mail search thresholds, probed from left to right. Invalid lists use the default.                                                       |

The inbox and large-mail percentages are normalized when their total exceeds `100`. Remaining run capacity is used for random unprocessed non-inbox mail. Empty inbox or large-mail pools also release their unused capacity to that random pool.

With the defaults, a 30-thread run allocates 15 inbox, 5 large non-inbox, and 10 random non-inbox threads. When no inbox threads are available, random non-inbox selection can use up to 25 threads.

## Gemini

| Property         | Required                        | Default            | Accepted value          | Effect                                                                                                                         |
| ---------------- | ------------------------------- | ------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GEMINI_API_KEY` | Yes for live or dry-run sorting | None               | Gemini API key          | Authorizes Gemini classification requests.                                                                                     |
| `GEMINI_MODEL`   | No                              | `gemini-3.8-flash` | Gemini model identifier | Overrides the classification model. The client can fall back to supported Flash models when the selected model is unavailable. |

## Example

For the current recommended conservative setup:

```text
SORTER_DAILY_LIMIT=30
SORTER_INBOX_PERCENT=50
SORTER_LARGE_MAIL_PERCENT=17
SORTER_SIZE_THRESHOLDS=10M,5M,2M,1M,500K
```
