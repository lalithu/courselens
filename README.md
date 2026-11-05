# CourseLens

CourseLens is a teacher-first prototype for exploring learning progress in an introductory programming course. It grew out of the CS1 student trace visualizer and uses the same snapshot, event, concept, misconception, and assessment data model.

## Run locally

Install Node.js 22.12 or newer and pnpm 11.25, then run these commands from the repository root.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL printed in the terminal. The public checkout runs with three original synthetic demo traces. Trace 206 is selected on launch. The numbers are demo identifiers.

## What works today

- **Teacher workspace.** Ask for a progress update, assessment summary, or active misconceptions. Use a trace number to ask about another student. Answers are computed from the recorded data by a small set of local query handlers.
- **Student profile.** Open a trace to see its latest mastery, concept count, and last recorded activity. The profile separates Progress & evidence, Concepts & graph, and Support & feedback. Progress pairs the timeline with the selected event. Fullscreen brings the detailed panels together and supports independent graph fullscreen.
- **Course overview.** A compact trend at the bottom of Teacher shows mean recorded mastery across the active dataset. View course overview opens the activity breakdown and explains which observations count toward each day.
- **Evidence.** Save a teacher note against a trace and selected event or concept. Optional image, PDF, and text attachments use browser storage and have a 1 MB limit per attachment.
- **Reports and feedback.** Edit student and parent drafts separately and store their recipient addresses per trace. Email drafts open in your email app. Published student reports and approved feedback are visible in Student view in the same browser.
- **Course setup.** Review a sample Canvas course map. The teaching options panel shows illustrative guidance.
- **Trace imports.** Import prepared JSON or simulator CSV, with optional matching Markdown reports. Imported traces are session-scoped.

## Structure

- `src/App.tsx` coordinates trace selection and views. `src/TraceProfile.tsx` and `src/CourseOverview.tsx` provide the individual and course summaries.
- `src/TeacherHome.tsx`, `src/CourseWorkspace.tsx`, and `src/courseStore.ts` handle the teacher, reporting, and student workflows.
- `src/Timeline.tsx`, `src/Inspector.tsx`, `src/ResearchPanels.tsx`, and `src/KnowledgeGraph.tsx` carry forward the research visualizer.
- `src/data.ts`, `src/references.ts`, and `src/progressReport.ts` validate sources and derive displayed results.
- `public/demo-data/` contains the standalone public demo fixtures. For authorized local research data, place a prepared export under `public/data/` and set `VITE_COURSELENS_DATA=data` in `.env.local`. Generate its overview with `python3 tools/summarize_course.py public/data`. Research exports and local environment settings are excluded from Git.

The app uses React, TypeScript, Vite, Apache ECharts, Zod, and CSS. Reports, contacts, and notes live in browser-local storage. Live Canvas sync, document extraction, account authentication, connected email delivery, and weight-space model updates remain future integrations.

```sh
pnpm test
pnpm build
```

## Checkpoints

- **v0.1.0** captures the teacher dashboard, progress questions, report workflow, detailed trace analytics, Google-inspired palette, and standalone public demo.
- The current version adds a student profile, focused analytics sections, and a course-level trend and activity breakdown. The profile layout draws on [Panorama Student Success](https://www.panoramaed.com/products/student-success).

Built with Codex & OpenAi Models
