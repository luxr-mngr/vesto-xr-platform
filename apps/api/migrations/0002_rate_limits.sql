-- Fixed-window rate-limit counters (ERS §13) for /auth/login and the public v1 API.

CREATE TABLE rate_limit_hits (
  bucket_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);
