# Pasting copied files into a terminal

Copying a file in Finder/Explorer/a file manager and pasting it into an Orca terminal delivers the
file the same way dropping it would. This note records how that is read off the OS clipboard and
what each platform cannot do.

## Order of precedence

`pasteTerminalClipboard` (`src/renderer/src/components/terminal-pane/terminal-clipboard-paste.ts`)
asks for file references **before** the clipboard image and before text. That ordering is the whole
point: a file copied in Finder also publishes its icon as a clipboard image, so the image branch
would otherwise turn "copy this PDF" into "paste a screenshot of its icon". A failed or refused file
paste stops there — it never falls back to the icon. An empty file-reference read falls through to
the existing image and text behaviour unchanged.

That split is why the reader distinguishes "no files were copied" from "files were copied and could
not be read". It returns an empty list only when the clipboard publishes no file format at all or an
explicitly empty list; anything referenced but undecodable throws `ClipboardFilePathsError`, which
reaches the renderer's `onFilePathsPasteError` and stops the paste. Returning `[]` there would fall
through to the image branch and paste the file's icon instead.

Delivery reuses the native drop flow (`handleNativeTerminalFileDrop`), so a pasted file follows the
same local / SSH-upload / runtime / WSL routing, the same shell quoting, and the same stale-target
guards as a dropped one. Client paths are never written into a remote shell; remote targets upload
first. The pane, its transport and its PTY are captured at dispatch and re-checked after the async
clipboard read, so a pane that closed or restarted its PTY meanwhile receives nothing. Keyboard
and app-menu pastes also re-check focus before delivery and after an upload; leaving the pane skips
the write and refocus. Failed writes are not reported as successful pastes.

Both deps are optional. Older preloads without `window.api.ui.readClipboardFilePaths`, and web
clients whose implementation returns an empty list, keep the previous image/text-only behaviour.

## What each platform can read

Reading happens only on the local machine, in the main process, behind
`assertTrustedClipboardSender` (`clipboard:readFilePaths`). Decoding is pure and bounded
(`src/main/window/clipboard-file-paths.ts`): only `file:` URLs and absolute local paths are
accepted, control characters and paths over 4096 characters are rejected, a single payload is capped
at 256 KiB, and the list is validated with the drop limits (`validateNativeFileDropPaths`:
`NATIVE_FILE_DROP_MAX_PATHS` entries, 256 KiB of paths). A list over a limit is refused whole — it is
never truncated to the first N. No file content is read and no helper process is spawned.

| Platform | Formats read                                    | Limit                                                                                                                                                                                                                                          |
| -------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS    | `public.file-url`, `NSFilenamesPboardType`      | Both plist spellings (XML and binary) are read in full by `clipboard-macos-file-list.ts`. `public.file-url` is read only when no plist is published; a plist that cannot be read rejects rather than falling back to the single file it names. |
| Windows  | `FileNameW`, `Shell IDList Array`               | `FileNameW` names only the first item. When the CIDA declares more than one, the paste is **refused with a message telling the user to drag the files instead** — no second enumeration path was added.                                        |
| Linux    | `x-special/gnome-copied-files`, `text/uri-list` | Multi-file copies work. The GNOME payload must open with a `copy`/`cut` verb; blank lines and `#` comments are ignored, and one unusable URI rejects the whole list. Desktops that publish neither format paste nothing.                       |

The Windows limit is deliberate: reading a multi-item copy would mean hand-rolling a CIDA/shell-item
parser, so the copy is refused instead. Lifting it means finding an existing reliable reader.

Linux URI lists containing only browser links are not file copies and keep the existing text/image
paste path. A mixed list of file references and unusable URIs is refused as a whole.

## Rejection messages

`ClipboardFilePathsError.reason` is one of `unreadable-file-reference`, `too-many-files`,
`file-list-too-large`, `windows-multiple-items`. The messages never contain a decoded path or any
clipboard bytes: the clipboard may hold another application's data, and the message is surfaced to
the user.
