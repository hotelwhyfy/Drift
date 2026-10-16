# files

Saving and opening through the browser's own file dialog.

`showSaveFilePicker` puts the naming where it belongs — in the dialog, where the user can also choose the folder — instead of making the app carry a name field it would otherwise have no use for. Chrome and Edge have it; Firefox and Safari do not, so both paths fall back to the old anchor-download and hidden-input approach, which still works, just without letting the user pick the name.

In development both go to the dev server first, which shows the native macOS dialog itself (scripts/fileDialogs.ts). That is the only path that works in Safari and in VS Code's built-in browser.

Exports are written as they render rather than collected first (`FileSink`), so an hour of audio never has to fit in the tab's memory.

One function per file. `types.ts` holds the shapes shared between them; `pickerRefusal.ts` holds the one piece of state (whether the browser has refused file handles), which is why it exports two functions.
