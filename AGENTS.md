## Coding preferences
- Keep things simple and readable. Avoid complex code unless it is necessary for performance or clarity.
- Tests are good. Endless smoke and regression tests for the smallest of changes are not. Tests should be meaningful and focused.
- Keep comments and documentation up to date when making changes.
- Comments should explain intent, rationale, constraints, or non-obvious behavior; avoid comments that simply restate the code.
- Avoid adding dependencies unless they provide a clear benefit over existing dependencies or the standard library.

### Typescript
- Avoid `any` unless there is no reasonable typed alternative or the user explicitly asks for it.
- If not already specified in project, I generally prefer to use `NextJS`, `React`, `React Query`, `Zod`, `TailWindCSS`, `Better Auth`.

### Python
- Prefer built-in generic types such as `list[str]`, `dict[str, int]`, and `str | None` where supported by the project's Python version.
- Use type hints where they improve clarity, especially for public APIs and complex data structures.
- Python projects use `uv` for dependency and environment management unless the project specifies otherwise.

## Environment
- Development environment is Windows.
- Bash is the primary terminal shell (Git Bash).
- Prefer Bash commands, do not provide PowerShell or cmd.exe commands unless explicitly requested.