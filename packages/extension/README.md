# Bookshelf

Language support for `.bs`, the language documenting [Bookshelf](https://github.com/mcbookshelf) features:
their inputs, contexts and outputs, and the type each of them carries.

## Features

- syntax highlighting
- completion of registries, kinds and types, and of the variables a `ref` may point at
- type checking: which kinds a port accepts, which type each kind is defined with, and which
  types a struct may hold
- validation of dates, ranges, slugs, duplicate struct entries and missing header fields

## Example

```bs
name: XP
slug: bookshelf-xp
version: 5.0.0
tags: runtime
description: Read and modify player XP levels.

feature function add_levels:
    description: Add levels to the player.
    authors: Aksiome, Leirof
    created: 2022/04/14 1.18.2
    updated: 2026/09/09 26.3

    input storage bs.xp:add_levels in: {
        levels: int
    } > amount of levels to add
    context executor : player > the player to add levels to
    output state > the XP of the player is updated
```
