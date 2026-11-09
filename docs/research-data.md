# Local research data

The public fixtures live in `public/demo-data/`. To work with an authorized research export locally, put the prepared export in `public/data/` and set `VITE_COURSELENS_DATA=data` in `.env.local`. Generate the course overview with:

```sh
python3 tools/summarize_course.py public/data
```

Git ignores the research data directory and local environment settings. The trace details view also accepts prepared JSON or simulator CSV with optional matching Markdown reports. Those imports last for the current session.
