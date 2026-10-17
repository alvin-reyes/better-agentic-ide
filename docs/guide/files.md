---
title: Files & preview
lead: Browse the project, open any file in a viewer that fits it, and read code or watch documents update beside the terminal while an agent works.
description: ADE's file browser, file viewer for PDF, Word, Markdown, images and code, and the preview panel that shows any file beside the terminal.
---

## File browser

Press {% include key.html mac="⌘B" other="Ctrl+Shift+B" %} to show the folder of the active terminal. It follows `cd` and refreshes when files change. The `.*` button shows or hides hidden files.

## File viewer

Click a file in the browser and it opens in a tab with the right view. (A [file path clicked in the terminal]({{ '/guide/terminal/' | relative_url }}#clickable-files) opens in the [preview panel](#preview-panel) instead.)

| File | How it opens |
|---|---|
| Markdown | Rendered, with tables, images and ```` ```mermaid ```` diagrams. *Source* switches to the editor. |
| PDF | Page through and zoom. |
| Word (`.docx`) | A readable rendering of the document. |
| Images | PNG, JPEG, GIF, SVG, WebP, BMP, ICO. |
| HTML | A static render (scripts don't run). *Source* switches to the editor. |
| Mermaid (`.mmd`) | A live diagram with a chat box that edits it through a local Ollama model. |
| Anything else | The Monaco code editor with syntax highlighting. {% include key.html mac="⌘S" other="Ctrl+S" %} saves. |

![A markdown plan rendered with a Mermaid flowchart and a task table]({{ '/assets/img/viewer.webp' | relative_url }})

In rendered documents, links behave the way you'd expect: web links open in your browser, `#section` links scroll to the heading, and relative links such as `../README.md` open that file in a tab. Relative images load from the document's own folder.

## Preview panel

Click a file path in the terminal and the file opens in the preview panel beside it, whatever kind of file it is. The terminal keeps focus. Press {% include key.html mac="⌘⇧B" other="Ctrl+Alt+Shift+B" %} to show or hide the panel; opening it this way moves focus into it, and <kbd>Esc</kbd> gives focus back to the terminal. (With text selected in the panel's editor, the first <kbd>Esc</kbd> clears the selection and a second one returns to the terminal.) Each tab has its own file in the panel.

- **Code and other text** shows read-only in the same Monaco editor as the file tab, with syntax highlighting. *Open in tab* opens the file in a tab, where you can edit and save it. That includes Mermaid (`.mmd`) files and contract ABI/IDL `.json` files, which the panel shows as code: their diagram and ABI views are in the tab.
- **Large files:** a text file over 2 MB shows its first 2 MB ("Showing the first 2.0 MB of 48.3 MB."). It has no *Open in tab*.
- **Not UTF-8:** text that isn't valid UTF-8 shows with the unreadable bytes replaced. It has no *Open in tab*, because the tab can't edit it.
- **Binary files** (a NUL byte near the start, as in a `.zip` or UTF-16 text) aren't shown: the panel says "Binary file, not shown" with its size.
- **Markdown, HTML, PDFs, Word documents and images** render as they do in the file tab. PDFs page and zoom with the same viewer the file tab uses, so they render the same on macOS and Linux.

With **LIVE** on (the button in the panel's header), the panel refreshes whenever the file is saved, handy for watching an agent write a spec or a source file.

HTML in the preview may run scripts, for pages that need them. They run isolated from the app.

## Safe by default

Markdown and documents come from repositories you may not control, and the app has access to your terminals. Everything rendered is sanitized first, so raw HTML or a `javascript:` link in a README can't run code in ADE.
