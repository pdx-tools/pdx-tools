# pdx-map

A GPU-accelerated cross platform rendering library for maps from Paradox Interactive games (EU4, CK3, Vic3, HOI4, etc).

Works on:

- On the browser via WebGPU and WebAssembly
- On the desktop for native GUI applications
- On the server for server side rendering

Ships support for:

- Interactive viewports (pan and zoom)
- Cursor-to-location mapping (ie: identify location hovered by cursor)
- Full-map screenshots
- Highlight locations
- Primary and secondary location colors (for striping)
- Borders (country and location)
- Horizontal wraparound

Designed for efficient serialization of location colors and state across memory boundaries (eg: web workers), allowing the complete decoupling of the renderer from the application logic.

pdx-map requires that the color-coded locations texture be split into west and east halves to avoid exceeding common GPU max texture limits.
