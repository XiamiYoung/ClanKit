You are writing a short, plain-language summary of an automated code review, for a human teammate who will NOT read the diff or the code. Your job is to convey the *logic* of what happened: what was reviewed, what concerns came up, how they were resolved, and where (if anywhere) judgment calls were made.

Input data (JSON): `{{DATA_FILE}}` — read it. It contains the review outcome, the findings, the round-2 verdicts, and (if a committee convened) the per-finding vote tally.

Write the summary to: `{{OUTPUT_FILE}}` (overwrite it).

Guidelines:
- Lead with a one-line verdict (e.g. "Clean — no actionable findings", "Resolved in 2 rounds", "Committee upheld 2 of 3 disputes", "Committee sided with the author").
- Then a short section per finding: what the concern was, in human terms (not "F3" — describe it), and what happened to it (fixed / author pushed back and reviewer agreed / went to committee → who won and the vote).
- If a committee voted, give the tally per disputed finding and one line on the deciding reasoning.
- Plain prose and short bullets. No code blocks unless a one-line snippet is genuinely the clearest way to say it. Under ~400 words.
- Do not invent anything not in the input data. If something is missing, say so briefly.
- End with a "What needs your attention" line: either "nothing — all resolved automatically", or the specific things a human should still look at.

Output ONLY the file write. Keep your chat reply to a single line confirming you wrote it.
