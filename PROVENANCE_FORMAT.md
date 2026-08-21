# Chute Image Provenance JSONL

Chute browser-image captures append to:

```text
~/Chute/image-provenance.jsonl
```

This file is separate from the frozen TSV history format.

## Contract

- One browser image capture = exactly one JSON object.
- One JSON object = exactly one physical JSONL line.
- The file is append-only during normal Chute operation.
- URLs are preserved as full strings. Chute does not intentionally shorten the page URL or direct image URL.
- Local locations are absolute paths resolved by the localhost Chute server after the corresponding artifact is actually stored.
- Every optional artifact has an explicit boolean and location pair. A missing artifact is `false` with a `null` location.
- `capture_date` uses the computer's local date so a user can directly search/group captures by working day.
- `captured_at` includes the computer's local UTC offset.

## Schema v1

```json
{"schema":"chute-image-capture-1","capture_id":"...","captured_at":"2026-08-21T15:30:42.123-05:00","capture_date":"2026-08-21","page_url":"https://example.com/post/123?view=full#image","image_url":"https://cdn.example.com/images/full.jpg?token=abc","downloaded_image":true,"downloaded_image_location":"/home/user/Chute/files/...-full.jpg","mini_thumbnail":true,"mini_thumbnail_location":"/home/user/Chute/thumbs/....webp","custom_thumbnail":true,"custom_thumbnail_location":"/home/user/Chute/files/...-full-512x512.webp","source_link_file":false,"source_link_file_location":null}
```

Field meanings:

- `schema`: fixed record format identifier.
- `capture_id`: identifier shared by all artifacts produced by the same capture.
- `captured_at`: exact local capture-finalization timestamp with timezone offset.
- `capture_date`: local `YYYY-MM-DD` working day.
- `page_url`: full URL of the webpage on which the image was encountered.
- `image_url`: full direct URL of the image itself.
- `downloaded_image`: whether Chute preserved the full downloaded image.
- `downloaded_image_location`: absolute path to that full image, or `null`.
- `mini_thumbnail`: whether the normal 48px Chute recognition thumbnail was successfully stored.
- `mini_thumbnail_location`: absolute path to the 48px thumbnail, or `null`.
- `custom_thumbnail`: whether the configured custom-size WebP image copy was successfully stored.
- `custom_thumbnail_location`: absolute path to that custom-size copy, or `null`.
- `source_link_file`: whether Chute stored a local `.url` fallback instead of an image artifact.
- `source_link_file_location`: absolute path to that shortcut, or `null`.

The JSONL line describes what Chute actually succeeded in creating, not merely what the settings requested.
