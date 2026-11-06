# Organization theme and typography

Wave 1 reads color and font values from each organization's `theme_config`, validates them, and falls back safely when
configuration is missing or malformed.

The default seed theme uses official UNC Charlotte green `#005035` and gold `#A49665`, sourced from
[UNC Charlotte's official color palette](https://brand.charlotte.edu/visual-identity/color-palette/).

The application does not claim IBM Plex or Source Serif as official fonts and no longer downloads them. It uses robust
local stacks: Arial / Arial Narrow / system UI for sans-serif text and Cambria / Georgia for serif text. Calluna and
Interstate require confirmed licensing, approved font files, and availability before they can be loaded. Shared shell
components contain no institution name or recreated logo.
