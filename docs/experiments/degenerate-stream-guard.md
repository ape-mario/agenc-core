# Degenerate model stream guard

The shared stream phase watches answer text, thinking deltas and reasoning summaries independently. A disordered short-vocabulary stream aborts the provider request. Core resets canonical output, marks already rendered partial output unreliable, and does not commit the failed sample as an assistant answer. The existing recovery path permits one fresh attempt; a second failure stops the turn. Registered streamed tool work blocks automatic retry, including read-only tools.

Set `stream_degenerate_guard = false` in config.toml to opt out. The default is `true`. Existing reasoning-loop and idle-stream guards retain their own behavior.

The detector keeps a 2,048-character sliding window per channel, evaluated at fixed 256-character checkpoints, and requires two consecutive suspect windows. Each must have at least 256 alphabetic words, at most 16 distinct words, and at least 95% of words from the four most frequent words. Words longer than 16 characters, non-ASCII text, and code/data/table punctuation exclude a window. Only after these cheap checks does it compute raw deflate compression; a ratio between 0.22 and 0.50 indicates disorder within that collapsed vocabulary. Ordinary identical log lines compress below this band.

Calibration preceded integration: zero detections across decoded channels from 77,339 raw response recordings, including a later inventory sweep. The initial inventory contained 23,546 nonempty visible channels and 57,698 nonempty reasoning channels. Duplicate text was evaluated once by SHA-256. Tool arguments were an additional stress check. Seventy recordings ended in an incomplete SSE JSON packet; all complete preceding events were evaluated. One older private recorder directory was unreadable. Empty responses were excluded from normal-answer successes. The exact decoder was checked with known positive streams in three wire formats.

Additional long log, repeated-line log, code, minified code, table, JSON, base64 and repeated-prose controls all passed. A synthetic replay of the reported V2 screen triggered at 4,096 characters. That screen has no original chunk timestamps or tokenizer output, so it does not establish actual tokens or elapsed seconds saved on the original request.

This deliberately narrow detector can miss other nonsense, exact repeated text, and salad in excluded formats. Intentional random text with a tiny vocabulary can resemble this failure; use the config opt out for that task. Zero observed corpus false positives is evidence for this default, not a guarantee for every output.
